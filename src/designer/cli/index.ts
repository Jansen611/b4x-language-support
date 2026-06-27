#!/usr/bin/env node
/**
 * b4x-cli — CLI tool for converting BJL/BAL layout files to/from JSON.
 *
 * Usage:
 *   b4x-cli to-json   <input.bal|bjl>  [-o output.json]  [--no-pretty]
 *   b4x-cli from-json <input.json>          -o output.bal|bjl
 *   b4x-cli --help
 *   b4x-cli <subcommand> --help
 *
 * Exit codes:
 *   0  Success
 *   1  Usage / argument error
 *   2  Parse or I/O error
 */

import * as fs   from 'fs';
import * as path from 'path';

import { parseLayoutFile, writeLayoutFile } from '../models/layoutFormat';
import { serializeLayoutFile, deserializeLayoutFile, JsonLayoutFile } from './jsonTransform';

// ── Argument parsing ─────────────────────────────────────────────────

interface ParsedArgs {
    subcommand: 'to-json' | 'from-json';
    input:      string;
    output:     string | null;
    pretty:     boolean;
}

function printHelp(subcommand?: string): void {
    if (subcommand === 'to-json') {
        console.log(`
Usage: b4x-cli to-json <input> [options]

Convert a binary BJL/BAL layout file to JSON.

Arguments:
  <input>           Path to a .bal or .bjl layout file

Options:
  -o, --output <file>   Write JSON to this file instead of stdout
  --no-pretty           Compact JSON output (no indentation)
  -h, --help            Show this help message

Examples:
  # Print JSON to terminal
  b4x-cli to-json MyLayout.bal

  # Save JSON to file
  b4x-cli to-json MyLayout.bal -o MyLayout.json

  # Pipe to jq for quick inspection
  b4x-cli to-json MyLayout.bal | jq '.rootControl.children[0].properties.name'
`.trim());
        return;
    }

    if (subcommand === 'from-json') {
        console.log(`
Usage: b4x-cli from-json <input> -o <output> [options]

Convert a JSON file back to a binary BJL/BAL layout file.

Arguments:
  <input>               Path to a .json file produced by "to-json"

Options:
  -o, --output <file>   (Required) Output path (.bal or .bjl)
  -h, --help            Show this help message

Examples:
  # Round-trip: binary → JSON → binary
  b4x-cli to-json   MyLayout.bal -o MyLayout.json
  # ... edit MyLayout.json with your agent or editor ...
  b4x-cli from-json MyLayout.json -o MyLayout.bal
`.trim());
        return;
    }

    // General help
    console.log(`
Usage: b4x-cli <subcommand> [options]

Subcommands:
  to-json     Convert a binary BJL/BAL layout file → JSON
  from-json   Convert a JSON file → binary BJL/BAL layout file

Options:
  -h, --help  Show help for a subcommand

Run "b4x-cli <subcommand> --help" for more details.

Examples:
  b4x-cli to-json   MyLayout.bal -o MyLayout.json
  b4x-cli from-json MyLayout.json -o MyLayout.bal
`.trim());
}

function parseArgs(argv: string[]): ParsedArgs | null {
    const args = argv.slice(2); // strip 'node' and script path

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printHelp();
        process.exit(0);
    }

    const subcommand = args[0] as ParsedArgs['subcommand'];
    if (subcommand !== 'to-json' && subcommand !== 'from-json') {
        console.error(`Error: unknown subcommand "${subcommand}".`);
        console.error('Run "b4x-cli --help" for usage.');
        process.exit(1);
    }

    // Check for subcommand-level --help
    if (args.includes('--help') || args.includes('-h')) {
        printHelp(subcommand);
        process.exit(0);
    }

    let input:  string | null = null;
    let output: string | null = null;
    let pretty  = true;

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-o' || arg === '--output') {
            if (i + 1 >= args.length) {
                console.error(`Error: flag "${arg}" requires a value.`);
                process.exit(1);
            }
            output = args[++i];
        } else if (arg === '--no-pretty') {
            pretty = false;
        } else if (arg.startsWith('-')) {
            console.error(`Error: unknown flag "${arg}".`);
            console.error(`Run "b4x-cli ${subcommand} --help" for usage.`);
            process.exit(1);
        } else {
            if (input !== null) {
                console.error('Error: more than one input file specified.');
                process.exit(1);
            }
            input = arg;
        }
    }

    if (input === null) {
        console.error('Error: no input file specified.');
        console.error(`Run "b4x-cli ${subcommand} --help" for usage.`);
        process.exit(1);
    }

    if (subcommand === 'from-json' && output === null) {
        console.error('Error: "from-json" requires an output file (-o <file.bal|bjl>).');
        console.error('');
        console.error('  b4x-cli from-json input.json -o output.bal');
        process.exit(1);
    }

    return { subcommand, input, output, pretty };
}

