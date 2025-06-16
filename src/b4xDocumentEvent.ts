import * as vscode from 'vscode';
import * as globals from './globals';
import * as b4xStructure from './b4xStructure';
import * as comRegExp from './comRegExp';
import * as b4xBaseClassInfo from './b4xBaseClassInfo'

export function onDocumentChange(documentEditor: vscode.TextEditor)
{
    if (documentEditor && documentEditor.document.languageId === 'b4x') {analyzeDocumentForFunctionBlocks(documentEditor.document);}
}
//var stringOnchange: string = '';
//var stringOnchangeLine: number = 0;
export function onTextChange(textChangeEvent: vscode.TextDocumentChangeEvent)
{
    if (textChangeEvent.contentChanges.length == 0) return;

    const change = textChangeEvent.contentChanges[0];
    // if (stringOnchangeLine == change.range.start.line)
    // {
    //     stringOnchange = stringOnchange + change.text;
    // } else
    // {
    //     stringOnchangeLine = change.range.start.line;
    //     stringOnchange = change.text;
    // }
    
    // if 'Enter' pressed, check auto statement closing
    if (change.text.match('\\n\\s*$'))
    {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'b4x') {return;} 
        else {analyzeDocumentForFunctionBlocks(editor.document);}

        const document: vscode.TextDocument = editor.document;
        const lineNum: number = change.range.start.line;
        const lineRange: vscode.Range = document.lineAt(lineNum).range
        const lineText: string = document.lineAt(lineNum).text;
        let isStartingStatmentFound: boolean = false;
        let closingStatement = '';
        let originalLineText = lineText;
        let closingStatementLine: number = 0;
        let leadingWhiteSpace = lineText.match('^[ |\\t]*\\b');
        // Check if the line matching keyword statements
        const openFunctionBlockMatchPattern: string = "^\\s*([Pp]ublic |[Pp]rivate )?\\b([Ss]ub)\\b.*$"
        const openStatementMatchPattern: string = "^\\s*\\b([Tt]ry|[Ff]or|[Ss]elect|[Ii]f)\\b.*$"
        if (lineText.match(openStatementMatchPattern)) 
        {
            // open statement found, continue the process
            isStartingStatmentFound = true;
            const currentBlock = getCurrentFunctionClocks(lineNum);
            // if this line is not within a function block, ignore
            if (!currentBlock) {return;}
            let nextStartStatmentLine: number = document.lineCount;
            let nextEndStatmentLine: number = document.lineCount;
            // match the open statement, and perform auto close statement
            if (lineText.match(new RegExp(comRegExp.StartOfIf, 'gi')))
            {
                // const nextLineNumSet: [number, number] = FindNextStatementLineNum(document, lineNum, 
                //                                                                   new RegExp(comRegExp.StartOfIf, 'gi'), 
                //                                                                   new RegExp(comRegExp.EndOfIf, 'gi'));
                // nextStartStatmentLine = nextLineNumSet[0];
                // nextEndStatmentLine = nextLineNumSet[1];
                originalLineText = originalLineText.replace(new RegExp('\\bIf\\b','gi'), 'If')
                                                   .replace(new RegExp('\\bThen\\b','gi'), 'Then');
                const IfDifference : number = GetStatementDifferenceInFunctionBlock(currentBlock, comRegExp.StartOfIf, comRegExp.EndOfIf);
                if (IfDifference > 0)
                {
                    // great, this is a new if statement, need end if
                    //if (nextStartStatmentLine <= nextEndStatmentLine) {closingStatement = 'End If'; closingStatementLine = 1;}
                    // calculate how many inline if occurance
                    const inLineIfMatcher = currentBlock.BlockText.matchAll(new RegExp(comRegExp.InlineIf, 'gi'));
                    let numOfInlineIf: number = 0;
                    for (const match of inLineIfMatcher) {numOfInlineIf += 1;}
                    if (IfDifference - numOfInlineIf > 0)
                    {
                        closingStatement = 'End If'; 
                        closingStatementLine = 1;
                    }
                }
            } else if (lineText.match(new RegExp(comRegExp.StartOfFor, 'gi')))
            {
                // getting the case right
                originalLineText = originalLineText.replace(new RegExp('\\bFor\\b','gi'), 'For')
                                                    .replace(new RegExp('\\bEach\\b','gi'), 'Each')
                                                    .replace(new RegExp('\\bIn\\b','gi'), 'In')
                                                    .replace(new RegExp('\\bAs\\b','gi'), 'As')
                                                    .replace(new RegExp('\\bTo\\b','gi'), 'To');

                if (GetStatementDifferenceInFunctionBlock(currentBlock, comRegExp.StartOfFor, comRegExp.EndOfFor) > 0)
                {
                    // great, this is a new for statement, need next
                    closingStatement = 'Next'; 
                    closingStatementLine = 1;
                }
            } else if (lineText.match(new RegExp(comRegExp.StartOfSelect, 'gi')))
            {
                // getting the case right
                originalLineText = originalLineText.replace(new RegExp('\\bSelect\\b','gi'), 'Select')
                                                    .replace(new RegExp('\\bCase\\b','gi'), 'Case');

                if (GetStatementDifferenceInFunctionBlock(currentBlock, comRegExp.StartOfSelect, comRegExp.EndOfSelect) > 0)
                {
                    // great, this is a new select statement, need end select
                    closingStatement = 'End Select'; 
                    closingStatementLine = 1;
                }
            } else if (lineText.match(new RegExp(comRegExp.StartOfTry, 'gi')))
            {
                // getting the case right
                originalLineText = originalLineText.replace(new RegExp('\\bTry\\b','gi'), 'Try');

                if (GetStatementDifferenceInFunctionBlock(currentBlock, comRegExp.StartOfTry, comRegExp.EndOfTry) > 0)
                {
                    // great, this is a new try statement, need catch and end try
                    closingStatement = `Catch\n${leadingWhiteSpace}\tLog(LastException)\n${leadingWhiteSpace}End Try`;
                    closingStatementLine = 3;
                }
            }
        } else if (lineText.match(openFunctionBlockMatchPattern))
        {
            // open statement found, continue the process
            isStartingStatmentFound = true;
            const currentBlock = getCurrentFunctionClocks(lineNum);
            // if this line is within a function block, ignore
            if (currentBlock) {return;}
            let nextStartStatmentLine: number = document.lineCount;
            let nextEndStatmentLine: number = document.lineCount;
            // match the open statement, and perform auto close statement
            if (lineText.match(new RegExp(comRegExp.StartOfSub, 'gi'))) 
            {
                // getting the case right
                originalLineText = originalLineText.replace(new RegExp('\\bPublic\\b','gi'), 'Public')
                                                   .replace(new RegExp('\\bPrivate\\b','gi'), 'Private')
                                                   .replace(new RegExp('\\bSub\\b','gi'), 'Sub')
                                                   .replace(new RegExp('\\bAs\\b','gi'), 'As');
                if (GetStatementDifferenceInFunctionBlockText(document.getText(), comRegExp.StartOfSub, comRegExp.EndOfSub) > 0)
                {
                    // great, this is a new try statement, need catch and end try
                    closingStatement = 'End Sub';
                    closingStatementLine = 1;
                }
            }
        }           
        
        if (isStartingStatmentFound) 
        {
            editor.edit((xEdit) => 
                {
                    // reformat the current line
                    xEdit.replace(lineRange, originalLineText);
                    if (closingStatement)
                    {
                        // insert end of statement
                        const endOfStatementLine = lineNum + 2;
                        const endOfStatementPos = new vscode.Position(endOfStatementLine, 0);
                        xEdit.insert(endOfStatementPos, `${leadingWhiteSpace}${closingStatement}\n`);
                    }
                });
        }
    }
}

