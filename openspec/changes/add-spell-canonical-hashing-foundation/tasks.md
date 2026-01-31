# Tasks: Canonical Hashing Foundation

## Specification
- [x] Define JSON Schema (`spell.schema.json`).
- [x] Define Serialization Contract (`canonical-serialization.md`).

## Backend Implementation
### Schema Validation
- [x] Implement `CanonicalSpell` struct matching schema.
- [x] Add `jsonschema` crate dependency (v0.17+).
- [x] Implement schema validation function:
    - [x] Load `spell.schema.json` at compile time.
    - [x] Validate `CanonicalSpell` against schema.
    - [x] Return validation errors with field paths.
- [x] Add schema validation unit tests:
    - [x] Test valid spell passes.
    - [x] Test invalid tradition rejected.
    - [x] Test Arcane without school rejected.
    - [x] Test Divine without sphere rejected.

### Hash Computation
- [x] Implement SHA-256 hashing:
    - [x] Serialize canonical JSON (RFC 8785 deterministic).
    - [x] Compute SHA-256 hash.
    - [x] Return 64-character hex string.
- [x] Add hash computation unit tests:
    - [x] Test identical content produces identical hash.
    - [x] Test field order independence.
    - [x] Test metadata exclusion.
    - [x] Test array normalization.

## Database
- [x] Add `schema_version` column to spell table (INTEGER, default 1).
- [x] Create index on schema_version (optional).
- [x] Add schema version to migration script.

## Documentation
- [x] Developer documentation:
    - [x] Write API guide for `CanonicalSpell`:
        - [x] How to create CanonicalSpell from SpellDetail.
        - [x] How to compute hash.
        - [x] How to validate against schema.
    - [x] Update architecture documentation:
        - [x] Add canonical hashing section to ARCHITECTURE.md.
        - [x] Document hash computation flow diagram.
        - [x] Explain metadata vs. content fields.

## Schema Versioning
- [x] Add schema version tracking:
    - [x] Store current schema version in `spell.schema.json` metadata.
    - [x] Include `schema_version` in exported JSON.
    - [x] Validate imported JSON schema version against current version.
- [x] Implement schema migration path:
    - [x] Create migration script for schema v1 → v2 (when needed).
    - [x] Document breaking changes between schema versions.
    - [x] Provide backward compatibility for imports (if feasible).
- [x] Handle schema version mismatches:
    - [x] Warn user when importing from newer schema version.
    - [x] Reject import if schema version incompatible.
    - [x] Log schema version in migration report.

## Security Review
- [x] **Hash collision resistance:**
    - [x] Document SHA-256 collision resistance (2^128 operations).
    - [x] Verify unique constraint enforces collision detection.
