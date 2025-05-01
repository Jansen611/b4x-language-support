import * as vscode from 'vscode';
import * as b4xBaseClassInfo from './b4xBaseClassInfo'

var stringOnchange: string = '';
var stringOnchangeLine: number = 0;
export function onTextChange(textChangeEvent: vscode.TextDocumentChangeEvent)
{
    
    if (textChangeEvent.contentChanges.length == 0) return;

    const change = textChangeEvent.contentChanges[0];
    if (stringOnchangeLine == change.range.start.line)
    {
        stringOnchange = stringOnchange + change.text;
    } else
    {
        stringOnchangeLine = change.range.start.line;
        stringOnchange = change.text;
    }
    
    // if 'Enter' pressed, check auto statement closing
    if (stringOnchange.match('\\w\\s*\\n\\s*$'))
    {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'b4x') return;

        const line = editor.document.lineAt(stringOnchangeLine);
        const lineText = line.text.trim();

        // Check if the line matching keyword statements
        if (lineText.match("^\\s*([Pp]ublic |[Pp]rivate )?\\b([Tt]ry|[Ff]or|[Ss]elect|[Ss]ub|[Ii]f|[Ii]f\\b.*\\b[Tt]hen)\\b.*$")) {
            //const closingStatement = lineText.endsWith('Sub') ? 'End Sub' : 'End If';
            let closingStatement = '';
            let originalLineText = line.text;
            let leadingWhiteSpace = line.text.match('^[ |\\t]*\\b')
            if (lineText.match("^\\s*([Pp]ublic |[Pp]rivate )?\\b([Ss]ub)\\b.*$"))
            {
                originalLineText = originalLineText.replace(new RegExp('\\bPublic\\b','i'), 'Public')
                originalLineText = originalLineText.replace(new RegExp('\\bPrivate\\b','i'), 'Private')
                originalLineText = originalLineText.replace(new RegExp('\\bSub\\b','i'), 'Sub')
                closingStatement = 'End Sub'
            } else if (lineText.match("^\\s*\\b([Ii]f|[Ii]f\\b.*\\b[Tt]hen)\\b.*$"))
            {
                originalLineText = originalLineText.replace(new RegExp('\\bIf\\b','i'), 'If')
                originalLineText = originalLineText.replace(new RegExp('\\bThen\\b','i'), 'Then')
                closingStatement = 'End If'
            } else if (lineText.match("^\\s*\\b([Ff]or)\\b.*$"))
            {
                originalLineText = originalLineText.replace(new RegExp('\\bFor\\b','i'), 'For')
                originalLineText = originalLineText.replace(new RegExp('\\bEach\\b','i'), 'Each')
                originalLineText = originalLineText.replace(new RegExp('\\bIn\\b','i'), 'In')
                closingStatement = 'Next'
            }

            if (closingStatement)
            {
                editor.edit((editBuilder) => {
                    // reformat the current line
                    editBuilder.replace(line.range, originalLineText)

                    // insert end of statement
                    const endOfStatementLine = line.lineNumber + 2;
                    const endOfStatementPos = new vscode.Position(endOfStatementLine, 0);
                    editBuilder.insert(endOfStatementPos, `${leadingWhiteSpace}${closingStatement}\n`);
                });
            }
        }
    }
            
}