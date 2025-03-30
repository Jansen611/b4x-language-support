import * as vscode from 'vscode';


export function getWordFromDocumentPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
    const word: string = wordRange? document.getText(wordRange) : '';
    return word;
}

export function getLinePrefixFromDocPosition(document: vscode.TextDocument, position: vscode.Position): string
{
    return document.getText(new vscode.Range(position.line, 0, position.line, position.character));
}