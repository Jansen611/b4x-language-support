import * as vscode from 'vscode';

const SignatureTriggerCommand: vscode.Command = {
    title: 'Trigger Signature', 
    command: 'editor.action.triggerParameterHints'
}

export const B4X_SYSTEMCLASS_NAME: Set<string> = new Set(['list', 'map', 'timer', 'string', 'intent', 'activity'])

export const B4X_SYSTEMCLASS_TYPE_COMPLETION: vscode.CompletionItem[] = [
    { // Char
        label: "Char",
        kind: vscode.CompletionItemKind.Class,
        detail: "Char",
        documentation: "Single character."
    },
    { // Boolean
        label: "Boolean",
        kind: vscode.CompletionItemKind.Class,
        detail: "Boolean",
        documentation: "True or False value."
    },
    { // Int
        label: "Int",
        kind: vscode.CompletionItemKind.Class,
        detail: "Int",
        documentation: "4 bytes integer number."
    },
    { // List
        label: "List",
        kind: vscode.CompletionItemKind.Class,
        detail: "List",
        documentation: "Lists are similar to dynamic arrays. You can add and remove items from a list and it will change its size accordingly. \n" +
                       "A list can hold any type of object. However if a list is declared as a process global object it cannot hold activity objects (like views). \n" +
                       "Basic4android automatically converts regular arrays to lists. So when a List parameter is expected you can pass an array instead."
    },
    { // Map
        label: "Map",
        kind: vscode.CompletionItemKind.Class,
        detail: "Map",
        documentation: "A collection that holds pairs of keys and values. The keys are unique. Which means that if you add a key/value pair (entry) and \n" +
                       "the collection already holds an entry with the same key, the previous entry will be removed from the map. \n" +
                       "Fetching an item is done by looking for its key. This is usually a very fast operation (O(1) compared to O(n) in a list). \n" +
                       "The key should be a string or a number. The value can be any type of object. \n" +
                       "Note that this map implementation does return items in the same order as they were added. \n" +
                       "Usually you will use Put to add items and Get or GetDefault to get the values based on the key."
    },
    { // Timer
        label: "Timer",
        kind: vscode.CompletionItemKind.Class,
        detail: "Timer",
        documentation: "A Timer object generates ticks events at specified intervals. \n" +
                       "Using a timer is a good alternative to a long loop, as it allows the UI thread to handle other events and messages. \n" +
                       "Note that the timer events will not fire while the UI thread is busy running other code. \n" +
                       "The timer Enabled property is set to False by default. To make it start working you should change it to True. \n" +
                       "Timer events will not fire when the activity is paused, or if a blocking dialog (like Msgbox) is visible. \n" +
                       "Timers should be declared in Sub Process_Globals. Otherwise you may get multiple timers running when the activity is recreated. \n" +
                       "It is also important to disable the timer when the activity is pausing and then enable it when it resumes. This will save CPU and battery."
    },
    { // String
        label: "String",
        kind: vscode.CompletionItemKind.Class,
        detail: "String",
        documentation: "An immutable string of characters"
    },
    { // Intent
        label: "Intent",
        kind: vscode.CompletionItemKind.Class,
        detail: "Intent",
        documentation: "Intent objects are messages which you can send to the OS in order to do some external action.\n" +
                       "The Intent object should be sent with StartActivity keyword."
    },
    { // Activity
        label: "Activity",
        kind: vscode.CompletionItemKind.Class,
        detail: "Activity",
        documentation: "Each activity module include a predefined Activity object. \n" +
                       "Activity is the main component of your application. \n" +
                       "Activities have three special life cycle related event: Activity_Create, Activity_Resume and Activity_Pause. \n\n" +
                       "You can add and remove views to this activity with AddView and RemoveViewAt methods.\n" +
                       "You can also load a layout file with LoadLayout.\n" +
                       "The Touch event can be used to handle user touches. \n" +
                       "The first parameter of this event is the Action parameter. The parameter values can be ACTION_DOWN,\n" +
                       "ACTION_MOVE or ACTION_UP. Use this value to find the user current action.\n" +
                       "The KeyPress and KeyUp events occur when the user presses or releases a key, assuming that no other view has consumed this event (like EditText).\n" +
                       "When handling the KeyPress or KeyUp event you should return a boolean value which tells whether the event was consumed."
    },
]

