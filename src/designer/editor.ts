import * as vscode from 'vscode';
import * as path from 'path';
import {
    parseLayoutFile, LayoutFile, ControlNode, TypeTag, PropertyValue,
    propertyGridBus, collectControlNames, findControlByName,
    createControl, getControlTypesForPlatform, collectManifestEntries,
    Platform, writeLayoutFile, getControlTypeByCsType, generateControlName,
    deepCloneControlNode,
} from './index';
import { ScriptEngine } from './services/scriptEngine';
import {
    addVariant, removeVariant, getPredefinedLayouts, formatVariant,
    PredefinedLayout,
} from './services/variantManager';
import {
    getCustomViewNames, getCustomViewDef, invalidateLibraryCache, CustomViewDef,
} from './services/libraryLoader';
import { createCustomViewControl } from './services/controlRegistry';
import { generateDim, generateEventSub, viewCode } from './codeGen';

const LAYOUT_EXTENSIONS: Record<string, string> = {
    '.bil': 'B4i',
    '.bjl': 'B4J',
    '.bal': 'B4A'
};

// ── Webview message protocol types (must match src/webview/shared.ts) ─

interface WebviewLayout {
    gridSize: number;
    variant: { scale: number; width: number; height: number };
    variantIndex: number;
    variants: { scale: number; width: number; height: number }[];
    predefinedLayouts: { label: string; width: number; height: number; scale: number }[];
    platform: 'B4A' | 'B4i' | 'B4J';
    availableControlTypes: string[];
    customViewTypes: string[];
    root: WebviewControl;
}

interface WebviewControl {
    name: string;
    typeName: string;
    left: number;
    top: number;
    width: number;
    height: number;
    hanchor: number;
    vanchor: number;
    isRoot: boolean;
    children: WebviewControl[];
}

// ── Helper: extract typed property value ──────────────────────────────

function getPropInt(node: ControlNode, key: string, def: number): number {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return v.value; }
    return def;
}

function getPropStr(node: ControlNode, key: string, def: string): string {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.String || v.tag === TypeTag.StringRef) { return v.value; }
    return def;
}

function getPropFloat(node: ControlNode, key: string, def: number): number {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.Float || v.tag === TypeTag.Double || v.tag === TypeTag.Int32) { return v.value; }
    return def;
}

// ── Convert parsed ControlNode → WebviewControl for per-variant display ──

function getVariantData(
    node: ControlNode,
    variantIndex: number,
): { left: number; top: number; width: number; height: number; hanchor: number; vanchor: number } {
    // Per-variant position is stored in "variantN" property (e.g. "variant0")
    const variantKey = `variant${variantIndex}`;
    const variantObj = node.properties.get(variantKey);

    // Default anchor values from direct properties
    const defaultHanchor = extractNumber(node.properties.get('hanchor'), 0);
    const defaultVanchor = extractNumber(node.properties.get('vanchor'), 0);

    if (variantObj && variantObj.tag === TypeTag.Object) {
        const m = variantObj.value;
        // Anchor values can differ per-variant — prefer variant's values over direct props
        const varHanchor = extractNumber(m.get('hanchor'), -1);
        const varVanchor = extractNumber(m.get('vanchor'), -1);
        return {
            left: extractNumber(m.get('left'), 0),
            top: extractNumber(m.get('top'), 0),
            width: extractNumber(m.get('width'), 100),
            height: extractNumber(m.get('height'), 50),
            hanchor: varHanchor >= 0 ? varHanchor : defaultHanchor,
            vanchor: varVanchor >= 0 ? varVanchor : defaultVanchor,
        };
    }

    // Fall back to direct properties
    return {
        left: extractNumber(node.properties.get('left'), 0),
        top: extractNumber(node.properties.get('top'), 0),
        width: extractNumber(node.properties.get('width'), 100),
        height: extractNumber(node.properties.get('height'), 50),
        hanchor: defaultHanchor,
        vanchor: defaultVanchor,
    };
}

function extractNumber(v: PropertyValue | undefined, def: number): number {
    if (!v) { return def; }
    if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return v.value; }
    return def;
}

function controlNodeToWebview(
    node: ControlNode,
    variantIndex: number,
    isRoot: boolean,
): WebviewControl {
    const name = getPropStr(node, 'name', '') || getPropStr(node, 'eventName', '');
    const typeName = getPropStr(node, 'javaType', '') || getPropStr(node, 'csType', '');

    const vd = getVariantData(node, variantIndex);

    const children: WebviewControl[] = [];
    for (const child of node.children) {
        children.push(controlNodeToWebview(child, variantIndex, false));
    }

    return {
        name,
        typeName,
        left: vd.left,
        top: vd.top,
        width: vd.width,
        height: vd.height,
        hanchor: vd.hanchor,
        vanchor: vd.vanchor,
        isRoot,
        children,
    };
}

// ── Custom Document ──────────────────────────────────────────────────

class B4XLayoutDocument implements vscode.CustomDocument {
    readonly uri: vscode.Uri;
    layout: LayoutFile | null = null;
    variantIndex = 0;
    private dirty = false;

    private readonly _onDidDispose = new vscode.EventEmitter<void>();
    readonly onDidDispose = this._onDidDispose.event;

    private readonly _onDidRevert = new vscode.EventEmitter<void>();
    readonly onDidRevert = this._onDidRevert.event;

    constructor(uri: vscode.Uri) {
        this.uri = uri;
    }

    get isDirty(): boolean { return this.dirty; }

    markDirty(): void { this.dirty = true; }
    markClean(): void { this.dirty = false; }

    fireReverted(): void { this._onDidRevert.fire(); }

    dispose(): void {
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
        this._onDidRevert.dispose();
    }
}

// ── Custom Editor Provider ───────────────────────────────────────────

export class B4XLayoutEditorProvider implements vscode.CustomEditorProvider<B4XLayoutDocument> {

