"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
function activate(context) {
    console.log('扩展已激活！');
    // 注册定义提供者
    const definitionProvider = new B4XDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('b4x', definitionProvider));
}
// 扩展停用时调用
function deactivate() {
    console.log('扩展已停用！');
}
class B4XDefinitionProvider {
    provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);
        const lineNo = position.line;
        if (word) {
            // finding the local sub boundary
            const localSubBoundary = findLocalSubBoundary(document, lineNo);
            let definitionPosition = undefined;
            if (localSubBoundary[0] < localSubBoundary[1]) {
                // good, the local sub found
                definitionPosition = findLocalVariableDeclaration(document, word, localSubBoundary);
            }
            if (!definitionPosition) {
                // this is not a local declaration, time to search globally
                console.log(`查找定义: ${word}`);
                // 查找定义的位置
                definitionPosition = findDefinition(document, word);
            }
            if (definitionPosition) {
                console.log(`找到定义: ${word} 在 ${definitionPosition.line}:${definitionPosition.character}`);
                // 返回定义的位置
                return new vscode.Location(document.uri, definitionPosition);
            }
            else {
                console.log(`未找到定义: ${word}`);
            }
        }
        // 如果未找到定义，返回 undefined
        return undefined;
    }
}
// 查找定义的逻辑
function findDefinition(document, word) {
    // 遍历文档的每一行
    for (let line = 0; line < document.lineCount; line++) {
        const text = document.lineAt(line).text;
        // 检查是否包含目标单词
        const isFunctionFound = text.toLowerCase().includes(`Sub ${word}`.toLowerCase());
        const isVariableFound = text.toLowerCase().includes(`Private ${word} As`.toLowerCase()) || text.toLowerCase().includes(`Public ${word} As`.toLowerCase());
        if (isFunctionFound || isVariableFound) {
            // 返回定义的位置
            return new vscode.Position(line, text.indexOf(word));
        }
    }
    // 如果未找到定义，返回 undefined
    return undefined;
}
// find the local variable declaration
function findLocalVariableDeclaration(document, word, localSubBoundary) {
    if (localSubBoundary[0] >= localSubBoundary[1]) {
        return undefined;
    }
    // go through the document line by line
    for (let line = localSubBoundary[0]; line < localSubBoundary[1]; line++) {
        const text = document.lineAt(line).text;
        // checking if local declaration matches
        if (text.toLowerCase().includes(`Dim ${word}`.toLowerCase())) {
            // found the local variable, returning the position
            return new vscode.Position(line, text.indexOf(word));
        }
    }
    // no local declaration found, returning undefined
    return undefined;
}
// find the Local Sub Boundary
function findLocalSubBoundary(document, lineNo) {
    const subStartString = "Sub ".toLowerCase();
    const subEndString = "End Sub".toLowerCase();
    let retArray = [0, 0];
    // fining the start of the local sub boundary
    for (let line = lineNo; line > -1; line--) {
        const text = document.lineAt(line).text;
        const isEndSubFound = text.toLowerCase().trim().includes(`${subEndString}`);
        const isStartSubFound = text.toLowerCase().trim().includes(`${subStartString}`);
        if (isStartSubFound) {
            // we found the subStartString first
            retArray[0] = line;
            break;
        }
        else if (isEndSubFound) {
            // we found the subEndString first
            // no point continuing, this is not inside a local sub
            return retArray;
        }
    }
    // fining the end of the local sub boundary
    for (let line = lineNo; line < document.lineCount; line++) {
        const text = document.lineAt(line).text;
        const isEndSubFound = text.toLowerCase().trim().includes(`${subEndString}`);
        const isStartSubFound = text.toLowerCase().trim().includes(`${subStartString}`);
        if (isStartSubFound) {
            // we found the subStartString first
            // no point continuing, this is not inside a local sub
            return retArray;
        }
        else if (isEndSubFound) {
            // we found the subEndString first
            retArray[1] = line;
            break;
        }
    }
    return retArray;
}
//# sourceMappingURL=extension.js.map