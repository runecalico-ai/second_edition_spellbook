# Tasks: Canonical Hashing Foundation

## Specification
- [x] Define JSON Schema (`spell.schema.json`).
- [x] Define Serialization Contract (`canonical-serialization.md`).
- [x] Integrate `AreaSpec` into schema (`spell.schema.json`).
- [x] Integrate `RangeSpec` into schema (`spell.schema.json`).
- [x] Integrate `DurationSpec` into schema (`spell.schema.json`).
- [x] Integrate `ExperienceComponentSpec` into schema.
- [x] Integrate `SpellDamageSpec` into schema.
- [x] Integrate `MagicResistanceSpec` into schema.
- [x] Integrate `SavingThrowSpec` into schema.
- [x] Integrate `MaterialComponentSpec` into schema.

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
    - [x] Test tradition BOTH requires both school and sphere.
    - [x] Test nested object defaults in `range`, `casting_time`, and `duration`.

### Area Parsing & Validation (Spec V2)
- [x] Implement strict `AreaSpec` parsing:
    - [x] Map natural language areas to discriminators (cone, line, radius, etc.).
    - [x] Extract scalar values (radius, length, width) with unit normalization.
    - [x] Support complex scaling (per creature, per level).
- [x] Implement AreaSpec validation tests.

### Range Parsing & Validation (Spec V2)
- [x] Implement strict `RangeSpec` parsing:
    - [x] Map natural language ranges to discriminators (touch, distance, personal, etc.).
    - [x] Extract scalar values with unit normalization.
    - [x] Support structured scaling (fixed, per_level).
- [x] Implement RangeSpec validation tests.

### Duration Parsing & Validation (Spec V2)
- [x] Implement strict `DurationSpec` parsing:
    - [x] Map natural language durations to discriminators (time, instant, permanent, etc.).
    - [x] Extract scalar values with unit normalization.
    - [x] Support structure scaling (fixed, per_level).
- [x] Implement DurationSpec validation tests.
- [x] Implement Advanced Specs Parsing:
    - [x] `ExperienceComponentSpec`: Parse XP costs and mechanics.
    - [x] `SpellDamageSpec`: Parse multi-part damage with scaling/caps.
    - [x] `MagicResistanceSpec`: Parse SR/MR interaction details.
    - [x] `SavingThrowSpec`: Parse structured saving throw conditions.
    - [x] `MaterialComponentSpec`: Parse structured material costs.
- [x] Implement Advanced Spec validation tests.
    - [x] Basic tests exist in mechanics.rs and components.rs
    - [x] Comprehensive material component tests added
    - [x] Multi-part damage parsing test added
    - [x] Saving throw and magic resistance tests exist

### Hash Computation
- [x] Implement SHA-256 hashing:
    - [x] Serialize canonical JSON (RFC 8785 deterministic).
    - [x] Compute SHA-256 hash.
    - [x] Return 64-character hex string.
- [x] Add hash computation unit tests:
    - [x] Test identical content produces identical hash.
    - [x] Test field order independence.
    - [x] Test metadata exclusion.
    - [x] Test array normalization (sorting).
    - [x] Test number normalization (float vs integer representation).
    - [x] Test string normalization (line endings, trimming).
    - [x] Test null value omission for all nullable fields.
- [x] Audit existing implementation against new strict normalization rules (Number/String).
- [x] Verify `cap_level` nullable handling (omission when null).
- [x] Verify `schema_version` exclusion from content hash.
- [x] Implement Unicode **NFC** normalization for all string fields.
- [x] Implement array **deduplication** for unordered sets.
- [x] Enforce **6-decimal precision** for floating point numbers.
- [x] Implement **RFC 8785 (JCS)** physical serialization logic.
- [x] Implement **Enum normalization** (exact casing from schema).
- [x] Implement **Empty array `[]` inclusion** in canonical JSON.
- [x] Implement **Whitespace collapsing** for short text fields.
- [x] Implement schema version compatibility check (Accept/Warn/Reject logic).

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
