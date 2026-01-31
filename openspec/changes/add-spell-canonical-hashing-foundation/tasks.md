# Tasks: Canonical Hashing Foundation

## Specification
- [ ] Define JSON Schema (`spell.schema.json`).
- [ ] Define Serialization Contract (`canonical-serialization.md`).

## Backend Implementation
### Schema Validation
- [ ] Implement `CanonicalSpell` struct matching schema.
- [ ] Add `jsonschema` crate dependency (v0.17+).
- [ ] Implement schema validation function:
    - [ ] Load `spell.schema.json` at compile time.
    - [ ] Validate `CanonicalSpell` against schema.
    - [ ] Return validation errors with field paths.
- [ ] Add schema validation unit tests:
    - [ ] Test valid spell passes.
    - [ ] Test invalid tradition rejected.
    - [ ] Test Arcane without school rejected.
    - [ ] Test Divine without sphere rejected.

### Hash Computation
- [ ] Implement SHA-256 hashing:
    - [ ] Serialize canonical JSON (RFC 8785 deterministic).
    - [ ] Compute SHA-256 hash.
    - [ ] Return 64-character hex string.
- [ ] Add hash computation unit tests:
    - [ ] Test identical content produces identical hash.
    - [ ] Test field order independence.
    - [ ] Test metadata exclusion.
    - [ ] Test array normalization.

## Database
- [ ] Add `schema_version` column to spells table (INTEGER, default 1).
- [ ] Create index on schema_version (optional).
- [ ] Add schema version to migration script.

## Documentation
- [ ] Developer documentation:
    - [ ] Write API guide for `CanonicalSpell`:
        - [ ] How to create CanonicalSpell from SpellDetail.
        - [ ] How to compute hash.
        - [ ] How to validate against schema.
    - [ ] Update architecture documentation:
        - [ ] Add canonical hashing section to ARCHITECTURE.md.
        - [ ] Document hash computation flow diagram.
        - [ ] Explain metadata vs. content fields.

## Schema Versioning
- [ ] Add schema version tracking:
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

## Security Review
- [ ] **Hash collision resistance:**
    - [ ] Document SHA-256 collision resistance (2^128 operations).
    - [ ] Verify unique constraint enforces collision detection.
