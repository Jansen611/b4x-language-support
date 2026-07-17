/**
 * B4X Designer — Property Grid Webview
 *
 * Renders the property grid inside a VS Code sidebar WebviewView.
 * Receives PropertyData[] from the extension and renders typed editors.
 */

import { ScriptEditor } from './scriptEditor';

// ── VS Code API ──────────────────────────────────────────────────────

interface VsCodeApi {
    postMessage(msg: PropGridToExtMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// ── Message Types ────────────────────────────────────────────────────

interface PropertyData {
    key: string;
    displayName: string;
    category: string;
    description: string;
    editor: string;
    isMergeable: boolean;
    isReadOnly: boolean;
    value: unknown;
    options?: { label: string; value: unknown }[];
    min?: number;
    max?: number;
    step?: number;
    alphaEnabled?: boolean;
}

interface ScriptVariantEntry {
    label: string;
    script: string;
}

interface ViewTreeNode {
    name: string;
    typeName: string;
    isRoot: boolean;
    isContainer: boolean;
    children: ViewTreeNode[];
}

type ExtToPropGridMessage =
    | { type: 'loadProperties'; controlName: string; controlCount: number; properties: PropertyData[] }
    | { type: 'clearProperties' }
    | { type: 'loadViewTree'; treeKey: string; root: ViewTreeNode; selectedNames: string[]; availableControlTypes: string[]; customViewTypes: string[] }
    | { type: 'clearViewTree' }
    | { type: 'treeSelection'; names: string[] }
    | { type: 'loadScriptData'; generalScript: string; variantScripts: ScriptVariantEntry[]; currentVariantIndex: number; controlNames?: string[] }
    | { type: 'scriptError'; error: string }
    | { type: 'scriptSuccess' };

type PropGridToExtMessage =
    | { type: 'propertyChanged'; key: string; value: unknown }
    | { type: 'ready' }
    | { type: 'scriptChanged'; variantIndex: number; text: string }
    | { type: 'runScript' }
    | { type: 'deactivateScript' }
    | { type: 'treeSelectionChanged'; names: string[] }
    | { type: 'treeContextAction'; action: string; names: string[] }
    | { type: 'treeReparent'; names: string[]; targetName: string; index: number };

// ── State ────────────────────────────────────────────────────────────

let currentProperties: PropertyData[] = [];
const VIEWS_TREE_TAB = '__viewsTree';
let activeTab = VIEWS_TREE_TAB;
let currentControlName = '';
let currentControlCount = 0;
let hasReceivedProperties = false;
let rootEl: HTMLDivElement;
let propsArea: HTMLDivElement;
let viewTreeRoot: ViewTreeNode | null = null;
let treeSelectedNames: string[] = [];
let treeExpandedNames = new Set<string>();
let treeExpansionInitialized = false;
let treeFilter = '';
let availableControlTypes: string[] = [];
let customViewTypes: string[] = [];
let treeContextMenu: HTMLDivElement | null = null;
let draggedTreeNames: string[] = [];
let lastTreeAnchor = '';
let currentTreeKey = '';

// ── Script editor state ──────────────────────────────────────────────

let scriptGeneralText = '';
let scriptVariantEntries: ScriptVariantEntry[] = [];
let scriptSelectedVariant = -1; // -1 = general
let scriptPanel: HTMLDivElement | null = null;
let scriptEditor: ScriptEditor | null = null;
let scriptSelect: HTMLSelectElement | null = null;
let scriptErrorEl: HTMLDivElement | null = null;

// ── Initialize ───────────────────────────────────────────────────────

function init(): void {
    rootEl = document.getElementById('propgrid-root') as HTMLDivElement;

    // Properties area occupies top portion; script panel sits below
    propsArea = document.createElement('div');
    propsArea.className = 'pg-props-area';
    rootEl.appendChild(propsArea);

    // Create script panel immediately so it's always visible
    ensureScriptPanel();

    // Restore active tab from state
    const state = vscode.getState() as { activeTab?: string; expandedNames?: string[]; treeFilter?: string } | null;
    if (state?.activeTab) {
        activeTab = state.activeTab;
    }
    treeExpandedNames = new Set(state?.expandedNames ?? []);
    treeExpansionInitialized = state?.expandedNames !== undefined;
    treeFilter = state?.treeFilter ?? '';

    renderProperties();

    // Clicking in the properties area deactivates script mode (snap back)
    propsArea.addEventListener('mousedown', () => {
        vscode.postMessage({ type: 'deactivateScript' });
    });

    window.addEventListener('message', (e: MessageEvent<ExtToPropGridMessage>) => {
        const msg = e.data;
        switch (msg.type) {
            case 'loadProperties':
                hasReceivedProperties = true;
                currentProperties = msg.properties;
                currentControlName = msg.controlName;
                currentControlCount = msg.controlCount;
                renderProperties();
                break;
            case 'clearProperties':
                hasReceivedProperties = true;
                currentProperties = [];
                currentControlName = '';
                currentControlCount = 0;
                renderProperties();
                break;
            case 'loadViewTree':
                if (currentTreeKey !== msg.treeKey) {
                    currentTreeKey = msg.treeKey;
                    treeExpandedNames.clear();
                    treeFilter = '';
                    treeExpansionInitialized = false;
                    lastTreeAnchor = '';
                }
                viewTreeRoot = msg.root;
                treeSelectedNames = msg.selectedNames;
                availableControlTypes = msg.availableControlTypes;
                customViewTypes = msg.customViewTypes;
                if (!treeExpansionInitialized) {
                    expandAllTreeNodes(msg.root);
                    treeExpansionInitialized = true;
                    saveState();
                }
                if (activeTab === VIEWS_TREE_TAB) { renderProperties(); }
                break;
            case 'clearViewTree':
                viewTreeRoot = null;
                treeSelectedNames = [];
                if (activeTab === VIEWS_TREE_TAB) { renderProperties(); }
                break;
            case 'treeSelection':
                treeSelectedNames = msg.names;
                lastTreeAnchor = msg.names.length === 1 ? msg.names[0] : '';
                updateTreeSelectionIndicators();
                break;
            case 'loadScriptData':
                scriptGeneralText = msg.generalScript;
                scriptVariantEntries = msg.variantScripts;
                if (msg.controlNames && scriptEditor) {
                    scriptEditor.setControlNames(msg.controlNames);
                }
                renderScriptPanel();
                break;
            case 'scriptError':
                showScriptError(msg.error);
                break;
            case 'scriptSuccess':
                showScriptSuccess();
                break;
        }
    });

    vscode.postMessage({ type: 'ready' });
}

// ── Render: Property Grid ────────────────────────────────────────────

function renderProperties(): void {
    propsArea.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'pg-header';
    const title = document.createElement('span');
    title.className = 'pg-title';
    title.textContent = currentControlCount > 1
        ? `${currentControlCount} controls selected`
        : (currentControlName || 'Views Tree');
    header.appendChild(title);
    propsArea.appendChild(header);

    // Group by category
    const categories = new Map<string, PropertyData[]>();
    for (const p of currentProperties) {
        let list = categories.get(p.category);
        if (!list) {
            list = [];
            categories.set(p.category, list);
        }
        list.push(p);
    }

    const catNames = [VIEWS_TREE_TAB, ...Array.from(categories.keys())];

    // Default to first tab if saved tab doesn't exist in this set
    if (!catNames.includes(activeTab) && (hasReceivedProperties || activeTab === VIEWS_TREE_TAB)) {
        activeTab = VIEWS_TREE_TAB;
    }

    // Tab bar (vertical stack of tab buttons)
    const tabBar = document.createElement('div');
    tabBar.className = 'pg-tab-bar';

    // Content area
    const content = document.createElement('div');
    content.className = 'pg-tab-content';

    for (const catName of catNames) {
        // Tab button
        const tab = document.createElement('button');
        tab.className = 'pg-tab' + (catName === activeTab ? ' pg-tab-active' : '');
        tab.textContent = catName === VIEWS_TREE_TAB ? 'Views Tree' : catName;
        tab.addEventListener('click', () => {
            activeTab = catName;
            saveState();
            if (catName === VIEWS_TREE_TAB) {
                renderProperties();
                return;
            }
            // Update active class on all tabs
            tabBar.querySelectorAll('.pg-tab').forEach(t => t.classList.remove('pg-tab-active'));
            tab.classList.add('pg-tab-active');
            // Show matching panel, hide others
            content.querySelectorAll('.pg-tab-panel').forEach(p => {
                (p as HTMLElement).style.display = (p as HTMLElement).dataset.cat === catName ? '' : 'none';
            });
        });
        tabBar.appendChild(tab);

        // Panel
        const panel = document.createElement('div');
        panel.className = 'pg-tab-panel';
        panel.dataset.cat = catName;
        panel.style.display = catName === activeTab ? '' : 'none';

        if (catName === VIEWS_TREE_TAB) {
            panel.appendChild(renderViewsTree());
        } else {
            const catProps = categories.get(catName) ?? [];
            if (catProps.length === 0) {
                panel.appendChild(createEmptyState('No control selected'));
            } else {
                for (const prop of catProps) {
                    panel.appendChild(renderPropertyRow(prop));
                }
            }
        }
        content.appendChild(panel);
    }

    propsArea.appendChild(tabBar);
    propsArea.appendChild(content);
}

// ── Render: Views Tree ───────────────────────────────────────────────

function renderViewsTree(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'vt-wrapper';

    const toolbar = document.createElement('div');
    toolbar.className = 'vt-toolbar';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'vt-search';
    search.placeholder = 'Search views';
    search.setAttribute('aria-label', 'Search views');
    search.value = treeFilter;
    search.addEventListener('input', () => {
        treeFilter = search.value;
        saveState();
        renderProperties();
        const replacement = propsArea.querySelector<HTMLInputElement>('.vt-search');
        replacement?.focus();
        replacement?.setSelectionRange(treeFilter.length, treeFilter.length);
    });
    toolbar.appendChild(search);

    const compact = createTreeToolbarButton('Compact', 'Collapse all views', () => {
        treeExpandedNames.clear();
        saveState();
        renderProperties();
    });
    toolbar.appendChild(compact);

    const expand = createTreeToolbarButton('Expand', 'Expand all views', () => {
        if (viewTreeRoot) { expandAllTreeNodes(viewTreeRoot); }
        saveState();
        renderProperties();
    });
    toolbar.appendChild(expand);
    wrapper.appendChild(toolbar);

    const tree = document.createElement('div');
    tree.className = 'vt-tree';
    tree.setAttribute('role', 'tree');
    tree.setAttribute('aria-label', 'Views Tree');
    tree.tabIndex = 0;

    if (!viewTreeRoot) {
        tree.appendChild(createEmptyState('No layout open'));
    } else {
        for (const child of viewTreeRoot.children) {
            if (treeNodeMatchesFilter(child, treeFilter)) {
                tree.appendChild(renderTreeNode(child, viewTreeRoot, 0));
            }
        }
        if (tree.children.length === 0) {
            tree.appendChild(createEmptyState('No matching views'));
        }
    }

    tree.addEventListener('dragover', e => {
        if (e.target !== tree || !viewTreeRoot || draggedTreeNames.length === 0) { return; }
        e.preventDefault();
        if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; }
        tree.classList.add('vt-drop-inside');
    });
    tree.addEventListener('dragleave', e => {
        if (!(e.relatedTarget instanceof Node) || !tree.contains(e.relatedTarget)) {
            tree.classList.remove('vt-drop-inside');
        }
    });
    tree.addEventListener('drop', e => {
        if (e.target !== tree || !viewTreeRoot || draggedTreeNames.length === 0) { return; }
        e.preventDefault();
        tree.classList.remove('vt-drop-inside');
        vscode.postMessage({
            type: 'treeReparent',
            names: draggedTreeNames,
            targetName: viewTreeRoot.name,
            index: viewTreeRoot.children.length,
        });
    });
    tree.addEventListener('contextmenu', e => {
        if (e.target === tree) {
            e.preventDefault();
            showTreeContextMenu(e.clientX, e.clientY, []);
        }
    });

    if (treeSelectedNames.every(name => !tree.querySelector(`[data-tree-name="${cssEscape(name)}"]`))) {
        const firstRow = tree.querySelector<HTMLElement>('.vt-row');
        if (firstRow) { firstRow.tabIndex = 0; }
    }

    wrapper.appendChild(tree);
    return wrapper;
}

function renderTreeNode(node: ViewTreeNode, parent: ViewTreeNode, depth: number): HTMLDivElement {
    const branch = document.createElement('div');
    branch.className = 'vt-branch';
    const hasVisibleChildren = node.children.some(child => treeNodeMatchesFilter(child, treeFilter));
    const expanded = Boolean(treeFilter) || treeExpandedNames.has(node.name);

    const row = document.createElement('div');
    row.className = 'vt-row';
    row.dataset.treeName = node.name;
    row.dataset.parentName = parent.name;
    row.style.paddingLeft = `${4 + depth * 14}px`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(depth + 1));
    row.setAttribute('aria-selected', String(treeSelectedNames.includes(node.name)));
    if (hasVisibleChildren) { row.setAttribute('aria-expanded', String(expanded)); }
    row.tabIndex = treeSelectedNames.includes(node.name) ? 0 : -1;
    row.draggable = true;
    if (treeSelectedNames.includes(node.name)) { row.classList.add('vt-selected'); }

