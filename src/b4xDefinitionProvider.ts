import * as vscode from 'vscode';
import * as docMethods from './documentMethods';
import * as comRegExp from './comRegExp';
import * as b4xStructure from './b4xStructure';
import { B4X_SYSTEMVARIABLE_COMPLETION } from './b4xBaseClassInfo';

export class b4xDefinitionProvider implements vscode.DefinitionProvider 
{
    provideDefinition(document: vscode.TextDocument, 
                      position: vscode.Position, 
                      token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> 
    {
        const word: string = docMethods.getWordFromDocPosition(document, position);
        const lineNo: number = position.line;

        if (word) 
        {
            const definitionInfo: b4xStructure.KeywordInfo = findDefinitionPosition(document, word, lineNo);
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



export function findDefinitionPosition(document: vscode.TextDocument, word: string, wordLineNo: number): b4xStructure.KeywordInfo
{
    let wordType: b4xStructure.KeywordScope = b4xStructure.KeywordScope.Undefined;
    let retWordInfo: b4xStructure.KeywordInfo = {...new b4xStructure.KeywordInfo(), KeywordName: word, ModuleName: document.fileName};

    // check whether the selected text is in comment
    const lineText: string = document.lineAt(wordLineNo).text.trim();
    if (lineText.startsWith("'")) {retWordInfo.DefinitionPos = undefined; return retWordInfo;};
    // check whether the selected text is child of another object
    const idxBeforeWork: number = lineText.indexOf(word) - 1;
    
    // return undefined at the moment, but will need more implementation later
    if (lineText.charAt(idxBeforeWork) == '.') {retWordInfo.Scope = b4xStructure.KeywordScope.CodeSpace; return retWordInfo;}; 

    // finding the local definition
    const respWordInfoLocal: b4xStructure.KeywordInfo = findLocalVariableDefinitionPosition(document, word, wordLineNo);

    if (!respWordInfoLocal.DefinitionPos) 
    {
        // there is no local definition, time to search globally
        console.log(`Seaching for definition: ${word}`);
        // finding the global definition
        const respWordInfoGlobal: b4xStructure.KeywordInfo = findGlobalDefinitionPosition(document, word);
        if (!respWordInfoGlobal.DefinitionPos)
        {
            // finding the system definition
            const foundSystemVariable = B4X_SYSTEMVARIABLE_COMPLETION.find((x) => x.label.toString().match(new RegExp(word, 'i')))
            if (foundSystemVariable)
            {
                retWordInfo.DefinitionPos = new vscode.Position(wordLineNo, lineText.indexOf(word));
                retWordInfo.Scope = b4xStructure.KeywordScope.CodeSpace;
                retWordInfo.Type = b4xStructure.KeywordType.Variable;
                const foundSystemVariableDeclaration: String = foundSystemVariable.detail || "";
                const classNameMatch = foundSystemVariableDeclaration.match(comRegExp.VairableMatchPattern(word, 'i'));
                if (classNameMatch && classNameMatch.length > 1) 
                {
                    retWordInfo.ClassName = classNameMatch[1]
                }
            }
        } else
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
                                     givenWordInfo?: b4xStructure.KeywordInfo): [number, number] 
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
                if (isClassGlobalFound && givenWordInfo) {givenWordInfo.ModuleType = b4xStructure.ModuleType.Class;}
                if (isProcessGlobalFound && givenWordInfo) {givenWordInfo.ModuleType = b4xStructure.ModuleType.StaticCode;}
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

function findLocalVariableDefinitionPosition(document: vscode.TextDocument, word: string, lineNo: number): b4xStructure.KeywordInfo 
{
    let retWordInfo: b4xStructure.KeywordInfo = {...new b4xStructure.KeywordInfo(), KeywordName: word, ModuleName: document.fileName};
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
        const lineText: string = document.lineAt(line).text;
        // check if this line is a comment line, if it is ignore
        if (lineText.trim().startsWith("'")) {continue;}

        const variableMatchResult: RegExpMatchArray | null = lineText.match(comRegExp.VairableMatchPattern(word, 'i'))
        // checking if local declaration matches
        if (variableMatchResult) 
        {
            // found the local variable, returning the position
            retWordInfo.DefinitionPos = new vscode.Position(line, lineText.indexOf(word));
            retWordInfo.Scope = b4xStructure.KeywordScope.Local;
            if (lineText.match(comRegExp.DeclarationMatchPattern(word, 'i')))
            {
                retWordInfo.Type = b4xStructure.KeywordType.Variable;
            } else
            {
                retWordInfo.Type = b4xStructure.KeywordType.Parameter;
            }
            if (variableMatchResult.length > 1) {retWordInfo.ClassName = variableMatchResult[1];}
            return retWordInfo
        }
    }

    // no local declaration found, returning undefined
    return retWordInfo;
}

function findGlobalDefinitionPosition(document: vscode.TextDocument, keyWord: string): b4xStructure.KeywordInfo
{   
    let retWordInfo: b4xStructure.KeywordInfo = {...new b4xStructure.KeywordInfo(), KeywordName: keyWord, ModuleName: document.fileName};
    // loop through every line
    for (let line: number = 0; line < document.lineCount; line++) 
    {
        const lineText: string = document.lineAt(line).text
        const lowerCaseText: String = lineText.toLowerCase();
        // cheching if this line is a comment line, if it is ignore
        if (lineText.trim().startsWith("'")) {continue;}

        if (retWordInfo.ModuleType == b4xStructure.ModuleType.Undefined)
        {
            const isClassGlobalFound: boolean = lowerCaseText.trim().includes("Sub Class_Globals".toLowerCase());
            const isProcessGlobalFound: boolean = lowerCaseText.trim().includes("Sub Process_Globals".toLowerCase());
            if (isClassGlobalFound) {retWordInfo.ModuleType = b4xStructure.ModuleType.Class;}
            if (isProcessGlobalFound) {retWordInfo.ModuleType = b4xStructure.ModuleType.StaticCode;}
        }

        // check whether including keyword
        const isEventFound: boolean = lineText.includes(`Sub ${keyWord}_`.toLowerCase());
        if (isEventFound) {continue;}
        
        const functionMatchPattern: string = `Sub ${keyWord}${comRegExp.EndOfWord}`;
        const functionMatchResult = lineText.match(new RegExp(functionMatchPattern, 'i'));

        const variableMatchResult = lineText.match(comRegExp.VairableMatchPattern(keyWord, 'i'));
        //const isVariableFound: boolean = lowerCaseText.includes(`${word} As`.toLowerCase());
        if (functionMatchResult || variableMatchResult) 
        {
            // return definition position
            retWordInfo.DefinitionPos = new vscode.Position(line, lineText.indexOf(keyWord));
            retWordInfo.Scope = b4xStructure.KeywordScope.Global;
            if (functionMatchResult){retWordInfo.Type = b4xStructure.KeywordType.Sub;}
            if (variableMatchResult)
            {
                if (lineText.match(comRegExp.DeclarationMatchPattern(keyWord, 'i')))
                {
                    retWordInfo.Type = b4xStructure.KeywordType.Variable;
                } else
                {
                    retWordInfo.Type = b4xStructure.KeywordType.Parameter;
                }
                if (variableMatchResult.length > 1) {retWordInfo.ClassName = variableMatchResult[1];}
            }
            return retWordInfo;
        }
    }

    // return undefined if not found
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
        const variableMatchResult = text.match(comRegExp.VairableMatchPattern(word, 'gi'));

        if (lowerCaseText.includes(`Sub ${word}`.toLowerCase()))
        {
            // this is a sub or function, return the whole line
            if (isFunctionSearch) {return text;}
        } else if (variableMatchResult)
        {
            if (isVariableSearch)
            {
                // this is a variable
                if (!text.match(comRegExp.DeclarationMatchPattern(word, 'i')))
                {
                    // this is a paramater of a sub
                    const parameterPosition: number = lowerCaseText.indexOf(`${word} As`.toLowerCase());
                    let parameterDeclarationEnd: number = text.indexOf(',', parameterPosition);
                    if (parameterDeclarationEnd < 0) {parameterDeclarationEnd = text.indexOf(')', parameterPosition);}
                    return text.substring(parameterPosition, parameterDeclarationEnd);
                } else
                {
                    return variableMatchResult[0];
                }
                return text;
            }
        }
    }
    return undefined;
}
