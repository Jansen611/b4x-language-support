/**
 * B4X Code Generation — Insert Dim declarations and event Subs into source files.
 *
 * Extracted from the legacy bridge server (b4xBridgeServer.ts) for direct use
 * by the integrated designer (b4xDesigner.ts).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const SOURCE_EXTENSION = '.bas';

// ── Public API ───────────────────────────────────────────────────────

/**
 * Find the source file (.bas) associated with a layout file, open it,
 * and insert a Dim declaration.
 */
export async function generateDim(layoutFile: string, code: string): Promise<void> {
    const editor = await openSourceEditor(layoutFile);
    if (!editor) { return; }
    await insertDimDeclaration(editor, code);
}

/**
 * Find the source file (.bas) associated with a layout file, open it,
 * and append an event Sub.
 */
export async function generateEventSub(layoutFile: string, code: string): Promise<void> {
    const editor = await openSourceEditor(layoutFile);
    if (!editor) { return; }
    await appendEventSub(editor, code);
}

/**
 * Navigate to the selected control's code in the source file.
 * Searches for event handler Subs or Dim declarations.
 */
export async function viewCode(layoutFile: string, viewName: string): Promise<void> {
    if (!viewName || !layoutFile) { return; }

    const sourceUri = await findSourceFile(layoutFile);
    if (!sourceUri) {
        vscode.window.showWarningMessage(
            `Could not find source file for layout: ${path.basename(layoutFile)}`
        );
        return;
    }

    const doc = await vscode.workspace.openTextDocument(sourceUri);
    const editor = await vscode.window.showTextDocument(doc);
    const text = doc.getText();
    const escaped = escapeRegex(viewName);

    // Search priority: 1) Sub viewName_* (event handler), 2) Private/Dim viewName As (declaration)
    const patterns = [
        new RegExp(`^\\s*(?:Private\\s+)?Sub\\s+${escaped}_`, 'mi'),
        new RegExp(`^\\s*(?:Private|Dim)\\s+${escaped}\\s+As\\s+`, 'mi'),
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
            const pos = doc.positionAt(match.index);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(
                new vscode.Range(pos, pos),
                vscode.TextEditorRevealType.InCenter,
            );
            return;
        }
    }

    vscode.window.showInformationMessage(`No code found for "${viewName}" — showing source file.`);
}

// ── Source file resolution ───────────────────────────────────────────

async function openSourceEditor(layoutFile: string): Promise<vscode.TextEditor | null> {
    const sourceUri = await findSourceFile(layoutFile);
    if (!sourceUri) {
        vscode.window.showWarningMessage(
            `Could not find source file for layout: ${path.basename(layoutFile)}`
        );
        return null;
    }
    const doc = await vscode.workspace.openTextDocument(sourceUri);
    return vscode.window.showTextDocument(doc);
}

/**
 * Find the source file (.bas) associated with a layout file.
 *
 * B4X code can load layouts via several calls:
 *   LoadLayout("name") / Activity.LoadLayout("name") / panel.LoadLayout("name")
 *   LoadTab("name") / AddTab("name")
 *
 * Searches project dir + parent dir for cross-platform projects.
 * If no unique match, shows a QuickPick.
 */
async function findSourceFile(layoutFile: string): Promise<vscode.Uri | null> {
    const layoutExt = path.extname(layoutFile).toLowerCase();
    if (!['.bil', '.bjl', '.bal'].includes(layoutExt)) { return null; }

    const layoutName = path.basename(layoutFile, layoutExt).toLowerCase();

    const layoutDir = path.dirname(layoutFile);
    const projectDir = path.basename(layoutDir).toLowerCase() === 'files'
        ? path.dirname(layoutDir)
        : layoutDir;

    // Gather .bas files from project directory AND its parent.
    // B4X cross-platform projects have shared modules in a parent directory.
    let files: vscode.Uri[] = [];
    const parentDir = path.dirname(projectDir);
    const dirsToScan = [projectDir];

    const dirBase = path.basename(projectDir).toLowerCase();
    if (['b4a', 'b4i', 'b4j'].includes(dirBase) && parentDir !== projectDir) {
        dirsToScan.push(parentDir);
    }

    for (const dir of dirsToScan) {
        const pattern = new vscode.RelativePattern(dir, `*${SOURCE_EXTENSION}`);
        const found = await vscode.workspace.findFiles(pattern, null, 100);
        if (found.length > 0) {
            files.push(...found);
        } else {
            const scanned = scanForBasFiles(dir);
            files.push(...scanned);
        }
    }

    // Workspace-wide fallback
    if (files.length === 0) {
        files = await vscode.workspace.findFiles(`**/*${SOURCE_EXTENSION}`, '**/node_modules/**', 50);
    }

    if (files.length === 0) { return null; }

    // Search for the file that references this layout
    const match = await findFileWithLayout(files, layoutName);
    if (match) { return match; }

    // Single file — use it as fallback
    if (files.length === 1) { return files[0]; }

    // Show QuickPick
    return showSourceFilePicker(files, layoutName);
}

function scanForBasFiles(dir: string): vscode.Uri[] {
    try {
        const entries = fs.readdirSync(dir);
        return entries
            .filter(e => e.toLowerCase().endsWith(SOURCE_EXTENSION))
            .map(e => vscode.Uri.file(path.join(dir, e)));
    } catch {
        return [];
    }
}

