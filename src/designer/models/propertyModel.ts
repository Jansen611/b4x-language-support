/**
 * B4X Designer — Property Model
 *
 * Defines the property metadata system that drives the property grid.
 */

import { ControlNode, PropertyValue, TypeTag, Platform } from './types';
import { getCustomViewDefSync, DesignerProperty } from '../services/libraryLoader';
import { getControlTypeByCsType } from '../services/controlRegistry';

// ── Property Editor Types ────────────────────────────────────────────

export const enum EditorType {
    String = 'string',
    Int = 'int',
    Double = 'double',
    Bool = 'bool',
    Color = 'color',
    NullableColor = 'nullableColor',
    Dropdown = 'dropdown',
    Rect = 'rect',
    Font = 'font',
}

// ── Anchor Constants ─────────────────────────────────────────────────

export const ANCHOR_LEFT = 0;
export const ANCHOR_RIGHT = 1;
export const ANCHOR_BOTH = 2;
export const ANCHOR_BOTTOM = 1; // Same value as RIGHT, used for vertical axis

// ── Property Descriptor ──────────────────────────────────────────────

export interface PropertyDescriptor {
    /** Internal property key (matches ControlNode property name). */
    key: string;
    /** Display name shown in the property grid. */
    displayName: string;
    /** Category group name. */
    category: string;
    /** Tooltip description. */
    description: string;
    /** Editor type to render. */
    editor: EditorType;
    /** Whether this property can be edited in multi-selection mode. */
    isMergeable: boolean;
    /** Whether the property is read-only in the UI. */
    isReadOnly: boolean;
    /** For dropdown: ordered list of { label, value } options. */
    options?: { label: string; value: unknown }[];
    /** For int/double spinners: min value. */
    min?: number;
    /** For int/double spinners: max value. */
    max?: number;
    /** For double spinners: step size. */
    step?: number;
    /** For color: whether alpha channel is editable. */
    alphaEnabled?: boolean;
    /** Default value (used for reset). */
    defaultValue?: unknown;
    /** Property path in the serialized control map. */
    path?: string[];
    /** Binary type to preserve when the value is edited. */
    valueTag?: TypeTag;
}

// ── Serializable Property Data (sent to webview) ─────────────────────

export interface PropertyData {
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
    path: string[];
    valueTag?: TypeTag;
}

// ── Extract a typed value from ControlNode ───────────────────────────

function getStr(node: ControlNode, key: string, def: string): string {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.String || v.tag === TypeTag.StringRef) { return v.value; }
    return def;
}

function getInt(node: ControlNode, key: string, def: number): number {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return Math.round(v.value); }
    return def;
}

function getFloat(node: ControlNode, key: string, def: number): number {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.Float || v.tag === TypeTag.Double || v.tag === TypeTag.Int32) { return v.value; }
    return def;
}

function getBool(node: ControlNode, key: string, def: boolean): boolean {
    const v = node.properties.get(key);
    if (!v) { return def; }
    if (v.tag === TypeTag.Bool) { return v.value; }
    return def;
}

function getColor(node: ControlNode, key: string): { a: number; r: number; g: number; b: number } | null {
    const v = node.properties.get(key);
    if (!v) { return null; }
    if (v.tag === TypeTag.Color) { return { a: v.a, r: v.r, g: v.g, b: v.b }; }
    return null;
}

function getRect(node: ControlNode, key: string): { x: number; y: number; width: number; height: number } | null {
    const v = node.properties.get(key);
    if (!v) { return null; }
    if (v.tag === TypeTag.Int32Rect) { return { x: v.x, y: v.y, width: v.width, height: v.height }; }
    return null;
}

/** Read a property value into a JS-friendly form for sending to webview. */
export function readPropertyValue(
    node: ControlNode,
    key: string,
    editor: EditorType,
    variantIndex: number,
    path: string[] = [key],
): unknown {
    // Position/size properties come from the variant data
    if (key === 'left' || key === 'top' || key === 'width' || key === 'height' || key === 'hanchor' || key === 'vanchor') {
        return readVariantProperty(node, key, variantIndex);
    }
    const value = getPropertyAtPath(node, path);
    if (!value) { return undefined; }
    switch (value.tag) {
        case TypeTag.String:
        case TypeTag.StringRef:
        case TypeTag.Int32:
        case TypeTag.Float:
        case TypeTag.Double:
        case TypeTag.Bool:
        case TypeTag.ErRef:
            return value.value;
        case TypeTag.Color:
            return { a: value.a, r: value.r, g: value.g, b: value.b };
        case TypeTag.Int32Rect:
            return { x: value.x, y: value.y, width: value.width, height: value.height };
        case TypeTag.Null:
            return null;
        default:
            return undefined;
    }
}