    public static readonly viewType = 'b4x.layoutEditor';

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<B4XLayoutDocument>>();
    readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    /** Extension-side clipboard: deep-cloned ControlNode trees ready to paste. */
    private clipboard: ControlNode[] = [];

    /** Currently active webview panel (for routing clipboard commands). */
    private activePanel: vscode.WebviewPanel | null = null;

    /**
     * Per-panel action handlers. Allows sendClipboardAction to invoke
     * handleContextAction directly with the panel's closure-captured state,
     * avoiding a webview round-trip.
     */
    private panelHandlers = new Map<vscode.WebviewPanel, (action: string, names: string[]) => Promise<void>>();

    constructor(private readonly extensionUri: vscode.Uri) {}

    /**
     * Execute a clipboard action on the active designer panel.
     * Called by extension commands registered for Ctrl+C/V/X/D.
     * Directly invokes the context action handler — no webview round-trip needed.
     */
    public sendClipboardAction(action: 'copy' | 'cut' | 'paste' | 'duplicate'): void {
        const panel = this.activePanel;
        if (!panel) { return; }
        const handler = this.panelHandlers.get(panel);
        if (!handler) { return; }

        // For copy/cut/duplicate we need the currently selected names.
        // For paste we pass an empty array (paste uses the extension-side clipboard).
        const selectedNames = (action === 'paste')
            ? []
            : (propertyGridBus.session?.selectedNames ?? []);
        handler(action, selectedNames);
    }

