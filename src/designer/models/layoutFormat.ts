/**
 * B4X Layout File Format — Parser & Writer
 *
 * Handles reading (.bal/.bjl → LayoutFile model) and writing (LayoutFile model → binary).
 *
 * Binary format overview:
 *   Outer envelope: version, header block, outer string table, manifest, file refs, script data
 *   Inner block: inner string table (alphabetical), variants, control tree, end markers
 *   Trailing: flags c/d bytes
 *
 * All integers are plain little-endian int32 (NOT 7-bit encoded).
 * Doubles are stored as float32 (tag 7) — widened on read, truncated on write.
 */

import * as zlib from 'zlib';
import { BinaryReader, ParseError, BinaryWriter } from './binaryStream';
import {
    LayoutFile, Variant, ManifestEntry, ControlNode, PropertyValue,
    ScriptData, VariantScript, TypeTag,
} from './types';

export { ParseError } from './binaryStream';

// ═══════════════════════════════════════════════════════════════════════
// PARSER (layoutParser.ts)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse a .bal/.bjl binary layout file.
 * @param data Raw file bytes.
 * @returns Parsed layout model.
 */
export function parseLayoutFile(data: Buffer): LayoutFile {
    const reader = new BinaryReader(data);

    // ── Outer Envelope ───────────────────────────────────────────
    const version = reader.readInt32();
    if (version !== 5) {
        throw new ParseError(`Unsupported layout version ${version} (expected 5)`, 0);
    }

    const headerBlockLength = reader.readInt32();
    const headerEndPos = reader.position + headerBlockLength;

    const gridSize = reader.readInt32();

    // Outer string table (insertion-ordered by ID)
    const outerStringTable = readStringTable(reader);

    // Control manifest (name, javaType, csType — each as stringref into outer table)
    const manifestCount = reader.readInt32();
    const manifest: ManifestEntry[] = [];
    for (let i = 0; i < manifestCount; i++) {
        manifest.push({
            name: reader.readStringRef(outerStringTable),
            javaType: reader.readStringRef(outerStringTable),
            csType: reader.readStringRef(outerStringTable),
        });
    }

    // File references (length-prefixed strings, NOT stringrefs)
    const fileCount = reader.readInt32();
    const fileReferences: string[] = [];
    for (let i = 0; i < fileCount; i++) {
        fileReferences.push(reader.readLengthPrefixedString());
    }

    // Script data (GZip compressed blob with int32 length prefix)
    const scriptData = readScriptData(reader);

    // Advance to end of header block (in case we didn't consume exactly)
    reader.position = headerEndPos;

    // ── Inner Data Block ─────────────────────────────────────────

    // Inner string table (alphabetically sorted)
    const innerStringTable = readStringTable(reader);

    // Variant definitions (12 bytes each: float32 scale, int32 width, int32 height)
    const variantCount = reader.readInt32();
    const variants: Variant[] = [];
    for (let i = 0; i < variantCount; i++) {
        variants.push({
            scale: reader.readFloat(),
            width: reader.readInt32(),
            height: reader.readInt32(),
        });
    }

    // Control tree (recursive key-value pairs)
    const rootDict = readObjectTree(reader, innerStringTable);

    // Embedded file count (0 for normal save)
    const embeddedCount = reader.readInt32();
    for (let i = 0; i < embeddedCount; i++) {
        reader.readLengthPrefixedString(); // skip embedded filenames (clipboard only)
    }

    // Trailing flags
    const flagC = reader.readByte() !== 0;
    const flagD = reader.readByte() !== 0;

    // ── Build Model ──────────────────────────────────────────────

    const rootControl = buildControlNode(rootDict);

    return {
        version,
        gridSize,
        variants,
        rootControl,
        manifest,
        fileReferences,
        scriptData,
        flags: { c: flagC, d: flagD },
    };
}

// ── Parser: String Table ─────────────────────────────────────────────

