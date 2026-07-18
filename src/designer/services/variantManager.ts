/**
 * B4X Designer — Variant System Manager
 *
 * Handles multi-variant layouts: AbstractLayouts.txt parsing, variant CRUD
 * (add/remove/switch), per-control variant data management, and closest-match
 * algorithm for selecting the best variant for a device size.
 */

import { Variant, ControlNode, TypeTag, PropertyValue, ObjectValue, Platform } from '../models/types';

// ── Predefined Layout Entry ──────────────────────────────────────────

export interface PredefinedLayout {
    /** Display label (e.g. "3.5'' Phone (portrait)"). */
    label: string;
    /** Width in dp/points. */
    width: number;
    /** Height in dp/points. */
    height: number;
    /** Scale factor (e.g. 1.0, 1.5, 3.0). */
    scale: number;
}

// ── Built-in AbstractLayouts per platform ────────────────────────────
// Embedded so the extension works without external runtime data files.

const B4I_LAYOUTS: PredefinedLayout[] = [
    { label: "3.5'' Phone (portrait)", width: 320, height: 480, scale: 1 },
    { label: "3.5'' Phone (landscape)", width: 480, height: 320, scale: 1 },
    { label: "4'' Phone (portrait)", width: 320, height: 568, scale: 1 },
    { label: "4'' Phone (landscape)", width: 568, height: 320, scale: 1 },
    { label: "4.7'' Phone (portrait)", width: 375, height: 667, scale: 1 },
    { label: "4.7'' Phone (landscape)", width: 667, height: 375, scale: 1 },
    { label: "5.5'' Phone (portrait)", width: 414, height: 736, scale: 1 },
    { label: "5.5'' Phone (landscape)", width: 736, height: 414, scale: 1 },
    { label: "5.7'' Phone (portrait)", width: 375, height: 812, scale: 1 },
    { label: "5.7'' Phone (landscape)", width: 812, height: 375, scale: 1 },
    { label: 'iPad (portrait)', width: 768, height: 1024, scale: 1 },
    { label: 'iPad (landscape)', width: 1024, height: 768, scale: 1 },
];

const B4A_LAYOUTS: PredefinedLayout[] = [
    { label: 'Phone (portrait)', width: 320, height: 480, scale: 1 },
    { label: 'Phone (landscape)', width: 480, height: 320, scale: 1 },
    { label: "7'' Tablet (portrait)", width: 600, height: 960, scale: 1 },
    { label: "7'' Tablet (landscape)", width: 960, height: 600, scale: 1 },
    { label: "10'' Tablet (portrait)", width: 800, height: 1280, scale: 1 },
    { label: "10'' Tablet (landscape)", width: 1280, height: 800, scale: 1 },
    { label: 'Nexus One (portrait)', width: 480, height: 800, scale: 1.5 },
    { label: 'Nexus One (landscape)', width: 800, height: 480, scale: 1.5 },
    { label: 'Nexus 5 (portrait)', width: 1080, height: 1920, scale: 3 },
    { label: 'Nexus 5 (landscape)', width: 1920, height: 1080, scale: 3 },
    { label: 'Nexus 7 (portrait)', width: 800, height: 1280, scale: 1.33 },
    { label: 'Nexus 7 (landscape)', width: 1280, height: 800, scale: 1.33 },
];

const B4J_LAYOUTS: PredefinedLayout[] = [
    { label: 'Small Window', width: 400, height: 400, scale: 1 },
    { label: 'Default Window', width: 600, height: 600, scale: 1 },
    { label: 'Large Window', width: 800, height: 600, scale: 1 },
    { label: 'Wide Window', width: 1024, height: 768, scale: 1 },
    { label: 'Full HD', width: 1920, height: 1080, scale: 1 },
];

/**
 * Get built-in predefined layouts for a platform.
 */