export const B4X_BASECLASS_MEMBER_DECLARATION: Record<string, string> ={
    // List Object
    "list.add" : "Add(item As Object)",
    "list.addall" : "AddAll(list As List)",
    "list.addallat" : "AddAllAt(index As Int, list As List)",
    "list.as" : "As(Type As Object)",
    "list.clear" : "Clear()",
    "list.get" : "Get(index As Int) As Object",
    "list.indexof" : "IndexOf(item As Object) As Int",
    "list.initialize" : "Initialize()",
    "list.initialize2" : "Initialize2(array As List)",
    "list.insertat" : "InsertAt(index As Int, list As List)",
    "list.isinitialized" : "IsInitialized() As Boolean",
    "list.removeat" : "RemoveAt(index As Int)",
    "list.set" : "Set(index As Int, item As Object)",
    "list.size" : "Size As Int", // Property
    "list.sort" : "Sort(ascending As Boolean)",
    "list.sortcaseinsensitive" : "SortCaseInsensitive(ascending As Boolean)",
    "list.sorttype" : "SortType(fieldName As String, ascending As Boolean)",
    "list.sorttypecaseinsensitive" : "SortTypeCaseInsensitive(fieldName As String, ascending As Boolean)",

    // Map Object
    "map.initialize" : "Initialize()",
    "map.put" : "Put(key As Object, value As Object) As Object",
    "map.remove" : "Remove(key As Object) As Object",
    "map.get" : "Get(key As Object) As Object",
    "map.getdefault" : "GetDefault(key As Object, defaultValue As Object) As Object",
    "map.getkeyat" : "GetKeyAt(index As Int) As Object",
    "map.getvalueat" : "GetValueAt(index As Int) As Object",
    "map.clear" : "Clear()",
    "map.containskey" : "ContainsKey(key As Object) As Boolean",
    "map.containsvalue" : "ContainsValue(value As Object) As Boolean",
    "map.keys" : "Keys() As IterableList",
    "map.values" : "Values() As IterableList",
    "map.size" : "Size As Int", // Property

    // Timer Object
    "timer.initialize" : "Initialize(ba As BA, eventName As String, interval As Long)",
    "timer.isinitialized" : "IsInitialized() As Boolean",
    "timer.enabled" : "Enabled As Boolean", // Property
    "timer.interval" : "Interval As Long", // Property

    // String Object
    "string.length": "Length() As Int",
    "string.indexof": "IndexOf(searchFor As String) As Int",
    "string.indexof2": "IndexOf2(searchFor As String, index As Int) As Int",
    "string.lastindexof": "LastIndexOf(searchFor As String) As Int",
    "string.lastindexof2": "LastIndexOf2(searchFor As String, index As Int) As Int",
    "string.trim": "Trim() As String",
    "string.substring": "SubString(beginIndex As Int) As String",
    "string.substring2": "SubString2(beginIndex As Int, endIndex As Int) As String",
    "string.compareto": "CompareTo(other As String) As Int",
    "string.equalsignorecase": "EqualsIgnoreCase(other As String) As Boolean",
    "string.charat": "CharAt(index As Int) As Char",
    "string.startswith": "StartsWith(prefix As String) As Boolean",
    "string.endswith": "EndsWith(suffix As String) As Boolean",
    "string.replace": "Replace(target As String, replacement As String) As String",
    "string.tolowercase": "ToLowerCase() As String",
    "string.contains": "Contains(searchFor As String) As Boolean",
    "string.touppercase": "ToUpperCase() As String",
    "string.getbytes": "GetBytes(charset As String) As Byte[]",

    // Intent Object
    "intent.initialize": "Initialize(action As String, uri As String)",
    "intent.initialize2": "Initialize2(uri As String, flags As Int)",
    "intent.action": "Action As String",
    "intent.settype": "SetType(type As String)",
    "intent.flags": "Flags As Int",
    "intent.addcategory": "AddCategory(category As String)",
    "intent.getdata": "GetData() As String",
    "intent.putextra": "PutExtra(name As String, Value As Object)",
    "intent.getextra": "GetExtra(name As String) As Object",
    "intent.hasextra": "HasExtra(name As String) As Boolean",
    "intent.extrastostring": "ExtrasToString() As String",
    "intent.wrapasintentchooser": "WrapAsIntentChooser(title As String)",
    "intent.setcomponent": "SetComponent(component As String)",
    "intent.setpackage": "SetPackage(packageName As String)",

    // Activity Object
    "activity.getstartingintent": "GetStartingIntent() As IntentWrapper",
    "activity.setactivityresult": "SetActivityResult(result As Int, data As IntentWrapper)",
    "activity.addview": "AddView(view As View, left As Int, top As Int, width As Int, height As Int)",
    "activity.getview": "GetView(index As Int) As ConcreteViewWrapper",
    "activity.removeallviews": "RemoveAllViews()",
    "activity.removeviewat": "RemoveViewAt(index As Int)",
    "activity.numberofviews": "NumberOfViews As Int",
    "activity.addmenuitem": "AddMenuItem(title As String, eventName As String)",
    "activity.addmenuitem2": "AddMenuItem2(title As String, eventName As String, bitmap As Bitmap)",
    "activity.addmenuitem3": "AddMenuItem3(title As String, eventName As String, bitmap As Bitmap, addToActionBar As Boolean)",
    "activity.loadlayout": "LoadLayout(layoutFile As String, ba As BA) As LayoutValues",
    "activity.rerundesignerscript": "RerunDesignerScript(layout As String, ba As BA, width As Int, height As Int)",
    "activity.openmenu": "OpenMenu()",
    "activity.closemenu": "CloseMenu()",
    "activity.title": "Title As String",
    "activity.titlecolor": "TitleColor As Int",
    "activity.disableaccessibility": "DisableAccessibility(disable As Boolean)",
    "activity.finish": "Finish()",
    "activity.getallviewsrecursive": "GetAllViewsRecursive() As IterableList"
}

