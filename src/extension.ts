import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as b4xDocumentEvent from './b4xDocumentEvent'
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

    // register folding ranger provider
    context.subscriptions.push(vscode.languages.registerFoldingRangeProvider('b4x', ))

    // register auto-closing for keyword statements
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((xEvent) => {b4xDocumentEvent.onTextChange(xEvent)}));
}

export function deactivate() 
{
    console.log('b4x vscode deactivated');
}