    async openCustomDocument(uri: vscode.Uri): Promise<B4XLayoutDocument> {
        const doc = new B4XLayoutDocument(uri);
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            doc.layout = parseLayoutFile(Buffer.from(data));
        } catch (err: any) {
            console.error('[B4X Designer] Failed to parse layout:', err);
        }
        return doc;
    }

    async saveCustomDocument(document: B4XLayoutDocument, _token: vscode.CancellationToken): Promise<void> {
        if (!document.layout) { return; }
        const buf = writeLayoutFile(document.layout);
        await vscode.workspace.fs.writeFile(document.uri, buf);
        document.markClean();
    }

    async saveCustomDocumentAs(document: B4XLayoutDocument, destination: vscode.Uri, _token: vscode.CancellationToken): Promise<void> {
        if (!document.layout) { return; }
        const buf = writeLayoutFile(document.layout);
        await vscode.workspace.fs.writeFile(destination, buf);
    }

    async revertCustomDocument(document: B4XLayoutDocument, _token: vscode.CancellationToken): Promise<void> {
        const data = await vscode.workspace.fs.readFile(document.uri);
        document.layout = parseLayoutFile(Buffer.from(data));
        document.variantIndex = 0;
        document.markClean();
        // Notify listeners so the webview reloads
        document.fireReverted();
    }

    async backupCustomDocument(
        document: B4XLayoutDocument,
        context: vscode.CustomDocumentBackupContext,
        _token: vscode.CancellationToken,
    ): Promise<vscode.CustomDocumentBackup> {
        if (document.layout) {
            const buf = writeLayoutFile(document.layout);
            await vscode.workspace.fs.writeFile(context.destination, buf);
        }
        return { id: context.destination.toString(), delete: () => vscode.workspace.fs.delete(context.destination) };
    }

    resolveCustomEditor(
        document: B4XLayoutDocument,
        webviewPanel: vscode.WebviewPanel
    ): void {
        const filePath = document.uri.fsPath;
        const ext = path.extname(filePath).toLowerCase();
        const platform = (LAYOUT_EXTENSIONS[ext] || 'B4A') as 'B4A' | 'B4i' | 'B4J';

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
            ],
        };

        webviewPanel.webview.html = this.getDesignerHtml(webviewPanel.webview);

        // Track the parsed layout for property grid communication
        let currentLayout: LayoutFile | null = document.layout;
        let currentVariantIndex = document.variantIndex;

        // Helper: mark document as dirty (enables save)
        const notifyDirty = () => {
            if (!document.isDirty) {
                document.markDirty();
                this._onDidChangeCustomDocument.fire({ document });
            }
        };

        // Register panel handler so sendClipboardAction can invoke directly
        this.panelHandlers.set(webviewPanel, (action, names) => {
            return this.handleContextAction(
                action, names, currentLayout, platform,
                document, webviewPanel, currentVariantIndex, notifyDirty,
            );
        });

        // Re-sync locals when document is reverted from disk
        document.onDidRevert(async () => {
            currentLayout = document.layout;
            currentVariantIndex = document.variantIndex;
            if (currentLayout) {
                const webviewLayout = await this.buildWebviewLayout(currentLayout, platform, currentVariantIndex);
                webviewPanel.webview.postMessage({ type: 'loadLayout', layout: webviewLayout });
                propertyGridBus.session = {
                    documentKey: document.uri.toString(),
                    layout: currentLayout,
                    platform: platform as any,
                    variantIndex: currentVariantIndex,
                    selectedNames: [],
                };
                propertyGridBus.fireSelectionChanged([]);
            }
        });

        // Set designerActive context when this panel is focused
        const updateContext = () => {
            vscode.commands.executeCommand('setContext', 'b4x.designerActive', webviewPanel.active);
            if (webviewPanel.active) {
                this.activePanel = webviewPanel;
            } else if (this.activePanel === webviewPanel) {
                this.activePanel = null;
            }
        };
        updateContext();
        webviewPanel.onDidChangeViewState(() => {
            // Re-anchor if dragged to a floating window (viewColumn is undefined when floating)
            if (webviewPanel.viewColumn === undefined) {
                webviewPanel.reveal(vscode.ViewColumn.One);
                return;
            }
            updateContext();
            if (webviewPanel.active && currentLayout) {
                // Re-establish property grid session when panel regains focus
                const prevLayout = propertyGridBus.session?.layout;
                propertyGridBus.session = {
                    documentKey: document.uri.toString(),
                    layout: currentLayout,
                    platform: platform as any,
                    variantIndex: currentVariantIndex,
                    selectedNames: [],
                };
                // If switching to a different file, refresh the property grid + script
                if (prevLayout !== currentLayout) {
                    deactivateScript();
                    propertyGridBus.fireSelectionChanged([]);
                    propertyGridBus.fireLayoutUpdated();
                }
            }
        });
        webviewPanel.onDidDispose(() => {
            if (this.activePanel === webviewPanel) {
                this.activePanel = null;
            }
            this.panelHandlers.delete(webviewPanel);
            vscode.commands.executeCommand('setContext', 'b4x.designerActive', false);
            propChangeDisposable.dispose();
            selectionRequestDisposable.dispose();
            contextActionRequestDisposable.dispose();
            reparentRequestDisposable.dispose();
            scriptRunDisposable.dispose();
            scriptDeactivateDisposable.dispose();
            scriptChangeDisposable.dispose();
            if (propertyGridBus.session?.layout === currentLayout) {
                propertyGridBus.session = null;
                propertyGridBus.fireSelectionChanged([]);
            }
        });

        // Listen for property changes from the property grid sidebar
        const propChangeDisposable = propertyGridBus.onPropertyChanged((controlName, key, value) => {
            if (!currentLayout || propertyGridBus.session?.layout !== currentLayout) { return; }
            // Handle control rename — update canvas maps and manifest
            if (key === 'name' && typeof value === 'string' && value !== controlName) {
                webviewPanel.webview.postMessage({
                    type: 'controlRenamed',
                    oldName: controlName,
                    newName: value,
                });
                currentLayout.manifest = collectManifestEntries(currentLayout.rootControl);
                notifyDirty();
                return;
            }
            notifyDirty();
            // Forward the change to the canvas webview
            webviewPanel.webview.postMessage({
                type: 'propertyUpdated',
                name: controlName,
                key,
                value,
            });
        });

        const selectionRequestDisposable = propertyGridBus.onSelectionRequested(names => {
            if (!currentLayout || propertyGridBus.session?.layout !== currentLayout) { return; }
            webviewPanel.webview.postMessage({ type: 'selectControls', names });
        });

        const contextActionRequestDisposable = propertyGridBus.onContextActionRequested((action, names) => {
            if (!currentLayout || propertyGridBus.session?.layout !== currentLayout) { return; }
            webviewPanel.webview.postMessage({ type: 'invokeContextAction', action, names });
        });

        const reparentRequestDisposable = propertyGridBus.onReparentRequested((names, targetName, index) => {
            if (!currentLayout || propertyGridBus.session?.layout !== currentLayout) { return; }
            this.handleReparent(
                names,
                targetName,
                index,
                currentLayout,
                webviewPanel,
                currentVariantIndex,
                notifyDirty,
            );
        });

        // Script engine instance for this editor
        const scriptEngine = new ScriptEngine();

        // Helper: deactivate script mode on the canvas (restore original positions)
        const deactivateScript = () => {
            webviewPanel.webview.postMessage({
                type: 'scriptResults',
                changes: {},
                active: false,
            });
        };

        // Helper: run script and send results to canvas
        const executeScript = () => {
            if (!currentLayout || !currentLayout.scriptData) { return; }
            const sd = currentLayout.scriptData;
            const variants = currentLayout.variants;
            if (variants.length === 0) { return; }

            const designVariant = variants[0];
            const currentVariant = variants[Math.min(currentVariantIndex, variants.length - 1)];

            // Find the variant-specific script (match by dimensions)
            let variantScript = '';
            for (const vs of sd.variantScripts) {
                if (vs.variant.width === currentVariant.width &&
                    vs.variant.height === currentVariant.height &&
                    vs.variant.scale === currentVariant.scale) {
                    variantScript = vs.script;
                    break;
                }
            }

            const results = scriptEngine.execute(
                sd.mainScript,
                variantScript,
                currentVariant,
                designVariant,
                currentLayout.rootControl,
                currentVariantIndex,
                platform as Platform,
            );

            // Convert changes Map to Record for webview serialization
            const changesRecord: Record<string, any> = {};
            for (const [name, change] of results.changes) {
                changesRecord[name] = change;
            }

            webviewPanel.webview.postMessage({
                type: 'scriptResults',
                changes: changesRecord,
                active: true,
                error: results.error,
            });

            // Report error or warnings to property grid
            if (results.error) {
                propertyGridBus.fireScriptResult(results.error);
            } else if (results.warnings && results.warnings.length > 0) {
                propertyGridBus.fireScriptResult(`Warnings:\n${results.warnings.join('\n')}`);
            } else {
                propertyGridBus.fireScriptResult(undefined);
            }
        };

        // Listen for script run requests from property grid
        const scriptRunDisposable = propertyGridBus.onScriptRun(() => {
            if (propertyGridBus.session?.layout !== currentLayout) { return; }
            executeScript();
        });

        // Listen for script deactivation (user clicked in the properties area)
        const scriptDeactivateDisposable = propertyGridBus.onScriptDeactivate(() => {
            if (propertyGridBus.session?.layout !== currentLayout) { return; }
            deactivateScript();
        });

        // Listen for script text changes to mark dirty
        const scriptChangeDisposable = propertyGridBus.onScriptChanged(() => {
            if (propertyGridBus.session?.layout !== currentLayout) { return; }
            notifyDirty();
        });

        // Load and parse layout file
        webviewPanel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'ready') {
                // Layout was already parsed in openCustomDocument
                if (currentLayout) {
                    const webviewLayout = await this.buildWebviewLayout(currentLayout, platform, currentVariantIndex);
                    webviewPanel.webview.postMessage({ type: 'loadLayout', layout: webviewLayout });
                    // Initialize property grid session
                    propertyGridBus.session = {
                        documentKey: document.uri.toString(),
                        layout: currentLayout,
                        platform: platform as any,
                        variantIndex: currentVariantIndex,
                        selectedNames: [],
                    };
                    // Notify sidebar the layout is ready (triggers sendScriptData)
                    propertyGridBus.fireLayoutUpdated();
                }
            } else if (message.type === 'selectionChanged') {
                console.log('[B4X Designer] Selection:', message.names);
                // Notify property grid of selection change
                propertyGridBus.fireSelectionChanged(message.names);
            } else if (message.type === 'controlsMoved' || message.type === 'controlsResized') {
                console.log(`[B4X Designer] ${message.type}:`, message.moves || message.resizes);
                // Update the layout model from canvas changes
                if (currentLayout) {
                    const items = message.moves || message.resizes;
                    for (const item of items) {
                        const node = findControlByName(currentLayout.rootControl, item.name);
                        if (node) {
                            updateNodePosition(node, item, currentVariantIndex);
                        }
                    }
                    // Refresh property grid with updated position/size
                    notifyDirty();
                    propertyGridBus.fireLayoutUpdated();
                }
            } else if (message.type === 'variantSwitch') {
                // Switch to a different variant
                const newIndex = message.index;
                if (currentLayout && newIndex >= 0 && newIndex < currentLayout.variants.length) {
                    currentVariantIndex = newIndex;
                    const webviewLayout = await this.buildWebviewLayout(currentLayout, platform, currentVariantIndex);
                    webviewPanel.webview.postMessage({
                        type: 'switchVariant',
                        variantIndex: currentVariantIndex,
                        layout: webviewLayout,
                    });
                    // Update property grid
                    if (propertyGridBus.session) {
                        propertyGridBus.session.variantIndex = currentVariantIndex;
                        propertyGridBus.fireLayoutUpdated();
                    }
                    // Auto-run script for the new variant
                    executeScript();
                }
            } else if (message.type === 'variantAdd') {
                // Add a new variant
                if (currentLayout) {
                    const newVariant = {
                        scale: message.scale,
                        width: message.width,
                        height: message.height,
                    };
                    const newIndex = addVariant(
                        currentLayout.variants,
                        currentLayout.rootControl,
                        newVariant,
                        currentVariantIndex,
                    );
                    if (newIndex >= 0) {
                        currentVariantIndex = newIndex;
                        const webviewLayout = await this.buildWebviewLayout(currentLayout, platform, currentVariantIndex);
                        webviewPanel.webview.postMessage({
                            type: 'switchVariant',
                            variantIndex: currentVariantIndex,
                            layout: webviewLayout,
                        });
                        notifyDirty();
                        if (propertyGridBus.session) {
                            propertyGridBus.session.variantIndex = currentVariantIndex;
                            propertyGridBus.fireLayoutUpdated();
                        }
                    } else {
                        vscode.window.showWarningMessage('A variant with the same dimensions already exists.');
                    }
                }
            } else if (message.type === 'variantRemove') {
                // Remove a variant
                if (currentLayout && currentLayout.variants.length > 1) {
                    const removedIndex = message.index;
                    if (removeVariant(currentLayout.variants, currentLayout.rootControl, removedIndex)) {
                        // Switch to variant 0 after removal
                        currentVariantIndex = 0;
                        const webviewLayout = await this.buildWebviewLayout(currentLayout, platform, currentVariantIndex);
                        webviewPanel.webview.postMessage({
                            type: 'switchVariant',
                            variantIndex: currentVariantIndex,
                            layout: webviewLayout,
                        });
                        notifyDirty();
                        if (propertyGridBus.session) {
                            propertyGridBus.session.variantIndex = currentVariantIndex;
                            propertyGridBus.fireLayoutUpdated();
                        }
                    }
                }
            } else if (message.type === 'controlDeleted') {
                if (currentLayout && message.names?.length) {
                    const deleted = new Set<string>(message.names);
                    removeControlsFromTree(currentLayout.rootControl, deleted);
                    // Update manifest
                    currentLayout.manifest = collectManifestEntries(currentLayout.rootControl);
                    webviewPanel.webview.postMessage({ type: 'controlsRemoved', names: message.names });
                    notifyDirty();
                    propertyGridBus.fireSelectionChanged([]);
                    propertyGridBus.fireLayoutUpdated();
                }
            } else if (message.type === 'addControl') {
                if (currentLayout) {
                    const existingNames = new Set(collectControlNames(currentLayout.rootControl));
                    let newNode: ControlNode | null = null;

                    // Check if this is a custom view type (prefixed with "CustomView:")
                    if (typeof message.controlType === 'string' && message.controlType.startsWith('CustomView:')) {
                        const shortName = message.controlType.substring('CustomView:'.length);
                        const cvDef = await getCustomViewDef(shortName);
                        if (cvDef) {
                            newNode = createCustomViewControl(
                                cvDef,
                                platform as Platform,
                                existingNames,
                                message.x ?? 10,
                                message.y ?? 10,
                                currentLayout.variants.length,
                                currentVariantIndex,
                                currentLayout.gridSize,
                            );
                        }
                    } else {
                        newNode = createControl(
                            message.controlType,
                            platform as Platform,
                            existingNames,
                            message.x ?? 10,
                            message.y ?? 10,
                            currentLayout.variants.length,
                            currentVariantIndex,
                            currentLayout.gridSize,
                        );
                    }

                    if (newNode) {
                        // Add to root control's children
                        currentLayout.rootControl.children.push(newNode);
                        // Update manifest
                        currentLayout.manifest = collectManifestEntries(currentLayout.rootControl);
                        // Send the new control to the canvas
                        const webCtrl = controlNodeToWebview(newNode, currentVariantIndex, false);
                        const rootName = getPropStr(currentLayout.rootControl, 'name', '') ||
                                         getPropStr(currentLayout.rootControl, 'eventName', '');
                        webviewPanel.webview.postMessage({
                            type: 'controlAdded',
                            control: webCtrl,
                            parentName: rootName,
                        });
                        // Select the new control
                        const newName = getPropStr(newNode, 'name', '');
                        notifyDirty();
                        if (newName) {
                            propertyGridBus.fireSelectionChanged([newName]);
                        }
                        propertyGridBus.fireLayoutUpdated();
                    }
                }
            } else if (message.type === 'anchorChanged') {
                if (currentLayout && message.name) {
                    const node = findControlByName(currentLayout.rootControl, message.name);
                    if (node) {
                        const variantKey = `variant${currentVariantIndex}`;
                        const variantObj = node.properties.get(variantKey);
                        if (variantObj && variantObj.tag === TypeTag.Object) {
                            if (message.hanchor >= 0) {
                                variantObj.value.set('hanchor', { tag: TypeTag.Int32, value: message.hanchor });
                            }
                            if (message.vanchor >= 0) {
                                variantObj.value.set('vanchor', { tag: TypeTag.Int32, value: message.vanchor });
                            }
                        }
                        // Also update direct properties for variant 0
                        if (currentVariantIndex === 0) {
                            if (message.hanchor >= 0) {
                                node.properties.set('hanchor', { tag: TypeTag.Int32, value: message.hanchor });
                            }
                            if (message.vanchor >= 0) {
                                node.properties.set('vanchor', { tag: TypeTag.Int32, value: message.vanchor });
                            }
                        }
                        notifyDirty();
                        propertyGridBus.fireLayoutUpdated();
                    }
                }
            } else if (message.type === 'contextAction') {
                this.handleContextAction(
                    message.action,
                    message.names,
                    currentLayout,
                    platform,
                    document,
                    webviewPanel,
                    currentVariantIndex,
                    notifyDirty,
                );
            } else if (message.type === 'zOrderChanged') {
                // Handled by z-order context actions (bringToFront, etc.)
            }
        });
    }

    // ── Context Action Dispatcher ────────────────────────────────

    private async handleContextAction(
        action: string,
        names: string[],
        layout: LayoutFile | null,
        platform: 'B4A' | 'B4i' | 'B4J',
        document: B4XLayoutDocument,
        webviewPanel: vscode.WebviewPanel,
        variantIndex: number,
        notifyDirty: () => void,
    ): Promise<void> {
        if (!layout) { return; }

        // ── Z-Order ──
        if (['bringToFront', 'sendToBack', 'bringForward', 'sendBackward'].includes(action)) {
            this.handleZOrder(action, names, layout, webviewPanel, notifyDirty);
            return;
        }

        // ── Copy ──
        if (action === 'copy') {
            this.clipboardCopy(names, layout);
            return;
        }

        // ── Cut ──
        if (action === 'cut') {
            this.clipboardCopy(names, layout);
            const deleted = new Set(names);
            removeControlsFromTree(layout.rootControl, deleted);
            layout.manifest = collectManifestEntries(layout.rootControl);
            webviewPanel.webview.postMessage({ type: 'controlsRemoved', names });
            notifyDirty();
            propertyGridBus.fireSelectionChanged([]);
            propertyGridBus.fireLayoutUpdated();
            return;
        }

        // ── Paste ──
        if (action === 'paste') {
            this.clipboardPaste(layout, webviewPanel, variantIndex, notifyDirty);
            return;
        }

        // ── Duplicate (copy + paste in one step) ──
        if (action === 'duplicate') {
            this.clipboardCopy(names, layout);
            this.clipboardPaste(layout, webviewPanel, variantIndex, notifyDirty);
            return;
        }

        // ── Generate ──
        if (action === 'generate' && names.length === 1) {
            await this.handleGenerate(names[0], layout, platform, document);
            return;
        }

        // ── View Code ──
        if (action === 'viewcode' && names.length === 1) {
            await viewCode(document.uri.fsPath, names[0]);
            return;
        }
    }

    // ── Clipboard: Copy ─────────────────────────────────────────

    private clipboardCopy(names: string[], layout: LayoutFile): void {
        this.clipboard = [];
        for (const name of names) {
            const node = findControlByName(layout.rootControl, name);
            if (node) {
                // Don't allow copying the root control (Activity/Main)
                const csType = getPropStr(node, 'csType', '');
                if (csType.includes('MetaMain')) { continue; }
                this.clipboard.push(deepCloneControlNode(node));
            }
        }
    }

    // ── Clipboard: Paste ────────────────────────────────────────

    private clipboardPaste(
        layout: LayoutFile,
        webviewPanel: vscode.WebviewPanel,
        variantIndex: number,
        notifyDirty: () => void,
    ): void {
        if (this.clipboard.length === 0) { return; }

        const existingNames = new Set(collectControlNames(layout.rootControl));
        const newNames: string[] = [];
        const rootName = getPropStr(layout.rootControl, 'name', '') ||
                         getPropStr(layout.rootControl, 'eventName', '');

        for (const sourceNode of this.clipboard) {
            const clone = deepCloneControlNode(sourceNode);
            // Recursively rename all controls in the cloned tree to avoid collisions,
            // and offset their positions by 10dp.
            renameClonedTree(clone, existingNames, 10);

            // Preserve the original parent if it still exists in the tree;
            // otherwise fall back to root. This avoids sizing issues when pasting
            // ANCHOR_BOTH controls into a differently-sized parent.
            const origParent = getPropStr(clone, 'parent', '');
            const parentExists = origParent && findControlByName(layout.rootControl, origParent);
            const parentName = parentExists ? origParent : rootName;

            clone.properties.set('parent', { tag: TypeTag.StringRef, value: parentName });

            // Add to parent's children array in the layout tree
            const parentNode = findControlByName(layout.rootControl, parentName) ?? layout.rootControl;
            parentNode.children.push(clone);

            const webCtrl = controlNodeToWebview(clone, variantIndex, false);
            webviewPanel.webview.postMessage({
                type: 'controlAdded',
                control: webCtrl,
                parentName,
            });
            newNames.push(getPropStr(clone, 'name', ''));
        }

        layout.manifest = collectManifestEntries(layout.rootControl);
        notifyDirty();
        propertyGridBus.fireLayoutUpdated();

        // Select the pasted controls
        if (newNames.length > 0) {
            webviewPanel.webview.postMessage({ type: 'selectControls', names: newNames });
            propertyGridBus.fireSelectionChanged(newNames);
        }
    }

    // ── Generate Member ─────────────────────────────────────────

    private async handleGenerate(
        controlName: string,
        layout: LayoutFile,
        platform: 'B4A' | 'B4i' | 'B4J',
        document: B4XLayoutDocument,
    ): Promise<void> {
        const node = findControlByName(layout.rootControl, controlName);
        if (!node) { return; }

        const eventName = getPropStr(node, 'eventName', '') || controlName;
        const csType = getPropStr(node, 'csType', '');
        const typeDef = getControlTypeByCsType(csType);

        // Build QuickPick items
        const items: vscode.QuickPickItem[] = [];

        // "Dim X As Type" — uses the platform-specific short type name
        const platformKey = platform as unknown as Platform;
        const shortType = typeDef?.shortTypeName?.[platformKey];
        if (shortType) {
            items.push({
                label: `$(symbol-variable) Dim ${controlName} As ${shortType}`,
                description: 'Declare variable',
                detail: `Private ${controlName} As ${shortType}`,
            });
        }

        // "Dim X As B4XView" — unless CustomView
        if (typeDef?.metaType !== 'MetaCustomView') {
            items.push({
                label: `$(symbol-variable) Dim ${controlName} As B4XView`,
                description: 'Declare as B4XView',
                detail: `Private ${controlName} As B4XView`,
            });
        }

        // Separator
        if (items.length > 0) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }

        // Events
        const events = typeDef?.events?.[platformKey] ?? [];
        for (const ev of events) {
            // Parse event signature: "Click" or "TextChanged(Old As String, New As String)"
            const parenIdx = ev.indexOf('(');
            const evName = parenIdx >= 0 ? ev.substring(0, parenIdx) : ev;
            const params = parenIdx >= 0 ? ev.substring(parenIdx) : '';
            const subName = `${eventName}_${evName}`;
            const subSig = params ? `Sub ${subName}${params}` : `Sub ${subName}`;
            items.push({
                label: `$(symbol-event) Sub ${subName}`,
                description: params || '',
                detail: `${subSig}\n\nEnd Sub`,
            });
        }

        if (items.length === 0) {
            vscode.window.showInformationMessage(`No generate options available for ${controlName}.`);
            return;
        }

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `Generate code for ${controlName}`,
            title: 'B4X: Generate Member',
        });

        if (!picked || !picked.detail) { return; }

        const layoutFile = document.uri.fsPath;
        const code = picked.detail;

        if (code.startsWith('Private ') || code.startsWith('Dim ')) {
            await generateDim(layoutFile, code);
        } else if (code.startsWith('Sub ')) {
            await generateEventSub(layoutFile, code);
        }
    }

    // ── Z-Order ─────────────────────────────────────────────────

    private handleZOrder(
        action: string,
        names: string[],
        layout: LayoutFile,
        webviewPanel: vscode.WebviewPanel,
        notifyDirty: () => void,
    ): void {
        let changed = false;
        const groups = new Map<ControlNode, Set<ControlNode>>();
        for (const name of names) {
            const node = findControlByName(layout.rootControl, name);
            const parent = node ? this.findParentNode(layout.rootControl, name) : null;
            if (!node || !parent) { continue; }
            let selected = groups.get(parent);
            if (!selected) {
                selected = new Set<ControlNode>();
                groups.set(parent, selected);
            }
            selected.add(node);
        }

        for (const [parent, selected] of groups) {
            const previous = [...parent.children];
            let next = [...previous];

            if (action === 'bringToFront') {
                next = [
                    ...previous.filter(node => !selected.has(node)),
                    ...previous.filter(node => selected.has(node)),
                ];
            } else if (action === 'sendToBack') {
                next = [
                    ...previous.filter(node => selected.has(node)),
                    ...previous.filter(node => !selected.has(node)),
                ];
            } else if (action === 'bringForward') {
                for (let i = next.length - 2; i >= 0; i--) {
                    if (selected.has(next[i]) && !selected.has(next[i + 1])) {
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                    }
                }
            } else if (action === 'sendBackward') {
                for (let i = 1; i < next.length; i++) {
                    if (selected.has(next[i]) && !selected.has(next[i - 1])) {
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    }
                }
            }

            if (next.every((node, index) => node === previous[index])) { continue; }
            parent.children = next;
            changed = true;

            const parentName = getPropStr(parent, 'name', '') || getPropStr(parent, 'eventName', '');
            const childOrder = parent.children.map(c => getPropStr(c, 'name', '') || getPropStr(c, 'eventName', ''));
            webviewPanel.webview.postMessage({
                type: 'zOrderUpdated',
                parentName,
                childOrder,
            });
        }
        if (changed) {
            layout.manifest = collectManifestEntries(layout.rootControl);
            notifyDirty();
            propertyGridBus.fireLayoutUpdated();
        }
    }

    private findParentNode(root: ControlNode, childName: string): ControlNode | null {
        for (const child of root.children) {
            const name = getPropStr(child, 'name', '') || getPropStr(child, 'eventName', '');
            if (name === childName) { return root; }
            const found = this.findParentNode(child, childName);
            if (found) { return found; }
        }
        return null;
    }

    private handleReparent(
        names: string[],
        targetName: string,
        requestedIndex: number,
        layout: LayoutFile,
        webviewPanel: vscode.WebviewPanel,
        variantIndex: number,
        notifyDirty: () => void,
    ): void {
        const rootName = getPropStr(layout.rootControl, 'name', '') ||
            getPropStr(layout.rootControl, 'eventName', '');
        const target = targetName === rootName
            ? layout.rootControl
            : findControlByName(layout.rootControl, targetName);
        if (!target) { return; }

        const targetType = getControlTypeByCsType(getPropStr(target, 'csType', ''));
        if (target !== layout.rootControl && targetType?.isContainer !== true) {
            vscode.window.showWarningMessage(`${targetName} cannot contain child views.`);
            return;
        }

        const requested = new Set(names);
        const orderedNames = collectControlNames(layout.rootControl).filter(name => requested.has(name));
        const moving: Array<{ name: string; node: ControlNode; parent: ControlNode; oldIndex: number; frames: LayoutFrame[] }> = [];

        for (const name of orderedNames) {
            const node = findControlByName(layout.rootControl, name);
            const parent = node ? this.findParentNode(layout.rootControl, name) : null;
            if (!node || !parent || node === layout.rootControl) { continue; }

            // If an ancestor is already moving, this node moves with it.
            if (moving.some(item => containsControl(item.node, name))) { continue; }
            if (node === target || containsControl(node, targetName)) {
                vscode.window.showWarningMessage('A view cannot be moved into itself or one of its descendants.');
                return;
            }

            const frames: LayoutFrame[] = [];
            for (let vi = 0; vi < layout.variants.length; vi++) {
                const frame = findAbsoluteFrame(layout, name, vi);
                if (!frame) { return; }
                frames.push(frame);
            }
            moving.push({ name, node, parent, oldIndex: parent.children.indexOf(node), frames });
        }

        if (moving.length === 0) { return; }

        let insertIndex = Math.max(0, Math.min(requestedIndex, target.children.length));
        for (const item of moving) {
            if (item.parent === target && item.oldIndex >= 0 && item.oldIndex < insertIndex) {
                insertIndex--;
            }
        }

        for (const item of moving) {
            const index = item.parent.children.indexOf(item.node);
            if (index >= 0) { item.parent.children.splice(index, 1); }
        }

        insertIndex = Math.max(0, Math.min(insertIndex, target.children.length));
        target.children.splice(insertIndex, 0, ...moving.map(item => item.node));

        const actualTargetName = getPropStr(target, 'name', '') || getPropStr(target, 'eventName', '');
        for (const item of moving) {
            item.node.properties.set('parent', { tag: TypeTag.StringRef, value: actualTargetName });

            for (let vi = 0; vi < layout.variants.length; vi++) {
                const parentFrame = target === layout.rootControl
                    ? rootFrame(layout, vi)
                    : findAbsoluteFrame(layout, actualTargetName, vi);
                if (!parentFrame) { continue; }
                const oldFrame = item.frames[vi];
                setNodeFrameRelativeToParent(
                    item.node,
                    vi,
                    oldFrame.x - parentFrame.x,
                    oldFrame.y - parentFrame.y,
                    oldFrame.width,
                    oldFrame.height,
                    parentFrame.width,
                    parentFrame.height,
                );
            }
        }

        layout.manifest = collectManifestEntries(layout.rootControl);
        const childOrder = target.children.map(child =>
            getPropStr(child, 'name', '') || getPropStr(child, 'eventName', '')
        );
        webviewPanel.webview.postMessage({
            type: 'controlsReparented',
            names: moving.map(item => item.name),
            parentName: actualTargetName,
            childOrder,
            controls: moving.map(item => controlNodeToWebview(item.node, variantIndex, false)),
        });
        notifyDirty();
        propertyGridBus.fireSelectionChanged(moving.map(item => item.name));
        propertyGridBus.fireLayoutUpdated();
    }

    private async buildWebviewLayout(
        layout: LayoutFile,
        platform: 'B4A' | 'B4i' | 'B4J',
        variantIndex: number,
    ): Promise<WebviewLayout> {
        // Clamp variant index
        const safeIndex = Math.min(variantIndex, layout.variants.length - 1);
        const variant = layout.variants.length > 0
            ? layout.variants[Math.max(0, safeIndex)]
            : { scale: 1, width: 320, height: 480 };

        const root = controlNodeToWebview(layout.rootControl, Math.max(0, safeIndex), true);

        // Set root dimensions from variant
        root.width = variant.width;
        root.height = variant.height;

        // Get predefined layouts for the platform
        const predefined = getPredefinedLayouts(platform as any);

        // Get available control types for this platform
        const controlTypes = getControlTypesForPlatform(platform as Platform);

        // Get custom view names from library XML files
        const customViewTypes = await getCustomViewNames();

        return {
            gridSize: layout.gridSize,
            variant,
            variantIndex: Math.max(0, safeIndex),
            variants: layout.variants.map(v => ({ scale: v.scale, width: v.width, height: v.height })),
            predefinedLayouts: predefined,
            platform,
            availableControlTypes: controlTypes,
            customViewTypes,
            root,
        };
    }

    private getDesignerHtml(webview: vscode.Webview): string {
        const nonce = getNonce();

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'designer.js')
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'designer.css')
        );

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>B4X Designer</title>
</head>
<body>
    <div id="designer-root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