function getPropertyAtPath(node: ControlNode, path: string[]): PropertyValue | undefined {
    let properties = node.properties;
    let value: PropertyValue | undefined;
    for (let i = 0; i < path.length; i++) {
        value = properties.get(path[i]);
        if (!value) { return undefined; }
        if (i < path.length - 1) {
            if (value.tag !== TypeTag.Object) { return undefined; }
            properties = value.value;
        }
    }
    return value;
}

function readVariantProperty(node: ControlNode, key: string, variantIndex: number): number {
    const variantKey = `variant${variantIndex}`;
    const variantObj = node.properties.get(variantKey);
    if (variantObj && variantObj.tag === TypeTag.Object) {
        const m = variantObj.value;
        const v = m.get(key);
        if (v && (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double)) {
            return v.value;
        }
    }
    // Fall back to direct properties
    const v = node.properties.get(key);
    if (v && (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double)) {
        return v.value;
    }
    const defaults: Record<string, number> = { left: 0, top: 0, width: 100, height: 50, hanchor: 0, vanchor: 0 };
    return defaults[key] ?? 0;
}

// ── Detect control type from csType/javaType ─────────────────────────

export function detectControlType(node: ControlNode): string {
    const cs = getStr(node, 'csType', '');
    if (cs) {
        return getControlTypeByCsType(cs)?.metaType ?? cs.split('.').pop() ?? 'MetaControl';
    }
    const java = getStr(node, 'javaType', '');
    if (java.includes('ButtonWrapper')) { return 'MetaButton'; }
    if (java.includes('LabelWrapper')) { return 'MetaLabel'; }
    if (java.includes('EditTextWrapper') || java.includes('TextFieldWrapper')) { return 'MetaTextField'; }
    if (java.includes('TextViewWrapper') || java.includes('TextViewWrapper')) { return 'MetaTextView'; }
    if (java.includes('ImageViewWrapper')) { return 'MetaImageView'; }
    if (java.includes('PanelWrapper') || java.includes('Panel')) { return 'MetaPanel'; }
    if (java.includes('ScrollViewWrapper') || java.includes('ScrollView')) { return 'MetaScrollView'; }
    if (java.includes('WebViewWrapper') || java.includes('WebView')) { return 'MetaWebView'; }
    if (java.includes('SwitchWrapper') || java.includes('Switch')) { return 'MetaSwitch'; }
    if (java.includes('SeekBarWrapper') || java.includes('SliderWrapper') || java.includes('Slider')) { return 'MetaSlider'; }
    if (java.includes('Stepper')) { return 'MetaStepper'; }
    if (java.includes('SegmentedControl')) { return 'MetaSegmentedControl'; }
    if (java.includes('Picker') || java.includes('Spinner')) { return 'MetaPicker'; }
    if (java.includes('DatePicker')) { return 'MetaDatePicker'; }
    if (java.includes('ProgressBar') || java.includes('ProgressView')) { return 'MetaProgressView'; }
    if (java.includes('ActivityIndicator') || java.includes('ProgressDialogWrapper')) { return 'MetaActivityIndicator'; }
    if (java.includes('CustomView') || java.includes('CustomViewWrapper')) { return 'MetaCustomView'; }
    return 'MetaControl';
}

// ── Build Property Descriptors for a Control ─────────────────────────

