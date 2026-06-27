/**
 * B4X Designer — Property Grid Webview
 *
 * Renders the property grid inside a VS Code sidebar WebviewView.
 * Receives PropertyData[] from the extension and renders typed editors.
 */

import { ScriptEditor } from './scriptEditor';

// ── VS Code API ──────────────────────────────────────────────────────

interface VsCodeApi {
    postMessage(msg: PropGridToExtMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// ── Message Types ────────────────────────────────────────────────────

interface PropertyData {
    key: string;
    displayName: string;
    category: string;
    description: string;
    editor: string;
    isMergeable: boolean;
    isReadOnly: boolean;
    value: unknown;
    options?: { label: string; value: unknown }[];
    min?: number;
    max?: number;
    step?: number;
    alphaEnabled?: boolean;
}

interface ScriptVariantEntry {
    label: string;
    script: string;
}

type ExtToPropGridMessage =
    | { type: 'loadProperties'; controlName: string; controlCount: number; properties: PropertyData[] }
    | { type: 'clearProperties' }
    | { type: 'loadScriptData'; generalScript: string; variantScripts: ScriptVariantEntry[]; currentVariantIndex: number; controlNames?: string[] }
    | { type: 'scriptError'; error: string }
    | { type: 'scriptSuccess' };

type PropGridToExtMessage =
    | { type: 'propertyChanged'; key: string; value: unknown }
    | { type: 'ready' }
    | { type: 'scriptChanged'; variantIndex: number; text: string }
    | { type: 'runScript' }
    | { type: 'deactivateScript' };

// ── State ────────────────────────────────────────────────────────────

let currentProperties: PropertyData[] = [];
let activeTab: string | null = null;
let rootEl: HTMLDivElement;
let propsArea: HTMLDivElement;

// ── Script editor state ──────────────────────────────────────────────

let scriptGeneralText = '';
let scriptVariantEntries: ScriptVariantEntry[] = [];
let scriptSelectedVariant = -1; // -1 = general
let scriptPanel: HTMLDivElement | null = null;
let scriptEditor: ScriptEditor | null = null;
let scriptSelect: HTMLSelectElement | null = null;
let scriptErrorEl: HTMLDivElement | null = null;

// ── Initialize ───────────────────────────────────────────────────────

function init(): void {
    rootEl = document.getElementById('propgrid-root') as HTMLDivElement;

    // Properties area occupies top portion; script panel sits below
    propsArea = document.createElement('div');
    propsArea.className = 'pg-props-area';
    rootEl.appendChild(propsArea);

    // Create script panel immediately so it's always visible
    ensureScriptPanel();

    // Restore active tab from state
    const state = vscode.getState() as { activeTab?: string } | null;
    if (state?.activeTab) {
        activeTab = state.activeTab;
    }

    renderEmpty();

    // Clicking in the properties area deactivates script mode (snap back)
    propsArea.addEventListener('mousedown', () => {
        vscode.postMessage({ type: 'deactivateScript' });
    });

    window.addEventListener('message', (e: MessageEvent<ExtToPropGridMessage>) => {
        const msg = e.data;
        switch (msg.type) {
            case 'loadProperties':
                currentProperties = msg.properties;
                renderProperties(msg.controlName, msg.controlCount, msg.properties);
                break;
            case 'clearProperties':
                currentProperties = [];
                scriptGeneralText = '';
                scriptVariantEntries = [];
                scriptSelectedVariant = -1;
                renderEmpty();
                renderScriptPanel();
                break;
            case 'loadScriptData':
                scriptGeneralText = msg.generalScript;
                scriptVariantEntries = msg.variantScripts;
                if (msg.controlNames && scriptEditor) {
                    scriptEditor.setControlNames(msg.controlNames);
                }
                renderScriptPanel();
                break;
            case 'scriptError':
                showScriptError(msg.error);
                break;
            case 'scriptSuccess':
                showScriptSuccess();
                break;
        }
    });

    vscode.postMessage({ type: 'ready' });
}

// ── Render: Empty State ──────────────────────────────────────────────

function renderEmpty(): void {
    propsArea.innerHTML = '<div class="pg-empty">No control selected</div>';
}

// ── Render: Property Grid ────────────────────────────────────────────

function renderProperties(controlName: string, controlCount: number, props: PropertyData[]): void {
    propsArea.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'pg-header';
    const title = document.createElement('span');
    title.className = 'pg-title';
    title.textContent = controlCount > 1 ? `${controlCount} controls selected` : controlName;
    header.appendChild(title);
    propsArea.appendChild(header);

    // Group by category
    const categories = new Map<string, PropertyData[]>();
    for (const p of props) {
        let list = categories.get(p.category);
        if (!list) {
            list = [];
            categories.set(p.category, list);
        }
        list.push(p);
    }

    const catNames = Array.from(categories.keys());
    if (catNames.length === 0) { return; }

    // Default to first tab if saved tab doesn't exist in this set
    if (!activeTab || !categories.has(activeTab)) {
        activeTab = catNames[0];
    }

    // Tab bar (vertical stack of tab buttons)
    const tabBar = document.createElement('div');
    tabBar.className = 'pg-tab-bar';

    // Content area
    const content = document.createElement('div');
    content.className = 'pg-tab-content';

    for (const catName of catNames) {
        // Tab button
        const tab = document.createElement('button');
        tab.className = 'pg-tab' + (catName === activeTab ? ' pg-tab-active' : '');
        tab.textContent = catName;
        tab.addEventListener('click', () => {
            activeTab = catName;
            saveState();
            // Update active class on all tabs
            tabBar.querySelectorAll('.pg-tab').forEach(t => t.classList.remove('pg-tab-active'));
            tab.classList.add('pg-tab-active');
            // Show matching panel, hide others
            content.querySelectorAll('.pg-tab-panel').forEach(p => {
                (p as HTMLElement).style.display = (p as HTMLElement).dataset.cat === catName ? '' : 'none';
            });
        });
        tabBar.appendChild(tab);

        // Panel
        const panel = document.createElement('div');
        panel.className = 'pg-tab-panel';
        panel.dataset.cat = catName;
        panel.style.display = catName === activeTab ? '' : 'none';

        const catProps = categories.get(catName)!;
        for (const prop of catProps) {
            panel.appendChild(renderPropertyRow(prop));
        }
        content.appendChild(panel);
    }

    propsArea.appendChild(tabBar);
    propsArea.appendChild(content);
}

// ── Render: Single Property Row ──────────────────────────────────────

function renderPropertyRow(prop: PropertyData): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'pg-row';
    row.title = prop.description;

    const labelEl = document.createElement('label');
    labelEl.className = 'pg-label';
    labelEl.textContent = prop.displayName;
    row.appendChild(labelEl);

    const editorEl = document.createElement('div');
    editorEl.className = 'pg-editor';

    if (prop.isReadOnly) {
        const span = document.createElement('span');
        span.className = 'pg-readonly';
        span.textContent = String(prop.value ?? '');
        editorEl.appendChild(span);
    } else {
        switch (prop.editor) {
            case 'string':
            case 'font':
                editorEl.appendChild(createStringEditor(prop));
                break;
            case 'int':
                editorEl.appendChild(createIntEditor(prop));
                break;
            case 'double':
                editorEl.appendChild(createDoubleEditor(prop));
                break;
            case 'bool':
                editorEl.appendChild(createBoolEditor(prop));
                break;
            case 'color':
            case 'nullableColor':
                editorEl.appendChild(createColorEditor(prop));
                break;
            case 'dropdown':
                editorEl.appendChild(createDropdownEditor(prop));
                break;
            case 'rect':
                editorEl.appendChild(createRectEditor(prop));
                break;
            default:
                editorEl.appendChild(createStringEditor(prop));
                break;
        }
    }

    row.appendChild(editorEl);
    return row;
}

// ── Editors ──────────────────────────────────────────────────────────

function createStringEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pg-input';
    input.value = String(prop.value ?? '');
    input.addEventListener('change', () => {
        sendPropertyChange(prop.key, input.value);
    });
    return input;
}

function createIntEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pg-input pg-input-number';
    input.value = String(prop.value ?? 0);
    input.step = '1';
    if (prop.min !== undefined) { input.min = String(prop.min); }
    if (prop.max !== undefined) { input.max = String(prop.max); }
    input.addEventListener('change', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val)) { val = 0; }
        if (prop.min !== undefined && val < prop.min) { val = prop.min; }
        if (prop.max !== undefined && val > prop.max) { val = prop.max; }
        input.value = String(val);
        sendPropertyChange(prop.key, val);
    });
    return input;
}

function createDoubleEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pg-input pg-input-number';
    input.value = formatDouble(prop.value as number | undefined);
    input.step = String(prop.step ?? 0.1);
    if (prop.min !== undefined) { input.min = String(prop.min); }
    if (prop.max !== undefined) { input.max = String(prop.max); }
    input.addEventListener('change', () => {
        let val = parseFloat(input.value);
        if (isNaN(val)) { val = 0; }
        if (prop.min !== undefined && val < prop.min) { val = prop.min; }
        if (prop.max !== undefined && val > prop.max) { val = prop.max; }
        input.value = formatDouble(val);
        sendPropertyChange(prop.key, val);
    });
    return input;
}

function createBoolEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'pg-checkbox-wrapper';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'pg-checkbox';
    cb.checked = prop.value === true;
    cb.addEventListener('change', () => {
        sendPropertyChange(prop.key, cb.checked);
    });
    wrapper.appendChild(cb);
    return wrapper;
}

function createColorEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pg-color-wrapper';

    const colorVal = prop.value as { a: number; r: number; g: number; b: number } | null;
    const isNullable = prop.editor === 'nullableColor';

    const preview = document.createElement('div');
    preview.className = 'pg-color-preview';
    if (colorVal) {
        preview.style.background = `rgba(${colorVal.r}, ${colorVal.g}, ${colorVal.b}, ${colorVal.a / 255})`;
    } else {
        preview.classList.add('pg-color-none');
    }

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'pg-color-input';
    if (colorVal) {
        input.value = rgbToHex(colorVal.r, colorVal.g, colorVal.b);
    }

    input.addEventListener('input', () => {
        const { r, g, b } = hexToRgb(input.value);
        const a = (prop.alphaEnabled && colorVal) ? colorVal.a : 255;
        preview.style.background = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        preview.classList.remove('pg-color-none');
        sendPropertyChange(prop.key, { a, r, g, b });
    });

    wrapper.appendChild(preview);
    wrapper.appendChild(input);

    if (isNullable) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'pg-color-clear';
        clearBtn.textContent = '×';
        clearBtn.title = 'Reset to default';
        clearBtn.addEventListener('click', () => {
            preview.style.background = '';
            preview.classList.add('pg-color-none');
            sendPropertyChange(prop.key, null);
        });
        wrapper.appendChild(clearBtn);
    }

    return wrapper;
}

function createDropdownEditor(prop: PropertyData): HTMLElement {
    const select = document.createElement('select');
    select.className = 'pg-select';

    if (prop.options) {
        for (const opt of prop.options) {
            const optEl = document.createElement('option');
            optEl.value = String(opt.value);
            optEl.textContent = opt.label;
            if (matchValue(prop.value, opt.value)) {
                optEl.selected = true;
            }
            select.appendChild(optEl);
        }
    }

    select.addEventListener('change', () => {
        const opt = prop.options?.find(o => String(o.value) === select.value);
        sendPropertyChange(prop.key, opt ? opt.value : select.value);
    });

    return select;
}

function createRectEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pg-rect-wrapper';

    const rect = prop.value as { x: number; y: number; width: number; height: number } | null;
    const fields = [
        { label: 'L', key: 'x', value: rect?.x ?? 0 },
        { label: 'T', key: 'y', value: rect?.y ?? 0 },
        { label: 'R', key: 'width', value: rect?.width ?? 0 },
        { label: 'B', key: 'height', value: rect?.height ?? 0 },
    ];

    const state = { x: fields[0].value, y: fields[1].value, width: fields[2].value, height: fields[3].value };

    for (const f of fields) {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'pg-rect-field';

        const labelEl = document.createElement('span');
        labelEl.className = 'pg-rect-label';
        labelEl.textContent = f.label;
        fieldEl.appendChild(labelEl);

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'pg-input pg-input-number pg-rect-input';
        input.value = String(f.value);
        input.step = '1';

        const fieldKey = f.key;
        input.addEventListener('change', () => {
            (state as Record<string, number>)[fieldKey] = parseInt(input.value, 10) || 0;
            sendPropertyChange(prop.key, { ...state });
        });

        fieldEl.appendChild(input);
        wrapper.appendChild(fieldEl);
    }

    return wrapper;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sendPropertyChange(key: string, value: unknown): void {
    vscode.postMessage({ type: 'propertyChanged', key, value });
}

function saveState(): void {
    vscode.setState({ activeTab });
}