interface LayoutFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}

function rootFrame(layout: LayoutFile, variantIndex: number): LayoutFrame {
    const variant = layout.variants[Math.min(variantIndex, layout.variants.length - 1)];
    return { x: 0, y: 0, width: variant?.width ?? 320, height: variant?.height ?? 480 };
}

function findAbsoluteFrame(layout: LayoutFile, controlName: string, variantIndex: number): LayoutFrame | null {
    const root = rootFrame(layout, variantIndex);
    const rootName = getPropStr(layout.rootControl, 'name', '') ||
        getPropStr(layout.rootControl, 'eventName', '');
    if (rootName === controlName) { return root; }

    const visit = (node: ControlNode, parentFrame: LayoutFrame): LayoutFrame | null => {
        for (const child of node.children) {
            const data = getVariantData(child, variantIndex);
            const width = data.hanchor === 2
                ? parentFrame.width - data.left - data.width
                : data.width;
            const height = data.vanchor === 2
                ? parentFrame.height - data.top - data.height
                : data.height;
            const x = data.hanchor === 1
                ? parentFrame.width - data.left - width
                : data.left;
            const y = data.vanchor === 1
                ? parentFrame.height - data.top - height
                : data.top;
            const frame = {
                x: parentFrame.x + x,
                y: parentFrame.y + y,
                width,
                height,
            };
            const name = getPropStr(child, 'name', '') || getPropStr(child, 'eventName', '');
            if (name === controlName) { return frame; }
            const nested = visit(child, frame);
            if (nested) { return nested; }
        }
        return null;
    };

    return visit(layout.rootControl, root);
}

