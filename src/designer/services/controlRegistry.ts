/**
 * B4X Designer — Control Type Registry & Factory
 *
 * Data-driven registry of all control types across B4A and B4J platforms.
 * Provides createControl() to produce new ControlNode instances with correct
 * defaults, type strings, and variant data.
 */

import {
    ControlNode, PropertyValue, TypeTag, Platform,
    IntValue, StringValue, FloatValue, BoolValue, ColorValue, ObjectValue, NullValue,
} from '../models/types';
import { CustomViewDef, DesignerProperty } from './libraryLoader';

// ── Nullable Color Sentinel ──────────────────────────────────────────
// AliceBlue (A=255, R=240, G=248, B=255) serves as the null sentinel in
// nullable color fields.  When a color property has not been explicitly
// set, this ARGB value is used in the layout file to represent null.
const ALICE_BLUE: ColorValue = { tag: TypeTag.Color, a: 255, r: 240, g: 248, b: 255 };

// ── Platform-keyed type strings ──────────────────────────────────────

interface PlatformTypeStrings {
    javaType: Partial<Record<Platform, string>>;
    csType: Partial<Record<Platform, string>>;
}

// ── Control Type Definition ──────────────────────────────────────────

export interface ControlTypeDef {
    /** Display name for the "Add View" menu (e.g. "Button"). */
    displayName: string;
    /** Internal meta type name (e.g. "MetaButton"). */
    metaType: string;
    /** javaType per platform. */
    javaType: Partial<Record<Platform, string>>;
    /** csType per platform (full Dbasic.Designer.Meta* name). */
    csType: Partial<Record<Platform, string>>;
    /** Short B4X type name per platform for Dim statements (e.g. "Button", "EditText", "Pane"). */
    shortTypeName: Partial<Record<Platform, string>>;
    /** Default size when creating a new control. null = use parent default (100×100). */
    defaultSize: { width: number; height: number };
    /** Whether this control can contain children. */
    isContainer: boolean;
    /** Platforms this control is available on. */
    platforms: Platform[];
    /** Default properties set in the constructor (beyond the base MetaControl). */
    defaults: Record<string, PropertyValue>;
    /** Property keys that use the nullable color pattern. */
    nullableColorKeys: string[];
    /**
     * Event signatures per platform. Each string is the event portion after
     * the underscore, e.g. "Click", "TextChanged(Old As String, New As String)".
     * Sourced from B4A Core.xml and B4J jFX.xml library files.
     */
    events: Partial<Record<Platform, string[]>>;
}

// ── Build helpers ────────────────────────────────────────────────────

function strVal(s: string): StringValue { return { tag: TypeTag.StringRef, value: s }; }
function intVal(n: number): IntValue { return { tag: TypeTag.Int32, value: n }; }
function floatVal(n: number): FloatValue { return { tag: TypeTag.Float, value: n }; }
function boolVal(b: boolean): BoolValue { return { tag: TypeTag.Bool, value: b }; }
function colorVal(a: number, r: number, g: number, b: number): ColorValue { return { tag: TypeTag.Color, a, r, g, b }; }
function nullVal(): NullValue { return { tag: TypeTag.Null }; }

const ALL_PLATFORMS: Platform[] = [Platform.B4A, Platform.B4J];

// ── Common Event Sets (from library XML files) ───────────────────────

/** B4J: Events inherited from Node (javafx.scene.Node). */
const B4J_NODE_EVENTS = [
    'MouseClicked(EventData As MouseEvent)',
    'MouseMoved(EventData As MouseEvent)',
    'MouseDragged(EventData As MouseEvent)',
    'MousePressed(EventData As MouseEvent)',
    'MouseReleased(EventData As MouseEvent)',
    'MouseEntered(EventData As MouseEvent)',
    'MouseExited(EventData As MouseEvent)',
    'FocusChanged(HasFocus As Boolean)',
    'AnimationCompleted',
];

/** B4J: Events inherited from Control (extends Node), adds Resize. */
const B4J_CONTROL_EVENTS = [
    'Resize(Width As Double, Height As Double)',
    ...B4J_NODE_EVENTS,
];

