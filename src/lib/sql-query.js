// @ts-check

/**
 * List of columns to select from the database.
 * @type {string[]}
 */
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

/**
 * Generates a string of NULL fields for a given prefix (p_).
 * Useful for constructing SQL queries where some columns should be NULL.
 * The fields generated are path, type, size, hash, mtime, ctime, btime, mode, ino, nlink, target, user, and group.
 * @param {string} p
 * @param {boolean} resolveNames
 * @returns {string} A string of NULL fields, separated by commas.
 */
const getNullFields = (p, resolveNames) => {
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
 * Generates a SQL join string for authenticating users and groups.
 * If resolveNames is true, generates a LEFT JOIN for users and groups.
 * Otherwise, returns an empty string.
 * @param {string} p - Table prefix (e.g., n_ or o_).
 * @param {string} dbName - Database name (e.g., main or old).
 * @param {boolean} resolveNames - Whether to use human-readable names (user/group) or IDs (uid/gid).
 * @returns {string} SQL join string.
 */
const getAuthJoins = (p, dbName, resolveNames) =>
    resolveNames
        ? `LEFT JOIN ${dbName}.users u_${p} ON ${p}.uid = u_${p}.uid LEFT JOIN ${dbName}.groups g_${p} ON ${p}.gid = g_${p}.gid`
        : '';

/**
 * Generates a SQL query string for a given set of audit columns and filter logic.
 * The SQL query is an unfiltered report of all differences between the two snapshots.
 * It includes the following types of changes:
 * 1. MODIFIED: Direct path match with attribute changes.
 * 2. ADDED: New paths that don't exist in old AND aren't part of a rename (unique hash).
 * 3. DELETED: Old paths that don't exist in new AND aren't part of a rename.
 * 4. RENAMED: Matching hashes between entries that changed paths.
 * @param {string[]} auditCols - List of columns to include in the audit.
 * @param {string[]} sqlLike - List of glob patterns to exclude from the audit.
 * @param {boolean} resolveNames - Whether to use human-readable names (user/group) or IDs (uid/gid).
 * @returns {string} SQL query string.
 */
export function generateSqlQuery(auditCols, sqlLike, resolveNames) {
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
        ${getAuthJoins('n', 'main', resolveNames)} ${getAuthJoins('o', 'old', resolveNames)}
        WHERE (${diffConditions}) ${sqlExcludeN}

        UNION ALL

        -- 2. ADDED (N columns are populated, O columns are NULL placeholders)
        SELECT ${getFields('n', resolveNames)}, ${getNullFields('o', resolveNames)}, 'ADDED' as status
        FROM added_candidates n
        ${getAuthJoins('n', 'main', resolveNames)}
        WHERE NOT EXISTS (SELECT 1 FROM renamed_pairs rp WHERE rp.n_path = n.path)

        UNION ALL

        -- 3. DELETED (N columns are NULL placeholders, O columns are populated)
        SELECT ${getNullFields('n', resolveNames)}, ${getFields('o', resolveNames)}, 'DELETED' as status
        FROM deleted_candidates o
        ${getAuthJoins('o', 'old', resolveNames)}
        WHERE NOT EXISTS (SELECT 1 FROM renamed_pairs rp WHERE rp.o_path = o.path)

        UNION ALL

        -- 4. RENAMED (Both N and O columns are populated to show path and metadata evolution)
        SELECT ${getFields('n', resolveNames)}, ${getFields('o', resolveNames)}, 'RENAMED' as status
        FROM main.entries n
        JOIN renamed_pairs rp ON n.path = rp.n_path
        JOIN old.entries o ON o.path = rp.o_path
        ${getAuthJoins('n', 'main', resolveNames)} ${getAuthJoins('o', 'old', resolveNames)}
    ) ORDER BY n_path ASC, o_path ASC
`;

    return sql;
}
