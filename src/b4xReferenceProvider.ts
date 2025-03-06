import * as vscode from 'vscode';

export class b4xReferenceProvider implements vscode.ReferenceProvider
{
    provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> 
    {
        const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        const word: string = wordRange? document.getText(wordRange) : '';

        let retReferences: vscode.Location[] = [];
        if(word)
        {
            // 遍历文档的每一行
            for (let line: number = 0; line < document.lineCount; line++) 
            {
                const text: string = document.lineAt(line).text;
                const lowerCaseText: String = text.toLowerCase();
                const idx: number = lowerCaseText.indexOf(word.toLowerCase());

                if (idx >= 0)
                {
                    const startPos = new vscode.Position(line, idx);
                    const endPos = new vscode.Position(line, idx + word.length);
                    const location = new vscode.Location(document.uri, new vscode.Range(startPos, endPos));
                    retReferences.push(location);
                }
            }
        }

        return retReferences;
    }
}