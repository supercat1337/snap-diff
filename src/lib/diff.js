//@ts-check
import Database from 'better-sqlite3';
import { createWriteStream } from 'node:fs';
import { minimatch } from 'minimatch';
import os from 'node:os';
import { resolve } from 'node:path';

/**
 * @typedef {Object} SnapshotInfo
 * @property {string} snapshot_name
 * @property {string} snapshot_hash
 * @property {string} version
 * @property {number} scan_start
 * @property {number} scan_end
 */

/**
 * @typedef {Object} Row
 * @property {string} status
 * @property {string} n_path
 * @property {string} n_type
 * @property {string} n_hash
 * @property {number} n_size
 * @property {number} n_mtime
 * @property {number} n_ctime
 * @property {number} n_btime
 * @property {number} n_mode
 * @property {number} n_uid
 * @property {number} n_gid
 * @property {number} n_ino
 * @property {number} n_nlink
 * @property {string} n_target
 * @property {string} n_user
 * @property {string} n_group
 * @property {string} o_path
 * @property {string} o_type
 * @property {string} o_hash
 * @property {number} o_size
 * @property {number} o_mtime
 * @property {number} o_ctime
 * @property {number} o_btime
 * @property {number} o_mode
 * @property {number} o_uid
 * @property {number} o_gid
 * @property {number} o_ino
 * @property {number} o_nlink
 * @property {string} o_target
 * @property {string} o_user
 * @property {string} o_group
 *
 */

export class ReportMetaData {
    /**
     * Constructor for ReportMetaData.
     * @param {Object} options
     * @param {string} options.record_type - Type of report (metadata, entry, summary).
     * @param {string} options.version - Version of the report.
     * @param {number} options.scan_start - Timestamp of the scan start.
     * @param {{excludePaths: string[], excludeCols: string[], includeCols: string[], resolveNames: boolean}} options.filters - Filters applied to the snapshot comparison.
     * @param {{new: {name: string, file: string, version: string, scan_start: number, scan_end: number, content_hash: string}, old: {name: string, file: string, version: string, scan_start: number, scan_end: number, content_hash: string}}} options.comparison - Object containing comparison information (new, old).
     */
    constructor({ record_type, version, scan_start, filters, comparison }) {
        this.record_type = record_type;
        this.version = version;
        this.scan_start = scan_start;
        this.filters = {
            excludePaths: filters.excludePaths,
            excludeCols: filters.excludeCols,
            includeCols: filters.includeCols,
            resolveNames: filters.resolveNames,
        };
        this.comparison = {
            new: {
                name: comparison.new.name,
                file: comparison.new.file.replace(/\\/g, '/'),
                version: comparison.new.version,
                scan_start: comparison.new.scan_start,
                scan_end: comparison.new.scan_end,
                content_hash: comparison.new.content_hash,
            },
            old: {
                name: comparison.old.name,
                file: comparison.old.file.replace(/\\/g, '/'),
                version: comparison.old.version,
                scan_start: comparison.old.scan_start,
                scan_end: comparison.old.scan_end,
                content_hash: comparison.old.content_hash,
            },
        };
    }
}

/**
 * Splits patterns into SQL-compatible (LIKE) and complex Globs (Minimatch).
 * @param {string[]} patterns
 */
function partitionExclusions(patterns) {
    /**  @type {string[]} */
    const sqlLike = [];
    /**  @type {string[]} */
    const complexGlobs = [];

    patterns.forEach(p => {
        // Если паттерн содержит сложные глоб-символы, оставляем для JS
        if (/[*{}[\]!]/.test(p)) {
            complexGlobs.push(p);
        } else {
            // Превращаем простой путь в SQL LIKE (например, folder/ -> folder/%)
            // Или оставляем как есть для точного совпадения
            sqlLike.push(p.endsWith('/') ? `${p}%` : p);
        }
    });

    return { sqlLike, complexGlobs };
}

