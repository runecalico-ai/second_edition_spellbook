# Tasks: Core Hashing

## Specification
**Spec:** [specs/backend/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-spell-canonical-hashing-core/specs/backend/spec.md)

- [x] Define JSON Schema ([spell.schema.json](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-spell-canonical-hashing-core/resources/spell.schema.json)).
- [x] Define Serialization Contract ([canonical-serialization.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-spell-canonical-hashing-core/resources/canonical-serialization.md)).

## Data Migration Strategy
**Reference:** [parser-specification.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-spell-canonical-hashing-core/resources/parser-specification.md)

- [ ] Create string-to-structured field parser:
    - [ ] Parse range patterns (e.g., "10 yards", "10 + 5/level", "Touch", "Unlimited").
    - [ ] Parse duration patterns (e.g., "1 round/level", "Permanent", "Instantaneous").
    - [ ] Parse casting time patterns (e.g., "3", "1 round", "1 turn").
    - [ ] Parse area patterns (e.g., "20-ft radius", "10 yard cube", "1 creature").
    - [ ] Parse component strings to boolean structure (e.g., "V, S, M" → `{verbal: true, somatic: true, material: true}`).
    - [ ] Parse damage patterns (e.g., "1d6/level (max 10d6)" → `{per_level_dice: "1d6", cap_level: 10}`).
- [ ] Implement fallback handling:
    - [ ] If parsing fails, store original string in `.text` field only.
    - [ ] Set structured fields to schema defaults.
    - [ ] Log unparseable patterns for manual review.
- [ ] Create migration script `migrate_spells_to_structured_data.rs`:
    - [ ] Iterate all existing spells in database.
    - [ ] Apply parser to each string field.
    - [ ] Update spell records with structured data.
    - [ ] Generate migration report (success count, failures, patterns needing review).
- [ ] Test migration on sample dataset:
    - [ ] Select 100+ representative spells from different sources.
    - [ ] Run migration, verify structured data correctness.
    - [ ] Manually verify edge cases (complex formulas, unusual units).

## Backend Implementation
- [ ] Add crate dependencies to `Cargo.toml`:
    - [ ] `serde_json = "1.0"` (JSON serialization).
    - [ ] `sha2 = "0.10"` (SHA-256 hashing).
    - [ ] `jsonschema = "0.17"` (schema validation).
- [ ] Implement `CanonicalSpell` Rust struct matching the Schema.
- [ ] Implement `From<SpellDetail>` for `CanonicalSpell` ("Snapshot" step).
- [ ] Implement `compute_hash` logic:
    - [ ] Convert to canonical JSON (sorted keys, no whitespace).
    - [ ] Compute SHA-256 hash.
    - [ ] Return lowercase hex string.
- [ ] Add schema validation:
    - [ ] Load `spell.schema.json` at startup.
    - [ ] Validate `CanonicalSpell` against schema before hashing.
    - [ ] Return structured validation errors (field path, constraint violated).
- [ ] Add unit tests:
    - [ ] Test hashing consistency (identical content → identical hash).
    - [ ] Test key ordering independence (different order → same hash).
    - [ ] Test array normalization (sorted arrays → same hash).
    - [ ] Test null/default handling (omitted vs. default value).
    - [ ] Test validation rejection (invalid schema data).

## Database
- [ ] Create migration `add_spell_hash_column`:
    - [ ] `ALTER TABLE spells ADD COLUMN content_hash TEXT;`
    - [ ] `CREATE UNIQUE INDEX idx_spells_content_hash ON spells(content_hash) WHERE content_hash IS NOT NULL;`
- [ ] Implement hash backfill logic:
    - [ ] On application startup, find all spells where `content_hash IS NULL`.
    - [ ] Compute and update `content_hash` for each spell.
    - [ ] Handle constraint violations (log hash collision, fail gracefully).
    - [ ] Optional: Add `--migrate-hashes` CLI flag for explicit migration.

## Documentation
- [ ] User documentation:
    - [ ] Create migration guide for users:
        - [ ] Explain what happens to existing spells during upgrade.
        - [ ] Document automatic vs. manual migration scenarios.
        - [ ] Provide troubleshooting for failed migrations.
        - [ ] Explain backup/restore procedures.
    - [ ] Update FAQ with content hash questions:
        - [ ] "What is a content hash?"
        - [ ] "Why did my spell's hash change?"
        - [ ] "How do I know if two spells are identical?"
- [ ] Developer documentation:
    - [ ] Write API guide for `CanonicalSpell`:
        - [ ] How to create CanonicalSpell from SpellDetail.
        - [ ] How to compute hash.
        - [ ] How to validate against schema.
    - [ ] Document parser API with examples:
        - [ ] Using `parse_components()`.
        - [ ] Using `parse_range()`, `parse_duration()`, etc.
        - [ ] Handling parsing failures.
    - [ ] Create migration script documentation:
        - [ ] How to run migration manually.
        - [ ] Command-line flags and options.
        - [ ] Interpreting migration reports.
    - [ ] Update architecture documentation:
        - [ ] Add canonical hashing section to ARCHITECTURE.md.
        - [ ] Document hash computation flow diagram.
        - [ ] Explain metadata vs. content fields.

## Schema Versioning
- [ ] Add schema version tracking:
    - [ ] Add `schema_version` column to database (INTEGER, default 1).
    - [ ] Store current schema version in `spell.schema.json` metadata.
    - [ ] Include `schema_version` in exported JSON.
    - [ ] Validate imported JSON schema version against current version.
- [ ] Implement schema migration path:
    - [ ] Create migration script for schema v1 → v2 (when needed).
    - [ ] Document breaking changes between schema versions.
    - [ ] Provide backward compatibility for imports (if feasible).
- [ ] Handle schema version mismatches:
    - [ ] Warn user when importing from newer schema version.
    - [ ] Reject import if schema version incompatible.
    - [ ] Log schema version in migration report.

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

## Security Review
- [ ] Conduct security review of core functionality:
    - [ ] **Hash collision resistance:**
        - [ ] Document SHA-256 collision resistance (2^128 operations).
        - [ ] Verify unique constraint enforces collision detection.
    - [ ] **SQL injection prevention:**
        - [ ] Audit all database queries use parameterized statements.
        - [ ] Review FTS query construction (no string concatenation).
        - [ ] Test with malicious inputs (e.g., `'; DROP TABLE spells;--`).
    - [ ] **Input validation:**
        - [ ] Validate all fields against schema before insertion.
        - [ ] Reject spells with excessively long fields (DoS prevention).
        - [ ] Sanitize spell descriptions/names before display (XSS prevention).
    - [ ] **Import validation:**
        - [ ] Validate imported JSON structure before processing.
        - [ ] Reject imports with suspicious file sizes (> 100MB).
        - [ ] Limit import batch size (e.g., max 10,000 spells).
- [ ] Add security tests:
    - [ ] Test: Malicious spell name with SQL injection attempt.
    - [ ] Test: Spell description with XSS payload (`<script>alert('XSS')</script>`).
    - [ ] Test: Import bundle with invalid schema (nested 1000 levels deep).
    - [ ] Test: Import with 100MB+ file (memory exhaustion attempt).

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

