import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import { b4xHoverProvider } from './b4xHoverProvider';
import { b4xReferenceProvider } from './b4xReferenceProvider';
import { B4XCompletionItemProvider as b4xCompletionItemProvider } from './b4xCompletionItemProvider';
import { b4xSignatureHelpProvider } from './b4xSignatureHelpProvider';

export function activate(context: vscode.ExtensionContext) 
{
    console.log('b4x vscode activated');

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

    // register auto-closing for Sub/If statements
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.contentChanges.length === 0) return;

            const change = event.contentChanges[0];
            if (change.text.match('\n'))
            {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document.languageId !== 'b4x') return;
    
                const line = editor.document.lineAt(change.range.start.line);
                const lineText = line.text.trim();
    
                // Check if the line ends with Sub or If
                if (lineText.match("^\\s*(Public |Private )?\\b((Try|For|Select|Sub)|If|If\\b.*\\bThen)\\b.*$")) {
                    //const closingStatement = lineText.endsWith('Sub') ? 'End Sub' : 'End If';
                    const closingStatement = 'End If';
                    
                    editor.edit((editBuilder) => {
                        const nextLine = line.lineNumber + 2;
                        const nextLinePos = new vscode.Position(nextLine, 0);
                        editBuilder.insert(nextLinePos, `\t${closingStatement}\n`);
                    });
                }
            }
        })
    );
}

export function deactivate() 
{
    console.log('b4x vscode deactivated');
}

