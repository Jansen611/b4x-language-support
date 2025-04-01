import * as vscode from 'vscode';
import * as b4xDefinitionProvider from './b4xDefinitionProvider';
import * as b4xBaseClassInfo from './b4xBaseClassInfo';
import * as docMethods from './documentMethods';
import * as comRegExp from './comRegExp';

export class b4xSignatureHelpProvider implements vscode.SignatureHelpProvider
{
    provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.SignatureHelpContext): vscode.ProviderResult<vscode.SignatureHelp> 
    {
        // check the triggering character, if it is '(', we need to find the function name first
        const signatures: vscode.SignatureInformation[] =[];

        const lineText: string = document.lineAt(position.line).text;
        const funcCallStartIdx: number = lineText.lastIndexOf('(', position.character);
        const funcNamePosition = new vscode.Position(position.line, funcCallStartIdx - 1);

        // check whether this is a member search or global search
        const funcName: string = docMethods.getWordFromDocPosition(document, funcNamePosition); 
        const parentObjectMatch = docMethods.getAllParentObjMatchFromDocPosition(document, funcNamePosition);
        let declaration: string = '';
        if (parentObjectMatch && parentObjectMatch.length > 0)
        {
            let systemClassKey: string = ''
            // loop through all matches to find in which class space to do the search
            for (let i:number = 0; i < parentObjectMatch.length; i++)
            {
                const keywordMatch = parentObjectMatch[i].match('\\w+');
                if (keywordMatch)
                {
                    let outKeywordInfo = b4xDefinitionProvider.findDefinitionPosition(document, keywordMatch[0], position.line);
                    switch (outKeywordInfo.ClassName.toLowerCase())
                    {
                        case 'list':
                        case 'map':
                            // this is system base class, construct the class Key
                            systemClassKey = outKeywordInfo.ClassName;
                            break;
                        default:
                    }
                }
            }
            if (systemClassKey)
            {
                systemClassKey = systemClassKey + "." + funcName
                declaration = b4xBaseClassInfo.B4X_BASECLASS_MEMBER_DECLARATION[systemClassKey.toLowerCase()];
            }
        } else
        {
            // search for any declaration of this funcName globally
            declaration = b4xDefinitionProvider.getDeclarationStringFromSearch(document, funcName, funcNamePosition.line, true, false) || '';
        }

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
            
            // create markdown with code block
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown('');
            markdown.appendCodeblock(declaration, 'b4x');
            
            let signatureInfo = new vscode.SignatureInformation(label, markdown);
            signatures.push(signatureInfo);
        }


        let retVal = new vscode.SignatureHelp();
        retVal.signatures = signatures;
        retVal.activeParameter = 1;
        return retVal;
    }
}