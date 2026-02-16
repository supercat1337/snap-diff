// @ts-check

import { exportToCsv } from './../exporters/csv.js';
import { exportToMarkdown } from './../exporters/md.js';
import { exportToTxt } from './../exporters/txt.js';
import { exportToHtml } from './../exporters/html.js';
import { exportToHtml as exportToHtml2 } from './../exporters/html2.js';

/**
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
    const availableFormats = ['csv', 'txt', 'html', 'md', 'html2'];

    const activeFormats = formats.map(f => f.toLowerCase());
    /** @type {{ format: string, path: string, status: string, error?: string }[]} */
    const results = [];

    if (activeFormats.includes('csv')) {
        let report = await exportToCsv(sourcePath, `${basename}.csv`, isHuman);
        results.push({ ...report, format: 'csv' });
    }
    if (activeFormats.includes('md')) {
        let report = await exportToMarkdown(sourcePath, `${basename}.md`, isHuman);
        results.push({ ...report, format: 'md' });
    }
    if (activeFormats.includes('txt')) {
        let report = await exportToTxt(sourcePath, `${basename}.txt`, isHuman);
        results.push({ ...report, format: 'txt' });
    }
    if (activeFormats.includes('html')) {
        let report = await exportToHtml(sourcePath, `${basename}.html`, isHuman);
        results.push({ ...report, format: 'html' });
    }
    if (activeFormats.includes('html2')) {
        let report = await exportToHtml2(sourcePath, `${basename}-2.html`, isHuman);
        results.push({ ...report, format: 'html2' });
    }

    if (isHuman) {
        activeFormats.forEach(f => {
            if (!availableFormats.includes(f)) {
                console.warn(`Unknown format: ${f}`);
            }
        });
    }

    return results;
}
