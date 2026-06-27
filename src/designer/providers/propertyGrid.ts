/**
 * B4X Designer — Property Grid View Provider
 *
 * Implements a WebviewViewProvider that renders a property grid
 * in the VS Code sidebar. Communicates with the designer editor
 * via shared event emitters.
 */

import * as vscode from 'vscode';
import {
    PropertyData,
    buildPropertyDataForControl,
    collectControlNames,
    findControlByName,
    readPropertyValue,
    EditorType,
} from '../models/propertyModel';
import { ControlNode, LayoutFile, Platform, TypeTag, PropertyValue, Variant } from '../models/types';

// ── Shared state / event bus ─────────────────────────────────────────

export interface DesignerSession {
    layout: LayoutFile;
    platform: Platform;
    variantIndex: number;
    selectedNames: string[];
}

type SelectionChangeListener = (names: string[]) => void;
type PropertyChangeListener = (controlName: string, key: string, value: unknown) => void;
type LayoutUpdateListener = () => void;
type ScriptChangeListener = (variantIndex: number, text: string) => void;
type ScriptRunListener = () => void;
type ScriptResultListener = (error?: string) => void;
type ScriptDeactivateListener = () => void;

class PropertyGridBus {
    private selectionListeners: SelectionChangeListener[] = [];
    private propertyChangeListeners: PropertyChangeListener[] = [];
    private layoutUpdateListeners: LayoutUpdateListener[] = [];
    private scriptChangeListeners: ScriptChangeListener[] = [];
    private scriptRunListeners: ScriptRunListener[] = [];
    private scriptResultListeners: ScriptResultListener[] = [];
    private scriptDeactivateListeners: ScriptDeactivateListener[] = [];
    private _session: DesignerSession | null = null;

    get session(): DesignerSession | null { return this._session; }
    set session(s: DesignerSession | null) { this._session = s; }

    onSelectionChanged(fn: SelectionChangeListener): vscode.Disposable {
        this.selectionListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.selectionListeners.indexOf(fn);
            if (i >= 0) { this.selectionListeners.splice(i, 1); }
        });
    }

    fireSelectionChanged(names: string[]): void {
        if (this._session) { this._session.selectedNames = names; }
        for (const fn of this.selectionListeners) { fn(names); }
    }

    onPropertyChanged(fn: PropertyChangeListener): vscode.Disposable {
        this.propertyChangeListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.propertyChangeListeners.indexOf(fn);
            if (i >= 0) { this.propertyChangeListeners.splice(i, 1); }
        });
    }

    firePropertyChanged(controlName: string, key: string, value: unknown): void {
        for (const fn of this.propertyChangeListeners) { fn(controlName, key, value); }
    }

    onLayoutUpdated(fn: LayoutUpdateListener): vscode.Disposable {
        this.layoutUpdateListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.layoutUpdateListeners.indexOf(fn);
            if (i >= 0) { this.layoutUpdateListeners.splice(i, 1); }
        });
    }

    fireLayoutUpdated(): void {
        for (const fn of this.layoutUpdateListeners) { fn(); }
    }

    onScriptChanged(fn: ScriptChangeListener): vscode.Disposable {
        this.scriptChangeListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.scriptChangeListeners.indexOf(fn);
            if (i >= 0) { this.scriptChangeListeners.splice(i, 1); }
        });
    }

    fireScriptChanged(variantIndex: number, text: string): void {
        for (const fn of this.scriptChangeListeners) { fn(variantIndex, text); }
    }

    onScriptRun(fn: ScriptRunListener): vscode.Disposable {
        this.scriptRunListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.scriptRunListeners.indexOf(fn);
            if (i >= 0) { this.scriptRunListeners.splice(i, 1); }
        });
    }

    fireScriptRun(): void {
        for (const fn of this.scriptRunListeners) { fn(); }
    }

    onScriptResult(fn: ScriptResultListener): vscode.Disposable {
        this.scriptResultListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.scriptResultListeners.indexOf(fn);
            if (i >= 0) { this.scriptResultListeners.splice(i, 1); }
        });
    }

    fireScriptResult(error?: string): void {
        for (const fn of this.scriptResultListeners) { fn(error); }
    }

    onScriptDeactivate(fn: ScriptDeactivateListener): vscode.Disposable {
        this.scriptDeactivateListeners.push(fn);
        return new vscode.Disposable(() => {
            const i = this.scriptDeactivateListeners.indexOf(fn);
            if (i >= 0) { this.scriptDeactivateListeners.splice(i, 1); }
        });
    }

    fireScriptDeactivate(): void {
        for (const fn of this.scriptDeactivateListeners) { fn(); }
    }
}

/** Singleton event bus shared between editor provider and property grid provider. */
export const propertyGridBus = new PropertyGridBus();

// ── Property Grid Webview View Provider ──────────────────────────────