async function findFileWithLayout(files: vscode.Uri[], layoutName: string): Promise<vscode.Uri | null> {
    const escaped = escapeRegex(layoutName);
    const loadPattern = new RegExp(
        `(?:LoadLayout|LoadTab|AddTab)\\s*\\(\\s*"${escaped}"`,
        'i',
    );

    for (const file of files) {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            if (loadPattern.test(doc.getText())) { return file; }
        } catch { /* skip unreadable */ }
    }

    return null;
}

async function showSourceFilePicker(files: vscode.Uri[], layoutName: string): Promise<vscode.Uri | null> {
    const items = files.map(f => ({
        label: path.basename(f.fsPath),
        description: path.dirname(f.fsPath),
        uri: f,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Select source file for layout "${layoutName}"`,
        title: 'B4X: Insert Generated Code',
    });

    return picked ? picked.uri : null;
}

// ── Dim declaration insertion ────────────────────────────────────────

async function insertDimDeclaration(editor: vscode.TextEditor, code: string): Promise<void> {
    const doc = editor.document;
    const text = doc.getText();

    // Extract variable name and type (e.g. "Private btn As Button" → "btn", "Button")
    const varMatch = code.match(/(?:Private|Dim)\s+(\w+)\s+As\s+(\S+)/i);
    const varName = varMatch ? varMatch[1] : null;
    const newType = varMatch ? varMatch[2] : null;

    // Check if already declared
    if (varName) {
        const existingPattern = new RegExp(
            `^(\\s*(?:Private|Dim)\\s+${escapeRegex(varName)}\\s+As\\s+)(\\S+)`,
            'mi',
        );
        const existingMatch = existingPattern.exec(text);
        if (existingMatch) {
            const existingType = existingMatch[2];
            if (newType && existingType.toLowerCase() !== newType.toLowerCase()) {
                const pick = await vscode.window.showQuickPick(
                    [
                        { label: `Replace with ${newType}`, value: 'replace' },
                        { label: 'Keep existing', value: 'keep' },
                    ],
                    { placeHolder: `${varName} is already declared as ${existingType}. Change to ${newType}?` },
                );
                if (pick?.value === 'replace') {
                    const prefixLen = existingMatch[1].length;
                    const typeLen = existingMatch[2].length;
                    const typeStartOffset = existingMatch.index + prefixLen;
                    const typeEndOffset = typeStartOffset + typeLen;
                    const startPos = doc.positionAt(typeStartOffset);
                    const endPos = doc.positionAt(typeEndOffset);
                    await editor.edit(editBuilder => {
                        editBuilder.replace(new vscode.Range(startPos, endPos), newType);
                    });
                    vscode.window.showInformationMessage(`Changed ${varName} type to ${newType}.`);
                }
                return;
            }
            vscode.window.showInformationMessage(`${varName} is already declared as ${existingType}.`);
            return;
        }
    }

    // Find Sub Class_Globals / Process_Globals / Globals
    const globalsLinePattern = /^\s*Sub\s+(Class_Globals|Process_Globals|Globals)\b/i;
    let bestLine = -1;
    let bestPriority = -1;
    const priorityMap: Record<string, number> = {
        'class_globals': 3,
        'process_globals': 2,
        'globals': 1,
    };

    for (let i = 0; i < doc.lineCount; i++) {
        const lineText = doc.lineAt(i).text;
        const lineMatch = globalsLinePattern.exec(lineText);
        if (lineMatch) {
            const p = priorityMap[lineMatch[1].toLowerCase()] || 0;
            if (p > bestPriority) {
                bestPriority = p;
                bestLine = i;
            }
        }
    }

    if (bestLine < 0) {
        vscode.window.showWarningMessage('Could not find Sub Globals, Sub Class_Globals, or Sub Process_Globals in the source file.');
        return;
    }

    const insertLine = bestLine + 1;
    const insertText = `\t${code}\n`;
    await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(insertLine, 0), insertText);
    });

    const insertedPos = new vscode.Position(insertLine, 0);
    editor.selection = new vscode.Selection(insertedPos, insertedPos);
    editor.revealRange(new vscode.Range(insertedPos, insertedPos));
}

// ── Event Sub appending ──────────────────────────────────────────────

async function appendEventSub(editor: vscode.TextEditor, code: string): Promise<void> {
    const doc = editor.document;
    const text = doc.getText();

    const subMatch = code.match(/Sub\s+(\w+)/i);
    const subName = subMatch ? subMatch[1] : null;

    if (subName) {
        const existingPattern = new RegExp(
            `^\\s*(?:Private\\s+)?Sub\\s+${escapeRegex(subName)}\\b`,
            'mi',
        );
        if (existingPattern.test(text)) {
            const existingMatch = existingPattern.exec(text);
            if (existingMatch) {
                const pos = doc.positionAt(existingMatch.index);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
                vscode.window.showInformationMessage(`Sub ${subName} already exists — navigated to it.`);
            }
            return;
        }
    }

    const lastLine = doc.lineCount - 1;
    const lastChar = doc.lineAt(lastLine).text.length;
    const endPos = new vscode.Position(lastLine, lastChar);

    const insertText = `\n\n${code}`;
    await editor.edit(editBuilder => {
        editBuilder.insert(endPos, insertText);
    });

    const newPos = new vscode.Position(lastLine + 2, 0);
    editor.selection = new vscode.Selection(newPos, newPos);
    editor.revealRange(new vscode.Range(newPos, newPos));
}

// ── Utility ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
