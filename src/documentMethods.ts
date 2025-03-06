import * as vscode from 'vscode';

export class documentMethods
{
    // find the Local Sub Boundary
    public static findLocalSubBoundary(document: vscode.TextDocument, lineNo: number): [number, number] 
    {
        const subStartString: string = "Sub ".toLowerCase();
        const subEndString: string = "End Sub".toLowerCase();
        let retArray: [number, number] = [0, 0];

        // fining the start of the local sub boundary
        for (let line: number = lineNo; line > -1; line--)
        {
            const text: string = document.lineAt(line).text;
            const isEndSubFound: boolean = text.toLowerCase().trim().includes(`${subEndString}`);
            const isStartSubFound: boolean = text.toLowerCase().trim().includes(`${subStartString}`);

            if (isStartSubFound) 
            {
                // we found the subStartString first
                retArray[0] = line;
                break;
            }
            else if (isEndSubFound) 
            {
                // we found the subEndString first
                // no point continuing, this is not inside a local sub
                return retArray;
            }
        }

        // fining the end of the local sub boundary
        for (let line: number = lineNo; line < document.lineCount; line++)
        {
            const text: string = document.lineAt(line).text;
            const isEndSubFound: boolean = text.toLowerCase().trim().includes(`${subEndString}`);
            const isStartSubFound: boolean = text.toLowerCase().trim().includes(`${subStartString}`);

            if (isStartSubFound) 
            {
                // we found the subStartString first
                // no point continuing, this is not inside a local sub
                return retArray;
            }
            else if (isEndSubFound) 
            {
                // we found the subEndString first
                retArray[1] = line;
                break;
            }
        }

        return retArray;
    }
}