function containsControl(node: ControlNode, controlName: string): boolean {
    const name = getPropStr(node, 'name', '') || getPropStr(node, 'eventName', '');
    if (name === controlName) { return true; }
    return node.children.some(child => containsControl(child, controlName));
}

function setNodeFrameRelativeToParent(
    node: ControlNode,
    variantIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
    parentWidth: number,
    parentHeight: number,
): void {
    const current = getVariantData(node, variantIndex);
    const left = current.hanchor === 1 ? parentWidth - x - width : x;
    const top = current.vanchor === 1 ? parentHeight - y - height : y;
    const storedWidth = current.hanchor === 2 ? parentWidth - x - width : width;
    const storedHeight = current.vanchor === 2 ? parentHeight - y - height : height;
    const values = {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(storedWidth),
        height: Math.round(storedHeight),
    };

    const variantKey = `variant${variantIndex}`;
    let variant = node.properties.get(variantKey);
    if (!variant || variant.tag !== TypeTag.Object) {
        variant = { tag: TypeTag.Object, value: new Map<string, PropertyValue>() };
        node.properties.set(variantKey, variant);
    }
    if (variant.tag === TypeTag.Object) {
        for (const [key, value] of Object.entries(values)) {
            variant.value.set(key, { tag: TypeTag.Int32, value });
        }
    }

    if (variantIndex === 0) {
        for (const [key, value] of Object.entries(values)) {
            node.properties.set(key, { tag: TypeTag.Int32, value });
        }
    }
}

