import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as docMethods from './documentMethods';

export class b4xHoverProvider implements vscode.HoverProvider 
{
    provideHover(document: vscode.TextDocument, 
                 position: vscode.Position, 
                 token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover>
    {
        const word: string = docMethods.getWordFromDocPosition(document, position);
        const wordLineNo: number = position.line;

        if (word) 
        {
            const definitionInfo = b4xDefinitionProvider.findDefinitionPosition(document, word, wordLineNo);
            let declaration: string | undefined = b4xDefinitionProvider.getDeclarationStringFromSearch(document, word, wordLineNo);                
            if (declaration) 
            {
                if (definitionInfo.Type == b4xDefinitionProvider.KeywordType.Variable)
                {
                    if (definitionInfo.Scope == b4xDefinitionProvider.KeywordScope.Global)
                    {
                        declaration = "(global variable) " + declaration;
                    } else if (definitionInfo.Scope == b4xDefinitionProvider.KeywordScope.Local)
                    {
                        declaration = "(local variable) " + declaration;
                    }
                }

                // if (definitionInfo.Scope == b4xDefinitionProvider.KeywordScope.Global &&
                //     definitionInfo.Type == b4xDefinitionProvider.KeywordType.Variable)
                // {
                //     switch(definitionInfo.ModuleType)
                //     {
                //         case b4xDefinitionProvider.ModuleType.Class:
                //         case b4xDefinitionProvider.ModuleType.StaticCode:
                //             declaration = "(global variable) " + declaration;
                //             break;
                //         // case b4xDefinitionProvider.ModuleType.StaticCode:
                //         //     declaration = "(process_globals) " + declaration;
                //         //     break;
                //         default:
                //     }
                // }

                // Create a MarkdownString to format the hover content
                const markdownString = new vscode.MarkdownString();
                // Use 'b4x' as the language identifier for syntax highlighting
                markdownString.appendCodeblock(declaration, 'b4x'); 

                // return hover info
                return new vscode.Hover(markdownString);
            }
        }

        // no definition found, undefined
        return undefined;
    }
}