import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as comRegExp from './comRegExp';
import { log } from 'console';

export class B4XCompletionItemProvider implements vscode.CompletionItemProvider 
{
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext)
    : vscode.ProviderResult<vscode.CompletionList | vscode.CompletionItem[]> 
    {
        const cha = context.triggerCharacter;
        const word: string = b4xDefinitionProvider.getWordFromDocumentPosition(document, position);
        const fullDocString: string = document.getText();
        const fullDocStringLower: string = fullDocString.toLowerCase();
        const fullDocLines: string[] = fullDocString.split('\n');
        const fullDocLinesLower: string[] = fullDocStringLower.split('\n');

        
        const variableMatchResult: RegExpMatchArray | null = fullDocString.match(new RegExp(comRegExp.PositiveLookbehind('sub class_globals|sub process_globals') + '[\\s\\S]+?' +
                                                                                            comRegExp.PositiveLookahead('end sub'), comRegExp.Flag.CaseIncensitive))
        // find all global variables and functions
        if (variableMatchResult)
        {
            // look for the starting line number of the global declaration area
            let globalDeclarationStartLine: number = fullDocLinesLower.findIndex(line => line.match('sub class_globals'));
            if (globalDeclarationStartLine == -1) {globalDeclarationStartLine = fullDocLinesLower.findIndex(line => line.match('sub process_globals'));}
            if (globalDeclarationStartLine == -1) {return [];}

            let itemsShow: vscode.CompletionItem[] = [];
            const globalDeclarationString: string = variableMatchResult[0];
            const globalDeclarationLines = globalDeclarationString.split('\n');
            // loop through line by line to get all global variables
            const variableMatchRegEx_GI = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive + comRegExp.Flag.Global)
            const variableMatchRegEx_I = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive)
            for (let i: number = 0; i < globalDeclarationLines.length; i++)
            {
                const lineText: string = globalDeclarationLines[i];
                const completionItemListToAdd = FindVariablesAndCreateCompletions(lineText, word);
                for (const completionItemToAdd of completionItemListToAdd)
                {
                    itemsShow.push(completionItemToAdd);
                }
            }

            // check local variables
            const currentLineNum: number = position.line
            if (currentLineNum > globalDeclarationStartLine + globalDeclarationLines.length || currentLineNum < globalDeclarationStartLine)
            {
                // find local sub boundary
                const localSubBoundary: [number, number] = b4xDefinitionProvider.findLocalSubBoundary(document, currentLineNum);
                if (localSubBoundary[0] < localSubBoundary [1])
                {
                    // the local sub found, go through the document line by line
                    for (let i: number = localSubBoundary[0]; i < localSubBoundary[1]; i++) 
                    {
                        const localLineText: string = fullDocLines[i];
                        const localCompletionItemListToAdd = FindVariablesAndCreateCompletions(localLineText, word);
                        for (const completionItemToAdd of localCompletionItemListToAdd)
                        {
                            itemsShow.push(completionItemToAdd);
                        }
                    }
                }
            }

            //take out globalDeclarationArea from fullDocLines for searching functions
            const globalFunctionLines = fullDocLines.slice(0, globalDeclarationStartLine -1)
                                                    .concat(fullDocLines.slice(globalDeclarationStartLine + globalDeclarationLines.length, fullDocLines.length - 1));
            // loop through line by line to get all global functions
            for (let i: number = 0; i < globalFunctionLines.length; i++)
                {
                    const lineText: string = globalFunctionLines[i];
                    // ignore any comment lines
                    if (lineText.trim().startsWith("'")) {continue;}
                    const functionMatchResult = lineText.match(new RegExp(comRegExp.PositiveLookbehind('Sub +') + 
                                                                          `${comRegExp.StartOfWord}\\w+${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive));
                    if (functionMatchResult)
                    {
                        //found a global function;
                        if (functionMatchResult[0].toLowerCase().includes(word.toLowerCase()))
                        {
                            // create a completionItem to show to user
                            let detailToShow: string = lineText.trim();
                            if (lineText.includes("'")) {detailToShow = lineText.split("'")[0].trim();}
                            const functionName: string = functionMatchResult[0].trim();
                            const completionItemToAdd: vscode.CompletionItem = 
                            {
                                label: functionName,
                                kind: vscode.CompletionItemKind.Function,
                                detail: detailToShow,
                                insertText: functionName,
                            }
                            itemsShow.push(completionItemToAdd);
                        }
                    }
                }

            return itemsShow;
        }

        // const items: vscode.CompletionItem[] =[
        //     {
        //         label: 'Log("message")',
        //         kind: vscode.CompletionItemKind.Snippet, 
        //         detail: 'Logs a message to the console.',
        //         textEdit: new vscode.TextEdit(new vscode.Range(position.with(undefined, position.character), position), 'Log("${1:message}")')
        //     }
        // ];
        return [];
    }
}

function FindVariablesAndCreateCompletions(lineText: string, keywordToMarch?: string): vscode.CompletionItem[]
{
    const variableMatchRegEx_GI = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive + comRegExp.Flag.Global)
    const variableMatchRegEx_I = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive)
    let word: string = keywordToMarch? keywordToMarch : '';
    let retVal: vscode.CompletionItem[] = [];
    
    // ignore any comment lines
    if (lineText.trim().startsWith("'")) {return [];}
    const variableMatchResult = lineText.match(variableMatchRegEx_GI);
    if (variableMatchResult)
    {
        for (const match of variableMatchResult)
        {
            const variableMatchResult_I = match.match(variableMatchRegEx_I);
            // if match is null, work on the next match
            if (!variableMatchResult_I){continue;}

            //found a global variable; [0] - match, [1] - variableName, [2] - typeName
            if (variableMatchResult_I[1].toLowerCase().includes(word.toLowerCase()))
            {
                // create a completionItem to show to user
                const variableName: string = variableMatchResult_I[1].trim();
                let detailToShow: string = lineText.trim();
                let keywordKind = vscode.CompletionItemKind.Variable;
                if (lineText.includes("'")) {detailToShow = lineText.split("'")[0].trim();}
                if (detailToShow.match(new RegExp(`${comRegExp.StartOfWord}Const${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive)))
                {
                    keywordKind = vscode.CompletionItemKind.Constant;
                }
                const completionItemToAdd: vscode.CompletionItem = 
                {
                    label: variableName,
                    kind: keywordKind,
                    detail: detailToShow,
                    insertText: variableName,
                }
                retVal.push(completionItemToAdd);
            }
        }
    }

    return retVal;
}