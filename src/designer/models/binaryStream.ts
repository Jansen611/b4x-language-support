/**
 * B4X Layout Binary Stream I/O
 *
 * Growable buffer with position tracking and little-endian read/write methods.
 * Used by layoutFormat.ts to serialize/deserialize .bal/.bjl files.
 */

// ── ParseError ────────────────────────────────────────────────────────

/**
 * Error thrown when the binary layout file cannot be parsed.
 */
export class ParseError extends Error {
    constructor(message: string, public readonly offset: number) {
        super(`Parse error at offset 0x${offset.toString(16).toUpperCase()}: ${message}`);
        this.name = 'ParseError';
    }
}

// ── BinaryReader ──────────────────────────────────────────────────────

export class BinaryReader {
    private readonly buf: Buffer;
    private pos: number;

    constructor(buffer: Buffer, offset: number = 0) {
        this.buf = buffer;
        this.pos = offset;
    }

    /** Current read position (byte offset). */
    get position(): number {
        return this.pos;
    }

    set position(value: number) {
        this.pos = value;
    }

    /** Remaining bytes from current position. */
    get remaining(): number {
        return this.buf.length - this.pos;
    }

    /** Read a single byte. */
    readByte(): number {
        this.ensureAvailable(1);
        return this.buf[this.pos++];
    }

    /** Read a signed 16-bit little-endian integer. */
    readInt16(): number {
        this.ensureAvailable(2);
        const val = this.buf.readInt16LE(this.pos);
        this.pos += 2;
        return val;
    }

    /** Read a signed 32-bit little-endian integer. */
    readInt32(): number {
        this.ensureAvailable(4);
        const val = this.buf.readInt32LE(this.pos);
        this.pos += 4;
        return val;
    }

    /** Read a 32-bit IEEE 754 float (little-endian). */
    readFloat(): number {
        this.ensureAvailable(4);
        const val = this.buf.readFloatLE(this.pos);
        this.pos += 4;
        return val;
    }

    /** Read a 64-bit IEEE 754 double (little-endian). */
    readDouble(): number {
        this.ensureAvailable(8);
        const val = this.buf.readDoubleLE(this.pos);
        this.pos += 8;
        return val;
    }

    /** Read `count` raw bytes. */
    readBytes(count: number): Buffer {
        this.ensureAvailable(count);
        const slice = this.buf.subarray(this.pos, this.pos + count);
        this.pos += count;
        return slice;
    }

    /**
     * Read a length-prefixed UTF-8 string.
     * Format: int32 byteLength + UTF-8 bytes.
     */
    readLengthPrefixedString(): string {
        const byteLen = this.readInt32();
        if (byteLen === 0) { return ''; }
        if (byteLen < 0) {
            throw new ParseError(`Negative string length ${byteLen}`, this.pos - 4);
        }
        this.ensureAvailable(byteLen);
        const str = this.buf.toString('utf8', this.pos, this.pos + byteLen);
        this.pos += byteLen;
        return str;
    }

    /**
     * Read a string table reference.
     * Format: int32 index into the provided string table.
     */
    readStringRef(stringTable: string[]): string {
        const index = this.readInt32();
        if (index < 0 || index >= stringTable.length) {
            throw new ParseError(
                `String table index ${index} out of range [0..${stringTable.length - 1}]`,
                this.pos - 4
            );
        }
        return stringTable[index];
    }

    /**
     * Read a 7-bit variable-length length-prefixed string (for GZip script data).
     */
    read7BitEncodedString(): string {
        const byteLen = this.read7BitEncodedInt();
        if (byteLen === 0) { return ''; }
        if (byteLen < 0) {
            throw new ParseError(`Negative 7-bit string length ${byteLen}`, this.pos);
        }
        this.ensureAvailable(byteLen);
        const str = this.buf.toString('utf8', this.pos, this.pos + byteLen);
        this.pos += byteLen;
        return str;
    }

    /**
     * Read a 7-bit variable-length encoded integer.
     * Each byte contributes 7 data bits; high bit means "more bytes follow".
     */
    read7BitEncodedInt(): number {
        let result = 0;
        let shift = 0;
        let byte: number;
        do {
            if (shift >= 35) {
                throw new ParseError('Malformed 7-bit encoded integer (too many bytes)', this.pos);
            }
            byte = this.readByte();
            result |= (byte & 0x7F) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);
        return result;
    }

    /** Create a sub-reader over a slice of the buffer. */
    slice(length: number): BinaryReader {
        this.ensureAvailable(length);
        const sub = new BinaryReader(this.buf.subarray(this.pos, this.pos + length));
        this.pos += length;
        return sub;
    }

