/**
 * B4X Designer Webview — Shared Types
 *
 * Defines the message protocol between extension and webview,
 * plus the lightweight layout model used on the webview side.
 */

// ── Extension → Webview Messages ─────────────────────────────────────

export type ExtToWebviewMessage =
    | { type: 'loadLayout'; layout: WebviewLayout }
    | { type: 'selectControls'; names: string[] }
    | { type: 'updateGridSize'; gridSize: number }
    | { type: 'switchVariant'; variantIndex: number; layout: WebviewLayout }
    | { type: 'updateVariantList'; variants: WebviewVariant[]; currentIndex: number }
    | { type: 'controlAdded'; control: WebviewControl; parentName: string }
    | { type: 'controlsRemoved'; names: string[] }
    | { type: 'controlRenamed'; oldName: string; newName: string }
    | { type: 'propertyUpdated'; name: string; key: string; value: unknown }
    | { type: 'scriptResults'; changes: Record<string, ScriptControlChange>; active: boolean; error?: string }
    | { type: 'zOrderUpdated'; parentName: string; childOrder: string[] }
    | { type: 'clipboardAction'; action: 'copy' | 'cut' | 'paste' | 'duplicate' };

// ── Webview → Extension Messages ─────────────────────────────────────

export type WebviewToExtMessage =
    | { type: 'selectionChanged'; names: string[] }
    | { type: 'controlsMoved'; moves: ControlMoveData[] }
    | { type: 'controlsResized'; resizes: ControlMoveData[] }
    | { type: 'controlDeleted'; names: string[] }
    | { type: 'zOrderChanged'; parentPath: string; childNames: string[] }
    | { type: 'anchorChanged'; name: string; hanchor: number; vanchor: number }
    | { type: 'addControl'; controlType: string; x: number; y: number }
    | { type: 'contextAction'; action: string; names: string[] }
    | { type: 'variantSwitch'; index: number }
    | { type: 'variantAdd'; width: number; height: number; scale: number }
    | { type: 'variantRemove'; index: number }
    | { type: 'ready' };

// ── Script Control Change ────────────────────────────────────────────

export interface ScriptControlChange {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    visible?: boolean;
    textSize?: number;
    text?: string;
    image?: string;
}

// ── Data Structures ──────────────────────────────────────────────────

export interface ControlMoveData {
    name: string;
    parentWidth: number;
    parentHeight: number;
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface WebviewLayout {
    gridSize: number;
    variant: WebviewVariant;
    variantIndex: number;
    variants: WebviewVariant[];
    predefinedLayouts: WebviewPredefinedLayout[];
    platform: 'B4A' | 'B4i' | 'B4J';
    /** Control type display names available for this platform (for Add View menu). */
    availableControlTypes: string[];
    /** Custom view short names for the "CustomView >" submenu. */
    customViewTypes: string[];
    root: WebviewControl;
}

export interface WebviewPredefinedLayout {
    label: string;
    width: number;
    height: number;
    scale: number;
}

export interface WebviewVariant {
    scale: number;
    width: number;
    height: number;
}

export interface WebviewControl {
    /** Control name (e.g. "Button1"). */
    name: string;
    /** Control type (e.g. "MetaButton"). */
    typeName: string;
    /** Position and size for the current variant. */
    left: number;
    top: number;
    width: number;
    height: number;
    /** Anchor modes: 0=LEFT/TOP, 1=RIGHT/BOTTOM, 2=BOTH. */
    hanchor: number;
    vanchor: number;
    /** Whether this is the root control (Activity/Main). */
    isRoot: boolean;
    /** Child controls. */
    children: WebviewControl[];
}

// ── Anchor Constants ─────────────────────────────────────────────────

export const ANCHOR_LEFT = 0;   // or TOP
export const ANCHOR_RIGHT = 1;  // or BOTTOM
export const ANCHOR_BOTH = 2;

// ── Handle Direction ─────────────────────────────────────────────────

export const enum HandleDir {
    Left = 0,
    Top = 1,
    Right = 2,
    Bottom = 3,
    Center = 4,
    None = 5,
}
