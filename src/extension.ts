import * as vscode from 'vscode';
import { b4xDefinitionProvider } from './b4xDefinitionProvider';
import { b4xHoverProvider } from './b4xHoverProvider';

export function activate(context: vscode.ExtensionContext) 
{
    console.log('扩展已激活！');

    // register definition provider
    const definitionProvider = new b4xDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('b4x', definitionProvider));

    // register hover provider
    const hoverProvider = new b4xHoverProvider();
    context.subscriptions.push(vscode.languages.registerHoverProvider('b4x', hoverProvider))
}

// 扩展停用时调用
export function deactivate() 
{
    console.log('扩展已停用！');
}