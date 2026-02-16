// @ts-check

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { formatDate } from '../lib/utils.js';
import { ReportMetaData } from '../lib/report-metadata.js';

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
 * Exports NDJSON comparison data to a modern, interactive HTML report.
 * Features: dark/light mode, sorting, filtering by status, path search.
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

        // ----------------------------------------------------------------------
        // Write the HTML skeleton with inline CSS & JS
        // ----------------------------------------------------------------------
        outputStream.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.5">
    <title>Forensic Snapshot Report · snap-diff</title>
    <style>
        /* ---------- Design tokens ---------- */
        :root {
            color-scheme: light dark;
            /* Light mode */
            --bg-page: #f8fafc;
            --bg-card: #ffffff;
            --text-primary: #0f172a;
            --text-secondary: #334155;
            --text-muted: #64748b;
            --border-light: #e2e8f0;
            --border-focus: #94a3b8;
            --shadow-sm: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
            --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
            --accent-blue: #2563eb;
            --accent-blue-bg: #dbeafe;
            --accent-green: #16a34a;
            --accent-green-bg: #dcfce7;
            --accent-red: #dc2626;
            --accent-red-bg: #fee2e2;
            --accent-amber: #f59f00;
            --accent-amber-bg: #fef3c7;
            --accent-purple: #7e22ce;
            --accent-purple-bg: #f3e8ff;
            --table-stripe: #f9fafb;
            --code-bg: #f1f5f9;
        }
        @media (prefers-color-scheme: dark) {
            :root:not(.light-theme) {
                --bg-page: #0b1120;
                --bg-card: #1e293b;
                --text-primary: #f1f5f9;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --border-light: #334155;
                --border-focus: #5f6c80;
                --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
                --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.4);
                --accent-blue: #60a5fa;
                --accent-blue-bg: #1e3a5f;
                --accent-green: #86efac;
                --accent-green-bg: #1a3a2a;
                --accent-red: #fca5a5;
                --accent-red-bg: #4c2a2a;
                --accent-amber: #fdba74;
                --accent-amber-bg: #4c3a1e;
                --accent-purple: #d8b4fe;
                --accent-purple-bg: #3b2a4c;
                --table-stripe: #1e2a3a;
                --code-bg: #2d3a4f;
            }
        }
        /* Manual theme override */
        :root.light-theme {
            color-scheme: light;
            --bg-page: #f8fafc;
            --bg-card: #ffffff;
            --text-primary: #0f172a;
            --text-secondary: #334155;
            --text-muted: #64748b;
            --border-light: #e2e8f0;
            --border-focus: #94a3b8;
            --accent-blue: #2563eb;
            --accent-blue-bg: #dbeafe;
            --accent-green: #16a34a;
            --accent-green-bg: #dcfce7;
            --accent-red: #dc2626;
            --accent-red-bg: #fee2e2;
            --accent-amber: #f59f00;
            --accent-amber-bg: #fef3c7;
            --accent-purple: #7e22ce;
            --accent-purple-bg: #f3e8ff;
            --table-stripe: #f9fafb;
            --code-bg: #f1f5f9;
        }
        :root.dark-theme {
            color-scheme: dark;
            --bg-page: #0b1120;
            --bg-card: #1e293b;
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #94a3b8;
            --border-light: #334155;
            --border-focus: #5f6c80;
            --accent-blue: #60a5fa;
            --accent-blue-bg: #1e3a5f;
            --accent-green: #86efac;
            --accent-green-bg: #1a3a2a;
            --accent-red: #fca5a5;
            --accent-red-bg: #4c2a2a;
            --accent-amber: #fdba74;
            --accent-amber-bg: #4c3a1e;
            --accent-purple: #d8b4fe;
            --accent-purple-bg: #3b2a4c;
            --table-stripe: #1e2a3a;
            --code-bg: #2d3a4f;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-page);
            color: var(--text-primary);
            line-height: 1.5;
            padding: 2rem 1rem;
            transition: background 0.2s, color 0.2s;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
            background: var(--bg-card);
            border-radius: 1.25rem;
            box-shadow: var(--shadow-md);
            padding: 1.75rem;
        }
        /* Header / title */
        .report-header {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.75rem;
        }
        h1 {
            font-size: 1.8rem;
            font-weight: 600;
            letter-spacing: -0.01em;
            background: linear-gradient(145deg, var(--accent-blue), #4f46e5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
        }
        .theme-toggle {
            background: var(--border-light);
            border: none;
            border-radius: 2rem;
            padding: 0.25rem;
            display: flex;
            gap: 0.25rem;
            cursor: pointer;
        }
        .theme-toggle span {
            padding: 0.4rem 0.9rem;
            border-radius: 2rem;
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--text-secondary);
            transition: 0.1s;
        }
        .theme-toggle .active {
            background: var(--bg-card);
            color: var(--text-primary);
            box-shadow: var(--shadow-sm);
        }
        /* Meta information grid */
        .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 1.25rem;
            background: var(--table-stripe);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            border: 1px solid var(--border-light);
        }
        .meta-card {
            display: flex;
            flex-direction: column;
        }
        .meta-label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted);
            font-weight: 600;
        }
        .meta-value {
            font-size: 1rem;
            font-weight: 500;
            color: var(--text-primary);
            word-break: break-word;
            margin-top: 0.2rem;
        }
        .meta-value small {
            font-size: 0.8rem;
            color: var(--text-muted);
            font-weight: 400;
            margin-left: 0.5rem;
        }
        /* Summary stats card */
        .summary-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 1.5rem;
            background: var(--bg-page);
            border-radius: 1rem;
            padding: 1.25rem 1.75rem;
            margin-bottom: 2rem;
            border: 1px solid var(--border-light);
            justify-content: space-around;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: 700;
            line-height: 1;
            color: var(--text-primary);
        }
        .stat-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        /* Filter bar */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            align-items: center;
            margin-bottom: 1.5rem;
            background: var(--table-stripe);
            padding: 1rem 1.25rem;
            border-radius: 0.75rem;
        }
        .status-filters {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .status-btn {
            background: transparent;
            border: 1px solid var(--border-light);
            padding: 0.4rem 1rem;
            border-radius: 2rem;
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--text-secondary);
            cursor: pointer;
            transition: 0.1s;
        }
        .status-btn.active {
            background: var(--accent-blue);
            border-color: var(--accent-blue);
            color: white;
        }
        .search-box {
            display: flex;
            align-items: center;
            background: var(--bg-card);
            border: 1px solid var(--border-light);
            border-radius: 2rem;
            padding: 0.2rem 0.2rem 0.2rem 1rem;
            flex: 1 1 250px;
        }
        .search-box input {
            background: transparent;
            border: none;
            padding: 0.5rem 0;
            color: var(--text-primary);
            width: 100%;
            outline: none;
            font-size: 0.9rem;
        }
        .search-box span {
            color: var(--text-muted);
            padding: 0 0.8rem;
        }
        /* Table */
        .table-wrapper {
            overflow-x: auto;
            border-radius: 0.75rem;
            border: 1px solid var(--border-light);
            background: var(--bg-card);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
            min-width: 800px;
        }
        th {
            background: var(--table-stripe);
            padding: 0.9rem 1rem;
            text-align: left;
            font-weight: 600;
            color: var(--text-secondary);
            border-bottom: 2px solid var(--border-light);
            position: relative;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        th:hover {
            background: var(--border-light);
        }
        th .sort-icon {
            margin-left: 0.35rem;
            font-size: 0.8rem;
            display: inline-block;
            opacity: 0.4;
        }
        th.sorted-asc .sort-icon::after { content: " ▲"; opacity: 1; }
        th.sorted-desc .sort-icon::after { content: " ▼"; opacity: 1; }
        td {
            padding: 1rem;
            border-bottom: 1px solid var(--border-light);
            vertical-align: top;
            color: var(--text-secondary);
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background-color: var(--border-light); }
        /* Status badges */
        .status-badge {
            display: inline-block;
            padding: 0.25rem 0.85rem;
            border-radius: 1rem;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            white-space: nowrap;
        }
        .status-added { background: var(--accent-green-bg); color: var(--accent-green); }
        .status-deleted { background: var(--accent-red-bg); color: var(--accent-red); }
        .status-modified { background: var(--accent-amber-bg); color: var(--accent-amber); }
        .status-renamed { background: var(--accent-purple-bg); color: var(--accent-purple); }
        .path {
            font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
            font-size: 0.8rem;
            color: var(--accent-blue);
            word-break: break-word;
        }
        .diff-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .diff-list li {
            margin-bottom: 0.4rem;
            font-size: 0.8rem;
        }
        .prop {
            font-weight: 600;
            color: var(--text-primary);
        }
        .old-value {
            color: var(--accent-red);
            text-decoration: line-through;
            opacity: 0.9;
        }
        .new-value {
            color: var(--accent-green);
            font-weight: 600;
        }
        .null-value {
            color: var(--text-muted);
            font-style: italic;
        }
        code, .file-type {
            background: var(--code-bg);
            padding: 0.2rem 0.4rem;
            border-radius: 0.3rem;
            font-size: 0.75rem;
            color: var(--text-primary);
        }
        /* Footer */
        .footer {
            margin-top: 2rem;
            text-align: right;
            color: var(--text-muted);
            font-size: 0.7rem;
            border-top: 1px solid var(--border-light);
            padding-top: 1.25rem;
        }
    </style>
</head>
<body>
<div class="container">

    <!-- ========== HEADER with theme toggle ========== -->
    <div class="report-header">
        <h1>🔍 Forensic Snapshot Diff</h1>
        <div class="theme-toggle" id="themeToggle">
            <span id="themeLight">☀️ Light</span>
            <span id="themeDark">🌙 Dark</span>
            <span id="themeAuto">⚙️ Auto</span>
        </div>
    </div>
`);

        // ----------------------------------------------------------------------
        // Variables to hold metadata and summary (filled later)
        // ----------------------------------------------------------------------
        /** @type {ReportMetaData|null} */
        let metadata = null;
        let summaryData = null;
        let rowCount = 0;

        // ----------------------------------------------------------------------
        // Process NDJSON line by line
        // ----------------------------------------------------------------------
        for await (const line of rl) {
            if (!line.trim()) continue;
            const record = JSON.parse(line);

            // ----- METADATA record (first) -----
            if (record.record_type === 'metadata') {;
                metadata = /** @type {ReportMetaData} */ (record);
                outputStream.write(`
    <!-- ========== METADATA GRID ========== -->
    <div class="meta-grid">
        <div class="meta-card">
            <span class="meta-label">Scan start</span>
            <span class="meta-value">${escapeHTML(new Date(metadata.scan_start).toLocaleString())}</span>
        </div>
        <div class="meta-card">
            <span class="meta-label">Target (newer)</span>
            <span class="meta-value">${escapeHTML(metadata.comparison.new.file || '—')}<small>${escapeHTML(metadata.comparison.new.name || '')}</small></span>
        </div>
        <div class="meta-card">
            <span class="meta-label">Baseline (older)</span>
            <span class="meta-value">${escapeHTML(metadata.comparison.old.file || '—')}<small>${escapeHTML(metadata.comparison.old.name || '')}</small></span>
        </div>
    </div>
`);
            }

            // ----- SUMMARY record (last) -----
            if (record.record_type === 'summary') {
                summaryData = record;
                // We'll render summary via JS later, but we keep the raw data
            }

            // ----- ENTRY record (changes) -----
            if (record.record_type === 'entry') {
                // On first entry, open the table and filter bar (if not already written)
                if (rowCount === 0) {
                    outputStream.write(`
    <!-- ========== SUMMARY STATS (dynamic via JS) ========== -->
    <div id="summaryStatsContainer" class="summary-stats"></div>

    <!-- ========== FILTER CONTROLS ========== -->
    <div class="filter-bar" id="filterBar">
        <div class="status-filters" id="statusFilters">
            <button class="status-btn active" data-status="all">All</button>
            <button class="status-btn" data-status="added">Added</button>
            <button class="status-btn" data-status="modified">Modified</button>
            <button class="status-btn" data-status="deleted">Deleted</button>
            <button class="status-btn" data-status="renamed">Renamed</button>
        </div>
        <div class="search-box">
            <input type="text" id="pathSearch" placeholder="Filter by path..." autocomplete="off">
            <span>🔍</span>
        </div>
    </div>

    <!-- ========== CHANGES TABLE ========== -->
    <div class="table-wrapper">
        <table id="changesTable">
            <thead>
                <tr>
                    <th data-sort="status">Status <span class="sort-icon"></span></th>
                    <th data-sort="type">Type <span class="sort-icon"></span></th>
                    <th data-sort="path">Path <span class="sort-icon"></span></th>
                    <th data-sort="changes">Property changes</th>
                </tr>
            </thead>
            <tbody id="tableBody">
`);
                }

                // ----- Render table row -----
                const { status, path, file_type, diff } = record;
                const statusLower = status.toLowerCase();
                let statusClass = '';
                if (statusLower === 'added') statusClass = 'status-added';
                else if (statusLower === 'deleted') statusClass = 'status-deleted';
                else if (statusLower === 'modified') statusClass = 'status-modified';
                else if (statusLower === 'renamed') statusClass = 'status-renamed';

                // Build changes HTML
                let changesHtml = '<ul class="diff-list">';
                if (diff) {
                    for (const [prop, val] of Object.entries(diff)) {
                        /**
                         * Formats a value based on its property name.
                         * If the value is null or undefined, returns a &lt;span&gt; element with class 'null-value' containing the string 'null'.
                         * If the property name is 'mtime', 'ctime', 'btime', or 'atime',
                         * formats the value as a date string using formatDate().
                         * Otherwise, returns the value as is.
                         * @param {*} v - Value to format.
                         * @param {string} p - Property name.
                         * @returns {string} Formatted value.
                         */
                        const format = (v, p) => {
                            if (v === null || v === undefined)
                                return '<span class="null-value">null</span>';
                            if (['mtime', 'ctime', 'btime', 'atime'].includes(p)) {
                                try {
                                    return escapeHTML(formatDate(new Date(v)));
                                } catch {
                                    return escapeHTML(v);
                                }
                            }
                            return escapeHTML(v);
                        };
                        const oldFmt = format(val.old, prop);
                        const newFmt = format(val.new, prop);

                        changesHtml += `<li><span class="prop">${escapeHTML(prop)}:</span> `;
                        if (statusLower === 'added') {
                            changesHtml += `<span class="new-value">${newFmt}</span>`;
                        } else if (statusLower === 'deleted') {
                            changesHtml += `<span class="old-value">${oldFmt}</span>`;
                        } else {
                            changesHtml += `<span class="old-value">${oldFmt}</span> → <span class="new-value">${newFmt}</span>`;
                        }
                        changesHtml += '</li>';
                    }
                }
                changesHtml += '</ul>';

                outputStream.write(`
                <tr data-status="${escapeHTML(statusLower)}">
                    <td><span class="status-badge ${statusClass}">${escapeHTML(status)}</span></td>
                    <td><code class="file-type">${escapeHTML(file_type || 'unknown')}</code></td>
                    <td class="path">${escapeHTML(path)}</td>
                    <td>${changesHtml}</td>
                </tr>
`);
                rowCount++;
            }
        } // end for await

        // ----- Close table, write footer and JavaScript -----
        outputStream.write(`
            </tbody>
        </table>
    </div>

    <!-- ========== FOOTER ========== -->
    <div class="footer">
        Generated by snap-diff · ${new Date().toLocaleString()}
    </div>

    <!-- ========== INTERACTIVE SCRIPT ========== -->
    <script>
        (function() {
            // ---------- THEME TOGGLE ----------
            const root = document.documentElement;
            const lightBtn = document.getElementById('themeLight');
            const darkBtn = document.getElementById('themeDark');
            const autoBtn = document.getElementById('themeAuto');
            
            function setTheme(theme) {
                root.classList.remove('light-theme', 'dark-theme');
                if (theme === 'light') root.classList.add('light-theme');
                if (theme === 'dark') root.classList.add('dark-theme');
                localStorage.setItem('snapdiff-theme', theme);
                
                [lightBtn, darkBtn, autoBtn].forEach(btn => btn.classList.remove('active'));
                if (theme === 'light') lightBtn.classList.add('active');
                if (theme === 'dark') darkBtn.classList.add('active');
                if (theme === 'auto') autoBtn.classList.add('active');
            }
            
            // Load saved theme
            const saved = localStorage.getItem('snapdiff-theme') || 'auto';
            setTheme(saved);
            
            lightBtn.addEventListener('click', () => setTheme('light'));
            darkBtn.addEventListener('click', () => setTheme('dark'));
            autoBtn.addEventListener('click', () => setTheme('auto'));
            
            // ---------- SUMMARY STATS (from JSON) ----------
            const summaryContainer = document.getElementById('summaryStatsContainer');
            const summaryData = ${summaryData ? JSON.stringify(summaryData.stats) : 'null'};
            if (summaryContainer && summaryData) {
                summaryContainer.innerHTML = \`
                    <div class="stat-item"><span class="stat-number">\${summaryData.added}</span><span class="stat-label">Added</span></div>
                    <div class="stat-item"><span class="stat-number">\${summaryData.modified}</span><span class="stat-label">Modified</span></div>
                    <div class="stat-item"><span class="stat-number">\${summaryData.deleted}</span><span class="stat-label">Deleted</span></div>
                    <div class="stat-item"><span class="stat-number">\${summaryData.renamed || 0}</span><span class="stat-label">Renamed</span></div>
                    <div class="stat-item"><span class="stat-number">\${summaryData.total}</span><span class="stat-label">Total</span></div>
                \`;
            }
            
            // ---------- SORTING & FILTERING ----------
            const table = document.getElementById('changesTable');
            const tbody = document.getElementById('tableBody');
            if (!tbody) return;
            
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Sort handling
            const headers = table.querySelectorAll('th[data-sort]');
            let currentSort = { col: 'status', dir: 'asc' };
            
            function sortTable(col, dir) {
                const colIndex = Array.from(headers).findIndex(h => h.dataset.sort === col);
                if (colIndex === -1) return;
                
                const sortedRows = rows.sort((a, b) => {
                    let aVal = a.cells[colIndex]?.innerText || '';
                    let bVal = b.cells[colIndex]?.innerText || '';
                    if (col === 'status') {
                        const order = ['added', 'modified', 'deleted', 'renamed'];
                        aVal = order.indexOf(a.dataset.status) ?? 0;
                        bVal = order.indexOf(b.dataset.status) ?? 0;
                    }
                    if (col === 'type') {
                        aVal = a.cells[colIndex].querySelector('code')?.innerText || '';
                        bVal = b.cells[colIndex].querySelector('code')?.innerText || '';
                    }
                    if (!isNaN(Date.parse(aVal)) && !isNaN(Date.parse(bVal))) {
                        aVal = new Date(aVal).getTime();
                        bVal = new Date(bVal).getTime();
                    } else if (!isNaN(parseFloat(aVal)) && !isNaN(parseFloat(bVal))) {
                        aVal = parseFloat(aVal);
                        bVal = parseFloat(bVal);
                    }
                    if (aVal < bVal) return dir === 'asc' ? -1 : 1;
                    if (aVal > bVal) return dir === 'asc' ? 1 : -1;
                    return 0;
                });
                
                tbody.append(...sortedRows);
                
                headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
                headers[colIndex].classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
            
            headers.forEach(header => {
                header.addEventListener('click', () => {
                    const col = header.dataset.sort;
                    let dir = 'asc';
                    if (currentSort.col === col && currentSort.dir === 'asc') dir = 'desc';
                    currentSort = { col, dir };
                    sortTable(col, dir);
                });
            });
            
            // Filtering by status and path
            const statusBtns = document.querySelectorAll('.status-btn');
            const searchInput = document.getElementById('pathSearch');
            
            function filterRows() {
                const activeStatus = document.querySelector('.status-btn.active')?.dataset.status || 'all';
                const searchTerm = searchInput?.value.toLowerCase() || '';
                
                rows.forEach(row => {
                    const status = row.dataset.status;
                    const path = row.cells[2]?.innerText.toLowerCase() || '';
                    let statusMatch = activeStatus === 'all' || status === activeStatus;
                    let pathMatch = path.includes(searchTerm);
                    row.style.display = statusMatch && pathMatch ? '' : 'none';
                });
            }
            
            statusBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    statusBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    filterRows();
                });
            });
            
            if (searchInput) {
                searchInput.addEventListener('input', filterRows);
            }
            
            // Initial sort by status (asc)
            sortTable('status', 'asc');
        })();
    </script>

</div> <!-- .container -->
</body>
</html>
`);

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