export function buildPropertyDescriptors(
    node: ControlNode,
    platform: Platform,
    allControlNames: string[],
    isRoot: boolean,
): PropertyDescriptor[] {
    const props: PropertyDescriptor[] = [];
    const typeName = detectControlType(node);
    const name = getStr(node, 'name', '') || getStr(node, 'eventName', '');
    const isB4A = platform === Platform.B4A;
    const isB4J = platform === Platform.B4J;

    // ── Main Category ────────────────────────────────────────────
    const catMain = 'Main';

    props.push({
        key: 'name', displayName: 'Name', category: catMain,
        description: "View's name",
        editor: EditorType.String, isMergeable: false, isReadOnly: false,
    });

    props.push({
        key: '_type', displayName: 'Type', category: catMain,
        description: "View's type",
        editor: EditorType.String, isMergeable: false, isReadOnly: true,
        defaultValue: typeName,
    });

    props.push({
        key: 'eventName', displayName: 'Event Name', category: catMain,
        description: "Sets the control's event name prefix",
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });

    if (!isRoot) {
        const parentOptions = allControlNames
            .filter(n => n !== name)
            .map(n => ({ label: n, value: n }));
        parentOptions.unshift({ label: '', value: '' });
        props.push({
            key: 'parent', displayName: 'Parent', category: catMain,
            description: "View's parent",
            editor: EditorType.Dropdown, isMergeable: true, isReadOnly: false,
            options: parentOptions,
        });
    }

    // ── Common Properties Category ───────────────────────────────
    const catCommon = 'Common Properties';

    // Anchors
    props.push({
        key: 'hanchor', displayName: 'Horizontal Anchor', category: catCommon,
        description: 'Horizontal anchor mode',
        editor: EditorType.Dropdown, isMergeable: true, isReadOnly: false,
        options: [
            { label: 'LEFT', value: 0 },
            { label: 'RIGHT', value: 1 },
            { label: 'BOTH', value: 2 },
        ],
    });

    props.push({
        key: 'vanchor', displayName: 'Vertical Anchor', category: catCommon,
        description: 'Vertical anchor mode',
        editor: EditorType.Dropdown, isMergeable: true, isReadOnly: false,
        options: [
            { label: 'TOP', value: 0 },
            { label: 'BOTTOM', value: 1 },
            { label: 'BOTH', value: 2 },
        ],
    });

    // Position & Size
    props.push({
        key: 'left', displayName: 'Left', category: catCommon,
        description: 'Left position',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'top', displayName: 'Top', category: catCommon,
        description: 'Top position',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'width', displayName: 'Width', category: catCommon,
        description: 'Width',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'height', displayName: 'Height', category: catCommon,
        description: 'Height',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });

    // Platform-specific common properties
    if (isB4A) {
        props.push({
            key: 'padding', displayName: 'Padding', category: catCommon,
            description: 'Padding (left, top, right, bottom)',
            editor: EditorType.Rect, isMergeable: true, isReadOnly: false,
        });
    }

    if (isB4A || isB4J) {
        props.push({
            key: 'enabled', displayName: 'Enabled', category: catCommon,
            description: 'Whether the view is enabled',
            editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
            defaultValue: true,
        });
    }

    props.push({
        key: 'visible', displayName: 'Visible', category: catCommon,
        description: 'Whether the view is visible',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: true,
    });

    props.push({
        key: 'tag', displayName: 'Tag', category: catCommon,
        description: 'A string value that can be set and read from code',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });

    // ── Border Properties (B4J) ──────────────────────────────────
    if (isB4J) {
        const catBorder = 'Border Properties';
        props.push({
            key: 'borderColor', displayName: 'Border Color', category: catBorder,
            description: 'Border color',
            editor: EditorType.Color, isMergeable: true, isReadOnly: false,
            alphaEnabled: false,
        });
        props.push({
            key: 'borderWidth', displayName: 'Border Width', category: catBorder,
            description: 'Border width',
            editor: EditorType.Double, isMergeable: true, isReadOnly: false,
            min: 0, max: 1000, defaultValue: 0,
        });
        props.push({
            key: 'cornerRadius', displayName: 'Corner Radius', category: catBorder,
            description: 'Corner radius',
            editor: EditorType.Double, isMergeable: true, isReadOnly: false,
            min: 0, max: 1000, defaultValue: 0,
        });
    }

    // ── Per-Type Properties ──────────────────────────────────────
    addTypeSpecificProperties(props, typeName, platform, node);

    retainPresentProperties(props, node);
    addDynamicProperties(props, node, typeName, isRoot);

    return props;
}

// ── Type-Specific Properties ─────────────────────────────────────────

function addTypeSpecificProperties(
    props: PropertyDescriptor[],
    typeName: string,
    platform: Platform,
    node: ControlNode,
): void {

    switch (typeName) {
        case 'MetaButton':
            addButtonProperties(props, platform);
            break;
        case 'MetaLabel':
            addLabelProperties(props);
            break;
        case 'MetaTextField':
            addTextFieldProperties(props);
            break;
        case 'MetaTextView':
            addTextViewProperties(props);
            break;
        case 'MetaImageView':
            addImageViewProperties(props);
            break;
        case 'MetaPanel':
            break;
        case 'MetaMain':
            break;
        case 'MetaScrollView':
            addScrollViewProperties(props);
            break;
        case 'MetaWebView':
            addWebViewProperties(props);
            break;
        case 'MetaSwitch':
            addSwitchProperties(props);
            break;
        case 'MetaSlider':
            addSliderProperties(props);
            break;
        case 'MetaProgressView':
            addProgressViewProperties(props);
            break;
        case 'MetaCustomView':
            addCustomViewProperties(props, node);
            break;
    }
}

