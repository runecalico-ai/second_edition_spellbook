# Troubleshooting Spell Data Migration

This guide provides solutions for common issues encountered during the migration to the Second Edition Spellbook structured data format.

## Backend Runtime Logging (Tauri/Rust)

For backend runtime and command debugging, the app uses structured logging via `tracing` (not ad-hoc `println!`/`eprintln!`).

- Logging is initialized in `apps/desktop/src-tauri/src/lib.rs` and `apps/desktop/src-tauri/src/main.rs`.
- `tracing-subscriber` reads `RUST_LOG` via env filter and defaults to `info` when unset.
- Use `RUST_LOG` locally for focused debugging:
   - PowerShell: `$env:RUST_LOG="info,spellbook_desktop=debug"`
   - bash/zsh: `RUST_LOG=info,spellbook_desktop=debug`
- Scope note: migration/recovery/report CLI workflows intentionally keep writing to `migration.log` and/or stdout/stderr for operator-facing output.

## Common Issues

### 1. "Migration Failed" or Application Crash on Start
If the application fails to start during the migration phase:
- **Check `migration.log`**: Locate this file in your data directory (e.g., `%APPDATA%\SpellbookVault\migration.log`, see [Migration Log Location](#migration-log-location)). The hash backfill runs on every start. When it finds spells without a hash, it writes its progress, summary, and errors there.
- **Capture the startup output**: The installed Windows app has no console. Its stdout and stderr are lost, and a failed start closes with no message. Start it from PowerShell with the output redirected:
    ```powershell
    $p = Start-Process -FilePath "$env:LOCALAPPDATA\Spellbook\spellbook-desktop.exe" -RedirectStandardOutput out.txt -RedirectStandardError err.txt -Wait -PassThru
    $p.ExitCode   # 101 if the app panicked during startup
    ```
    If the app starts, PowerShell waits until you close it. Startup errors are in `err.txt`, for example `Failed to setup app: error encountered during setup hook: Database error: file is not a database`. Log lines are in `out.txt`. See [CLI Recovery Tools](#cli-recovery-tools) for more about the installed exe. Development builds are console programs and show this output in the terminal.
- **Look for constraint violations**: If `migration.log` or `err.txt` shows a message like "Hash collision: two or more spells produced the same content_hash. Migration aborted. See migration.log. Fix duplicates or run --detect-collisions.", you have duplicate content hashes.
    - **Fix**: Run `--detect-collisions` (see [CLI Recovery Tools](#cli-recovery-tools)) to list duplicate groups. The tool reports "Duplicate content (same spell data)" when spells are identical (safe to deduplicate) or "True hash collision (different content, same hash)" when content differs (requires manual resolution). Resolve duplicates (e.g. delete or merge via SQL or the UI), then restart.

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
2. **Original text preserved** in the spec's `raw_legacy_value` field (and in `notes`, `text`, or `condition` where applicable)
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
2. **Via CLI**: Run the recompute command (see [CLI Recovery Tools](#cli-recovery-tools)):
   ```powershell
   Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--recompute-hashes' -NoNewWindow -Wait
   ```
3. **Verify**: Check the log for the previously failing spell ID

### Export Parsing Summary

To generate a summary of all parse issues for review:

```powershell
Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--export-migration-report' -NoNewWindow -Wait
```

This creates `migration_report_<timestamp>.json` with all log entries in JSON format, useful for bulk analysis or support requests.

### Example Debugging Workflow

```powershell
# 1. Check recent log entries
Get-Content "$env:APPDATA\SpellbookVault\migration.log" | Select-Object -Last 50

# 2. Find specific spell failures
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Spell 142:"

# 3. After fixing the spell text in the UI, re-run migration.
#    -Wait makes PowerShell wait until the log is written.
Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--recompute-hashes' -NoNewWindow -Wait

# 4. Verify the fix
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Spell 142:" | Select-Object -Last 1
# Should show "Updated hash for spell ID 142" instead of "Failed to parse"
```



### 3. Search Not Finding Spells
- **Cause**: Hash index might be corrupted or incomplete.
- **Fix**: Force re-indexing.
    ```powershell
    Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--recompute-hashes' -NoNewWindow -Wait
    ```

### 4. "Command plugin:… not allowed by ACL"
- **Cause**: The frontend called a core or plugin API that `apps/desktop/src-tauri/capabilities/default.json` does not grant. App commands are not affected, so most screens still work.
- **Fix**: Grant the narrowest permission for that command, add it to `EXPECTED_PERMISSIONS` in `src/capability_tests.rs`, run `cargo build` and `cargo test capability`. See `apps/desktop/src-tauri/AGENTS.md` ("Webview permissions").

### 5. "semantic search requires sqlite-vec; spell_vec is blob-backed in this database"
- **Cause**: The vault database was created before `vec0` loaded, so `spell_vec` is a plain table.
- **Fix**: Make sure `vec0.dll` / `vec0.so` is in the vault (`SpellbookVault/`) and restart the app. Startup rebuilds `spell_vec` as a vec0 table and the embeddings backfill re-embeds all spells. Look for `sqlite-vec: rebuilt blob-backed spell_vec as vec0` in the log.

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

On an installed Windows build, run the tools from the install folder (default `%LOCALAPPDATA%\Spellbook`). The installed exe is a windowed program, so PowerShell does not wait for it. The prompt comes back before the output, `$LASTEXITCODE` is not set, and `> file` captures nothing. Start the tools with `Start-Process -NoNewWindow -Wait`:

```powershell
$p = Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--list-backups' -NoNewWindow -Wait -PassThru
$p.ExitCode   # 0 on success
```

- To save the output, add `-RedirectStandardOutput out.txt -RedirectStandardError err.txt`. Some problems are reported on stderr, so check both files.
- Put a path that contains spaces in double quotes inside the single quotes, for example `-ArgumentList '--restore-backup', '"C:\My Backups\spells_backup_20261105_120000.db"'`.
- In cmd.exe, a batch file or `cmd /c` waits for the tool, and `> report.txt 2>&1` works. At an interactive cmd prompt, use `start "" /wait /b spellbook-desktop.exe --list-backups`.

Development builds (`pnpm tauri:dev`, `cargo run`, `pnpm tauri:build --debug`) are console programs, so the shell waits for them.

### Integrity Check
Scans the database for spells without hashes or with collisions.
```powershell
Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--check-integrity' -NoNewWindow -Wait
```

### Detect Collisions
Lists groups of spells that share a `content_hash`.
```powershell
Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--detect-collisions' -NoNewWindow -Wait
```

### Export Migration Report
Generates a JSON summary of the migration status suitable for support requests.
```powershell
Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--export-migration-report' -NoNewWindow -Wait
```

### Restore from Backup
If the database is unusable, you can restore from an automatic backup.

1. **List available backups**:
   ```powershell
   Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--list-backups' -NoNewWindow -Wait
   ```
2. **Restore specific backup**:
   ```powershell
   Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--restore-backup', '"C:\Users\You\...\spells_backup_123456.db"' -NoNewWindow -Wait
   ```
   *Note: This will overwrite your current database. After copying the backup, the app runs `PRAGMA integrity_check` on the restored DB; if the result is not "ok", the restore fails and an error is reported.*

3. **Quick rollback to latest backup**:
   ```powershell
   Start-Process -FilePath .\spellbook-desktop.exe -ArgumentList '--rollback-migration' -NoNewWindow -Wait
   ```
   *Note: Automatically restores the most recent backup without requiring a file path.*

   **Vault and backup/restore:** Backups include the database plus the vault spell files (`spells/` directory) and `vault-settings.json`. They do **not** include `{SpellbookVault}/models/` (TinyLlama GGUF and MiniLM embedding files). When you restore a backup, the app restores the DB, then the `spells/` files and settings, then runs a vault integrity check. Existing model files on that machine are left in place. You do not need to rebuild vault spell files from the DB after restore; they are restored directly from the archive. On a new machine you must provision models again (Chat download / Add Local Model, or Library semantic install actions).

### Vault Maintenance and Integrity

- **Optimize Vault (GC):** Removes spell files from `spells/` that are no longer referenced by any spell in the database (e.g. after deleting spells or replacing them with new versions). The button is disabled while an import is in progress. An integrity check runs before GC; if it reports issues, resolve or acknowledge them before running Optimize Vault.
- **Deleting a spell:** Also removes that spell's file from `spells/` when no other spell, artifact, or character entry uses the same content hash. If an import or Optimize Vault is running at that moment, the file stays until the next GC.
- **Unrecoverable spell files:** If the integrity check finds a spell row whose vault file is missing and the row has no `canonical_data` (or it is NULL), that spell cannot be re-exported to the vault. The app reports these as "unrecoverable" in the integrity summary (e.g. in the Vault Maintenance dialog or startup warning). You can keep the row and re-add content via edit/import, or remove the spell from the library.
- **Windows path length:** If the full path to a vault file would exceed 260 characters, the app logs a warning. Use a shorter vault base path (e.g. a data directory closer to the drive root) to avoid hitting the limit.

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
