/**
 * B4X Designer Script — Webview Tokenizer
 *
 * A standalone tokenizer for syntax highlighting and autocomplete in the
 * designer script editor webview. Mirrors the tokenizer in
 * `designer/scriptEngine.ts` but has no extension-side dependencies.
 */

// ── Token Types ──────────────────────────────────────────────────────

export type ScriptTokenType =
    | 'keyword'
    | 'builtin'
    | 'operator'
    | 'string'
    | 'number'
    | 'identifier'
    | 'comment';

export interface ScriptToken {
    type: ScriptTokenType;
    value: string;
    /** Offset (column) within the original line, 0-based. */
    col: number;
    /** Length of the raw matched text (including quotes for strings, etc.). */
    rawLen: number;
}

// ── Known Words ──────────────────────────────────────────────────────

export const KEYWORDS = new Set([
    'if', 'then', 'else', 'else if', 'end if', 'and', 'or',
    'true', 'false', 'mod',
]);

export const BUILTINS = new Set([
    'autoscalerate', 'autoscaleall', 'portrait', 'landscape', 'activitysize',
]);

/** Properties that can follow `controlName.` */
export const CONTROL_PROPERTIES = [
    'Left', 'Top', 'Width', 'Height', 'Right', 'Bottom',
    'HorizontalCenter', 'VerticalCenter',
    'Visible', 'TextSize', 'Text', 'Image',
    'SetLeftAndRight', 'SetTopAndBottom',
];

/** Functions available under the `_c` namespace. */
export const C_NAMESPACE_FUNCTIONS = [
    'True', 'False', 'Min', 'Max',
    'DipToCurrent', 'PerXToCurrent', 'PerYToCurrent',
];

/**
 * Module names → their DesignerArgs methods.
 * These are classes whose Public Subs accept DesignerArgs and can be
 * called from designer scripts as `ModuleName.MethodName(...)`.
 */
export const MODULE_METHODS: Record<string, string[]> = {
    'DesignerMethods': [
        'SetStyleForViews',
        'SetTextAlignment',
        'GetGridValuesForOptionForm',
        'SetCommonUIGapAndHeight',
    ],
    'CommonUIMethods': [
        'SetCommonUIGapAndHeight',
    ],
};

const OPERATOR_CHARS = new Set([
    '=', '+', '-', '*', '/', '(', ')', '.', '<', '>', ',', '^',
]);

// ── Helpers ──────────────────────────────────────────────────────────

function isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
function isIdentStart(ch: string): boolean { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
function isIdentChar(ch: string): boolean { return isIdentStart(ch) || isDigit(ch); }

/**
 * Find where a line comment starts (single-quote outside a string).
 * Returns -1 if none.
 */
function findCommentStart(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inString = !inString; }
        else if (line[i] === '\'' && !inString) { return i; }
    }
    return -1;
}

// ── Tokenizer ────────────────────────────────────────────────────────

/**
 * Tokenize a single line of designer script for syntax highlighting.
 * Returns flat array of tokens covering every character in the line
 * (comments included). Gaps between tokens are plain whitespace.
 */
export function tokenizeLine(rawLine: string): ScriptToken[] {
    const tokens: ScriptToken[] = [];

    // Handle comment: emit one comment token for the rest of the line
    const commentPos = findCommentStart(rawLine);
    const line = commentPos >= 0 ? rawLine.substring(0, commentPos) : rawLine;

    let i = 0;
    while (i < line.length) {
        // Skip whitespace
        if (line[i] === ' ' || line[i] === '\t') { i++; continue; }

        const col = i;

        // String literal
        if (line[i] === '"') {
            const start = i;
            i++;
            let str = '';
            while (i < line.length && line[i] !== '"') {
                str += line[i];
                i++;
            }
            if (i < line.length) { i++; } // closing quote
            tokens.push({ type: 'string', value: str, col: start, rawLen: i - start });
            continue;
        }

        // Number literal
        if (isDigit(line[i]) || (line[i] === '.' && i + 1 < line.length && isDigit(line[i + 1]))) {
            const start = i;
            while (i < line.length && (isDigit(line[i]) || line[i] === '.')) { i++; }
            // Scientific notation
            if (i < line.length && (line[i] === 'e' || line[i] === 'E')) {
                i++;
                if (i < line.length && (line[i] === '+' || line[i] === '-')) { i++; }
                while (i < line.length && isDigit(line[i])) { i++; }
            }
            // 'dip' suffix
            if (i + 3 <= line.length && line.substring(i, i + 3).toLowerCase() === 'dip') {
                i += 3;
            }
            tokens.push({ type: 'number', value: line.substring(start, i), col: start, rawLen: i - start });
            continue;
        }

        // Operators
        if (OPERATOR_CHARS.has(line[i])) {
            const start = i;
            if (i + 1 < line.length) {
                const two = line[i] + line[i + 1];
                if (two === '<>' || two === '>=' || two === '<=' || two === '=>' || two === '=<') {
                    tokens.push({ type: 'operator', value: two, col: start, rawLen: 2 });
                    i += 2;
                    continue;
                }
            }
            tokens.push({ type: 'operator', value: line[i], col: start, rawLen: 1 });
            i++;
            continue;
        }

        // Identifier or keyword
        if (isIdentStart(line[i])) {
            const start = i;
            let word = '';
            while (i < line.length && isIdentChar(line[i])) {
                word += line[i];
                i++;
            }
            const lower = word.toLowerCase();

            // Compound keywords: "else if", "end if"
            if (lower === 'else' || lower === 'end') {
                let j = i;
                while (j < line.length && (line[j] === ' ' || line[j] === '\t')) { j++; }
                if (j + 2 <= line.length && line.substring(j, j + 2).toLowerCase() === 'if'
                    && (j + 2 >= line.length || !isIdentChar(line[j + 2]))) {
                    const fullLen = (j + 2) - start;
                    tokens.push({ type: 'keyword', value: lower + ' if', col: start, rawLen: fullLen });
                    i = j + 2;
                    continue;
                }
            }

            if (KEYWORDS.has(lower)) {
                tokens.push({ type: 'keyword', value: word, col: start, rawLen: word.length });
            } else if (BUILTINS.has(lower)) {
                tokens.push({ type: 'builtin', value: word, col: start, rawLen: word.length });
            } else {
                tokens.push({ type: 'identifier', value: word, col: start, rawLen: word.length });
            }
            continue;
        }

        // Unknown character — skip
        i++;
    }

    // Append comment token if present
    if (commentPos >= 0) {
        tokens.push({
            type: 'comment',
            value: rawLine.substring(commentPos),
            col: commentPos,
            rawLen: rawLine.length - commentPos,
        });
    }

    return tokens;
}

/**
 * Map token type to a CSS class name for syntax highlighting.
 */
export function tokenClass(type: ScriptTokenType): string {
    switch (type) {
        case 'keyword':  return 'se-kw';
        case 'builtin':  return 'se-bi';
        case 'operator':  return 'se-op';
        case 'string':   return 'se-str';
        case 'number':   return 'se-num';
        case 'identifier': return 'se-id';
        case 'comment':  return 'se-cmt';
    }
}