function addCustomViewProperties(props: PropertyDescriptor[], node: ControlNode): void {
    const shortType = getStr(node, 'shortType', '');
    if (!shortType) { return; }

    const cvDef = getCustomViewDefSync(shortType);
    if (!cvDef) { return; }

    const cat = `${shortType} Properties`;
    for (const dp of cvDef.designerProperties) {
        const nestedPath = ['customProperties', dp.key];
        const path = getPropertyAtPath(node, nestedPath) ? nestedPath : [dp.key];
        props.push(designerPropertyToDescriptor(dp, cat, path));
    }
}

function designerPropertyToDescriptor(dp: DesignerProperty, category: string, path: string[]): PropertyDescriptor {
    const desc: PropertyDescriptor = {
        key: propertyId(path),
        displayName: dp.displayName,
        category,
        description: dp.description ?? dp.displayName,
        editor: fieldTypeToEditor(dp.fieldType),
        isMergeable: true,
        isReadOnly: false,
        path,
        valueTag: fieldTypeToTag(dp.fieldType),
    };

    if (dp.minRange !== undefined) { desc.min = dp.minRange; }
    if (dp.maxRange !== undefined) { desc.max = dp.maxRange; }

    if (dp.list && dp.list.length > 0) {
        desc.editor = EditorType.Dropdown;
        desc.options = dp.list.map(v => ({ label: v, value: parseListValue(v, dp.fieldType) }));
    }

    return desc;
}

function fieldTypeToTag(fieldType: DesignerProperty['fieldType']): TypeTag {
    switch (fieldType) {
        case 'int': return TypeTag.Int32;
        case 'float': return TypeTag.Float;
        case 'boolean': return TypeTag.Bool;
        case 'color': return TypeTag.Color;
        default: return TypeTag.StringRef;
    }
}

function parseListValue(value: string, fieldType: DesignerProperty['fieldType']): string | number | boolean {
    if (fieldType === 'int') { return parseInt(value, 10); }
    if (fieldType === 'float') { return parseFloat(value); }
    if (fieldType === 'boolean') { return value.toLowerCase() === 'true'; }
    return value;
}

const REQUIRED_PROPERTY_KEYS = new Set([
    'name', '_type', 'eventName', 'parent',
    'hanchor', 'vanchor', 'left', 'top', 'width', 'height',
]);

const INTERNAL_PROPERTY_KEYS = new Set([
    'csType', 'javaType', 'type', 'customType', 'shortType',
    'left', 'top', 'width', 'height', 'hanchor', 'vanchor',
]);

const INTERNAL_NESTED_KEYS = new Set(['csType', 'type', 'colorKey', 'customType', 'shortType']);
const COMMON_DYNAMIC_KEYS = new Set(['padding', 'contextMenu', 'toolTip']);
const APPEARANCE_DYNAMIC_KEYS = new Set(['alpha', 'elevation', 'extraCss']);
const VARIANT_PROPERTY_KEYS = new Set(['left', 'top', 'width', 'height', 'hanchor', 'vanchor']);

function retainPresentProperties(props: PropertyDescriptor[], node: ControlNode): void {
    for (let i = props.length - 1; i >= 0; i--) {
        const prop = props[i];
        const path = prop.path ?? [prop.key];
        prop.path = path;
        prop.valueTag = getPropertyAtPath(node, path)?.tag ?? prop.valueTag;
        if (!REQUIRED_PROPERTY_KEYS.has(prop.key) && !getPropertyAtPath(node, path)) {
            props.splice(i, 1);
        }
    }
}

function addDynamicProperties(
    props: PropertyDescriptor[],
    node: ControlNode,
    typeName: string,
    isRoot: boolean,
): void {
    const knownPaths = new Set(props.map(prop => propertyId(prop.path ?? [prop.key])));
    for (const [key, value] of node.properties) {
        if (INTERNAL_PROPERTY_KEYS.has(key) || /^variant\d+$/.test(key)) { continue; }
        addDynamicValue(props, knownPaths, node, [key], value, typeName, isRoot);
    }
}

