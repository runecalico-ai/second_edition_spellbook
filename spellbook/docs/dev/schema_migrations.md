# Schema Migrations

## Migration Script Template: v1 → v2
This template documents the expected workflow for the first schema migration. A starter script is available at `spellbook/scripts/schema_migrations/v1_to_v2.py`. When a v2 schema is introduced, update the script to:

1. Loads the v1 JSON payload.
2. Applies field-level transformations defined in the v2 delta spec.
3. Writes `schema_version = 2` into the migrated output.
4. Emits a migration report (see below). The starter script writes a JSON report to stderr.

_No v1 → v2 migration is required today; the current script performs a minimal version bump to establish the migration entry point._

## Breaking Changes Log
| Version | Breaking Change | Migration Step |
|--------:|-----------------|----------------|
| 1 → 2   | _TBD_           | _TBD_          |

Update this table whenever a schema version introduces non-backward-compatible changes.

## Backward Compatibility for Imports
When feasible, accept older schema versions by:
- Running the appropriate migration script before validation.
- Logging the original and new schema versions.
- Preserving original source artifacts for auditability.

## Migration Report Logging
Migration reports should include:
- Original schema version.
- Target schema version.
- Record counts (input/output).
- Any field-level transformation warnings.
