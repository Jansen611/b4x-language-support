import * as vscode from 'vscode';


export function getWordFromDocPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
    const word: string = wordRange? document.getText(wordRange) : '';
    return word;
}

export function getLinePrefixFromDocPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    return document.getText(new vscode.Range(position.line, 0, position.line, position.character));
}

export function getAllParentObjMatchFromDocPosition(document: vscode.TextDocument, position: vscode.Position): RegExpMatchArray | null
{
    const linePrefix: string = getLinePrefixFromDocPosition(document, position);
    // check whether this is a member search or global search
    return linePrefix.match(new RegExp('(\\w+)\\.', 'g'))
}