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