    const twisty = document.createElement('button');
    twisty.className = 'vt-twisty';
    twisty.tabIndex = -1;
    twisty.textContent = hasVisibleChildren ? (expanded ? '▾' : '▸') : '';
    twisty.disabled = !hasVisibleChildren;
    twisty.setAttribute('aria-label', expanded ? `Collapse ${node.name}` : `Expand ${node.name}`);
    twisty.addEventListener('click', e => {
        e.stopPropagation();
        toggleTreeNode(node.name);
    });
    row.appendChild(twisty);

    const indicator = document.createElement('span');
    indicator.className = 'vt-selection-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    row.appendChild(indicator);

    const label = document.createElement('span');
    label.className = 'vt-label';
    label.textContent = node.name;
    row.appendChild(label);

    const type = document.createElement('span');
    type.className = 'vt-type';
    type.textContent = node.typeName;
    row.appendChild(type);

    row.addEventListener('click', e => selectTreeNode(node.name, e.ctrlKey || e.metaKey, e.shiftKey));
    row.addEventListener('dblclick', () => {
        if (hasVisibleChildren) { toggleTreeNode(node.name); }
    });
    row.addEventListener('keydown', e => handleTreeKeyDown(e, node, parent));
    row.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!treeSelectedNames.includes(node.name)) {
            treeSelectedNames = [node.name];
            updateTreeSelectionIndicators();
            vscode.postMessage({ type: 'treeSelectionChanged', names: treeSelectedNames });
        }
        showTreeContextMenu(e.clientX, e.clientY, treeSelectedNames);
    });
    row.addEventListener('dragstart', e => {
        if (!treeSelectedNames.includes(node.name)) {
            treeSelectedNames = [node.name];
            vscode.postMessage({ type: 'treeSelectionChanged', names: treeSelectedNames });
        }
        draggedTreeNames = [...treeSelectedNames];
        e.dataTransfer?.setData('text/plain', draggedTreeNames.join('\n'));
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
        row.classList.add('vt-dragging');
    });
    row.addEventListener('dragend', () => {
        draggedTreeNames = [];
        clearTreeDropIndicators();
    });
    row.addEventListener('dragover', e => {
        if (draggedTreeNames.length === 0) { return; }
        e.preventDefault();
        e.stopPropagation();
        clearTreeDropIndicators();
        const position = getTreeDropPosition(e, row, node);
        row.classList.add(`vt-drop-${position}`);
        if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; }
    });
    row.addEventListener('dragleave', e => {
        if (!(e.relatedTarget instanceof Node) || !row.contains(e.relatedTarget)) {
            row.classList.remove('vt-drop-before', 'vt-drop-after', 'vt-drop-inside');
        }
    });
    row.addEventListener('drop', e => {
        if (!viewTreeRoot || draggedTreeNames.length === 0) { return; }
        e.preventDefault();
        e.stopPropagation();
        const position = getTreeDropPosition(e, row, node);
        const location = findTreeLocation(viewTreeRoot, node.name);
        if (!location) { return; }
        const targetName = position === 'inside' ? node.name : location.parent.name;
        const index = position === 'inside'
            ? node.children.length
            : location.index + (position === 'after' ? 1 : 0);
        clearTreeDropIndicators();
        vscode.postMessage({ type: 'treeReparent', names: draggedTreeNames, targetName, index });
    });

    branch.appendChild(row);

    if (hasVisibleChildren && expanded) {
        const children = document.createElement('div');
        children.className = 'vt-children';
        children.setAttribute('role', 'group');
        for (const child of node.children) {
            if (treeNodeMatchesFilter(child, treeFilter)) {
                children.appendChild(renderTreeNode(child, node, depth + 1));
            }
        }
        branch.appendChild(children);
    }

    return branch;
}