/**
 * Read a string table: int32 count, then count × (int32 byteLen + UTF-8 bytes).
 * Returns string[] for index-based lookup.
 */
function readStringTable(reader: BinaryReader): string[] {
    const count = reader.readInt32();
    const table: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
        table[i] = reader.readLengthPrefixedString();
    }
    return table;
}

// ── Parser: Key-Value Object Tree ────────────────────────────────────

/**
 * Read a key-value dictionary from the binary stream.
 * Keys are string table references (int32 index).
 * Values are type-tagged (byte tag + type-specific payload).
 * Terminates when tag 4 (END) is encountered.
 */
function readObjectTree(reader: BinaryReader, stringTable: string[]): Map<string, PropertyValue> {
    const dict = new Map<string, PropertyValue>();

    while (true) {
        // Read key as stringref (4 bytes). For end markers, the bytes are 0x00000000
        // written as inline empty string length; the reader interprets as index 0.
        // This is safe because tag 4 causes immediate return without using the key.
        const keyIndex = reader.readInt32();
        const tag = reader.readByte();

        // TAG 4: End-of-object — return immediately (ignore key)
        if (tag === TypeTag.End) {
            return dict;
        }

        // Resolve key from string table
        if (keyIndex < 0 || keyIndex >= stringTable.length) {
            throw new ParseError(
                `String table index ${keyIndex} out of range [0..${stringTable.length - 1}]`,
                reader.position - 5
            );
        }
        const key = stringTable[keyIndex];

        // Read value based on type tag
        const value = readTaggedValue(reader, tag, stringTable);
        dict.set(key, value);
    }
}

/**
 * Read a type-tagged value from the stream.
 */
function readTaggedValue(reader: BinaryReader, tag: number, stringTable: string[]): PropertyValue {
    switch (tag) {
        case TypeTag.Int32:
            return { tag: TypeTag.Int32, value: reader.readInt32() };

        case TypeTag.String: {
            // Inline string: int32 byteLength + UTF-8 bytes
            return { tag: TypeTag.String, value: reader.readLengthPrefixedString() };
        }

        case TypeTag.Object: {
            // Nested object — recurse
            const nested = readObjectTree(reader, stringTable);
            return { tag: TypeTag.Object, value: nested };
        }

        case TypeTag.Bool:
            return { tag: TypeTag.Bool, value: reader.readByte() === 1 };

        case TypeTag.Color: {
            // 4 bytes: A, R, G, B
            const a = reader.readByte();
            const r = reader.readByte();
            const g = reader.readByte();
            const b = reader.readByte();
            return { tag: TypeTag.Color, a, r, g, b };
        }

        case TypeTag.Float:
            // float32, widened to double on read
            return { tag: TypeTag.Float, value: reader.readFloat() };

        case TypeTag.ErRef:
            return { tag: TypeTag.ErRef, value: reader.readInt32() };

        case TypeTag.StringRef: {
            // String table reference: int32 index
            return { tag: TypeTag.StringRef, value: reader.readStringRef(stringTable) };
        }

        case TypeTag.Double:
            // Full IEEE 754 double (8 bytes) — old format, preserved on read
            return { tag: TypeTag.Double, value: reader.readDouble() };

        case TypeTag.Int32Rect: {
            // 4 × int16: x, y, width, height
            const x = reader.readInt16();
            const y = reader.readInt16();
            const width = reader.readInt16();
            const height = reader.readInt16();
            return { tag: TypeTag.Int32Rect, x, y, width, height };
        }

        case TypeTag.Null:
            return { tag: TypeTag.Null };

        default:
            throw new ParseError(`Unknown type tag ${tag}`, reader.position - 1);
    }
}

// ── Parser: Control Node Construction ────────────────────────────────

/**
 * Convert a parsed key-value dictionary into a ControlNode.
 * Extracts ":kids" → numbered child dictionaries → recursive ControlNode[].
 */
