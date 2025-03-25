import * as vscode from 'vscode';
import { b4xDefinitionProvider, KeywordInfo, KeywordScope, ModuleType } from './b4xDefinitionProvider';
import { b4xHoverProvider } from './b4xHoverProvider';
import { b4xReferenceProvider } from './b4xReferenceProvider';
import { B4XCompletionItemProvider as b4xCompletionItemProvider } from './b4xCompletionItemProvider';

export function activate(context: vscode.ExtensionContext) 
{
    console.log('扩展已激活！');

    // register definition provider
    const definitionProvider = new b4xDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('b4x', definitionProvider));

    // register hover provider
    const hoverProvider = new b4xHoverProvider();
    context.subscriptions.push(vscode.languages.registerHoverProvider('b4x', hoverProvider));

    //register reference provider
    const referenceProvider = new b4xReferenceProvider();
    context.subscriptions.push(vscode.languages.registerReferenceProvider('b4x', referenceProvider));
    //const t: boolean = true;

    const completionItemProvider = new b4xCompletionItemProvider();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('b4x', completionItemProvider));

    const signatureHelpProvider = new b4xSignatureHelpProvider();
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('b4x', signatureHelpProvider,'(', ','));
    // // Listen for when a .bas file is opened
    // context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    //     if (editor && editor.document.languageId === 'b4x') {
    //         //console.log("it hit.")
    //         CreateGlobalReferenceTableForDocument(context, editor.document);
    //     }
    // }));
}

// 扩展停用时调用
export function deactivate() 
{
    console.log('扩展已停用！');
}

class b4xSignatureHelpProvider implements vscode.SignatureHelpProvider
{
    provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.SignatureHelpContext): vscode.ProviderResult<vscode.SignatureHelp> 
    {
        let retVal = new vscode.SignatureHelp();
        const signatureInfo = new vscode.SignatureInformation('Haha', 'HahaInfoa');
        retVal.signatures = [signatureInfo];
        retVal.activeParameter = 1;
        return retVal;
    }
}