function formatDouble(v: number | undefined): string {
    if (v === undefined || v === null) { return '0'; }
    return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function matchValue(a: unknown, b: unknown): boolean {
    if (a === b) { return true; }
    if (a === undefined || a === null || b === undefined || b === null) { return false; }
    return String(a) === String(b);
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) { return { r: 0, g: 0, b: 0 }; }
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// ── Script Editor Panel ──────────────────────────────────────────────

function ensureScriptPanel(): void {
    if (scriptPanel) { return; }

    scriptPanel = document.createElement('div');
    scriptPanel.className = 'pg-script-panel';

    // Header row: "Script" label + variant selector + Run button
    const header = document.createElement('div');
    header.className = 'pg-script-header';

    const label = document.createElement('span');
    label.className = 'pg-script-label';
    label.textContent = 'Script';
    header.appendChild(label);

    scriptSelect = document.createElement('select');
    scriptSelect.className = 'pg-script-select';
    scriptSelect.addEventListener('change', () => {
        saveCurrentScriptText();
        scriptSelectedVariant = parseInt(scriptSelect!.value, 10);
        loadSelectedScriptText();
    });
    header.appendChild(scriptSelect);

    const runBtn = document.createElement('button');
    runBtn.className = 'pg-script-run';
    runBtn.textContent = '\u25B6 Run';
    runBtn.title = 'Execute script for current variant (Ctrl+Enter)';
    runBtn.addEventListener('click', () => {
        saveCurrentScriptText();
        vscode.postMessage({ type: 'runScript' });
    });
    header.appendChild(runBtn);

    scriptPanel.appendChild(header);

    // Error display
    scriptErrorEl = document.createElement('div');
    scriptErrorEl.className = 'pg-script-error';
    scriptErrorEl.style.display = 'none';
    scriptPanel.appendChild(scriptErrorEl);

    // Syntax-highlighted script editor
    scriptEditor = new ScriptEditor(scriptPanel, {
        onChange: (text) => {
            // Save live changes back to the model
            if (scriptSelectedVariant < 0) {
                scriptGeneralText = text;
            } else if (scriptSelectedVariant < scriptVariantEntries.length) {
                scriptVariantEntries[scriptSelectedVariant].script = text;
            }
            vscode.postMessage({
                type: 'scriptChanged',
                variantIndex: scriptSelectedVariant,
                text,
            });
        },
        onRun: () => {
            saveCurrentScriptText();
            vscode.postMessage({ type: 'runScript' });
        },
    });
    scriptEditor.placeholder = 'Designer script...';

    // Append to root (after tab content, persists across tabs)
    rootEl.appendChild(scriptPanel);
}

function renderScriptPanel(): void {
    ensureScriptPanel();
    if (!scriptSelect || !scriptEditor) { return; }

    // Rebuild variant selector options
    scriptSelect.innerHTML = '';

    const generalOpt = document.createElement('option');
    generalOpt.value = '-1';
    generalOpt.textContent = 'General (all variants)';
    scriptSelect.appendChild(generalOpt);

    for (let i = 0; i < scriptVariantEntries.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = scriptVariantEntries[i].label;
        scriptSelect.appendChild(opt);
    }

    scriptSelect.value = String(scriptSelectedVariant);
    loadSelectedScriptText();

    // Clear any previous error
    if (scriptErrorEl) {
        scriptErrorEl.style.display = 'none';
    }
}

function loadSelectedScriptText(): void {
    if (!scriptEditor) { return; }
    if (scriptSelectedVariant < 0) {
        scriptEditor.value = scriptGeneralText;
    } else if (scriptSelectedVariant < scriptVariantEntries.length) {
        scriptEditor.value = scriptVariantEntries[scriptSelectedVariant].script;
    } else {
        scriptEditor.value = '';
    }
}

function saveCurrentScriptText(): void {
    if (!scriptEditor) { return; }
    if (scriptSelectedVariant < 0) {
        scriptGeneralText = scriptEditor.value;
    } else if (scriptSelectedVariant < scriptVariantEntries.length) {
        scriptVariantEntries[scriptSelectedVariant].script = scriptEditor.value;
    }
}

function showScriptError(error: string): void {
    if (!scriptErrorEl) { return; }
    scriptErrorEl.textContent = error;
    scriptErrorEl.className = 'pg-script-error pg-script-error-visible';
    scriptErrorEl.style.display = '';
}

function showScriptSuccess(): void {
    if (!scriptErrorEl) { return; }
    scriptErrorEl.textContent = 'Script executed successfully.';
    scriptErrorEl.className = 'pg-script-error pg-script-success-visible';
    scriptErrorEl.style.display = '';
    setTimeout(() => {
        if (scriptErrorEl) { scriptErrorEl.style.display = 'none'; }
    }, 2000);
}

// ── Bootstrap ────────────────────────────────────────────────────────

init();
