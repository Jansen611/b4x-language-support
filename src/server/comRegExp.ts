export const EndOfWord: string = '\\b(?<=\\w)';
export const StartOfWord: string = '\\b(?=\\w)';

export const StartOfStatment: string = '(?:^|\\r|\\n)\\s*(Public\\s+|Private\\s+)?\\b(Try|For|Select|Sub|If)\\b.*(?:$|\\r|\\n)';
export const StartOfSub: string = '(?:^|\\r|\\n)\\s*(Public\\s+|Private\\s+)?\\bSub\\s+(\\w+)\\b.*(?:$|\\r|\\n)';
export const EndOfSub: string = '(?:^|\\r|\\n)\\s*\\bEnd\\s+Sub\\b.*(?:$|\\r|\\n)';
export const StartOfIf: string = '(?:^|\\r|\\n)[ \\t]*\\bIf[ \\t]+\\w+\\b.*\\bThen\\b.*(?:$|\\r|\\n)';
export const InlineIf: string = '(?:^|\\r|\\n)[ \\t]*\\bIf[ \\t]+\\w+\\b.*\\bThen[ \\t]+\\w+\\b.*(?:$|\\r|\\n)';
export const EndOfIf: string = '(?:^|\\r|\\n)[ \\t]*\\bEnd[ \\t]+If\\b.*(?:$|\\r|\\n)';
export const StartOfFor: string = '(?:^|\\r|\\n)\\s*\\b(For\\s+Each|For)\\s+\\w+\\b.*(?:$|\\r|\\n)';
export const EndOfFor: string = '(?:^|\\r|\\n)\\s*\\bNext\\b.*(?:$|\\r|\\n)';
export const StartOfSelect: string = '(?:^|\\r|\\n)\\s*\\b(Select Case)\\s+\\w+\\b.*(?:$|\\r|\\n)';
export const EndOfSelect: string = '(?:^|\\r|\\n)\\s*\\bEnd\\s+Select\\b.*(?:$|\\r|\\n)';
export const StartOfTry: string = '(?:^|\\r|\\n)\\s*\\b(Try)\\b.*(?:$|\\r|\\n)';
export const EndOfTry: string = '(?:^|\\r|\\n)\\s*\\bEnd\\s+Try\\b.*(?:$|\\r|\\n)';

export enum Flag
{
    CaseIncensitive = 'i',
    Multiline = 'm',
    Unicode = 'u',
    Global = 'g'
}

export function PositiveLookbehind(value: string): string
{
    let retVal: string = '';
    if (value){retVal = `(?<=${value})`;}
    return retVal;
}

export function PositiveLookahead(value: string): string
{
    let retVal: string = '';
    if (value) {retVal = `(?=${value})`;}
    return retVal;
}

export function VairableMatchPattern(word: string, flag: string): RegExp
{
    return new RegExp(`${StartOfWord}${word} As (\\w+)`, flag);
}

export function DeclarationMatchPattern(word: string, flag: string): RegExp
{
    return new RegExp(`(?:Dim|Public|Private|Const|For Each) ${word}`, flag);
}