function createTreeToolbarButton(label: string, title: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'vt-toolbar-button';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', action);
    return button;
}

function createEmptyState(message: string): HTMLDivElement {
    const empty = document.createElement('div');
    empty.className = 'pg-empty';
    empty.textContent = message;
    return empty;
}

function treeNodeMatchesFilter(node: ViewTreeNode, filter: string): boolean {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) { return true; }
    return node.name.toLocaleLowerCase().includes(query) ||
        node.typeName.toLocaleLowerCase().includes(query) ||
        node.children.some(child => treeNodeMatchesFilter(child, query));
}

function expandAllTreeNodes(node: ViewTreeNode): void {
    if (node.children.length > 0) { treeExpandedNames.add(node.name); }
    for (const child of node.children) { expandAllTreeNodes(child); }
}

function toggleTreeNode(name: string): void {
    if (treeExpandedNames.has(name)) { treeExpandedNames.delete(name); }
    else { treeExpandedNames.add(name); }
    saveState();
    renderProperties();
    propsArea.querySelector<HTMLElement>(`.vt-row[data-tree-name="${cssEscape(name)}"]`)?.focus();
}

function selectTreeNode(name: string, additive: boolean, range: boolean): void {
    if (range && lastTreeAnchor) {
        const visible = Array.from(propsArea.querySelectorAll<HTMLElement>('.vt-row')).map(row => row.dataset.treeName ?? '');
        const from = visible.indexOf(lastTreeAnchor);
        const to = visible.indexOf(name);
        if (from >= 0 && to >= 0) {
            treeSelectedNames = visible.slice(Math.min(from, to), Math.max(from, to) + 1);
        } else {
            treeSelectedNames = [name];
        }
    } else if (additive) {
        treeSelectedNames = treeSelectedNames.includes(name)
            ? treeSelectedNames.filter(selected => selected !== name)
            : [...treeSelectedNames, name];
        lastTreeAnchor = name;
    } else {
        treeSelectedNames = [name];
        lastTreeAnchor = name;
    }
    updateTreeSelectionIndicators();
    vscode.postMessage({ type: 'treeSelectionChanged', names: treeSelectedNames });
}