/**
 * Generates a string of NULL fields for a given prefix (p_).
 * Useful for constructing SQL queries where some columns should be NULL.
 * The fields generated are path, type, size, hash, mtime, ctime, btime, mode, ino, nlink, target, user, and group.
 * @param {string} p
 * @param {boolean} resolveNames
 * @returns {string} A string of NULL fields, separated by commas.
 */
const getNullFields = (p, resolveNames) => {
    const cols = [
        'path',
        'type',
        'size',
        'hash',
        'mtime',
        'ctime',
        'btime',
        'mode',
        'ino',
        'nlink',
        'target',
    ];
    let f = cols.map(col => `NULL as ${p}_${col}`);

    if (resolveNames) {
        f.push(`NULL as ${p}_user`, `NULL as ${p}_group`);
    } else {
        f.push(`NULL as ${p}_uid`, `NULL as ${p}_gid`);
    }
    return f.join(', ');
};

// SQL Helper for Metadata
/**
 * @param {string} p - Table prefix (e.g., n_ or o_).
 * @param {boolean} resolveNames
 * @returns {string}
 */
const getFields = (p, resolveNames) => {
    const cols = [
        'path',
        'type',
        'size',
        'hash',
        'mtime',
        'ctime',
        'btime',
        'mode',
        'ino',
        'nlink',
        'target',
    ];
    let f = cols.map(col => `${p}.${col} as ${p}_${col}`);
    if (resolveNames) {
        // Resolve to names: comparison will happen on these strings
        f.push(`u_${p}.username as ${p}_user`, `g_${p}.groupname as ${p}_group`);
    } else {
        // Stay with IDs: comparison will happen on these numbers
        f.push(`${p}.uid as ${p}_uid`, `${p}.gid as ${p}_gid`);
    }
    return f.join(', ');
};

/**
 * Performs a deep comparison between two forensic snapshots.
 *
 * @param {string} newDbPath - Path to the newer database.
 * @param {string} oldDbPath - Path to the older database (baseline).
 * @param {string|null} rawOutputPath - Path to save the NDJSON report.
 * @param {Object} options - Comparison options.
 * @param {string[]} [options.excludePaths] - Glob patterns to skip.
 * @param {string[]} [options.excludeCols] - Columns to ignore (e.g., mtime, ino).
 * @param {string[]} [options.includeCols] - Columns to whitelists (e.g., hash, size).
 * @param {boolean} [options.resolveNames] - Compare by username/groupname instead of UID/GID.
 * @returns {Promise<{metadata: Object, summary: {stats: { added: number, modified: number, deleted: number, total: number }, scan_start: number, scan_end: number, record_type: string }, outputPath: string }>}
 */
