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
  - AND spell with `school` field omitted
  - THEN both canonical representations MUST be identical (completely omitted from output)
  - AND this MUST apply to all nullable fields (e.g., `sphere`, `material_components`, `saving_throw`, `edition`, `author`, `license`)

- [x] **Test: Number normalization**
  - GIVEN a spell with `level_divisor = 1.0`
  - AND another with `level_divisor = 1`
  - THEN both hashes MUST be identical (shortest representation)

- [x] **Test: String normalization**
  - GIVEN a spell with description containing Windows line endings (`\r\n`)
  - AND another with Unix line endings (`\n`)
  - THEN both hashes MUST be identical
  - AND leading/trailing whitespace MUST be trimmed before hashing

- [x] **Test: Default value inclusion (Nested Objects)**
  - GIVEN a spell with `range = { "text": "Touch", "unit": "Touch" }`
  - THEN canonical JSON MUST include default fields: `"base_value": 0`, `"per_level": 0`, `"level_divisor": 1`

- [x] **Test: Null value handling (cap_level)**
  - GIVEN a spell with `damage = { "text": "1d6", "cap_level": null }`
  - AND another with `damage = { "text": "1d6" }`
  - THEN both canonical representations MUST be identical (omitted)

- [x] **Test: Metadata exclusion (schema_version)**
  - GIVEN a spell with `schema_version = 1`
  - WHEN `schema_version` is changed to `2`
  - THEN hash MUST remain unchanged

- [x] **Test: Unicode normalization (NFC)**
  - GIVEN a spell with name "Fiancé" (encoded as `e` + ` ́` / NFD)
  - AND another with "Fiancé" (encoded as `é` / NFC)
  - THEN both hashes MUST be identical

- [x] **Test: Array deduplication**
  - GIVEN a spell with `tags = ["Fire", "Fire", "Damage"]`
  - AND another with `tags = ["Damage", "Fire"]`
  - THEN both hashes MUST be identical (deduplicated + sorted)

- [x] **Test: Floating point precision**
  - GIVEN a spell with `base_value = 1.0000001`
  - AND another with `base_value = 1.0000004`
  - THEN both hashes MUST be identical (limit 6 decimal places)

- [x] **Test: Enum casing normalization**
  - GIVEN a spell with `tradition = "arcane"`
  - AND another with `tradition = "ARCANE"`
  - THEN both hashes MUST be identical (normalized to schema case)

- [x] **Test: Empty array inclusion**
  - GIVEN a spell with `tags = []`
  - THEN the canonical JSON MUST include `"tags": []`

- [x] **Test: Whitespace collapse (Short text)**
  - GIVEN a spell with `range = { "text": "10  yards  +  10  yards/level", "unit": "Yards" }`
  - AND another with `range = { "text": "10 yards + 10 yards/level", "unit": "Yards" }`
  - THEN both hashes MUST be identical (internal spaces collapsed)

- [x] **Test: Materialize defaults**
  - GIVEN a spell missing an optional field that has a default (e.g., `reversible` is missing)
  - WHEN canonicalized
  - THEN the output MUST include the schema default (`"reversible": 0`)
  - AND hashes for records with explicit vs implicit defaults MUST be identical

- [x] **Test: Prohibited field omission**
  - GIVEN an Arcane spell with `"school": "Evocation"` and `"sphere": null`
  - WHEN canonicalized
  - THEN the output MUST OMIT the `"sphere"` key
  - AND the hash MUST be identical to the same spell where `"sphere"` was never present

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

- [x] **Test: Both tradition requires school and sphere**
  - GIVEN spell with `tradition = "BOTH"`
  - AND `school = "Evocation"` but `sphere = null`
  - THEN validation MUST fail
  - AND GIVEN `school = null` but `sphere = "All"`
  - THEN validation MUST fail
  - AND GIVEN both `school` and `sphere` are non-null
  - THEN validation MUST succeed

## Integration Tests

### Database Schema
- [X] **Test: Schema version column**
  - GIVEN database migration applies
  - THEN `schema_version` column MUST exist in `spell` table
  - AND default value MUST be 1

- [x] **Test: Hash computation integration**
  - GIVEN `SpellDetail` model
  - WHEN converted to `CanonicalSpell` and hashed
  - THEN hash MUST be a valid SHA-256 string (64 hex chars)