function updateTreeSelectionIndicators(): void {
    propsArea.querySelectorAll<HTMLElement>('.vt-row').forEach(row => {
        const selected = treeSelectedNames.includes(row.dataset.treeName ?? '');
        row.classList.toggle('vt-selected', selected);
        row.setAttribute('aria-selected', String(selected));
        row.tabIndex = selected ? 0 : -1;
    });
}

function handleTreeKeyDown(e: KeyboardEvent, node: ViewTreeNode, parent: ViewTreeNode): void {
    const rows = Array.from(propsArea.querySelectorAll<HTMLElement>('.vt-row'));
    const current = rows.indexOf(e.currentTarget as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        rows[current + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (node.children.length > 0 && !treeExpandedNames.has(node.name)) { toggleTreeNode(node.name); }
        else { rows[current + 1]?.focus(); }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (treeExpandedNames.has(node.name)) { toggleTreeNode(node.name); }
        else if (!parent.isRoot) {
            propsArea.querySelector<HTMLElement>(`.vt-row[data-tree-name="${cssEscape(parent.name)}"]`)?.focus();
        }
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTreeNode(node.name, e.ctrlKey || e.metaKey, e.shiftKey);
    }
}

function getTreeDropPosition(e: DragEvent, row: HTMLElement, node: ViewTreeNode): 'before' | 'inside' | 'after' {
    const rect = row.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    if (ratio < 0.25) { return 'before'; }
    if (ratio > 0.75 || !node.isContainer) { return 'after'; }
    return 'inside';
}

function findTreeLocation(root: ViewTreeNode, name: string): { node: ViewTreeNode; parent: ViewTreeNode; index: number } | null {
    for (let index = 0; index < root.children.length; index++) {
        const child = root.children[index];
        if (child.name === name) { return { node: child, parent: root, index }; }
        const nested = findTreeLocation(child, name);
        if (nested) { return nested; }
    }
    return null;
}

function clearTreeDropIndicators(): void {
    propsArea.querySelectorAll('.vt-drop-before, .vt-drop-after, .vt-drop-inside').forEach(element => {
        element.classList.remove('vt-drop-before', 'vt-drop-after', 'vt-drop-inside');
    });
}

function showTreeContextMenu(x: number, y: number, names: string[]): void {
    dismissTreeContextMenu();
    const hasSelection = names.length > 0;
    const isSingle = names.length === 1;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;

    type MenuItem = { label: string; action?: string; disabled?: boolean; submenu?: MenuItem[] };
    const addItems: MenuItem[] = availableControlTypes
        .filter(name => name !== 'CustomView')
        .map(name => ({ label: name, action: `addView:${name}` }));
    addItems.push({
        label: 'CustomView',
        action: 'addView:CustomView',
        submenu: customViewTypes.map(name => ({ label: name, action: `addView:CustomView:${name}` })),
    });

    const items: MenuItem[] = [
        { label: 'Add View', submenu: addItems },
        { label: '─' },
        { label: 'Horizontal Anchor: Left', action: 'hanchor:0', disabled: !hasSelection },
        { label: 'Horizontal Anchor: Right', action: 'hanchor:1', disabled: !hasSelection },
        { label: 'Horizontal Anchor: Both', action: 'hanchor:2', disabled: !hasSelection },
        { label: '─' },
        { label: 'Vertical Anchor: Top', action: 'vanchor:0', disabled: !hasSelection },
        { label: 'Vertical Anchor: Bottom', action: 'vanchor:1', disabled: !hasSelection },
        { label: 'Vertical Anchor: Both', action: 'vanchor:2', disabled: !hasSelection },
        { label: '─' },
        { label: 'Bring to Front', action: 'bringToFront', disabled: !hasSelection },
        { label: 'Send to Back', action: 'sendToBack', disabled: !hasSelection },
        { label: 'Bring Forward', action: 'bringForward', disabled: !hasSelection },
        { label: 'Send Backward', action: 'sendBackward', disabled: !hasSelection },
        { label: '─' },
        { label: 'Generate...', action: 'generate', disabled: !isSingle },
        { label: 'View Code', action: 'viewcode', disabled: !isSingle },
        { label: 'Check Anchors', action: 'checkAnchors' },
        { label: '─' },
        { label: 'Copy', action: 'copy', disabled: !hasSelection },
        { label: 'Cut', action: 'cut', disabled: !hasSelection },
        { label: 'Paste', action: 'paste' },
        { label: 'Duplicate', action: 'duplicate', disabled: !hasSelection },
        { label: '─' },
        { label: 'Remove Selected Views', action: 'removeSelected', disabled: !hasSelection },
    ];

    const appendItems = (host: HTMLElement, menuItems: MenuItem[]): void => {
        for (const item of menuItems) {
            if (item.label === '─') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                host.appendChild(separator);
                continue;
            }
            const element = document.createElement('div');
            element.className = 'context-menu-item';
            element.textContent = item.label;
            element.setAttribute('role', 'menuitem');
            element.tabIndex = item.disabled ? -1 : 0;
            if (item.disabled) {
                element.classList.add('disabled');
                element.setAttribute('aria-disabled', 'true');
            }
            if (item.submenu && item.submenu.length > 0) {
                element.classList.add('has-submenu');
                const submenu = document.createElement('div');
                submenu.className = 'context-submenu';
                appendItems(submenu, item.submenu);
                element.appendChild(submenu);
            } else if (!item.disabled && item.action) {
                const activate = (e: Event) => {
                    e.stopPropagation();
                    vscode.postMessage({ type: 'treeContextAction', action: item.action!, names });
                    dismissTreeContextMenu();
                };
                element.addEventListener('click', activate);
                element.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { activate(e); }
                });
            }
            host.appendChild(element);
        }
    };
    appendItems(menu, items);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    treeContextMenu = menu;
    menu.addEventListener('keydown', e => {
        if (e.key === 'Escape') { dismissTreeContextMenu(); }
    });

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) { menu.style.left = `${Math.max(0, window.innerWidth - rect.width)}px`; }
    if (rect.bottom > window.innerHeight) { menu.style.top = `${Math.max(0, window.innerHeight - rect.height)}px`; }
    menu.querySelector<HTMLElement>('.context-menu-item:not(.disabled)')?.focus();

    const dismiss = (event: PointerEvent) => {
        if (!treeContextMenu?.contains(event.target as Node)) {
            dismissTreeContextMenu();
            document.removeEventListener('pointerdown', dismiss);
        }
    };
    setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
}

