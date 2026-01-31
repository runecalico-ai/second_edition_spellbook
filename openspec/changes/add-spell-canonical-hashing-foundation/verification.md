# Verification Plan: Canonical Hashing Foundation

## Unit Tests

### Hash Computation
- [ ] **Test: Identical content produces identical hash**
  - GIVEN two `CanonicalSpell` objects with identical content but different field order
  - WHEN `compute_hash()` is called on both
  - THEN both hashes MUST be identical

- [ ] **Test: Content change produces different hash**
  - GIVEN a spell with description "Boom"
  - WHEN description changes to "Explosion"
  - THEN hash MUST change

- [ ] **Test: Metadata change does not affect hash**
  - GIVEN a spell with `source_refs = [Book A]`
  - WHEN `source_refs` changes to `[Book A, Book B]`
  - THEN hash MUST remain unchanged

- [ ] **Test: Array normalization**
  - GIVEN spell with `tags = ["Fire", "Damage"]`
  - AND another spell with `tags = ["Damage", "Fire"]`
  - THEN both hashes MUST be identical (arrays sorted)

- [ ] **Test: Null value handling**
  - GIVEN spell with `reversible = null`
  - AND spell with `reversible` field omitted
  - THEN both canonical representations MUST be identical

- [ ] **Test: Default value inclusion**
  - GIVEN spell with `is_cantrip = false`
  - THEN canonical JSON MUST include `"is_cantrip": false`

### Schema Validation
- [ ] **Test: Valid spell passes validation**
  - GIVEN a spell conforming to `spell.schema.json`
  - WHEN validated
  - THEN validation MUST succeed

- [ ] **Test: Invalid tradition rejected**
  - GIVEN spell with `tradition = "PSIONIC"`
  - WHEN validated
  - THEN validation MUST fail with error on `tradition` field

- [ ] **Test: Arcane spell without school rejected**
  - GIVEN spell with `tradition = "ARCANE"` and `school = null`
  - WHEN validated
  - THEN validation MUST fail

- [ ] **Test: Divine spell without sphere rejected**
  - GIVEN spell with `tradition = "DIVINE"` and `sphere = null`
  - WHEN validated
  - THEN validation MUST fail

## Integration Tests

### Database Schema
- [ ] **Test: Schema version column**
  - GIVEN database migration applies
  - THEN `schema_version` column MUST exist in `spells` table
  - AND default value MUST be 1

- [ ] **Test: Hash computation integration**
  - GIVEN `SpellDetail` model
  - WHEN converted to `CanonicalSpell` and hashed
  - THEN hash MUST be a valid SHA-256 string (64 hex chars)
