# Spell Data Migration Guide

This document outlines the migration process for the Second Edition Spellbook, introducing the new structured data format (`CanonicalSpell`) and content hashing.

## For Users

### What is happening?
The application is upgrading how it stores spells. Previously, fields like Range, Duration, and Casting Time were simple text strings. Now, they are being parsed into structured data to enable better searching, filtering, and cross-referencing.

### Automatic Migration
When you start the application after updating, a background process ("Hash Backfill") will automatically:
1.  **Backup your database** to `spells_backup_<timestamp>.db` in your data folder.
2.  Scan all spells.
3.  Parse their text fields into structured data.
4.  Compute a unique `content_hash` for each spell.
5.  Store the structured data alongside the legacy text.

This process is **non-destructive**. Your original data is preserved.

### Troubleshooting
If you suspect data issues:
- **Check the logs**: A `migration.log` file is created in your data directory.
- **Run Integrity Check**: You can run the application with the `--check-integrity` flag to scan for issues.
  ```bash
  .\spellbook-desktop.exe --check-integrity
  ```
- **Re-run Migration**: If you need to force a re-computation of all hashes:
  ```bash
  .\spellbook-desktop.exe --recompute-hashes
  ```

### Restoring from Backup
If data is corrupted, you can restore from the backup created automatically.
1.  Navigate to your data directory (e.g., `%APPDATA%/SpellbookVault` on Windows).
2.  Identify the `spells_backup_....db` file.
3.  Rename it to `spellbook.sqlite3` (replacing the current file).

---

## For Developers

### Parser Definitions
The file `src/utils/spell_parser.rs` contains the logic for converting legacy strings to structured data.

#### Supported Patterns

**Range (`parse_range`)**
- "10 yards" -> `{base: 10, unit: "Yards"}`
- "10 + 5/level yards" -> `{base: 10, per_level: 5, unit: "Yards"}`
- "Touch", "Unlimited"

**Duration (`parse_duration`)**
- "1 round", "10 minutes"
- "1 round/level" -> `{per_level: 1, unit: "Round"}`
- "Instantaneous", "Permanent"

**Components (`parse_components`)**
- "V, S, M" -> `{verbal: true, somatic: true, material: true}`

**Damage (`parse_damage`)**
- "1d6/level (max 10d6)" -> `{per_level_dice: "1d6", cap_level: 10}`

### Database Strategy
We use an "Expand and Contract" pattern:
1.  **Expand**: Added `canonical_data` and `content_hash` columns (Migration 12).
2.  **Migrate**: The `backfill` script populates these columns.
3.  **Contract**: (Future) Remove legacy columns once migration is verified and UI is updated.

### Handling Parsing Failures
Parsers are designed to fallback gracefully. If a pattern isn't recognized, the parser returns a "Special" unit with the original text preserved in the `text` field. This ensures no data is lost even if parsing "fails" to find a specific structure.

> [!WARNING]
> **Developer Note on Column Ordering**: When modifying `SELECT` statements in `migration_manager.rs`, ensure that the `row.get(N)` indices in the mapping block **exactly match** the column order in the SQL query. A mismatch between the query and mapping (e.g., swapping `level` and `school`) will lead to incorrect hash computation and data corruption. Always run the `test_migration_column_mapping_regression` test after modifying these queries.
