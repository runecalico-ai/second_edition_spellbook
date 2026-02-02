# Troubleshooting Spell Data Migration

This guide provides solutions for common issues encountered during the migration to the Second Edition Spellbook structured data format.

## Common Issues

### 1. "Migration Failed" or Application Crash on Start
If the application fails to start during the migration phase:
- **Check `migration.log`**: Locate this file in your data directory (e.g., `%APPDATA%\SpellbookVault`). usage
- **Look for constraint violations**: If the log shows `UNIQUE constraint failed: spell.content_hash`, it means you have duplicate spells.
    - **Fix**: Run with `--detect-collisions` to identify duplicates, then manually assume one is correct or delete the duplicate via SQL.

### 2. Missing or Incorrect Parsed Data
If spells look wrong in the new format (e.g. "Range: Special"):
- This often happens if the Parser couldn't match the legacy string logic.
- **Check the log**: Search `migration.log` for "Fallback used".
- **Fix**:
    1. Edit the spell in the UI.
    2. Adjust the text slightly (e.g., "10 yards" instead of "10 yds" if abbreviations weren't caught, though the new parser is robust).
    3. Save to re-trigger parsing.

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