// ── Registry ─────────────────────────────────────────────────────────

const REGISTRY: ControlTypeDef[] = [

    // ── Panel ────────────────────────────────────────────────────
    {
        displayName: 'Panel',
        metaType: 'MetaPanel',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.PanelWrapper',
            [Platform.B4J]: 'javafx.scene.layout.Pane',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaPanel',
            [Platform.B4J]: 'Dbasic.Designer.MetaPane',
        },
        shortTypeName: {
            [Platform.B4A]: 'Panel',
            [Platform.B4J]: 'Pane',
        },
        defaultSize: { width: 200, height: 200 },
        isContainer: true,
        platforms: ALL_PLATFORMS,
        defaults: {
            backgroundColor: colorVal(255, 245, 245, 245), // WhiteSmoke
            borderWidth: floatVal(1),
            cornerRadius: floatVal(3),
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['Touch(Action As Int, X As Float, Y As Float)', 'Click', 'LongClick'],
            [Platform.B4J]: ['Resize(Width As Double, Height As Double)', 'Touch(Action As Int, X As Float, Y As Float)', ...B4J_NODE_EVENTS],
        },
    },

    // ── Label ────────────────────────────────────────────────────
    {
        displayName: 'Label',
        metaType: 'MetaLabel',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.LabelWrapper',
            [Platform.B4J]: 'javafx.scene.control.Label',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaLabel',
            [Platform.B4J]: 'Dbasic.Designer.MetaLabel',
        },
        shortTypeName: {
            [Platform.B4A]: 'Label',
            [Platform.B4J]: 'Label',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            text: strVal(''),
            fontAwesome: strVal(''),
            materialIcons: strVal(''),
            textColor: { ...ALICE_BLUE },  // nullable
            multiline: boolVal(false),
            adjustFontSizeToFit: boolVal(false),
            textAlignment: intVal(0),
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['Click', 'LongClick'],
            [Platform.B4J]: [...B4J_CONTROL_EVENTS],
        },
    },

    // ── Button ───────────────────────────────────────────────────
    {
        displayName: 'Button',
        metaType: 'MetaButton',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.ButtonWrapper',
            [Platform.B4J]: 'javafx.scene.control.Button',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaButton',
            [Platform.B4J]: 'Dbasic.Designer.MetaButton',
        },
        shortTypeName: {
            [Platform.B4A]: 'Button',
            [Platform.B4J]: 'Button',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            text: strVal(''),
            fontAwesome: strVal(''),
            materialIcons: strVal(''),
            style: intVal(0),
            textColor: { ...ALICE_BLUE },  // nullable
            pressedTextColor: colorVal(255, 255, 255, 255), // White
            tintColor: { ...ALICE_BLUE },  // nullable
            enabled: boolVal(true),
        },
        nullableColorKeys: ['textColor', 'tintColor'],
        events: {
            [Platform.B4A]: ['Click', 'LongClick'],
            [Platform.B4J]: ['Click', ...B4J_CONTROL_EVENTS],
        },
    },

    // ── TextField ────────────────────────────────────────────────
    {
        displayName: 'TextField',
        metaType: 'MetaTextField',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.EditTextWrapper',
            [Platform.B4J]: 'javafx.scene.control.TextField',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaTextField',
            [Platform.B4J]: 'Dbasic.Designer.MetaTextField',
        },
        shortTypeName: {
            [Platform.B4A]: 'EditText',
            [Platform.B4J]: 'TextField',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },  // nullable
            textAlignment: intVal(0),
            hintText: strVal(''),
            borderStyle: intVal(3),
            adjustFontSizeToFit: boolVal(false),
            showClearButton: boolVal(true),
            enabled: boolVal(true),
            passwordMode: boolVal(false),
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['TextChanged(Old As String, New As String)', 'EnterPressed', 'FocusChanged(HasFocus As Boolean)'],
            [Platform.B4J]: ['Action', 'TextChanged(Old As String, New As String)', 'MouseClicked(EventData As MouseEvent)', 'FocusChanged(HasFocus As Boolean)'],
        },
    },

    // ── TextView ─────────────────────────────────────────────────
    {
        displayName: 'TextView',
        metaType: 'MetaTextView',
        javaType: {
            [Platform.B4J]: 'javafx.scene.control.TextArea',
        },
        csType: {
            [Platform.B4J]: 'Dbasic.Designer.MetaTextArea',
        },
        shortTypeName: {
            [Platform.B4J]: 'TextArea',
        },
        defaultSize: { width: 150, height: 150 },
        isContainer: false,
        platforms: [Platform.B4J],
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },  // nullable
            textAlignment: intVal(0),
            editable: boolVal(true),
            borderWidth: floatVal(1),
            cornerRadius: floatVal(3),
            borderColor: colorVal(255, 128, 128, 128), // Gray
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4J]: ['TextChanged(Old As String, New As String)', 'MouseClicked(EventData As MouseEvent)', 'FocusChanged(HasFocus As Boolean)'],
        },
    },

    // ── ImageView ────────────────────────────────────────────────
    {
        displayName: 'ImageView',
        metaType: 'MetaImageView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.ImageViewWrapper',
            [Platform.B4J]: 'javafx.scene.image.ImageView',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaImageView',
            [Platform.B4J]: 'Dbasic.Designer.MetaImageView',
        },
        shortTypeName: {
            [Platform.B4A]: 'ImageView',
            [Platform.B4J]: 'ImageView',
        },
        defaultSize: { width: 100, height: 100 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            imageFile: strVal(''),
            contentMode: intVal(0),
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['Click', 'LongClick'],
            [Platform.B4J]: [...B4J_NODE_EVENTS],
        },
    },

    // ── ScrollView ───────────────────────────────────────────────
    {
        displayName: 'ScrollView',
        metaType: 'MetaScrollView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.ScrollViewWrapper',
            [Platform.B4J]: 'javafx.scene.control.ScrollPane',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaScrollView',
            [Platform.B4J]: 'Dbasic.Designer.MetaScrollPane',
        },
        shortTypeName: {
            [Platform.B4A]: 'ScrollView',
            [Platform.B4J]: 'ScrollPane',
        },
        defaultSize: { width: 100, height: 100 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            contentWidth: intVal(100),
            contentHeight: intVal(500),
            pagingEnabled: boolVal(false),
            bounces: boolVal(true),
            showsVerticalIndicator: boolVal(true),
            showsHorizontalIndicator: boolVal(true),
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['ScrollChanged(Position As Int)'],
            [Platform.B4J]: ['VScrollChanged(Position As Double)', 'HScrollChanged(Position As Double)', ...B4J_CONTROL_EVENTS],
        },
    },

    // ── WebView ──────────────────────────────────────────────────
    {
        displayName: 'WebView',
        metaType: 'MetaWebView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.WebViewWrapper',
            [Platform.B4J]: 'javafx.scene.web.WebView',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaWebView',
            [Platform.B4J]: 'Dbasic.Designer.MetaWebView',
        },
        shortTypeName: {
            [Platform.B4A]: 'WebView',
            [Platform.B4J]: 'WebView',
        },
        defaultSize: { width: 200, height: 200 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            suppressRendering: boolVal(false),
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['PageFinished(Url As String)', 'OverrideUrl(Url As String) As Boolean'],
            [Platform.B4J]: ['PageFinished(Url As String)', 'LocationChanged(Location As String)', ...B4J_NODE_EVENTS],
        },
    },

    // ── CheckBox (B4A/B4J) ───────────────────────────────────────
    {
        displayName: 'Switch',
        metaType: 'MetaSwitch',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.CheckBoxWrapper',
            [Platform.B4J]: 'javafx.scene.control.CheckBox',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaCheckBox',
            [Platform.B4J]: 'Dbasic.Designer.MetaCheckBox',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            value: boolVal(false),
            onColor: { ...ALICE_BLUE },     // nullable
            offColor: { ...ALICE_BLUE },    // nullable
            thumbColor: { ...ALICE_BLUE },  // nullable
            enabled: boolVal(true),
        },
        nullableColorKeys: ['onColor', 'offColor', 'thumbColor'],
        shortTypeName: {
            [Platform.B4A]: 'CheckBox',
            [Platform.B4J]: 'CheckBox',
        },
        events: {
            [Platform.B4A]: ['CheckedChange(Checked As Boolean)'],
            [Platform.B4J]: ['CheckedChange(Checked As Boolean)', ...B4J_CONTROL_EVENTS],
        },
    },

    // ── SeekBar (B4A) / Slider (B4J) ─────────────────────────────
    {
        displayName: 'Slider',
        metaType: 'MetaSlider',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.SeekBarWrapper',
            [Platform.B4J]: 'javafx.scene.control.Slider',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaSeekBar',
            [Platform.B4J]: 'Dbasic.Designer.MetaSlider',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            value: floatVal(50),
            minimumValue: floatVal(0),
            maximumValue: floatVal(100),
            minimumTrackTintColor: { ...ALICE_BLUE }, // nullable
            continuous: boolVal(true),
            enabled: boolVal(true),
        },
        nullableColorKeys: ['minimumTrackTintColor'],
        shortTypeName: {
            [Platform.B4A]: 'SeekBar',
            [Platform.B4J]: 'Slider',
        },
        events: {
            [Platform.B4A]: ['ValueChanged(Value As Int, FromUser As Boolean)'],
            [Platform.B4J]: ['ValueChanged(Value As Double)', ...B4J_CONTROL_EVENTS],
        },
    },


    // ── ProgressBar (B4A/B4J) ────────────────────────────────────
    {
        displayName: 'ProgressView',
        metaType: 'MetaProgressView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.ProgressDialogWrapper',
            [Platform.B4J]: 'javafx.scene.control.ProgressBar',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaProgressBar',
            [Platform.B4J]: 'Dbasic.Designer.MetaProgressBar',
        },
        defaultSize: { width: 100, height: 30 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            progressColor: { ...ALICE_BLUE }, // nullable
        },
        shortTypeName: {
            [Platform.B4A]: 'ProgressBar',
            [Platform.B4J]: 'ProgressBar',
        },
        nullableColorKeys: ['progressColor'],
        events: {
            [Platform.B4A]: [],
            [Platform.B4J]: [...B4J_CONTROL_EVENTS],
        },
    },

    // ── CustomView ───────────────────────────────────────────────
    {
        displayName: 'CustomView',
        metaType: 'MetaCustomView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.CustomViewWrapper',
            [Platform.B4J]: 'javafx.scene.layout.Pane',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaCustomView',
            [Platform.B4J]: 'Dbasic.Designer.MetaCustomView',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: ALL_PLATFORMS,
        defaults: {
            text: strVal(''),
            fontAwesome: strVal(''),
            materialIcons: strVal(''),
            textColor: { ...ALICE_BLUE },  // nullable
            multiline: boolVal(false),
            adjustFontSizeToFit: boolVal(false),
            textAlignment: intVal(0),
        },
        shortTypeName: {
            [Platform.B4A]: 'CustomView',
            [Platform.B4J]: 'CustomView',
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['Click', 'LongClick'],
            [Platform.B4J]: [...B4J_NODE_EVENTS],
        },
    },

    // ── B4A-only: EditText (MetaEditText) ────────────────────────
    {
        displayName: 'EditText',
        metaType: 'MetaEditText',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.EditTextWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaEditText',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },
            textAlignment: intVal(0),
            hintText: strVal(''),
            passwordMode: boolVal(false),
        },
        shortTypeName: {
            [Platform.B4A]: 'EditText',
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['TextChanged(Old As String, New As String)', 'EnterPressed', 'FocusChanged(HasFocus As Boolean)'],
        },
    },

    // ── B4A-only: CheckBox ───────────────────────────────────────
    {
        displayName: 'CheckBox',
        metaType: 'MetaCheckBox',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.CheckBoxWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaCheckBox',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },
            isChecked: boolVal(false),
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4A]: 'CheckBox',
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['CheckedChange(Checked As Boolean)'],
        },
    },

    // ── B4A-only: RadioButton ────────────────────────────────────
    {
        displayName: 'RadioButton',
        metaType: 'MetaRadioButton',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.RadioButtonWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaRadioButton',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },
            isChecked: boolVal(false),
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4A]: 'RadioButton',
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['CheckedChange(Checked As Boolean)'],
        },
    },

    // ── B4A-only: ToggleButton ───────────────────────────────────
    {
        displayName: 'ToggleButton',
        metaType: 'MetaToggleButton',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.ToggleButtonWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaToggleButton',
        },
        defaultSize: { width: 100, height: 40 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            text: strVal(''),
            textColor: { ...ALICE_BLUE },
            isChecked: boolVal(false),
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4A]: 'ToggleButton',
        },
        nullableColorKeys: ['textColor'],
        events: {
            [Platform.B4A]: ['CheckedChange(Checked As Boolean)'],
        },
    },

    // ── B4A-only: Spinner ────────────────────────────────────────
    {
        displayName: 'Spinner',
        metaType: 'MetaSpinner',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.SpinnerWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaSpinner',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4A]: 'Spinner',
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['ItemClick(Position As Int, Value As Object)'],
        },
    },

    // ── B4A-only: HorizontalScrollView ───────────────────────────
    {
        displayName: 'HorizontalScrollView',
        metaType: 'MetaHorizontalScrollView',
        javaType: {
            [Platform.B4A]: 'anywheresoftware.b4a.objects.HorizontalScrollViewWrapper',
        },
        csType: {
            [Platform.B4A]: 'Dbasic.Designer.MetaHorizontalScrollView',
        },
        defaultSize: { width: 100, height: 100 },
        isContainer: false,
        platforms: [Platform.B4A],
        defaults: {
            contentWidth: intVal(500),
            contentHeight: intVal(100),
        },
        shortTypeName: {
            [Platform.B4A]: 'HorizontalScrollView',
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4A]: ['ScrollChanged(Position As Int)'],
        },
    },

    // ── B4J-only: ComboBox ───────────────────────────────────────
    {
        displayName: 'ComboBox',
        metaType: 'MetaComboBox',
        javaType: {
            [Platform.B4J]: 'javafx.scene.control.ComboBox',
        },
        csType: {
            [Platform.B4J]: 'Dbasic.Designer.MetaComboBox',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: [Platform.B4J],
        defaults: {
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4J]: 'ComboBox',
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4J]: ['ValueChanged(Value As Object)', 'SelectedIndexChanged(Index As Int, Value As Object)'],
        },
    },

    // ── B4J-only: ChoiceBox ──────────────────────────────────────
    {
        displayName: 'ChoiceBox',
        metaType: 'MetaChoiceBox',
        javaType: {
            [Platform.B4J]: 'javafx.scene.control.ChoiceBox',
        },
        csType: {
            [Platform.B4J]: 'Dbasic.Designer.MetaChoiceBox',
        },
        defaultSize: { width: 150, height: 40 },
        isContainer: false,
        platforms: [Platform.B4J],
        defaults: {
            enabled: boolVal(true),
        },
        shortTypeName: {
            [Platform.B4J]: 'ChoiceBox',
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4J]: ['SelectedIndexChanged(Index As Int, Value As Object)'],
        },
    },

    // ── B4J-only: ProgressIndicator ──────────────────────────────
    {
        displayName: 'ProgressIndicator',
        metaType: 'MetaProgressIndicator',
        javaType: {
            [Platform.B4J]: 'javafx.scene.control.ProgressIndicator',
        },
        csType: {
            [Platform.B4J]: 'Dbasic.Designer.MetaProgressIndicator',
        },
        defaultSize: { width: 80, height: 80 },
        isContainer: false,
        platforms: [Platform.B4J],
        defaults: {},
        shortTypeName: {
            [Platform.B4J]: 'ProgressIndicator',
        },
        nullableColorKeys: [],
        events: {
            [Platform.B4J]: [...B4J_CONTROL_EVENTS],
        },
    },
];

