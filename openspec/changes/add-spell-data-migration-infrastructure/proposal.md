# Add Spell Data Migration Infrastructure

## Why
With the new canonical hashing system (Spec #1), we need a robust way to migrate thousands of existing legacy spells. Legacy data is often messy, string-based, and unstructured (e.g., "10 yards + 5/level"). Simply adding a hash column isn't enough; we need to parse and structure this data safely without data loss.

Migration carries significant risk: incomplete parsing, data corruption, or application downtime. We need a safety net.

## What Changes
Implement a comprehensive data migration infrastructure:
1.  **Intelligent Parsing**: Convert legacy string fields (range, duration, etc.) into structured JSON using regex patterns and heuristics.
2.  **Safety First**: Implement rollback capabilities, automatic backups, and transaction wrapping.
3.  **Non-destructive Migration**: Use "Expand and Contract" pattern (add `canonical_data` column alongside legacy columns) to allow safe parallel development and phased rollout.
4.  **Observability**: Detailed logging and admin tools to monitor and debug the migration process.
5.  **Admin Tools**: CLI commands to manage hashes, check integrity, and manually restore backups.

## Scope
### In Scope
-   String-to-structured parsers for spell fields (`parser-specification.md`)
-   Migration script implementation
-   Database schema updates for `content_hash`
-   Hash backfill logic
-   Rollback and recovery strategy (automatic backups, restore CLI)
-   Admin CLI tools (`--recompute-hashes`, `--check-integrity`)
-   Logging infrastructure
-   Migration documentation

### Out of Scope
-   Schema definition (handled in Spec #1)
-   UI components (handled in Spec #3)
-   Import/Export (handled in Spec #5)

## Dependencies
-   **Spec #1: `add-spell-canonical-hashing-foundation`**
    - Migration requires the `CanonicalSpell` struct and `compute_hash()` logic.
    - Parsers produce data conforming to `spell.schema.json`.
