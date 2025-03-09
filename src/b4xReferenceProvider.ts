import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';

export class b4xReferenceProvider implements vscode.ReferenceProvider
{
    provideReferences(document: vscode.TextDocument, 
                      position: vscode.Position, 
                      context: vscode.ReferenceContext, 
                      token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location[]> 
    {
        const wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
        const word: string = wordRange? document.getText(wordRange) : '';

        let retReferences: vscode.Location[] = [];
        if(word)
        {
            // get the keywordInfo first
            const definitionInfo = b4xDefinitionProvider.findDefinitionPosition(document, word, position.line);
            let boundary: [number, number] = [0, document.lineCount]
            // check what type of keyword is it and act accordingly
            switch (definitionInfo.Scope)
            {
                case b4xDefinitionProvider.KeywordScope.Local:
                    // finding the local sub boundary
                    boundary = b4xDefinitionProvider.findLocalSubBoundary(document, position.line);
                case b4xDefinitionProvider.KeywordScope.Global:
                    // find the matching word in every single line within the same document
                    for (let line: number = boundary[0]; line < boundary[1]; line++) 
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
                    break;
                case b4xDefinitionProvider.KeywordScope.CodeSpace:
                default:
            }
        }

        return retReferences;
    }
}