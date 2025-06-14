import * as vscode from 'vscode';

export class FunctionBlock
{
    LineStart: number = -1;
    LineEnd: number = -1;
    FunctionName: string = "";
    FunctionScope: FunctionScope = FunctionScope.Undefined;
    BlockText: string = "";
}

export class KeywordInfo
{
    KeywordName: string = '';
    DefinitionPos: vscode.Position | undefined = undefined; 
    Scope: KeywordScope = KeywordScope.Undefined;
    Type: KeywordType = KeywordType.Undefined;
    ClassName: string = '';
    ModuleName: string = '';
    ModuleType: ModuleType = ModuleType.Undefined;
}

export enum KeywordScope {Undefined = 0, Local = 1, Global = 2, CodeSpace = 3}

export enum KeywordType {Undefined = 0, Parameter = 1, Variable = 2, Sub = 3}

export enum ModuleType {Undefined = 0, Class = 1, StaticCode = 2, Service = 3}

export enum FunctionScope {Undefined = 0, Private = 1, Public = 2}