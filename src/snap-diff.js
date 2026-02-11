// @ts-check

/**
 * @fileoverview Forensic snapshot comparison utility.
 * Compares two SQLite forensic snapshots, detects newer/older,
 * streams differences as NDJSON, and optionally exports reports
 * in various formats (CSV, TXT, HTML, Markdown).
 *
 * @module snap-diff
 */

import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compareTimeDetection } from './lib/db-utils.js';
import { streamCompareSnapshots } from './lib/diff.js';
import { exportToCsv } from './exporters/csv.js';
import { exportToMarkdown } from './exporters/md.js';
import { exportToTxt } from './exporters/txt.js';
import { exportToHtml } from './exporters/html.js';
import { exportToHtml as exportToHtml2 } from './exporters/html2.js';

/**
 * Entry point of the CLI application.
 * Parses command line arguments, loads configuration,
 * determines snapshot order, performs the comparison,
 * and handles output (console summary, raw NDJSON, exports).
 *
 * @returns {Promise<void>}
 * @throws {Error} If any step fails, exits with code 1.
 */
async function main() {
    /** @type {import('node:util').ParseArgsConfig['options']} */
    const argOptions = {
        config: { type: 'string', short: 'c' },
        output: { type: 'string', short: 'o' }, // raw NDJSON report (optional)
        export: { type: 'string' }, // base name for exported reports
        format: { type: 'string', short: 'f' }, // comma-separated: csv,txt,html,md,html2
        exclude: { type: 'string', short: 'e', multiple: true },
        'include-cols': { type: 'string' },
        'exclude-cols': { type: 'string' },
        'resolve-names': { type: 'boolean', short: 'r', default: false },
        json: { type: 'boolean', short: 'j', default: false },
        quiet: { type: 'boolean', short: 'q', default: false },
        help: { type: 'boolean', short: 'h', default: false },
    };

    let tempDir = null;
    let tempOutputPath = null;

    try {
        const { values, positionals } = parseArgs({ options: argOptions, allowPositionals: true });

        // ----- Help & validation ---------------------------------------------
        if (values.help || positionals.length < 2) {
            showHelp();
            return;
        }

        // ----- Load configuration file (if provided) ------------------------
        const fileConfig =
            values.config && typeof values.config === 'string'
                ? JSON.parse(readFileSync(values.config, 'utf8'))
                : {};

        // ----- Merge options: CLI overrides config, config overrides defaults
        const isQuiet = !!values.quiet;
        const isMachine = !!values.json;
        const isHuman = !isQuiet && !isMachine;

        const diffOptions = {
            // @ts-ignore
            excludePaths: [...(values.exclude || []), ...(fileConfig.exclude || [])],
            includeCols: (values['include-cols'] || fileConfig.includeCols || '')
                .split(',')
                .filter(Boolean),
            excludeCols: (values['exclude-cols'] || fileConfig.excludeCols || '')
                .split(',')
                .filter(Boolean),
            resolveNames: values['resolve-names'] || fileConfig.resolveNames || false,
        };

        // ----- Determine raw NDJSON output path -----------------------------
        let outputPath = typeof values.output === 'string' ? resolve(values.output) : null;
        const exportBasename = typeof values.export === 'string' ? values.export : null;
        const formatStr = typeof values.format === 'string' ? values.format : null;

        // Validation: --export requires --format
        if (exportBasename && !formatStr) {
            console.error('Error: --export requires --format to specify output formats.');
            process.exit(1);
        }

        // If --format is given without --export, use a default basename
        let effectiveExportBasename = exportBasename;
        if (formatStr && !exportBasename) {
            effectiveExportBasename = `snapdiff_${Date.now()}`;
            if (isHuman) {
                console.warn(
                    `Warning: --format given without --export. Using default basename "${effectiveExportBasename}"`
                );
            }
        }

        const formats = formatStr
            ? formatStr
                  .split(',')
                  .map(s => s.trim().toLowerCase())
                  .filter(Boolean)
            : [];

        // If export is requested but no persistent NDJSON output is set,
        // create a temporary file to hold the raw comparison data.
        if (effectiveExportBasename && formats.length > 0 && !outputPath) {
            tempDir = await mkdtemp(join(tmpdir(), 'snap-diff-'));
            tempOutputPath = join(tempDir, 'raw.ndjson');
            outputPath = tempOutputPath; // redirect comparison output to temp file
        }

        // ----- Detect which snapshot is newer --------------------------------
        if (isHuman) process.stdout.write('[*] Analyzing metadata... ');
        const { newDbPath, oldDbPath, infoOld, infoNew } = compareTimeDetection(
            resolve(positionals[0]),
            resolve(positionals[1])
        );

        if (isHuman) {
            console.log('Done.');
            console.log(`- New (Target):   ${basename(newDbPath)} (${infoNew.snapshot_name})`);
            console.log(`- Old (Baseline): ${basename(oldDbPath)} (${infoOld.snapshot_name})`);
        }

        // ----- Perform the actual comparison ---------------------------------
        if (isHuman) {
            process.stdout.write(`[*] Comparing snapshots... `);
        }

        const result = await streamCompareSnapshots(newDbPath, oldDbPath, outputPath, diffOptions);

        if (isHuman) {
            console.log(`Done. (report created: ${result.outputPath})`);
        }

        // ----- Generate exported reports (if requested) ---------------------
        /** @type {{ format: string, path: string, status: string, error?: string }[]} */
        let reports = []; // Buffer to hold export info

        if (effectiveExportBasename && formats.length > 0) {
            // Determine the NDJSON source: either the persistent file (--output)
            // or the temporary file we created.
            const sourcePath =
                values.output && typeof values.output === 'string'
                    ? resolve(values.output)
                    : tempOutputPath;
            if (!sourcePath) {
                throw new Error('Internal error: no NDJSON source for export');
            }

            if (isHuman) process.stdout.write('[*] Generating export files... ');

            reports = await generateReportsFromNdjson(
                sourcePath,
                effectiveExportBasename,
                formats,
                { ...diffOptions, isHuman: isHuman && !isMachine }
            );

            if (isHuman) console.log('Done.');
        }

        // ----- Console summary (unless --quiet) -----------------------------
        if (isHuman) {
            console.log('\n--- Comparison Summary ---');
            console.log(`- Added:    ${result.summary.stats.added}`);
            console.log(`- Modified: ${result.summary.stats.modified}`);
            console.log(`- Deleted:  ${result.summary.stats.deleted}`);
            console.log(`- Total:    ${result.summary.stats.total} changes`);
        }

        // ----- Machine-readable JSON output (--json) ------------------------
        if (isMachine) {
            const finalOutput = {
                metadata: result.metadata,
                stats: result.summary.stats,
                snapshots: {
                    new: { path: newDbPath, ...infoNew },
                    old: { path: oldDbPath, ...infoOld },
                },
                exports: reports, // <--- MERGED EXPORT RESULTS
                generated_at: new Date().toISOString(),
            };
            console.log(JSON.stringify(finalOutput, null, 2));
        }
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`Error: ${error.message}`);
        process.exit(1);
    } finally {
        // ----- Cleanup: remove temporary directory if created ---------------
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
        }
    }
}

