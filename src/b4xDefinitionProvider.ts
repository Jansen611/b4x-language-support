import * as vscode from 'vscode';

export class b4xDefinitionProvider implements vscode.DefinitionProvider 
{
    provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> 
    {
        const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        const word: string = wordRange? document.getText(wordRange) : '';
        const lineNo: number = position.line;

        if (word) 
        {
            let definitionPosition: vscode.Position | undefined = findDefinitionPosition(document, word, lineNo);

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

export function findDefinitionPosition(document: vscode.TextDocument, word: string, lineNo: number): vscode.Position | undefined 
{
    let retPosition: vscode.Position | undefined = undefined;
    // check whether the selected text is in comment
    const lineText: string = document.lineAt(lineNo).text.trim();
    if (lineText.startsWith("'")) {return undefined;};
    // check whether the selected text is child of another object
    const idxBeforeWork: number = lineText.indexOf(word) - 1;
    if (lineText.charAt(idxBeforeWork) == '.') {return undefined;}; // return undefined at the moment, but will need more implementation later

    // finding the local definition
    retPosition = findLocalVariableDefinitionPosition(document, word, lineNo);

    if (!retPosition) 
    {
        // there is no local definition, time to search globally
        console.log(`Seaching for definition: ${word}`);
        // finding the global definition
        retPosition = findGlobalDefinitionPosition(document, word);
    }

    return retPosition
}

// find the Local Sub Boundary
export function findLocalSubBoundary(document: vscode.TextDocument, lineNo: number): [number, number] 
{
    const subStartString: string = "Sub ".toLowerCase();
    const subEndString: string = "End Sub".toLowerCase();
    let retArray: [number, number] = [0, 0];

    // fining the start of the local sub boundary
    for (let line: number = lineNo; line > -1; line--)
    {
        const text: string = document.lineAt(line).text;
        const isEndSubFound: boolean = text.toLowerCase().trim().includes(`${subEndString}`);
        const isStartSubFound: boolean = text.toLowerCase().trim().includes(`${subStartString}`);

        if (isStartSubFound) 
        {
            // we found the subStartString first
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
    for (let line: number = lineNo; line < document.lineCount; line++)
    {
        const text: string = document.lineAt(line).text;
        const isEndSubFound: boolean = text.toLowerCase().trim().includes(`${subEndString}`);
        const isStartSubFound: boolean = text.toLowerCase().trim().includes(`${subStartString}`);

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

function findLocalVariableDefinitionPosition(document: vscode.TextDocument, word: string, lineNo: number): vscode.Position | undefined 
{
    // finding the local sub boundary
    const localSubBoundary: [number, number] = findLocalSubBoundary(document, lineNo);

    if (localSubBoundary[0] >= localSubBoundary [1])
    {
        // the local sub not found
        return undefined
    }
    
    // go through the document line by line
    for (let line: number = localSubBoundary[0]; line < localSubBoundary[1]; line++) 
    {
        const text: string = document.lineAt(line).text;
        
        // checking if local declaration matches
        if (text.toLowerCase().includes(`${word} As`.toLowerCase())) 
        {
            // found the local variable, returning the position
            return new vscode.Position(line, text.indexOf(word));
        }
    }

    // no local declaration found, returning undefined
    return undefined;
}

function findGlobalDefinitionPosition(document: vscode.TextDocument, word: string): vscode.Position | undefined 
{
    // 遍历文档的每一行
    for (let line: number = 0; line < document.lineCount; line++) 
    {
        const text: string = document.lineAt(line).text
        const lowerCaseText: String = text.toLowerCase();
        
        // 检查是否包含目标单词
        const isEventFound: boolean = text.includes(`Sub ${word}_`.toLowerCase());
        if (isEventFound) {continue}
        
        const isFunctionFound: boolean = lowerCaseText.includes(`Sub ${word}`.toLowerCase());
        const isVariableFound: boolean = lowerCaseText.includes(`${word} As`.toLowerCase())
        if (isFunctionFound || isVariableFound) 
        {
            // 返回定义的位置
            return new vscode.Position(line, text.indexOf(word));
        }
    }

    // 如果未找到定义，返回 undefined
    return undefined;
}