function dismissTreeContextMenu(): void {
    treeContextMenu?.remove();
    treeContextMenu = null;
}

function cssEscape(value: string): string {
    return CSS.escape(value);
}

// ── Render: Single Property Row ──────────────────────────────────────

function renderPropertyRow(prop: PropertyData): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'pg-row';
    row.title = prop.description;

    const labelEl = document.createElement('label');
    labelEl.className = 'pg-label';
    labelEl.textContent = prop.displayName;
    row.appendChild(labelEl);

    const editorEl = document.createElement('div');
    editorEl.className = 'pg-editor';

    if (prop.isReadOnly) {
        const span = document.createElement('span');
        span.className = 'pg-readonly';
        span.textContent = String(prop.value ?? '');
        editorEl.appendChild(span);
    } else {
        switch (prop.editor) {
            case 'string':
            case 'font':
                editorEl.appendChild(createStringEditor(prop));
                break;
            case 'int':
                editorEl.appendChild(createIntEditor(prop));
                break;
            case 'double':
                editorEl.appendChild(createDoubleEditor(prop));
                break;
            case 'bool':
                editorEl.appendChild(createBoolEditor(prop));
                break;
            case 'color':
            case 'nullableColor':
                editorEl.appendChild(createColorEditor(prop));
                break;
            case 'dropdown':
                editorEl.appendChild(createDropdownEditor(prop));
                break;
            case 'rect':
                editorEl.appendChild(createRectEditor(prop));
                break;
            default:
                editorEl.appendChild(createStringEditor(prop));
                break;
        }
    }

    row.appendChild(editorEl);
    return row;
}

