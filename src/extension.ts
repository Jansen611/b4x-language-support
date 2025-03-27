import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as comRegExp from './comRegExp';
import { b4xHoverProvider } from './b4xHoverProvider';
import { b4xReferenceProvider } from './b4xReferenceProvider';
import { B4XCompletionItemProvider as b4xCompletionItemProvider } from './b4xCompletionItemProvider';
import { sign } from 'crypto';

export function activate(context: vscode.ExtensionContext) 
{
    console.log('扩展已激活！');

    // register definition provider
    const definitionProvider = new b4xDefinitionProvider.b4xDefinitionProvider();
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
        // check the triggering character, if it is '(', we need to find the function name first
        const signatures: vscode.SignatureInformation[] = [];
        if (context.triggerCharacter == '(') 
        {
            const funcNamePosition = new vscode.Position(position.line, position.character - 1);
            const funcNameRange: vscode.Range | undefined = document.getWordRangeAtPosition(funcNamePosition);
            const funcName: string = funcNameRange? document.getText(funcNameRange) : '';

            let declaration: string | undefined = b4xDefinitionProvider.getDeclarationStringFromSearch(document, funcName, funcNamePosition.line);
            if (declaration)
            {
                const variableMatchRegEx_GI = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive + comRegExp.Flag.Global)
                const variableMatchRegEx_I = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive)
                const variableMatchResult = declaration.match(variableMatchRegEx_GI);
                // matchFound, there is paramaters
                if (variableMatchResult)
                {
                    let paramaterList: string[] = [];
                    for (const match of variableMatchResult)
                    {
                        const variableMatchResult_I = match.match(variableMatchRegEx_I);
                        // if match is null, work on the next match
                        if (!variableMatchResult_I){continue;}
                        paramaterList.push(match)
                    }
                    let signatureInfo = new vscode.SignatureInformation(declaration, `parameter 1: ${paramaterList[0]}`);
                    
                signatures.push(signatureInfo);

                }
        // for (let i = 0; i < functionParameters.length; i++) {
        //         `${currentFunctionCall functionName}(${functionParameters[i]})`,
        //         `Parameter ${i + 1}: ${functionParameters[i]}`
        //     ));
        // }
            }
        }

        let retVal = new vscode.SignatureHelp();
        retVal.signatures = signatures;
        retVal.activeParameter = 1;
        return retVal;
    }

    private getCurrentFunctionCall(code: string): { functionName: string, parametersPosition: number } | null {
        // 这里需要实现逻辑，找出当前位置的函数调用
        // 例如：解析最近的"call("或自定义语法
        // 返回函数名和参数的位置索引
        return { functionName: 'exampleFunction', parametersPosition: 0 };
    }
}