// ── Subcommand: to-json ───────────────────────────────────────────────

function cmdToJson(args: ParsedArgs): void {
    const inputPath = path.resolve(args.input);

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: file not found: ${inputPath}`);
        process.exit(2);
    }

    const ext = path.extname(inputPath).toLowerCase();
    if (ext !== '.bal' && ext !== '.bjl') {
        console.error(`Error: input file must be .bal or .bjl (got "${ext}").`);
        process.exit(1);
    }

    let binary: Buffer;
    try {
        binary = fs.readFileSync(inputPath);
    } catch (err) {
        console.error(`Error: cannot read "${inputPath}": ${(err as Error).message}`);
        process.exit(2);
    }

    let jsonObj: JsonLayoutFile;
    try {
        const layout = parseLayoutFile(binary);
        jsonObj = serializeLayoutFile(layout);
    } catch (err) {
        console.error(`Error: failed to parse "${path.basename(inputPath)}": ${(err as Error).message}`);
        process.exit(2);
    }

    const jsonText = args.pretty
        ? JSON.stringify(jsonObj, null, 2)
        : JSON.stringify(jsonObj);

    if (args.output === null) {
        // Write to stdout — pipe-friendly for agents
        process.stdout.write(jsonText + '\n');
    } else {
        const outputPath = path.resolve(args.output);
        try {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, jsonText + '\n', 'utf8');
            console.error(`Written: ${outputPath}`);
        } catch (err) {
            console.error(`Error: cannot write "${outputPath}": ${(err as Error).message}`);
            process.exit(2);
        }
    }
}

// ── Subcommand: from-json ─────────────────────────────────────────────

function cmdFromJson(args: ParsedArgs): void {
    const inputPath  = path.resolve(args.input);
    // output is guaranteed non-null for from-json (checked in parseArgs)
    const outputPath = path.resolve(args.output!);

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: file not found: ${inputPath}`);
        process.exit(2);
    }

    const outExt = path.extname(outputPath).toLowerCase();
    if (outExt !== '.bal' && outExt !== '.bjl') {
        console.error(`Error: output file must be .bal or .bjl (got "${outExt}").`);
        process.exit(1);
    }

    let jsonText: string;
    try {
        jsonText = fs.readFileSync(inputPath, 'utf8');
    } catch (err) {
        console.error(`Error: cannot read "${inputPath}": ${(err as Error).message}`);
        process.exit(2);
    }

    let jsonObj: JsonLayoutFile;
    try {
        jsonObj = JSON.parse(jsonText) as JsonLayoutFile;
    } catch (err) {
        console.error(`Error: invalid JSON in "${path.basename(inputPath)}": ${(err as Error).message}`);
        process.exit(2);
    }

    let binary: Buffer;
    try {
        const layout = deserializeLayoutFile(jsonObj);
        binary = writeLayoutFile(layout);
    } catch (err) {
        console.error(`Error: failed to convert JSON to binary: ${(err as Error).message}`);
        process.exit(2);
    }

    try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, binary);
        console.error(`Written: ${outputPath} (${binary.length} bytes)`);
    } catch (err) {
        console.error(`Error: cannot write "${outputPath}": ${(err as Error).message}`);
        process.exit(2);
    }
}

// ── Entry point ───────────────────────────────────────────────────────

const parsed = parseArgs(process.argv);
if (parsed) {
    switch (parsed.subcommand) {
        case 'to-json':   cmdToJson(parsed);   break;
        case 'from-json': cmdFromJson(parsed); break;
    }
}
