# architecture Specification

## MODIFIED Requirements

### Requirement: SQLite Data Storage
The application SHALL store all application data in a local SQLite database. The `spell` table SHALL include a `canonical_data` column (JSON) to store structured, validated spell data produced by the migration or editor systems. This column SHALL coexist with legacy string-based columns to facilitate non-destructive "Expand and Contract" migration.

#### ADDED Scenario: Canonical Data Storage
- **WHEN** a spell is migrated or updated with the new hashing system
- **THEN** its structured representation SHALL be stored in the `canonical_data` JSON column
- **AND** the legacy columns SHALL remain intact during the "Expand" phase

## ADDED Requirements

### Requirement: Migration CLI Tools
The system SHALL provide administrative CLI tools to manage the lifecycle of spell data hashes and migration states.

#### Scenario: Recomputing Hashes
- **WHEN** the user runs `spellbook-desktop --recompute-hashes`
- **THEN** the system SHALL re-calculate hashes for all spells in the `library` and update the `content_hash` column
- **AND** SHALL report to stderr and migration.log in the form "Recomputed N hashes, M updated." (total count N, changed count M)

#### Scenario: Integrity Check
- **WHEN** the user runs `spellbook-desktop --check-integrity`
- **THEN** the system SHALL verify that the `content_hash` matches the current `canonical_data` for every spell (by recomputing the hash from `canonical_data` and comparing to the stored `content_hash`)
- **AND** report any mismatches, NULL hashes, orphan references, or duplicate hashes

#### Scenario: Hash Backfill Progress and Report
- **WHEN** the hash backfill runs (e.g. on startup for spells with NULL `content_hash`)
- **THEN** the system SHALL log progress every 100 spells (e.g. "Migrating spell 100 of 1000...")
- **AND** SHALL write a final summary to stderr and migration.log: processed count, updated count, parse fallback count, hash failure count, and success/fallback percentages

#### Scenario: Hash Collision Handling
- **WHEN** the backfill transaction fails due to a UNIQUE constraint on `content_hash`
- **THEN** the system SHALL log a clear message to migration.log and stderr: that two or more spells produced the same content_hash, migration aborted, and to fix duplicates or run `--detect-collisions`
- **AND** SHALL fail gracefully (application may still start; CLI reports the error)

#### Scenario: Restore Backup Integrity
- **WHEN** the user runs `spellbook-desktop --restore-backup <path>` (or equivalent) and the restore copy completes
- **THEN** the system SHALL run `PRAGMA integrity_check` on the restored database connection
- **AND** SHALL return an error and report the result if the result is not "ok"

#### Scenario: Detect Collisions Content Comparison
- **WHEN** the user runs `spellbook-desktop --detect-collisions` and duplicate `content_hash` values exist
- **THEN** the system SHALL for each duplicate group compare `canonical_data` of all spells sharing that hash
- **AND** SHALL report "Duplicate content (same spell data)" when all are identical, or "True hash collision (different content, same hash)" when content differs
