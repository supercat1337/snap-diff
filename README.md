# snap-diff ⚖️

A high-performance Node.js CLI utility for deep comparison of forensic snapshots created by [snap-generator](https://github.com/supercat1337/snap-generator).  
`snap-diff` performs a binary and metadata audit between two SQLite snapshots, detecting file additions, deletions, modifications, and renames/moves with surgical precision.

---

## 🚀 Key Features

- **Forensic Audit** – Compares all essential metadata: hash, size, mode, uid/gid, ino, and timestamps (mtime, ctime, btime).
- **Rename Detection** – Intelligently identifies moved or renamed files by matching content hashes and sizes across different paths.
- **Streaming Architecture** – Uses SQLite `ATTACH` and Node.js streams to compare millions of files with minimal memory footprint.
- **Multi-Format Export** – Generates professional reports in **CSV**, **Markdown**, **HTML** (pure CSS, forensic-grade escaping), and **Plain Text**.
- **Automation Ready** – `--json` mode outputs full comparison stats and report paths for integration into CI/CD or SOC pipelines.
- **Identity Resolution** – Compares owners and groups by names (`--resolve-names`) instead of raw IDs, essential for cross-server audits.

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/supercat1337/snap-diff.git
cd snap-diff

# Install dependencies
npm install

# Link for global CLI usage
npm link
```

After linking, the `snap-diff` command will be available globally.

---

## 🛠 Usage

### Basic Comparison

Compare two snapshots. The tool automatically detects which one is newer based on internal metadata:

```bash
snap-diff snapshot_old.db snapshot_new.db
```

### Generating Reports

Generate multiple report formats simultaneously with a specific base name:

```bash
snap-diff snap_v1.db snap_v2.db --export audit_report --format csv,html,md
```

### Advanced Filtering

Exclude specific paths (using glob patterns) or ignore certain metadata columns (e.g., ignore access time changes):

```bash
snap-diff v1.db v2.db -e "**/node_modules/**" -e "**/*.tmp" --exclude-cols mtime,ctime
```

### Machine-Readable Output

Output the result as JSON for further processing:

```bash
snap-diff v1.db v2.db --json --export reports/audit --format csv > result.json
```

---

## 🛠 Command Line Options

| Flag       | Long Name         | Description                                                 |
| ---------- | ----------------- | ----------------------------------------------------------- |
| `-p`       | [positionals]     | Paths to the two `.db` snapshots to compare.                |
| `-o`       | `--output`        | Path to save the raw NDJSON comparison stream.              |
| `--export` | `<basename>`      | Basename for exported reports (requires `--format`).        |
| `-f`       | `--format`        | Comma-separated formats: `csv`, `txt`, `html`, `md`.        |
| `-e`       | `--exclude`       | Glob pattern to exclude from comparison (multiple allowed). |
|            | `--include-cols`  | Whitelist of columns to compare (e.g. `hash,size`).         |
|            | `--exclude-cols`  | Blacklist of columns to ignore (e.g. `mtime,ino`).          |
| `-r`       | `--resolve-names` | Compare by username/groupname instead of UID/GID.           |
| `-j`       | `--json`          | Machine-readable JSON output (includes report paths).       |
| `-q`       | `--quiet`         | Disable all console output (except errors).                 |
| `-h`       | `--help`          | Show help.                                                  |

---

## 📂 Report Formats

- **HTML** – A self-contained, secure (XSS-protected), and responsive report using pure CSS. No external JavaScript or internet connection required.
- **CSV** – RFC 4180 compliant. "Exploded" format: each attribute change (size, hash, path) gets its own row for easy filtering in Excel.
- **Markdown** – Clean, table-based summary with emoji status indicators and `old → new` value mapping.
- **Text** – A high-readability CLI-style summary with tree-like pseudo‑graphics.

---

## 🛡 Security & Operational Notes

- **Data Integrity** – Reports include the `snapshot_hash` of the source databases to ensure the audit trail is verifiable.
- **Performance** – For huge filesystems, use `--exclude-cols` to skip frequently changing metadata (like `ctime`) and focus only on content (`hash`).
- **Memory** – All exporters process NDJSON line‑by‑line, ensuring stability even with gigabyte‑sized snapshots.

---

## 💡 Usage Examples

### 1. Detecting a Web Shell or Malware Injection

Find new or modified scripts in a web directory while ignoring legitimate media uploads and logs:

```bash
snap-diff old.db new.db \
  --export web_audit \
  --format html \
  --exclude "**/uploads/**" \
  --exclude "**/*.log" \
  --include-cols hash,size,mtime
```

**Why this works:** It focuses on file content (`hash`) and size, making it easy to spot a hidden `.php` or `.jsp` shell even if the attacker tried to spoof timestamps.

---

### 2. Auditing Privilege Escalation (Permission Changes)

Detect if any system binaries or sensitive configs had their owners or permissions changed:

```bash
snap-diff baseline.db current.db \
  --resolve-names \
  --include-cols mode,uid,gid \
  --export security_report \
  --format csv
```

**Why this works:** Using `--resolve-names` ensures the CSV report shows "root" or "admin" instead of raw IDs (0, 1000), making it immediately obvious if a file became world‑writable (`0777`) or changed ownership.

---

### 3. Tracking System Configuration Drifts

Monitor changes in `/etc` after a system update or a suspected breach:

```bash
snap-diff etc_yesterday.db etc_today.db \
  --format txt \
  --export config_changes \
  --exclude-cols btime,ino
```

**Why this works:** By excluding `ino` (inode) and `btime` (birth time), you avoid "noise" from files that were technically recreated but whose content and permissions remain the same.

---

### 4. Integration with Automated Security Pipelines (SOC/SIEM)

Run the comparison and pipe the JSON metadata to another tool while generating a human-readable Markdown summary:

```bash
snap-diff v1.db v2.db --json --export reports/daily --format md > scan_result.json
```

**Why this works:** The JSON output contains absolute paths to the generated Markdown report, allowing your automation scripts to send a Slack or email notification with the report link attached.

---

## 📄 License

MIT © [supercat1337](https://github.com/supercat1337)