export function getPredefinedLayouts(platform: Platform): PredefinedLayout[] {
    switch (platform) {
        case Platform.B4A: return B4A_LAYOUTS;
        case Platform.B4i: return B4I_LAYOUTS;
        case Platform.B4J: return B4J_LAYOUTS;
        default: return B4A_LAYOUTS;
    }
}

/**
 * Parse an AbstractLayouts.txt file content into PredefinedLayout entries.
 * Format: `Name: WIDTHxHEIGHT, scale=SCALE`
 * Lines that are just "-" are separator lines (ignored).
 */
export function parseAbstractLayouts(text: string): PredefinedLayout[] {
    const regex = /([^:]*):\s*(\d+)x(\d+),\s*scale\s*=\s*([\d.]+)/;
    const result: PredefinedLayout[] = [];

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '-') { continue; }

        const match = regex.exec(trimmed);
        if (!match) { continue; }

        result.push({
            label: match[1].trim(),
            width: parseInt(match[2], 10),
            height: parseInt(match[3], 10),
            scale: parseFloat(match[4]),
        });
    }

    return result;
}

/**
 * Format a variant for display: "WxH, scale=S"
 */
export function formatVariant(v: Variant): string {
    return `${v.width}x${v.height}, scale=${v.scale}`;
}

// ── Variant CRUD Operations ──────────────────────────────────────────

/**
 * Add a new variant to the layout. Copies current variant's layout data
 * to the new variant for all controls.
 *
 * @returns The index of the new variant, or -1 if duplicate.
 */
export function addVariant(
    variants: Variant[],
    rootControl: ControlNode,
    newVariant: Variant,
    currentVariantIndex: number,
): number {
    // Check for duplicate
    for (const existing of variants) {
        if (existing.width === newVariant.width &&
            existing.height === newVariant.height &&
            existing.scale === newVariant.scale) {
            return -1;
        }
    }

    const newIndex = variants.length;
    variants.push(newVariant);

    // Add variant data to every control, copying from current variant
    addVariantToControlTree(rootControl, newIndex, currentVariantIndex);

    return newIndex;
}

/**
 * Remove a variant from the layout.
 * Removes the variant definition and per-control data at that index.
 * Renumbers remaining variant properties (variant0, variant1, ...).
 *
 * @returns true if removed, false if it's the last variant (can't remove).
 */
export function removeVariant(
    variants: Variant[],
    rootControl: ControlNode,
    variantIndex: number,
): boolean {
    if (variants.length <= 1) { return false; }
    if (variantIndex < 0 || variantIndex >= variants.length) { return false; }

    variants.splice(variantIndex, 1);

    // Remove and renumber variant properties in all controls
    removeVariantFromControlTree(rootControl, variantIndex);

    return true;
}

/**
 * Get the default variant for a new layout based on platform.
 */
export function getDefaultVariant(platform: Platform): Variant {
    switch (platform) {
        case Platform.B4J:
            return { scale: 1, width: 600, height: 600 };
        case Platform.B4i:
            return { scale: 1, width: 320, height: 568 };
        case Platform.B4A:
        default:
            return { scale: 1, width: 320, height: 480 };
    }
}

// ── Per-Control Variant Data Management ──────────────────────────────

/**
 * Recursively add variant data for a new variant to every control,
 * copying from the source variant index.
 */