function buildControlNode(dict: Map<string, PropertyValue>): ControlNode {
    const children: ControlNode[] = [];
    const properties = new Map<string, PropertyValue>();

    for (const [key, value] of dict) {
        if (key === ':kids' && value.tag === TypeTag.Object) {
            // Children are stored as { "0": {child0}, "1": {child1}, ... }
            const kidsDict = value.value;
            // Collect and sort by numeric index
            const indices: number[] = [];
            for (const childKey of kidsDict.keys()) {
                const idx = parseInt(childKey, 10);
                if (!isNaN(idx)) {
                    indices.push(idx);
                }
            }
            indices.sort((a, b) => a - b);

            for (const idx of indices) {
                const childVal = kidsDict.get(idx.toString());
                if (childVal && childVal.tag === TypeTag.Object) {
                    children.push(buildControlNode(childVal.value));
                }
            }
        } else {
            properties.set(key, value);
        }
    }

    return { properties, children };
}

// ── Parser: Script Data (GZip compressed) ────────────────────────────

/**
 * Read script data from the outer envelope.
 * Format: int32 compressedLength + GZip(mainScript + variantCount + per-variant scripts)
 * Uses 7-bit length-prefixed strings inside the GZip stream.
 */
function readScriptData(reader: BinaryReader): ScriptData | null {
    const compressedLength = reader.readInt32();
    if (compressedLength <= 0) {
        return null;
    }

    const compressedBytes = reader.readBytes(compressedLength);

    let decompressed: Buffer;
    try {
        decompressed = zlib.gunzipSync(compressedBytes);
    } catch {
        // If decompression fails, skip but don't crash — script data is non-critical
        return null;
    }

    const scriptReader = new BinaryReader(decompressed);

    // Main script (7-bit encoded length prefix + UTF-8)
    const mainScript = scriptReader.read7BitEncodedString();

    // Variant count (int32)
    const variantCount = scriptReader.readInt32();

    const variantScripts: VariantScript[] = [];
    for (let i = 0; i < variantCount; i++) {
        // Each variant: hg (12 bytes: float32 scale + int32 width + int32 height) + script string
        const variant: Variant = {
            scale: scriptReader.readFloat(),
            width: scriptReader.readInt32(),
            height: scriptReader.readInt32(),
        };
        const script = scriptReader.read7BitEncodedString();
        variantScripts.push({ variant, script });
    }

    return { mainScript, variantScripts, rawCompressedBytes: Buffer.from(compressedBytes) };
}

// ═══════════════════════════════════════════════════════════════════════
// WRITER (layoutWriter.ts)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Serialize a LayoutFile model to binary format.
 * @param layout The parsed/in-memory layout model.
 * @returns Buffer containing the complete binary file data.
 */
