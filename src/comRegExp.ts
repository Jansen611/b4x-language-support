export const EndOfWord:String = '\\b(?<=\\w)'
export const StartOfWord:String = '\\b(?=\\w)'

export enum Flag
{
    CaseIncensitive = 'i',
    Multiline = 'm',
    Unicode = 'u'
}