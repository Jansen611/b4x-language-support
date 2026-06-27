/**
 * Generates thin wrapper scripts so that `b4x-cli` can be invoked as
 * a shell command from any VS Code integrated terminal.
 *
 * The wrappers simply forward to `node <extensionPath>/out/cli/index.js`.
 * They are written into a directory that the extension prepends to PATH
 * via `context.environmentVariableCollection`.
 */

import * as fs   from 'fs';
import * as path from 'path';

/**
 * Write (or overwrite) platform-appropriate wrapper scripts into `binDir`.
 *
 * On Windows, two files are written:
 *   - `b4x-cli.cmd`  — for cmd.exe and PowerShell
 *   - `b4x-cli`      — for Git Bash / WSL terminals
 *
 * On macOS/Linux, one executable shell script is written:
 *   - `b4x-cli`      — chmod 755
 *
 * @param extensionPath  Absolute path to the installed extension root
 *                        (i.e. `context.extensionPath`).
 * @param binDir         Directory where wrappers will be placed.
 *                        Created recursively if it does not exist.
 */
export function installCliWrappers(extensionPath: string, binDir: string): void {
    fs.mkdirSync(binDir, { recursive: true });

    // Remove stale wrappers from previous command names so old names stop working.
    const staleNames = ['b4x-layout', 'b4x-layout.cmd'];
    for (const name of staleNames) {
        const stalePath = path.join(binDir, name);
        if (fs.existsSync(stalePath)) {
            fs.rmSync(stalePath);
        }
    }

    const cliEntry = path.join(extensionPath, 'out', 'designer', 'cli', 'index.js');

    if (process.platform === 'win32') {
        // cmd.exe / PowerShell wrapper
        const cmdPath = path.join(binDir, 'b4x-cli.cmd');
        fs.writeFileSync(cmdPath, `@node "${cliEntry}" %*\r\n`, 'utf8');

        // Git Bash / WSL shell wrapper (forward slashes)
        const shPath = path.join(binDir, 'b4x-cli');
        const shEntry = cliEntry.replace(/\\/g, '/');
        fs.writeFileSync(shPath, `#!/bin/sh\nnode "${shEntry}" "$@"\n`, 'utf8');
    } else {
        const shPath = path.join(binDir, 'b4x-cli');
        fs.writeFileSync(shPath, `#!/bin/sh\nnode "${cliEntry}" "$@"\n`, { encoding: 'utf8', mode: 0o755 });
    }
}
