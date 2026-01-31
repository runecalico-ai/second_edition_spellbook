# Tasks: Spell Data Migration Infrastructure

## Data Migration Strategy
- [ ] Create string-to-structured field parser:
    - [ ] Parse range patterns (e.g., "10 yards", "10 + 5/level", "Touch", "Unlimited").
    - [ ] Parse duration patterns (e.g., "1 round/level", "Permanent", "Instantaneous").
    - [ ] Parse casting_time patterns (e.g., "1 action", "1 round", "10 minutes").
    - [ ] Parse area patterns (e.g., "20-foot radius", "30-foot cone").
    - [ ] Parse components patterns (e.g., "V, S, M" → {verbal: true, somatic: true, material: true}).
    - [ ] Parse damage patterns (e.g., "1d6/level (max 10d6)" → {per_level_dice: "1d6", cap_level: 10}).
- [ ] Fallback handling for unparseable strings:
    - [ ] If parsing fails, store original string in `.text` field.
    - [ ] Use safe defaults for structured fields (base_value: 0, unit: "Special").
    - [ ] Log parsing failure with spell ID and field name.
- [ ] Create migration script:
    - [ ] Iterate over all spells in database.
    - [ ] Apply parsers to string fields.
    - [ ] Convert to structured format.
    - [ ] Update spell records with structured data.
    - [ ] Log migration progress (every 100 spells).
    - [ ] Report final statistics (success rate, fallback count).

## Database (Expand & Contract Strategy)
- [ ] **Step 1: Expand Schema**:
    - [ ] `ALTER TABLE spells ADD COLUMN canonical_data TEXT;` (JSON blob)
    - [ ] `ALTER TABLE spells ADD COLUMN content_hash TEXT;`
    - [ ] `CREATE UNIQUE INDEX idx_spells_content_hash ON spells(content_hash) WHERE content_hash IS NOT NULL;`
- [ ] **Step 2: Dual-Write / Sync Logic**:
    - [ ] Implement backend trigger/hook:
        - [ ] When `canonical_data` is updated -> Auto-update legacy columns (range, duration, etc.) for search compatibility.
        - [ ] When legacy columns updated -> Invalidate `canonical_data` (or re-parse if feasible).
- [ ] **Step 3: Hash Backfill**:
    - [ ] On application startup, find all spells where `content_hash IS NULL`.
    - [ ] Parse legacy columns -> Create `CanonicalSpell` -> Compute Hash.
    - [ ] Store in `canonical_data` and `content_hash`.
    - [ ] Handle constraint violations (log hash collision, fail gracefully).

## Rollback & Recovery Strategy
- [ ] Implement migration safety measures:
    - [ ] Create automatic database backup before migration:
        - [ ] Backup file: `spells_backup_{timestamp}.db`.
        - [ ] Store in user data directory.
        - [ ] Verify backup integrity (file size, read test).
    - [ ] Wrap migration in transaction (if SQLite supports for DDL):
        - [ ] Use `BEGIN TRANSACTION` before migration.
        - [ ] `COMMIT` on success, `ROLLBACK` on failure.
    - [ ] Log migration state:
        - [ ] Log pre-migration stats (spell count, hash count).
        - [ ] Log each migration step with timestamp.
        - [ ] Log post-migration stats.
- [ ] Provide rollback functionality:
    - [ ] Add `--rollback-migration` CLI flag:
        - [ ] Restore from latest backup.
        - [ ] Verify restored database integrity.
        - [ ] Re-run hash computation if needed.
    - [ ] Add `--list-backups` CLI flag to show available backups.
    - [ ] Add `--restore-backup <file>` CLI flag for manual restore.
- [ ] Document recovery procedures:
    - [ ] Create TROUBLESHOOTING.md with recovery steps.
    - [ ] Document common migration failure scenarios.
    - [ ] Provide manual SQL recovery commands (if needed).

## Admin & Debug Tools
- [ ] Create admin CLI commands:
    - [ ] `--recompute-hashes`:
        - [ ] Recompute content_hash for all spells.
        - [ ] Compare to existing hash, log differences.
        - [ ] Update database with new hashes.
        - [ ] Report: "Recomputed 1,234 hashes, 5 changed".
    - [ ] `--check-integrity`:
        - [ ] Find spells with NULL content_hash.
        - [ ] Find characters/lists referencing non-existent hashes.
        - [ ] Detect hash collisions (same hash, different content).
        - [ ] Report all issues found.
    - [ ] `--export-migration-report`:
        - [ ] Export detailed migration log as JSON.
        - [ ] Include: timestamp, spell count, parse success/failure breakdown.
        - [ ] Save to user data directory.
    - [ ] `--detect-collisions`:
        - [ ] Find duplicate content_hash values.
        - [ ] Verify they represent identical content.
        - [ ] Report any true collisions (should never happen).
- [ ] Add logging infrastructure:
    - [ ] Create `migration.log` file in user data directory.
    - [ ] Log all migration steps with timestamps.
    - [ ] Log all parsing failures with spell ID and field name.
    - [ ] Rotate logs after 10MB or 30 days.

## Documentation
- [ ] User documentation:
    - [ ] Create migration guide for users:
        - [ ] Explain what happens to existing spells during upgrade.
        - [ ] Document automatic vs. manual migration scenarios.
        - [ ] Provide troubleshooting for failed migrations.
        - [ ] Explain backup/restore procedures.
- [ ] Developer documentation:
    - [ ] Document parser API with examples:
        - [ ] Using `parse_components()`.
        - [ ] Using `parse_range()`, `parse_duration()`, etc.
        - [ ] Handling parsing failures.
    - [ ] Create migration script documentation:
        - [ ] How to run migration manually.
        - [ ] Command-line flags and options.
        - [ ] Interpreting migration reports.
