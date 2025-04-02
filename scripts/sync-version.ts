import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// acquire version number from package.json 
const packageJsonPath: string = resolve(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const newVersion: string = packageJson.version;

// update version number in launch.json
// A launch configuration that launches the extension inside a new window
// Use IntelliSense to learn about possible attributes.
// Hover to view descriptions of existing attributes.
// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
const launchJsonPath: string = resolve(__dirname, '../.vscode/launch.json');
const launchJsonString: string = readFileSync(launchJsonPath, 'utf8');
const launchJson = JSON.parse(launchJsonString);
launchJson.version = newVersion;
writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 2), 'utf8');

// update version number in README files
const readmeCNPath: string = resolve(__dirname, '../README_CN.md');
let readmeCN: string = readFileSync(readmeCNPath, 'utf8');
readmeCN = readmeCN.replace(new RegExp('(?<=- Version: )[\\S]+?(?=\\s)'), newVersion);
writeFileSync(readmeCNPath, readmeCN, 'utf8');
const readmeENPath: string = resolve(__dirname, '../README_EN.md');
let readmeEN: string = readFileSync(readmeENPath, 'utf8');
readmeEN = readmeEN.replace(new RegExp('(?<=- Version: )[\\S]+?(?=\\s)'), newVersion);
writeFileSync(readmeENPath, readmeEN, 'utf8');