// @ts-check
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { escapeCsv } from '../lib/utils.js';

/**
 * Streams NDJSON to CSV.
 * Expands 'MODIFIED' entries into multiple rows if multiple columns changed.
 * @param {string} sourcePath - Path to the raw NDJSON file.
 * @param {string} outPath - Path to the output CSV file.
 */
/**
 * @param {string} sourceNdjson
 * @param {string} outPath
 * @param {boolean} [isHuman=true] - If true, generates a human-readable report.
 * @returns {Promise<{format: string, path: string, status: string, error?: string}>}
 */
/**
 * Streams NDJSON comparison data to a CSV report.
 * Each property change is expanded into its own row for detailed auditing.
 *
 * @param {string} sourceNdjson - Path to the raw NDJSON source file.
 * @param {string} outPath - Destination path for the CSV report.
 * @param {boolean} [isHuman=true] - If true, prints progress updates to the console.
 * @returns {Promise<{format: string, path: string, status: string, error?: string}>}
 */
export async function exportToCsv(sourceNdjson, outPath, isHuman = true) {
    if (isHuman) {
        console.log(`\n[*] Exporting to CSV...`);
    }

    const absoluteOutPath = resolve(outPath).replace(/\\+/g, '/');

    try {
        const inputStream = createReadStream(sourceNdjson);
        const outputStream = createWriteStream(outPath);
        const rl = createInterface({ input: inputStream });

        // RFC 4180 Compatible Header
        outputStream.write('Status,Path,Type,Property,OldValue,NewValue\n');

        for await (const line of rl) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);
            
            if (record.record_type !== 'entry') continue;

            const { status, path, file_type, diff } = record;
            const escapedPath = escapeCsv(path);

            // The 'diff' object now contains data for all statuses:
            // ADDED:   (old: null, new: value)
            // DELETED: (old: value, new: null)
            // MODIFIED/RENAMED: (old: value, new: value)
            if (diff && Object.keys(diff).length > 0) {
                for (const key of Object.keys(diff)) {
                    // Extract and escape values directly from the diff object
                    const oldVal = escapeCsv(diff[key].old);
                    const newVal = escapeCsv(diff[key].new);

                    outputStream.write(
                        `${status},${escapedPath},${file_type},${key},${oldVal},${newVal}\n`
                    );
                }
            } else {
                // Fallback for empty directories or entries without audited metadata
                outputStream.write(`${status},${escapedPath},${file_type},,,\n`);
            }
        }

        // Ensure the stream is fully flushed and closed
        await new Promise((res, rej) => {
            outputStream.on('error', rej);
            outputStream.end(res);
        });

        if (isHuman) {
            console.log(`- Output: ${absoluteOutPath}`);
        }

        return { format: 'csv', path: absoluteOutPath, status: 'success' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { format: 'csv', path: absoluteOutPath, status: 'error', error: msg };
    }
}