export function writeLayoutFile(layout: LayoutFile): Buffer {
    const main = new BinaryWriter();

    // ── Outer Envelope ───────────────────────────────────────────

    // 1. Write version (int32)
    main.writeInt32(layout.version);

    // 2. Reserve space for header block length (backpatched after)
    const lengthPos = main.position;
    main.writeInt32(0); // placeholder

    // 3. Write grid size (int32)
    main.writeInt32(layout.gridSize);

    // 4. Build control manifest to a temp stream (to collect outer string table refs)
    //    Outer table uses Dictionary (insertion order) — Map preserves insertion order in JS.
    const manifestStream = new BinaryWriter();
    const outerStringTable = new Map<string, number>();

    manifestStream.writeInt32(layout.manifest.length);
    for (const entry of layout.manifest) {
        manifestStream.writeStringRef(outerStringTable, entry.name);
        manifestStream.writeStringRef(outerStringTable, entry.javaType);
        manifestStream.writeStringRef(outerStringTable, entry.csType);
    }

    // 5. Write outer string table to main stream
    writeStringTable(main, outerStringTable);

    // 6. Write manifest from temp stream
    main.writeFrom(manifestStream);

    // 7. Write file references (length-prefixed strings, NOT stringrefs)
    main.writeInt32(layout.fileReferences.length);
    for (const file of layout.fileReferences) {
        main.writeLengthPrefixedString(file);
    }

    // 8. Write script data (GZip compressed)
    writeScriptData(main, layout.scriptData, layout.variants);

    // 9. Backpatch the header block length field
    const headerEndPos = main.position;
    main.position = lengthPos;
    main.writeInt32(headerEndPos - lengthPos - 4);
    main.position = headerEndPos;

    // ── Inner Data Block ─────────────────────────────────────────

    // Inner string table uses alphabetical sort order.
    // For round-trip of unmodified files, parsed strings arrive in sorted order
    // so Map insertion order matches. For edited files with new strings,
    // we must sort the table before writing. We use a two-pass approach:
    //   Pass 1: Collect all strings into Map (insertion-ordered)
    //   Pass 2: Sort alphabetically, remap indices, write table + data
    const innerStringCollector = new Map<string, number>();
    const innerStream = new BinaryWriter();

    // Write variant count + variants (12 bytes each)
    innerStream.writeInt32(layout.variants.length);
    for (const variant of layout.variants) {
        innerStream.writeFloat(variant.scale);
        innerStream.writeInt32(variant.width);
        innerStream.writeInt32(variant.height);
    }

    // Write root control tree recursively
    writeControlProperties(innerStream, innerStringCollector, layout.rootControl);
    writeChildren(innerStream, innerStringCollector, layout.rootControl.children);

    // Write end-of-stream marker
    writeEndMarker(innerStream);

    // Write embedded file count (0 for normal save)
    innerStream.writeInt32(0);

    // Sort the inner string table alphabetically and remap indices.
    // The format requires alphabetical sort order for the inner table.
    // If strings were collected in a different order (e.g. after editing),
    // we need to sort and rewrite the inner stream with corrected indices.
    const needsRemap = !isAlreadySorted(innerStringCollector);
    if (needsRemap) {
        // Build sorted table and remap
        const { sortedTable, remappedStream } = remapInnerStream(
            innerStringCollector, innerStream, layout,
        );
        writeStringTable(main, sortedTable);
        main.writeFrom(remappedStream);
    } else {
        // Already sorted — write directly (common for unmodified round-trip)
        writeStringTable(main, innerStringCollector);
        main.writeFrom(innerStream);
    }

    // ── Trailing Flags ───────────────────────────────────────────

    main.writeByte(layout.flags.c ? 1 : 0);
    main.writeByte(layout.flags.d ? 1 : 0);

    return main.toBuffer();
}

// ── Writer: String Table ─────────────────────────────────────────────

/**
 * Write a string table in index order (for outer table — insertion ordered).
 */
function writeStringTable(writer: BinaryWriter, table: Map<string, number>): void {
    // Invert: index → string
    const byIndex: string[] = new Array(table.size);
    for (const [str, idx] of table) {
        byIndex[idx] = str;
    }
    writer.writeInt32(byIndex.length);
    for (const str of byIndex) {
        writer.writeLengthPrefixedString(str);
    }
}

/**
 * Check if a string table's entries are already in alphabetical order.
 * (True for unmodified round-trips where the parser read sorted strings.)
 */
function isAlreadySorted(table: Map<string, number>): boolean {
    let prev = '';
    for (const key of table.keys()) {
        if (key < prev) { return false; }
        prev = key;
    }
    return true;
}

/**
 * Re-serialize the inner data block with properly sorted string table indices.
 * Called only when editing has introduced strings that break the sorted order.
 *
 * Approach: build sorted index mapping, then re-serialize the entire inner block.
 */