function FindNextStatementLineNum(document: vscode.TextDocument, currentLineNum: number, startStatementRegex: RegExp, endStatementRegex: RegExp):[nextStart: number, nextEnd: number]
{
    let nextStart: number = document.lineCount;
    let nextEnd: number = document.lineCount;
    for (let i:number = currentLineNum + 1; i < document.lineCount; i++)
    {
        // find the next starting statement line
        if (nextStart == document.lineCount && 
            document.lineAt(i).text.match(startStatementRegex))
        {
            nextStart = i;
        }
        // find the next ending statement line
        if (nextEnd == document.lineCount && 
            document.lineAt(i).text.match(endStatementRegex))
        {
            nextEnd = i;
        }
        // if both next start and next end found, exit
        if (nextStart != document.lineCount && nextEnd !=document.lineCount) {break;}
    }
    return [nextStart, nextEnd]
}

function getCurrentFunctionClocks(lineNum: number): b4xStructure.FunctionBlock | null
{
    const firstLineEndBlockIdx = globals.functionBlockList.findIndex((x) => x.LineEnd >= lineNum && x.LineStart <= lineNum)
    if (firstLineEndBlockIdx < globals.functionBlockList.length) 
    {
        return globals.functionBlockList[firstLineEndBlockIdx];
    } else
    {
        return null;
    }
}

