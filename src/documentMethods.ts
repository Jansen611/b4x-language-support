import * as vscode from 'vscode';


export function getWordFromDocPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
    const word: string = wordRange? document.getText(wordRange) : '';
    return word;
}

export function getLinePrefixFromDocPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
    const charPos: number = wordRange? wordRange.start.character : position.character;
    return document.getText(new vscode.Range(position.line, 0, position.line, charPos));
}

export function getAllParentObjMatchFromDocPosition(document: vscode.TextDocument, position: vscode.Position): RegExpMatchArray | null
{
    const linePrefix: string = getLinePrefixFromDocPosition(document, position);
    if (linePrefix.match(new RegExp('(?:^|\\r|\\n)[\\s\\S]+\\.[\\w]*(?:$|\\r|\\n)', 'gi')))
    {
        // check whether this is a member search or global search
        return linePrefix.match(new RegExp('(\\w+)\\.', 'g'));
    } else
    {
        return null;
    }

}

export function isStartOfLine(document: vscode.TextDocument, position: vscode.Position): boolean
{
    const linePrefix: string = getLinePrefixFromDocPosition(document, position);
    const declarationMatch = linePrefix.match('\\w+')
    return  !declarationMatch
}

export function isNamingDeclaration(document: vscode.TextDocument, position: vscode.Position): boolean
{
    let retVal: boolean = false;

    const linePrefix: string = getLinePrefixFromDocPosition(document, position);
    const declarationMatch = linePrefix.match(new RegExp('\\w+|=', 'gi'));
    if (!declarationMatch) {return retVal;}
    for (const match of declarationMatch)
    {
        const lowerCaseMatch: string = match.toLocaleLowerCase();
        if (lowerCaseMatch == 'dim' || lowerCaseMatch == 'private' || lowerCaseMatch == 'public' || lowerCaseMatch == 'const' || lowerCaseMatch == 'sub')
        {
            retVal = true;
        }

        if (retVal && match == '=') {retVal = false;}
    }

    return retVal;
}

export function isDeclaringTypeNam(document: vscode.TextDocument, position: vscode.Position): boolean
{
    let retVal: boolean = false;
    const linePrefix: string = getLinePrefixFromDocPosition(document, position);
    const declarationMatch = linePrefix.match(new RegExp('\\w+|=', 'gi'));
    if (!declarationMatch) {return retVal;}
    else 
    {
        // if the last valid word is 'As', then it is asking for type name
        if (declarationMatch[declarationMatch.length - 1].toLowerCase() == 'as') {retVal = true;}
    }
    return retVal;
}