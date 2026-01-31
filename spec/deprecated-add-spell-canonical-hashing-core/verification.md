# Verification Plan: Core Hashing

## Unit Tests

### Hash Computation
- [ ] **Test: Identical content produces identical hash**
  - GIVEN two `SpellDetail` objects with identical content but different field order
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
  - GIVEN spell with `is_cantrip = 0`
  - THEN canonical JSON MUST include `"is_cantrip": 0`

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

### String-to-Structured Parser
- [ ] **Test: Parse simple range**
  - GIVEN string "10 yards"
  - WHEN parsed
  - THEN `{text: "10 yards", unit: "Yards", base_value: 10, per_level: 0}`

- [ ] **Test: Parse variable range**
  - GIVEN string "10 + 5/level yards"
  - WHEN parsed
  - THEN `{text: "10 + 5/level yards", unit: "Yards", base_value: 10, per_level: 5}`

- [ ] **Test: Parse special range**
  - GIVEN string "Touch"
  - WHEN parsed
  - THEN `{text: "Touch", unit: "Touch", base_value: 0, per_level: 0}`

- [ ] **Test: Parse components**
  - GIVEN string "V, S, M"
  - WHEN parsed
  - THEN `{verbal: true, somatic: true, material: true}`

- [ ] **Test: Parse damage with cap**
  - GIVEN string "1d6/level (max 10d6)"
  - WHEN parsed
  - THEN `{per_level_dice: "1d6", cap_level: 10}`

- [ ] **Test: Unparseable fallback**
  - GIVEN string "Special (see description)"
  - WHEN parsing fails
  - THEN `{text: "Special (see description)", unit: "Special", base_value: 0}`

## Integration Tests

### Database Migration
- [ ] **Test: Hash backfill on startup**
  - GIVEN database with 100 spells, all `content_hash = NULL`
  - WHEN application starts
  - THEN all spells MUST have non-null `content_hash`
  - AND no hash collisions (all unique)

- [ ] **Test: Unique constraint enforcement**
  - GIVEN spell with hash "abc123..."
  - WHEN attempting to insert duplicate spell with same hash
  - THEN database MUST reject with constraint violation
  - AND error MUST be logged

### End-to-End Scenarios
- [ ] **Test: Create spell and verify hash**
  - GIVEN user creates spell "Magic Missile"
  - WHEN spell is saved
  - THEN `content_hash` column MUST be populated
  - AND hash MUST be valid SHA-256 (64 hex chars)

- [ ] **Test: Edit spell content updates hash**
  - GIVEN spell "Fireball" with hash A
  - WHEN user changes damage from "1d6" to "2d6"
  - THEN hash MUST change to hash B
  - AND hash B MUST be different from hash A

- [ ] **Test: Edit metadata does not update hash**
  - GIVEN spell with hash A
  - WHEN user adds new `source_ref`
  - THEN hash MUST remain hash A

- [ ] **Test: Import duplicate spell by hash**
  - GIVEN database has spell "Fireball" with hash A
  - WHEN importing spell bundle with "Fireball" (hash A)
  - THEN import MUST detect duplicate
  - AND skip or prompt user

## Performance Tests
- [ ] **Test: Hash computation time**
  - GIVEN spell with typical content (500 chars description)
  - WHEN hash is computed 1000 times
  - THEN average time MUST be < 1ms per hash

- [ ] **Test: Migration time for large database**
  - GIVEN database with 10,000 spells
  - WHEN running hash backfill migration
  - THEN migration MUST complete within 60 seconds
  - AND report progress every 1000 spells

## End-to-End Workflows

### Workflow: Legacy User Upgrades Database
- [ ] **E2E: Complete Migration Experience**
  1. Start with database of 1,000 legacy spells (string-only fields)
  2. Launch application (automatic migration triggers)
  3. Verify migration progress indicator appears
  4. Monitor migration: "Migrating spell 100 of 1000..."
  5. Migration completes, report shows:
     - Successfully parsed: 950 (95%)
     - Fallback used: 50 (5%)
  6. Open spell editor for legacy spell
  7. Verify spell displays correctly (legacy strings shown)
  8. Edit spell, change range from "10 yards" to "20 yards"
  9. Verify auto-parsing creates structured data: `{base_value: 20, unit: "Yards"}`
  10. Save spell, verify hash computed and stored
  11. Search for spell by range "yards"
  12. Verify spell appears in results (FTS index updated)
  13. Export spell bundle (includes newly structured spell)
  14. Re-import bundle, verify deduplication by hash works

### Workflow: Developer Tests Hash API
- [ ] **E2E: Hash Computation in Code**
  1. Create new `SpellDetail` struct programmatically
  2. Populate with test data (name, level, description, tradition, school)
  3. Call `CanonicalSpell::from(spell_detail)`
  4. Verify canonical representation excludes metadata
  5. Call `compute_hash(&canonical_spell)`
  6. Verify hash is 64-character hex string
  7. Modify content field (change description)
  8. Recompute hash
  9. Verify hash changed
  10. Modify metadata field (add source_ref)
  11. Recompute hash
  12. Verify hash unchanged

### Error Scenarios

#### Error: Migration Failures
- [ ] **E2E: Handle Unparseable Legacy Data**
  - GIVEN spell with range "Special (varies, see DM)"
  - WHEN migration runs
  - THEN parser falls back to `{text: original, unit: "Special", base_value: 0}`
  - AND migration report logs: "Fallback used for spell ID 123: range"
  - WHEN user opens spell in editor
  - THEN warning shows: "Could not parse range automatically. Please review."

- [ ] **E2E: Handle Hash Collision (Simulated)**
  - GIVEN two spells with identical content (hash collision simulated via mock)
  - WHEN saving second spell
  - THEN database constraint violation occurs
  - AND error logged: "Hash collision detected: abc123..."
  - AND user sees error: "Cannot save: spell with identical content already exists"

#### Error: Schema Validation Failures
- [ ] **E2E: Invalid Spell Rejected**
  - GIVEN spell data with `tradition = "ARCANE"`, `school = null`
  - WHEN attempting to save
  - THEN validation fails before hash computation
  - AND error message shown: "Arcane spells require a school selection"

- [ ] **E2E: Corrupted Data Migration**
  - GIVEN database with corrupted spell record (missing required field)
  - WHEN migration attempts to process
  - THEN error logged: "Skipping spell ID 456: missing required field 'name'"
  - AND migration continues (does not crash)
  - AND final report shows: "Errors: 1, see migration.log for details"