export class B4XPropertyGridViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'b4x.propertyGrid';

    private view: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {
        // Listen for selection changes from the designer editor
        this.disposables.push(
            propertyGridBus.onSelectionChanged(names => {
                this.updateSelection(names);
            })
        );

        // Listen for layout updates (e.g. after drag/resize on canvas)
        this.disposables.push(
            propertyGridBus.onLayoutUpdated(() => {
                const session = propertyGridBus.session;
                if (session) {
                    this.updateSelection(session.selectedNames);
                    this.sendScriptData();
                }
            })
        );

        // Listen for script execution results
        this.disposables.push(
            propertyGridBus.onScriptResult((error) => {
                if (error) {
                    this.sendScriptError(error);
                } else {
                    this.sendScriptSuccess();
                }
            })
        );
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
            ],
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            msg => this.handleMessage(msg),
            undefined,
            this.disposables,
        );

        webviewView.onDidDispose(() => {
            this.view = undefined;
        });

        // If there's already a selection, send it
        const session = propertyGridBus.session;
        if (session && session.selectedNames.length > 0) {
            // Defer to let webview initialize
            setTimeout(() => this.updateSelection(session.selectedNames), 100);
        }
    }

    // ── Send property data to webview ────────────────────────────

    private updateSelection(names: string[]): void {
        if (!this.view) { return; }
        const session = propertyGridBus.session;
        if (!session) {
            this.view.webview.postMessage({ type: 'clearProperties' });
            return;
        }

        if (names.length === 0) {
            this.view.webview.postMessage({ type: 'clearProperties' });
            return;
        }

        if (names.length === 1) {
            // Single selection
            const controlName = names[0];
            const node = findControlByName(session.layout.rootControl, controlName);
            if (!node) {
                this.view.webview.postMessage({ type: 'clearProperties' });
                return;
            }

            const allNames = collectControlNames(session.layout.rootControl);
            const isRoot = controlName === allNames[0]; // First name is root
            const properties = buildPropertyDataForControl(
                node,
                session.platform,
                allNames,
                isRoot,
                session.variantIndex,
            );

            this.view.webview.postMessage({
                type: 'loadProperties',
                controlName,
                controlCount: 1,
                properties,
            });
        } else {
            // Multi-selection: merge properties
            const allNames = collectControlNames(session.layout.rootControl);
            const nodes: { name: string; node: ControlNode }[] = [];
            for (const name of names) {
                const node = findControlByName(session.layout.rootControl, name);
                if (node) { nodes.push({ name, node }); }
            }
            if (nodes.length === 0) {
                this.view.webview.postMessage({ type: 'clearProperties' });
                return;
            }

            // Build property sets for each selected control
            const propSets = nodes.map(({ node }) =>
                buildPropertyDataForControl(node, session.platform, allNames, false, session.variantIndex)
            );

            // Merge: keep only properties that exist in all selections and are mergeable
            const merged = mergePropertySets(propSets, nodes.map(n => n.node), session.variantIndex);

            this.view.webview.postMessage({
                type: 'loadProperties',
                controlName: `${names.length} controls selected`,
                controlCount: names.length,
                properties: merged,
            });
        }
    }

    // ── Handle messages from the property grid webview ────────────

    private handleMessage(msg: { type: string; key?: string; value?: unknown; variantIndex?: number; text?: string }): void {
        if (msg.type === 'propertyChanged' && msg.key !== undefined) {
            const session = propertyGridBus.session;
            if (!session) { return; }

            for (let i = 0; i < session.selectedNames.length; i++) {
                const name = session.selectedNames[i];
                const node = findControlByName(session.layout.rootControl, name);
                if (node) {
                    applyPropertyValue(node, msg.key, msg.value, session.variantIndex);

                    // When 'name' changes, also auto-populate eventName
                    if (msg.key === 'name' && typeof msg.value === 'string') {
                        applyPropertyValue(node, 'eventName', msg.value, session.variantIndex);
                        // Update selectedNames to track the new name
                        session.selectedNames[i] = msg.value;
                    }
                }
                propertyGridBus.firePropertyChanged(name, msg.key, msg.value);
            }

            // Refresh the property grid with updated values
            this.updateSelection(session.selectedNames);
        } else if (msg.type === 'scriptChanged' && msg.variantIndex !== undefined && msg.text !== undefined) {
            const session = propertyGridBus.session;
            if (!session || !session.layout.scriptData) { return; }

            if (msg.variantIndex < 0) {
                // General script
                session.layout.scriptData.mainScript = msg.text;
            } else if (msg.variantIndex < session.layout.scriptData.variantScripts.length) {
                session.layout.scriptData.variantScripts[msg.variantIndex].script = msg.text;
            }
            // Clear raw bytes since the script was modified
            session.layout.scriptData.rawCompressedBytes = undefined;
            propertyGridBus.fireScriptChanged(msg.variantIndex, msg.text);
        } else if (msg.type === 'runScript') {
            propertyGridBus.fireScriptRun();
        } else if (msg.type === 'deactivateScript') {
            propertyGridBus.fireScriptDeactivate();
        } else if (msg.type === 'ready') {
            const session = propertyGridBus.session;
            if (session && session.selectedNames.length > 0) {
                this.updateSelection(session.selectedNames);
            }
            this.sendScriptData();
        }
    }

    // ── Send script data to webview ──────────────────────────────

    sendScriptData(): void {
        if (!this.view) { return; }
        const session = propertyGridBus.session;
        if (!session) { return; }

        const layout = session.layout;
        if (!layout.scriptData) {
            // Create empty script data
            layout.scriptData = {
                mainScript: '',
                variantScripts: layout.variants.map(v => ({
                    variant: { scale: v.scale, width: v.width, height: v.height },
                    script: '',
                })),
            };
        }

        // Ensure we have variant scripts for all variants
        while (layout.scriptData.variantScripts.length < layout.variants.length) {
            const v = layout.variants[layout.scriptData.variantScripts.length];
            layout.scriptData.variantScripts.push({
                variant: { scale: v.scale, width: v.width, height: v.height },
                script: '',
            });
        }

        const variantScripts = layout.scriptData.variantScripts.map((vs, i) => ({
            label: `Variant ${i}: ${vs.variant.width}×${vs.variant.height} @${vs.variant.scale}`,
            script: vs.script,
        }));

        this.view.webview.postMessage({
            type: 'loadScriptData',
            generalScript: layout.scriptData.mainScript,
            variantScripts,
            currentVariantIndex: session.variantIndex,
            controlNames: collectControlNames(layout.rootControl),
        });
    }

    /** Send script execution error to the webview. */
    sendScriptError(error: string): void {
        if (!this.view) { return; }
        this.view.webview.postMessage({ type: 'scriptError', error });
    }

    /** Send script success notification to the webview. */
    sendScriptSuccess(): void {
        if (!this.view) { return; }
        this.view.webview.postMessage({ type: 'scriptSuccess' });
    }

    // ── HTML ─────────────────────────────────────────────────────

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'propgrid.js')
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'propgrid.css')
        );

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>Properties</title>
</head>
<body>
    <div id="propgrid-root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    dispose(): void {
        for (const d of this.disposables) { d.dispose(); }
    }
}

