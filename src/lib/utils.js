// @ts-check

/**
 * RFC 4180 compliant CSV escaping
 * @param {string} val
 */
export function escapeCsv(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}


/**
 * Formats a given Unix timestamp into a human-readable date string.
 *
 * @param {Date} date - The date to format.
 * @param {string} format - The format to use for the date string.
 * Supports the following placeholders: YYYY for year, MM for month, DD for day, HH for hour, mm for minute, ss for second.
 * @param {string} [timeZone] - The timezone to use when formatting the date string.
 * @returns {string} The formatted date string.
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss', timeZone = undefined) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: 'numeric',
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    /** @type {{year: string, month: string, day: string, hour: string, minute: string, second: string}} */
    // @ts-ignore
    let d = {};
    for (let part of formatter.formatToParts(date)) {
        if (part.type === 'literal') continue;
        // @ts-ignore
        d[part.type] = part.value;
    }

    let result = format
        .replace(/YYYY/g, d.year)
        .replace(/MM/g, d.month)
        .replace(/DD/g, d.day)
        .replace(/HH/g, d.hour)
        .replace(/mm/g, d.minute)
        .replace(/ss/g, d.second);

    return result;
}

/**
 * Returns a string representing the current date and time in the format 'YYYY-MM-DD_HH-MM-SS'.
 *
 * This function is similar to {@link getDateTimeString} but replaces ':' with '-' and ' '
 * with '_' to make it suitable for use in file names.
 *
 * @param {string} [timeZone] - Optional timezone string (e.g., 'America/New_York').
 *                             If not provided, uses the system's local timezone.
 *
 * @return {string} The current date and time in the format 'YYYY-MM-DD_HH-MM-SS'.
 */
export function getDateTimeStringForFileName(timeZone) {
    return formatDate(new Date(), 'YYYY-MM-DD_HH-mm-ss', timeZone);
}