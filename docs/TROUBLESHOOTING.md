# Troubleshooting Spell Data Migration

This guide provides solutions for common issues encountered during the migration to the Second Edition Spellbook structured data format.

## Common Issues

### 1. "Migration Failed" or Application Crash on Start
If the application fails to start during the migration phase:
- **Check `migration.log`**: Locate this file in your data directory (e.g., `%APPDATA%\SpellbookVault`). usage
- **Look for constraint violations**: If the log shows `UNIQUE constraint failed: spell.content_hash`, it means you have duplicate spells.
    - **Fix**: Run with `--detect-collisions` to identify duplicates, then manually assume one is correct or delete the duplicate via SQL.

### 2. Missing or Incorrect Parsed Data
If spells have unexpected values in structured fields (e.g., `kind: "special"` when a specific pattern was expected):
- This may happen if the parser doesn't recognize the legacy text pattern.
- **Check the parser tests**: Each parser has comprehensive unit tests showing supported patterns:
  - `src/utils/parsers/range.rs` - Range patterns
  - `src/utils/parsers/area.rs` - Area patterns
  - `src/utils/parsers/duration.rs` - Duration patterns
  - `src/utils/parsers/mechanics.rs` - Damage, save, MR, XP patterns
  - `src/utils/parsers/components.rs` - Component patterns
- **Check the migration log**: Search `migration.log` for "Failed to parse" warnings.
- **Fix**:
    1. If the pattern should be supported, check if the text has unusual formatting (e.g., extra whitespace, non-standard abbreviations).
    2. Edit the spell in the UI and adjust the text to match a supported pattern (see [MIGRATION.md](./MIGRATION.md) for pattern tables).
    3. Save to re-trigger parsing.
    4. If this is a common pattern that should be supported, consider filing an issue or adding parser support.

---

## Parser Debugging Guide

This section provides detailed guidance for diagnosing and resolving parser-related issues.

### Understanding Graceful Degradation

Parsers are designed to **never fail**. When a pattern isn't recognized, the parser returns a valid struct with:

1. **`kind: "special"`** (or equivalent fallback type)
2. **Original text preserved** in `notes`, `text`, or `condition` field
3. **Log entry written** to `migration.log`

This ensures the migration completes successfully even when parsers encounter unfamiliar patterns.

### Migration Log Location

The migration log is located in your data directory:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\SpellbookVault\migration.log` |
| macOS | `~/Library/Application Support/SpellbookVault/migration.log` |
| Linux | `~/.local/share/SpellbookVault/migration.log` |

### Log Entry Format

Each parser fallback generates a log entry with this format:

```
[TIMESTAMP] Spell ID: Failed to parse <field> '<original_text>'
```

#### Example Log Entries

```log
[2026-02-05T12:34:56Z] Spell 142: Failed to parse range 'Within sight of the caster'
[2026-02-05T12:34:56Z] Spell 187: Failed to parse duration 'Until dispelled or next sunrise'
[2026-02-05T12:34:57Z] Spell 203: Failed to parse area 'Three 10-foot cubes or a 30-foot cone'
[2026-02-05T12:34:57Z] Spell 245: Failed to parse casting_time 'Varies (see text)'
```

### Diagnosing Parse Failures

#### Step 1: Identify Failed Parsers

Search the log for patterns to identify which parser is having issues:

```powershell
# Windows PowerShell
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Failed to parse"

# Count failures by type
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Failed to parse range" | Measure-Object
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Failed to parse duration" | Measure-Object
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Failed to parse area" | Measure-Object
```

```bash
# macOS/Linux
grep "Failed to parse" ~/Library/Application\ Support/SpellbookVault/migration.log

