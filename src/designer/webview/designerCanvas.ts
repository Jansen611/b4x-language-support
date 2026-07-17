/**
 * B4X Designer Webview — Canvas Surface
 *
 * DOM-based canvas where controls are absolutely-positioned divs.
 * Handles rendering, selection, drag/move/resize, zoom, keyboard shortcuts,
 * rubber-band selection, and context menus.
 *
 * Corresponds to WPF classes dv.cs (canvas surface) and dh.cs (per-control view).
 */

import {
    WebviewLayout, WebviewControl, WebviewToExtMessage,
    WebviewVariant, WebviewPredefinedLayout,
    HandleDir, ANCHOR_LEFT, ANCHOR_RIGHT, ANCHOR_BOTH,
    ControlMoveData,
} from './shared';

// ── Types ────────────────────────────────────────────────────────────

interface ControlView {
    ctrl: WebviewControl;
    el: HTMLDivElement;
    labelEl: HTMLSpanElement;
    anchorDots: HTMLDivElement[];
    bounds: DOMRect | null;
    parent: ControlView | null;
    children: ControlView[];
    /** Computed display width after anchor calculations (unscaled layout coords) */
    displayW: number;
    /** Computed display height after anchor calculations (unscaled layout coords) */
    displayH: number;
}

interface HandleHit {
    h: HandleDir;
    v: HandleDir;
}

const enum DragState {
    Idle,
    PendingDrag,
    Dragging,
    RubberBand,
}

// ── Constants ────────────────────────────────────────────────────────

const HANDLE_SIZE = 8;
const MIN_CONTROL_SIZE = 1;
const DEAD_ZONE_SQ = 80; // ~8.9px
const RUBBER_BAND_STROKE = 'rgba(0,120,255,1)';
const RUBBER_BAND_FILL = 'rgba(0,120,255,0.27)';
const SELECTION_COLOR = 'rgba(170,170,200,1)';
const GLOW_COLOR = '#E4451D';
const DEFAULT_BORDER = '#000000';

// ── Control Color Hash (deterministic, based on control name) ───────

function hashCode(s: string): number {
    let h1 = 5381;
    let h2 = h1;
    for (let i = 0; i < s.length; i += 2) {
        h1 = ((h1 << 5) + h1) ^ s.charCodeAt(i);
        if (i + 1 < s.length) {
            h2 = ((h2 << 5) + h2) ^ s.charCodeAt(i + 1);
        }
    }
    return (h1 + (Math.imul(h2, 1566083941))) | 0;
}

function controlColor(name: string): string {
    const hash = hashCode(name + name + name);
    const r = (hash >> 16) & 0xFF;
    const g = (hash >> 8) & 0xFF;
    const b = hash & 0xFF;
    return `rgba(${r}, ${g}, ${b}, 0.78)`;
}

// ── Cursor map for handles ──────────────────────────────────────────

function handleCursor(h: HandleDir, v: HandleDir): string {
    if (h === HandleDir.Center && v === HandleDir.Center) { return 'move'; }
    if (h === HandleDir.Left && v === HandleDir.Top) { return 'nwse-resize'; }
    if (h === HandleDir.Right && v === HandleDir.Bottom) { return 'nwse-resize'; }
    if (h === HandleDir.Right && v === HandleDir.Top) { return 'nesw-resize'; }
    if (h === HandleDir.Left && v === HandleDir.Bottom) { return 'nesw-resize'; }
    if (h === HandleDir.Center && (v === HandleDir.Top || v === HandleDir.Bottom)) { return 'ns-resize'; }
    if ((h === HandleDir.Left || h === HandleDir.Right) && v === HandleDir.Center) { return 'ew-resize'; }
    return 'default';
}

// ── DesignerCanvas ──────────────────────────────────────────────────

export class DesignerCanvas {
    private root: HTMLDivElement;
    private postMessage: (msg: WebviewToExtMessage) => void;

    // Layout state
    private layout: WebviewLayout | null = null;
    private controlViews: Map<string, ControlView> = new Map();
    private rootView: ControlView | null = null;
    gridSize = 10;

    // Zoom/pan
    private zoomLevel = 1.0;
    private panX = 20;
    private panY = 20;
    private canvasContainer: HTMLDivElement;
    private canvasContent: HTMLDivElement;

    // Selection
    private selectedNames: Set<string> = new Set();
    private selectionOverlays: Map<string, HTMLDivElement> = new Map();

    // Drag state
    private dragState = DragState.Idle;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragHandle: HandleHit | null = null;
    private dragTarget: ControlView | null = null;
    private dragInitialBounds: Map<string, { x: number; y: number; w: number; h: number }> = new Map();

    // Rubber band
    private rubberBandEl: HTMLDivElement | null = null;
    private rubberPivotX = 0;
    private rubberPivotY = 0;

    // Hover glow
    private glowView: ControlView | null = null;

    // Context menu
    private contextMenuEl: HTMLDivElement | null = null;

    // Clipboard
    private clipboardNames: string[] = [];

    // Middle-click pan
    private isPanning = false;
    private panStartX = 0;
    private panStartY = 0;
    private panStartPanX = 0;
    private panStartPanY = 0;

    // Navigation overlay
    private navZoomLabel: HTMLSpanElement | null = null;
    private panInterval: ReturnType<typeof setInterval> | null = null;

    // Variant toolbar
    private variantToolbar: HTMLDivElement;
    private variantSelect: HTMLSelectElement | null = null;
    private currentVariantIndex = 0;

    // Script mode
    private scriptActive = false;
    private scriptBackup: Map<string, {
        cssLeft: string; cssTop: string; cssWidth: string; cssHeight: string;
        ctrlLeft: number; ctrlTop: number; ctrlWidth: number; ctrlHeight: number;
        displayW: number; displayH: number;
        visible: boolean;
    }> = new Map();
    private scriptOverlay: HTMLDivElement | null = null;

    constructor(root: HTMLDivElement, postMessage: (msg: WebviewToExtMessage) => void) {
        this.root = root;
        this.postMessage = postMessage;

        // Create variant toolbar at top
        this.variantToolbar = document.createElement('div');
        this.variantToolbar.className = 'variant-toolbar';
        this.root.appendChild(this.variantToolbar);

        // Create container with overflow for panning
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'designer-canvas-container';
        this.root.appendChild(this.canvasContainer);

        // Create content layer that gets transformed
        this.canvasContent = document.createElement('div');
        this.canvasContent.className = 'designer-canvas-content';
        this.canvasContainer.appendChild(this.canvasContent);

        // Create navigation overlay (zoom bar + D-pad)
        this.buildNavOverlay();

        this.setupEvents();
    }

    // ── Navigation Overlay ──────────────────────────────────────

