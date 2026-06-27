# B4X Language Support - VSCode Extension

[English](./README.md) | [中文](./README_CN.md)

Provides enhanced language support for B4X (B4A, B4i, B4J) in Visual Studio Code, including a full visual layout designer.

<img src="assets/Logo.png" width="150">

## Features

### B4X Language Services
- **Syntax Highlighting**: Full syntax coloring for `.bas`, `.b4a`, `.b4i`, and `.b4j` files.
- **Code Snippets**: Quick insertion of common B4X code structures.
- **Language Configuration**: Bracket matching, comment toggling, and auto-indentation.
- **Definition Provider**: Jump to definition of variables, subs, and members.
- **Hover Provider**: Type information and scope (global/local/parameter) on hover.
- **Reference Provider**: Find all references to a symbol.
- **Completion Provider**: Auto-completion for keywords, variables, functions, and base class members (e.g. `List.Add`, `Map.Put`, `String.Length`).
- **Signature Help**: Function signature tips when typing `(` or `,`.
- **Auto-Closing Statements**: Typing `If` automatically inserts `End If`, `For` inserts `Next`, etc.

### Integrated B4X Layout View
- **Visual Layout Editor**: Open `.bjl` (B4J) and `.bal` (B4A) files in a visual designer canvas with drag, resize, select, zoom, and pan.
- **Property Grid**: Sidebar panel for editing control properties (name, position, size, anchors, etc.) with platform-specific editors.
- **Multi-Variant Support**: Manage screen size variants — phone, tablet, portrait, landscape — with predefined layouts and a closest-match algorithm. Add/remove/switch variants on the fly.
- **Designer Script Engine**: Run B4X-dialect designer scripts (e.g. `AutoScaleAll`, `AutoScaleRate`) that programmatically adjust control positions and sizes per variant.
- **Custom View Support**: Load custom views from B4X library XML descriptors via the `b4x.libraryPaths` setting. Custom views appear in the **Add View > CustomView** menu.
- **Clipboard Operations**: Copy, Cut, Paste, and Duplicate controls with standard keyboard shortcuts (Ctrl/Cmd+C/X/V/D).
- **Code Generation**: Insert `Dim` declarations and event `Sub` handlers directly into the associated `.bas` source file from the designer.
- **New Layout File**: Create new `.bjl`/`.bal` layout files with the `B4X: New Layout File...` command. Automatically discovers B4A/B4J projects in the workspace.

### AI Agent CLI Tools
- **`b4x-cli`**: A CLI tool automatically available in the integrated terminal for converting layout files between binary (`.bjl`/`.bal`) and JSON formats — designed for AI agent consumption.
  - `b4x-cli to-json <layout>` — binary to JSON
  - `b4x-cli from-json <json> -o <layout>` — JSON to binary

## Installation
1. Open VSCode.
2. Press `Ctrl+Shift+X` (or click the Extensions sidebar icon).
3. Search for `B4X`, then click Install.

## Issue Reporting
Encounter problems? Please submit to [GitHub Issues](https://github.com/Jansen611/b4x-language-support/issues).

## Credits
- **Anywhere Software**: For creating the [B4X Rad dev tools](https://www.b4x.com/) and maintaining the [B4X community](https://www.b4x.com/android/forum/).

## License
MIT © [Jansen](https://github.com/Jansen611)