function remapInnerStream(
    unsortedTable: Map<string, number>,
    _originalStream: BinaryWriter,
    layout: LayoutFile,
): { sortedTable: Map<string, number>; remappedStream: BinaryWriter } {
    // Build sorted table
    const sortedKeys = [...unsortedTable.keys()].sort();
    const sortedTable = new Map<string, number>();
    for (let i = 0; i < sortedKeys.length; i++) {
        sortedTable.set(sortedKeys[i], i);
    }

    // Re-serialize inner data with corrected indices
    const remapped = new BinaryWriter();

    remapped.writeInt32(layout.variants.length);
    for (const variant of layout.variants) {
        remapped.writeFloat(variant.scale);
        remapped.writeInt32(variant.width);
        remapped.writeInt32(variant.height);
    }

    writeControlProperties(remapped, sortedTable, layout.rootControl);
    writeChildren(remapped, sortedTable, layout.rootControl.children);
    writeEndMarker(remapped);
    remapped.writeInt32(0);

    return { sortedTable, remappedStream: remapped };
}

// ── Writer: Control Tree Serialization ────────────────────────────────

/**
 * Write a control's properties as key-value pairs.
 */
function writeControlProperties(
    writer: BinaryWriter,
    table: Map<string, number>,
    node: ControlNode,
): void {
    // Write all properties from the node in their stored order.
    // Our ControlNode.properties preserves the original property Map order from parsing.
    // For round-trip compatibility, we write them in the same order they appear.
    for (const [key, value] of node.properties) {
        writeKeyValuePair(writer, table, key, value);
    }
}

/**
 * Write children as a ":kids" nested object.
 */
function writeChildren(
    writer: BinaryWriter,
    table: Map<string, number>,
    children: ControlNode[],
): void {
    if (children.length === 0) { return; }

    // ":kids" object start
    writeObjectStart(writer, table, ':kids');

    for (let i = 0; i < children.length; i++) {
        // Child index object start (e.g. "0", "1", "2")
        writeObjectStart(writer, table, i.toString());

        // Write child properties
        writeControlProperties(writer, table, children[i]);

        // Recurse into grandchildren
        if (children[i].children.length > 0) {
            writeChildren(writer, table, children[i].children);
        }

        // End marker for this child
        writeEndMarker(writer);
    }

    // End marker for :kids
    writeEndMarker(writer);
}

// ── Writer: Type Tag ─────────────────────────────────────────────────

/**
 * Write a key-value pair with type tag.
 * Key is written as a stringref (int32 index into string table).
 * Value is written with its type tag byte + payload.
 */
function writeKeyValuePair(
    writer: BinaryWriter,
    table: Map<string, number>,
    key: string,
    value: PropertyValue,
): void {
    // Write key as stringref
    writeStringRef(writer, table, key);

    // Write value with type tag
    writeTaggedValue(writer, table, value);
}

/**
 * Write a single type-tagged value.
 */
function writeTaggedValue(
    writer: BinaryWriter,
    table: Map<string, number>,
    value: PropertyValue,
): void {
    switch (value.tag) {
        case TypeTag.Int32:
            writer.writeByte(1);
            writer.writeInt32(value.value);
            break;

        case TypeTag.String:
            // Inline string (tag 2): int32 byteLength + UTF-8 bytes
            writer.writeByte(2);
            writer.writeLengthPrefixedString(value.value);
            break;

        case TypeTag.StringRef:
            // String table reference (tag 9): stringref index
            writer.writeByte(9);
            writeStringRef(writer, table, value.value);
            break;

        case TypeTag.Object:
            // Nested object (tag 3): recursive key-value pairs + end marker
            writer.writeByte(3);
            for (const [k, v] of value.value) {
                writeKeyValuePair(writer, table, k, v);
            }
            writeEndMarker(writer);
            break;

        case TypeTag.Bool:
            writer.writeByte(5);
            writer.writeByte(value.value ? 1 : 0);
            break;

        case TypeTag.Color:
            // 4 bytes: A, R, G, B
            writer.writeByte(6);
            writer.writeByte(value.a);
            writer.writeByte(value.r);
            writer.writeByte(value.g);
            writer.writeByte(value.b);
            break;

        case TypeTag.Float:
            // float32 (tag 7) — also used for double values (truncated)
            writer.writeByte(7);
            writer.writeFloat(value.value);
            break;

        case TypeTag.Double:
            // Doubles are written as float32 (tag 7) for byte-compatibility.
            writer.writeByte(7);
            writer.writeFloat(value.value);
            break;

        case TypeTag.ErRef:
            writer.writeByte(8);
            writer.writeInt32(value.value);
            break;

        case TypeTag.Int32Rect:
            // 4 × int16: x, y, width, height
            writer.writeByte(11);
            writer.writeInt16(value.x);
            writer.writeInt16(value.y);
            writer.writeInt16(value.width);
            writer.writeInt16(value.height);
            break;

        case TypeTag.Null:
            writer.writeByte(12);
            break;
    }
}

