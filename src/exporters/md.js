// @ts-check
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { ReportMetaData } from '../lib/report-metadata.js';
import { resolve } from 'node:path';
import { formatDate } from '../lib/utils.js';

/**
 * Formats a value based on its property name.
 * If the value is null, returns 'n/a'.
 * If the property name is 'mtime', 'ctime', or 'btime',
 * formats the value as a date string using Date.toLocaleString().
 * Otherwise, returns the value as is.
 * @param {string} prop - Property name.
 * @param {*} val - Value to format.
 * @returns {*} Formatted value.
 */
const formatValue = (prop, val) => {
    if (val === null) return 'n/a';
    if (['mtime', 'ctime', 'btime'].includes(prop)) {
        return new Date(val * 1000).toLocaleString();
    }
    return val;
};

/**
 * Exports NDJSON comparison data to a Markdown report.
 *
 * @param {string} sourceNdjson - Path to the raw NDJSON source.
 * @param {string} outPath - Destination path for the MD file.
 * @param {boolean} [isHuman=true] - If true, generates a human-readable report.
 * @returns {Promise<{format: string, path: string, status: string, error?: string}>}
 */
export async function exportToMarkdown(sourceNdjson, outPath, isHuman = true) {
    if (isHuman) {
        console.log(`\n[*] Exporting to Markdown...`);
    }

    const absoluteOutPath = resolve(outPath).replace(/\\+/g, '/');

    try {
        const inputStream = createReadStream(sourceNdjson);
        const outputStream = createWriteStream(outPath);
        const rl = createInterface({ input: inputStream });

        outputStream.write(`# Forensic Snapshot Comparison Report\n\n`);

        let summaryData = null;

        for await (const line of rl) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);

            // 1. Process Metadata Header
            if (record.record_type === 'metadata') {
                const { scan_start, filters, comparison } = /** @type {ReportMetaData} */ (
                    record
                );

                outputStream.write(`## 📋 Metadata & Scope\n`);
                outputStream.write(`- **Scan Start:** ${new Date(scan_start).toLocaleString()}\n`);
                outputStream.write(
                    `- **Target (New):** \`${comparison.new.file}\` (\`${comparison.new.name}\`)\n`
                );
                outputStream.write(
                    `- **Baseline (Old):** \`${comparison.old.file}\` (\`${comparison.old.name}\`)\n`
                );
                outputStream.write(`- **Filters:** \`${JSON.stringify(filters)}\`\n\n`);

                outputStream.write(`## 🔍 Detailed Change Log\n`);
                outputStream.write(`| Status | File Type | Path | Changes |\n`);
                outputStream.write(`| :--- | :--- | :--- | :--- |\n`);
            }

            // 2. Process Change Entries
            if (record.record_type === 'entry') {
                const { status, path, file_type, diff } = record;

                const statusMap = {
                    ADDED: '🟢 ADDED',
                    DELETED: '🔴 DELETED',
                    MODIFIED: '🟡 MODIFIED',
                    RENAMED: '🔵 RENAMED',
                };

                /**
                 * Internal function to format a value based on its property name.
                 *
                 * @param {string} prop
                 * @param {any} val
                 */
                const formatVal = (prop, val) => {
                    if (val === null || val === undefined) return '`null`';

                    // Date formatting
                    if (['mtime', 'ctime', 'btime'].includes(prop)) {
                        return `\`${formatDate(new Date(val))}\``;
                    }

                    // Size formatting
                    if (prop === 'size') {
                        return `\`${val} bytes\``;
                    }

                    return `\`${val}\``;
                };

                let changeDescription = '-';
                if (diff && Object.keys(diff).length > 0) {
                    changeDescription = Object.entries(diff)
                        .map(([prop, val]) => {
                            const oldFmt = formatVal(prop, val.old);
                            const newFmt = formatVal(prop, val.new);

                            if (status === 'ADDED') {
                                return `**${prop}**: ${newFmt}`;
                            }
                            if (status === 'DELETED') {
                                return `**${prop}**: ~~${oldFmt}~~`;
                            }
                            // For MODIFIED and RENAMED
                            return `**${prop}**: ${oldFmt} → ${newFmt}`;
                        })
                        .join('<br>');
                }

                outputStream.write(
                    // @ts-ignore
                    `| ${statusMap[status] || status} | \`${file_type}\` | \`${path}\` | ${changeDescription} |\n`
                );
            }

            // 3. Capture Summary
            if (record.record_type === 'summary') {
                summaryData = record;
            }
        }

        // 4. Append Summary footer
        if (summaryData) {
            outputStream.write(`\n## 📊 Summary Statistics\n`);
            outputStream.write(`- **Total Changes:** ${summaryData.stats.total}\n`);
            outputStream.write(`- **Added:** ${summaryData.stats.added}\n`);
            outputStream.write(`- **Modified:** ${summaryData.stats.modified}\n`);
            outputStream.write(`- **Deleted:** ${summaryData.stats.deleted}\n`);
            if (summaryData.stats.renamed !== undefined) {
                outputStream.write(`- **Renamed/Moved:** ${summaryData.stats.renamed}\n`);
            }
            outputStream.write(
                `\n**Report Generated:** ${new Date(summaryData.scan_end).toLocaleString()}\n`
            );
        }

        await new Promise((res, rej) => {
            outputStream.end(
                /** @type {(err ?: Error) => void} */ err => (err ? rej(err) : res(true))
            );
        });

        if (isHuman) {
            console.log(`- Output: ${absoluteOutPath}`);
        }

        return { format: 'md', path: absoluteOutPath, status: 'success' };
    } catch (error) {
        return {
            format: 'md',
            path: absoluteOutPath,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
