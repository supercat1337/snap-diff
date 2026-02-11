// @ts-check

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { formatDate } from '../lib/utils.js';

/**
 * Exports NDJSON comparison data to a plain text report.
 * Provides a detailed change log including all attributes for new and deleted files.
 *
 * @param {string} sourceNdjson - Path to the raw NDJSON source.
 * @param {string} outPath - Destination path for the TXT file.
 * @param {boolean} [isHuman=true] - If true, prints progress logs to console.
 * @returns {Promise<{format: string, path: string, status: string, error?: string}>}
 */
export async function exportToTxt(sourceNdjson, outPath, isHuman = true) {
    if (isHuman) {
        console.log(`\n[*] Exporting to Text...`);
    }

    const absoluteOutPath = resolve(outPath).replace(/\\+/g, '/');

    try {
        const inputStream = createReadStream(sourceNdjson);
        const outputStream = createWriteStream(outPath);
        const rl = createInterface({ input: inputStream });

        outputStream.write('====================================================\n');
        outputStream.write('       FORENSIC SNAPSHOT COMPARISON REPORT          \n');
        outputStream.write('====================================================\n\n');

        let summaryData = null;

        for await (const line of rl) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);

            // 1. Process Metadata Header
            if (record.record_type === 'metadata') {
                const { version, scan_start, filters, comparison } = record;

                outputStream.write(`[ METADATA ]\n`);
                outputStream.write(`Report Version : ${version}\n`);
                outputStream.write(`Scan Started   : ${new Date(scan_start).toLocaleString()}\n`);
                outputStream.write(`Target (New)   : ${comparison.new.file}\n`);
                outputStream.write(`Baseline (Old) : ${comparison.old.file}\n`);
                outputStream.write(`Filters Applied: ${JSON.stringify(filters)}\n`);
                outputStream.write(`----------------------------------------------------\n\n`);
                outputStream.write(`[ CHANGE LOG ]\n`);
            }

            // 2. Process Change Entries
            if (record.record_type === 'entry') {
                const { status, path, file_type, diff } = record;

                const statusLabel = `[${status}]`.padEnd(12);
                outputStream.write(`${statusLabel} ${path} (${file_type})\n`);

                if (diff && Object.keys(diff).length > 0) {
                    for (const [prop, val] of Object.entries(diff)) {
                        let detailLine = '';

                        /**
                         * Formats a value based on its property name.
                         * If the value is null, returns 'n/a'.
                         * If the property name is 'mtime', 'ctime', or 'btime',
                         * formats the value as a date string using Date.toLocaleString().
                         * If the property name is 'size', formats the value as a string with ' bytes' appended.
                         * Otherwise, returns the value as is.
                         * @param {string} p - Property name.
                         * @param {*} v - Value to format.
                         * @returns {string} Formatted value.
                         */
                        const formatValue = (p, v) => {
                            if (v === null) return 'n/a';
                            if (['mtime', 'ctime', 'btime'].includes(p)) {
                                return formatDate(new Date(v));
                            }
                            if (p === 'size') return `${v} bytes`;
                            return v;
                        };

                        const oldFmt = formatValue(prop, val.old);
                        const newFmt = formatValue(prop, val.new);

                        if (status === 'ADDED') {
                            detailLine = `[+] ${prop.toUpperCase()}: ${newFmt}`;
                        } else if (status === 'DELETED') {
                            detailLine = `[-] ${prop.toUpperCase()}: ${oldFmt}`;
                        } else {
                            // MODIFIED or RENAMED
                            detailLine = `[*] ${prop.toUpperCase()}: ${oldFmt} -> ${newFmt}`;
                        }

                        outputStream.write(`             └─ ${detailLine}\n`);
                    }
                }
            }

            // 3. Capture Summary
            if (record.record_type === 'summary') {
                summaryData = record;
            }
        }

        // 4. Append Summary footer
        if (summaryData) {
            outputStream.write(`\n====================================================\n`);
            outputStream.write(`SUMMARY STATISTICS\n`);
            outputStream.write(`----------------------------------------------------\n`);
            outputStream.write(`Added    : ${summaryData.stats.added}\n`);
            outputStream.write(`Modified : ${summaryData.stats.modified}\n`);
            outputStream.write(`Deleted  : ${summaryData.stats.deleted}\n`);
            if (summaryData.stats.renamed !== undefined) {
                outputStream.write(`Renamed  : ${summaryData.stats.renamed}\n`);
            }
            outputStream.write(`Total    : ${summaryData.stats.total}\n`);
            outputStream.write(`----------------------------------------------------\n`);
            outputStream.write(
                `Report Generated: ${new Date(summaryData.scan_end).toLocaleString()}\n`
            );
            outputStream.write(`====================================================\n`);
        }

        await new Promise((res, rej) => {
            outputStream.on('error', rej);
            outputStream.end(res);
        });

        if (isHuman) {
            console.log(`- Output: ${absoluteOutPath}`);
        }

        return { format: 'txt', path: absoluteOutPath, status: 'success' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { format: 'txt', path: absoluteOutPath, status: 'error', error: msg };
    }
}