// this shall only got call once during either activiation or anytime the editor changing to another document
export function analyzeDocumentForFunctionBlocks(document: vscode.TextDocument) 
{
    // clear list
    globals.functionBlockList.splice(0, globals.functionBlockList.length); 

    let blockToAdd = new b4xStructure.FunctionBlock;
    for (let i = 0; i < document.lineCount; i++)
    {
        const lineText: string = document.lineAt(i).text;
        const startOfSubMatch = lineText.match(new RegExp(comRegExp.StartOfSub, 'i'))
        if (startOfSubMatch)
        {
            blockToAdd = new b4xStructure.FunctionBlock;
            blockToAdd.LineStart = i;
            if (lineText.match(new RegExp('\\bPrivate\\b', 'i'))) 
            {
                blockToAdd.FunctionScope = b4xStructure.FunctionScope.Private;
            } else 
            {
                blockToAdd.FunctionScope = b4xStructure.FunctionScope.Public;
            }
            blockToAdd.FunctionName = startOfSubMatch[2] || "";
        }

        const endOfSubMatch = lineText.match(new RegExp(comRegExp.EndOfSub, 'i'))
        if (endOfSubMatch)
        {
            // function block formed, adding to global list
            if (blockToAdd.LineStart >= 0)
            {
                blockToAdd.LineEnd = i;
                blockToAdd.BlockText = document.getText(new vscode.Range(blockToAdd.LineStart, 0, i, lineText.length));
                globals.functionBlockList.push(blockToAdd);
            }
        }
    }

    console.log(globals.functionBlockList.length)
}

function GetStatementDifferenceInFunctionBlock(givenBlock: b4xStructure.FunctionBlock, 
                                            givenStartOfStatementPattern: string,
                                            givenEndOfStatementPattern: string) : number
{
    return GetStatementDifferenceInFunctionBlockText(givenBlock.BlockText, 
                                                    givenStartOfStatementPattern, 
                                                    givenEndOfStatementPattern);
}

function GetStatementDifferenceInFunctionBlockText(givenBlockText: string, 
                                                givenStartOfStatementPattern: string,
                                                givenEndOfStatementPattern: string) : number
{
    // calculate how many open statement occurance
    const startOfStatementMatcher = givenBlockText.matchAll(new RegExp(givenStartOfStatementPattern, 'gi'));
    let numOfStart: number = 0;
    for (const match of startOfStatementMatcher) {numOfStart += 1;}
    const endOfStatementMatcher = givenBlockText.matchAll(new RegExp(givenEndOfStatementPattern, 'gi'));
    let numOfEnd: number = 0;
    for (const match of endOfStatementMatcher) {numOfEnd += 1;}

    return numOfStart - numOfEnd;
}