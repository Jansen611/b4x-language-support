import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as docMethods from './documentMethods';
import * as comRegExp from './comRegExp';
import * as b4xBaseClassInfo from './b4xBaseClassInfo'

export class B4XCompletionItemProvider implements vscode.CompletionItemProvider 
{
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext)
    : vscode.ProviderResult<vscode.CompletionList | vscode.CompletionItem[]> 
    {
        const cha = context.triggerCharacter;
        const wordToSearch: string =  docMethods.getWordFromDocPosition(document, position);
        let itemsShow: vscode.CompletionItem[] = [new vscode.CompletionItem('')];

        // check wether this is to search class name or member name
        if (docMethods.isDeclaringTypeNam(document, position)) // looking for 'As' keyword
        {
            // loop through the system type first before search for custom type
            for (const typeCompletion of b4xBaseClassInfo.B4X_SYSTEMCLASS_TYPE_COMPLETION)
            {
                if (typeCompletion.label.toString().match((new RegExp(wordToSearch, 'i'))))
                {
                    itemsShow.push(typeCompletion);
                }
            }

            return itemsShow;
        }

        // no point showing completion items, if the keyword is inside a declaration
        if (docMethods.isNamingDeclaration(document, position)){return itemsShow;}

        // seach current doc by default, but this can be changed to other doc
        let fullDocString: string = document.getText();

        // check whether this is a member search or global search
        const parentObjectMatch = docMethods.getAllParentObjMatchFromDocPosition(document, position); // looking for '.' operator
        if (parentObjectMatch && parentObjectMatch.length > 0)
        {
            // this is a member of an object, no point search for the original document
            fullDocString = '';
            // loop through all matches to find in which class space to do the search
            for (let i:number = 0; i < parentObjectMatch.length; i++)
            {
                const keywordMatch = parentObjectMatch[i].match('\\w+');
                if (keywordMatch)
                {
                    let outKeywordInfo = b4xDefinitionProvider.findDefinitionPosition(document, keywordMatch[0], position.line);
                    if (outKeywordInfo.ClassName && b4xBaseClassInfo.B4X_BASECLASS_MEMBER_COMPLETION[outKeywordInfo.ClassName.toLowerCase()])
                    {
                        // the prefix object is one of the b4x base class, return the class members directly
                        return b4xBaseClassInfo.B4X_BASECLASS_MEMBER_COMPLETION[outKeywordInfo.ClassName.toLowerCase()];
                    }
                }
            }
        }

        // give system keywords suggestion
        for (const keywordCompletion of b4xBaseClassInfo.B4X_SYSTEMKEYWORD_COMPLETION)
        {
            if (keywordCompletion.label.toString().match(new RegExp(wordToSearch, 'i')))
            {
                itemsShow.push(keywordCompletion);
            }
        }

        // give system variables suggestion
        for (const variableCompletion of b4xBaseClassInfo.B4X_SYSTEMVARIABLE_COMPLETION)
        {
            if (variableCompletion.label.toString().match(new RegExp(wordToSearch, 'i')))
            {
                itemsShow.push(variableCompletion);
            }
        }

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
            if (globalDeclarationStartLine == -1) {return itemsShow;}

            //let itemsShow: vscode.CompletionItem[] = [];
            const globalDeclarationString: string = variableMatchResult[0];
            const globalDeclarationLines = globalDeclarationString.split('\n');
            // loop through line by line to get all global variables
            const variableMatchRegEx_GI = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive + comRegExp.Flag.Global)
            const variableMatchRegEx_I = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, comRegExp.Flag.CaseIncensitive)
            for (let i: number = 0; i < globalDeclarationLines.length; i++)
            {
                const lineText: string = globalDeclarationLines[i];
                const completionItemListToAdd = FindVariablesAndCreateCompletions(lineText, wordToSearch);
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
                        const localCompletionItemListToAdd = FindVariablesAndCreateCompletions(localLineText, wordToSearch);
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
                        if (functionMatchResult[0].toLowerCase().includes(wordToSearch.toLowerCase()))
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
            //return new vscode.CompletionList(itemsShow, true);
            return itemsShow;
        }
        //return new vscode.CompletionList([], true);
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