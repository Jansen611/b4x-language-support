/**
 * B4X Designer — Library Loader
 *
 * Scans library directories for custom view definitions from two sources:
 *
 * 1. **.xml** descriptor files (platform-specific, e.g. `CustomListView.xml` in `B4A/`):
 *    ```xml
 *    <root>
 *      <class>
 *        <name>b4i_customlistview</name>
 *        <shortname>CustomListView</shortname>
 *        <event>ItemClick (Index As Int, Value As Object)</event>
 *        <designerProperty>Key: DividerColor, DisplayName: Divider Color, FieldType: Color, DefaultValue: 0xFFA9A9A9</designerProperty>
 *      </class>
 *    </root>
 *    ```
 *
 * 2. **.b4xlib** files (cross-platform ZIP archives containing `.bas` source + `manifest.txt`):
 *    The `.bas` file contains `#DesignerProperty:` and `#Event:` annotations plus a
 *    `Public Sub DesignerCreateView(...)` method identifying it as a custom view.
 *
 * `.b4xlib` takes priority over `.xml` for the same library name.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as vscode from 'vscode';

// ── Public Types ─────────────────────────────────────────────────────

/** A single designer property descriptor parsed from <designerProperty>. */
export interface DesignerProperty {
    key: string;
    displayName: string;
    fieldType: 'string' | 'int' | 'float' | 'boolean' | 'color';
    defaultValue: string;
    description?: string;
    minRange?: number;
    maxRange?: number;
    /** Pipe-separated list options (for fieldType=string with constrained values). */
    list?: string[];
}

/** A custom view type discovered from a library XML file. */
export interface CustomViewDef {
    /** Short display name (e.g. "CustomListView"). */
    shortName: string;
    /** Full java type name (e.g. "b4i_customlistview"). */
    javaType: string;
    /** Events declared on this custom view. */
    events: string[];
    /** Designer-editable properties. */
    designerProperties: DesignerProperty[];
    /** Library file this was loaded from (for diagnostics). */
    sourceFile: string;
}

// ── Module State ─────────────────────────────────────────────────────

/** Cached custom view definitions. Key = shortName (case-insensitive). */
let cachedViews: Map<string, CustomViewDef> = new Map();
let cacheValid = false;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get all discovered custom view definitions.
 * Scans library paths from the `b4x.libraryPaths` setting.
 * Results are cached until `invalidateLibraryCache()` is called.
 */
export async function getCustomViewDefs(): Promise<Map<string, CustomViewDef>> {
    if (cacheValid) { return cachedViews; }
    cachedViews = await scanLibraryPaths();
    cacheValid = true;
    return cachedViews;
}

/**
 * Get a single custom view definition by shortName.
 */
export async function getCustomViewDef(shortName: string): Promise<CustomViewDef | undefined> {
    const defs = await getCustomViewDefs();
    return defs.get(shortName.toLowerCase());
}

/**
 * Get the sorted list of custom view short names for the "Add View > CustomView" submenu.
 */
export async function getCustomViewNames(): Promise<string[]> {
    const defs = await getCustomViewDefs();
    return [...defs.values()].map(view => view.shortName).sort();
}

/**
 * Synchronous cache lookup for a custom view definition by shortName.
 * Returns undefined if the cache has not been populated yet or the name is not found.
 * Safe to call from synchronous code paths (e.g. property grid) after the layout
 * has been loaded (which always triggers an async getCustomViewDefs() first).
 */
export function getCustomViewDefSync(shortName: string): CustomViewDef | undefined {
    if (!cacheValid) { return undefined; }
    return cachedViews.get(shortName.toLowerCase());
}

/**
 * Invalidate the cached library scan, forcing a rescan on next access.
 */
export function invalidateLibraryCache(): void {
    cacheValid = false;
    cachedViews.clear();
}

// ── Library Path Resolution ──────────────────────────────────────────

/**
 * Resolve library directories from settings + auto-detected project paths.
 */
function getLibraryDirectories(): string[] {
    const config = vscode.workspace.getConfiguration('b4x');
    const userPaths: string[] = config.get<string[]>('libraryPaths', []);

    const dirs: string[] = [];

    // Add user-configured paths
    for (const p of userPaths) {
        const resolved = resolveWorkspacePath(p);
        if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            dirs.push(resolved);
        }
    }

    // Auto-detect: look for Libraries/ folders in workspace roots
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            const libDir = path.join(folder.uri.fsPath, 'Libraries');
            if (fs.existsSync(libDir) && fs.statSync(libDir).isDirectory()) {
                if (!dirs.includes(libDir)) {
                    dirs.push(libDir);
                }
            }
        }
    }

    return dirs;
}

/**
 * Resolve a potentially relative path against workspace folders.
 */
function resolveWorkspacePath(p: string): string | null {
    if (path.isAbsolute(p)) { return p; }
    if (vscode.workspace.workspaceFolders?.[0]) {
        return path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath, p);
    }
    return null;
}