function addVariantToControlTree(
    node: ControlNode,
    newVariantIndex: number,
    sourceVariantIndex: number,
): void {
    const sourceKey = `variant${sourceVariantIndex}`;
    const newKey = `variant${newVariantIndex}`;

    // Get source variant data (or variant0 as fallback)
    let sourceObj = node.properties.get(sourceKey);
    if (!sourceObj || sourceObj.tag !== TypeTag.Object) {
        sourceObj = node.properties.get('variant0');
    }

    if (sourceObj && sourceObj.tag === TypeTag.Object) {
        // Deep copy the variant object
        const newMap = new Map<string, PropertyValue>();
        for (const [k, v] of sourceObj.value) {
            newMap.set(k, clonePropertyValue(v));
        }
        node.properties.set(newKey, { tag: TypeTag.Object, value: newMap });
    } else {
        // Create minimal variant data from direct properties
        const newMap = new Map<string, PropertyValue>();
        newMap.set('left', { tag: TypeTag.Int32, value: extractNumber(node.properties.get('left'), 0) });
        newMap.set('top', { tag: TypeTag.Int32, value: extractNumber(node.properties.get('top'), 0) });
        newMap.set('width', { tag: TypeTag.Int32, value: extractNumber(node.properties.get('width'), 100) });
        newMap.set('height', { tag: TypeTag.Int32, value: extractNumber(node.properties.get('height'), 50) });
        node.properties.set(newKey, { tag: TypeTag.Object, value: newMap });
    }

    // Recurse into children
    for (const child of node.children) {
        addVariantToControlTree(child, newVariantIndex, sourceVariantIndex);
    }
}

/**
 * Recursively remove variant data at the given index from every control,
 * and renumber subsequent variants.
 */
function removeVariantFromControlTree(
    node: ControlNode,
    removedIndex: number,
): void {
    // Collect all variant keys
    const variantKeys: number[] = [];
    for (const key of node.properties.keys()) {
        const m = /^variant(\d+)$/.exec(key);
        if (m) { variantKeys.push(parseInt(m[1], 10)); }
    }
    variantKeys.sort((a, b) => a - b);

    // Remove the target variant
    node.properties.delete(`variant${removedIndex}`);

    // Renumber: shift down all variants above the removed index
    for (const idx of variantKeys) {
        if (idx > removedIndex) {
            const val = node.properties.get(`variant${idx}`);
            if (val) {
                node.properties.delete(`variant${idx}`);
                node.properties.set(`variant${idx - 1}`, val);
            }
        }
    }

    // Recurse into children
    for (const child of node.children) {
        removeVariantFromControlTree(child, removedIndex);
    }
}

/**
 * Deep clone a PropertyValue. Required when copying variant data
 * to a new variant to prevent shared references.
 */
function clonePropertyValue(v: PropertyValue): PropertyValue {
    if (v.tag === TypeTag.Object) {
        const newMap = new Map<string, PropertyValue>();
        for (const [k, val] of v.value) {
            newMap.set(k, clonePropertyValue(val));
        }
        return { tag: TypeTag.Object, value: newMap };
    }
    // All other types are value types / immutable — shallow copy is safe
    return { ...v } as PropertyValue;
}

function extractNumber(v: PropertyValue | undefined, def: number): number {
    if (!v) { return def; }
    if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return v.value; }
    return def;
}

// ── Closest-Match Variant Selection ──────────────────────────────────

/**
 * Find the variant that best matches a target screen size.
 * Uses area-difference scoring: smaller area difference = better match.
 * This is an approximation of the runtime algorithm — the designer just
 * stores variants; the actual runtime picks the best one on the device.
 *
 * @returns Index of the best-matching variant.
 */
export function findClosestVariant(
    variants: Variant[],
    targetWidth: number,
    targetHeight: number,
    targetScale: number,
): number {
    if (variants.length === 0) { return 0; }
    if (variants.length === 1) { return 0; }

    let bestIndex = 0;
    let bestDiff = Infinity;

    for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        // Normalize to dp for comparison
        const vW = v.width / v.scale;
        const vH = v.height / v.scale;
        const tW = targetWidth / targetScale;
        const tH = targetHeight / targetScale;

        const areaDiff = Math.abs(vW * vH - tW * tH);
        const aspectDiff = Math.abs(vW / vH - tW / tH) * 10000; // Weight aspect ratio
        const diff = areaDiff + aspectDiff;

        if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i;
        }
    }

    return bestIndex;
}

/**
 * Get the number of variants in a control's data.
 * Counts variant0, variant1, ... properties.
 */
export function countControlVariants(node: ControlNode): number {
    let count = 0;
    for (const key of node.properties.keys()) {
        if (/^variant\d+$/.test(key)) { count++; }
    }
    return count;
}
