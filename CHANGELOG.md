# Change Log

All notable changes to the "b4x-language-support" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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