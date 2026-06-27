import * as path from 'path';
import * as vscode from 'vscode';
import {
    writeLayoutFile,
    Platform,
    LayoutFile,
    ControlNode,
    PropertyValue,
    TypeTag,
    getDefaultVariant,
} from './index';

interface PlatformProjectConfig {
    platform: Platform;
    projectFolderName: string;
    projectExtension: string;
    layoutExtension: string;
}

interface ProjectTarget {
    workspaceFolder: vscode.WorkspaceFolder;
    platform: Platform;
    layoutExtension: string;
    projectDirUri: vscode.Uri;
    projectFileUri: vscode.Uri;
    filesDirUri: vscode.Uri;
}

class UserCancelledError extends Error {}

const PROJECT_CONFIGS: PlatformProjectConfig[] = [
    {
        platform: Platform.B4A,
        projectFolderName: 'B4A',
        projectExtension: '.b4a',
        layoutExtension: '.bal',
    },
    {
        platform: Platform.B4J,
        projectFolderName: 'B4J',
        projectExtension: '.b4j',
        layoutExtension: '.bjl',
    },
];

export function registerCreateLayoutFileCommand(customEditorViewType: string): vscode.Disposable {
    return vscode.commands.registerCommand('b4x.createLayoutFile', async (resource?: vscode.Uri) => {
        try {
            await createLayoutFile(resource, customEditorViewType);
        } catch (err) {
            if (err instanceof UserCancelledError) {
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`B4X: ${message}`);
        }
    });
}

async function createLayoutFile(resource: vscode.Uri | undefined, customEditorViewType: string): Promise<void> {
    const targets = await discoverProjectTargets();
    if (targets.length === 0) {
        throw new Error('No B4X project was detected. Expected B4A/B4J folders with .b4a/.b4j project files.');
    }

    const contextUri = resource ?? vscode.window.activeTextEditor?.document.uri;
    const target = await pickTarget(targets, contextUri);

    const rawName = await vscode.window.showInputBox({
        title: 'New B4X Layout File',
        prompt: `Enter the new layout name for ${target.platform} (${target.layoutExtension})`,
        placeHolder: 'Layout name without extension',
        value: 'layout',
        validateInput: (value) => validateLayoutName(value),
    });

    if (rawName === undefined) {
        throw new UserCancelledError();
    }

    const fileName = normalizeLayoutFileName(rawName, target.layoutExtension);
    const fileUri = vscode.Uri.joinPath(target.filesDirUri, fileName);

    const exists = await uriExists(fileUri);
    if (exists) {
        const action = await vscode.window.showWarningMessage(
            `${fileName} already exists.`,
            'Open Existing',
            'Cancel',
        );
        if (action === 'Open Existing') {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, customEditorViewType);
            return;
        }
        throw new UserCancelledError();
    }

    await vscode.workspace.fs.createDirectory(target.filesDirUri);

    const layout = createDefaultLayout(target.platform);
    const bytes = writeLayoutFile(layout);
    await vscode.workspace.fs.writeFile(fileUri, bytes);

    try {
        await addFileEntryToProject(target.projectFileUri, fileName);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showWarningMessage(`B4X: Created ${fileName}, but failed to update project metadata (${message}).`);
    }

    await vscode.commands.executeCommand('vscode.openWith', fileUri, customEditorViewType);
}

async function discoverProjectTargets(): Promise<ProjectTarget[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const targets: ProjectTarget[] = [];

    for (const folder of folders) {
        for (const config of PROJECT_CONFIGS) {
            const projectDirUri = vscode.Uri.joinPath(folder.uri, config.projectFolderName);
            const projectFileName = await findProjectFileName(projectDirUri, config.projectExtension);
            if (!projectFileName) {
                continue;
            }

            targets.push({
                workspaceFolder: folder,
                platform: config.platform,
                layoutExtension: config.layoutExtension,
                projectDirUri,
                projectFileUri: vscode.Uri.joinPath(projectDirUri, projectFileName),
                filesDirUri: vscode.Uri.joinPath(projectDirUri, 'Files'),
            });
        }
    }

    return targets;
}

async function findProjectFileName(projectDirUri: vscode.Uri, extension: string): Promise<string | undefined> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(projectDirUri);
    } catch {
        return undefined;
    }

    const loweredExt = extension.toLowerCase();
    const match = entries.find(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith(loweredExt));
    return match?.[0];
}

