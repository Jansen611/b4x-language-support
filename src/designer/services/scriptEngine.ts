/**
 * B4X Designer — Script Engine
 *
 * A B4X-dialect interpreter for designer scripts that programmatically
 * adjust control positions/sizes based on the current variant.
 * Scripts run at design-time when switching variants.
 */

import { ControlNode, TypeTag, Platform, Variant, PropertyValue } from '../models/types';

// ══════════════════════════════════════════════════════════════════════
// Token Types & Tokenizer
// ══════════════════════════════════════════════════════════════════════

export const enum TokenType {
    Keyword = 'keyword',
    Operator = 'operator',
    StringLiteral = 'string',
    Identifier = 'identifier',
    NumberLiteral = 'number',
    LineEnd = 'lineEnd',
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
}

const KEYWORDS = new Set([
    'if', 'then', 'else', 'else if', 'end if', 'and', 'or',
    'true', 'false', 'mod',
]);

const BUILTINS = new Set([
    'autoscalerate', 'autoscaleall', 'portrait', 'landscape', 'activitysize',
    'min', 'max',
]);

const OPERATOR_CHARS = new Set([
    '=', '+', '-', '*', '/', '(', ')', '.', '<', '>', ',', '^',
]);

/**
 * Tokenize a script into lines of tokens.
 * Each line in the output ends with a LineEnd token.
 */
export function tokenize(script: string): Token[][] {
    const lines = script.split(/\r?\n/);
    const result: Token[][] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const raw = lines[lineIdx];
        // Strip comments (single quote)
        const commentPos = findCommentStart(raw);
        const line = commentPos >= 0 ? raw.substring(0, commentPos) : raw;
        const trimmed = line.trim();
        if (trimmed.length === 0) { continue; }

        const tokens: Token[] = [];
        let i = 0;

        while (i < line.length) {
            // Skip whitespace
            if (line[i] === ' ' || line[i] === '\t') { i++; continue; }

            const col = i;

            // String literal
            if (line[i] === '"') {
                i++;
                let str = '';
                while (i < line.length && line[i] !== '"') {
                    str += line[i];
                    i++;
                }
                if (i < line.length) { i++; } // skip closing quote
                tokens.push({ type: TokenType.StringLiteral, value: str, line: lineIdx, col });
                continue;
            }

            // Number literal (digits, possibly with decimal, scientific notation)
            if (isDigit(line[i]) || (line[i] === '.' && i + 1 < line.length && isDigit(line[i + 1]))) {
                let num = '';
                while (i < line.length && (isDigit(line[i]) || line[i] === '.')) {
                    num += line[i];
                    i++;
                }
                // Scientific notation: e+N, e-N, eN
                if (i < line.length && (line[i] === 'e' || line[i] === 'E')) {
                    num += line[i]; i++;
                    if (i < line.length && (line[i] === '+' || line[i] === '-')) {
                        num += line[i]; i++;
                    }
                    while (i < line.length && isDigit(line[i])) {
                        num += line[i]; i++;
                    }
                }
                // Handle B4X dimension suffixes — preserve for execution-time resolution
                if (i + 3 <= line.length && line.substring(i, i + 3).toLowerCase() === 'dip') {
                    num += 'dip';
                    i += 3;
                } else if (i + 2 <= line.length && line[i] === '%' &&
                    (line[i + 1].toLowerCase() === 'x' || line[i + 1].toLowerCase() === 'y')) {
                    num += line.substring(i, i + 2).toLowerCase();
                    i += 2;
                }
                tokens.push({ type: TokenType.NumberLiteral, value: num, line: lineIdx, col });
                continue;
            }

            // Operators
            if (OPERATOR_CHARS.has(line[i])) {
                // Check for multi-char: <>, >=, <=, =>
                if (i + 1 < line.length) {
                    const two = line[i] + line[i + 1];
                    if (two === '<>' || two === '>=' || two === '<=' || two === '=>' || two === '=<') {
                        tokens.push({ type: TokenType.Operator, value: two, line: lineIdx, col });
                        i += 2;
                        continue;
                    }
                }
                tokens.push({ type: TokenType.Operator, value: line[i], line: lineIdx, col });
                i++;
                continue;
            }

            // Identifier or keyword
            if (isIdentStart(line[i])) {
                let word = '';
                while (i < line.length && isIdentChar(line[i])) {
                    word += line[i];
                    i++;
                }
                const lower = word.toLowerCase();

                // Check for compound keywords: "else if", "end if"
                if (lower === 'else' || lower === 'end') {
                    // Peek ahead for "if" after whitespace
                    let j = i;
                    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) { j++; }
                    if (j + 2 <= line.length && line.substring(j, j + 2).toLowerCase() === 'if'
                        && (j + 2 >= line.length || !isIdentChar(line[j + 2]))) {
                        tokens.push({ type: TokenType.Keyword, value: lower + ' if', line: lineIdx, col });
                        i = j + 2;
                        continue;
                    }
                }

                if (KEYWORDS.has(lower)) {
                    tokens.push({ type: TokenType.Keyword, value: lower, line: lineIdx, col });
                } else {
                    tokens.push({ type: TokenType.Identifier, value: word, line: lineIdx, col });
                }
                continue;
            }

            // Skip unknown characters
            i++;
        }

        if (tokens.length > 0) {
            tokens.push({ type: TokenType.LineEnd, value: '', line: lineIdx, col: line.length });
            result.push(tokens);
        }
    }

    return result;
}

function findCommentStart(line: string): number {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inString = !inString; }
        else if (line[i] === '\'' && !inString) { return i; }
    }
    return -1;
}

function isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
function isIdentStart(ch: string): boolean { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
function isIdentChar(ch: string): boolean { return isIdentStart(ch) || isDigit(ch); }

// ══════════════════════════════════════════════════════════════════════
// Script Execution Context
// ══════════════════════════════════════════════════════════════════════

/**
 * Per-control position/property data used during script execution.
 * All position values are in design-time dp/points (unscaled).
 */
export interface ControlPosition {
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
    textSize: number;
    text: string;
    image: string;
    /** Horizontal anchor mode: 0=LEFT, 1=RIGHT, 2=BOTH */
    hanchor: number;
    /** Vertical anchor mode: 0=TOP, 1=BOTTOM, 2=BOTH */
    vanchor: number;
    /** Parent control name (empty string for root children). */
    parentName: string;
    /** Raw (pre-anchor-resolved) values — needed by AutoScaleAll for RIGHT/BOTH anchors. */
    rawLeft: number;
    rawTop: number;
    rawWidth: number;
    rawHeight: number;
}

/** Result of script execution: per-control property changes. */
export interface ScriptResults {
    /** controlName (lowercase) → changed properties */
    changes: Map<string, Partial<ControlPosition>>;
    /** Error message if script failed, undefined if success. */
    error?: string;
    /** Non-fatal warnings (unknown controls, skipped lines, etc.). */
    warnings?: string[];
}

// ══════════════════════════════════════════════════════════════════════
// Script Engine
// ══════════════════════════════════════════════════════════════════════

/** Argument count for setter methods. Missing = 1 (for `=` assignment). */
const METHOD_ARG_COUNT: Record<string, number> = {
    setleftandright: 2,
    settopandbottom: 2,
};

/** Property types for validation. */
const PROPERTY_TYPES: Record<string, 'number' | 'string' | 'bool'> = {
    left: 'number',
    top: 'number',
    width: 'number',
    height: 'number',
    right: 'number',
    bottom: 'number',
    horizontalcenter: 'number',
    verticalcenter: 'number',
    textsize: 'number',
    text: 'string',
    image: 'string',
    visible: 'bool',
    setleftandright: 'number',
    settopandbottom: 'number',
};

/** Controls that support textsize/text properties. */
const TEXT_SUPPORTING_TYPES = new Set([
    'metalabel', 'metabutton', 'metatextfield', 'metatextview',
]);

/** Controls that support image property. */
const IMAGE_SUPPORTING_TYPES = new Set(['metaimageview']);

/** Execution cursor position. */
interface Cursor {
    line: number;
    token: number;
}

export class ScriptEngine {
    private lines: Token[][] = [];
    private variables = new Map<string, string>();
    private controlNames = new Map<string, string>(); // lowercaseName → originalCaseName
    private controlPositions = new Map<string, ControlPosition>(); // lowercaseName → position
    private controlTypes = new Map<string, string>(); // lowercaseName → meta type (lowercase)
    private overrides = new Map<string, Map<string, string>>(); // lowercaseName → { prop → stringValue }
    private screenWidth = 0;
    private screenHeight = 0;
    private scale = 1;
    private designScale = 1;
    private platformIsB4A = false;
    private currentVariant: Variant = { scale: 1, width: 320, height: 480 };
    private designVariant: Variant = { scale: 1, width: 320, height: 480 };

    /** Known module+method names that should be silently consumed. */
    private moduleRegistry = new Map<string, Set<string>>();

    /** Non-fatal warnings collected during execution. */
    private warnings: string[] = [];

    /**
     * Execute the script for a given variant.
     *
     * @param generalScript The general (all-variants) script text.
     * @param variantScript The per-variant script text (may be empty).
     * @param variant The current variant being displayed.
     * @param designVariant The design-time variant (variant 0, used as baseline for scale).
     * @param rootControl The root ControlNode tree.
     * @param variantIndex The index of the current variant.
     * @param platform The target platform.
     * @returns ScriptResults with per-control changes, or error.
     */
    execute(
        generalScript: string,
        variantScript: string,
        variant: Variant,
        designVariant: Variant,
        rootControl: ControlNode,
        variantIndex: number,
        platform: Platform,
    ): ScriptResults {
        try {
            this.currentVariant = variant;
            this.designVariant = designVariant;
            this.scale = variant.scale;
            this.designScale = designVariant.scale;
            this.platformIsB4A = platform === Platform.B4A;

            // Script geometry uses the variant's physical coordinate space.
            this.screenWidth = variant.width;
            this.screenHeight = variant.height;

            // Build control name map and pre-calculate anchor positions
            this.controlNames.clear();
            this.controlPositions.clear();
            this.controlTypes.clear();
            this.overrides.clear();
            this.variables.clear();
            this.moduleRegistry.clear();
            this.warnings = [];

            // Register known module methods
            this.moduleRegistry.set('designermethods', new Set([
                'setstyleforviews', 'setstyle', 'settextalignment',
                'getgridvaluesforoptionform', 'setcommonuigapandheight',
            ]));
            this.moduleRegistry.set('commonuimethods', new Set([
                'setcommonuigapandheight',
            ]));

            this.buildControlMap(rootControl, variantIndex, '', true);

            // Pre-calculate anchored positions (before script runs)
            this.preCalculateAnchors(this.screenWidth, this.screenHeight, rootControl, variantIndex);

            // Initialize overrides from pre-calculated positions
            this.initializeOverrides();

            // Initialize auto-scale variable with default rate (0.3)
            this.calculateAutoScaleValue(0.3);

            // Pre-set invisible controls
            for (const [name, pos] of this.controlPositions) {
                if (!pos.visible) {
                    this.setOverride(name, 'visible', 'false');
                }
            }

            // Combine scripts: general + clear_local_variables + variant-specific
            const combinedScript = generalScript + '\nclear_local_variables=0\n' + variantScript;
            this.lines = tokenize(combinedScript);

            // Execute line by line with per-line error handling
            const cursor: Cursor = { line: 0, token: -1 };
            while (cursor.line < this.lines.length) {
                const savedLine = cursor.line;
                try {
                    cursor.token = -1;
                    this.executeBlock(cursor, true, false);
                } catch (lineErr: unknown) {
                    const lineMsg = lineErr instanceof Error ? lineErr.message : String(lineErr);
                    this.warnings.push(`Line ${savedLine + 1}: ${lineMsg}`);
                }
                // Ensure cursor advances to avoid infinite loop
                if (cursor.line <= savedLine) {
                    cursor.line = savedLine + 1;
                    cursor.token = -1;
                }
            }

            // Build results from overrides
            const changes = new Map<string, Partial<ControlPosition>>();
            for (const [lowerName, props] of this.overrides) {
                const change: Partial<ControlPosition> = {};
                let hasChange = false;
                for (const [prop, val] of props) {
                    switch (prop) {
                        case 'left': change.left = parseFloat(val); hasChange = true; break;
                        case 'top': change.top = parseFloat(val); hasChange = true; break;
                        case 'width': change.width = parseFloat(val); hasChange = true; break;
                        case 'height': change.height = parseFloat(val); hasChange = true; break;
                        case 'visible': change.visible = val === 'true'; hasChange = true; break;
                        case 'textsize': change.textSize = parseFloat(val); hasChange = true; break;
                        case 'text': change.text = val; hasChange = true; break;
                        case 'image': change.image = val; hasChange = true; break;
                    }
                }
                if (hasChange) {
                    const originalName = this.controlNames.get(lowerName) ?? lowerName;
                    changes.set(originalName, change);
                }
            }

            return { changes, warnings: this.warnings.length > 0 ? this.warnings : undefined };

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { changes: new Map(), error: `Script error: ${msg}`, warnings: this.warnings.length > 0 ? this.warnings : undefined };
        }
    }

    // ── Control Map Building ─────────────────────────────────────

    private buildControlMap(
        node: ControlNode,
        variantIndex: number,
        parentName: string,
        isRoot: boolean,
    ): void {
        const name = this.getNodeName(node);
        if (!name) { return; }
        const lowerName = name.toLowerCase();

        if (!isRoot) {
            this.controlNames.set(lowerName, name);

            const csType = this.getNodeStr(node, 'csType', '').toLowerCase();
            const metaType = this.extractMetaType(csType);
            this.controlTypes.set(lowerName, metaType);

            const pos = this.extractPosition(node, variantIndex, parentName);
            this.controlPositions.set(lowerName, pos);
        } else {
            // Root control — register but don't add to positionable list
            this.controlNames.set(lowerName, name);
            this.controlTypes.set(lowerName, 'metamain');
        }

        for (const child of node.children) {
            this.buildControlMap(child, variantIndex, isRoot ? '' : lowerName, false);
        }
    }

    private extractPosition(node: ControlNode, variantIndex: number, parentName: string): ControlPosition {
        const vKey = `variant${variantIndex}`;
        const vObj = node.properties.get(vKey);

        let left = 0, top = 0, width = 100, height = 50;
        let hanchor = 0, vanchor = 0;

        const defaultHanchor = this.extractNum(node.properties.get('hanchor'), 0);
        const defaultVanchor = this.extractNum(node.properties.get('vanchor'), 0);

        if (vObj && vObj.tag === TypeTag.Object) {
            const m = vObj.value;
            left = this.extractNum(m.get('left'), 0);
            top = this.extractNum(m.get('top'), 0);
            width = this.extractNum(m.get('width'), 100);
            height = this.extractNum(m.get('height'), 50);
            const vh = this.extractNum(m.get('hanchor'), -1);
            const vv = this.extractNum(m.get('vanchor'), -1);
            hanchor = vh >= 0 ? vh : defaultHanchor;
            vanchor = vv >= 0 ? vv : defaultVanchor;
        } else {
            left = this.extractNum(node.properties.get('left'), 0);
            top = this.extractNum(node.properties.get('top'), 0);
            width = this.extractNum(node.properties.get('width'), 100);
            height = this.extractNum(node.properties.get('height'), 50);
            hanchor = defaultHanchor;
            vanchor = defaultVanchor;
        }

        let textSize = 0;
        const fontObj = node.properties.get('font');
        if (fontObj && fontObj.tag === TypeTag.Object) {
            textSize = this.extractNum(fontObj.value.get('fontSize'), 14);
        }

        const text = this.getNodeStr(node, 'text', '');
        const imageFile = this.getNodeStr(node, 'imageFile', '');
        const visible = this.getNodeBool(node, 'visible', true);

        return {
            left, top, width, height,
            visible, textSize, text, image: imageFile,
            hanchor, vanchor, parentName,
            rawLeft: left, rawTop: top, rawWidth: width, rawHeight: height,
        };
    }

    // ── Anchor Pre-calculation ───────────────────────────────────

    private preCalculateAnchors(
        containerW: number,
        containerH: number,
        parent: ControlNode,
        variantIndex: number,
    ): void {
        for (const child of parent.children) {
            const name = this.getNodeName(child);
            if (!name) { continue; }
            const lowerName = name.toLowerCase();
            const pos = this.controlPositions.get(lowerName);
            if (!pos) { continue; }

            let { left, top, width, height } = pos;

            // Horizontal anchor
            if (pos.hanchor === 1) { // RIGHT
                left = containerW - left - width;
            } else if (pos.hanchor === 2) { // BOTH
                width = containerW - width - left;
            }

            // Vertical anchor
            if (pos.vanchor === 1) { // BOTTOM
                top = containerH - top - height;
            } else if (pos.vanchor === 2) { // BOTH
                height = containerH - height - top;
            }

            pos.left = left;
            pos.top = top;
            pos.width = width;
            pos.height = height;

            // Recurse into container children
            if (child.children.length > 0) {
                this.preCalculateAnchors(width, height, child, variantIndex);
            }
        }
    }

    private initializeOverrides(): void {
        for (const [name, pos] of this.controlPositions) {
            const m = new Map<string, string>();
            m.set('left', String(pos.left));
            m.set('top', String(pos.top));
            m.set('width', String(pos.width));
            m.set('height', String(pos.height));
            this.overrides.set(name, m);
        }
    }

    // ── Interpreter Core ─────────────────────────────────────────

    private executeBlock(
        cursor: Cursor,
        singleStatement: boolean,
        singleExpression: boolean,
    ): { cursor: Cursor; text: string; num: number } {
        let text = '';
        let num = 0;
        const sb: string[] = [];
        let parenDepth = 0;
        let startToken = cursor.token + 1;

        while (cursor.line < this.lines.length) {
            const line = this.lines[cursor.line];

            while (cursor.token < line.length - 1) {
                cursor.token++;
                const tok = line[cursor.token];

                switch (tok.type) {
                    case TokenType.LineEnd:
                        cursor.token--;
                        break;

                    case TokenType.StringLiteral:
                        text = tok.value;
                        sb.push(text);
                        continue;

                    case TokenType.NumberLiteral:
                        text = this.resolveNumberLiteral(tok.value);
                        sb.push(text);
                        continue;

                    case TokenType.Operator:
                        if (singleExpression) {
                            // In expression mode
                            if (tok.value === ',' || tok.value === '&') {
                                cursor.token--;
                                break;
                            }
                            if ('<>='.includes(tok.value) && tok.value !== '(' && tok.value !== ')' &&
                                tok.value !== '+' && tok.value !== '-' && tok.value !== '*' &&
                                tok.value !== '/' && tok.value !== '^' && tok.value !== '.') {
                                cursor.token--;
                                break;
                            }
                            // Multi-char comparison operators
                            if (tok.value === '<>' || tok.value === '>=' || tok.value === '<=' ||
                                tok.value === '=>' || tok.value === '=<') {
                                cursor.token--;
                                break;
                            }
                            if (tok.value === '(') { parenDepth++; }
                            else if (tok.value === ')') {
                                parenDepth--;
                                if (parenDepth < 0) {
                                    cursor.token--;
                                    break;
                                }
                            }
                            // Handle unary minus
                            if (tok.value === '-' && (sb.length === 0 || sb[sb.length - 1] === '(')) {
                                sb.push('0');
                                sb.push('-');
                            } else {
                                sb.push(tok.value);
                            }
                            continue;
                        }

                        // Non-expression mode
                        if (tok.value === '(') {
                            // Start sub-expression
                            const prevText = text ?? '0';
                            if (text && sb.length > 0) {
                                // Remove the last text from sb (it's the operand)
                                sb.pop();
                            }
                            const subResult = this.executeBlock(
                                cursor, false, true,
                            );
                            cursor = subResult.cursor;
                            text = String(subResult.num);
                            sb.push(text);
                            if (cursor.line < this.lines.length) {
                                // Skip closing paren if present
                                const curLine = this.lines[cursor.line];
                                if (cursor.token + 1 < curLine.length &&
                                    curLine[cursor.token + 1].type === TokenType.Operator &&
                                    curLine[cursor.token + 1].value === ')') {
                                    cursor.token++;
                                }
                            }
                            continue;
                        }

                        if (tok.value === '=' && !singleStatement) {
                            // Might be comparison in non-expression context — handle below
                            cursor.token--;
                            break;
                        }

                        if (tok.value === '.' || tok.value === ',' || tok.value === ')') {
                            cursor.token--;
                            break;
                        }

                        sb.push(tok.value);
                        continue;

                    case TokenType.Identifier: {
                        const lowerIdent = tok.value.toLowerCase();

                        // 1. Check if it's a control name → property access/write
                        if (this.controlNames.has(lowerIdent)) {
                            this.handleControlAccess(cursor, lowerIdent, sb);
                            continue;
                        }

                        // 2. Check for variable assignment: name = expr
                        if (this.peekOperator(cursor, '=') && !singleExpression) {
                            cursor.token++; // skip '='
                            const valResult = this.executeBlock(
                                { line: cursor.line, token: cursor.token }, true, true,
                            );
                            cursor.line = valResult.cursor.line;
                            cursor.token = valResult.cursor.token;
                            this.variables.set(lowerIdent, valResult.text);
                            if (lowerIdent === 'clear_local_variables') {
                                this.variables.clear();
                                this.calculateAutoScaleValue(0.3);
                            }
                            continue;
                        }

                        // 3. _c namespace
                        if (lowerIdent === '_c') {
                            text = this.handleCNamespace(cursor);
                            sb.push(text);
                            continue;
                        }

                        // 4. Built-in functions
                        if (BUILTINS.has(lowerIdent)) {
                            const result = this.handleBuiltin(cursor, lowerIdent);
                            if (result !== null) {
                                text = result;
                                sb.push(text);
                            }
                            continue;
                        }

                        // 5. Module.method call (e.g. DesignerMethods.SetStyleForViews)
                        // Also treat any unknown identifier.method(...) as a module call
                        if (this.peekOperator(cursor, '.') && (this.isModuleName(lowerIdent) || this.looksLikeModuleCall(cursor, lowerIdent))) {
                            this.handleModuleCall(cursor, lowerIdent);
                            continue;
                        }

                        // 6. Variable reference
                        if (this.variables.has(lowerIdent)) {
                            text = this.variables.get(lowerIdent)!;
                            sb.push(text);
                            continue;
                        }

                        // 7. Unknown identifier — warn and use "0" instead of crashing
                        this.warnings.push(`Unassigned variable: '${tok.value}'`);
                        text = '0';
                        sb.push(text);
                        continue;
                    }

                    case TokenType.Keyword: {
                        const kw = tok.value;
                        if (kw === 'if') {
                            if (cursor.token !== 0) {
                                throw new Error('Syntax error: If must be first on line');
                            }
                            this.handleIf(cursor);
                            // handleIf advances cursor past the If block;
                            // break out — the inner while's `line` ref is stale
                            break;
                        }
                        if (kw === 'and' || kw === 'or') {
                            if (singleExpression) {
                                cursor.token--;
                                break;
                            }
                        }
                        if (kw === 'true') {
                            text = 'true';
                            sb.push(text);
                            continue;
                        }
                        if (kw === 'false') {
                            text = 'false';
                            sb.push(text);
                            continue;
                        }
                        continue;
                    }
                }

                // Line/statement break
                break;
            }

            if (singleExpression || singleStatement) {
                break;
            }

            cursor.token = -1;
            cursor.line++;
        }

        // Evaluate expression from accumulated tokens
        const expr = sb.join('');
        text = expr;
        if (singleExpression && expr.length > 0) {
            try {
                num = this.evaluateExpression(expr);
                text = formatNumber(num);
            } catch {
                // Non-numeric expression (e.g. string value) — keep text as-is
            }
        }

        return { cursor, text, num };
    }

    // ── Control Property Access ──────────────────────────────────

    private handleControlAccess(cursor: Cursor, controlName: string, sb: string[]): void {
        const line = this.lines[cursor.line];

        // Expect '.' next
        if (!this.consumeOperator(cursor, '.')) {
            throw new Error(`Expected '.' after control name '${controlName}'`);
        }

        // Read property/method name
        cursor.token++;
        const propTok = line[cursor.token];
        if (!propTok || (propTok.type !== TokenType.Identifier && propTok.type !== TokenType.Keyword)) {
            throw new Error(`Expected property name after '${controlName}.'`);
        }
        const propName = propTok.value.toLowerCase();

        // Determine if this is a setter or getter
        const isSetter = this.peekOperator(cursor, '=') || this.peekOperator(cursor, '(');
        const argCount = METHOD_ARG_COUNT[propName] ?? 1;

        if (isSetter) {
            // Setter: controlName.property = value  -or-  controlName.method(args)
            const useParen = this.peekOperator(cursor, '(');
            if (useParen) {
                cursor.token++; // skip '('
            } else {
                cursor.token++; // skip '='
            }

            const args: string[] = [];
            for (let i = 0; i < argCount; i++) {
                if (i > 0) {
                    // Skip comma between args
                    this.consumeOperator(cursor, ',');
                }
                const argResult = this.executeBlock(
                    { line: cursor.line, token: cursor.token }, true, true,
                );
                cursor.line = argResult.cursor.line;
                cursor.token = argResult.cursor.token;
                args.push(argResult.text);
            }

            if (useParen) {
                this.consumeOperator(cursor, ')');
            }

            this.setControlProperty(controlName, propName, args);
        } else {
            // Getter: controlName.property
            const value = this.getControlProperty(controlName, propName);
            sb.push(value);
        }
    }

    private getControlProperty(controlName: string, prop: string): string {
        // Check overrides first
        const overrides = this.overrides.get(controlName);
        if (overrides?.has(prop)) {
            return overrides.get(prop)!;
        }

        const pos = this.controlPositions.get(controlName);
        if (!pos) {
            this.warnings.push(`Unknown control: '${controlName}'`);
            return '0';
        }

        switch (prop) {
            case 'left': return String(pos.left);
            case 'top': return String(pos.top);
            case 'width': return String(pos.width);
            case 'height': return String(pos.height);
            case 'right': {
                const l = parseFloat(this.getControlProperty(controlName, 'left'));
                const w = parseFloat(this.getControlProperty(controlName, 'width'));
                return String(l + w);
            }
            case 'bottom': {
                const t = parseFloat(this.getControlProperty(controlName, 'top'));
                const h = parseFloat(this.getControlProperty(controlName, 'height'));
                return String(t + h);
            }
            case 'horizontalcenter': {
                const l = parseFloat(this.getControlProperty(controlName, 'left'));
                const w = parseFloat(this.getControlProperty(controlName, 'width'));
                return String(l + Math.floor(w / 2));
            }
            case 'verticalcenter': {
                const t = parseFloat(this.getControlProperty(controlName, 'top'));
                const h = parseFloat(this.getControlProperty(controlName, 'height'));
                return String(t + Math.floor(h / 2));
            }
            case 'textsize': return String(pos.textSize);
            case 'text': return pos.text;
            case 'visible': return pos.visible ? 'true' : 'false';
            case 'image': return pos.image;
            default:
                this.warnings.push(`Unknown property: '${prop}' on '${controlName}'`);
                return '0';
        }
    }

    private setControlProperty(controlName: string, prop: string, args: string[]): void {
        if (!PROPERTY_TYPES[prop]) {
            this.warnings.push(`Unknown property: '${prop}' on '${controlName}'`);
            return;
        }

        switch (prop) {
            case 'setleftandright': {
                const l = Math.trunc(parseFloat(args[0]));
                const r = Math.trunc(parseFloat(args[1]));
                this.setOverride(controlName, 'left', String(l));
                this.setOverride(controlName, 'width', String(r - l));
                return;
            }
            case 'settopandbottom': {
                const t = Math.trunc(parseFloat(args[0]));
                const b = Math.trunc(parseFloat(args[1]));
                this.setOverride(controlName, 'top', String(t));
                this.setOverride(controlName, 'height', String(b - t));
                return;
            }
            case 'right': {
                const r = Math.trunc(parseFloat(args[0]));
                const w = parseFloat(this.getControlProperty(controlName, 'width'));
                this.setOverride(controlName, 'left', String(r - w));
                return;
            }
            case 'bottom': {
                const b = Math.trunc(parseFloat(args[0]));
                const h = parseFloat(this.getControlProperty(controlName, 'height'));
                this.setOverride(controlName, 'top', String(b - h));
                return;
            }
            case 'horizontalcenter': {
                const c = Math.trunc(parseFloat(args[0]));
                const w = parseFloat(this.getControlProperty(controlName, 'width'));
                this.setOverride(controlName, 'left', String(c - Math.floor(w / 2)));
                return;
            }
            case 'verticalcenter': {
                const c = Math.trunc(parseFloat(args[0]));
                const h = parseFloat(this.getControlProperty(controlName, 'height'));
                this.setOverride(controlName, 'top', String(c - Math.floor(h / 2)));
                return;
            }
            default: {
                const pType = PROPERTY_TYPES[prop];
                let value: string;
                if (pType === 'number') {
                    const n = parseFloat(args[0]);
                    if (isNaN(n)) { throw new Error(`Error parsing '${args[0]}' as number.`); }
                    value = formatNumber(Math.trunc(n));
                } else if (pType === 'bool') {
                    const lower = args[0].toLowerCase();
                    if (lower !== 'true' && lower !== 'false') {
                        throw new Error(`Error parsing '${args[0]}' as boolean.`);
                    }
                    value = lower;
                } else {
                    value = args[0];
                }
                this.setOverride(controlName, prop, value);
            }
        }
    }

    private setOverride(controlName: string, prop: string, value: string): void {
        let m = this.overrides.get(controlName);
        if (!m) {
            m = new Map<string, string>();
            this.overrides.set(controlName, m);
        }
        m.set(prop, value);
    }

    // ── Built-in Functions ───────────────────────────────────────

    private handleBuiltin(cursor: Cursor, name: string): string | null {
        switch (name) {
            case 'autoscalerate': {
                this.consumeOperator(cursor, '(');
                const argResult = this.executeBlock(
                    { line: cursor.line, token: cursor.token }, false, true,
                );
                cursor.line = argResult.cursor.line;
                cursor.token = argResult.cursor.token;
                this.consumeOperator(cursor, ')');
                this.calculateAutoScaleValue(argResult.num);
                return null;
            }
            case 'autoscaleall': {
                const scaleVal = parseFloat(
                    this.variables.get('_autoscalevalue') ?? '1',
                );
                this.autoScaleAll(scaleVal);
                return null;
            }
            case 'portrait':
                return (this.currentVariant.height >= this.currentVariant.width) ? 'true' : 'false';
            case 'landscape':
                return (this.currentVariant.width > this.currentVariant.height) ? 'true' : 'false';
            case 'activitysize': {
                const dpiBase = this.platformIsB4A ? 160 : 96;
                const w = this.currentVariant.width / this.currentVariant.scale;
                const h = this.currentVariant.height / this.currentVariant.scale;
                return formatNumber(Math.sqrt(w * w + h * h) / dpiBase);
            }
            case 'min':
            case 'max': {
                const [a, b] = this.readTwoArgs(cursor);
                return formatNumber(name === 'min' ? Math.min(a, b) : Math.max(a, b));
            }
            default:
                return null;
        }
    }

    private calculateAutoScaleValue(rate: number): void {
        const designDpi = this.designVariant.scale * (this.platformIsB4A ? 160 : 96) - 0.3;
        const currentDpi = this.currentVariant.scale * (this.platformIsB4A ? 160 : 96);
        const ratio = currentDpi / designDpi;

        if (ratio > 0.95 && ratio < 1.05) {
            this.variables.set('_autoscalevalue', '1');
        } else {
            const value = (1 + rate * (currentDpi / 3.7 - 1)) / (1 + rate * (designDpi / 3.7 - 1));
            this.variables.set('_autoscalevalue', formatNumber(value));
        }
    }

    private autoScaleAll(scaleValue: number): void {
        // For each control, apply auto-scale based on anchors
        for (const [name, pos] of this.controlPositions) {
            this.autoScaleControl(name, scaleValue);
        }
    }

    private autoScaleControl(controlName: string, scaleValue: number): void {
        const pos = this.controlPositions.get(controlName);
        if (!pos) { return; }

        const left = parseFloat(this.getControlProperty(controlName, 'left'));
        const top = parseFloat(this.getControlProperty(controlName, 'top'));
        const width = parseFloat(this.getControlProperty(controlName, 'width'));
        const height = parseFloat(this.getControlProperty(controlName, 'height'));

        // Get parent dimensions
        let parentW: number, parentH: number;
        if (!pos.parentName) {
            parentW = this.screenWidth;
            parentH = this.screenHeight;
        } else {
            parentW = parseFloat(this.getControlProperty(pos.parentName, 'width'));
            parentH = parseFloat(this.getControlProperty(pos.parentName, 'height'));
        }

        let newLeft: number, newWidth: number;
        if (pos.hanchor === 0) { // LEFT
            newLeft = Math.round(left * scaleValue);
            newWidth = Math.round((left + width) * scaleValue) - newLeft;
        } else if (pos.hanchor === 1) { // RIGHT
            const origLeft = this.extractOriginalPosition(pos, 'left');
            const scaledOrig = Math.round(origLeft * scaleValue);
            newWidth = Math.round((origLeft + width) * scaleValue) - scaledOrig;
            newLeft = parentW - scaledOrig - newWidth;
        } else { // BOTH
            const origWidth = this.extractOriginalPosition(pos, 'width');
            newLeft = Math.round(left * scaleValue);
            const scaledWidth = Math.round(origWidth * scaleValue);
            newWidth = parentW - scaledWidth - newLeft;
        }

        let newTop: number, newHeight: number;
        if (pos.vanchor === 0) { // TOP
            newTop = Math.round(top * scaleValue);
            newHeight = Math.round((top + height) * scaleValue) - newTop;
        } else if (pos.vanchor === 1) { // BOTTOM
            const origTop = this.extractOriginalPosition(pos, 'top');
            const scaledOrig = Math.round(origTop * scaleValue);
            newHeight = Math.round((origTop + height) * scaleValue) - scaledOrig;
            newTop = parentH - scaledOrig - newHeight;
        } else { // BOTH
            const origHeight = this.extractOriginalPosition(pos, 'height');
            newTop = Math.round(top * scaleValue);
            const scaledHeight = Math.round(origHeight * scaleValue);
            newHeight = parentH - scaledHeight - newTop;
        }

        this.setOverride(controlName, 'left', String(newLeft));
        this.setOverride(controlName, 'width', String(newWidth));
        this.setOverride(controlName, 'top', String(newTop));
        this.setOverride(controlName, 'height', String(newHeight));

        // Scale text size if applicable
        const metaType = this.controlTypes.get(controlName) ?? '';
        if (TEXT_SUPPORTING_TYPES.has(metaType)) {
            const ts = parseFloat(this.getControlProperty(controlName, 'textsize'));
            this.setOverride(controlName, 'textsize', formatNumber(ts * scaleValue));
        }
    }

    private extractOriginalPosition(pos: ControlPosition, prop: string): number {
        // Return the original (pre-anchor-resolved) value — needed for AutoScaleAll
        // to correctly calculate scaled RIGHT/BOTH anchor offsets.
        switch (prop) {
            case 'left': return pos.rawLeft;
            case 'top': return pos.rawTop;
            case 'width': return pos.rawWidth;
            case 'height': return pos.rawHeight;
            default: return 0;
        }
    }

    // ── _c Namespace ─────────────────────────────────────────────

    private handleCNamespace(cursor: Cursor): string {
        this.consumeOperator(cursor, '.');
        cursor.token++;
        const line = this.lines[cursor.line];
        const funcTok = line[cursor.token];
        if (!funcTok || funcTok.type !== TokenType.Identifier) {
            throw new Error('Expected function name after _c.');
        }
        const func = funcTok.value.toLowerCase();

        switch (func) {
            case 'true': return 'true';
            case 'false': return 'false';
            case 'min':
            case 'max': {
                const [a, b] = this.readTwoArgs(cursor);
                return formatNumber(func === 'min' ? Math.min(a, b) : Math.max(a, b));
            }
            case 'diptocurrent': {
                cursor.token++; // skip '('
                const val = this.readSingleArg(cursor);
                cursor.token++; // skip ')'
                return formatNumber(val * this.currentVariant.scale);
            }
            case 'perxtocurrent': {
                cursor.token++; // skip '('
                const val = this.readSingleArg(cursor);
                cursor.token++; // skip ')'
                return formatNumber(val / 100 * this.currentVariant.width);
            }
            case 'perytocurrent': {
                cursor.token++; // skip '('
                const val = this.readSingleArg(cursor);
                cursor.token++; // skip ')'
                return formatNumber(val / 100 * this.currentVariant.height);
            }
            default:
                throw new Error('Reserved keywords cannot be used in script.');
        }
    }

    private readSingleArg(cursor: Cursor): number {
        const r = this.executeBlock(
            { line: cursor.line, token: cursor.token }, false, true,
        );
        cursor.line = r.cursor.line;
        cursor.token = r.cursor.token;
        return r.num;
    }

    private readTwoArgs(cursor: Cursor): [number, number] {
        if (!this.consumeOperator(cursor, '(')) {
            throw new Error('Expected opening parenthesis.');
        }
        const a = this.readSingleArg(cursor);
        if (!this.consumeOperator(cursor, ',')) {
            throw new Error('Expected comma between arguments.');
        }
        const b = this.readSingleArg(cursor);
        if (!this.consumeOperator(cursor, ')')) {
            throw new Error('Expected closing parenthesis.');
        }
        return [a, b];
    }

    // ── Module Method Calls ──────────────────────────────────────

    private isModuleName(name: string): boolean {
        return this.moduleRegistry.has(name);
    }

    /**
     * Heuristic: does this look like a module.method(args) call?
     * Matches any identifier.identifier(...) pattern where the identifier
     * is NOT a known control name. Used for unknown modules/namespaces.
     */
    private looksLikeModuleCall(cursor: Cursor, _name: string): boolean {
        const line = this.lines[cursor.line];
        const dotIdx = cursor.token + 1;
        const methodIdx = cursor.token + 2;
        const parenIdx = cursor.token + 3;
        if (dotIdx >= line.length || methodIdx >= line.length) { return false; }
        if (line[dotIdx].type !== TokenType.Operator || line[dotIdx].value !== '.') { return false; }
        if (line[methodIdx].type !== TokenType.Identifier) { return false; }
        // Must have '(' after method name to distinguish from control.property
        if (parenIdx >= line.length) { return false; }
        return line[parenIdx].type === TokenType.Operator && line[parenIdx].value === '(';
    }

    private handleModuleCall(cursor: Cursor, moduleName: string): void {
        this.consumeOperator(cursor, '.'); // skip '.'
        cursor.token++;
        const line = this.lines[cursor.line];
        const methodTok = line[cursor.token];
        if (!methodTok || methodTok.type !== TokenType.Identifier) {
            throw new Error(`Expected method name after '${moduleName}.'`);
        }

        // Consume arguments if present: (...)
        if (this.peekOperator(cursor, '(')) {
            cursor.token++; // skip '('
            let depth = 1;
            while (cursor.token < line.length - 1 && depth > 0) {
                cursor.token++;
                const t = line[cursor.token];
                if (t.type === TokenType.Operator && t.value === '(') { depth++; }
                if (t.type === TokenType.Operator && t.value === ')') { depth--; }
            }
        }
    }

    // ── If/Then/Else/EndIf ───────────────────────────────────────

    private handleIf(cursor: Cursor): void {
        const line = this.lines[cursor.line];

        // Check if this is a single-line If (has "then" on same line)
        const hasThenOnLine = line.some(t =>
            t.type === TokenType.Keyword && t.value === 'then',
        );

        if (hasThenOnLine) {
            this.handleSingleLineIf(cursor);
        } else {
            this.handleMultiLineIf(cursor);
        }
    }

    private handleSingleLineIf(cursor: Cursor): void {
        // If condition Then subName [Else subName]
        const condition = this.evaluateCondition(cursor);

        // Find "then" keyword
        const line = this.lines[cursor.line];
        while (cursor.token < line.length - 1) {
            cursor.token++;
            const t = line[cursor.token];
            if (t.type === TokenType.Keyword && t.value === 'then') { break; }
        }

        if (condition) {
            // Execute after Then
            this.executeBlock(cursor, true, false);
        } else {
            // Look for Else
            while (cursor.token < line.length - 1) {
                cursor.token++;
                const t = line[cursor.token];
                if (t.type === TokenType.Keyword && t.value === 'else') {
                    this.executeBlock(cursor, true, false);
                    break;
                }
            }
        }

        // Move to next line
        cursor.token = -1;
        cursor.line++;
    }

    private handleMultiLineIf(cursor: Cursor): void {
        // Multi-line If/ElseIf/Else/EndIf
        let branchCondition = this.evaluateCondition(cursor);
        let anyBranchTaken = false;

        cursor.token = -1;
        cursor.line++;

        while (cursor.line < this.lines.length) {
            const line = this.lines[cursor.line];
            const firstTok = line[0];

            if (firstTok.type === TokenType.Keyword) {
                if (firstTok.value === 'else if') {
                    // Transition: mark current branch if it was taken
                    if (branchCondition) { anyBranchTaken = true; }
                    cursor.token = 0;
                    branchCondition = !anyBranchTaken && this.evaluateCondition(cursor);
                    cursor.token = -1;
                    cursor.line++;
                    continue;
                }
                if (firstTok.value === 'else') {
                    if (branchCondition) { anyBranchTaken = true; }
                    branchCondition = !anyBranchTaken;
                    cursor.token = -1;
                    cursor.line++;
                    continue;
                }
                if (firstTok.value === 'end if') {
                    cursor.token = -1;
                    cursor.line++;
                    return;
                }
            }

            if (branchCondition) {
                // Execute body line (handleIf handles nested Ifs via executeBlock)
                const beforeLine = cursor.line;
                cursor.token = -1;
                this.executeBlock(cursor, true, false);
                // If executeBlock handled a multi-line If, cursor.line was advanced.
                // Otherwise advance manually.
                if (cursor.line === beforeLine) {
                    cursor.line++;
                }
                cursor.token = -1;
            } else {
                // Skipping: track nested If blocks so EndIf matching is correct
                if (firstTok.type === TokenType.Keyword && firstTok.value === 'if') {
                    this.skipNestedIfBlock(cursor);
                    // cursor.line is now on the matching EndIf line
                }
                cursor.token = -1;
                cursor.line++;
            }
        }
    }

    /** Skip a nested If/EndIf block when inside a false branch. */
    private skipNestedIfBlock(cursor: Cursor): void {
        let depth = 1;
        while (depth > 0 && cursor.line + 1 < this.lines.length) {
            cursor.line++;
            const line = this.lines[cursor.line];
            const ft = line[0];
            if (ft.type === TokenType.Keyword) {
                if (ft.value === 'if') { depth++; }
                else if (ft.value === 'end if') { depth--; }
            }
        }
        // cursor.line now points to the matching End If
    }

    private evaluateCondition(cursor: Cursor): boolean {
        let result: boolean;

        // Evaluate first operand
        const lhs = this.executeBlock(
            { line: cursor.line, token: cursor.token }, true, false,
        );
        cursor.line = lhs.cursor.line;
        cursor.token = lhs.cursor.token;

        // Check for comparison operator
        const line = this.lines[cursor.line];
        if (cursor.token + 1 < line.length - 1) {
            const nextTok = line[cursor.token + 1];

            if (nextTok.type === TokenType.Keyword && nextTok.value === 'then') {
                // No comparison — treat as boolean
                result = isTruthy(lhs.text);
            } else if (nextTok.type === TokenType.Operator &&
                       ('<>='.includes(nextTok.value[0]) || nextTok.value === '<>' || nextTok.value === '>=' ||
                        nextTok.value === '<=' || nextTok.value === '=>' || nextTok.value === '=<')) {
                cursor.token++; // consume comparison operator
                const op = nextTok.value;

                const rhs = this.executeBlock(
                    { line: cursor.line, token: cursor.token }, true, false,
                );
                cursor.line = rhs.cursor.line;
                cursor.token = rhs.cursor.token;

                result = this.compareValues(lhs.text, op, rhs.text);
            } else if (nextTok.type === TokenType.Keyword &&
                       (nextTok.value === 'and' || nextTok.value === 'or')) {
                result = isTruthy(lhs.text);
            } else {
                result = isTruthy(lhs.text);
            }
        } else {
            result = isTruthy(lhs.text);
        }

        // Check for And/Or chaining
        while (cursor.token + 1 < line.length - 1) {
            const nextTok = line[cursor.token + 1];
            if (nextTok.type !== TokenType.Keyword) { break; }
            if (nextTok.value === 'and') {
                if (!result) { return false; } // short-circuit
                cursor.token++; // skip 'and'
                result = this.evaluateCondition(cursor);
            } else if (nextTok.value === 'or') {
                if (result) { return true; } // short-circuit
                cursor.token++; // skip 'or'
                result = this.evaluateCondition(cursor);
            } else {
                break;
            }
        }

        return result;
    }

    private compareValues(lhs: string, op: string, rhs: string): boolean {
        switch (op) {
            case '=': return lhs === rhs;
            case '<>': return lhs !== rhs;
            case '>': return parseFloat(lhs) > parseFloat(rhs);
            case '<': return parseFloat(lhs) < parseFloat(rhs);
            case '>=':
            case '=>': return parseFloat(lhs) >= parseFloat(rhs);
            case '<=':
            case '=<': return parseFloat(lhs) <= parseFloat(rhs);
            default: return false;
        }
    }

    // ── Expression Evaluator ──────────────────────────────────────

    private evaluateExpression(expr: string): number {
        if (expr.length === 0) { return 0; }

        // Try direct number parse first
        const direct = parseFloat(expr);
        if (!isNaN(direct) && String(direct).length === expr.length) {
            return direct;
        }

        let s = expr.toLowerCase();
        // Prepend 0+ to handle expressions starting with a negative
        s = '0+' + s;
        // Replace -(  →  -1*(
        s = s.replace(/-\(/g, '-1*(');
        // Protect scientific notation
        s = s.replace(/e\+/g, '\u0001');
        s = s.replace(/e-/g, '\u0002');
        // Replace mod with special char
        s = s.replace(/mod/g, '\u0003');

        // Build operand and operator arrays by splitting on operators
        const operands: number[] = [];
        const operators: { code: number; priority: number }[] = [];
        const splitChars = '+-*/^\u0001\u0002\u0003';
        let parenPrio = 0;

        // Remove parentheses and assign priorities
        const prioBuf: number[] = new Array(s.length).fill(0);

        // First pass: assign paren-based priorities
        let tempS = '';
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '(') {
                parenPrio += 4;
            } else if (s[i] === ')') {
                parenPrio -= 4;
            } else {
                prioBuf[tempS.length] = parenPrio;
                tempS += s[i];
            }
        }
        s = tempS;

        // Split on operator characters
        const parts = s.split(/([+\-*/^\u0001\u0002\u0003])/);
        let opIdx = 0;
        let maxPrio = 0;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (part.length === 0) {
                // Empty part after split — merge sign with next
                if (i + 1 < parts.length && i + 2 < parts.length) {
                    parts[i + 2] = parts[i + 1] + parts[i + 2];
                    parts[i + 1] = '';
                }
                continue;
            }
            if (part.length === 1 && splitChars.includes(part)) {
                // This is an operator
                const code = operatorCode(part);
                const basePrio = operatorPriority(code);
                const prio = prioBuf[opIdx] + basePrio;
                operators.push({ code, priority: prio });
                if (prio > maxPrio) { maxPrio = prio; }
                opIdx += part.length;
                continue;
            }
            // Operand — restore scientific notation
            let numStr = part
                .replace(/\u0001/g, 'e+')
                .replace(/\u0002/g, 'e-');
            const val = parseFloat(numStr);
            if (isNaN(val)) {
                throw new Error(`Error parsing '${numStr}' as a number.`);
            }
            operands.push(val);
            opIdx += part.length;
        }

        // Evaluate by priority (highest first)
        if (operands.length === 1) { return operands[0]; }
        if (operands.length === 0) { return 0; }

        // Create linked-list-like structure for evaluation
        const vals = operands.slice();
        const redirect: number[] = new Array(vals.length).fill(-1);

        function resolve(idx: number): number {
            while (redirect[idx] >= 0) { idx = redirect[idx]; }
            return idx;
        }

        for (let prio = maxPrio; prio >= 0; prio--) {
            for (let i = 0; i < operators.length; i++) {
                if (operators[i].priority === prio) {
                    const li = resolve(i);
                    const ri = resolve(i + 1);
                    switch (operators[i].code) {
                        case 1: vals[li] += vals[ri]; break;
                        case 2: vals[li] -= vals[ri]; break;
                        case 3: vals[li] *= vals[ri]; break;
                        case 4:
                            if (vals[ri] === 0) { throw new Error('Division by zero'); }
                            vals[li] /= vals[ri];
                            break;
                        case 5: vals[li] = Math.pow(vals[li], vals[ri]); break;
                        case 6: vals[li] = vals[li] % vals[ri]; break;
                    }
                    redirect[ri] = li;
                }
            }
        }

        return vals[resolve(0)];
    }

    // ── Token Navigation Helpers ─────────────────────────────────

    /** Convert a B4X dimension literal to the current variant's coordinate space. */
    private resolveNumberLiteral(value: string): string {
        const lower = value.toLowerCase();
        if (lower.endsWith('dip')) {
            const num = parseFloat(value.substring(0, value.length - 3));
            return formatNumber(num * this.scale);
        }
        if (lower.endsWith('%x')) {
            return formatNumber(parseFloat(value) / 100 * this.currentVariant.width);
        }
        if (lower.endsWith('%y')) {
            return formatNumber(parseFloat(value) / 100 * this.currentVariant.height);
        }
        return value;
    }

    private peekOperator(cursor: Cursor, op: string): boolean {
        const line = this.lines[cursor.line];
        const nextIdx = cursor.token + 1;
        if (nextIdx >= line.length) { return false; }
        const t = line[nextIdx];
        return t.type === TokenType.Operator && t.value === op;
    }

    private consumeOperator(cursor: Cursor, op: string): boolean {
        if (this.peekOperator(cursor, op)) {
            cursor.token++;
            return true;
        }
        return false;
    }

    // ── Node Helpers ─────────────────────────────────────────────

    private getNodeName(node: ControlNode): string {
        return this.getNodeStr(node, 'name', '') || this.getNodeStr(node, 'eventName', '');
    }

    private getNodeStr(node: ControlNode, key: string, def: string): string {
        const v = node.properties.get(key);
        if (!v) { return def; }
        if (v.tag === TypeTag.String || v.tag === TypeTag.StringRef) { return v.value; }
        return def;
    }

    private getNodeBool(node: ControlNode, key: string, def: boolean): boolean {
        const v = node.properties.get(key);
        if (!v) { return def; }
        if (v.tag === TypeTag.Bool) { return v.value; }
        return def;
    }

    private extractNum(v: PropertyValue | undefined, def: number): number {
        if (!v) { return def; }
        if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return v.value; }
        return def;
    }

    private extractMetaType(csType: string): string {
        // csType is like "Dbasic.Designer.MetaButton" → extract "metabutton"
        const dot = csType.lastIndexOf('.');
        return dot >= 0 ? csType.substring(dot + 1).toLowerCase() : csType.toLowerCase();
    }
}

// ══════════════════════════════════════════════════════════════════════
// Utility Functions
// ══════════════════════════════════════════════════════════════════════

function operatorCode(ch: string): number {
    switch (ch) {
        case '+': return 1;
        case '-': return 2;
        case '*': return 3;
        case '/': return 4;
        case '^': return 5;
        case '\u0003': return 6; // mod
        default: return 0;
    }
}

function operatorPriority(code: number): number {
    switch (code) {
        case 1: case 2: return 0; // +, -
        case 3: case 4: case 6: return 1; // *, /, mod
        case 5: return 2; // ^
        default: return -1;
    }
}

function formatNumber(n: number): string {
    if (Number.isInteger(n)) { return String(n); }
    // Use enough precision but strip trailing zeros
    return n.toPrecision(15).replace(/\.?0+$/, '');
}

function isTruthy(s: string): boolean {
    if (!s) { return false; }
    const lower = s.toLowerCase();
    return lower !== 'false' && lower !== '0' && lower !== '';
}
