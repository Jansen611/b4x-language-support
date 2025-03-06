import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';

export class b4xHoverProvider implements vscode.HoverProvider 
{
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover>
    {
        const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        const word: string = wordRange? document.getText(wordRange) : '';
        const lineNo: number = position.line;

        if (word) 
        {
            let definitionPosition: vscode.Position | undefined = b4xDefinitionProvider.findDefinitionPosition(document, word, lineNo);
            let matchingLineNum: number = 0;

            if (definitionPosition)
            {
                matchingLineNum = definitionPosition.line;

                // get the declaration from the matchingLineNum
                const declaration: string | undefined = findDeclaration(document, word, matchingLineNum);
                if (declaration) 
                {
                    // Create a MarkdownString to format the hover content
                    const markdownString = new vscode.MarkdownString();
                    // Use 'b4x' as the language identifier for syntax highlighting
                    markdownString.appendCodeblock(declaration, 'b4x'); 

                    // return hover info
                    return new vscode.Hover(markdownString);
                }
            }
        }

        // no definition found, undefined
        return undefined;
    }
}

export function findDeclaration(document: vscode.TextDocument, word: string, matchingLineNum: number): string | undefined 
{
    if (matchingLineNum > 0)
    {
        const text: string = document.lineAt(matchingLineNum).text.trim();
        const lowerCaseText: string = text.toLowerCase();

        if (lowerCaseText.includes(`Sub ${word}`.toLowerCase()))
        {
            // this is a sub or function, return the whole line
            return text;
        } else if (lowerCaseText.includes(`${word} As`.toLowerCase()))
        {
            // this is a variable
            if (!lowerCaseText.includes(`Dim ${word}`.toLowerCase()) && 
                !lowerCaseText.includes(`Public ${word}`.toLowerCase()) && 
                !lowerCaseText.includes(`Private ${word}`.toLowerCase()))
            {
                // this is a paramater of a sub
                const parameterPosition: number = lowerCaseText.indexOf(`${word} As`.toLowerCase());
                let parameterDeclarationEnd: number = text.indexOf(',', parameterPosition);
                if (parameterDeclarationEnd < 0) {parameterDeclarationEnd = text.indexOf(')', parameterPosition)}
                return "(parameter) ".concat(text.substring(parameterPosition, parameterDeclarationEnd));
            } 
        }

        return text;
    }
    return undefined;
}