# Count failures by type
grep -c "Failed to parse range" migration.log
grep -c "Failed to parse duration" migration.log
grep -c "Failed to parse area" migration.log
```

#### Step 2: Analyze Failure Patterns

Look for common themes in the failed text:

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Multiple conditional clauses | Complex dual-duration/choice | Simplify to primary value or use "Special" |
| Non-numeric ranges | Descriptive text (e.g., "line of sight") | Add numeric value or accept Special |
| Multiple termination conditions | Parser can't handle OR chaining | Pick primary condition |
| Unusual abbreviations | Non-standard unit notation | Use standard units (ft, yd, mi) |
| Trailing parenthetical notes | Parser may not extract them | Move notes to description field |

#### Step 3: Verify Parser Coverage

Check if the pattern should theoretically be supported by consulting [PARSER_COVERAGE.md](./PARSER_COVERAGE.md):

- 🟢 **Fully Supported**: Parser bug - consider filing an issue
- 🟡 **Partially Supported**: Expected behavior - may need manual adjustment
- 🔴 **Known Limitation**: Expected fallback - simplify input or accept Special

### Common Parser Issues and Fixes

#### Duration Parser Issues

| Problem | Example | Fix |
|---------|---------|-----|
| Dual termination | `"1 hour or until dispelled"` | ✅ Supported - check for typos |
| Triple termination | `"1 hour, until dispelled, or concentration"` | Simplify to two conditions max |
| Variable dice | `"1d4 rounds"` | Change to fixed value `"2 rounds"` or accept Special |
| Sunrise/sunset | `"Until dawn"` | Change to hour estimate or accept Conditional |

#### Range Parser Issues

| Problem | Example | Fix |
|---------|---------|-----|
| Mixed units | `"10 feet or 30 yards"` | Use single unit, pick primary |
| Narrative range | `"As far as the eye can see"` | Add numeric estimate |
| Conditional range | `"Touch; 30 feet if quickened"` | Use primary mode |
| Planar modifier | `"100 ft (200 on Astral)"` | Use primary value |

#### Area Parser Issues

| Problem | Example | Fix |
|---------|---------|-----|
| Choice shapes | `"10-ft sphere or 20-ft cube"` | Pick primary shape |
| Descriptive | `"All within earshot"` | Add numeric radius estimate |
| Volume-only | `"100 cubic feet, any shape"` | Change to standard shape |
| Moving area | `"Follows the caster"` | Use Point/Personal area |

### Forcing Re-Parse After Fixes

After editing spell text to fix parse issues:

1. **Via UI**: Save the spell - parsing re-runs automatically
2. **Via CLI**: Run the recompute command:
   ```powershell
   .\spellbook-desktop.exe --recompute-hashes
   ```
3. **Verify**: Check the log for the previously failing spell ID

### Export Parsing Summary

To generate a summary of all parse issues for review:

```powershell
.\spellbook-desktop.exe --export-migration-report
```

This creates `migration_report_<timestamp>.json` with all log entries in JSON format, useful for bulk analysis or support requests.

### Example Debugging Workflow

```powershell
# 1. Check recent log entries
Get-Content "$env:APPDATA\SpellbookVault\migration.log" | Select-Object -Last 50

# 2. Find specific spell failures
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Spell 142:"

# 3. After fixing the spell text in the UI, re-run migration
.\spellbook-desktop.exe --recompute-hashes

# 4. Verify the fix
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Spell 142:" | Select-Object -Last 1
# Should show "Updated hash for spell ID 142" instead of "Failed to parse"
```



### 3. Search Not Finding Spells
- **Cause**: Hash index might be corrupted or incomplete.
- **Fix**: Force re-indexing.
    ```powershell
    .\spellbook-desktop.exe --recompute-hashes
    ```

## Build and Compilation Issues

### 1. Linking Errors (LNK1318, etc.) on Windows
If you encounter `fatal error LNK1318: Unexpected PDB error` or other linker failures while running tests or building the application:
- **Cause**: This often happens on Windows when the compiler's debugging symbols (PDB files) become locked or corrupted during parallel compilation or after significant type renames.
- **Fix**: Run `cargo clean` to wipe the build cache and force a fresh link.
  ```powershell
  # Targeted clean (recommended, faster)
  cargo clean -p spellbook-desktop

  # Full clean (if targeted fails)
  cargo clean
  ```

### 2. PDB errors during `cargo test`
If tests fail with a linker error but `cargo check` passes:
- **Cause**: Linking multiple test binaries is resource-intensive and prone to PDB locks.
- **Fix**: Ensure no other instances are running, or run tests with `--lib` to minimize the number of binaries being linked.
  ```powershell
  cargo test --lib -p spellbook-desktop [module_path]
  ```

## CLI Recovery Tools

The application includes built-in tools to help you recover.

### Integrity Check
Scans the database for spells without hashes or with collisions.
```powershell
.\spellbook-desktop.exe --check-integrity
```

### Export Migration Report
Generates a JSON summary of the migration status suitable for support requests.
```powershell
.\spellbook-desktop.exe --export-migration-report
```

### Restore from Backup
If the database is unusable, you can restore from an automatic backup.

1. **List available backups**:
   ```powershell
   .\spellbook-desktop.exe --list-backups
   ```
2. **Restore specific backup**:
   ```powershell
   .\spellbook-desktop.exe --restore-backup "C:\Users\You\...\spells_backup_123456.db"
   ```
   *Note: This will overwrite your current database.*

3. **Quick rollback to latest backup**:
   ```powershell
   .\spellbook-desktop.exe --rollback-migration
   ```
   *Note: Automatically restores the most recent backup without requiring a file path.*

### Manual Rollback (SQL)
If CLI tools fail, you can manually reset the migration state (hashed columns) to force a retry on next boot.
*Requires an SQLite client.*

```sql
-- Reset all logs
UPDATE spell SET content_hash = NULL, canonical_data = NULL;

-- Verify
SELECT count(*) FROM spell WHERE content_hash IS NULL;
-- Should equal total spell count
```
Then restart the application.
