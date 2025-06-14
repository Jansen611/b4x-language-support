import * as vscode from 'vscode';
import * as b4xStructure from './b4xStructure';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as docMethods from './documentMethods';
import * as b4xBaseClassInfo from './b4xBaseClassInfo'

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
            let declaration: string = ""
            // check whether this is a member search or global search
            const parentObjectMatch = docMethods.getAllParentObjMatchFromDocPosition(document, position); // looking for '.' operator
            if (parentObjectMatch && parentObjectMatch.length > 0)
            {
                // loop through all matches to find in which class space to do the search
                for (let i:number = 0; i < parentObjectMatch.length; i++)
                {
                    const keywordMatch = parentObjectMatch[i].match('\\w+');
                    if (keywordMatch)
                    {
                        let outKeywordInfo = b4xDefinitionProvider.findDefinitionPosition(document, keywordMatch[0], position.line);
                        if (outKeywordInfo.ClassName && b4xBaseClassInfo.B4X_BASECLASS_MEMBER_COMPLETION[outKeywordInfo.ClassName.toLowerCase()])
                        {
                            // this is a member inside b4x base class
                            declaration = b4xBaseClassInfo.B4X_BASECLASS_MEMBER_DECLARATION[`${outKeywordInfo.ClassName.toLowerCase()}.${word.toLowerCase()}`];
                            if (declaration)
                            {
                                break;
                            }
                        }
                    }
                }
            }

            if (!declaration)
            {
                const definitionInfo = b4xDefinitionProvider.findDefinitionPosition(document, word, wordLineNo);
                declaration = b4xDefinitionProvider.getDeclarationStringFromSearch(document, word, wordLineNo) || "";                
                if (declaration) 
                {
                    if (definitionInfo.Type == b4xStructure.KeywordType.Variable)
                    {
                        if (definitionInfo.Scope == b4xStructure.KeywordScope.Global)
                        {
                            declaration = "(global variable) " + declaration;
                        } else if (definitionInfo.Scope == b4xStructure.KeywordScope.Local)
                        {
                            declaration = "(local variable) " + declaration;
                        }
                    } else if (definitionInfo.Type == b4xStructure.KeywordType.Parameter)
                    {
                        declaration = "(parameter) " + declaration;
                    }
                }
            }

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

        // no definition found, undefined
        return undefined;
    }
}