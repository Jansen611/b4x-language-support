import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as comRegExp from './comRegExp';

export class b4xSignatureHelpProvider implements vscode.SignatureHelpProvider
{
    provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.SignatureHelpContext): vscode.ProviderResult<vscode.SignatureHelp> 
    {
        // check the triggering character, if it is '(', we need to find the function name first
        const signatures: vscode.SignatureInformation[] = [];
        if (context.triggerCharacter == '(' || ',') 
        {
            const lineText: string = document.lineAt(position.line).text;
            const funcCallStartIdx: number = lineText.lastIndexOf('(', position.character);
            const funcNamePosition = new vscode.Position(position.line, funcCallStartIdx - 1);
            const funcNameRange: vscode.Range | undefined = document.getWordRangeAtPosition(funcNamePosition);
            const funcName: string = funcNameRange? document.getText(funcNameRange) : '';

            // search for any declaration of this funcName
            let declaration: string | undefined = b4xDefinitionProvider.getDeclarationStringFromSearch(document, funcName, funcNamePosition.line, true, false);
            if (declaration)
            {
                const labelMatchRegex_I = new RegExp(`(?<=${comRegExp.StartOfWord}sub )(\\w+)[^'|\\n]+`, 'i')
                const labelMatch = declaration.match(labelMatchRegex_I);
                let label = labelMatch? labelMatch[1] : ''
                declaration = labelMatch? labelMatch[0] : declaration;
                const variableMatchRegEx_GI = new RegExp(`${comRegExp.StartOfWord}(\\w+) +As +(\\w+)${comRegExp.EndOfWord}`, 'gi')
                const variableMatchResult = declaration.match(variableMatchRegEx_GI);
                // matchFound, there is paramaters
                let something: string = ''
                if (variableMatchResult)
                {
                    const totalParamNum = variableMatchResult.length
                    const paramIdx : number = lineText.substring(funcCallStartIdx, position.character).match(new RegExp(',', 'g'))?.length || 0;
                    if (paramIdx < totalParamNum){label = variableMatchResult[paramIdx];}
                    else {label = '';}
                }
                
                // 或者创建两段式展示
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown('');
                markdown.appendCodeblock(declaration, 'b4x');
                
                let signatureInfo = new vscode.SignatureInformation(label, markdown);
                signatures.push(signatureInfo);
            }
        }

        let retVal = new vscode.SignatureHelp();
        retVal.signatures = signatures;
        retVal.activeParameter = 1;
        return retVal;
    }
}