async function pickTarget(targets: ProjectTarget[], contextUri: vscode.Uri | undefined): Promise<ProjectTarget> {
    const contextual = pickContextualTarget(targets, contextUri);
    if (contextual) {
        return contextual;
    }

    const workspaceMap = new Map<string, ProjectTarget[]>();
    for (const target of targets) {
        const key = target.workspaceFolder.uri.toString();
        const list = workspaceMap.get(key) ?? [];
        list.push(target);
        workspaceMap.set(key, list);
    }

    let scopedTargets = targets;
    if (workspaceMap.size > 1) {
        const workspaceItems = Array.from(workspaceMap.values()).map((groupedTargets) => {
            const first = groupedTargets[0];
            return {
                label: first.workspaceFolder.name,
                description: first.workspaceFolder.uri.fsPath,
                detail: groupedTargets.map((t) => t.platform).join(', '),
                targets: groupedTargets,
            };
        });

        const pickedWorkspace = await vscode.window.showQuickPick(workspaceItems, {
            title: 'Select B4X Project',
            placeHolder: 'Choose the workspace that contains your target B4X project',
        });

        if (!pickedWorkspace) {
            throw new UserCancelledError();
        }

        if (!pickedWorkspace.targets || pickedWorkspace.targets.length === 0) {
            throw new Error('Failed to resolve the selected B4X project.');
        }

        scopedTargets = pickedWorkspace.targets;
    }

    if (scopedTargets.length === 1) {
        return scopedTargets[0];
    }

    const platformItems = scopedTargets.map((target) => ({
        label: target.platform,
        description: target.layoutExtension,
        detail: target.projectDirUri.fsPath,
        target,
    }));

    const pickedPlatform = await vscode.window.showQuickPick(platformItems, {
        title: 'Select Layout Platform',
        placeHolder: 'Choose the platform for the new layout file',
    });

    if (!pickedPlatform) {
        throw new UserCancelledError();
    }

    return pickedPlatform.target;
}

function pickContextualTarget(targets: ProjectTarget[], contextUri: vscode.Uri | undefined): ProjectTarget | undefined {
    if (!contextUri || contextUri.scheme !== 'file') {
        return undefined;
    }

    const matching = targets.filter((target) =>
        isUriInside(target.projectDirUri, contextUri) ||
        target.projectFileUri.fsPath.toLowerCase() === contextUri.fsPath.toLowerCase(),
    );

    if (matching.length === 0) {
        return undefined;
    }

    if (matching.length === 1) {
        return matching[0];
    }

    return matching.sort((a, b) => b.projectDirUri.fsPath.length - a.projectDirUri.fsPath.length)[0];
}

