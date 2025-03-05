import * as vscode from 'vscode';
import { b4xDefinitionProvider } from './b4xDefinitionProvider';

export function activate(context: vscode.ExtensionContext) 
{
    console.log('扩展已激活！');

    // 注册定义提供者
    const definitionProvider = new b4xDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('b4x', definitionProvider));
    //vscode.languages.registerHoverProvider('b4x',vscode.provid new vscode.Hover('I am a hover!'))
}

// 扩展停用时调用
export function deactivate() 
{
    console.log('扩展已停用！');
}