// ── Library Scanning ─────────────────────────────────────────────────

/**
 * Scan all library directories and parse .b4xlib + .xml files for custom views.
 * `.b4xlib` takes priority over `.xml` for the same library name.
 */
async function scanLibraryPaths(): Promise<Map<string, CustomViewDef>> {
    const result = new Map<string, CustomViewDef>();
    const dirs = getLibraryDirectories();

    // Track which library names came from b4xlib (higher priority)
    const fromB4xlib = new Set<string>();

    for (const dir of dirs) {
        let files: string[];
        try {
            files = fs.readdirSync(dir);
        } catch {
            continue;
        }

        // First pass: .b4xlib files (higher priority)
        for (const file of files) {
            if (!file.toLowerCase().endsWith('.b4xlib')) { continue; }
            const filePath = path.join(dir, file);
            try {
                const views = parseB4xlibFile(filePath);
                for (const view of views) {
                    const key = view.shortName.toLowerCase();
                    if (!result.has(key)) {
                        result.set(key, view);
                        fromB4xlib.add(key);
                    }
                }
            } catch {
                // Skip unparseable files
            }
        }

        // Second pass: .xml files (lower priority — skip if b4xlib already found)
        for (const file of files) {
            if (!file.toLowerCase().endsWith('.xml')) { continue; }
            const filePath = path.join(dir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const views = parseLibraryXml(content, filePath);
                for (const view of views) {
                    // First-found wins, but b4xlib always takes priority
                    const key = view.shortName.toLowerCase();
                    if (!result.has(key)) {
                        result.set(key, view);
                    }
                }
            } catch {
                // Skip unparseable files
            }
        }
    }

    return result;
}

// ── XML Parsing (regex-based, no external XML dependency) ────────────

/**
 * Parse a single library XML file and extract custom view definitions.
 * A class is a custom view if it has at least one <designerProperty> element.
 */
function parseLibraryXml(xml: string, filePath: string): CustomViewDef[] {
    const results: CustomViewDef[] = [];

    // Split by <class>...</class> blocks
    const classRegex = /<class\b[^>]*>([\s\S]*?)<\/class>/gi;
    let classMatch: RegExpExecArray | null;

    while ((classMatch = classRegex.exec(xml)) !== null) {
        const classBody = classMatch[1];

        // Check for designerProperty entries
        const designerPropRegex = /<designerProperty>(.*?)<\/designerProperty>/gi;
        const designerProps: DesignerProperty[] = [];
        let propMatch: RegExpExecArray | null;
        while ((propMatch = designerPropRegex.exec(classBody)) !== null) {
            const parsed = parseDesignerPropertyString(propMatch[1].trim());
            if (parsed) { designerProps.push(parsed); }
        }

        // Only consider classes with designer properties as custom views
        if (designerProps.length === 0) { continue; }

        // Extract <shortname>
        const shortNameMatch = /<shortname>(.*?)<\/shortname>/i.exec(classBody);
        if (!shortNameMatch) { continue; }
        const shortName = shortNameMatch[1].trim();

        // Extract <name> (java type)
        const nameMatch = /<name>(.*?)<\/name>/i.exec(classBody);
        const javaType = nameMatch ? nameMatch[1].trim() : '';

        // Extract <event> entries
        const events: string[] = [];
        const eventRegex = /<event>(.*?)<\/event>/gi;
        let eventMatch: RegExpExecArray | null;
        while ((eventMatch = eventRegex.exec(classBody)) !== null) {
            events.push(eventMatch[1].trim());
        }

        results.push({
            shortName,
            javaType,
            events,
            designerProperties: designerProps,
            sourceFile: filePath,
        });
    }

    return results;
}

/**
 * Parse a designerProperty string like:
 *   "Key: DividerColor, DisplayName: Divider Color, FieldType: Color, DefaultValue: 0xFFA9A9A9"
 *
 * The format is comma-separated key: value pairs, but values may contain commas
 * only within known boundaries (descriptions don't typically, but we handle it).
 */
