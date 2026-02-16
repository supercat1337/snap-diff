// @ts-check
import Database from 'better-sqlite3';

/**
 * Compares two databases to determine which one has the newer snapshot.
 * @param {string} pathA - Path to the first database.
 * @param {string} pathB - Path to the second database.
 * @returns {{ infoOld: import('./diff.js').SnapshotInfo, infoNew: import('./diff.js').SnapshotInfo, newDbPath: string, oldDbPath: string }} - An object containing the older snapshot info, newer snapshot info, and paths to the newer and older databases.
 * @throws {Error} - If either database is missing the snapshot_info table.
 */
export function determineNewerSnapshot(pathA, pathB) {
    const dbA = new Database(pathA, { readonly: true });
    const dbB = new Database(pathB, { readonly: true });
    const infoA = /** @type {import('./diff.js').SnapshotInfo} */ (
        dbA.prepare('SELECT scan_start, snapshot_name FROM snapshot_info').get()
    );
    const infoB = /** @type {import('./diff.js').SnapshotInfo} */ (
        dbB.prepare('SELECT scan_start, snapshot_name FROM snapshot_info').get()
    );
    dbA.close();
    dbB.close();

    if (!infoA || !infoB) throw new Error('Missing snapshot_info in one of the databases.');

    let infoOld, infoNew, newDbPath, oldDbPath;
    if (infoA.scan_start > infoB.scan_start) {
        infoOld = infoB;
        infoNew = infoA;
        newDbPath = pathA;
        oldDbPath = pathB;
    } else {
        infoOld = infoA;
        infoNew = infoB;
        newDbPath = pathB;
        oldDbPath = pathA;
    }

    return { infoOld, infoNew, newDbPath, oldDbPath };
}
