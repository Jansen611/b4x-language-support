# Change Log

All notable changes to the "b4x-language-support" extension will be documented in this file.

## [1.0.1] - B4i Layout Designer (.bil) Support
- **Features**:
  - Added full B4i layout designer support for `.bil` files — visual editor, property grid, and variants
  - Added B4i control registry with platform-specific controls and property descriptors
  - Added B4i layout creation support in the `B4X: New Layout File...` command
  - Added `.bil` support to CLI tools (`b4x-cli to-json` / `from-json`)
  - Added B4i code generation support
- **Credits**:
  - Special thanks to **Erel** from Anywhere Software for granting permission to include the `.bil` layout designer in this extension.

## [1.0.0] - Visual Layout Designer & Language Server
- **Features**:
  - Visual Layout Designer with drag-and-drop support for `.bjl`/`.bal` files
  - Property grid panel for editing view properties
  - Multi-screen variant support
  - Custom view library loader
  - Layout scripting engine
  - JSON schema validation for layout files
  - Code completion, hover, go-to-definition, and signature help
  - Syntax highlighting for B4X (B4A/B4i/B4J) `.bas` files
  - Code snippets for common B4X structures
  - CLI tools for layout file conversion (to-json/from-json)

## [0.1.8] - Auto keywords closes, B4X baseclass features and bug fixes
- **Enhancements**:
  - Added Hover support for b4x baseclass members.
  - Added auto complete for b4x keywords such as "If (End If)" "For (Next)" ect.
  - Removed snippets that create "Sub" since now auto complete can achieve the same.
- **Bug fixes**:
  - Fixed line comment not working when there is a '|' in the comment.

## [0.1.6] - More keywords support and bug fixes
- **Enhancements**:
  - Added more keywords support including "DateTime", "Bit", "Regex"
  - Added TypeName and Member lookup for additional B4X base class: "Matcher"
- **Bug fixes**:
  - Fixed issue where auto indent rule not working
  - Fixed colour highlight for some b4x keywords.

## [0.1.5] - More keywords support and Cursor compatibility
- **Enhancements**:
  - Added more keywords support including #if, #else #region etc
  - Added ".b4a", ".b4i", ".b4j" to auto extension detection
  - Added TypeName and Member lookup for two more B4X base class: "Intent", "Activity"
  - Added variable scope in hover; eg. variables will show like this: "(global/local/parameter) Name As TypeName"
- **Bug fixes**:
  - Fixed some keywords not highlighted bug: "For Each" and "Exit"
  - Fixed hover error where parameter-variable and local-variable sometimes can sometimes not showing

## [0.1.3] - Added support for more B4X base classes
- **Enhancements**:
  - Added TypeName lookup for some B4X base class: "Char", "Boolean", "Int", "List", "Map", "String" and "Timer"
  - Added Member lookup for more B4X base class: "Timer" and "String"
  - Remove completion suggestion when naming a member or method
- **Documentation**:
  - Initial changelog setup.

## [0.1.0] - Initial release
- **Features**:
  - Basic syntax highlighting for `.bas` files.
  - Code snippets for common B4X structures.
  - Language configuration (bracket matching, comment toggling).
  - Language services:
    - Definition provider for members.
    - Hover tooltips.
    - Reference lookup.
    - Basic autocompletion.
    - Signature help.