/**
 * Refactored report generator.
 * Processes NDJSON once and streams it into multiple format exporters.
 *
 * @param {string} sourcePath - Path to the raw NDJSON file.
 * @param {string} basename - Base name for the output files.
 * @param {string[]} formats - Array of formats (csv, txt, html, md).
 * @param {object} [options]
 * @param {boolean} [options.isHuman=true] - If true, generates a human-readable report.
 * @returns {Promise<{ format: string, path: string, status: string, error?: string }[]>}
 */
export async function generateReportsFromNdjson(
    sourcePath,
    basename,
    formats,
    { isHuman = true } = {}
) {
    const activeFormats = formats.map(f => f.toLowerCase());
    /** @type {{ format: string, path: string, status: string, error?: string }[]} */
    const results = [];

    if (activeFormats.includes('csv')) {
        results.push(await exportToCsv(sourcePath, `${basename}.csv`, isHuman));
    }
    if (activeFormats.includes('md')) {
        results.push(await exportToMarkdown(sourcePath, `${basename}.md`, isHuman));
    }
    if (activeFormats.includes('txt')) {
        results.push(await exportToTxt(sourcePath, `${basename}.txt`, isHuman));
    }
    if (activeFormats.includes('html')) {
        results.push(await exportToHtml(sourcePath, `${basename}.html`, isHuman));
    }
    if (activeFormats.includes('html2')) {
        results.push(await exportToHtml2(sourcePath, `${basename}-2.html`, isHuman));
    }

    return results;
}

/**
 * Displays the help message with usage instructions and available options.
 *
 * @returns {void}
 */
function showHelp() {
    console.log(`
snap-diff v1.0.0 🛡️
Usage: snap-diff <file1.db> <file2.db> [options]

Options:
  -c, --config <file>     Path to JSON configuration file
  -o, --output <file>     Save raw NDJSON report (optional)
  --export <basename>     Base name for exported reports (requires --format)
  -f, --format <list>     Export formats: csv,txt,html,html2,md (comma separated)
  -e, --exclude <glob>    Exclude paths from diff (can be multiple)
  -r, --resolve-names     Compare by username/groupname instead of ID
  -j, --json              Output machine-readable JSON to stdout
  -q, --quiet             Suppress all console output
  --include-cols <list>   Whitelist columns (e.g. hash,size)
  --exclude-cols <list>   Blacklist columns (e.g. mtime,ino)

Note: Newer/Older snapshots are detected automatically.
If --output and --export are both omitted, only the summary is shown.
    `);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
