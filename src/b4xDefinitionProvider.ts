import * as vscode from 'vscode';
import * as docMethods from './documentMethods';
import * as comRegExp from './comRegExp';

export class b4xDefinitionProvider implements vscode.DefinitionProvider 
{
    provideDefinition(document: vscode.TextDocument, 
                      position: vscode.Position, 
                      token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> 
    {
        const word: string = docMethods.getWordFromDocumentPosition(document, position);
        const lineNo: number = position.line;

        if (word) 
        {
            const definitionInfo: KeywordInfo = findDefinitionPosition(document, word, lineNo);
            const definitionPosition: vscode.Position | undefined = definitionInfo.DefinitionPos;

            if (definitionPosition) 
            {
                console.log(`Definition found: ${word} in ${definitionPosition.line}:${definitionPosition.character}`);
                // return valid position
                return new vscode.Location(document.uri, definitionPosition);
            } else 
            {
                console.log(`No definition found: ${word}`);
            }
        }

        // if not found, return undefined
        return undefined;
    }
}

export class KeywordInfo
{
    KeywordName: string = '';
    DefinitionPos: vscode.Position | undefined = undefined; 
    Scope: KeywordScope = KeywordScope.Undefined;
    Type: KeywordType = KeywordType.Undefined;
    ClassName: string = '';
    ModuleName: string = '';
    ModuleType: ModuleType = ModuleType.Undefined;
}

export enum KeywordScope {Undefined = 0, Local = 1, Global = 2, CodeSpace = 3}

export enum KeywordType {Undefined = 0, Parameter = 1, Variable = 2, Sub = 3}

export enum ModuleType {Undefined = 0, Class = 1, StaticCode = 2, Service = 3}

export function findDefinitionPosition(document: vscode.TextDocument, word: string, wordLineNo: number): KeywordInfo
{
    let wordType: KeywordScope = KeywordScope.Undefined;
    let retWordInfo: KeywordInfo = {...new KeywordInfo(), KeywordName: word, ModuleName: document.fileName};

    // check whether the selected text is in comment
    const lineText: string = document.lineAt(wordLineNo).text.trim();
    if (lineText.startsWith("'")) {retWordInfo.DefinitionPos = undefined; return retWordInfo;};
    // check whether the selected text is child of another object
    const idxBeforeWork: number = lineText.indexOf(word) - 1;
    
    // return undefined at the moment, but will need more implementation later
    if (lineText.charAt(idxBeforeWork) == '.') {retWordInfo.Scope = KeywordScope.CodeSpace; return retWordInfo;}; 

    // finding the local definition
    const respWordInfoLocal: KeywordInfo = findLocalVariableDefinitionPosition(document, word, wordLineNo);

    if (!respWordInfoLocal.DefinitionPos) 
    {
        // there is no local definition, time to search globally
        console.log(`Seaching for definition: ${word}`);
        // finding the global definition
        const respWordInfoGlobal: KeywordInfo = findGlobalDefinitionPosition(document, word);
        if (respWordInfoGlobal.DefinitionPos) 
        {
            retWordInfo = respWordInfoGlobal;
        }
    } else
    {
        retWordInfo = respWordInfoLocal;
    }

    return retWordInfo;
}

export function getDeclarationStringFromSearch(document: vscode.TextDocument, word: string, wordLineNo: number,
                                               isFunctionSearch?: boolean, isVariableSearch?: boolean): string | undefined
{
    if (isFunctionSearch == undefined) {isFunctionSearch = true;}
    if (isVariableSearch == undefined) {isVariableSearch = true;}

    const definitionInfo = findDefinitionPosition(document, word, wordLineNo);
    const definitionPosition: vscode.Position | undefined = definitionInfo.DefinitionPos;
    let matchingLineNum: number = 0;
    
    if (definitionPosition)
    {
        matchingLineNum = definitionPosition.line;
        // get the declaration from the matchingLineNum
        let declaration: string | undefined = getDeclarationStringFromSameline(document, word, matchingLineNum, isFunctionSearch, isVariableSearch); 
        return declaration;
    }
    
    return undefined;
}

// find the Local Sub Boundary
export function findLocalSubBoundary(document: vscode.TextDocument, 
                                     lineNo: number, 
                                     givenWordInfo?: KeywordInfo): [number, number] 
{
    const subStartString: string = "Sub ".toLowerCase();
    const subEndString: string = "End Sub".toLowerCase();
    let retArray: [number, number] = [0, 0];

    // finding the start of the local sub boundary
    for (let line: number = lineNo; line > -1; line--)
    {
        const text: string = document.lineAt(line).text;
        const lowerCaseText: string = text.toLowerCase();
        
        // cheching if this line is a comment line, if it is ignore
        if (lowerCaseText.trim().startsWith("'")) {continue;}

        const isEndSubFound: boolean = lowerCaseText.trim().includes(`${subEndString}`);
        const isStartSubFound: boolean = lowerCaseText.trim().includes(`${subStartString}`);

        if (isStartSubFound) 
        {
            // we found the subStartString first
            // The start of a local sub shall be "Sub NameOfSub", if CLass/Process_Globals found, this is a global variable
            const isClassGlobalFound: boolean = lowerCaseText.trim().includes("Sub Class_Globals".toLowerCase());
            const isProcessGlobalFound: boolean = lowerCaseText.trim().includes("Sub Process_Globals".toLowerCase());
            if (isClassGlobalFound || isProcessGlobalFound)
            {
                if (isClassGlobalFound && givenWordInfo) {givenWordInfo.ModuleType = ModuleType.Class;}
                if (isProcessGlobalFound && givenWordInfo) {givenWordInfo.ModuleType = ModuleType.StaticCode;}
                return retArray;
            }
            retArray[0] = line;
            break;
        }
        else if (isEndSubFound) 
        {
            // we found the subEndString first
            // no point continuing, this is not inside a local sub
            return retArray;
        }
    }

    // fining the end of the local sub boundary
    for (let line: number = lineNo + 1; line < document.lineCount; line++)
    {
        const text: string = document.lineAt(line).text;
        const lowerCaseText: string = text.toLowerCase();
        // cheching if this line is a comment line, if it is ignore
        if (lowerCaseText.trim().startsWith("'")) {continue;}

        const isEndSubFound: boolean = lowerCaseText.trim().includes(`${subEndString}`);
        const isStartSubFound: boolean = lowerCaseText.trim().includes(`${subStartString}`);

        if (isStartSubFound) 
        {
            // we found the subStartString first
            // no point continuing, this is not inside a local sub
            return retArray;
        }
        else if (isEndSubFound) 
        {
            // we found the subEndString first
            retArray[1] = line;
            break;
        }
    }

    return retArray;
}

function findLocalVariableDefinitionPosition(document: vscode.TextDocument, word: string, lineNo: number): KeywordInfo 
{
    let retWordInfo: KeywordInfo = {...new KeywordInfo(), KeywordName: word, ModuleName: document.fileName};
    // finding the local sub boundary
    const localSubBoundary: [number, number] = findLocalSubBoundary(document, lineNo, retWordInfo);

    if (localSubBoundary[0] >= localSubBoundary [1])
    {
        // the local sub not found
        return retWordInfo;
    }
    
    // go through the document line by line
    for (let line: number = localSubBoundary[0]; line < localSubBoundary[1]; line++) 
    {
        const text: string = document.lineAt(line).text;
        // check if this line is a comment line, if it is ignore
        if (text.trim().startsWith("'")) {continue;}

        const variableMatchResult: RegExpMatchArray | null = text.match(new RegExp(`${comRegExp.StartOfWord}${word} As (\\w+)`, 'i'))
        // checking if local declaration matches
        if (variableMatchResult) 
        {
            // found the local variable, returning the position
            retWordInfo.DefinitionPos = new vscode.Position(line, text.indexOf(word));
            retWordInfo.Scope = KeywordScope.Local;
            retWordInfo.Type = KeywordType.Variable;
            if (variableMatchResult.length > 1) {retWordInfo.ClassName = variableMatchResult[1];}
            return retWordInfo
        }
    }

    // no local declaration found, returning undefined
    return retWordInfo;
}

function findGlobalDefinitionPosition(document: vscode.TextDocument, word: string): KeywordInfo
{   
    let retWordInfo: KeywordInfo = {...new KeywordInfo(), KeywordName: word, ModuleName: document.fileName};
    // 遍历文档的每一行
    for (let line: number = 0; line < document.lineCount; line++) 
    {
        const text: string = document.lineAt(line).text
        const lowerCaseText: String = text.toLowerCase();
        // cheching if this line is a comment line, if it is ignore
        if (text.trim().startsWith("'")) {continue;}

        if (retWordInfo.ModuleType == ModuleType.Undefined)
        {
            const isClassGlobalFound: boolean = lowerCaseText.trim().includes("Sub Class_Globals".toLowerCase());
            const isProcessGlobalFound: boolean = lowerCaseText.trim().includes("Sub Process_Globals".toLowerCase());
            if (isClassGlobalFound) {retWordInfo.ModuleType = ModuleType.Class;}
            if (isProcessGlobalFound) {retWordInfo.ModuleType = ModuleType.StaticCode;}
        }

        // 检查是否包含目标单词
        const isEventFound: boolean = text.includes(`Sub ${word}_`.toLowerCase());
        if (isEventFound) {continue;}
        
        const functionMatchPattern: string = `Sub ${word}${comRegExp.EndOfWord}`;
        const functionMatchResult = text.match(new RegExp(functionMatchPattern, 'i'));

        const variableMatchPattern: string = `${comRegExp.StartOfWord}${word} As (\\w+)`;
        const variableMatchResult = text.match(new RegExp(variableMatchPattern, 'i'));
        //const isVariableFound: boolean = lowerCaseText.includes(`${word} As`.toLowerCase());
        if (functionMatchResult || variableMatchResult) 
        {
            // 返回定义的位置
            retWordInfo.DefinitionPos = new vscode.Position(line, text.indexOf(word));
            retWordInfo.Scope = KeywordScope.Global;
            if (functionMatchResult){retWordInfo.Type = KeywordType.Sub;}
            if (variableMatchResult)
            {
                retWordInfo.Type = KeywordType.Variable;
                if (variableMatchResult.length > 1) {retWordInfo.ClassName = variableMatchResult[1];}
            }
            return retWordInfo;
        }
    }

    // 如果未找到定义，返回 undefined
    return retWordInfo;
}

// try to get the declaration string of a given keyword from a given line
function getDeclarationStringFromSameline(document: vscode.TextDocument, word: string, matchingLineNum: number, 
                                          isFunctionSearch: boolean, isVariableSearch: boolean): string | undefined 
{
    if (matchingLineNum > 0)
    {
        const text: string = document.lineAt(matchingLineNum).text.trim();
        const lowerCaseText: string = text.toLowerCase();

        if (lowerCaseText.includes(`Sub ${word}`.toLowerCase()))
        {
            // this is a sub or function, return the whole line
            if (isFunctionSearch) {return text;}
        } else if (lowerCaseText.match(new RegExp(`${comRegExp.StartOfWord}${word} As`, comRegExp.Flag.CaseIncensitive)))
        {
            if (isVariableSearch)
            {
                // this is a variable
                if (!lowerCaseText.match(`(?:Dim|Public|Private|Const) ${word}`.toLowerCase()))
                {
                    // this is a paramater of a sub
                    const parameterPosition: number = lowerCaseText.indexOf(`${word} As`.toLowerCase());
                    let parameterDeclarationEnd: number = text.indexOf(',', parameterPosition);
                    if (parameterDeclarationEnd < 0) {parameterDeclarationEnd = text.indexOf(')', parameterPosition)}
                    return "(parameter) " + text.substring(parameterPosition, parameterDeclarationEnd);
                } 
                return text;
            }
        }
    }
    return undefined;
}
