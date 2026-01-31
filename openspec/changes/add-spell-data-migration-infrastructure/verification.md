# Verification Plan: Data Migration Infrastructure

## Unit Tests

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

### Migration Performance
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

### Error Scenarios

#### Error: Migration Failures
- [ ] **E2E: Handle Unparseable Legacy Data**
  - GIVEN spell with range "Special (varies, see DM)"
  - WHEN migration runs
  - THEN parser falls back to `{text: original, unit: "Special", base_value: 0}`
  - AND migration report logs: "Fallback used for spell ID 123: range"
  - WHEN user opens spell in editor
  - THEN warning shows: "Could not parse range automatically. Please review."

- [ ] **E2E: Corrupted Data Migration**
  - GIVEN database with corrupted spell record (missing required field)
  - WHEN migration attempts to process
  - THEN error logged: "Skipping spell ID 456: missing required field 'name'"
  - AND migration continues (does not crash)
  - AND final report shows: "Errors: 1, see migration.log for details"