function addDynamicValue(
    props: PropertyDescriptor[],
    knownPaths: Set<string>,
    node: ControlNode,
    path: string[],
    value: PropertyValue,
    typeName: string,
    isRoot: boolean,
): void {
    const id = propertyId(path);
    if (knownPaths.has(id)) { return; }

    if (value.tag === TypeTag.Object) {
        for (const [key, child] of value.value) {
            if (INTERNAL_NESTED_KEYS.has(key)) { continue; }
            addDynamicValue(props, knownPaths, node, [...path, key], child, typeName, isRoot);
        }
        return;
    }

    const editor = editorForValue(value);
    const category = categoryForPath(node, path, typeName, isRoot);
    const descriptor: PropertyDescriptor = {
        key: id,
        displayName: displayNameForPath(path),
        category,
        description: `Serialized ${path.join('.')} property`,
        editor,
        isMergeable: true,
        isReadOnly: value.tag === TypeTag.Null,
        path,
        valueTag: value.tag,
        alphaEnabled: value.tag === TypeTag.Color,
    };
    addKnownOptions(descriptor, path[path.length - 1]);
    props.push(descriptor);
    knownPaths.add(id);
}

function editorForValue(value: PropertyValue): EditorType {
    switch (value.tag) {
        case TypeTag.Int32:
        case TypeTag.ErRef:
            return EditorType.Int;
        case TypeTag.Float:
        case TypeTag.Double:
            return EditorType.Double;
        case TypeTag.Bool:
            return EditorType.Bool;
        case TypeTag.Color:
            return EditorType.Color;
        case TypeTag.Int32Rect:
            return EditorType.Rect;
        default:
            return EditorType.String;
    }
}

function categoryForPath(node: ControlNode, path: string[], typeName: string, isRoot: boolean): string {
    const first = path[0];
    const key = path[path.length - 1];
    if (first === 'customProperties') {
        return `${getStr(node, 'shortType', 'Custom View')} Properties`;
    }
    if (first === 'drawable') { return 'Appearance Properties'; }
    if (first === 'font') { return 'Font Properties'; }
    if (first === 'shadow') { return 'Shadow Properties'; }
    if (isRoot) { return typeName === 'MetaActivity' ? 'Activity Properties' : 'Form Properties'; }
    if (COMMON_DYNAMIC_KEYS.has(key)) { return 'Common Properties'; }
    if (APPEARANCE_DYNAMIC_KEYS.has(key)) { return 'Appearance Properties'; }
    if (isTextProperty(key)) { return textCategory(typeName); }
    return `${typeName.replace(/^Meta/, '') || 'View'} Properties`;
}

function isTextProperty(key: string): boolean {
    return /^(text|hint|font|typeface|style|alignment|hAlignment|vAlignment|singleLine|wrap|wrapText|ellipsize|inputType|password|forceDone)/i.test(key);
}

function textCategory(typeName: string): string {
    if (typeName === 'MetaLabel') { return 'Label Properties'; }
    if (typeName === 'MetaButton') { return 'Button Properties'; }
    return 'Text Properties';
}

function displayNameForPath(path: string[]): string {
    const names: Record<string, string> = {
        fontsize: 'Font Size',
        hAlignment: 'Horizontal Alignment',
        vAlignment: 'Vertical Alignment',
        innerHeight: 'Content Height',
        innerWidth: 'Content Width',
        file: path[0] === 'drawable' ? 'Image File' : 'File',
        color: path[0] === 'drawable' ? 'Background Color' : 'Color',
    };
    const leaf = path[path.length - 1];
    const name = names[leaf] ?? humanizePropertyKey(leaf);
    if (path.length <= 2 || path[0] === 'customProperties') { return name; }
    return `${humanizePropertyKey(path[path.length - 2])} ${name}`;
}

function humanizePropertyKey(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, first => first.toUpperCase());
}

