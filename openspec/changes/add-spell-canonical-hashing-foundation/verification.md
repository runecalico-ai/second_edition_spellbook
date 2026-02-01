# Verification Plan: Canonical Hashing Foundation

## Unit Tests

### Hash Computation
- [x] **Test: Identical content produces identical hash**
  - GIVEN two `CanonicalSpell` objects with identical content but different field order
  - WHEN `compute_hash()` is called on both
  - THEN both hashes MUST be identical

- [x] **Test: Content change produces different hash**
  - GIVEN a spell with description "Boom"
  - WHEN description changes to "Explosion"
  - THEN hash MUST change

- [x] **Test: Invalid spell fails hashing**
  - GIVEN a spell that fails schema validation
  - WHEN `compute_hash()` is called
  - THEN hashing MUST fail with a validation error

- [x] **Test: Metadata change does not affect hash**
  - GIVEN a spell with `source_refs = [Book A]`
  - WHEN `source_refs` changes to `[Book A, Book B]`
  - THEN hash MUST remain unchanged

- [x] **Test: Array normalization**
  - GIVEN spell with `tags = ["Fire", "Damage"]`
  - AND another spell with `tags = ["Damage", "Fire"]`
  - THEN both hashes MUST be identical (arrays sorted)

- [x] **Test: Null value handling**
  - GIVEN spell with `school = null`
  - AND spell with `school` field omitted (if omitted during generation)
  - THEN both canonical representations MUST be identical (serialised as `null` if nullable)

- [x] **Test: Field omission for optional complexes**
  - GIVEN spell with `range = null` (Rust `None`)
  - WHEN serialised to canonical JSON
  - THEN the `range` key MUST be completely omitted (to comply with `additionalProperties: false`)

- [x] **Test: Default value inclusion (Integer booleans)**
  - GIVEN spell with `is_cantrip = 0` (false)
  - THEN canonical JSON MUST include `"is_cantrip": 0`

### Schema Validation
- [x] **Test: Valid spell passes validation**
  - GIVEN a spell conforming to `spell.schema.json`
  - WHEN validated
  - THEN validation MUST succeed

- [x] **Test: Invalid tradition rejected**
  - GIVEN spell with `tradition = "PSIONIC"`
  - WHEN validated
  - THEN validation MUST fail with error on `tradition` field

- [x] **Test: Arcane spell without school rejected**
  - GIVEN spell with `tradition = "ARCANE"` and `school = null`
  - WHEN validated
  - THEN validation MUST fail

- [x] **Test: Divine spell without sphere rejected**
  - GIVEN spell with `tradition = "DIVINE"` and `sphere = null`
  - WHEN validated
  - THEN validation MUST fail

## Integration Tests

### Database Schema
- [x] **Test: Schema version column**
  - GIVEN database migration applies
  - THEN `schema_version` column MUST exist in `spell` table
  - AND default value MUST be 1

- [x] **Test: Hash computation integration**
  - GIVEN `SpellDetail` model
  - WHEN converted to `CanonicalSpell` and hashed
  - THEN hash MUST be a valid SHA-256 string (64 hex chars)
