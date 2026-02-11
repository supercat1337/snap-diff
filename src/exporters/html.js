// @ts-check

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { formatDate } from '../lib/utils.js';

/**
 * Escapes special characters for safe HTML insertion.
 * @param {any} str
 * @returns {string}
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Exports NDJSON comparison data to a secure self-contained HTML report.
 *
 * @param {string} sourceNdjson - Path to the raw NDJSON source.
 * @param {string} outPath - Destination path for the HTML file.
 * @param {boolean} [isHuman=true] - If true, prints progress logs to console.
 * @returns {Promise<{format: string, path: string, status: string, error?: string}>}
 */
export async function exportToHtml(sourceNdjson, outPath, isHuman = true) {
    if (isHuman) console.log(`\n[*] Exporting to HTML...`);

    const absoluteOutPath = resolve(outPath).replace(/\\+/g, '/');

    try {
        const inputStream = createReadStream(sourceNdjson);
        const outputStream = createWriteStream(outPath);
        const rl = createInterface({ input: inputStream });

        // Write secure Head with inlined CSS
        outputStream.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Forensic Snapshot Report</title>
    <style>
        :root {
            --bg: #f4f7f9; --text: #2c3e50; --border: #dcdfe6;
            --added: #e1f5fe; --added-text: #0288d1;
            --deleted: #fdeaea; --deleted-text: #d32f2f;
            --mod: #fff9db; --mod-text: #f59f00;
            --ren: #f3e5f5; --ren-text: #7b1fa2;
        }
        body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: #fff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 20px 0; background: #f9fafb; padding: 15px; border: 1px solid var(--border); border-radius: 4px; }
        .meta-item b { display: block; font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.85rem; table-layout: fixed; }
        th { background: #f3f4f6; position: sticky; top: 0; padding: 12px; text-align: left; border-bottom: 2px solid var(--border); }
        td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: break-word; }
        .status { font-weight: bold; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; }
        .s-added { background: var(--added); color: var(--added-text); }
        .s-deleted { background: var(--deleted); color: var(--deleted-text); }
        .s-modified { background: var(--mod); color: var(--mod-text); }
        .s-renamed { background: var(--ren); color: var(--ren-text); }
        .path { font-family: monospace; color: #2563eb; }
        .diff-list { list-style: none; margin: 0; padding: 0; }
        .prop { font-weight: 600; color: #4b5563; }
        .old { color: #dc2626; text-decoration: line-through; }
        .new { color: #16a34a; font-weight: bold; }
    </style>
</head>
<body>
<div class="container">`);

        let summaryData = null;

        for await (const line of rl) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);

            if (record.record_type === 'metadata') {
                outputStream.write(`<h1>Forensic Comparison Report</h1>
                <div class="meta-grid">
                    <div class="meta-item"><b>Scan Start</b>${escapeHTML(new Date(record.scan_start).toLocaleString())}</div>
                    <div class="meta-item"><b>Target (New)</b>${escapeHTML(record.comparison.new.file)}</div>
                    <div class="meta-item"><b>Baseline (Old)</b>${escapeHTML(record.comparison.old.file)}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 100px;">Status</th>
                            <th style="width: 80px;">Type</th>
                            <th style="width: 40%;">Path</th>
                            <th>Property Changes</th>
                        </tr>
                    </thead>
                    <tbody>`);
            }

            if (record.record_type === 'entry') {
                const { status, path, file_type, diff } = record;
                const statusClass = `s-${status.toLowerCase()}`;

                let changesHtml = '<ul class="diff-list">';
                if (diff) {
                    for (const [prop, val] of Object.entries(diff)) {
                        /**
                         * Formats a value based on its property name.
                         * If the value is null, returns '<i>null</i>'.
                         * If the property name is 'mtime', 'ctime', or 'btime',
                         * formats the value as a date string using Date.toLocaleString().
                         * Otherwise, returns the value as is.
                         * @param {*} v - Value to format.
                         * @param {string} p - Property name.
                         * @returns {string} Formatted value.
                         */
                        const format = (v, p) => {
                            if (v === null) return '<i>null</i>';
                            if (['mtime', 'ctime', 'btime'].includes(p))
                                return escapeHTML(formatDate(new Date(v)));
                            return escapeHTML(v);
                        };

                        const oldFmt = format(val.old, prop);
                        const newFmt = format(val.new, prop);

                        changesHtml += `<li><span class="prop">${escapeHTML(prop)}:</span> `;
                        if (status === 'ADDED') {
                            changesHtml += `<span class="new">${newFmt}</span>`;
                        } else if (status === 'DELETED') {
                            changesHtml += `<span class="old">${oldFmt}</span>`;
                        } else {
                            changesHtml += `<span class="old">${oldFmt}</span> → <span class="new">${newFmt}</span>`;
                        }
                        changesHtml += `</li>`;
                    }
                }
                changesHtml += '</ul>';

                outputStream.write(`
                    <tr>
                        <td><span class="status ${statusClass}">${escapeHTML(status)}</span></td>
                        <td><code>${escapeHTML(file_type)}</code></td>
                        <td class="path">${escapeHTML(path)}</td>
                        <td>${changesHtml}</td>
                    </tr>`);
            }

            if (record.record_type === 'summary') summaryData = record;
        }

        if (summaryData) {
            outputStream.write(`</tbody></table>
            <p style="margin-top: 20px; font-size: 0.8rem; color: #6b7280;">
                <b>Summary:</b> Added: ${summaryData.stats.added} | Modified: ${summaryData.stats.modified} | 
                Deleted: ${summaryData.stats.deleted} | Renamed: ${summaryData.stats.renamed || 0} | Total: ${summaryData.stats.total}
            </p>`);
        }

        outputStream.write(`</div></body></html>`);

        await new Promise((res, rej) => {
            outputStream.on('error', rej);
            outputStream.end(res);
        });

        if (isHuman) console.log(`- Output: ${absoluteOutPath}`);
        return { format: 'html', path: absoluteOutPath, status: 'success' };
    } catch (error) {
        return { format: 'html', path: absoluteOutPath, status: 'error', error: String(error) };
    }
}
