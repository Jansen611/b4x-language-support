import * as vscode from 'vscode';

export class b4xFoldingRangeProvider implements vscode.FoldingRangeProvider 
{
    provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken)
    : vscode.ProviderResult<vscode.FoldingRange[]> 
    {
        const rangesToFold: vscode.FoldingRange[] = [];
        const stack: {line: number, isBlock: boolean}[] = [];
        const blockStartRegex = new RegExp("^(Private|Public)?\\s+Sub\\b|^\\s*If\\b.*\\bThen|^\\s*For\\b|^\\s*While\\b", 'i');
        const blockEndRegex = new RegExp("^\\s*\\b(End\\s+(Sub|If|While)|Next)\\b", 'i');
        const lineCommentRegex = new RegExp("^\\s*'");

        for (let i = 0; i < document.lineCount; i++) 
        {
            const line = document.lineAt(i);
            const text = line.text;

            // Skip comments
            if (lineCommentRegex.test(text)) 
            {
                continue;
            }

            if (blockStartRegex.test(text)) 
            {
                stack.push({line: i, isBlock: true});
            } else if (blockEndRegex.test(text) && stack.length > 0) 
            {
                const start = stack.pop();
                if (start && start.isBlock) 
                {
                    rangesToFold.push(new vscode.FoldingRange(start.line, i-1));
                }
            }
        }

        return rangesToFold;
    }
}