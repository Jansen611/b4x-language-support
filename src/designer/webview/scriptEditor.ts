/**
 * B4X Designer Script — Syntax-Highlighted Editor Component
 *
 * A lightweight code editor for designer scripts that uses the
 * textarea + <pre> overlay technique. No external dependencies.
 *
 * Features:
 *  - Live syntax highlighting (keywords, builtins, strings, numbers, comments)
 *  - Autocomplete for control names, properties, builtins, keywords, _c functions
 *  - VS Code theme-aware colors via --vscode-* CSS variables
 *  - Tab key inserts a real tab character
 *  - Undo/redo via Ctrl+Z / Ctrl+Y
 */

import {
    tokenizeLine, tokenClass,
    KEYWORDS, BUILTINS,
    CONTROL_PROPERTIES, C_NAMESPACE_FUNCTIONS,
    MODULE_METHODS,
    ScriptToken,
} from './scriptTokenizer';

// ── Types ────────────────────────────────────────────────────────────

export interface ScriptEditorOptions {
    /** Called when the user changes the text. */
    onChange?: (text: string) => void;
    /** Called when the user presses Ctrl+Enter (run script). */
    onRun?: () => void;
}

interface CompletionItem {
    label: string;
    kind: 'control' | 'property' | 'keyword' | 'builtin' | 'function';
    insertText?: string;
}

interface UndoEntry {
    text: string;
    selStart: number;
    selEnd: number;
}

// ── Editor Class ─────────────────────────────────────────────────────

export class ScriptEditor {
    private container: HTMLDivElement;
    private scroller: HTMLDivElement;
    private textarea: HTMLTextAreaElement;
    private backdrop: HTMLPreElement;
    private acPanel: HTMLDivElement;
    private options: ScriptEditorOptions;
    private resizeObserver: ResizeObserver;

    /** Known control names (set from extension). */
    private controlNames: string[] = [];
    /** Lowercased set for quick checking. */
    private controlNamesLower = new Set<string>();

    private acItems: CompletionItem[] = [];
    private acFiltered: CompletionItem[] = [];
    private acSelectedIndex = -1;
    private acVisible = false;
    /** The prefix text being completed ('controlName.' or partial identifier). */
    private acPrefix = '';
    /** Whether the current completion is a property list (after dot). */
    private acIsDot = false;

    /** Undo/redo stacks. */
    private undoStack: UndoEntry[] = [];
    private redoStack: UndoEntry[] = [];
    private lastPushedText = '';
    /** Suppress pushing to undo inside programmatic changes. */
    private suppressUndo = false;

    constructor(parent: HTMLElement, options: ScriptEditorOptions = {}) {
        this.options = options;

        // Outer container — fills parent, establishes stacking context
        this.container = document.createElement('div');
        this.container.className = 'se-container';

        // Scroll wrapper — clips and scrolls both layers together
        this.scroller = document.createElement('div');
        this.scroller.className = 'se-scroller';
        this.container.appendChild(this.scroller);

        // Backdrop <pre> — rendered highlighted HTML (behind textarea)
        this.backdrop = document.createElement('pre');
        this.backdrop.className = 'se-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');
        this.scroller.appendChild(this.backdrop);

        // Textarea — user edits here, text is transparent, caret visible
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'se-textarea';
        this.textarea.spellcheck = false;
        this.textarea.autocapitalize = 'off';
        this.textarea.setAttribute('autocorrect', 'off');
        this.textarea.wrap = 'off';
        this.scroller.appendChild(this.textarea);

        // Autocomplete dropdown (inside outer container, above scroller)
        this.acPanel = document.createElement('div');
        this.acPanel.className = 'se-autocomplete';
        this.acPanel.style.display = 'none';
        this.container.appendChild(this.acPanel);

        // Events
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('scroll', () => this.syncScroll());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('blur', () => {
            // Delay hiding so click on autocomplete item works
            setTimeout(() => this.hideAutocomplete(), 150);
        });

        parent.appendChild(this.container);