function addKnownOptions(descriptor: PropertyDescriptor, key: string): void {
    const options: Record<string, string[]> = {
        alignment: ['LEFT', 'CENTER', 'RIGHT'],
        hAlignment: ['LEFT', 'CENTER_HORIZONTAL', 'RIGHT'],
        vAlignment: ['TOP', 'CENTER_VERTICAL', 'BOTTOM'],
        ellipsize: ['NONE', 'START', 'MIDDLE', 'END', 'MARQUEE'],
        style: ['NORMAL', 'BOLD', 'ITALIC', 'BOLD_ITALIC'],
        typeface: ['DEFAULT', 'SANS_SERIF', 'SERIF', 'MONOSPACE'],
        orientation: ['INHERIT', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT'],
    };
    const values = options[key];
    if (!values) { return; }
    descriptor.editor = EditorType.Dropdown;
    descriptor.options = values.map(value => ({ label: value, value }));
}

function propertyId(path: string[]): string {
    return path.join('.');
}

function fieldTypeToEditor(fieldType: DesignerProperty['fieldType']): EditorType {
    switch (fieldType) {
        case 'string': return EditorType.String;
        case 'int': return EditorType.Int;
        case 'float': return EditorType.Double;
        case 'boolean': return EditorType.Bool;
        case 'color': return EditorType.Color;
        default: return EditorType.String;
    }
}

function addTextAlignmentDropdown(props: PropertyDescriptor[], category: string): void {
    props.push({
        key: 'textAlignment', displayName: 'Text Alignment', category,
        description: 'Text alignment',
        editor: EditorType.Dropdown, isMergeable: true, isReadOnly: false,
        options: [
            { label: 'LEFT', value: 0 },
            { label: 'CENTER', value: 1 },
            { label: 'RIGHT', value: 2 },
        ],
    });
}

function addLabelProperties(props: PropertyDescriptor[]): void {
    const cat = 'Label Properties';
    props.push({
        key: 'text', displayName: 'Text', category: cat,
        description: 'Label text',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'fontAwesome', displayName: 'Font Awesome', category: cat,
        description: 'FontAwesome icon name',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'materialIcons', displayName: 'Material Icons', category: cat,
        description: 'Material icon name',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'textColor', displayName: 'Text Color', category: cat,
        description: 'Text color',
        editor: EditorType.Color, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    props.push({
        key: 'multiline', displayName: 'Multiline', category: cat,
        description: 'Whether text wraps to multiple lines',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
    props.push({
        key: 'adjustFontSizeToFit', displayName: 'Adjust Font Size To Fit', category: cat,
        description: 'Automatically adjust font size to fit',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
    addTextAlignmentDropdown(props, cat);
}

function addButtonProperties(props: PropertyDescriptor[], _platform: Platform): void {
    const cat = 'Button Properties';
    props.push({
        key: 'text', displayName: 'Text', category: cat,
        description: 'Button text',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'fontAwesome', displayName: 'Font Awesome', category: cat,
        description: 'FontAwesome icon name',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'materialIcons', displayName: 'Material Icons', category: cat,
        description: 'Material icon name',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'textColor', displayName: 'Text Color', category: cat,
        description: 'Text color',
        editor: EditorType.Color, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    props.push({
        key: 'pressedTextColor', displayName: 'Pressed Text Color', category: cat,
        description: 'Text color when pressed',
        editor: EditorType.NullableColor, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    props.push({
        key: 'backgroundImage', displayName: 'Background Image', category: cat,
        description: 'Background image file',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'pressedBackgroundImage', displayName: 'Pressed Background Image', category: cat,
        description: 'Background image when pressed',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
}

function addTextFieldProperties(props: PropertyDescriptor[]): void {
    const cat = 'Text Properties';
    props.push({
        key: 'text', displayName: 'Text', category: cat,
        description: 'Text field content',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'textColor', displayName: 'Text Color', category: cat,
        description: 'Text color',
        editor: EditorType.Color, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    addTextAlignmentDropdown(props, cat);
    props.push({
        key: 'hintText', displayName: 'Hint Text', category: cat,
        description: 'Placeholder text',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });

    props.push({
        key: 'passwordMode', displayName: 'Password Mode', category: cat,
        description: 'Hide typed text',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
}

function addTextViewProperties(props: PropertyDescriptor[]): void {
    const cat = 'Text Properties';
    props.push({
        key: 'text', displayName: 'Text', category: cat,
        description: 'Text content',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'textColor', displayName: 'Text Color', category: cat,
        description: 'Text color',
        editor: EditorType.Color, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    addTextAlignmentDropdown(props, cat);
    props.push({
        key: 'editable', displayName: 'Editable', category: cat,
        description: 'Whether the text view is editable',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
}


function addImageViewProperties(props: PropertyDescriptor[]): void {
    const cat = 'ImageView Properties';
    props.push({
        key: 'imageFile', displayName: 'Image File', category: cat,
        description: 'Image file name',
        editor: EditorType.String, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'contentMode', displayName: 'Content Mode', category: cat,
        description: 'How image fills the view',
        editor: EditorType.Dropdown, isMergeable: true, isReadOnly: false,
        options: [
            { label: 'FILL', value: 0 },
            { label: 'FIT', value: 1 },
            { label: 'CENTER', value: 4 },
            { label: 'TOPLEFT', value: 9 },
        ],
    });
}



function addScrollViewProperties(props: PropertyDescriptor[]): void {
    const cat = 'ScrollView Properties';
    props.push({
        key: 'contentWidth', displayName: 'Content Width', category: cat,
        description: 'Scroll content width',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'contentHeight', displayName: 'Content Height', category: cat,
        description: 'Scroll content height',
        editor: EditorType.Int, isMergeable: true, isReadOnly: false,
    });
    props.push({
        key: 'pagingEnabled', displayName: 'Paging Enabled', category: cat,
        description: 'Enable paging',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
    props.push({
        key: 'bounces', displayName: 'Bounces', category: cat,
        description: 'Enable bounce effect',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: true,
    });
    props.push({
        key: 'showsVerticalIndicator', displayName: 'Shows Vertical Indicator', category: cat,
        description: 'Show vertical scroll indicator',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: true,
    });
    props.push({
        key: 'showsHorizontalIndicator', displayName: 'Shows Horizontal Indicator', category: cat,
        description: 'Show horizontal scroll indicator',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: true,
    });
}

function addWebViewProperties(props: PropertyDescriptor[]): void {
    const cat = 'WebView Properties';
    props.push({
        key: 'suppressRendering', displayName: 'Suppress Rendering', category: cat,
        description: 'Suppress rendering on designer',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
}

function addSwitchProperties(props: PropertyDescriptor[]): void {
    const cat = 'Switch Properties';
    props.push({
        key: 'value', displayName: 'Value', category: cat,
        description: 'Switch state',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: false,
    });
    props.push({
        key: 'onColor', displayName: 'On Color', category: cat,
        description: 'Color when switch is on',
        editor: EditorType.NullableColor, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    props.push({
        key: 'thumbColor', displayName: 'Thumb Color', category: cat,
        description: 'Thumb color',
        editor: EditorType.NullableColor, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
}

function addSliderProperties(props: PropertyDescriptor[]): void {
    const cat = 'Slider Properties';
    props.push({
        key: 'value', displayName: 'Value', category: cat,
        description: 'Slider value',
        editor: EditorType.Double, isMergeable: true, isReadOnly: false,
        defaultValue: 50,
    });
    props.push({
        key: 'minimumValue', displayName: 'Minimum Value', category: cat,
        description: 'Minimum value',
        editor: EditorType.Double, isMergeable: true, isReadOnly: false,
        defaultValue: 0,
    });
    props.push({
        key: 'maximumValue', displayName: 'Maximum Value', category: cat,
        description: 'Maximum value',
        editor: EditorType.Double, isMergeable: true, isReadOnly: false,
        defaultValue: 100,
    });
    props.push({
        key: 'minimumTrackTintColor', displayName: 'Min Track Tint Color', category: cat,
        description: 'Minimum track tint color',
        editor: EditorType.NullableColor, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
    props.push({
        key: 'continuous', displayName: 'Continuous', category: cat,
        description: 'Fire value changed events continuously',
        editor: EditorType.Bool, isMergeable: true, isReadOnly: false,
        defaultValue: true,
    });
}




function addProgressViewProperties(props: PropertyDescriptor[]): void {
    const cat = 'ProgressView Properties';
    props.push({
        key: 'progressColor', displayName: 'Progress Color', category: cat,
        description: 'Progress indicator color',
        editor: EditorType.NullableColor, isMergeable: true, isReadOnly: false,
        alphaEnabled: false,
    });
}


// ── Dynamic anchor label updates ─────────────────────────────────────

export function applyAnchorLabels(props: PropertyDescriptor[], hanchor: number, vanchor: number): void {
    for (const p of props) {
        if (p.key === 'left') {
            if (hanchor === ANCHOR_RIGHT) { p.displayName = 'Right Edge Distance'; }
            else { p.displayName = 'Left'; }
            p.isReadOnly = hanchor < 0;
        }
        if (p.key === 'width') {
            if (hanchor === ANCHOR_BOTH) { p.displayName = 'Right Edge Distance'; }
            else { p.displayName = 'Width'; }
            p.isReadOnly = hanchor < 0;
        }
        if (p.key === 'top') {
            if (vanchor === ANCHOR_BOTTOM) { p.displayName = 'Bottom Edge Distance'; }
            else { p.displayName = 'Top'; }
            p.isReadOnly = vanchor < 0;
        }
        if (p.key === 'height') {
            if (vanchor === ANCHOR_BOTH) { p.displayName = 'Bottom Edge Distance'; }
            else { p.displayName = 'Height'; }
            p.isReadOnly = vanchor < 0;
        }
    }
}

// ── Build PropertyData array for the webview ─────────────────────────

export function buildPropertyDataForControl(
    node: ControlNode,
    platform: Platform,
    allControlNames: string[],
    isRoot: boolean,
    variantIndex: number,
): PropertyData[] {
    const descriptors = buildPropertyDescriptors(node, platform, allControlNames, isRoot);

    // Read current anchor values for label adjustments
    const hanchor = readVariantProperty(node, 'hanchor', variantIndex) as number;
    const vanchor = readVariantProperty(node, 'vanchor', variantIndex) as number;
    applyAnchorLabels(descriptors, hanchor, vanchor);

    return descriptors.map(d => {
        let value: unknown;
        if (d.key === '_type') {
            value = d.defaultValue;
        } else {
            value = readPropertyValue(
                node,
                d.key,
                d.editor as unknown as EditorType,
                variantIndex,
                d.path ?? [d.key],
            );
        }
        return {
            key: d.key,
            displayName: d.displayName,
            category: d.category,
            description: d.description,
            editor: d.editor as string,
            isMergeable: d.isMergeable,
            isReadOnly: d.isReadOnly,
            value,
            options: d.options,
            min: d.min,
            max: d.max,
            step: d.step,
            alphaEnabled: d.alphaEnabled,
            path: d.path ?? [d.key],
            valueTag: d.valueTag,
        };
    });
}

// ── Collect all control names from a tree ────────────────────────────

export function collectControlNames(node: ControlNode): string[] {
    const names: string[] = [];
    const name = getStr(node, 'name', '') || getStr(node, 'eventName', '');
    if (name) { names.push(name); }
    for (const child of node.children) {
        names.push(...collectControlNames(child));
    }
    return names;
}

// ── Find a ControlNode by name ───────────────────────────────────────

export function findControlByName(root: ControlNode, name: string): ControlNode | null {
    const n = getStr(root, 'name', '') || getStr(root, 'eventName', '');
    if (n === name) { return root; }
    for (const child of root.children) {
        const found = findControlByName(child, name);
        if (found) { return found; }
    }
    return null;
}

export function applyPropertyValue(
    node: ControlNode,
    path: string[],
    value: unknown,
    variantIndex: number,
    expectedTag?: TypeTag,
): void {
    const key = path[0];
    if (path.length === 1 && VARIANT_PROPERTY_KEYS.has(key)) {
        applyVariantProperty(node, key, value as number, variantIndex);
        return;
    }

    let properties = node.properties;
    for (let i = 0; i < path.length - 1; i++) {
        const object = properties.get(path[i]);
        if (!object || object.tag !== TypeTag.Object) { return; }
        properties = object.value;
    }
    const leafKey = path[path.length - 1];
    const existing = properties.get(leafKey);

    if (value === null || value === undefined) {
        properties.delete(leafKey);
    } else if (typeof value === 'string') {
        const tag = expectedTag === TypeTag.String || existing?.tag === TypeTag.String
            ? TypeTag.String
            : TypeTag.StringRef;
        properties.set(leafKey, { tag, value });
    } else if (typeof value === 'number') {
        const tag = expectedTag ?? existing?.tag;
        if (tag === TypeTag.Double) {
            properties.set(leafKey, { tag: TypeTag.Double, value });
        } else if (tag === TypeTag.Float) {
            properties.set(leafKey, { tag: TypeTag.Float, value });
        } else if (tag === TypeTag.ErRef) {
            properties.set(leafKey, { tag: TypeTag.ErRef, value: Math.round(value) });
        } else {
            properties.set(leafKey, { tag: TypeTag.Int32, value: Math.round(value) });
        }
    } else if (typeof value === 'boolean') {
        properties.set(leafKey, { tag: TypeTag.Bool, value });
    } else if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
        const color = value as { a: number; r: number; g: number; b: number };
        properties.set(leafKey, { tag: TypeTag.Color, ...color });
    } else if (typeof value === 'object' && 'x' in value && 'y' in value && 'width' in value && 'height' in value) {
        const rect = value as { x: number; y: number; width: number; height: number };
        properties.set(leafKey, { tag: TypeTag.Int32Rect, ...rect });
    }
}

function applyVariantProperty(node: ControlNode, key: string, value: number, variantIndex: number): void {
    const variantKey = `variant${variantIndex}`;
    let variantObject = node.properties.get(variantKey);
    if (!variantObject || variantObject.tag !== TypeTag.Object) {
        variantObject = { tag: TypeTag.Object, value: new Map<string, PropertyValue>() };
        node.properties.set(variantKey, variantObject);
    }

    const intValue = Math.round(value);
    variantObject.value.set(key, { tag: TypeTag.Int32, value: intValue });
    if (variantIndex === 0) {
        node.properties.set(key, { tag: TypeTag.Int32, value: intValue });
    }
}
