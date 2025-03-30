import { METHODS } from 'http';
import * as vscode from 'vscode';

const SignatureTriggerCommand: vscode.Command = {
    title: 'Trigger Signature', 
    command: 'editor.action.triggerParameterHints'
}

export const B4X_BASECLASS_MEMBER_DECLARATION: Record<string, string> ={
    "list.add" : "Add(item As Object)",
    "list.addall" : "AddAll(list As List)",
    "list.addallat" : "AddAllAt(index As Int, list As List)",
    "list.as" : "As(Type As Object)",
    "list.clear" : "Clear()",
    "list.get" : "Get(index As Int) As Object",

}

export const B4X_BASECLASS_MEMBER_COMPLETION: Record<string, vscode.CompletionItem[]> = {
    "list": [
        {
            label: "Add",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.add'],
            documentation: "Adds an item at the end of the list.",
            //insertText: new vscode.SnippetString("Add($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "AddAll",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.addall'],
            documentation: "Adds all elements in the specified collection to the end of the list.",
            //insertText: new vscode.SnippetString("AddAll($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "AddAllAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.addallat'],
            documentation: "Adds all elements in the specified collection starting at the specified index.",
            //insertText: new vscode.SnippetString("AddAllAt($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "As",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.as'],
            documentation: "Cast the object to a different type.",
            //insertText: new vscode.SnippetString("As($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Clear",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.clear'],
            documentation: "Removes all the items from the list.",
            //insertText: new vscode.SnippetString("Clear()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Get",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.get'],
            documentation: "Gets the item in the specified index. The item is not removed from the list.",
            ////insertText: new vscode.SnippetString("Get($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "IndexOf",
            kind: vscode.CompletionItemKind.Method,
            detail: "IndexOf(item As Object) As Int",
            documentation: "Returns the index of the specified item, or -1 if it was not found.",
            //insertText: new vscode.SnippetString("IndexOf($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: "Initialize()",
            documentation: "Initializes an empty list.",
            //insertText: new vscode.SnippetString("Initialize()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Initialize2",
            kind: vscode.CompletionItemKind.Method,
            detail: "Initialize2(array As List)",
            documentation: "Initializes a list with the given values. This method should be used to convert arrays to lists. \n" + 
                           "Note that if you pass a list to this method then both objects will share the same list, \n" +
                           "and if you pass an array the list will be of a fixed size. Meaning that you cannot later add or remove items.",
            //insertText: new vscode.SnippetString("Initialize2($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "InsertAt",
            kind: vscode.CompletionItemKind.Method,
            detail: "InsertAt(index As Int, list As List)",
            documentation: "Inserts the specified element in the specified index, before the current item at that index. \n" + 
                           "As a result all items with index equal to or larger than the specified index are shifted.",
            //insertText: new vscode.SnippetString("InsertAt($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "IsInitialized",
            kind: vscode.CompletionItemKind.Method,
            detail: "IsInitialized() As Boolean",
            //insertText: new vscode.SnippetString("IsInitialized()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "RemoveAt",
            kind: vscode.CompletionItemKind.Method,
            detail: "RemoveAt(index As Int)",
            documentation: "Removes the item at the specified index.",
            //insertText: new vscode.SnippetString("RemoveAt($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Set",
            kind: vscode.CompletionItemKind.Method,
            detail: "Set(index As Int, item As Object)",
            documentation: "Replaces the current item in the specified index with the new item.",
            //insertText: new vscode.SnippetString("Set($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Size",
            kind: vscode.CompletionItemKind.Property,
            detail: "Size As Int",
            documentation: "Returns the number of items in the list.",
            //insertText: new vscode.SnippetString("Size"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "Sort",
            kind: vscode.CompletionItemKind.Method,
            detail: "Sort(ascending As Boolean)",
            documentation: "Sorts the list. \n" +
	                       "The items must all be numbers or strings.",
            //insertText: new vscode.SnippetString("Sort($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "SortCaseInsensitive",
            kind: vscode.CompletionItemKind.Method,
            detail: "SortCaseInsensitive(ascending As Boolean)",
            documentation: "Lexicographically sorts the list, ignoring the characters case. \n" +
	                       "The items must all be numbers or strings.",
            //insertText: new vscode.SnippetString("SortCaseInsensitive($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "SortType",
            kind: vscode.CompletionItemKind.Method,
            detail: "SortType(fieldName As String, ascending As Boolean)",
            documentation: "Sorts a list with items of user defined type. The list is sorted based on the specified field. \n" +
                           "FieldName - The case-sensitive field name that will be used for sorting. Field must contain numbers or strings. \n" +
                           "Ascending - Whether to sort ascending or descending.",
            //insertText: new vscode.SnippetString("SortType($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        {
            label: "SortTypeCaseInsensitive",
            kind: vscode.CompletionItemKind.Method,
            detail: "SortTypeCaseInsensitive(fieldName As String, ascending As Boolean)",
            documentation: "Similar to SortType. Lexicographically sorts the list, ignoring the characters case.",
            //insertText: new vscode.SnippetString("SortTypeCaseInsensitive($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        }
    ],
    "map": [
        {
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: "Initialize()",
            documentation: "Initializes the object.",
            //insertText: new vscode.SnippetString("Initialize()")
        },
        {
            label: "Put",
            kind: vscode.CompletionItemKind.Method,
            detail: "Put(Key As Object, Value As Object) As Object",
            documentation: "Puts a key/value pair in the map, overwriting the previous item with this key (if such exists). \n" + 
                           "Returns the previous item with this key or null if there was no such item. \n" + 
                           "Note that if you are using strings as the keys then the keys are case sensitive.",
            //insertText: new vscode.SnippetString("Put($1, $2)")
        },
        {
            label: "Remove",
            kind: vscode.CompletionItemKind.Method,
            detail: "Remove(Key As Object) As Object",
            documentation: "Removes the item with the given key, if such exists. \n" + 
                           "Returns the item removed or null if no matching item was found.",
            //insertText: new vscode.SnippetString("Remove($1)")
        },
        {
            label: "Get",
            kind: vscode.CompletionItemKind.Method,
            detail: "Get(Key As Object) As Object",
            documentation: "Returns the value of the item with the given key. \n"+
                           "Returns Null if the value doesn't exist.",
            //insertText: new vscode.SnippetString("Get($1)")
        },
        {
            label: "GetDefault",
            kind: vscode.CompletionItemKind.Method,
            detail: "GetDefault(Key As Object, DefaultValue As Object) As Object",
            documentation: "Returns the value of the item with the given key. If no such item exists the specified default value is returned.",
            //insertText: new vscode.SnippetString("GetDefault($1, $2)")
        },
        {
            label: "GetKeyAt",
            kind: vscode.CompletionItemKind.Method,
            detail: "GetKeyAt(index As Int) As Object",
            documentation: "Returns the key of the item at the given index. \n" +
                           "GetKeyAt and GetValueAt should be used to iterate over all the items. \n" +
                           "These methods are optimized for iterating over the items in ascending order.",
            //insertText: new vscode.SnippetString("GetKeyAt($1)")
        },
        {
            label: "GetValueAt",
            kind: vscode.CompletionItemKind.Method,
            detail: "GetValueAt(index As Int) As Object",
            documentation: "Returns the value of the item at the given index. \n" +
                           "GetKeyAt and GetValueAt should be used to iterate over all the items. \n" +
                           "These methods are optimized for iterating over the items in ascending order.",
            //insertText: new vscode.SnippetString("GetValueAt($1)")
        },
        {
            label: "Clear",
            kind: vscode.CompletionItemKind.Method,
            detail: "Clear()",
            documentation: "Clears all items from the map.",
            //insertText: new vscode.SnippetString("Clear()")
        },
        {
            label: "ContainsKey",
            kind: vscode.CompletionItemKind.Method,
            detail: "ContainsKey(Key As Object) As Boolean",
            documentation: "Tests whether there is an item with the given key.",
            //insertText: new vscode.SnippetString("ContainsKey($1)")
        },
        {
            label: "containsValue",
            kind: vscode.CompletionItemKind.Method,
            detail: "containsValue(Value As Object) As Boolean",
            documentation: "Tests whether there is an item with the given value.",
            //insertText: new vscode.SnippetString("containsValue($1)")
        },
        {
            label: "Keys",
            kind: vscode.CompletionItemKind.Method,
            detail: "Keys() As IterableList",
            documentation: "Returns an object which can be used to iterate over all the keys with a For Each block.",
            //insertText: new vscode.SnippetString("Keys()"),
        },
        {
            label: "Values",
            kind: vscode.CompletionItemKind.Method,
            detail: "Values() As IterableList",
            documentation: "Returns an object which can be used to iterate over all the values with a For Each block.",
            //insertText: new vscode.SnippetString("Values()"),
        },
        {
            label: "Size",
            kind: vscode.CompletionItemKind.Property,
            detail: "Size As Int",
            documentation: "Returns the number of items stored in the map.",
            //insertText: "Size",
        }
    ]
    // 其他 B4X 基础类...
};