// ── Update a ControlNode's position from canvas move/resize data ─────

function updateNodePosition(
    node: ControlNode,
    data: { left: number; top: number; width: number; height: number },
    variantIndex: number,
): void {
    const variantKey = `variant${variantIndex}`;
    let variantObj = node.properties.get(variantKey);

    if (variantObj && variantObj.tag === TypeTag.Object) {
        variantObj.value.set('left', { tag: TypeTag.Int32, value: Math.round(data.left) });
        variantObj.value.set('top', { tag: TypeTag.Int32, value: Math.round(data.top) });
        variantObj.value.set('width', { tag: TypeTag.Int32, value: Math.round(data.width) });
        variantObj.value.set('height', { tag: TypeTag.Int32, value: Math.round(data.height) });
    }

    // Also update direct properties
    if (variantIndex === 0) {
        node.properties.set('left', { tag: TypeTag.Int32, value: Math.round(data.left) });
        node.properties.set('top', { tag: TypeTag.Int32, value: Math.round(data.top) });
        node.properties.set('width', { tag: TypeTag.Int32, value: Math.round(data.width) });
        node.properties.set('height', { tag: TypeTag.Int32, value: Math.round(data.height) });
    }
}

// ── Remove controls by name from the tree ────────────────────────────

function removeControlsFromTree(root: ControlNode, namesToRemove: Set<string>): void {
    root.children = root.children.filter(child => {
        const name = getPropStr(child, 'name', '') || getPropStr(child, 'eventName', '');
        if (namesToRemove.has(name)) {
            return false; // remove this child
        }
        // Recurse into children
        removeControlsFromTree(child, namesToRemove);
        return true;
    });
}