export const B4X_BASECLASS_MEMBER_COMPLETION: Record<string, vscode.CompletionItem[]> = {
    "list": [
        { // Add
            label: "Add",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.add'],
            documentation: "Adds an item at the end of the list.",
            //insertText: new vscode.SnippetString("Add($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // AddAll
            label: "AddAll",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.addall'],
            documentation: "Adds all elements in the specified collection to the end of the list.",
            //insertText: new vscode.SnippetString("AddAll($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // AddAllAt
            label: "AddAllAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.addallat'],
            documentation: "Adds all elements in the specified collection starting at the specified index.",
            //insertText: new vscode.SnippetString("AddAllAt($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // As
            label: "As",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.as'],
            documentation: "Cast the object to a different type.",
            //insertText: new vscode.SnippetString("As($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Clear
            label: "Clear",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.clear'],
            documentation: "Removes all the items from the list.",
            //insertText: new vscode.SnippetString("Clear()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Get
            label: "Get",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.get'],
            documentation: "Gets the item in the specified index. The item is not removed from the list.",
            ////insertText: new vscode.SnippetString("Get($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { //IndexOf
            label: "IndexOf",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.indexof'],
            documentation: "Returns the index of the specified item, or -1 if it was not found.",
            //insertText: new vscode.SnippetString("IndexOf($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Initialize
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.initialize'],
            documentation: "Initializes an empty list.",
            //insertText: new vscode.SnippetString("Initialize()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Initialize2
            label: "Initialize2",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.initialize2'],
            documentation: "Initializes a list with the given values. This method should be used to convert arrays to lists. \n" + 
                           "Note that if you pass a list to this method then both objects will share the same list, \n" +
                           "and if you pass an array the list will be of a fixed size. Meaning that you cannot later add or remove items.",
            //insertText: new vscode.SnippetString("Initialize2($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // InsertAt
            label: "InsertAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.insertat'],
            documentation: "Inserts the specified element in the specified index, before the current item at that index. \n" + 
                           "As a result all items with index equal to or larger than the specified index are shifted.",
            //insertText: new vscode.SnippetString("InsertAt($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // IsInitialized
            label: "IsInitialized",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.isinitialized'],
            //insertText: new vscode.SnippetString("IsInitialized()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // RemoveAt
            label: "RemoveAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.removeat'],
            documentation: "Removes the item at the specified index.",
            //insertText: new vscode.SnippetString("RemoveAt($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Set
            label: "Set",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.set'],
            documentation: "Replaces the current item in the specified index with the new item.",
            //insertText: new vscode.SnippetString("Set($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Size
            label: "Size",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.size'],
            documentation: "Returns the number of items in the list.",
            //insertText: new vscode.SnippetString("Size"),
        },
        { // Sort
            label: "Sort",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.sort'],
            documentation: "Sorts the list. \n" +
	                       "The items must all be numbers or strings.",
            //insertText: new vscode.SnippetString("Sort($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SortCaseInsensitive
            label: "SortCaseInsensitive",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.sortcaseinsensitive'],
            documentation: "Lexicographically sorts the list, ignoring the characters case. \n" +
	                       "The items must all be numbers or strings.",
            //insertText: new vscode.SnippetString("SortCaseInsensitive($1)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SortType
            label: "SortType",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.sorttype'],
            documentation: "Sorts a list with items of user defined type. The list is sorted based on the specified field. \n" +
                           "FieldName - The case-sensitive field name that will be used for sorting. Field must contain numbers or strings. \n" +
                           "Ascending - Whether to sort ascending or descending.",
            //insertText: new vscode.SnippetString("SortType($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SortTypeCaseInsensitive
            label: "SortTypeCaseInsensitive",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['list.sorttypecaseinsensitive'],
            documentation: "Similar to SortType. Lexicographically sorts the list, ignoring the characters case.",
            //insertText: new vscode.SnippetString("SortTypeCaseInsensitive($1, $2)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        }
    ],
    "map": [
        { // Initialize
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.initialize'],
            documentation: "Initializes the object.",
            //insertText: new vscode.SnippetString("Initialize()")
        },
        { // Put
            label: "Put",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.put'],
            documentation: "Puts a key/value pair in the map, overwriting the previous item with this key (if such exists). \n" + 
                           "Returns the previous item with this key or null if there was no such item. \n" + 
                           "Note that if you are using strings as the keys then the keys are case sensitive.",
            //insertText: new vscode.SnippetString("Put($1, $2)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Remove
            label: "Remove",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.remove'],
            documentation: "Removes the item with the given key, if such exists. \n" + 
                           "Returns the item removed or null if no matching item was found.",
            //insertText: new vscode.SnippetString("Remove($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Get
            label: "Get",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.get'],
            documentation: "Returns the value of the item with the given key. \n"+
                           "Returns Null if the value doesn't exist.",
            //insertText: new vscode.SnippetString("Get($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetDefault
            label: "GetDefault",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.getdefault'],
            documentation: "Returns the value of the item with the given key. If no such item exists the specified default value is returned.",
            //insertText: new vscode.SnippetString("GetDefault($1, $2)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetKeyAt
            label: "GetKeyAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.getkeyat'],
            documentation: "Returns the key of the item at the given index. \n" +
                           "GetKeyAt and GetValueAt should be used to iterate over all the items. \n" +
                           "These methods are optimized for iterating over the items in ascending order.",
            //insertText: new vscode.SnippetString("GetKeyAt($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetValueAt
            label: "GetValueAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.getvalueat'],
            documentation: "Returns the value of the item at the given index. \n" +
                           "GetKeyAt and GetValueAt should be used to iterate over all the items. \n" +
                           "These methods are optimized for iterating over the items in ascending order.",
            //insertText: new vscode.SnippetString("GetValueAt($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Clear
            label: "Clear",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.clear'],
            documentation: "Clears all items from the map.",
            //insertText: new vscode.SnippetString("Clear()")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // ContainsKey
            label: "ContainsKey",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.containskey'],
            documentation: "Tests whether there is an item with the given key.",
            //insertText: new vscode.SnippetString("ContainsKey($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // ContainsValue
            label: "ContainsValue",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.containsvalue'],
            documentation: "Tests whether there is an item with the given value.",
            //insertText: new vscode.SnippetString("containsValue($1)")
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Keys
            label: "Keys",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.keys'],
            documentation: "Returns an object which can be used to iterate over all the keys with a For Each block.",
            //insertText: new vscode.SnippetString("Keys()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Values
            label: "Values",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.values'],
            documentation: "Returns an object which can be used to iterate over all the values with a For Each block.",
            //insertText: new vscode.SnippetString("Values()"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Size
            label: "Size",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['map.size'],
            documentation: "Returns the number of items stored in the map.",
            //insertText: "Size",
        }
    ],
    "timer": [
        { // Initialize
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['timer.initialize'],
            documentation: "Initializes the timer with the event sub prefix and the specified interval (measured in milliseconds). \n" + 
                           "MPORTANT: this object should be declared in Sub Process_Globals.",
            //insertText: new vscode.SnippetString("Initialize($1, $2, $3)"),
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // IsInitialized
            label: "IsInitialized",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['timer.isinitialized'],
            documentation: "",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Enabled
            label: "Enabled",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['timer.enabled'],
            documentation: "Gets or sets whether the timer is enabled (ticking).",
        },
        { // Interval
            label: "Interval",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['timer.interval'],
            documentation: "Gets or sets the interval between tick events, measured in milliseconds.",
        }
    ],
    "string": [
        { // Length
            label: "Length",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.length'],
            documentation: "Returns the length of this string.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // IndexOf
            label: "IndexOf",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.indexof'],
            documentation: "Returns the index of the first occurrence of SearchFor string in the string.\n" + 
                           "Returns -1 if SearchFor was not found.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // IndexOf2
            label: "IndexOf2",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.indexof2'],
            documentation: "Returns the index of the first occurrence of SearchFor string in the string.\n" + 
                           "Starts searching from the given Index.\n" +
                           "Returns -1 if SearchFor was not found.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // LastIndexOf
            label: "LastIndexOf",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.lastindexof'],
            documentation: "Returns the index of the first occurrence of SearchFor string in the string.\n" + 
                           "The search starts at the end of the string and advances to the beginning.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // LastIndexOf2
            label: "LastIndexOf2",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.lastindexof2'],
            documentation: "Returns the index of the first occurrence of SearchFor string in the string.\n" + 
                           "The search starts at the given index and advances to the beginning.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Trim
            label: "Trim",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.trim'],
            documentation: "Returns a copy of the original string without any leading or trailing white spaces.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SubString
            label: "SubString",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.substring'],
            documentation: "Returns a new string which is a substring of the original string.\n" + 
                           "The new string will include the character at BeginIndex and will extend to the end of the string.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SubString2
            label: "SubString2",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.substring2'],
            documentation: "Returns a new string which is a substring of the original string.\n" + 
                           "The new string will include the character at BeginIndex and will extend to the character at EndIndex, not including the last character.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // CompareTo
            label: "CompareTo",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.compareto'],
            documentation: "Lexicographically compares the two strings.\n" + 
                           "Returns a value less than 0 if the current string precedes Other.\n" + 
                           "Returns 0 if both strings are equal.\n" + 
                           "Returns a value larger than 0 if the current string comes after Other.\n" + 
                           "Note that upper case characters precede lower case characters.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // EqualsIgnoreCase
            label: "EqualsIgnoreCase",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.equalsignorecase'],
            documentation: "Returns true if both strings are equal ignoring their case.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // CharAt
            label: "CharAt",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.charat'],
            documentation: "Returns the character at the given index.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // StartsWith
            label: "StartsWith",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.startswith'],
            documentation: "Returns true if this string starts with the given Prefix.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // EndsWith
            label: "EndsWith",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.endswith'],
            documentation: "Returns true if this string ends with the given Suffix.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Replace
            label: "Replace",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.replace'],
            documentation: "Returns a new string resulting from the replacement of all the occurrences of Target with Replacement.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // ToLowerCase
            label: "ToLowerCase",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.tolowercase'],
            documentation: "Returns a new string which is the result of lower casing this string.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Contains
            label: "Contains",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.contains'],
            documentation: "Tests whether the string contains the given string parameter.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // ToUpperCase
            label: "ToUpperCase",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.touppercase'],
            documentation: "Returns a new string which is the result of upper casing this string.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetBytes
            label: "GetBytes",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['string.getbytes'],
            documentation: "Encodes the string into a new array of bytes.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        }
    ],
    "intent": [
        { // Initialize
            label: "Initialize",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.initialize'],
            documentation: "Initializes the object using the given Action and data Uri. Action can be one of the action constants or any other string.\nPass an empty string if a Uri is not required.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Initialize2
            label: "Initialize2",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.initialize2'],
            documentation: "Initializes the object by parsing the Uri.\nFlags - Additional integer value. Pass 0 if it is not required.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Action
            label: "Action",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.action'],
            documentation: "Gets and Sets the Intent action.",
        },
        { // SetType
            label: "SetType",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.settype'],
            documentation: "Sets the MIME type.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // Flags
            label: "Flags",
            kind: vscode.CompletionItemKind.Property,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.flags'],
            documentation: "Gets and Sets the flags component."
        },
        { // AddCategory
            label: "AddCategory",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.addcategory'],
            documentation: "Adds a category describing the intent required operation.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetData
            label: "GetData",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.getdata'],
            documentation: "Retrieves the data component as a string.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // PutExtra
            label: "PutExtra",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.putextra'],
            documentation: "Adds extra data to the intent.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // GetExtra
            label: "GetExtra",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.getextra'],
            documentation: "Returns the item value with the given key.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // HasExtra
            label: "HasExtra",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.hasextra'],
            documentation: "Tests whether an item with the given key exists.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // ExtrasToString
            label: "ExtrasToString",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.extrastostring'],
            documentation: "Returns a string containing the extra items. This is useful for debugging.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // WrapAsIntentChooser
            label: "WrapAsIntentChooser",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.wrapasintentchooser'],
            documentation: "Wraps the intent in another \"chooser\" intent. A dialog will be displayed to the user with the available services that can act on the intent.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SetComponent
            label: "SetComponent",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.setcomponent'],
            documentation: "Explicitly sets the component that will handle this intent.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        },
        { // SetPackage
            label: "SetPackage",
            kind: vscode.CompletionItemKind.Method,
            detail: B4X_BASECLASS_MEMBER_DECLARATION['intent.setpackage'],
            documentation: "Explicitly sets the package name of the target application.",
            commitCharacters: ['('],
            command: SignatureTriggerCommand
        }
    ],
    "activity": [
        { // GetStartingIntent
        label: "GetStartingIntent",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.getstartingintent'],
        documentation: "Returns the intent that started this activity.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // SetActivityResult
        label: "SetActivityResult",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.setactivityresult'],
        documentation: "(Advanced) Sets the result that the calling Activity will get after calling StartActivityForResult.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // AddView
        label: "AddView",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.addview'],
        documentation: "Adds a view to this activity.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // GetView
        label: "GetView",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.getview'],
        documentation: "Gets the view that is stored in the specified index.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // RemoveAllViews
        label: "RemoveAllViews",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.removeallviews'],
        documentation: "Removes all child views.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // RemoveViewAt
        label: "RemoveViewAt",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.removeviewat'],
        documentation: "Removes the view that is stored in the specified index.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // NumberOfViews
        label: "NumberOfViews",
        kind: vscode.CompletionItemKind.Property,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.numberofviews'],
        documentation: "Returns the number of child views. [readonly]",
        },
        { // AddMenuItem
        label: "AddMenuItem",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.addmenuitem'],
        documentation: "Adds a menu item to the activity.\n" +
                       "Title - Menu item title.\n" +
                       "EventName - The prefix name of the sub that will handle the click event.\n" +
                       "This method should only be called inside sub Activity_Create.\n" +
                       "Note that the 'Sender' value inside the click event equals to the clicked menu item text.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // AddMenuItem2
        label: "AddMenuItem2",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.addmenuitem2'],
        documentation: "Adds a menu item to the activity.\n" +
                       "Title - Menu item title.\n" +
                       "EventName - The prefix name of the sub that will handle the click event.\n" +
                       "Bitmap - Bitmap to draw as the item background.\n" +
                       "Only the first five (or six if there are six total) menu items display icons.\n" +
                       "This method should only be called inside sub Activity_Create.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // AddMenuItem3
        label: "AddMenuItem3",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.addmenuitem3'],
        documentation: "Similar to AddMenuItem2. If AddToActionBar is true then the item will be displayed in the action bar (on Android 3.0+ devices) if there is enough room.\n" +
                       "If there is not enough room then the item will be displayed together with the other menu items.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // LoadLayout
        label: "LoadLayout",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.loadlayout'],
        documentation: "Loads a layout file (.bal).\n" +
                       "Returns the LayoutValues of the actual layout variant that was loaded.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // RerunDesignerScript
        label: "RerunDesignerScript",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.rerundesignerscript'],
        documentation: "This method is deprecated. It ignores the anchoring features and it will fail in Rapid Debug mode.\n" +
                       "You should instead remove the views and load the layout again.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // OpenMenu
        label: "OpenMenu",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.openmenu'],
        documentation: "Programmatically opens the menu.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // CloseMenu
        label: "CloseMenu",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.closemenu'],
        documentation: "Programmatically closes the menu.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // Title
        label: "Title",
        kind: vscode.CompletionItemKind.Property,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.title'],
        documentation: "Gets and Sets the activity title.",
        },
        { // TitleColor
        label: "TitleColor",
        kind: vscode.CompletionItemKind.Property,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.titlecolor'],
        documentation: "Gets and Sets the title color. This property is only supported by Android 2.x devices. It will not do anything on newer devices.",
        },
        { // DisableAccessibility
        label: "DisableAccessibility",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.disableaccessibility'],
        documentation: "This method was added as a workaround for an Android bug.\n" +
                       "By setting the Disable property to True the child views (of all Activities) will not be added to the accessibility enabled list.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // Finish
        label: "Finish",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.finish'],
        documentation: "Closes this activity.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        },
        { // GetAllViewsRecursive
        label: "GetAllViewsRecursive",
        kind: vscode.CompletionItemKind.Method,
        detail: B4X_BASECLASS_MEMBER_DECLARATION['activity.getallviewsrecursive'],
        documentation: "Returns an iterator that iterates over all the child views including views that were added to other child views.",
        commitCharacters: ['('],
        command: SignatureTriggerCommand
        }
    ]

    // Other B4X Base Classes...
};