        this.resizeObserver = new ResizeObserver(() => this.syncScroll());
        this.resizeObserver.observe(this.textarea);

        // Initial highlight
        this.rehighlight();
    }

    // ── Public API ───────────────────────────────────────────────

    /** Get the current script text. */
    get value(): string {
        return this.textarea.value;
    }

    /** Set the script text and re-highlight. Clears undo history. */
    set value(text: string) {
        this.textarea.value = text;
        this.undoStack = [];
        this.redoStack = [];
        this.lastPushedText = text;
        this.rehighlight();
    }

    /** Update the list of known control names (for autocomplete). */
    setControlNames(names: string[]): void {
        this.controlNames = names;
        this.controlNamesLower = new Set(names.map(n => n.toLowerCase()));
        this.rehighlight();
    }

    /** Set read-only mode. */
    set readOnly(val: boolean) {
        this.textarea.readOnly = val;
    }

    get readOnly(): boolean {
        return this.textarea.readOnly;
    }

    /** Set placeholder text. */
    set placeholder(text: string) {
        this.textarea.placeholder = text;
    }

    /** Focus the editor. */
    focus(): void {
        this.textarea.focus();
    }

    /** Destroy the editor, removing DOM elements. */
    dispose(): void {
        this.resizeObserver.disconnect();
        this.container.remove();
    }

    // ── Syntax Highlighting ──────────────────────────────────────

    private rehighlight(): void {
        const text = this.textarea.value;
        const lines = text.split('\n');
        const parts: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (i > 0) { parts.push('\n'); }
            const rawLine = lines[i];
            if (rawLine.length === 0) { continue; }

            const tokens = tokenizeLine(rawLine);
            let pos = 0;

            for (const tok of tokens) {
                // Emit plain text before this token
                if (tok.col > pos) {
                    parts.push(escapeHtml(rawLine.substring(pos, tok.col)));
                }
                // Emit highlighted span
                const raw = rawLine.substring(tok.col, tok.col + tok.rawLen);

                // For identifiers, check if it's a known control name — use special class
                if (tok.type === 'identifier' && this.controlNamesLower.has(tok.value.toLowerCase())) {
                    parts.push(`<span class="se-ctrl">${escapeHtml(raw)}</span>`);
                } else {
                    parts.push(`<span class="${tokenClass(tok.type)}">${escapeHtml(raw)}</span>`);
                }
                pos = tok.col + tok.rawLen;
            }
            // Trailing text
            if (pos < rawLine.length) {
                parts.push(escapeHtml(rawLine.substring(pos)));
            }
        }

        this.backdrop.innerHTML = parts.join('');
        this.syncScroll();
    }

    private syncScroll(): void {
        // The textarea owns the native caret, selection and scroll range. Size
        // the highlight layer from that exact range and translate it rather
        // than relying on a second, independently calculated scroll range.
        this.backdrop.style.width = `${Math.max(this.textarea.scrollWidth, this.textarea.clientWidth)}px`;
        this.backdrop.style.height = `${Math.max(this.textarea.scrollHeight, this.textarea.clientHeight)}px`;
        this.backdrop.style.transform = `translate(${-this.textarea.scrollLeft}px, ${-this.textarea.scrollTop}px)`;
    }

    // ── Undo / Redo ──────────────────────────────────────────────

    private pushUndo(): void {
        if (this.suppressUndo) { return; }
        const text = this.textarea.value;
        if (text === this.lastPushedText) { return; }
        this.undoStack.push({
            text: this.lastPushedText,
            selStart: this.textarea.selectionStart,
            selEnd: this.textarea.selectionEnd,
        });
        if (this.undoStack.length > 200) { this.undoStack.shift(); }
        this.redoStack = [];
        this.lastPushedText = text;
    }

    private undo(): void {
        if (this.undoStack.length === 0) { return; }
        this.redoStack.push({
            text: this.textarea.value,
            selStart: this.textarea.selectionStart,
            selEnd: this.textarea.selectionEnd,
        });
        const entry = this.undoStack.pop()!;
        this.suppressUndo = true;
        this.textarea.value = entry.text;
        this.textarea.selectionStart = entry.selStart;
        this.textarea.selectionEnd = entry.selEnd;
        this.lastPushedText = entry.text;
        this.suppressUndo = false;
        this.rehighlight();
        this.options.onChange?.(this.textarea.value);
    }

    private redo(): void {
        if (this.redoStack.length === 0) { return; }
        this.undoStack.push({
            text: this.textarea.value,
            selStart: this.textarea.selectionStart,
            selEnd: this.textarea.selectionEnd,
        });
        const entry = this.redoStack.pop()!;
        this.suppressUndo = true;
        this.textarea.value = entry.text;
        this.textarea.selectionStart = entry.selStart;
        this.textarea.selectionEnd = entry.selEnd;
        this.lastPushedText = entry.text;
        this.suppressUndo = false;
        this.rehighlight();
        this.options.onChange?.(this.textarea.value);
    }

    // ── Input Handling ───────────────────────────────────────────

    private onInput(): void {
        this.pushUndo();
        this.rehighlight();
        this.options.onChange?.(this.textarea.value);
        this.tryAutocomplete();
    }

    private onKeyDown(e: KeyboardEvent): void {
        // Undo: Ctrl+Z
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
        }
        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
            (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
            e.preventDefault();
            this.redo();
            return;
        }

        // Tab key: insert tab character
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !this.acVisible) {
            e.preventDefault();
            this.insertAtCursor('\t');
            return;
        }

        // Ctrl+Enter: run script
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.options.onRun?.();
            return;
        }

        // Ctrl+Space: force autocomplete
        if (e.key === ' ' && e.ctrlKey) {
            e.preventDefault();
            this.tryAutocomplete(true);
            return;
        }

        // Autocomplete navigation
        if (this.acVisible) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.acSelectNext(1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.acSelectNext(-1);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                if (this.acSelectedIndex >= 0 && this.acSelectedIndex < this.acFiltered.length) {
                    e.preventDefault();
                    this.acAccept(this.acFiltered[this.acSelectedIndex]);
                    return;
                }
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.hideAutocomplete();
                return;
            }
        }
    }

    private insertAtCursor(text: string): void {
        const ta = this.textarea;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        this.pushUndo();
        const before = ta.value.substring(0, start);
        const after = ta.value.substring(end);
        ta.value = before + text + after;
        ta.selectionStart = ta.selectionEnd = start + text.length;
        this.lastPushedText = ta.value;
        this.redoStack = [];
        this.rehighlight();
        this.options.onChange?.(ta.value);
    }

    // ── Autocomplete ─────────────────────────────────────────────

    private tryAutocomplete(force = false): void {
        const ta = this.textarea;
        const cursorPos = ta.selectionStart;
        const textBefore = ta.value.substring(0, cursorPos);

        // Find the current line text before cursor
        const lineStart = textBefore.lastIndexOf('\n') + 1;
        const lineBefore = textBefore.substring(lineStart);

        // Check for dot completion: identifier.
        const dotMatch = lineBefore.match(/(\w+)\.(\w*)$/);
        if (dotMatch) {
            const objName = dotMatch[1].toLowerCase();
            const partial = dotMatch[2].toLowerCase();

            if (objName === '_c') {
                // _c namespace functions
                this.acIsDot = true;
                this.acPrefix = dotMatch[2];
                this.acItems = C_NAMESPACE_FUNCTIONS.map(f => ({
                    label: f,
                    kind: 'function' as const,
                    insertText: f + '(',
                }));
            } else if (this.findModuleMethods(objName)) {
                // Module methods (DesignerMethods, CommonUIMethods, etc.)
                this.acIsDot = true;
                this.acPrefix = dotMatch[2];
                this.acItems = this.findModuleMethods(objName)!.map(m => ({
                    label: m,
                    kind: 'function' as const,
                    insertText: m + '(',
                }));
            } else if (this.controlNamesLower.has(objName)) {
                // Control properties
                this.acIsDot = true;
                this.acPrefix = dotMatch[2];
                this.acItems = CONTROL_PROPERTIES.map(p => ({
                    label: p,
                    kind: 'property' as const,
                }));
            } else {
                this.hideAutocomplete();
                return;
            }

            this.acFiltered = this.acItems.filter(
                item => item.label.toLowerCase().startsWith(partial)
            );

            if (this.acFiltered.length > 0) {
                this.showAutocomplete();
            } else {
                this.hideAutocomplete();
            }
            return;
        }

        // Check for identifier completion
        const identMatch = lineBefore.match(/(\w+)$/);
        if (identMatch && (identMatch[1].length >= 2 || force)) {
            const partial = identMatch[1].toLowerCase();
            this.acIsDot = false;
            this.acPrefix = identMatch[1];

            // Build items list
            this.acItems = [];

            // Control names
            for (const name of this.controlNames) {
                this.acItems.push({ label: name, kind: 'control' });
            }

            // Builtins
            for (const b of BUILTINS) {
                // Capitalize first letter for display
                const display = b.charAt(0).toUpperCase() + b.slice(1);
                this.acItems.push({ label: display, kind: 'builtin' });
            }

            // _c namespace
            this.acItems.push({ label: '_c', kind: 'function', insertText: '_c.' });

            // Module names (DesignerMethods, CommonUIMethods, etc.)
            for (const modName of Object.keys(MODULE_METHODS)) {
                this.acItems.push({ label: modName, kind: 'function', insertText: modName + '.' });
            }

            // Keywords
            for (const kw of KEYWORDS) {
                if (kw.includes(' ')) { continue; } // skip compound keywords
                const display = kw.charAt(0).toUpperCase() + kw.slice(1);
                this.acItems.push({ label: display, kind: 'keyword' });
            }

            // Variables found in current script
            const vars = this.extractVariables();
            for (const v of vars) {
                if (!this.acItems.some(i => i.label.toLowerCase() === v.toLowerCase())) {
                    this.acItems.push({ label: v, kind: 'keyword' });
                }
            }

            this.acFiltered = this.acItems.filter(
                item => item.label.toLowerCase().startsWith(partial)
                    && item.label.toLowerCase() !== partial
            );

            if (this.acFiltered.length > 0 || force) {
                this.showAutocomplete();
            } else {
                this.hideAutocomplete();
            }
            return;
        }

        // Force trigger with empty prefix
        if (force) {
            this.acIsDot = false;
            this.acPrefix = '';
            this.acItems = [];
            for (const name of this.controlNames) {
                this.acItems.push({ label: name, kind: 'control' });
            }
            for (const b of BUILTINS) {
                const display = b.charAt(0).toUpperCase() + b.slice(1);
                this.acItems.push({ label: display, kind: 'builtin' });
            }
            this.acItems.push({ label: '_c', kind: 'function', insertText: '_c.' });
            for (const modName of Object.keys(MODULE_METHODS)) {
                this.acItems.push({ label: modName, kind: 'function', insertText: modName + '.' });
            }
            this.acFiltered = this.acItems;
            this.showAutocomplete();
            return;
        }

        this.hideAutocomplete();
    }

    /** Look up methods for a module name (case-insensitive). Returns null if not a module. */
    private findModuleMethods(lowerName: string): string[] | null {
        for (const [modName, methods] of Object.entries(MODULE_METHODS)) {
            if (modName.toLowerCase() === lowerName) { return methods; }
        }
        return null;
    }

    /** Extract variable names from `varName = expr` patterns in the script. */
    private extractVariables(): string[] {
        const vars = new Set<string>();
        const lines = this.textarea.value.split('\n');
        for (const line of lines) {
            const m = line.match(/^\s*(\w+)\s*=/);
            if (m) {
                const name = m[1];
                const lower = name.toLowerCase();
                // Exclude control names and builtins
                if (!this.controlNamesLower.has(lower) && !BUILTINS.has(lower) && !KEYWORDS.has(lower)) {
                    vars.add(name);
                }
            }
        }
        return Array.from(vars);
    }

    private showAutocomplete(): void {
        this.acVisible = true;
        this.acSelectedIndex = 0;
        this.renderAutocomplete();
        this.positionAutocomplete();
        this.acPanel.style.display = '';
    }

    private hideAutocomplete(): void {
        this.acVisible = false;
        this.acPanel.style.display = 'none';
        this.acItems = [];
        this.acFiltered = [];
    }

    private renderAutocomplete(): void {
        this.acPanel.innerHTML = '';
        for (let i = 0; i < this.acFiltered.length && i < 12; i++) {
            const item = this.acFiltered[i];
            const row = document.createElement('div');
            row.className = 'se-ac-item' + (i === this.acSelectedIndex ? ' se-ac-selected' : '');

            // Icon
            const icon = document.createElement('span');
            icon.className = 'se-ac-icon se-ac-icon-' + item.kind;
            icon.textContent = kindIcon(item.kind);
            row.appendChild(icon);

            // Label
            const label = document.createElement('span');
            label.className = 'se-ac-label';
            label.textContent = item.label;
            row.appendChild(label);

            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.acAccept(item);
            });

            this.acPanel.appendChild(row);
        }
    }

    private positionAutocomplete(): void {
        // Position below the caret using a mirror measurement
        const ta = this.textarea;
        const pos = ta.selectionStart;
        const textBefore = ta.value.substring(0, pos);
        const lines = textBefore.split('\n');
        const lineIdx = lines.length - 1;
        const colIdx = lines[lineIdx].length;

        // Approximate position (monospace assumption)
        const style = getComputedStyle(ta);
        const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.4);
        const charWidth = measureCharWidth(ta);

        const padTop = parseFloat(style.paddingTop) || 0;
        const padLeft = parseFloat(style.paddingLeft) || 0;

        const top = padTop + (lineIdx + 1) * lineHeight - ta.scrollTop;
        const left = padLeft + colIdx * charWidth - ta.scrollLeft;

        this.acPanel.style.top = `${Math.max(0, top)}px`;
        this.acPanel.style.left = `${Math.max(0, Math.min(left, ta.clientWidth - 180))}px`;
    }

    private acSelectNext(delta: number): void {
        if (this.acFiltered.length === 0) { return; }
        this.acSelectedIndex = (this.acSelectedIndex + delta + this.acFiltered.length) % this.acFiltered.length;
        this.renderAutocomplete();
    }

    private acAccept(item: CompletionItem): void {
        const ta = this.textarea;
        const cursorPos = ta.selectionStart;
        const prefixLen = this.acPrefix.length;
        const insertText = item.insertText ?? item.label;

        this.pushUndo();
        const before = ta.value.substring(0, cursorPos - prefixLen);
        const after = ta.value.substring(cursorPos);
        ta.value = before + insertText + after;
        ta.selectionStart = ta.selectionEnd = before.length + insertText.length;
        this.lastPushedText = ta.value;
        this.redoStack = [];

        this.hideAutocomplete();
        this.rehighlight();
        this.options.onChange?.(ta.value);
        ta.focus();
    }
}

// ── Utility Functions ────────────────────────────────────────────────

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function kindIcon(kind: string): string {
    switch (kind) {
        case 'control':  return '\u25A1'; // □
        case 'property': return '\u25CB'; // ○
        case 'keyword':  return '\u25C7'; // ◇
        case 'builtin':  return '\u25B3'; // △
        case 'function': return '\u0192'; // ƒ
        default:         return '\u00B7'; // ·
    }
}

let cachedCharWidth: number | null = null;
function measureCharWidth(ta: HTMLTextAreaElement): number {
    if (cachedCharWidth !== null) { return cachedCharWidth; }
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    const style = getComputedStyle(ta);
    span.style.fontFamily = style.fontFamily;
    span.style.fontSize = style.fontSize;
    span.textContent = 'MMMMMMMMMM';
    document.body.appendChild(span);
    cachedCharWidth = span.offsetWidth / 10;
    document.body.removeChild(span);
    return cachedCharWidth;
}