function isUriInside(parent: vscode.Uri, child: vscode.Uri): boolean {
    const parentPath = normalizePathForCompare(parent.fsPath);
    const childPath = normalizePathForCompare(child.fsPath);
    return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function normalizePathForCompare(value: string): string {
    return path.normalize(value).toLowerCase();
}

function validateLayoutName(value: string): string | undefined {
    const noExt = normalizeLayoutBaseName(value);

    if (noExt.length === 0) {
        return 'Enter a layout name.';
    }
    if (/\s/.test(noExt)) {
        return 'Layout name cannot contain spaces.';
    }
    if (/^[.]+$/.test(noExt)) {
        return 'Layout name cannot be only dots.';
    }
    if (/[\\/:*?"<>|]/.test(noExt)) {
        return 'Layout name contains invalid path characters.';
    }

    return undefined;
}

function normalizeLayoutFileName(input: string, extension: string): string {
    const noExt = normalizeLayoutBaseName(input);
    return `${noExt}${extension}`;
}

function normalizeLayoutBaseName(input: string): string {
    const trimmed = input.trim();
    const noExt = trimmed.replace(/\.(bal|bjl)$/i, '');
    return noExt.toLowerCase();
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

async function addFileEntryToProject(projectFileUri: vscode.Uri, fileName: string): Promise<void> {
    const raw = await vscode.workspace.fs.readFile(projectFileUri);
    const text = Buffer.from(raw).toString('utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);

    const fileRegex = /^File(\d+)=(.*)$/i;
    const fileGroupRegex = /^FileGroup(\d+)=(.*)$/i;

    let maxFileIndex = 0;
    let firstFileGroupIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fileMatch = fileRegex.exec(line);
        if (fileMatch) {
            const idx = Number(fileMatch[1]);
            if (Number.isFinite(idx)) {
                maxFileIndex = Math.max(maxFileIndex, idx);
            }

            if (fileMatch[2].trim().toLowerCase() === fileName.toLowerCase()) {
                return;
            }
            continue;
        }

        if (firstFileGroupIndex < 0 && fileGroupRegex.test(line)) {
            firstFileGroupIndex = i;
        }
    }

    const nextIndex = maxFileIndex + 1;
    const fileLine = `File${nextIndex}=${fileName}`;
    const fileInsertIndex = firstFileGroupIndex >= 0 ? firstFileGroupIndex : lines.length;
    lines.splice(fileInsertIndex, 0, fileLine);

    const hasGroups = lines.some((line) => fileGroupRegex.test(line));
    if (hasGroups) {
        let groupBlockStart = -1;
        let groupBlockEnd = -1;
        for (let i = 0; i < lines.length; i++) {
            if (fileGroupRegex.test(lines[i])) {
                if (groupBlockStart < 0) {
                    groupBlockStart = i;
                }
                groupBlockEnd = i + 1;
            }
        }

        if (groupBlockStart >= 0 && groupBlockEnd >= 0) {
            lines.splice(groupBlockEnd, 0, `FileGroup${nextIndex}=Default Group`);
        }
    }

    const updated = lines.join(eol);
    await vscode.workspace.fs.writeFile(projectFileUri, Buffer.from(updated, 'utf8'));
}

function createDefaultLayout(platform: Platform): LayoutFile {
    const variant = getDefaultVariant(platform);
    const variantCopy = {
        scale: variant.scale,
        width: variant.width,
        height: variant.height,
    };

    return {
        version: 5,
        gridSize: 10,
        variants: [variantCopy],
        rootControl: createRootControl(platform),
        manifest: [],
        fileReferences: [],
        scriptData: {
            mainScript: platform === Platform.B4J
                ? `'All variants script\n`
                : `'All variants script\nAutoScaleAll\n`,
            variantScripts: [{
                variant: variantCopy,
                script: `'Variant specific script: ${variantCopy.width}x${variantCopy.height},scale=${variantCopy.scale}\n`,
            }],
        },
        flags: { c: false, d: false },
    };
}

function createRootControl(platform: Platform): ControlNode {
    switch (platform) {
        case Platform.B4A:
            return createB4ARoot();
        case Platform.B4J:
        default:
            return createB4jRoot();
    }
}

function createB4ARoot(): ControlNode {
    const props = new Map<string, PropertyValue>();

    props.set('csType', s('Dbasic.Designer.MetaActivity'));
    props.set('type', s('.ActivityWrapper'));
    props.set('animationDuration', i(400));
    props.set('drawable', obj([
        ['csType', s('Dbasic.Designer.Drawable.ColorDrawable')],
        ['type', s('.drawable.ColorDrawable')],
        ['color', c(255, 240, 248, 255)],
    ]));
    props.set('eventName', s('Activity'));
    props.set('fullScreen', b(false));
    props.set('includeTitle', b(true));
    props.set('javaType', s('.ActivityWrapper'));
    props.set('name', s('Activity'));
    props.set('parent', s(''));
    props.set('tag', s(''));
    props.set('title', s('Activity'));
    props.set('titleColor', c(255, 240, 248, 255));
    props.set('visible', b(true));
    props.set('variant0', variant(100, 100, 100, 100));

    return { properties: props, children: [] };
}

function createB4jRoot(): ControlNode {
    const props = new Map<string, PropertyValue>();

    props.set('csType', s('Dbasic.Designer.MetaMain'));
    props.set('type', s('.PaneWrapper$ConcretePaneWrapper'));
    props.set('alpha', f(1));
    props.set('borderColor', c(255, 0, 0, 0));
    props.set('borderWidth', f(0));
    props.set('cornerRadius', f(0));
    props.set('drawable', obj([
        ['csType', s('Dbasic.Designer.Drawable.ColorDrawable')],
        ['type', s('ColorDrawable')],
        ['color', c(0, 255, 255, 255)],
        ['colorKey', s('-fx-background-color')],
    ]));
    props.set('duration', i(0));
    props.set('enabled', b(true));
    props.set('eventName', s('MainForm'));
    props.set('extraCss', s(''));
    props.set('file', s(''));
    props.set('handleResizeEvent', b(false));
    props.set('javaType', s('.PaneWrapper$ConcretePaneWrapper'));
    props.set('name', s('Main'));
    props.set('orientation', s('INHERIT'));
    props.set('parent', s(''));
    props.set('tag', s(''));
    props.set('title', s('Form'));
    props.set('visible', b(true));
    props.set('variant0', variant(0, 0, 200, 200));

    return { properties: props, children: [] };
}

function variant(left: number, top: number, width: number, height: number): PropertyValue {
    return obj([
        ['left', i(left)],
        ['top', i(top)],
        ['width', i(width)],
        ['height', i(height)],
        ['hanchor', i(0)],
        ['vanchor', i(0)],
    ]);
}

function s(value: string): PropertyValue {
    return { tag: TypeTag.StringRef, value };
}

function i(value: number): PropertyValue {
    return { tag: TypeTag.Int32, value };
}

function f(value: number): PropertyValue {
    return { tag: TypeTag.Float, value };
}

function b(value: boolean): PropertyValue {
    return { tag: TypeTag.Bool, value };
}

function c(a: number, r: number, g: number, blue: number): PropertyValue {
    return { tag: TypeTag.Color, a, r, g, b: blue };
}

function obj(entries: Array<[string, PropertyValue]>): PropertyValue {
    return { tag: TypeTag.Object, value: new Map<string, PropertyValue>(entries) };
}