// ── Merge multi-selection property sets ──────────────────────────────

function mergePropertySets(
    propSets: PropertyData[][],
    nodes: ControlNode[],
    variantIndex: number,
): PropertyData[] {
    if (propSets.length === 0) { return []; }

    // Start with the first set, keep only properties present in all sets
    const first = propSets[0];
    const merged: PropertyData[] = [];

    for (const prop of first) {
        if (!prop.isMergeable) { continue; }

        // Check that this property exists in all other sets
        const allHave = propSets.every(set => set.some(p => p.key === prop.key));
        if (!allHave) { continue; }

        // For value: if all values are the same show it, otherwise show empty/mixed
        const values = propSets.map(set => {
            const p = set.find(p => p.key === prop.key);
            return p?.value;
        });

        const allSame = values.every(v => JSON.stringify(v) === JSON.stringify(values[0]));

        merged.push({
            ...prop,
            value: allSame ? values[0] : undefined,
        });
    }

    return merged;
}

// ── Apply a property value change to a ControlNode ───────────────────

function applyPropertyValue(
    node: ControlNode,
    key: string,
    value: unknown,
    variantIndex: number,
): void {
    // Position/size properties go into the variant data
    if (key === 'left' || key === 'top' || key === 'width' || key === 'height' || key === 'hanchor' || key === 'vanchor') {
        applyVariantProperty(node, key, value as number, variantIndex);
        return;
    }

    if (value === null || value === undefined) {
        node.properties.delete(key);
        return;
    }

    if (typeof value === 'string') {
        node.properties.set(key, { tag: TypeTag.String, value });
    } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            node.properties.set(key, { tag: TypeTag.Int32, value });
        } else {
            node.properties.set(key, { tag: TypeTag.Float, value });
        }
    } else if (typeof value === 'boolean') {
        node.properties.set(key, { tag: TypeTag.Bool, value });
    } else if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
        const c = value as { a: number; r: number; g: number; b: number };
        node.properties.set(key, { tag: TypeTag.Color, a: c.a, r: c.r, g: c.g, b: c.b });
    } else if (typeof value === 'object' && 'x' in value && 'y' in value && 'width' in value && 'height' in value) {
        const r = value as { x: number; y: number; width: number; height: number };
        node.properties.set(key, { tag: TypeTag.Int32Rect, x: r.x, y: r.y, width: r.width, height: r.height });
    }
}

function applyVariantProperty(node: ControlNode, key: string, value: number, variantIndex: number): void {
    const variantKey = `variant${variantIndex}`;
    let variantObj = node.properties.get(variantKey);

    if (!variantObj || variantObj.tag !== TypeTag.Object) {
        // Create variant object if it doesn't exist
        variantObj = { tag: TypeTag.Object, value: new Map<string, PropertyValue>() };
        node.properties.set(variantKey, variantObj);
    }

    if (variantObj.tag === TypeTag.Object) {
        const intValue = Math.round(value);
        variantObj.value.set(key, { tag: TypeTag.Int32, value: intValue });
    }

    // Also update the direct property for variant 0
    if (variantIndex === 0) {
        const intValue = Math.round(value);
        node.properties.set(key, { tag: TypeTag.Int32, value: intValue });
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
