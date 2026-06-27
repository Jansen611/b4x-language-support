/**
 * B4X Designer Webview — Main Entry Point
 *
 * Loaded by the webview HTML. Sets up the canvas, listens for messages
 * from the extension, and wires up mouse/keyboard interactions.
 */

import { DesignerCanvas } from './designerCanvas';
import { ExtToWebviewMessage, WebviewToExtMessage } from './shared';

// Acquire VS Code webview API
declare function acquireVsCodeApi(): {
    postMessage(msg: WebviewToExtMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let canvas: DesignerCanvas | null = null;

// ── Message Handler ──────────────────────────────────────────────────

window.addEventListener('message', (e: MessageEvent<ExtToWebviewMessage>) => {
    const msg = e.data;
    switch (msg.type) {
        case 'loadLayout':
            if (!canvas) {
                canvas = new DesignerCanvas(
                    document.getElementById('designer-root') as HTMLDivElement,
                    vscode.postMessage.bind(vscode)
                );
            }
            canvas.loadLayout(msg.layout);
            break;
        case 'selectControls':
            canvas?.selectByNames(msg.names);
            break;
        case 'updateGridSize':
            if (canvas) {
                canvas.gridSize = msg.gridSize;
            }
            break;
        case 'switchVariant':
            canvas?.switchVariant(msg.variantIndex, msg.layout);
            break;
        case 'updateVariantList':
            canvas?.updateVariantList(msg.variants, msg.currentIndex);
            break;
        case 'controlAdded':
            canvas?.addControlView(msg.control, msg.parentName);
            break;
        case 'controlsRemoved':
            canvas?.removeControlViews(msg.names);
            break;
        case 'controlRenamed':
            canvas?.renameControlView(msg.oldName, msg.newName);
            break;
        case 'scriptResults':
            canvas?.applyScriptResults(msg.changes, msg.active, msg.error);
            break;
        case 'zOrderUpdated':
            canvas?.reorderChildren(msg.parentName, msg.childOrder);
            break;
        case 'clipboardAction':
            if (msg.action === 'copy') { canvas?.copySelected(); }
            else if (msg.action === 'cut') { canvas?.cutSelected(); }
            else if (msg.action === 'paste') { canvas?.pasteClipboard(); }
            else if (msg.action === 'duplicate') { canvas?.duplicateSelected(); }
            break;
    }
});

// ── Notify Extension We're Ready ─────────────────────────────────────

vscode.postMessage({ type: 'ready' });