// ── Rename cloned control tree for paste ─────────────────────────────

/**
 * Recursively rename all controls in a cloned tree to avoid name collisions.
 * Follows B4A IDE logic: if name exists, clear it and auto-generate "TypeN".
 * Also offsets position by the given delta to prevent stacking on the original.
 */
function renameClonedTree(node: ControlNode, existingNames: Set<string>, offset: number): void {
    const oldName = getPropStr(node, 'name', '');
    const eventName = getPropStr(node, 'eventName', '');

    // Derive display name from csType (e.g. "Dbasic.Designer.MetaButton" → "Button")
    // For CustomViews, prefer shortType (e.g. "CustomListView") over generic "CustomView"
    const csType = getPropStr(node, 'csType', '');
    const shortType = getPropStr(node, 'shortType', '');
    const typeDef = getControlTypeByCsType(csType);
    const baseName = shortType || typeDef?.displayName || stripTrailingDigits(oldName);

    const newName = generateControlName(baseName, existingNames);
    existingNames.add(newName);

    node.properties.set('name', { tag: TypeTag.StringRef, value: newName });

    // If eventName matched old name, update to new name (IDE behavior)
    if (eventName === oldName || !eventName) {
        node.properties.set('eventName', { tag: TypeTag.StringRef, value: newName });
    }

    // Offset position in all variant properties
    if (offset !== 0) {
        for (const [key, val] of node.properties) {
            if (key.startsWith('variant') && val.tag === TypeTag.Object) {
                const left = extractNumber(val.value.get('left'), 0);
                const top = extractNumber(val.value.get('top'), 0);
                val.value.set('left', { tag: TypeTag.Int32, value: left + offset });
                val.value.set('top', { tag: TypeTag.Int32, value: top + offset });
            }
        }
    }

    // Recurse into children, updating parent references
    for (const child of node.children) {
        child.properties.set('parent', { tag: TypeTag.StringRef, value: newName });
        renameClonedTree(child, existingNames, offset);
    }
}

/**
 * Strip trailing digits from a control name to get the base type name.
 * E.g. "Button3" → "Button", "Label12" → "Label", "Panel" → "Panel".
 * Fallback for when csType lookup fails.
 */
function stripTrailingDigits(name: string): string {
    const match = name.match(/^(.+?)(\d+)$/);
    return match ? match[1] : (name || 'Control');
}
