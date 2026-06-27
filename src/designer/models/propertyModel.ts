/**
 * B4X Designer — Property Model
 *
 * Defines the property metadata system that drives the property grid.
 */

import { ControlNode, PropertyValue, TypeTag, Platform } from './types';
import { getCustomViewDefSync, DesignerProperty } from '../services/libraryLoader';

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
export function readPropertyValue(node: ControlNode, key: string, editor: EditorType, variantIndex: number): unknown {
    // Position/size properties come from the variant data
    if (key === 'left' || key === 'top' || key === 'width' || key === 'height' || key === 'hanchor' || key === 'vanchor') {
        return readVariantProperty(node, key, variantIndex);
    }
    switch (editor) {
        case EditorType.String:
        case EditorType.Font:
            return getStr(node, key, '');
        case EditorType.Int:
            return getInt(node, key, 0);
        case EditorType.Double:
            return getFloat(node, key, 0);
        case EditorType.Bool:
            return getBool(node, key, false);
        case EditorType.Color:
        case EditorType.NullableColor:
            return getColor(node, key);
        case EditorType.Dropdown: {
            // Dropdowns store int or string values
            const v = node.properties.get(key);
            if (!v) { return undefined; }
            if (v.tag === TypeTag.Int32 || v.tag === TypeTag.Float || v.tag === TypeTag.Double) { return v.value; }
            if (v.tag === TypeTag.String || v.tag === TypeTag.StringRef) { return v.value; }
            if (v.tag === TypeTag.Bool) { return v.value; }
            return undefined;
        }
        case EditorType.Rect:
            return getRect(node, key);
        default:
            return undefined;
    }
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
        const parts = cs.split('.');
        return parts[parts.length - 1]; // e.g. "MetaButton"
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
    const typeName = isRoot ? 'MetaMain' : detectControlType(node);
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
        props.push(designerPropertyToDescriptor(dp, cat));
    }
}

function designerPropertyToDescriptor(dp: DesignerProperty, category: string): PropertyDescriptor {
    const desc: PropertyDescriptor = {
        key: dp.key,
        displayName: dp.displayName,
        category,
        description: dp.description ?? dp.displayName,
        editor: fieldTypeToEditor(dp.fieldType),
        isMergeable: true,
        isReadOnly: false,
    };

    if (dp.minRange !== undefined) { desc.min = dp.minRange; }
    if (dp.maxRange !== undefined) { desc.max = dp.maxRange; }

    // If the field is a string with a constrained list, show as dropdown
    if (dp.fieldType === 'string' && dp.list && dp.list.length > 0) {
        desc.editor = EditorType.Dropdown;
        desc.options = dp.list.map(v => ({ label: v, value: v }));
    }

    return desc;
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
            value = readPropertyValue(node, d.key, d.editor as unknown as EditorType, variantIndex);
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