// ── Editors ──────────────────────────────────────────────────────────

function createStringEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pg-input';
    input.value = String(prop.value ?? '');
    input.addEventListener('change', () => {
        sendPropertyChange(prop.key, input.value);
    });
    return input;
}

function createIntEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pg-input pg-input-number';
    input.value = String(prop.value ?? 0);
    input.step = '1';
    if (prop.min !== undefined) { input.min = String(prop.min); }
    if (prop.max !== undefined) { input.max = String(prop.max); }
    input.addEventListener('change', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val)) { val = 0; }
        if (prop.min !== undefined && val < prop.min) { val = prop.min; }
        if (prop.max !== undefined && val > prop.max) { val = prop.max; }
        input.value = String(val);
        sendPropertyChange(prop.key, val);
    });
    return input;
}

function createDoubleEditor(prop: PropertyData): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pg-input pg-input-number';
    input.value = formatDouble(prop.value as number | undefined);
    input.step = String(prop.step ?? 0.1);
    if (prop.min !== undefined) { input.min = String(prop.min); }
    if (prop.max !== undefined) { input.max = String(prop.max); }
    input.addEventListener('change', () => {
        let val = parseFloat(input.value);
        if (isNaN(val)) { val = 0; }
        if (prop.min !== undefined && val < prop.min) { val = prop.min; }
        if (prop.max !== undefined && val > prop.max) { val = prop.max; }
        input.value = formatDouble(val);
        sendPropertyChange(prop.key, val);
    });
    return input;
}

function createBoolEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'pg-checkbox-wrapper';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'pg-checkbox';
    cb.checked = prop.value === true;
    cb.addEventListener('change', () => {
        sendPropertyChange(prop.key, cb.checked);
    });
    wrapper.appendChild(cb);
    return wrapper;
}

function createColorEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pg-color-wrapper';

    const colorVal = prop.value as { a: number; r: number; g: number; b: number } | null;
    const isNullable = prop.editor === 'nullableColor';

    const preview = document.createElement('div');
    preview.className = 'pg-color-preview';
    if (colorVal) {
        preview.style.background = `rgba(${colorVal.r}, ${colorVal.g}, ${colorVal.b}, ${colorVal.a / 255})`;
    } else {
        preview.classList.add('pg-color-none');
    }

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'pg-color-input';
    if (colorVal) {
        input.value = rgbToHex(colorVal.r, colorVal.g, colorVal.b);
    }

    input.addEventListener('input', () => {
        const { r, g, b } = hexToRgb(input.value);
        const a = (prop.alphaEnabled && colorVal) ? colorVal.a : 255;
        preview.style.background = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        preview.classList.remove('pg-color-none');
        sendPropertyChange(prop.key, { a, r, g, b });
    });

    wrapper.appendChild(preview);
    wrapper.appendChild(input);

    if (isNullable) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'pg-color-clear';
        clearBtn.textContent = '×';
        clearBtn.title = 'Reset to default';
        clearBtn.addEventListener('click', () => {
            preview.style.background = '';
            preview.classList.add('pg-color-none');
            sendPropertyChange(prop.key, null);
        });
        wrapper.appendChild(clearBtn);
    }

    return wrapper;
}

function createDropdownEditor(prop: PropertyData): HTMLElement {
    const select = document.createElement('select');
    select.className = 'pg-select';

    if (prop.options) {
        for (const opt of prop.options) {
            const optEl = document.createElement('option');
            optEl.value = String(opt.value);
            optEl.textContent = opt.label;
            if (matchValue(prop.value, opt.value)) {
                optEl.selected = true;
            }
            select.appendChild(optEl);
        }
    }

    select.addEventListener('change', () => {
        const opt = prop.options?.find(o => String(o.value) === select.value);
        sendPropertyChange(prop.key, opt ? opt.value : select.value);
    });

    return select;
}

function createRectEditor(prop: PropertyData): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pg-rect-wrapper';

    const rect = prop.value as { x: number; y: number; width: number; height: number } | null;
    const fields = [
        { label: 'L', key: 'x', value: rect?.x ?? 0 },
        { label: 'T', key: 'y', value: rect?.y ?? 0 },
        { label: 'R', key: 'width', value: rect?.width ?? 0 },
        { label: 'B', key: 'height', value: rect?.height ?? 0 },
    ];

    const state = { x: fields[0].value, y: fields[1].value, width: fields[2].value, height: fields[3].value };

    for (const f of fields) {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'pg-rect-field';

        const labelEl = document.createElement('span');
        labelEl.className = 'pg-rect-label';
        labelEl.textContent = f.label;
        fieldEl.appendChild(labelEl);

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'pg-input pg-input-number pg-rect-input';
        input.value = String(f.value);
        input.step = '1';

        const fieldKey = f.key;
        input.addEventListener('change', () => {
            (state as Record<string, number>)[fieldKey] = parseInt(input.value, 10) || 0;
            sendPropertyChange(prop.key, { ...state });
        });

        fieldEl.appendChild(input);
        wrapper.appendChild(fieldEl);
    }

    return wrapper;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sendPropertyChange(key: string, value: unknown): void {
    vscode.postMessage({ type: 'propertyChanged', key, value });
}

function saveState(): void {
    vscode.setState({
        activeTab,
        expandedNames: [...treeExpandedNames],
        treeFilter,
    });
}

