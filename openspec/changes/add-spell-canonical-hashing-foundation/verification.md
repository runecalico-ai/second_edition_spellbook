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

- [x] **Test: Empty array omission (Lean Hashing)**
  - GIVEN a spell with `tags = []`
  - THEN the canonical JSON MUST OMIT the `tags` field entirely
  - **IMPLEMENTED**: `test_empty_array_inclusion` in canonical_spell.rs:853-887

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

### Range Parsing
- [x] **Test: Parse Distance Range**
  - GIVEN a range string "120 yards"
  - WHEN parsed
  - THEN it MUST be `kind="distance"`
  - AND `unit` MUST be `RangeUnit::Yd`
  - AND `distance` scalar MUST be `120`.

- [x] **Test: Parse Touch Range**
  - GIVEN a range string "Touch"
  - WHEN parsed
  - THEN it MUST be `kind="touch"`
  - AND `unit` MUST be `None`.

- [x] **Test: Parse Personal Range**
  - GIVEN a range string "Personal" or "0"
  - WHEN parsed
  - THEN it MUST be `kind="personal"`.

- [x] **Test: Parse Special Range**
  - GIVEN a complex range string "Special"
  - WHEN parsed
  - THEN it MUST be `kind="special"`.

### Duration Parsing
- [x] **Test: Parse Time Duration**
  - GIVEN a duration string "1 round / level"
  - WHEN parsed
  - THEN it MUST be `kind="time"`
  - AND `unit` MUST be `DurationUnit::Round`
  - AND `duration` scalar MUST be `per_level=1`.

- [x] **Test: Parse Instantaneous Duration**
  - GIVEN a duration string "Instantaneous"
  - WHEN parsed
  - THEN it MUST be `kind="instant"`.

- [x] **Test: Parse Permanent Duration**
  - GIVEN a duration string "Permanent"
  - WHEN parsed
  - THEN it MUST be `kind="permanent"`.

### Advanced Parsing
- [x] **Test: Parse Experience Cost (Fixed)**
  - GIVEN "XP Cost: 300"
  - WHEN parsed
  - THEN it MUST be `kind="fixed"` and `amount_xp=300`.
  - **IMPLEMENTED**: `test_parse_experience_cost` in mechanics.rs:487-512

- [x] **Test: Parse Multi-Part Damage**
  - GIVEN "1d6 fire + 1d6 cold"
  - WHEN parsed
  - THEN it MUST have two `DamagePart` objects with correct `damage_type`.
  - **IMPLEMENTED**: `test_parse_multi_part_damage` in mechanics.rs:445-470

- [x] **Test: Parse Magic Resistance**
  - GIVEN "Magic Resistance: 50%"
  - WHEN parsed
  - THEN it MUST be `kind="normal"` (or as per spec interaction).
  - **IMPLEMENTED**: `test_parse_magic_resistance` in mechanics.rs:562-576

- [x] **Test: Parse Multiple Saving Throws**
  - GIVEN "Save vs Spell, then Save vs Poison"
  - WHEN parsed
  - THEN it MUST be `kind="multiple"` with correct `save_type` sequence.
  - **IMPLEMENTED**: `test_parse_saving_throws` (multiple saves) in mechanics.rs:531-545

- [x] **Test: Parse Material Component (Valued)**
  - GIVEN "100gp diamond dust"
  - WHEN parsed
  - THEN it MUST extract `gp_value=100` and `name="diamond dust"`.
  - **IMPLEMENTED**: `test_parse_material_component_valued` in components.rs:269-284

- [x] **Test: Parse Material Component (Consumed)**
  - GIVEN "ruby (worth 1000 gp, consumed)"
  - WHEN parsed
  - THEN it MUST extract `gp_value=1000`, `is_consumed=true`.
  - **IMPLEMENTED**: `test_parse_material_component_consumed` in components.rs:286-305

- [x] **Test: Parse Material Component (Multiple)**
  - GIVEN "bat guano, sulfur"
  - WHEN parsed
  - THEN it MUST return 2 `MaterialComponentSpec` objects.
  - **IMPLEMENTED**: `test_parse_material_component_multiple` in components.rs:307-326

- [x] **Test: Parse Material Component (Edge Cases)**
  - GIVEN empty string or "None"
  - WHEN parsed
  - THEN it MUST return empty vector.
  - **IMPLEMENTED**: `test_parse_material_component_edge_cases_empty` in components.rs:328-343

- [x] **Test: Parse Material Component (Parentheses Handling)**
  - GIVEN "powdered gemstone (ruby, sapphire, or emerald worth 500 gp)"
  - WHEN parsed
  - THEN it MUST correctly handle commas inside parentheses.
  - **IMPLEMENTED**: `test_parse_material_component_parentheses_handling` in components.rs:345-356

- [x] **Test: Parse Special Duration**
  - GIVEN a complex duration string "Special"
  - WHEN parsed
  - THEN it MUST be `kind="special"`.

### Regression Tests
- [x] **Test: Duration Whitespace Normalization**
  - GIVEN " 1  round / level "
  - WHEN parsed
  - THEN it MUST parse identical to "1 round/level".

- [x] **Test: Duration Case Insensitivity**
  - GIVEN "INSTANTANEOUS"
  - WHEN parsed
  - THEN it MUST be `kind="instant"`.

- [x] **Test: Duration Null/Empty Handling**
  - GIVEN an empty duration string
  - WHEN parsed
  - THEN it MUST return `None` or a safe default `Special`.

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
