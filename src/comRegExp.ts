export const EndOfWord:string = '\\b(?<=\\w)'
export const StartOfWord:string = '\\b(?=\\w)'

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