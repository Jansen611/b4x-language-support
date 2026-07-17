/**
 * B4X Layout Binary Format — TypeScript Data Model
 *
 * Represents the in-memory model of a parsed .bal/.bjl layout file.
 */

// ── Layout File (top-level) ──────────────────────────────────────────

export interface LayoutFile {
    /** File format version (currently 5). */
    version: number;
    /** Grid snap size in dp/points (default 10). */
    gridSize: number;
    /** Screen variant definitions (width × height @ scale). */
    variants: Variant[];
    /** Root control tree (MetaMain: Activity or Main). */
    rootControl: ControlNode;
    /** Control manifest from outer envelope (name → javaType/csType). */
    manifest: ManifestEntry[];
    /** Project file references (image/font filenames). */
    fileReferences: string[];
    /** Per-variant designer script text. Key = variant index, value = script source. */
    scriptData: ScriptData | null;
    /** Trailing serialization flags. */
    flags: { c: boolean; d: boolean };
}

// ── Script Data ──────────────────────────────────────────────────────

export interface ScriptData {
    /** Main (shared) script text. */
    mainScript: string;
    /** Per-variant scripts. Each entry has variant info and script text. */
    variantScripts: VariantScript[];
    /**
     * Original GZip-compressed bytes from the file.
     * Preserved for byte-identical round-trip when scripts are unmodified.
     * Undefined for newly created script data.
     */
    rawCompressedBytes?: Buffer;
}

export interface VariantScript {
    /** Variant definition (from inside the GZip blob, NOT the outer variant list). */
    variant: Variant;
    /** Script text for this variant. */
    script: string;
}

// ── Variant ──────────────────────────────────────────────────────────

export interface Variant {
    /** Scale factor (e.g. 1.0, 1.5, 2.0). */
    scale: number;
    /** Canvas width in dp/points. */
    width: number;
    /** Canvas height in dp/points. */
    height: number;
}

// ── Control Manifest ─────────────────────────────────────────────────

export interface ManifestEntry {
    /** Control name (e.g. "Button1"). */
    name: string;
    /** Java/B4X type (e.g. "anywheresoftware.b4a.objects.ButtonWrapper"). */
    javaType: string;
    /** Designer class name (e.g. "Dbasic.Designer.MetaButton"). */
    csType: string;
}

// ── Control Tree ─────────────────────────────────────────────────────

export interface ControlNode {
    /** All properties from the binary key-value tree (preserves unknowns). */
    properties: Map<string, PropertyValue>;
    /** Child controls (from ":kids" property). */
    children: ControlNode[];
}

// ── Property Values (discriminated union matching type tags 1-12) ────

export const enum TypeTag {
    Int32 = 1,
    String = 2,
    Object = 3,
    End = 4,
    Bool = 5,
    Color = 6,
    Float = 7,
    ErRef = 8,
    StringRef = 9,
    Double = 10,
    Int32Rect = 11,
    Null = 12,
}

export type PropertyValue =
    | IntValue
    | StringValue
    | FloatValue
    | DoubleValue
    | BoolValue
    | ColorValue
    | RectValue
    | NullValue
    | ObjectValue
    | ErRefValue;

export interface IntValue {
    tag: TypeTag.Int32;
    value: number;
}

export interface StringValue {
    tag: TypeTag.String | TypeTag.StringRef;
    value: string;
}

export interface FloatValue {
    tag: TypeTag.Float;
    value: number;
}

export interface DoubleValue {
    tag: TypeTag.Double;
    value: number;
}

export interface BoolValue {
    tag: TypeTag.Bool;
    value: boolean;
}

export interface ColorValue {
    tag: TypeTag.Color;
    a: number;
    r: number;
    g: number;
    b: number;
}

export interface RectValue {
    tag: TypeTag.Int32Rect;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface NullValue {
    tag: TypeTag.Null;
}

export interface ObjectValue {
    tag: TypeTag.Object;
    value: Map<string, PropertyValue>;
}

export interface ErRefValue {
    tag: TypeTag.ErRef;
    value: number;
}

// ── Platform Detection ───────────────────────────────────────────────

export const enum Platform {
    B4A = 'B4A',
    B4i = 'B4i',
    B4J = 'B4J',
}

export function detectPlatform(filePath: string): Platform {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.bal')) { return Platform.B4A; }
    if (ext.endsWith('.bil')) { return Platform.B4i; }
    if (ext.endsWith('.bjl')) { return Platform.B4J; }
    return Platform.B4A; // default
}
