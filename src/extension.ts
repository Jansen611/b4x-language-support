import * as vscode from 'vscode';
import * as path from 'path';
import * as b4xDefinitionProvider from './server/providers/definition';
import * as b4xDocumentEvent from './server/documentEvents'
import { b4xHoverProvider } from './server/providers/hover';
import { b4xReferenceProvider } from './server/providers/reference';
import { B4XCompletionItemProvider as b4xCompletionItemProvider } from './server/providers/completion';
import { b4xSignatureHelpProvider } from './server/providers/signatureHelp';
import { b4xFoldingRangeProvider } from './server/providers/folding';
import { B4XLayoutEditorProvider } from './designer/editor';
import { B4XPropertyGridViewProvider } from './designer';
import { installCliWrappers } from './designer/cli/install';
import { registerCreateLayoutFileCommand } from './designer/layoutCreation';

async function preventDesignerTabUndock(): Promise<void> {
    try {
        const editorConfig = vscode.workspace.getConfiguration('workbench.editor');
        const dragToOpenWindow = editorConfig.get<boolean>('dragToOpenWindow', true);
        if (dragToOpenWindow !== false) {
            await editorConfig.update('dragToOpenWindow', false, vscode.ConfigurationTarget.Workspace);
        }
    } catch (err) {
        console.warn('[B4X] Failed to enforce workbench.editor.dragToOpenWindow=false:', err);
    }
}

export function activate(context: vscode.ExtensionContext) 
{
    console.log('b4x vscode activated');

    // Prevent tabs (including designer tabs) from being dragged into floating windows.
    void preventDesignerTabUndock();

    // register definition provider
    const definitionProvider = new b4xDefinitionProvider.b4xDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('b4x', definitionProvider));

    // register hover provider
    const hoverProvider = new b4xHoverProvider();
    context.subscriptions.push(vscode.languages.registerHoverProvider('b4x', hoverProvider));

    //register reference provider
    const referenceProvider = new b4xReferenceProvider();
    context.subscriptions.push(vscode.languages.registerReferenceProvider('b4x', referenceProvider));

    // register completion provider
    const completionItemProvider = new b4xCompletionItemProvider();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('b4x', completionItemProvider, '.'));

    // register signature provider, only activate when '(' and ',' is pressed
    const signatureHelpProvider = new b4xSignatureHelpProvider();
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('b4x', signatureHelpProvider,'(', ','));

    // register folding ranger provider
    //const foldingRangeProvider = new b4xFoldingRangeProvider();
    //context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('b4x', foldingRangeProvider))

    // register text change event for feature such as "auto-closing for keyword statements"
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((xTextChangeEvent) => {b4xDocumentEvent.onTextChange(xTextChangeEvent)}));

    // register document change event for feature such as "function blocks assignment"
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((xNewDocEditor) => {
            if (xNewDocEditor && xNewDocEditor.document.languageId === 'b4x') {
                b4xDocumentEvent.onDocumentChange(xNewDocEditor);
            }
        })
    );

    // perform any required initialisation
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'b4x') {
        b4xDocumentEvent.onDocumentChange(editor);
    }

    // register "Open in B4X Designer" context menu command
    context.subscriptions.push(
        vscode.commands.registerCommand('b4x.openDesigner', (uri: vscode.Uri) => {
            if (uri) {
                vscode.commands.executeCommand('vscode.openWith', uri, B4XLayoutEditorProvider.viewType);
            }
        })
    );

    // register "New B4X Layout File" command
    context.subscriptions.push(registerCreateLayoutFileCommand(B4XLayoutEditorProvider.viewType));

    // register custom editor for layout files (.bjl, .bal)
    const designerProvider = new B4XLayoutEditorProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            B4XLayoutEditorProvider.viewType,
            designerProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // register clipboard commands for the designer webview
    for (const action of ['copy', 'cut', 'paste', 'duplicate'] as const) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`b4x.designer.${action}`, () => {
                designerProvider.sendClipboardAction(action);
            })
        );
    }

    // register property grid sidebar view
    const propGridProvider = new B4XPropertyGridViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            B4XPropertyGridViewProvider.viewType,
            propGridProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Inject the b4x-cli CLI into every integrated terminal's PATH.
    // The wrapper scripts forward to out/cli/index.js so that agents and
    // users can run `b4x-cli to-json` / `b4x-cli from-json` directly
    // without any global npm install.
    const cliBinDir = path.join(context.globalStorageUri.fsPath, 'bin');
    try {
        installCliWrappers(context.extensionPath, cliBinDir);
        context.environmentVariableCollection.prepend('PATH', cliBinDir + path.delimiter);
    } catch (err) {
        console.warn('[B4X] Failed to install CLI wrappers:', err);
    }

}

export function deactivate() 
{
    console.log('b4x vscode deactivated');
}