function formatDouble(v: number | undefined): string {
    if (v === undefined || v === null) { return '0'; }
    return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function matchValue(a: unknown, b: unknown): boolean {
    if (a === b) { return true; }
    if (a === undefined || a === null || b === undefined || b === null) { return false; }
    return String(a) === String(b);
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) { return { r: 0, g: 0, b: 0 }; }
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// ── Script Editor Panel ──────────────────────────────────────────────

function ensureScriptPanel(): void {
    if (scriptPanel) { return; }

    scriptPanel = document.createElement('div');
    scriptPanel.className = 'pg-script-panel';

    // Header row: "Script" label + variant selector + Run button
    const header = document.createElement('div');
    header.className = 'pg-script-header';

    const label = document.createElement('span');
    label.className = 'pg-script-label';
    label.textContent = 'Script';
    header.appendChild(label);

    scriptSelect = document.createElement('select');
    scriptSelect.className = 'pg-script-select';
    scriptSelect.addEventListener('change', () => {
        saveCurrentScriptText();
        scriptSelectedVariant = parseInt(scriptSelect!.value, 10);
        loadSelectedScriptText();
    });
    header.appendChild(scriptSelect);

    const runBtn = document.createElement('button');
    runBtn.className = 'pg-script-run';
    runBtn.textContent = '\u25B6 Run';
    runBtn.title = 'Execute script for current variant (Ctrl+Enter)';
    runBtn.addEventListener('click', () => {
        saveCurrentScriptText();
        vscode.postMessage({ type: 'runScript' });
    });
    header.appendChild(runBtn);

    scriptPanel.appendChild(header);

    // Error display
    scriptErrorEl = document.createElement('div');
    scriptErrorEl.className = 'pg-script-error';
    scriptErrorEl.style.display = 'none';
    scriptPanel.appendChild(scriptErrorEl);

    // Syntax-highlighted script editor
    scriptEditor = new ScriptEditor(scriptPanel, {
        onChange: (text) => {
            // Save live changes back to the model
            if (scriptSelectedVariant < 0) {
                scriptGeneralText = text;
            } else if (scriptSelectedVariant < scriptVariantEntries.length) {
                scriptVariantEntries[scriptSelectedVariant].script = text;
            }
            vscode.postMessage({
                type: 'scriptChanged',
                variantIndex: scriptSelectedVariant,
                text,
            });
        },
        onRun: () => {
            saveCurrentScriptText();
            vscode.postMessage({ type: 'runScript' });
        },
    });
    scriptEditor.placeholder = 'Designer script...';

    // Append to root (after tab content, persists across tabs)
    rootEl.appendChild(scriptPanel);
}

function renderScriptPanel(): void {
    ensureScriptPanel();
    if (!scriptSelect || !scriptEditor) { return; }

    // Rebuild variant selector options
    scriptSelect.innerHTML = '';

    const generalOpt = document.createElement('option');
    generalOpt.value = '-1';
    generalOpt.textContent = 'General (all variants)';
    scriptSelect.appendChild(generalOpt);

    for (let i = 0; i < scriptVariantEntries.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = scriptVariantEntries[i].label;
        scriptSelect.appendChild(opt);
    }

    scriptSelect.value = String(scriptSelectedVariant);
    loadSelectedScriptText();

    // Clear any previous error
    if (scriptErrorEl) {
        scriptErrorEl.style.display = 'none';
    }
}

function loadSelectedScriptText(): void {
    if (!scriptEditor) { return; }
    if (scriptSelectedVariant < 0) {
        scriptEditor.value = scriptGeneralText;
    } else if (scriptSelectedVariant < scriptVariantEntries.length) {
        scriptEditor.value = scriptVariantEntries[scriptSelectedVariant].script;
    } else {
        scriptEditor.value = '';
    }
}

function saveCurrentScriptText(): void {
    if (!scriptEditor) { return; }
    if (scriptSelectedVariant < 0) {
        scriptGeneralText = scriptEditor.value;
    } else if (scriptSelectedVariant < scriptVariantEntries.length) {
        scriptVariantEntries[scriptSelectedVariant].script = scriptEditor.value;
    }
}

function showScriptError(error: string): void {
    if (!scriptErrorEl) { return; }
    scriptErrorEl.textContent = error;
    scriptErrorEl.className = 'pg-script-error pg-script-error-visible';
    scriptErrorEl.style.display = '';
}

function showScriptSuccess(): void {
    if (!scriptErrorEl) { return; }
    scriptErrorEl.textContent = 'Script executed successfully.';
    scriptErrorEl.className = 'pg-script-error pg-script-success-visible';
    scriptErrorEl.style.display = '';
    setTimeout(() => {
        if (scriptErrorEl) { scriptErrorEl.style.display = 'none'; }
    }, 2000);
}

// ── Bootstrap ────────────────────────────────────────────────────────

init();
