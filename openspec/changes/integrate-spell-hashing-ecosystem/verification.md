# Verification Plan: Spell Ecosystem Integration

## Integration Tests

### Search FTS
- [ ] **Test: FTS indexing trigger**
  - GIVEN spell inserted into `spells` table
  - THEN `spells_fts` table MUST contain indexed record
  - AND content MUST match source spell

- [ ] **Test: Search query matching**
  - GIVEN spells "Fireball" and "Frostbolt"
  - WHEN searching for "Fire"
  - THEN result MUST include "Fireball"
  - AND result MUST NOT include "Frostbolt"

### Import Logic
- [ ] **Test: Deduplication (Skip Existing)**
  - GIVEN spell X already exists in DB
  - WHEN importing bundle containing spell X (same hash)
  - THEN import MUST skip insertion
  - AND log "Duplicate skipped"

- [ ] **Test: Versioning (New Hash)**
  - GIVEN spell X (hash A) exists in DB
  - WHEN importing spell X (hash B)
  - THEN import MUST detect conflict
  - AND trigger resolution workflow

### Vault Storage
- [ ] **Test: File integrity**
  - GIVEN spell saved to vault
  - WHEN reading file `{hash}.json`
  - THEN computed hash of file content MUST match filename hash

### Character Integration
- [ ] **Test: Character referencing spell hash**
  - GIVEN character with "Fireball" (hash A) memorized
  - WHEN "Fireball" updated to (hash B) in library
  - THEN character MUST still reference (hash A) [Versioning]
  - UNLESS user explicitly updates character spell

## Security Tests

### Malicious Imports
- [ ] **Test: Import bundle with XSS**
  - GIVEN import JSON with spell name `<script>alert('XSS')</script>`
  - WHEN imported and displayed
  - THEN script MUST NOT execute
  - AND name MUST be sanitized/escaped

- [ ] **Test: Import bundle with SQL Injection**
  - GIVEN import JSON with description `'; DROP TABLE spells;--`
  - WHEN imported and search indexed
  - THEN SQL command MUST NOT execute
  - AND data MUST remain intact

- [ ] **Test: Oversized Import**
  - GIVEN import file > 100MB
  - WHEN attempting import
  - THEN system MUST reject file immediately
  - AND error "File too large" displayed

## End-to-End Workflows

### Workflow: Collaborative Editing (Import/Export)
- [ ] **E2E: Share Spell with Friend**
  1. User A creates custom spell "Arcane Boom"
  2. Users A exports spell to `arcane_boom.json`
  3. User B imports `arcane_boom.json`
  4. User B verifies spell appears in library
  5. User B modifies spell (damage 10d6 -> 12d6)
  6. User B exports modified spell
  7. User A imports modified spell
  8. **Conflict Dialog Appears**: "Arcane Boom" already exists with different content
  9. User A selects "Keep Both"
  10. User A verifies library has "Arcane Boom" and "Arcane Boom (1)"

### Workflow: Import Conflict Resolution
- [ ] **E2E: Bulk Conflict Handling**
  1. Start with 20 spells in library
  2. Import bundle of 20 spells (15 duplicates, 5 modified versions)
  3. Logic skips 15 duplicates automatically
  4. Conflict Dialog appears: "5 conflicts found"
  5. User selects "Review Each"
  6. **Spell 1**: User views diff, selects "Replace"
  7. **Spell 2**: User views diff, selects "Keep Existing"
  8. **Spell 3**: User selects "Apply 'Replace' to Remaining 3"
  9. Workflow completes
  10. Verifies: Spell 1 replaced, Spell 2 unchanged, Spells 3-5 replaced