// ── Lookup Maps ──────────────────────────────────────────────────────

/** Map: displayName → ControlTypeDef (e.g. "Button" → def). */
const BY_DISPLAY_NAME: Map<string, ControlTypeDef> = new Map();

/** Map: metaType → ControlTypeDef (e.g. "MetaButton" → def). */
const BY_META_TYPE: Map<string, ControlTypeDef> = new Map();

for (const def of REGISTRY) {
    BY_DISPLAY_NAME.set(def.displayName, def);
    BY_META_TYPE.set(def.metaType, def);
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get the list of control type display names available on a given platform.
 * Returns them in alphabetical order for the "Add View" menu.
 */
export function getControlTypesForPlatform(platform: Platform): string[] {
    return REGISTRY
        .filter(d => d.platforms.includes(platform))
        .map(d => d.displayName)
        .sort();
}

/**
 * Look up a ControlTypeDef by display name (e.g. "Button").
 */
export function getControlTypeByName(displayName: string): ControlTypeDef | undefined {
    return BY_DISPLAY_NAME.get(displayName);
}

/**
 * Look up a ControlTypeDef by meta type name (e.g. "MetaButton").
 */
export function getControlTypeByMeta(metaType: string): ControlTypeDef | undefined {
    return BY_META_TYPE.get(metaType);
}

/**
 * Look up a ControlTypeDef by csType string (e.g. "Dbasic.Designer.MetaButton").
 */
export function getControlTypeByCsType(csType: string): ControlTypeDef | undefined {
    const metaType = csTypeToMetaType(csType);
    return BY_META_TYPE.get(metaType);
}

/**
 * Get nullable color property keys for a control's csType string.
 * Used during serialization to apply the AliceBlue null-color pattern.
 */
export function getNullableColorKeys(csType: string): string[] {
    const metaType = csTypeToMetaType(csType);
    const def = BY_META_TYPE.get(metaType);
    return def?.nullableColorKeys ?? [];
}

/**
 * Extract the MetaXxx type name from a full csType string like
 * "Dbasic.Designer.MetaButton" → "MetaButton".
 * Also handles B4J aliases (MetaPane → MetaPanel, MetaTextArea → MetaTextView, etc.).
 */
function csTypeToMetaType(csType: string): string {
    const parts = csType.split('.');
    const raw = parts[parts.length - 1];
    // Handle B4J csType aliases that map to shared meta types
    switch (raw) {
        case 'MetaPane': return 'MetaPanel';
        case 'MetaTextArea': return 'MetaTextView';
        case 'MetaScrollPane': return 'MetaScrollView';
        case 'MetaProgressBar': return 'MetaProgressView';
        default: return raw;
    }
}

// ── Auto-Name Generation ─────────────────────────────────────────────

/**
 * Generate a unique name for a new control of the given type.
 * Follows original designer pattern: "Button1", "Button2", etc.
 */
export function generateControlName(displayName: string, existingNames: Set<string>): string {
    for (let i = 1; ; i++) {
        const candidate = `${displayName}${i}`;
        if (!existingNames.has(candidate)) {
            return candidate;
        }
    }
}

// ── Control Factory ──────────────────────────────────────────────────

/**
 * Create a new ControlNode for the given control type display name.
 * Sets up all default properties, type strings, and variant layout data.
 *
 * @param displayName The control type (e.g. "Button", "Label", "Panel").
 * @param platform The current platform.
 * @param existingNames Set of existing control names in the layout.
 * @param x Initial x position (in dp/points).
 * @param y Initial y position (in dp/points).
 * @param variantCount Number of variants in the layout.
 * @param sourceVariantIndex The variant being viewed (copied to all other variants).
 * @param gridSize Grid snap size for rounding position.
 */
export function createControl(
    displayName: string,
    platform: Platform,
    existingNames: Set<string>,
    x: number,
    y: number,
    variantCount: number,
    sourceVariantIndex: number,
    gridSize: number,
): ControlNode | null {
    const def = BY_DISPLAY_NAME.get(displayName);
    if (!def) { return null; }
    if (!def.platforms.includes(platform)) { return null; }

    const name = generateControlName(displayName, existingNames);
    const javaType = def.javaType[platform] ?? '';
    const csType = def.csType[platform] ?? '';

    // Snap position to grid
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    // Build the property map
    const props = new Map<string, PropertyValue>();

    // Identification properties
    props.set('name', strVal(name));
    props.set('eventName', strVal(name));
    props.set('javaType', strVal(javaType));
    props.set('csType', strVal(csType));
    props.set('parent', strVal(''));

    // Common defaults
    props.set('visible', boolVal(true));
    props.set('tag', strVal(''));

    // Type-specific defaults
    for (const [key, value] of Object.entries(def.defaults)) {
        props.set(key, clonePropertyValue(value));
    }

    // Per-variant layout data (same initial position/size for all variants)
    for (let vi = 0; vi < variantCount; vi++) {
        const variantData = new Map<string, PropertyValue>();
        variantData.set('left', intVal(snappedX));
        variantData.set('top', intVal(snappedY));
        variantData.set('width', intVal(def.defaultSize.width));
        variantData.set('height', intVal(def.defaultSize.height));
        variantData.set('hanchor', intVal(0));
        variantData.set('vanchor', intVal(0));
        const variantObj: ObjectValue = { tag: TypeTag.Object, value: variantData };
        props.set(`variant${vi}`, variantObj);
    }

    const node: ControlNode = {
        properties: props,
        children: def.isContainer ? [] : [],
    };

    return node;
}

/**
 * Deep-clone a PropertyValue so each control gets independent copies.
 */
export function clonePropertyValue(pv: PropertyValue): PropertyValue {
    switch (pv.tag) {
        case TypeTag.Object: {
            const newMap = new Map<string, PropertyValue>();
            for (const [k, v] of pv.value) {
                newMap.set(k, clonePropertyValue(v));
            }
            return { tag: TypeTag.Object, value: newMap };
        }
        case TypeTag.Color:
            return { tag: TypeTag.Color, a: pv.a, r: pv.r, g: pv.g, b: pv.b };
        case TypeTag.Int32Rect:
            return { tag: TypeTag.Int32Rect, x: pv.x, y: pv.y, width: pv.width, height: pv.height };
        default:
            // Primitives (int, float, double, bool, string, null, erref) are immutable
            return { ...pv } as PropertyValue;
    }
}

/**
 * Deep-clone an entire ControlNode tree (control + all children + all properties).
 * Used by clipboard copy/paste to create independent copies.
 */
export function deepCloneControlNode(node: ControlNode): ControlNode {
    const newProps = new Map<string, PropertyValue>();
    for (const [key, value] of node.properties) {
        newProps.set(key, clonePropertyValue(value));
    }
    return {
        properties: newProps,
        children: node.children.map(child => deepCloneControlNode(child)),
    };
}

// ── Manifest Entry Helpers ───────────────────────────────────────────

/**
 * Collect manifest entries from the control tree (flattened, in tree order).
 * Each non-root control gets an entry: { name, javaType, csType }.
 */
export function collectManifestEntries(
    root: ControlNode,
): { name: string; javaType: string; csType: string }[] {
    const entries: { name: string; javaType: string; csType: string }[] = [];
    collectManifestRecursive(root, entries, true);
    return entries;
}

function collectManifestRecursive(
    node: ControlNode,
    entries: { name: string; javaType: string; csType: string }[],
    isRoot: boolean,
): void {
    if (!isRoot) {
        const name = getStrProp(node, 'name');
        const javaType = getStrProp(node, 'javaType');
        const csType = getStrProp(node, 'csType');
        if (name) {
            entries.push({ name, javaType, csType });
        }
    }
    for (const child of node.children) {
        collectManifestRecursive(child, entries, false);
    }
}

function getStrProp(node: ControlNode, key: string): string {
    const v = node.properties.get(key);
    if (!v) { return ''; }
    if (v.tag === TypeTag.String || v.tag === TypeTag.StringRef) { return v.value; }
    return '';
}

// ── Re-export for type convenience ───────────────────────────────────

export { ALICE_BLUE };

// ── Custom View Factory ──────────────────────────────────────────────

/**
 * Create a ControlNode for a specific custom view type (e.g. "CustomListView").
 * Uses the base CustomView template from the registry and sets:
 *   - `customType` = javaType from the library definition
 *   - `shortType` = shortName from the library definition
 *   - Default values for all designer properties from the library XML
 *
 * Matches the designer behavior of setting
 * metaControl["customType"] and metaControl["shortType"].
 */
export function createCustomViewControl(
    customViewDef: CustomViewDef,
    platform: Platform,
    existingNames: Set<string>,
    x: number,
    y: number,
    variantCount: number,
    sourceVariantIndex: number,
    gridSize: number,
): ControlNode | null {
    const baseDef = BY_DISPLAY_NAME.get('CustomView');
    if (!baseDef) { return null; }

    const name = generateControlName(customViewDef.shortName, existingNames);
    const javaType = customViewDef.javaType;
    const csType = baseDef.csType[platform] ?? 'Dbasic.Designer.MetaCustomView';

    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    const props = new Map<string, PropertyValue>();

    // Identification properties
    props.set('name', strVal(name));
    props.set('eventName', strVal(name));
    props.set('javaType', strVal(javaType));
    props.set('csType', strVal(csType));
    props.set('parent', strVal(''));

    // Custom view type identifiers
    props.set('customType', strVal(javaType));
    props.set('shortType', strVal(customViewDef.shortName));

    // Common defaults
    props.set('visible', boolVal(true));
    props.set('tag', strVal(''));

    // Base CustomView defaults (text, fontAwesome, etc.)
    for (const [key, value] of Object.entries(baseDef.defaults)) {
        props.set(key, clonePropertyValue(value));
    }

    // Apply designer property defaults from the library XML
    for (const dp of customViewDef.designerProperties) {
        const pv = designerPropertyToValue(dp);
        if (pv) {
            props.set(dp.key, pv);
        }
    }

    // Per-variant layout data
    for (let vi = 0; vi < variantCount; vi++) {
        const variantData = new Map<string, PropertyValue>();
        variantData.set('left', intVal(snappedX));
        variantData.set('top', intVal(snappedY));
        variantData.set('width', intVal(baseDef.defaultSize.width));
        variantData.set('height', intVal(baseDef.defaultSize.height));
        variantData.set('hanchor', intVal(0));
        variantData.set('vanchor', intVal(0));
        const variantObj: ObjectValue = { tag: TypeTag.Object, value: variantData };
        props.set(`variant${vi}`, variantObj);
    }

    return {
        properties: props,
        children: [],
    };
}

/**
 * Convert a DesignerProperty default value to a PropertyValue.
 */
function designerPropertyToValue(dp: DesignerProperty): PropertyValue | null {
    switch (dp.fieldType) {
        case 'int': {
            const n = parseInt(dp.defaultValue, 10);
            return isNaN(n) ? intVal(0) : intVal(n);
        }
        case 'float': {
            const n = parseFloat(dp.defaultValue);
            return isNaN(n) ? floatVal(0) : floatVal(n);
        }
        case 'boolean':
            return boolVal(dp.defaultValue.toLowerCase() === 'true');
        case 'string':
            return strVal(dp.defaultValue);
        case 'color': {
            if (dp.defaultValue.toLowerCase() === 'null') {
                return { ...ALICE_BLUE }; // nullable color default
            }
            return parseColorDefault(dp.defaultValue);
        }
    }
    return null;
}

/**
 * Parse a color default value like "0xFFA9A9A9" or "#RRGGBB".
 */
function parseColorDefault(s: string): ColorValue {
    let hex = s.replace(/^(0x|#)/, '');
    if (hex.length === 6) { hex = 'FF' + hex; } // no alpha → full opacity
    const val = parseInt(hex, 16);
    if (isNaN(val)) { return colorVal(255, 0, 0, 0); }
    const a = (val >>> 24) & 0xFF;
    const r = (val >>> 16) & 0xFF;
    const g = (val >>> 8) & 0xFF;
    const b = val & 0xFF;
    return colorVal(a, r, g, b);
}