function parseDesignerPropertyString(s: string): DesignerProperty | null {
    // Known keys in order of expected appearance
    const knownKeys = ['Key', 'DisplayName', 'FieldType', 'DefaultValue', 'Description', 'MinRange', 'MaxRange', 'List'];

    const attrs = new Map<string, string>();

    // Split on ", KeyName:" pattern — but only for known keys
    // Build a regex that matches ", " followed by one of the known keys and ":"
    const splitPattern = new RegExp(`,\\s*(?=${knownKeys.join('|')})\\s*`, 'i');
    const parts = s.split(splitPattern);

    for (const part of parts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx < 0) { continue; }
        const key = part.substring(0, colonIdx).trim();
        const value = part.substring(colonIdx + 1).trim();
        attrs.set(key.toLowerCase(), value);
    }

    const keyVal = attrs.get('key');
    const displayName = attrs.get('displayname');
    const fieldType = attrs.get('fieldtype');
    const defaultValue = attrs.get('defaultvalue');

    if (!keyVal || !displayName || !fieldType || defaultValue === undefined) {
        return null;
    }

    const ft = fieldType.toLowerCase() as DesignerProperty['fieldType'];
    if (!['string', 'int', 'float', 'boolean', 'color'].includes(ft)) {
        return null;
    }

    const prop: DesignerProperty = {
        key: keyVal,
        displayName,
        fieldType: ft,
        defaultValue: defaultValue ?? '',
    };

    const desc = attrs.get('description');
    if (desc) { prop.description = desc.replace(/\\n/g, '\n'); }

    const minR = attrs.get('minrange');
    if (minR !== undefined) {
        const n = parseFloat(minR);
        if (!isNaN(n)) { prop.minRange = n; }
    }

    const maxR = attrs.get('maxrange');
    if (maxR !== undefined) {
        const n = parseFloat(maxR);
        if (!isNaN(n)) { prop.maxRange = n; }
    }

    const list = attrs.get('list');
    if (list) { prop.list = list.split('|').map(v => v.trim()); }

    return prop;
}

// ── .b4xlib Parsing (ZIP archives with .bas source) ──────────────────

/**
 * Parse a .b4xlib file (ZIP archive) and extract custom view definitions.
 * The ZIP may contain multiple `.bas` source files; each is checked independently
 * for `#DesignerProperty:` annotations and a `DesignerCreateView` method.
 */
function parseB4xlibFile(zipPath: string): CustomViewDef[] {
    const zipBuffer = fs.readFileSync(zipPath);
    const basEntries = extractAllTextFromZip(zipBuffer, '.bas');
    if (basEntries.length === 0) { return []; }

    const results: CustomViewDef[] = [];
    for (const { name, text } of basEntries) {
        const shortName = name.replace(/\.bas$/i, '');
        const views = parseBasSource(text, shortName, zipPath);
        results.push(...views);
    }
    return results;
}

/**
 * Parse B4X `.bas` source text for custom view annotations.
 * Returns a CustomViewDef if the source contains DesignerCreateView and #DesignerProperty lines.
 */
function parseBasSource(source: string, shortName: string, sourceFile: string): CustomViewDef[] {
    const lines = source.split(/\r?\n/);

    const designerProps: DesignerProperty[] = [];
    const events: string[] = [];
    let hasDesignerCreateView = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // #DesignerProperty: Key: X, DisplayName: Y, FieldType: Z, DefaultValue: V
        if (trimmed.startsWith('#DesignerProperty:')) {
            const propStr = trimmed.substring('#DesignerProperty:'.length).trim();
            const parsed = parseDesignerPropertyString(propStr);
            if (parsed) { designerProps.push(parsed); }
            continue;
        }

        // #Event: EventName (Params)
        if (trimmed.startsWith('#Event:')) {
            events.push(trimmed.substring('#Event:'.length).trim());
            continue;
        }

        // Public Sub DesignerCreateView(...)
        if (/^\s*Public\s+Sub\s+DesignerCreateView\s*\(/i.test(trimmed)) {
            hasDesignerCreateView = true;
        }
    }

    // Only emit if it has DesignerCreateView and at least one designer property
    if (!hasDesignerCreateView || designerProps.length === 0) { return []; }

    return [{
        shortName,
        javaType: shortName.toLowerCase(),
        events,
        designerProperties: designerProps,
        sourceFile,
    }];
}

// ── Minimal ZIP Reader (Node.js built-in only) ──────────────────────

/** A named text entry extracted from a ZIP archive. */
interface ZipTextEntry {
    /** Filename (basename only, no path). */
    name: string;
    /** Decoded UTF-8 text content. */
    text: string;
}

/**
 * Extract all text files from a ZIP archive whose filenames end with `ext`.
 * Skips entries in subdirectories (e.g. `HelperClasses/Foo.bas`).
 * Uses only Node.js built-in `zlib` for deflate decompression.
 */
function extractAllTextFromZip(zipBuffer: Buffer, ext: string): ZipTextEntry[] {
    const results: ZipTextEntry[] = [];
    let offset = 0;

    while (offset + 30 <= zipBuffer.length) {
        const sig = zipBuffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) { break; } // Not a local file header

        const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
        const fileName = zipBuffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);
        const dataStart = offset + 30 + fileNameLength + extraFieldLength;

        // Only top-level .bas files (skip subdirectories like HelperClasses/)
        if (fileName.toLowerCase().endsWith(ext) && !fileName.includes('/')) {
            const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
            let data: Buffer | null = null;
            if (compressionMethod === 0) {
                data = compressed;
            } else if (compressionMethod === 8) {
                try { data = zlib.inflateRawSync(compressed); } catch { /* skip corrupt */ }
            }
            if (data) {
                results.push({ name: fileName, text: data.toString('utf-8') });
            }
        }

        offset = dataStart + compressedSize;
    }

    return results;
}