export async function streamCompareSnapshots(newDbPath, oldDbPath, rawOutputPath, options = {}) {
    const { excludePaths = [], excludeCols = [], includeCols = [], resolveNames = false } = options;
    const scanStart = Date.now();

    const db = new Database(newDbPath, { readonly: true });
    db.prepare(`ATTACH DATABASE ? AS old`).run(oldDbPath);

    const newInfo = /** @type {SnapshotInfo} */ (
        db.prepare(`SELECT * FROM main.snapshot_info`).get()
    );
    const oldInfo = /** @type {SnapshotInfo} */ (
        db.prepare(`SELECT * FROM old.snapshot_info`).get()
    );

    const allCols = [
        'type',
        'size',
        'hash',
        'mtime',
        'ctime',
        'btime',
        'mode',
        'ino',
        'nlink',
        'target',
    ];

    // Add either the IDs or the Names to the audit list, but NEVER both
    if (resolveNames) {
        allCols.push('user', 'group');
    } else {
        allCols.push('uid', 'gid');
    }

    let auditCols =
        includeCols.length > 0
            ? allCols.filter(c => includeCols.includes(c))
            : allCols.filter(c => !excludeCols.includes(c));

    const { sqlLike, complexGlobs } = partitionExclusions(excludePaths);

    /**
     * Generates a SQL join string for authenticating users and groups.
     * If resolveNames is true, generates a LEFT JOIN for users and groups.
     * Otherwise, returns an empty string.
     * @param {string} p - Table prefix (e.g., n_ or o_).
     * @param {string} dbName - Database name (e.g., main or old).
     * @returns {string} SQL join string.
     */
    const getAuthJoins = (p, dbName) =>
        resolveNames
            ? `LEFT JOIN ${dbName}.users u_${p} ON ${p}.uid = u_${p}.uid LEFT JOIN ${dbName}.groups g_${p} ON ${p}.gid = g_${p}.gid`
            : '';

    const diffConditions = auditCols
        .map(col => {
            // The column names in the row result will match the col name from our audit list
            return `n_${col} IS NOT o_${col}`;
        })
        .join(' OR ');

    // Filter Logic for SQL
    const sqlExcludeN =
        sqlLike.length > 0 ? `AND (${sqlLike.map(() => `n.path NOT LIKE ?`).join(' AND ')})` : '';
    const sqlExcludeO =
        sqlLike.length > 0 ? `AND (${sqlLike.map(() => `o.path NOT LIKE ?`).join(' AND ')})` : '';

    /**
     * UNIFIED SQL QUERY with RENAMED DETECTION
     * 1. MODIFIED: Direct path match with attribute changes.
     * 2. ADDED: New paths that don't exist in old AND aren't part of a rename (unique hash).
     * 3. DELETED: Old paths that don't exist in new AND aren't part of a rename.
     * 4. RENAMED: Matching hashes between entries that changed paths.
     */
    const sql = `
    WITH 
    added_candidates AS (
        -- Identify files present in the new snapshot but missing in the old one
        SELECT * FROM main.entries n WHERE NOT EXISTS (SELECT 1 FROM old.entries o WHERE o.path = n.path) ${sqlExcludeN}
    ),
    deleted_candidates AS (
        -- Identify files present in the old snapshot but missing in the new one
        SELECT * FROM old.entries o WHERE NOT EXISTS (SELECT 1 FROM main.entries n WHERE n.path = o.path) ${sqlExcludeO}
    ),
    renamed_pairs AS (
        -- Match added and deleted files by hash and size to detect renames/moves
        SELECT a.path as n_path, d.path as o_path 
        FROM added_candidates a
        JOIN deleted_candidates d ON a.hash = d.hash AND a.size = d.size
        WHERE a.hash IS NOT NULL
    )
    SELECT * FROM (
        -- 1. MODIFIED (Both N and O columns are populated for comparison)
        SELECT ${getFields('n', resolveNames)}, ${getFields('o', resolveNames)}, 'MODIFIED' as status
        FROM main.entries n
        JOIN old.entries o ON n.path = o.path
        ${getAuthJoins('n', 'main')} ${getAuthJoins('o', 'old')}
        WHERE (${diffConditions}) ${sqlExcludeN}

        UNION ALL

        -- 2. ADDED (N columns are populated, O columns are NULL placeholders)
        SELECT ${getFields('n', resolveNames)}, ${getNullFields('o', resolveNames)}, 'ADDED' as status
        FROM added_candidates n
        ${getAuthJoins('n', 'main')}
        WHERE NOT EXISTS (SELECT 1 FROM renamed_pairs rp WHERE rp.n_path = n.path)

        UNION ALL

        -- 3. DELETED (N columns are NULL placeholders, O columns are populated)
        SELECT ${getNullFields('n', resolveNames)}, ${getFields('o', resolveNames)}, 'DELETED' as status
        FROM deleted_candidates o
        ${getAuthJoins('o', 'old')}
        WHERE NOT EXISTS (SELECT 1 FROM renamed_pairs rp WHERE rp.o_path = o.path)

        UNION ALL

        -- 4. RENAMED (Both N and O columns are populated to show path and metadata evolution)
        SELECT ${getFields('n', resolveNames)}, ${getFields('o', resolveNames)}, 'RENAMED' as status
        FROM main.entries n
        JOIN renamed_pairs rp ON n.path = rp.n_path
        JOIN old.entries o ON o.path = rp.o_path
        ${getAuthJoins('n', 'main')} ${getAuthJoins('o', 'old')}
    ) ORDER BY n_path ASC, o_path ASC
`;

    let outputPath = rawOutputPath || resolve(os.tmpdir(), `snap-diff-${Date.now()}.ndjson`);
    outputPath = outputPath.replace(/\\+/g, '/');

    const outputStream = createWriteStream(outputPath);

    // Write Header
    outputStream.write(
        JSON.stringify(
            new ReportMetaData({
                record_type: 'metadata',
                version: '1.0.0',
                scan_start: scanStart,
                filters: { excludePaths, excludeCols, includeCols, resolveNames },
                comparison: {
                    new: {
                        content_hash: newInfo.snapshot_hash,
                        file: newDbPath,
                        name: newInfo.snapshot_name,
                        scan_end: newInfo.scan_end,
                        scan_start: newInfo.scan_start,
                        version: newInfo.version,
                    },
                    old: {
                        content_hash: oldInfo.snapshot_hash,
                        file: oldDbPath,
                        name: oldInfo.snapshot_name,
                        scan_end: oldInfo.scan_end,
                        scan_start: oldInfo.scan_start,
                        version: oldInfo.version,
                    },
                },
            })
        ) + '\n'
    );

    const query = db.prepare(sql);
    const stats = { added: 0, modified: 0, deleted: 0, renamed: 0, total: 0 };

    for (const r of query.iterate(...sqlLike, ...sqlLike)) {
        const row = /** @type {Row} */ (r);
        const currentPath = row.n_path || row.o_path;

        // Path Filtering (minimatch)
        if (complexGlobs.length > 0 && complexGlobs.some(p => minimatch(currentPath, p))) continue;

        const entry = {
            record_type: 'entry',
            status: row.status,
            path: currentPath,
            file_type: row.n_type || row.o_type,
            /** @type {Record<string, {old: any, new: any}>} */
            diff: {},
        };

        // --- Handle Stats and Status-specific Logic ---
        if (row.status === 'MODIFIED') {
            stats.modified++;
        } else if (row.status === 'RENAMED') {
            stats.renamed++;
            // Explicitly add the path change to the diff for renames
            entry.diff['path'] = { old: row.o_path, new: row.n_path };
        } else if (row.status === 'ADDED') {
            stats.added++;
        } else if (row.status === 'DELETED') {
            stats.deleted++;
        }

        // --- Populate Diff Object ---
        if (row.status === 'MODIFIED' || row.status === 'RENAMED') {
            auditCols.forEach(col => {
                const nVal = row[`n_${col}`];
                const oVal = row[`o_${col}`];
                if (nVal !== oVal) {
                    entry.diff[col] = { old: oVal, new: nVal };
                }
            });
        } else if (row.status === 'ADDED') {
            auditCols.forEach(col => {
                entry.diff[col] = { old: null, new: row[`n_${col}`] };
            });
        } else if (row.status === 'DELETED') {
            auditCols.forEach(col => {
                entry.diff[col] = { old: row[`o_${col}`], new: null };
            });
        }

        stats.total++;
        outputStream.write(JSON.stringify(entry) + '\n');
    }

    const summary = { record_type: 'summary', stats, scan_start: scanStart, scan_end: Date.now() };
    outputStream.write(JSON.stringify(summary) + '\n');

    return new Promise(res =>
        outputStream.end(() => {
            db.close();
            res({ metadata: summary, summary, outputPath });
        })
    );
}