/**
 * Write a string reference into the string table.
 * If the string doesn't exist yet, it's added with the next sequential index.
 *
 * For the inner table the indices must correspond to alphabetical order.
 * This is handled by pre-collecting all strings, sorting them, and assigning
 * indices before serialization.
 */
function writeStringRef(
    writer: BinaryWriter,
    table: Map<string, number>,
    str: string,
): void {
    writer.writeStringRef(table, str);
}

/**
 * Write an object-start marker: stringref key + tag byte 3.
 */
function writeObjectStart(
    writer: BinaryWriter,
    table: Map<string, number>,
    key: string,
): void {
    writeStringRef(writer, table, key);
    writer.writeByte(3); // TypeTag.Object
}

/**
 * Write an end-of-object marker: empty key (int32 0) + tag byte 4.
 */
function writeEndMarker(writer: BinaryWriter): void {
    // An empty length-prefixed string writes int32(0) as the key
    writer.writeLengthPrefixedString('');
    writer.writeByte(4); // TypeTag.End
}

// ── Writer: Script Data (GZip compressed) ─────────────────────────────

/**
 * Write script data to the outer envelope.
 * Format: GZip-compressed blob containing:
 *   - Main script (7-bit length-prefixed string)
 *   - Variant count (int32)
 *   - Per-variant: 12 bytes (scale float32, width int32, height int32) + script string
 * Prefixed by int32 compressed length.
 *
 * @param variants The layout's variant list (used for variant script ordering)
 */
function writeScriptData(
    writer: BinaryWriter,
    scriptData: ScriptData | null,
    variants: Variant[],
): void {
    if (!scriptData) {
        writer.writeInt32(0);
        return;
    }

    // Use original compressed bytes for byte-identical round-trip if available
    if (scriptData.rawCompressedBytes) {
        writer.writeInt32(scriptData.rawCompressedBytes.length);
        writer.writeBytes(scriptData.rawCompressedBytes);
        return;
    }

    // Build uncompressed script data
    const scriptWriter = new BinaryWriter();

    // Main script (7-bit encoded length prefix + UTF-8)
    scriptWriter.write7BitEncodedString(scriptData.mainScript);

    // Variant count (int32)
    scriptWriter.writeInt32(scriptData.variantScripts.length);

    // Per-variant: 12 bytes (float32 scale + int32 width + int32 height) + script string
    for (const vs of scriptData.variantScripts) {
        scriptWriter.writeFloat(vs.variant.scale);
        scriptWriter.writeInt32(vs.variant.width);
        scriptWriter.writeInt32(vs.variant.height);
        scriptWriter.write7BitEncodedString(vs.script);
    }

    // GZip compress
    const uncompressed = scriptWriter.toBuffer();
    const compressed = zlib.gzipSync(uncompressed);

    // Write int32 length + compressed data
    writer.writeInt32(compressed.length);
    writer.writeBytes(compressed);
}