    private ensureAvailable(count: number): void {
        if (this.pos + count > this.buf.length) {
            throw new ParseError(
                `Unexpected end of data: need ${count} bytes at offset ${this.pos}, ` +
                `but only ${this.buf.length - this.pos} remain (total ${this.buf.length})`,
                this.pos
            );
        }
    }
}

// ── BinaryWriter ──────────────────────────────────────────────────────

export class BinaryWriter {
    private buf: Buffer;
    private pos: number;
    private len: number; // logical length (high-water mark)

    constructor(initialCapacity: number = 4096) {
        this.buf = Buffer.alloc(initialCapacity);
        this.pos = 0;
        this.len = 0;
    }

    /** Current write position (byte offset). */
    get position(): number {
        return this.pos;
    }

    set position(value: number) {
        this.pos = value;
    }

    /** Logical length of the written data. */
    get length(): number {
        return this.len;
    }

    /** Return a Buffer containing only the written data. */
    toBuffer(): Buffer {
        return Buffer.from(this.buf.subarray(0, this.len));
    }

    /** Write all data from another BinaryWriter at the current position. */
    writeFrom(other: BinaryWriter): void {
        const data = other.toBuffer();
        this.ensureCapacity(data.length);
        data.copy(this.buf, this.pos);
        this.pos += data.length;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write a single byte. */
    writeByte(value: number): void {
        this.ensureCapacity(1);
        this.buf[this.pos++] = value & 0xFF;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write a signed 16-bit little-endian integer. */
    writeInt16(value: number): void {
        this.ensureCapacity(2);
        this.buf.writeInt16LE(value, this.pos);
        this.pos += 2;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write a signed 32-bit little-endian integer. */
    writeInt32(value: number): void {
        this.ensureCapacity(4);
        this.buf.writeInt32LE(value, this.pos);
        this.pos += 4;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write a 32-bit IEEE 754 float (little-endian). */
    writeFloat(value: number): void {
        this.ensureCapacity(4);
        this.buf.writeFloatLE(value, this.pos);
        this.pos += 4;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write a 64-bit IEEE 754 double (little-endian). */
    writeDouble(value: number): void {
        this.ensureCapacity(8);
        this.buf.writeDoubleLE(value, this.pos);
        this.pos += 8;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /** Write raw bytes. */
    writeBytes(data: Buffer): void {
        this.ensureCapacity(data.length);
        data.copy(this.buf, this.pos);
        this.pos += data.length;
        if (this.pos > this.len) { this.len = this.pos; }
    }

    /**
     * Write a length-prefixed UTF-8 string.
     * Format: int32 byteLength + UTF-8 bytes.
     */
    writeLengthPrefixedString(str: string): void {
        const bytes = Buffer.from(str, 'utf8');
        this.writeInt32(bytes.length);
        if (bytes.length > 0) {
            this.writeBytes(bytes);
        }
    }

    /**
     * Write a string reference into a string table.
     * If the string is not yet in the table, adds it with the next sequential index.
     * Writes the int32 index.
     */
    writeStringRef(table: Map<string, number>, str: string): void {
        let index = table.get(str);
        if (index === undefined) {
            index = table.size;
            table.set(str, index);
        }
        this.writeInt32(index);
    }

    /**
     * Write a 7-bit variable-length length-prefixed string (for GZip script data).
     */
    write7BitEncodedString(str: string): void {
        const bytes = Buffer.from(str, 'utf8');
        this.write7BitEncodedInt(bytes.length);
        if (bytes.length > 0) {
            this.writeBytes(bytes);
        }
    }

    /**
     * Write a 7-bit variable-length encoded integer.
     * Each byte contributes 7 data bits; high bit means "more bytes follow".
     */
    write7BitEncodedInt(value: number): void {
        let v = value;
        while (v >= 0x80) {
            this.writeByte((v & 0x7F) | 0x80);
            v >>>= 7;
        }
        this.writeByte(v & 0x7F);
    }

    /** Ensure the internal buffer can hold `additionalBytes` more from current position. */
    private ensureCapacity(additionalBytes: number): void {
        const required = this.pos + additionalBytes;
        if (required <= this.buf.length) { return; }
        let newSize = this.buf.length * 2;
        while (newSize < required) { newSize *= 2; }
        const newBuf = Buffer.alloc(newSize);
        this.buf.copy(newBuf);
        this.buf = newBuf;
    }
}
