# Change Log

All notable changes to the "b4x-language-support" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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