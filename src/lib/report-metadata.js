// @ts-check

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