    private buildNavOverlay(): void {
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';

        // Zoom bar: [−] [100%] [+] [Fit]
        const zoomBar = document.createElement('div');
        zoomBar.className = 'nav-zoom-bar';

        const zoomOut = document.createElement('button');
        zoomOut.className = 'nav-btn';
        zoomOut.textContent = '−';
        zoomOut.title = 'Zoom out';
        zoomOut.addEventListener('click', () => this.changeZoom(-0.1));

        this.navZoomLabel = document.createElement('span');
        this.navZoomLabel.className = 'nav-zoom-label';
        this.navZoomLabel.textContent = '100%';

        const zoomIn = document.createElement('button');
        zoomIn.className = 'nav-btn';
        zoomIn.textContent = '+';
        zoomIn.title = 'Zoom in';
        zoomIn.addEventListener('click', () => this.changeZoom(0.1));

        const fitBtn = document.createElement('button');
        fitBtn.className = 'nav-btn';
        fitBtn.textContent = '⊞';
        fitBtn.title = 'Fit to view';
        fitBtn.addEventListener('click', () => this.zoomToFit());

        zoomBar.appendChild(zoomOut);
        zoomBar.appendChild(this.navZoomLabel);
        zoomBar.appendChild(zoomIn);
        zoomBar.appendChild(fitBtn);
        overlay.appendChild(zoomBar);

        // D-pad: directional arrows for panning
        const dpad = document.createElement('div');
        dpad.className = 'nav-dpad';

        const PAN_STEP = 40;

        const makeArrow = (label: string, title: string, dx: number, dy: number): HTMLButtonElement => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.textContent = label;
            btn.title = title;
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.startContinuousPan(dx, dy);
            });
            btn.addEventListener('pointerup', () => this.stopContinuousPan());
            btn.addEventListener('pointerleave', () => this.stopContinuousPan());
            return btn;
        };

        // Row 1: _ ▲ _
        const spacer1 = document.createElement('div');
        spacer1.className = 'nav-dpad-center';
        dpad.appendChild(spacer1);
        dpad.appendChild(makeArrow('▲', 'Pan up', 0, PAN_STEP));
        const spacer2 = document.createElement('div');
        spacer2.className = 'nav-dpad-center';
        dpad.appendChild(spacer2);

        // Row 2: ◄ ● ►
        dpad.appendChild(makeArrow('◄', 'Pan left', PAN_STEP, 0));
        const centerBtn = document.createElement('button');
        centerBtn.className = 'nav-btn';
        centerBtn.textContent = '●';
        centerBtn.title = 'Reset pan (center)';
        centerBtn.addEventListener('click', () => this.zoomToFit());
        dpad.appendChild(centerBtn);
        dpad.appendChild(makeArrow('►', 'Pan right', -PAN_STEP, 0));

        // Row 3: _ ▼ _
        const spacer3 = document.createElement('div');
        spacer3.className = 'nav-dpad-center';
        dpad.appendChild(spacer3);
        dpad.appendChild(makeArrow('▼', 'Pan down', 0, -PAN_STEP));
        const spacer4 = document.createElement('div');
        spacer4.className = 'nav-dpad-center';
        dpad.appendChild(spacer4);

        overlay.appendChild(dpad);

        // Prevent pointer events on the overlay from bubbling to the canvas
        // (otherwise pointerdown starts a rubber-band selection and steals focus)
        overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
        overlay.addEventListener('pointerup', (e) => e.stopPropagation());
        overlay.addEventListener('pointermove', (e) => e.stopPropagation());

        this.canvasContainer.appendChild(overlay);
    }

    private changeZoom(delta: number): void {
        const containerRect = this.canvasContainer.getBoundingClientRect();
        const cx = containerRect.width / 2;
        const cy = containerRect.height / 2;

        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(0.1, Math.min(5.0, this.zoomLevel + delta));

        // Zoom toward center of container
        this.panX = cx - (cx - this.panX) * (this.zoomLevel / oldZoom);
        this.panY = cy - (cy - this.panY) * (this.zoomLevel / oldZoom);

        this.applyTransform();
    }

    private startContinuousPan(dx: number, dy: number): void {
        this.stopContinuousPan();
        // Immediate first step
        this.panX += dx;
        this.panY += dy;
        this.applyTransform();
        // Repeat while held
        this.panInterval = setInterval(() => {
            this.panX += dx;
            this.panY += dy;
            this.applyTransform();
        }, 80);
    }

    private stopContinuousPan(): void {
        if (this.panInterval !== null) {
            clearInterval(this.panInterval);
            this.panInterval = null;
        }
    }

    private updateZoomLabel(): void {
        if (this.navZoomLabel) {
            this.navZoomLabel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    }

    // ── Layout Loading ───────────────────────────────────────────

    loadLayout(layout: WebviewLayout): void {
        this.scriptActive = false;
        this.scriptBackup.clear();
        this.showScriptOverlay(false);
        this.layout = layout;
        this.gridSize = layout.gridSize;
        this.currentVariantIndex = layout.variantIndex;
        this.controlViews.clear();
        this.selectedNames.clear();
        this.selectionOverlays.clear();
        this.canvasContent.innerHTML = '';

        // Build variant toolbar
        this.buildVariantToolbar(layout.variants, layout.variantIndex, layout.predefinedLayouts);

        // Build control tree
        this.rootView = this.createControlView(layout.root, null);

        // Fit to view
        this.zoomToFit();
        this.applyTransform();
    }

    /**
     * Switch to a different variant without full reload.
     * Called when the extension sends a new layout for the switched variant.
     */
    switchVariant(variantIndex: number, layout: WebviewLayout): void {
        this.scriptActive = false;
        this.scriptBackup.clear();
        this.showScriptOverlay(false);
        this.currentVariantIndex = variantIndex;
        this.layout = layout;
        this.gridSize = layout.gridSize;
        this.controlViews.clear();
        this.selectedNames.clear();
        this.selectionOverlays.clear();
        this.canvasContent.innerHTML = '';

        // Rebuild control tree with new variant data
        this.rootView = this.createControlView(layout.root, null);

        // Update toolbar selection without triggering event
        if (this.variantSelect && this.variantSelect.selectedIndex !== variantIndex) {
            this.variantSelect.value = String(variantIndex);
        }

        this.zoomToFit();
        this.applyTransform();
    }

    /**
     * Update the variant list in the toolbar (after add/remove).
     */
    updateVariantList(variants: WebviewVariant[], currentIndex: number): void {
        this.currentVariantIndex = currentIndex;
        this.buildVariantToolbar(
            variants,
            currentIndex,
            this.layout?.predefinedLayouts ?? [],
        );
    }

    /**
     * Add a new control view to the canvas (from extension after createControl).
     */
    addControlView(ctrl: WebviewControl, parentName: string): void {
        const parentView = parentName ? this.controlViews.get(parentName) : this.rootView;
        if (!parentView) { return; }

        this.createControlView(ctrl, parentView);

        // Select the new control
        this.setSelection([ctrl.name]);
    }

    /**
     * Remove control views from the canvas by name.
     */
    removeControlViews(names: string[]): void {
        for (const name of names) {
            const view = this.controlViews.get(name);
            if (!view) { continue; }

            // Remove from parent's children
            if (view.parent) {
                const idx = view.parent.children.indexOf(view);
                if (idx >= 0) { view.parent.children.splice(idx, 1); }
                view.parent.ctrl.children = view.parent.children.map(child => child.ctrl);
            }

            view.el.remove();
            this.removeControlViewData(view);
        }
        this.updateSelectionOverlays();
        this.notifySelection();
    }

    private removeControlViewData(view: ControlView): void {
        for (const child of view.children) { this.removeControlViewData(child); }
        this.controlViews.delete(view.ctrl.name);
        this.selectedNames.delete(view.ctrl.name);
        const overlay = this.selectionOverlays.get(view.ctrl.name);
        overlay?.remove();
        this.selectionOverlays.delete(view.ctrl.name);
        if (this.glowView === view) { this.glowView = null; }
    }

    /**
     * Reorder children of a parent control to match the given name order.
     * Called when the extension processes z-order changes (bring to front, etc.).
     */
    reorderChildren(parentName: string, childOrder: string[]): void {
        const parentView = this.controlViews.get(parentName);
        if (!parentView) { return; }

        // Reorder the children array to match the new order
        const sorted: typeof parentView.children = [];
        for (const name of childOrder) {
            const child = parentView.children.find(c => c.ctrl.name === name);
            if (child) { sorted.push(child); }
        }
        // Append any children not in the order list (shouldn't happen, but safety)
        for (const child of parentView.children) {
            if (!sorted.includes(child)) { sorted.push(child); }
        }
        parentView.children = sorted;

        // Reorder DOM elements to match
        for (const child of sorted) {
            parentView.el.appendChild(child.el);
        }
        parentView.ctrl.children = sorted.map(child => child.ctrl);
    }

    reparentControlViews(
        names: string[],
        parentName: string,
        childOrder: string[],
        controls: WebviewControl[],
    ): void {
        const newParent = this.controlViews.get(parentName);
        if (!newParent) { return; }

        for (const name of names) {
            const view = this.controlViews.get(name);
            if (!view) { continue; }
            if (view.parent) {
                view.parent.children = view.parent.children.filter(child => child !== view);
                view.parent.ctrl.children = view.parent.children.map(child => child.ctrl);
            }
            view.el.remove();
            this.removeControlViewData(view);
        }

        for (const control of controls) {
            this.createControlView(control, newParent);
        }
        this.reorderChildren(parentName, childOrder);
        this.selectByNames(names);
    }

    invokeContextAction(action: string, names: string[]): void {
        this.selectByNames(names);
        this.handleContextAction(action, { x: 10, y: 10 });
    }

    /**
     * Rename a control view on the canvas (after property grid name change).
     */
    renameControlView(oldName: string, newName: string): void {
        const view = this.controlViews.get(oldName);
        if (!view) { return; }

        // Update the control data
        view.ctrl.name = newName;

        // Update the controlViews map
        this.controlViews.delete(oldName);
        this.controlViews.set(newName, view);

        // Update the label
        if (view.labelEl) {
            view.labelEl.textContent = newName;
        }
        view.el.dataset.name = newName;

        // Update selection tracking
        if (this.selectedNames.has(oldName)) {
            this.selectedNames.delete(oldName);
            this.selectedNames.add(newName);
        }

        // Update selection overlay
        const ov = this.selectionOverlays.get(oldName);
        if (ov) {
            this.selectionOverlays.delete(oldName);
            this.selectionOverlays.set(newName, ov);
        }
    }

    /**
     * Apply script execution results to the canvas.
     * Adjusts control positions/sizes, visibility, etc.
     */
    applyScriptResults(
        changes: Record<string, { left?: number; top?: number; width?: number; height?: number; visible?: boolean; textSize?: number; text?: string; image?: string }>,
        active: boolean,
        error?: string,
    ): void {
        // Deactivate script mode: restore original positions
        if (!active) {
            this.exitScriptMode();
            return;
        }
        if (error) { return; }
        if (!this.layout) { return; }

        // Back up original CSS + model values before first script application
        if (!this.scriptActive) {
            this.scriptBackup.clear();
            for (const [name, view] of this.controlViews) {
                if (!view.ctrl.isRoot) {
                    this.scriptBackup.set(name, {
                        cssLeft: view.el.style.left,
                        cssTop: view.el.style.top,
                        cssWidth: view.el.style.width,
                        cssHeight: view.el.style.height,
                        ctrlLeft: view.ctrl.left,
                        ctrlTop: view.ctrl.top,
                        ctrlWidth: view.ctrl.width,
                        ctrlHeight: view.ctrl.height,
                        displayW: view.displayW,
                        displayH: view.displayH,
                        visible: view.el.style.display !== 'none',
                    });
                }
            }
        }
        this.scriptActive = true;
        this.showScriptOverlay(true);

        // Script results are anchor-adjusted positions in the normalized screen
        // coordinate space. Convert to CSS pixels using variant scale.
        const scale = 1 / (this.layout.variant.scale ?? 1);

        for (const [name, change] of Object.entries(changes)) {
            const view = this.controlViews.get(name);
            if (!view) { continue; }

            // Only update CSS display — do NOT modify view.ctrl.* or view.displayW/H
            // so the underlying model stays clean for snap-back.
            const left = change.left ?? view.ctrl.left;
            const top = change.top ?? view.ctrl.top;
            const width = change.width ?? view.ctrl.width;
            const height = change.height ?? view.ctrl.height;

            if (change.left !== undefined || change.top !== undefined) {
                view.el.style.left = (left * scale) + 'px';
                view.el.style.top = (top * scale) + 'px';
            }
            if (change.width !== undefined || change.height !== undefined) {
                view.el.style.width = (Math.max(MIN_CONTROL_SIZE, width) * scale) + 'px';
                view.el.style.height = (Math.max(MIN_CONTROL_SIZE, height) * scale) + 'px';
            }

            // Apply visibility
            if (change.visible !== undefined) {
                view.el.style.display = change.visible ? '' : 'none';
            }
        }
        // Refresh selection overlays if any selected controls were affected
        this.updateSelectionOverlays();
    }

    /** Restore original control positions and exit script mode. */
    private exitScriptMode(): void {
        if (!this.scriptActive) { return; }

        for (const [name, saved] of this.scriptBackup) {
            const view = this.controlViews.get(name);
            if (!view) { continue; }
            // Restore CSS exactly as it was before script mode
            view.el.style.left = saved.cssLeft;
            view.el.style.top = saved.cssTop;
            view.el.style.width = saved.cssWidth;
            view.el.style.height = saved.cssHeight;
            view.el.style.display = saved.visible ? '' : 'none';
            // Restore model values (in case anything read them during script mode)
            view.ctrl.left = saved.ctrlLeft;
            view.ctrl.top = saved.ctrlTop;
            view.ctrl.width = saved.ctrlWidth;
            view.ctrl.height = saved.ctrlHeight;
            view.displayW = saved.displayW;
            view.displayH = saved.displayH;
        }

        this.scriptBackup.clear();
        this.scriptActive = false;
        this.showScriptOverlay(false);
        this.updateSelectionOverlays();
    }

    /** Show or hide the "Script mode (read-only)" overlay label. */
    private showScriptOverlay(show: boolean): void {
        if (show) {
            if (!this.scriptOverlay) {
                this.scriptOverlay = document.createElement('div');
                this.scriptOverlay.className = 'script-mode-overlay';
                this.scriptOverlay.textContent = 'Script mode (read-only)';
                this.canvasContainer.appendChild(this.scriptOverlay);
            }
            this.scriptOverlay.style.display = '';
        } else if (this.scriptOverlay) {
            this.scriptOverlay.style.display = 'none';
        }
    }

    // ── Variant Toolbar ──────────────────────────────────────────

    private buildVariantToolbar(
        variants: WebviewVariant[],
        currentIndex: number,
        predefinedLayouts: WebviewPredefinedLayout[],
    ): void {
        this.variantToolbar.innerHTML = '';

        // Label
        const label = document.createElement('span');
        label.className = 'variant-toolbar-label';
        label.textContent = 'Variant:';
        this.variantToolbar.appendChild(label);

        // Variant dropdown
        this.variantSelect = document.createElement('select');
        this.variantSelect.className = 'variant-select';

        for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `${v.width}×${v.height}, scale=${v.scale}`;
            this.variantSelect.appendChild(opt);
        }

        this.variantSelect.value = String(currentIndex);
        this.variantSelect.addEventListener('change', () => {
            const idx = parseInt(this.variantSelect!.value, 10);
            if (!isNaN(idx) && idx !== this.currentVariantIndex) {
                this.postMessage({ type: 'variantSwitch', index: idx });
            }
        });
        this.variantToolbar.appendChild(this.variantSelect);

        // Add variant button
        const addBtn = document.createElement('button');
        addBtn.className = 'variant-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add variant';
        addBtn.addEventListener('click', () => {
            this.showAddVariantDialog(predefinedLayouts);
        });
        this.variantToolbar.appendChild(addBtn);

        // Remove variant button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'variant-btn';
        removeBtn.textContent = '−';
        removeBtn.title = 'Remove current variant';
        removeBtn.disabled = variants.length <= 1;
        removeBtn.addEventListener('click', () => {
            this.postMessage({ type: 'variantRemove', index: this.currentVariantIndex });
        });
        this.variantToolbar.appendChild(removeBtn);

        // Variant info
        if (variants.length > 0 && currentIndex < variants.length) {
            const info = document.createElement('span');
            info.className = 'variant-info';
            info.textContent = `(${variants.length} variant${variants.length !== 1 ? 's' : ''})`;
            this.variantToolbar.appendChild(info);
        }
    }

    private showAddVariantDialog(predefined: WebviewPredefinedLayout[]): void {
        // Create a popup dialog for adding a variant
        const overlay = document.createElement('div');
        overlay.className = 'variant-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'variant-dialog';

        const title = document.createElement('div');
        title.className = 'variant-dialog-title';
        title.textContent = 'Add Variant';
        dialog.appendChild(title);

        // Predefined dropdown
        if (predefined.length > 0) {
            const predefLabel = document.createElement('label');
            predefLabel.textContent = 'Predefined:';
            predefLabel.className = 'variant-dialog-label';
            dialog.appendChild(predefLabel);

            const predefSelect = document.createElement('select');
            predefSelect.className = 'variant-dialog-select';

            const customOpt = document.createElement('option');
            customOpt.value = '';
            customOpt.textContent = '(Custom)';
            predefSelect.appendChild(customOpt);

            for (const p of predefined) {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ w: p.width, h: p.height, s: p.scale });
                opt.textContent = `${p.label}: ${p.width}×${p.height}, scale=${p.scale}`;
                predefSelect.appendChild(opt);
            }

            predefSelect.addEventListener('change', () => {
                if (predefSelect.value) {
                    const { w, h, s } = JSON.parse(predefSelect.value);
                    widthInput.value = String(w);
                    heightInput.value = String(h);
                    scaleInput.value = String(s);
                }
            });
            dialog.appendChild(predefSelect);
        }

        // Width input
        const widthLabel = document.createElement('label');
        widthLabel.textContent = 'Width:';
        widthLabel.className = 'variant-dialog-label';
        dialog.appendChild(widthLabel);
        const widthInput = document.createElement('input');
        widthInput.type = 'number';
        widthInput.className = 'variant-dialog-input';
        widthInput.value = String(this.layout?.variant.width ?? 320);
        widthInput.min = '1';
        dialog.appendChild(widthInput);

        // Height input
        const heightLabel = document.createElement('label');
        heightLabel.textContent = 'Height:';
        heightLabel.className = 'variant-dialog-label';
        dialog.appendChild(heightLabel);
        const heightInput = document.createElement('input');
        heightInput.type = 'number';
        heightInput.className = 'variant-dialog-input';
        heightInput.value = String(this.layout?.variant.height ?? 480);
        heightInput.min = '1';
        dialog.appendChild(heightInput);

        // Scale input
        const scaleLabel = document.createElement('label');
        scaleLabel.textContent = 'Scale:';
        scaleLabel.className = 'variant-dialog-label';
        dialog.appendChild(scaleLabel);
        const scaleInput = document.createElement('input');
        scaleInput.type = 'number';
        scaleInput.className = 'variant-dialog-input';
        scaleInput.value = '1';
        scaleInput.min = '0.1';
        scaleInput.step = '0.1';
        dialog.appendChild(scaleInput);

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.className = 'variant-dialog-buttons';

        const okBtn = document.createElement('button');
        okBtn.className = 'variant-dialog-ok';
        okBtn.textContent = 'Add';
        okBtn.addEventListener('click', () => {
            const w = parseInt(widthInput.value, 10);
            const h = parseInt(heightInput.value, 10);
            const s = parseFloat(scaleInput.value);
            if (w > 0 && h > 0 && s > 0) {
                this.postMessage({ type: 'variantAdd', width: w, height: h, scale: s });
            }
            overlay.remove();
        });
        btnRow.appendChild(okBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'variant-dialog-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => overlay.remove());
        btnRow.appendChild(cancelBtn);

        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus width input
        widthInput.focus();
        widthInput.select();
    }

    private createControlView(ctrl: WebviewControl, parent: ControlView | null): ControlView {
        const el = document.createElement('div');
        el.className = 'control-view';
        el.dataset.name = ctrl.name;

        const labelEl = document.createElement('span');
        labelEl.className = 'control-label';

        const anchorDots: HTMLDivElement[] = [];

        // Track the unscaled layout-coordinate dimensions for this control
        let displayW = 0;
        let displayH = 0;

        if (ctrl.isRoot) {
            el.classList.add('root-control');
            // Root uses full variant dimensions
            displayW = this.layout!.variant.width;
            displayH = this.layout!.variant.height;
            el.style.width = `${displayW}px`;
            el.style.height = `${displayH}px`;
            el.style.position = 'relative';
        } else {
            el.style.background = controlColor(ctrl.name);
            el.style.borderColor = DEFAULT_BORDER;
            labelEl.textContent = ctrl.name;
            el.appendChild(labelEl);

            // Use parent's computed display dimensions (not raw variant data)
            const parentW = parent?.displayW ?? this.layout!.variant.width;
            const parentH = parent?.displayH ?? this.layout!.variant.height;

            const pos = this.computeDisplayPosition(ctrl, parentW, parentH);
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
            el.style.width = `${Math.max(MIN_CONTROL_SIZE, pos.w)}px`;
            el.style.height = `${Math.max(MIN_CONTROL_SIZE, pos.h)}px`;

            // Store unscaled layout dimensions for children to use as parent size
            displayW = pos.layoutW;
            displayH = pos.layoutH;

            // Create 4 anchor dots
            for (let i = 0; i < 4; i++) {
                const dot = document.createElement('div');
                dot.className = 'anchor-dot';
                el.appendChild(dot);
                anchorDots.push(dot);
            }
            this.updateAnchorDots(anchorDots, ctrl, el);
        }

        const view: ControlView = {
            ctrl,
            el,
            labelEl,
            anchorDots,
            bounds: null,
            parent,
            children: [],
            displayW,
            displayH,
        };

        // Add to parent
        if (parent) {
            parent.el.appendChild(el);
            parent.children.push(view);
        } else {
            this.canvasContent.appendChild(el);
        }

        this.controlViews.set(ctrl.name, view);

        // Recursively create children
        for (const child of ctrl.children) {
            this.createControlView(child, view);
        }

        return view;
    }

    private computeDisplayPosition(ctrl: WebviewControl, parentW: number, parentH: number) {
        const scale = 1 / (this.layout?.variant.scale ?? 1);
        let x = ctrl.left;
        let y = ctrl.top;
        let w = ctrl.width;
        let h = ctrl.height;

        if (ctrl.hanchor === ANCHOR_RIGHT) {
            x = parentW - x - w;
        } else if (ctrl.hanchor === ANCHOR_BOTH) {
            w = parentW - w - x;
        }

        if (ctrl.vanchor === ANCHOR_RIGHT) { // BOTTOM=1
            y = parentH - y - h;
        } else if (ctrl.vanchor === ANCHOR_BOTH) {
            h = parentH - h - y;
        }

        // Clamp to minimum
        w = Math.max(MIN_CONTROL_SIZE, w);
        h = Math.max(MIN_CONTROL_SIZE, h);

        return {
            x: x * scale,
            y: y * scale,
            w: w * scale,
            h: h * scale,
            /** Unscaled layout width — for use as parent dimension by children */
            layoutW: w,
            /** Unscaled layout height — for use as parent dimension by children */
            layoutH: h,
        };
    }

    private updateAnchorDots(dots: HTMLDivElement[], ctrl: WebviewControl, el: HTMLElement): void {
        const w = parseFloat(el.style.width) || 0;
        const h = parseFloat(el.style.height) || 0;

        // Left dot
        dots[0].style.display = (ctrl.hanchor === ANCHOR_LEFT || ctrl.hanchor === ANCHOR_BOTH) ? 'block' : 'none';
        dots[0].style.left = '4px';
        dots[0].style.top = `${h / 2 - 2}px`;

        // Right dot
        dots[1].style.display = (ctrl.hanchor === ANCHOR_RIGHT || ctrl.hanchor === ANCHOR_BOTH) ? 'block' : 'none';
        dots[1].style.left = `${w - 8}px`;
        dots[1].style.top = `${h / 2 - 2}px`;

        // Top dot
        dots[2].style.display = (ctrl.vanchor === ANCHOR_LEFT || ctrl.vanchor === ANCHOR_BOTH) ? 'block' : 'none';
        dots[2].style.left = `${w / 2 - 2}px`;
        dots[2].style.top = '4px';

        // Bottom dot
        dots[3].style.display = (ctrl.vanchor === ANCHOR_RIGHT || ctrl.vanchor === ANCHOR_BOTH) ? 'block' : 'none';
        dots[3].style.left = `${w / 2 - 2}px`;
        dots[3].style.top = `${h - 8}px`;
    }

    // ── Selection ────────────────────────────────────────────────

    selectByNames(names: string[]): void {
        this.clearSelection();
        for (const n of names) {
            this.selectedNames.add(n);
        }
        this.updateSelectionOverlays();
        this.notifySelection();
    }

    private clearSelection(): void {
        this.selectedNames.clear();
        for (const [, ov] of this.selectionOverlays) {
            ov.remove();
        }
        this.selectionOverlays.clear();
    }

    private toggleSelection(name: string): void {
        if (this.selectedNames.has(name)) {
            this.selectedNames.delete(name);
        } else {
            this.selectedNames.add(name);
        }
        this.updateSelectionOverlays();
        this.notifySelection();
    }

    private setSelection(names: string[]): void {
        this.clearSelection();
        for (const n of names) {
            this.selectedNames.add(n);
        }
        this.updateSelectionOverlays();
        this.notifySelection();
    }

    private notifySelection(): void {
        this.postMessage({
            type: 'selectionChanged',
            names: [...this.selectedNames],
        });
    }

    private updateSelectionOverlays(): void {
        // Remove overlays for deselected
        for (const [name, ov] of this.selectionOverlays) {
            if (!this.selectedNames.has(name)) {
                ov.remove();
                this.selectionOverlays.delete(name);
            }
        }

        // Add/update overlays for selected
        for (const name of this.selectedNames) {
            const view = this.controlViews.get(name);
            if (!view || view.ctrl.isRoot) { continue; }

            let overlay = this.selectionOverlays.get(name);
            if (!overlay) {
                overlay = this.createSelectionOverlay(view);
                this.selectionOverlays.set(name, overlay);
            }
            this.positionSelectionOverlay(view, overlay);
        }
    }

    private createSelectionOverlay(view: ControlView): HTMLDivElement {
        const ov = document.createElement('div');
        ov.className = 'selection-overlay';

        // 4 edge lines
        const dirs: Array<{ cls: string; h: HandleDir; v: HandleDir }> = [
            { cls: 'edge-top', h: HandleDir.Center, v: HandleDir.Top },
            { cls: 'edge-bottom', h: HandleDir.Center, v: HandleDir.Bottom },
            { cls: 'edge-left', h: HandleDir.Left, v: HandleDir.Center },
            { cls: 'edge-right', h: HandleDir.Right, v: HandleDir.Center },
        ];
        for (const d of dirs) {
            const line = document.createElement('div');
            line.className = `edge-line ${d.cls}`;
            line.dataset.handleH = String(d.h);
            line.dataset.handleV = String(d.v);
            line.style.cursor = handleCursor(d.h, d.v);
            ov.appendChild(line);
        }

        // 9 resize handles (3×3 grid)
        const hDirs = [HandleDir.Left, HandleDir.Center, HandleDir.Right];
        const vDirs = [HandleDir.Top, HandleDir.Center, HandleDir.Bottom];
        for (const hd of hDirs) {
            for (const vd of vDirs) {
                const handle = document.createElement('div');
                handle.className = 'resize-handle';
                handle.dataset.handleH = String(hd);
                handle.dataset.handleV = String(vd);
                handle.style.cursor = handleCursor(hd, vd);
                ov.appendChild(handle);
            }
        }

        // Insert overlay as sibling of the control view, in the same parent
        if (view.parent) {
            view.parent.el.appendChild(ov);
        } else {
            this.canvasContent.appendChild(ov);
        }

        return ov;
    }

    private positionSelectionOverlay(view: ControlView, overlay: HTMLDivElement): void {
        const el = view.el;
        const w = parseFloat(el.style.width) || 0;
        const h = parseFloat(el.style.height) || 0;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;

        overlay.style.left = `${x}px`;
        overlay.style.top = `${y}px`;
        overlay.style.width = `${w}px`;
        overlay.style.height = `${h}px`;

        // Position edge lines
        const edges = overlay.querySelectorAll<HTMLDivElement>('.edge-line');
        edges.forEach(edge => {
            const cls = edge.classList;
            if (cls.contains('edge-top')) {
                edge.style.left = '0'; edge.style.top = '0';
                edge.style.width = `${w}px`; edge.style.height = '4px';
            } else if (cls.contains('edge-bottom')) {
                edge.style.left = '0'; edge.style.top = `${h - 4}px`;
                edge.style.width = `${w}px`; edge.style.height = '4px';
            } else if (cls.contains('edge-left')) {
                edge.style.left = '0'; edge.style.top = '0';
                edge.style.width = '4px'; edge.style.height = `${h}px`;
            } else if (cls.contains('edge-right')) {
                edge.style.left = `${w - 4}px`; edge.style.top = '0';
                edge.style.width = '4px'; edge.style.height = `${h}px`;
            }
        });

        // Position 9 handles
        const handles = overlay.querySelectorAll<HTMLDivElement>('.resize-handle');
        const xPositions = [-HANDLE_SIZE + 2, w / 2 - HANDLE_SIZE / 2, w - 2];
        const yPositions = [-HANDLE_SIZE + 2, h / 2 - HANDLE_SIZE / 2, h - 2];
        const hDirs = [HandleDir.Left, HandleDir.Center, HandleDir.Right];
        const vDirs = [HandleDir.Top, HandleDir.Center, HandleDir.Bottom];

        let idx = 0;
        for (let hi = 0; hi < 3; hi++) {
            for (let vi = 0; vi < 3; vi++) {
                const handle = handles[idx++];
                if (!handle) { continue; }
                handle.style.left = `${xPositions[hi]}px`;
                handle.style.top = `${yPositions[vi]}px`;
            }
        }
    }

    // ── Event Setup ──────────────────────────────────────────────

    private setupEvents(): void {
        this.canvasContainer.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvasContainer.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.canvasContainer.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.canvasContainer.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        this.canvasContainer.addEventListener('contextmenu', this.onContextMenu.bind(this));
        // Prevent browser auto-scroll on middle click
        this.canvasContainer.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); } });
        document.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    // ── Hit Testing ──────────────────────────────────────────────

    private hitTest(clientX: number, clientY: number): { view: ControlView | null; handle: HandleHit | null } {
        // Check selection overlays first (for resize handles)
        for (const [name, overlay] of this.selectionOverlays) {
            const handles = Array.from(overlay.querySelectorAll<HTMLDivElement>('.resize-handle'));
            for (const handle of handles) {
                const rect = handle.getBoundingClientRect();
                if (clientX >= rect.left && clientX <= rect.right &&
                    clientY >= rect.top && clientY <= rect.bottom) {
                    return {
                        view: this.controlViews.get(name) ?? null,
                        handle: {
                            h: Number(handle.dataset.handleH) as HandleDir,
                            v: Number(handle.dataset.handleV) as HandleDir,
                        },
                    };
                }
            }

            // Check edge lines
            const edges = Array.from(overlay.querySelectorAll<HTMLDivElement>('.edge-line'));
            for (const edge of edges) {
                const rect = edge.getBoundingClientRect();
                if (clientX >= rect.left && clientX <= rect.right &&
                    clientY >= rect.top && clientY <= rect.bottom) {
                    return {
                        view: this.controlViews.get(name) ?? null,
                        handle: {
                            h: Number(edge.dataset.handleH) as HandleDir,
                            v: Number(edge.dataset.handleV) as HandleDir,
                        },
                    };
                }
            }
        }

        // Hit test controls (top-most first = reverse DOM order within each parent)
        const hit = this.hitTestControls(clientX, clientY, this.rootView);
        if (hit) {
            return { view: hit, handle: null };
        }

        return { view: this.rootView, handle: null };
    }

    private hitTestControls(clientX: number, clientY: number, view: ControlView | null): ControlView | null {
        if (!view) { return null; }

        // Check children in reverse order (topmost first)
        for (let i = view.children.length - 1; i >= 0; i--) {
            const child = view.children[i];
            const result = this.hitTestControls(clientX, clientY, child);
            if (result) { return result; }
        }

        // Check this control (skip root — it's always the fallback)
        if (!view.ctrl.isRoot) {
            const rect = view.el.getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.bottom) {
                return view;
            }
        }

        return null;
    }

    // ── Pointer Events ───────────────────────────────────────────

    private canvasPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
        const containerRect = this.canvasContainer.getBoundingClientRect();
        return {
            x: (clientX - containerRect.left - this.panX) / this.zoomLevel,
            y: (clientY - containerRect.top - this.panY) / this.zoomLevel,
        };
    }

    private onPointerDown(e: PointerEvent): void {
        // Middle button = pan mode
        if (e.button === 1) {
            e.preventDefault();
            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            this.panStartPanX = this.panX;
            this.panStartPanY = this.panY;
            this.canvasContainer.setPointerCapture(e.pointerId);
            this.canvasContainer.style.cursor = 'grabbing';
            return;
        }

        if (e.button !== 0) { return; } // left button only
        this.dismissContextMenu();

        const { view, handle } = this.hitTest(e.clientX, e.clientY);
        if (!view) { return; }

        // Script mode: allow selection but block drag/resize
        if (this.scriptActive) {
            if (!view.ctrl.isRoot) {
                if (e.ctrlKey) { this.toggleSelection(view.ctrl.name); }
                else { this.setSelection([view.ctrl.name]); }
            }
            return;
        }

        // Ctrl+Click = toggle multi-select
        if (e.ctrlKey && !view.ctrl.isRoot) {
            this.toggleSelection(view.ctrl.name);
            return;
        }

        // Click on root = start rubber band
        if (view.ctrl.isRoot && !handle) {
            this.dragState = DragState.RubberBand;
            const pt = this.canvasPointFromClient(e.clientX, e.clientY);
            this.rubberPivotX = pt.x;
            this.rubberPivotY = pt.y;
            this.clearSelection();
            this.createRubberBand();
            this.canvasContainer.setPointerCapture(e.pointerId);
            return;
        }

        // If clicking a new (unselected) control, select it
        if (!view.ctrl.isRoot && !this.selectedNames.has(view.ctrl.name)) {
            this.setSelection([view.ctrl.name]);
        }

        // Start potential drag
        this.dragState = DragState.PendingDrag;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragTarget = view;
        this.dragHandle = handle ?? { h: HandleDir.Center, v: HandleDir.Center };

        // Record initial bounds of all selected controls
        this.dragInitialBounds.clear();
        for (const name of this.getTopLevelSelectedNames()) {
            const v = this.controlViews.get(name);
            if (v && !v.ctrl.isRoot) {
                this.dragInitialBounds.set(name, {
                    x: parseFloat(v.el.style.left) || 0,
                    y: parseFloat(v.el.style.top) || 0,
                    w: parseFloat(v.el.style.width) || 0,
                    h: parseFloat(v.el.style.height) || 0,
                });
            }
        }

        this.canvasContainer.setPointerCapture(e.pointerId);
    }

    private onPointerMove(e: PointerEvent): void {
        // Middle-click panning
        if (this.isPanning) {
            this.panX = this.panStartPanX + (e.clientX - this.panStartX);
            this.panY = this.panStartPanY + (e.clientY - this.panStartY);
            this.applyTransform();
            return;
        }

        if (this.dragState === DragState.Idle) {
            // Hover glow
            this.updateHoverGlow(e.clientX, e.clientY);
            return;
        }

        if (this.dragState === DragState.RubberBand) {
            const pt = this.canvasPointFromClient(e.clientX, e.clientY);
            this.updateRubberBand(pt.x, pt.y);
            return;
        }

        if (this.dragState === DragState.PendingDrag) {
            // Check dead zone
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            if (dx * dx + dy * dy <= DEAD_ZONE_SQ) {
                return;
            }
            this.dragState = DragState.Dragging;

            // Set cursor based on handle
            if (this.dragHandle) {
                this.canvasContainer.style.cursor = handleCursor(this.dragHandle.h, this.dragHandle.v);
            }
        }

        if (this.dragState === DragState.Dragging) {
            this.performDrag(e.clientX, e.clientY);
        }
    }

    private onPointerUp(e: PointerEvent): void {
        this.canvasContainer.releasePointerCapture(e.pointerId);

        // End middle-click pan
        if (this.isPanning) {
            this.isPanning = false;
            this.canvasContainer.style.cursor = '';
            return;
        }

        if (this.dragState === DragState.PendingDrag) {
            // Was a click, not a drag — selection already handled in pointerdown
            this.dragState = DragState.Idle;
            this.canvasContainer.style.cursor = '';
            return;
        }

        if (this.dragState === DragState.RubberBand) {
            this.finishRubberBand();
            this.dragState = DragState.Idle;
            return;
        }

        if (this.dragState === DragState.Dragging) {
            this.commitDrag();
            this.dragState = DragState.Idle;
            this.canvasContainer.style.cursor = '';
            return;
        }

        this.dragState = DragState.Idle;
        this.canvasContainer.style.cursor = '';
    }

    // ── Hover Glow ───────────────────────────────────────────────

    private updateHoverGlow(clientX: number, clientY: number): void {
        const { view } = this.hitTest(clientX, clientY);
        const newGlow = (view && !view.ctrl.isRoot) ? view : null;

        if (this.glowView === newGlow) { return; }

        if (this.glowView) {
            this.glowView.el.style.borderColor = DEFAULT_BORDER;
            this.glowView.el.style.borderWidth = '1px';
        }

        this.glowView = newGlow;

        if (this.glowView) {
            this.glowView.el.style.borderColor = GLOW_COLOR;
            this.glowView.el.style.borderWidth = '2px';
        }
    }

    // ── Drag / Move / Resize ─────────────────────────────────────

    private performDrag(clientX: number, clientY: number): void {
        const deltaX = (clientX - this.dragStartX) / this.zoomLevel;
        const deltaY = (clientY - this.dragStartY) / this.zoomLevel;

        const isMove = this.dragHandle!.h === HandleDir.Center && this.dragHandle!.v === HandleDir.Center;

        for (const [name, initial] of this.dragInitialBounds) {
            const view = this.controlViews.get(name);
            if (!view) { continue; }

            let x = initial.x;
            let y = initial.y;
            let w = initial.w;
            let h = initial.h;

            if (isMove) {
                x += deltaX;
                y += deltaY;
                // Grid snap
                x -= x % this.gridSize;
                y -= y % this.gridSize;
            } else {
                const handle = this.dragHandle!;

                if (handle.h === HandleDir.Left) {
                    const newX = Math.min(initial.x + initial.w - MIN_CONTROL_SIZE, initial.x + deltaX);
                    x = newX - (newX % this.gridSize);
                    w = initial.x + initial.w - x;
                } else if (handle.h === HandleDir.Right) {
                    w = Math.max(MIN_CONTROL_SIZE, initial.w + deltaX);
                    w -= w % this.gridSize;
                }

                if (handle.v === HandleDir.Top) {
                    const newY = Math.min(initial.y + initial.h - MIN_CONTROL_SIZE, initial.y + deltaY);
                    y = newY - (newY % this.gridSize);
                    h = initial.y + initial.h - y;
                } else if (handle.v === HandleDir.Bottom) {
                    h = Math.max(MIN_CONTROL_SIZE, initial.h + deltaY);
                    h -= h % this.gridSize;
                }
            }

            w = Math.max(MIN_CONTROL_SIZE, w);
            h = Math.max(MIN_CONTROL_SIZE, h);

            view.el.style.left = `${x}px`;
            view.el.style.top = `${y}px`;
            view.el.style.width = `${w}px`;
            view.el.style.height = `${h}px`;

            // Update anchor dots
            if (view.anchorDots.length > 0) {
                this.updateAnchorDots(view.anchorDots, view.ctrl, view.el);
            }
        }

        this.updateSelectionOverlays();
    }

    private commitDrag(): void {
        const moves: ControlMoveData[] = [];

        for (const name of this.getTopLevelSelectedNames()) {
            const view = this.controlViews.get(name);
            if (!view || view.ctrl.isRoot) { continue; }

            const parentView = view.parent;
            const parentW = parentView?.displayW ?? this.layout!.variant.width;
            const parentH = parentView?.displayH ?? this.layout!.variant.height;

            moves.push({
                name,
                parentWidth: parentW,
                parentHeight: parentH,
                left: parseFloat(view.el.style.left) || 0,
                top: parseFloat(view.el.style.top) || 0,
                width: parseFloat(view.el.style.width) || 0,
                height: parseFloat(view.el.style.height) || 0,
            });
        }

        if (moves.length > 0) {
            const isResize = this.dragHandle &&
                !(this.dragHandle.h === HandleDir.Center && this.dragHandle.v === HandleDir.Center);
            this.postMessage({
                type: isResize ? 'controlsResized' : 'controlsMoved',
                moves,
                resizes: undefined!,
            } as any);
        }
    }

    // ── Rubber Band Selection ────────────────────────────────────

    private createRubberBand(): void {
        if (this.rubberBandEl) { this.rubberBandEl.remove(); }
        this.rubberBandEl = document.createElement('div');
        this.rubberBandEl.className = 'rubber-band';
        this.canvasContent.appendChild(this.rubberBandEl);
    }

    private updateRubberBand(x: number, y: number): void {
        if (!this.rubberBandEl) { return; }
        const rx = Math.min(this.rubberPivotX, x);
        const ry = Math.min(this.rubberPivotY, y);
        const rw = Math.abs(x - this.rubberPivotX);
        const rh = Math.abs(y - this.rubberPivotY);

        this.rubberBandEl.style.left = `${rx}px`;
        this.rubberBandEl.style.top = `${ry}px`;
        this.rubberBandEl.style.width = `${rw}px`;
        this.rubberBandEl.style.height = `${rh}px`;
    }

    private finishRubberBand(): void {
        if (!this.rubberBandEl) { return; }
        const bandRect = this.rubberBandEl.getBoundingClientRect();

        // Find all controls intersecting the rubber band
        const selected: string[] = [];
        for (const [name, view] of this.controlViews) {
            if (view.ctrl.isRoot) { continue; }
            const ctrlRect = view.el.getBoundingClientRect();
            if (rectsIntersect(bandRect, ctrlRect)) {
                selected.push(name);
            }
        }

        this.rubberBandEl.remove();
        this.rubberBandEl = null;

        if (selected.length > 0) {
            this.setSelection(selected);
        }
    }

    // ── Zoom ─────────────────────────────────────────────────────

    private onWheel(e: WheelEvent): void {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(0.1, Math.min(5.0, this.zoomLevel + delta));

        // Zoom toward cursor
        const containerRect = this.canvasContainer.getBoundingClientRect();
        const cursorX = e.clientX - containerRect.left;
        const cursorY = e.clientY - containerRect.top;

        this.panX = cursorX - (cursorX - this.panX) * (this.zoomLevel / oldZoom);
        this.panY = cursorY - (cursorY - this.panY) * (this.zoomLevel / oldZoom);

        this.applyTransform();
    }

    zoomToFit(): void {
        if (!this.layout) { return; }
        const containerRect = this.canvasContainer.getBoundingClientRect();
        const viewW = containerRect.width || 800;
        const viewH = containerRect.height || 600;

        const varW = this.layout.variant.width;
        const varH = this.layout.variant.height;

        if (varW <= 0 || varH <= 0) { return; }

        const scale = Math.min(
            (viewH - 30) / varH,
            (viewW - 50) / varW,
        );
        this.zoomLevel = Math.min(Math.max(0.1, scale), 1.0);

        // Center
        this.panX = (viewW - varW * this.zoomLevel) / 2;
        this.panY = (viewH - varH * this.zoomLevel) / 2;

        this.applyTransform();
    }

    private applyTransform(): void {
        this.canvasContent.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        this.canvasContent.style.transformOrigin = '0 0';
        this.updateZoomLabel();
    }

    // ── Keyboard ─────────────────────────────────────────────────

    private onKeyDown(e: KeyboardEvent): void {
        // Only handle if canvas is focused (webview is active)
        const ctrl = e.ctrlKey || e.metaKey;

        // Script mode: block destructive/movement keys
        if (this.scriptActive) {
            if (e.key === 'Delete' || e.key === 'Backspace' ||
                e.key.startsWith('Arrow')) {
                e.preventDefault();
                return;
            }
        }

        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                e.preventDefault();
                break;
            case 'Escape':
                this.clearSelection();
                this.notifySelection();
                e.preventDefault();
                break;
            case 'ArrowLeft':
                this.nudgeSelected(-1, 0);
                e.preventDefault();
                break;
            case 'ArrowRight':
                this.nudgeSelected(1, 0);
                e.preventDefault();
                break;
            case 'ArrowUp':
                this.nudgeSelected(0, -1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.nudgeSelected(0, 1);
                e.preventDefault();
                break;
            case 'a':
                if (ctrl) { this.selectAll(); e.preventDefault(); }
                break;
            // Ctrl+C/X/V/D are handled by VS Code keybindings → extension commands.
            // Do NOT handle them here — it would cause double execution.
            case 'z':
                if (ctrl) {
                    if (e.shiftKey) {
                        this.postMessage({ type: 'contextAction', action: 'redo', names: [] });
                    } else {
                        this.postMessage({ type: 'contextAction', action: 'undo', names: [] });
                    }
                    e.preventDefault();
                }
                break;
            case 'y':
                if (ctrl) {
                    this.postMessage({ type: 'contextAction', action: 'redo', names: [] });
                    e.preventDefault();
                }
                break;
        }
    }

    private nudgeSelected(dx: number, dy: number): void {
        for (const name of this.getTopLevelSelectedNames()) {
            const view = this.controlViews.get(name);
            if (!view || view.ctrl.isRoot) { continue; }
            const x = (parseFloat(view.el.style.left) || 0) + dx;
            const y = (parseFloat(view.el.style.top) || 0) + dy;
            view.el.style.left = `${x}px`;
            view.el.style.top = `${y}px`;
        }
        this.updateSelectionOverlays();
        this.commitDrag();
    }

    private deleteSelected(): void {
        const names = this.getTopLevelSelectedNames();
        if (names.length === 0) { return; }
        this.postMessage({ type: 'controlDeleted', names });
    }

    private selectAll(): void {
        const names: string[] = [];
        for (const [name, view] of this.controlViews) {
            if (!view.ctrl.isRoot) {
                names.push(name);
            }
        }
        this.setSelection(names);
    }

    public copySelected(): void {
        const names = this.getTopLevelSelectedNames();
        if (names.length === 0) { return; }
        this.clipboardNames = names;
        this.postMessage({ type: 'contextAction', action: 'copy', names });
    }

    public cutSelected(): void {
        const names = this.getTopLevelSelectedNames();
        if (names.length === 0) { return; }
        this.clipboardNames = names;
        this.postMessage({ type: 'contextAction', action: 'cut', names });
    }

    public pasteClipboard(): void {
        this.postMessage({
            type: 'contextAction',
            action: 'paste',
            names: [],
        });
    }

    public duplicateSelected(): void {
        const names = this.getTopLevelSelectedNames();
        if (names.length === 0) { return; }
        this.postMessage({ type: 'contextAction', action: 'duplicate', names });
    }

    private getTopLevelSelectedNames(): string[] {
        const names: string[] = [];
        for (const name of this.selectedNames) {
            const view = this.controlViews.get(name);
            if (!view || view.ctrl.isRoot) { continue; }
            let ancestor = view.parent;
            let nestedUnderSelection = false;
            while (ancestor) {
                if (this.selectedNames.has(ancestor.ctrl.name)) {
                    nestedUnderSelection = true;
                    break;
                }
                ancestor = ancestor.parent;
            }
            if (!nestedUnderSelection) { names.push(name); }
        }
        return names;
    }

    // ── Context Menu ─────────────────────────────────────────────

    private onContextMenu(e: MouseEvent): void {
        e.preventDefault();
        this.dismissContextMenu();

        const { view } = this.hitTest(e.clientX, e.clientY);
        const pt = this.canvasPointFromClient(e.clientX, e.clientY);

        // If right-clicking an unselected non-root control, select it
        if (view && !view.ctrl.isRoot && !this.selectedNames.has(view.ctrl.name)) {
            this.setSelection([view.ctrl.name]);
        }

        const hasSelection = this.selectedNames.size > 0;
        const isActivityOnly = this.selectedNames.size === 0 ||
            (this.selectedNames.size === 1 && this.controlViews.get([...this.selectedNames][0])?.ctrl.isRoot);
        const isSingle = this.selectedNames.size === 1;

        this.contextMenuEl = document.createElement('div');
        this.contextMenuEl.className = 'context-menu';

        const items: Array<{ label: string; action: string; disabled?: boolean; submenu?: Array<{ label: string; action: string; submenu?: Array<{ label: string; action: string }> }> }> = [
            {
                label: 'Add View',
                action: 'addView',
                submenu: [
                    // Built-in control types (excluding generic "CustomView")
                    ...(this.layout?.availableControlTypes ?? [])
                        .filter(name => name !== 'CustomView')
                        .map(name => ({
                            label: name,
                            action: `addView:${name}`,
                        })),
                    // CustomView entry with nested submenu of discovered types
                    ...((this.layout?.customViewTypes ?? []).length > 0 ? [{
                        label: 'CustomView',
                        action: 'addView:CustomView',
                        submenu: (this.layout?.customViewTypes ?? []).map(name => ({
                            label: name,
                            action: `addView:CustomView:${name}`,
                        })),
                    }] : [{
                        label: 'CustomView',
                        action: 'addView:CustomView',
                    }]),
                ],
            },
            { label: '─', action: '' },
            { label: 'Horizontal Anchor: Left', action: 'hanchor:0', disabled: isActivityOnly },
            { label: 'Horizontal Anchor: Right', action: 'hanchor:1', disabled: isActivityOnly },
            { label: 'Horizontal Anchor: Both', action: 'hanchor:2', disabled: isActivityOnly },
            { label: '─', action: '' },
            { label: 'Vertical Anchor: Top', action: 'vanchor:0', disabled: isActivityOnly },
            { label: 'Vertical Anchor: Bottom', action: 'vanchor:1', disabled: isActivityOnly },
            { label: 'Vertical Anchor: Both', action: 'vanchor:2', disabled: isActivityOnly },
            { label: '─', action: '' },
            { label: 'Bring to Front', action: 'bringToFront', disabled: isActivityOnly },
            { label: 'Send to Back', action: 'sendToBack', disabled: isActivityOnly },
            { label: 'Bring Forward', action: 'bringForward', disabled: isActivityOnly },
            { label: 'Send Backward', action: 'sendBackward', disabled: isActivityOnly },
            { label: '─', action: '' },
            { label: 'Generate...', action: 'generate', disabled: isActivityOnly || !isSingle },
            { label: 'View Code', action: 'viewcode', disabled: isActivityOnly || !isSingle },
            { label: 'Check Anchors', action: 'checkAnchors' },
            { label: '─', action: '' },
            { label: 'Copy', action: 'copy', disabled: isActivityOnly },
            { label: 'Cut', action: 'cut', disabled: isActivityOnly },
            { label: 'Paste', action: 'paste', disabled: this.clipboardNames.length === 0 },
            { label: 'Duplicate', action: 'duplicate', disabled: isActivityOnly },
            { label: '─', action: '' },
            { label: 'Remove Selected Views', action: 'removeSelected', disabled: !hasSelection || isActivityOnly },
        ];

        for (const item of items) {
            if (item.label === '─') {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                this.contextMenuEl.appendChild(sep);
                continue;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            if (item.disabled) { menuItem.classList.add('disabled'); }
            menuItem.textContent = item.label;

            if (item.submenu) {
                menuItem.classList.add('has-submenu');
                const submenu = document.createElement('div');
                submenu.className = 'context-submenu';
                for (const sub of item.submenu) {
                    const subItem = document.createElement('div');
                    subItem.className = 'context-menu-item';
                    subItem.textContent = sub.label;

                    if (sub.submenu && sub.submenu.length > 0) {
                        // Nested submenu (e.g. CustomView > list of custom views)
                        subItem.classList.add('has-submenu');
                        const subSubmenu = document.createElement('div');
                        subSubmenu.className = 'context-submenu';
                        for (const subsub of sub.submenu) {
                            const subsubItem = document.createElement('div');
                            subsubItem.className = 'context-menu-item';
                            subsubItem.textContent = subsub.label;
                            subsubItem.addEventListener('click', () => {
                                this.handleContextAction(subsub.action, pt);
                                this.dismissContextMenu();
                            });
                            subSubmenu.appendChild(subsubItem);
                        }
                        subItem.appendChild(subSubmenu);
                    } else {
                        subItem.addEventListener('click', () => {
                            this.handleContextAction(sub.action, pt);
                            this.dismissContextMenu();
                        });
                    }
                    submenu.appendChild(subItem);
                }
                menuItem.appendChild(submenu);
            } else if (!item.disabled) {
                menuItem.addEventListener('click', () => {
                    this.handleContextAction(item.action, pt);
                    this.dismissContextMenu();
                });
            }

            this.contextMenuEl.appendChild(menuItem);
        }

        // Position at click location
        this.contextMenuEl.style.left = `${e.clientX}px`;
        this.contextMenuEl.style.top = `${e.clientY}px`;
        document.body.appendChild(this.contextMenuEl);

        // Dismiss on next click outside
        const dismiss = (ev: MouseEvent) => {
            if (!this.contextMenuEl?.contains(ev.target as Node)) {
                this.dismissContextMenu();
                document.removeEventListener('pointerdown', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
    }

    private dismissContextMenu(): void {
        if (this.contextMenuEl) {
            this.contextMenuEl.remove();
            this.contextMenuEl = null;
        }
    }

    private handleContextAction(action: string, pt: { x: number; y: number }): void {
        const names = [...this.selectedNames];

        if (action.startsWith('addView:')) {
            // Handle "addView:CustomView:ShortName" or "addView:Button"
            const parts = action.split(':');
            const controlType = parts.slice(1).join(':');
            this.postMessage({ type: 'addControl', controlType, x: pt.x, y: pt.y });
            return;
        }
        if (action.startsWith('hanchor:')) {
            const val = parseInt(action.split(':')[1], 10);
            for (const n of names) {
                this.postMessage({ type: 'anchorChanged', name: n, hanchor: val, vanchor: -1 });
            }
            return;
        }
        if (action.startsWith('vanchor:')) {
            const val = parseInt(action.split(':')[1], 10);
            for (const n of names) {
                this.postMessage({ type: 'anchorChanged', name: n, hanchor: -1, vanchor: val });
            }
            return;
        }
        if (action === 'removeSelected') {
            this.deleteSelected();
            return;
        }
        if (action === 'checkAnchors') {
            this.checkAnchors();
            return;
        }
        if (action === 'copy') { this.copySelected(); return; }
        if (action === 'cut') { this.cutSelected(); return; }
        if (action === 'paste') { this.pasteClipboard(); return; }
        if (action === 'duplicate') { this.duplicateSelected(); return; }

        // Delegate z-order and other actions to extension
        this.postMessage({ type: 'contextAction', action, names });
    }

    // ── Anchor Conflict Check ────────────────────────────────────

    private checkAnchors(): void {
        // Reset all backgrounds
        for (const [, view] of this.controlViews) {
            if (!view.ctrl.isRoot) {
                view.el.style.background = controlColor(view.ctrl.name);
            }
        }

        // Check pairs with same parent for conflicts
        for (const [, view] of this.controlViews) {
            if (view.children.length < 2) { continue; }
            for (let i = 0; i < view.children.length; i++) {
                for (let j = i + 1; j < view.children.length; j++) {
                    const a = view.children[i];
                    const b = view.children[j];
                    if (this.hasAnchorConflict(a, b)) {
                        const conflict = 'linear-gradient(45deg, PaleVioletRed, DarkRed)';
                        a.el.style.background = conflict;
                        b.el.style.background = conflict;
                    }
                }
            }
        }
    }

    private hasAnchorConflict(a: ControlView, b: ControlView): boolean {
        const aRect = { x: parseFloat(a.el.style.left), w: parseFloat(a.el.style.width) };
        const bRect = { x: parseFloat(b.el.style.left), w: parseFloat(b.el.style.width) };

        // Horizontal overlap check
        const hOverlap = aRect.x < bRect.x + bRect.w && bRect.x < aRect.x + aRect.w;
        if (hOverlap && a.ctrl.hanchor !== b.ctrl.hanchor) {
            return true;
        }

        const aRectV = { y: parseFloat(a.el.style.top), h: parseFloat(a.el.style.height) };
        const bRectV = { y: parseFloat(b.el.style.top), h: parseFloat(b.el.style.height) };

        const vOverlap = aRectV.y < bRectV.y + bRectV.h && bRectV.y < aRectV.y + aRectV.h;
        if (vOverlap && a.ctrl.vanchor !== b.ctrl.vanchor) {
            return true;
        }

        return false;
    }
}

// ── Utility ──────────────────────────────────────────────────────────

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}
