import * as vscode from 'vscode';
import { b4xDefinitionProvider, KeywordInfo, KeywordScope, ModuleType } from './b4xDefinitionProvider';
import { b4xHoverProvider } from './b4xHoverProvider';
import { b4xReferenceProvider } from './b4xReferenceProvider';
import { B4XCompletionItemProvider } from './b4xCompletionItemProvider';

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

    const provider = new B4XCompletionItemProvider();
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('b4x', provider));

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

// function CreateGlobalReferenceTableForDocument(context : vscode.ExtensionContext, document: vscode.TextDocument): boolean
// {
//     let globalReference: KeywordInfo[] = [];
//     let docType: ModuleType = ModuleType.Undefined;
//     const docName: string = document.fileName;

//     // get the DesignerText and extract document info out
//     const documentSection: string[] = document.getText().split('@EndOfDesignText@')
//     if (documentSection.length < 2) {console.log('no DesignerText found'); return false;}
//     const designText: String = documentSection[0]
//     const designTextLineCnt: number = designText.split('\n').length
//     const typeMatchGroup = designText.match('(?<=Type) *= *(\\w+)(?=\\n)')
//     if (!typeMatchGroup || typeMatchGroup.length < 2) {console.log('no ModuleType found'); return false;}
//     else 
//     {
//         switch (typeMatchGroup[1].toLocaleLowerCase())
//         {
//             case 'class':
//                 docType = ModuleType.Class; break;
//             case 'staticcode':
//                 docType = ModuleType.StaticCode; break;
//             case 'service':
//                 docType = ModuleType.Service; break;
//             default:
//         }
//     }

//     let globalSubStarted: boolean = false;
//     let globalSubEnded: boolean = false;
//     // go through each line of the document to create global reference for Variables and Functions
//     for (let line: number = designTextLineCnt; line < document.lineCount; line++) 
//     {
//         const text: string = document.lineAt(line).text
//         const lowerCaseText: String = text.toLowerCase();
//         // cheching if this line is a comment line, if it is ignore
//         if (lowerCaseText.trim().startsWith("'")) {continue;}

//         if (!globalSubEnded)
//         {
//             if (globalSubStarted)
//             {
//                 // inside global sub, all global variables are declared here
//                 const variableMatchPattern: string = `${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`;
//                 const variableMatchResult = lowerCaseText.match(new RegExp(variableMatchPattern, comRegExp.Flag.CaseIncensitive));
//                 if (variableMatchResult && variableMatchResult.length > 2)
//                 {
//                     //find a global variable
//                     const globalVariableToAdd: KeywordInfo = {
//                         KeywordName: variableMatchResult[1],
//                     ClassName: variableMatchResult[2],
//                     ModuleName: docName,
//                     ModuleType: docType,
//                     Scope: KeywordScope.Global,
//                     DefinitionPos: new vscode.Position(line, 0),
//                     //Type
//                     }
//                 }
//                 const isGlobalSubEndFound: boolean = lowerCaseText.trim().includes("End Sub".toLowerCase());
//                 globalSubEnded = isGlobalSubEndFound;
//             } else
//             {
//                 const isGlobalSubFound: boolean = lowerCaseText.trim().includes("Sub Class_Globals".toLowerCase()) || 
//                                                   lowerCaseText.trim().includes("Sub Process_Globals".toLowerCase());
//                 globalSubStarted = isGlobalSubFound;
//             }
//         } else
//         {
        
//             //     // 检查是否包含目标单词
//             //     const isEventFound: boolean = text.includes(`Sub ${word}_`.toLowerCase());
//             //     if (isEventFound) {continue;}
                
//             //     const functionMatchPattern: string = `Sub ${word}${comRegExp.EndOfWord}`;
//             //     const functionMatchResult = lowerCaseText.match(new RegExp(functionMatchPattern, comRegExp.Flag.CaseIncensitive));
        
//             //     const variableMatchPattern: string = `${comRegExp.StartOfWord}${word} As`;
//             //     const variableMatchResult = lowerCaseText.match(new RegExp(variableMatchPattern, comRegExp.Flag.CaseIncensitive));
//             //     //const isVariableFound: boolean = lowerCaseText.includes(`${word} As`.toLowerCase());
//             //     if (functionMatchResult || variableMatchResult) 
//             //     {
//             //         // 返回定义的位置
//             //         retWordInfo.DefinitionPos = new vscode.Position(line, text.indexOf(word));
//             //         retWordInfo.Scope = KeywordScope.Global;
//             //         if (functionMatchResult){retWordInfo.Type = KeywordType.Sub;}
//             //         if (variableMatchResult){retWordInfo.Type = KeywordType.Variable;}
//             //         return retWordInfo;
//             //     }
//         }


//     }
//     return true
// }
