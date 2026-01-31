# Tasks: Spell Data Migration Infrastructure

## Data Migration Strategy
- [x] Create string-to-structured field parser:
    - [x] Parse range patterns (e.g., "10 yards", "10 + 5/level", "Touch", "Unlimited").
    - [x] Parse duration patterns (e.g., "1 round/level", "Permanent", "Instantaneous").
    - [x] Parse casting_time patterns (e.g., "1 action", "1 round", "10 minutes").
    - [x] Parse area patterns (e.g., "20-foot radius", "30-foot cone").
    - [x] Parse components patterns (e.g., "V, S, M" → {verbal: true, somatic: true, material: true}).
    - [x] Parse damage patterns (e.g., "1d6/level (max 10d6)" → {per_level_dice: "1d6", cap_level: 10}).
- [x] Fallback handling for unparseable strings:
    - [x] If parsing fails, store original string in `.text` field.
    - [x] Use safe defaults for structured fields (base_value: 0, unit: "Special").
    - [x] Log parsing failure with spell ID and field name.
- [x] Create migration script:
    - [x] Iterate over all spells in database.
    - [x] Apply parsers to string fields.
    - [x] Convert to structured format.
    - [x] Update spell records with structured data.
    - [x] Log migration progress (every 100 spells).
    - [x] Report final statistics (success rate, fallback count).

## Database (Expand & Contract Strategy)
- [x] **Step 1: Expand Schema**:
    - [x] `ALTER TABLE spells ADD COLUMN canonical_data TEXT;` (JSON blob)
    - [x] `ALTER TABLE spells ADD COLUMN content_hash TEXT;`
    - [x] `CREATE UNIQUE INDEX idx_spells_content_hash ON spells(content_hash) WHERE content_hash IS NOT NULL;`
- [x] **Step 2: Dual-Write / Sync Logic**:
    - [x] Implement backend trigger/hook:
        - [x] When `canonical_data` is updated -> Auto-update legacy columns (range, duration, etc.) for search compatibility.
        - [x] When legacy columns updated -> Invalidate `canonical_data` (or re-parse if feasible).
- [x] **Step 3: Hash Backfill**:
    - [x] On application startup, find all spells where `content_hash IS NULL`.
    - [x] Parse legacy columns -> Create `CanonicalSpell` -> Compute Hash.
    - [x] Store in `canonical_data` and `content_hash`.
    - [x] Handle constraint violations (log hash collision, fail gracefully).

## Rollback & Recovery Strategy
- [x] Implement migration safety measures:
    - [x] Create automatic database backup before migration:
        - [x] Backup file: `spells_backup_{timestamp}.db`.
        - [x] Store in user data directory.
        - [x] Verify backup integrity (file size, read test).
    - [x] Wrap migration in transaction (if SQLite supports for DDL):
        - [x] Use `BEGIN TRANSACTION` before migration.
        - [x] `COMMIT` on success, `ROLLBACK` on failure.
    - [x] Log migration state:
        - [x] Log pre-migration stats (spell count, hash count).
        - [x] Log each migration step with timestamp.
        - [x] Log post-migration stats.
- [x] Provide rollback functionality:
    - [ ] Add `--rollback-migration` CLI flag:
        - [ ] Restore from latest backup.
        - [ ] Verify restored database integrity.
        - [ ] Re-run hash computation if needed.
    - [ ] Add `--list-backups` CLI flag to show available backups.
    - [ ] Add `--restore-backup <file>` CLI flag for manual restore.
- [x] Document recovery procedures:
    - [x] Create TROUBLESHOOTING.md with recovery steps.
    - [x] Document common migration failure scenarios.
    - [x] Provide manual SQL recovery commands (if needed).

## Admin & Debug Tools
- [x] Create admin CLI commands:
    - [x] `--recompute-hashes`:
        - [x] Recompute content_hash for all spells.
        - [x] Compare to existing hash, log differences.
        - [x] Update database with new hashes.
        - [x] Report: "Recomputed 1,234 hashes, 5 changed".
    - [x] `--check-integrity`:
        - [x] Find spells with NULL content_hash.
        - [x] Find characters/lists referencing non-existent hashes.
        - [x] Detect hash collisions (same hash, different content).
        - [x] Report all issues found.
    - [x] `--export-migration-report`:
        - [x] Export detailed migration log as JSON.
        - [x] Include: timestamp, spell count, parse success/failure breakdown.
        - [x] Save to user data directory.
    - [x] `--detect-collisions`:
        - [x] Find duplicate content_hash values.
        - [x] Verify they represent identical content.
        - [x] Report any true collisions (should never happen).
- [x] Add logging infrastructure:
    - [x] Create `migration.log` file in user data directory.
    - [x] Log all migration steps with timestamps.
    - [x] Log all parsing failures with spell ID and field name.
    - [x] Rotate logs after 10MB or 30 days.

## Documentation
- [x] User documentation:
    - [x] Create migration guide for users:
        - [x] Explain what happens to existing spells during upgrade.
        - [x] Document automatic vs. manual migration scenarios.
        - [x] Provide troubleshooting for failed migrations.
        - [x] Explain backup/restore procedures.
- [x] Developer documentation:
    - [x] Document parser API with examples:
        - [x] Using `parse_components()`.
        - [x] Using `parse_range()`, `parse_duration()`, etc.
        - [x] Handling parsing failures.
    - [x] Create migration script documentation:
        - [x] How to run migration manually.
        - [x] Command-line flags and options.
        - [x] Interpreting migration reports.
