# Verification Plan: Spell Ecosystem Integration

## Integration Tests

### Search FTS
- [ ] **Test: FTS indexing trigger**
  - GIVEN spell inserted into `spell` table
  - THEN `spell_fts` table MUST contain indexed record
  - AND content MUST match source spell

- [ ] **Test: Search query matching**
  - GIVEN spells "Fireball" and "Frostbolt"
  - WHEN searching for "Fire"
  - THEN result MUST include "Fireball"
  - AND result MUST NOT include "Frostbolt"

- [ ] **Test: FTS update trigger sync**
  - GIVEN spell "Fireball" indexed in `spell_fts` with description "A fiery explosion"
  - WHEN spell description is updated to "A massive ball of flame"
  - THEN searching for "fiery explosion" MUST NOT return "Fireball"
  - AND searching for "massive ball of flame" MUST return "Fireball"
  - NOTE: Validates the delete-then-insert pattern in the FTS update trigger

- [ ] **Test: Basic vs advanced search mode detection**
  - GIVEN spells "Fire Shield" and "Fire and Ice"
  - WHEN searching "fire AND NOT ice" (uppercase operators)
  - THEN advanced search mode MUST activate
  - AND "Fire Shield" MUST be returned
  - AND "Fire and Ice" MUST NOT be returned
  - WHEN searching "fire and ice" (lowercase, no operators)
  - THEN basic search mode MUST activate (phrase search)
  - AND "Fire and Ice" MUST be returned

- [ ] **Test: NEAR keyword always escaped**
  - GIVEN spells "Fire Shield" and "Frostbolt"
  - WHEN searching "fire NEAR shield" (uppercase NEAR)
  - THEN NEAR MUST be treated as literal text, not as FTS5 proximity operator
  - AND basic search mode MUST activate (NEAR is not a recognized boolean operator)
  - AND results MUST match as if searching for the phrase "fire NEAR shield"
  - NOTE: NEAR is always escaped per design Decision #4; it is never exposed to users as an operator

### Import Logic
- [ ] **Test: Deduplication (Skip Existing)**
  - GIVEN spell X already exists in DB
  - WHEN importing bundle containing spell X (same hash)
  - THEN import MUST skip insertion
  - AND existing spell MUST have merged metadata (e.g. tags, source_refs) from the import
  - AND log "Duplicate skipped"

- [ ] **Test: Versioning (New Hash)**
  - GIVEN spell X (hash A) exists in DB
  - WHEN importing spell X (hash B)
  - THEN import MUST detect conflict
  - AND trigger resolution workflow

- [ ] **Test: Partial import — mixed valid and invalid spells**
  - GIVEN a bundle containing 5 spells: 3 valid, 2 with schema errors
  - WHEN importing the bundle
  - THEN 3 valid spells MUST be committed to DB
  - AND 2 invalid spells MUST be skipped
  - AND import summary MUST report: 3 imported, 0 duplicates, 0 conflicts, 2 failures
  - AND each failure MUST include spell name and error reason

- [ ] **Test: Concurrent import serialization**
  - GIVEN two import operations started near-simultaneously with overlapping spells
  - WHEN both imports contain spell "Arcane Shield" (same hash)
  - THEN only one insert MUST succeed (unique constraint on content_hash)
  - AND the other import MUST skip the duplicate (deduplication)
  - AND no data corruption MUST occur
  - NOTE: Validates that imports are serialized or handle unique constraint violations gracefully

- [ ] **Test: Tag merge limit enforcement**
  - GIVEN spell with 95 existing tags
  - WHEN importing same hash with 10 new unique tags (total would be 105)
  - THEN resulting tags MUST be capped at 100
  - AND the first 100 tags (existing + new, alphabetically sorted) MUST be kept
  - AND excess tags MUST be silently dropped
  - AND import MUST succeed without error

- [ ] **Test: Reject future schema version on import**
  - GIVEN the app's current schema version (from code)
  - WHEN importing a spell with a schema version greater than the app's
  - THEN import MUST reject the spell
  - AND error message MUST indicate unsupported schema version
  - AND no data MUST be written to DB

- [ ] **Test: Reject future bundle format version on import**
  - GIVEN the app's supported bundle_format_version (from code)
  - WHEN importing a bundle with bundle_format_version greater than supported
  - THEN import MUST reject the entire bundle
  - AND error message MUST indicate unsupported bundle format version
  - AND no data MUST be written to DB

- [ ] **Test: Accept current or lower schema version on import**
  - GIVEN the app's current schema version (from code)
  - WHEN importing a spell with schema version equal to or lower than the app's
  - THEN import MUST accept and process the spell normally

- [ ] **Test: source_refs merge limit enforcement**
  - GIVEN spell with 48 existing source_refs
  - WHEN importing same hash with 5 new unique source_refs (total would be 53)
  - THEN resulting source_refs MUST be capped at 50
  - AND the first 50 refs (existing preserved, new appended up to limit) MUST be kept
  - AND excess refs MUST be silently dropped

### Vault Storage
- [ ] **Test: File integrity**
  - GIVEN spell saved to vault
  - WHEN reading file `spells/{content_hash}.json`
  - THEN hash MUST be recomputed by applying canonical serialization (strip metadata, JCS, SHA-256) to the file content
  - AND recomputed hash MUST match filename hash

- [ ] **Test: Vault GC removes unreferenced files**
  - GIVEN a spell deleted from DB so its content_hash is no longer referenced by any spell row
  - WHEN vault GC runs
  - THEN file `spells/{content_hash}.json` MUST be removed

- [ ] **Test: GC blocked during active import**
  - GIVEN an import operation is in progress
  - WHEN vault GC is triggered
  - THEN GC MUST be blocked or deferred until import completes
  - AND no vault files MUST be deleted during the import
  - NOTE: Validates the concurrency guard from design Decision #2

- [ ] **Test: Windows path length**
  - GIVEN vault root such that full path to a spell file would exceed 260 characters (or path check at vault init/first write)
  - WHEN writing a spell file or initializing vault
  - THEN log warning and document mitigation (shorter base path)

### Artifact Integration
- [ ] **Test: Artifact referencing spell by hash**
  - GIVEN artifact attached to spell with content_hash H
  - WHEN artifact table is migrated to spell_content_hash
  - THEN artifact MUST be resolvable via spell_content_hash (join to spell on content_hash)
  - AND existing spell_id backfill MUST match H

### Spell List Migration
- [ ] **Test: character_class_spell migration to spell_content_hash**
  - GIVEN rows in `character_class_spell` with `spell_id` only (no spell_content_hash)
  - WHEN migration runs (backfill from spell.content_hash)
  - THEN `spell_content_hash` MUST be set for each row
  - AND join to `spell` on `spell.content_hash = character_class_spell.spell_content_hash` MUST succeed

### Character Integration
- [ ] **Test: Character referencing spell hash**
  - GIVEN character with "Fireball" (hash A) memorized
  - WHEN "Fireball" updated to (hash B) in library
  - THEN character MUST still reference (hash A) [Versioning]
  - UNLESS user explicitly updates character spell

- [ ] **Test: Explicit spell upgrade on character**
  - GIVEN character with "Fireball" (hash A) memorized
  - AND "Fireball" (hash B) exists in library
  - WHEN user explicitly chooses to upgrade
  - THEN character reference MUST update from hash A to hash B
  - AND hash A reference MUST no longer appear on the character

## Security Tests

### Malicious Imports
- [ ] **Test: Import bundle with XSS**
  - GIVEN import JSON with spell name `<script>alert('XSS')</script>`
  - WHEN imported and displayed
  - THEN script MUST NOT execute
  - AND name MUST be sanitized/escaped

- [ ] **Test: Import bundle with SQL Injection**
  - GIVEN import JSON with description `'; DROP TABLE spell;--`
  - WHEN imported and search indexed
  - THEN SQL command MUST NOT execute
  - AND data MUST remain intact

- [ ] **Test: Oversized Import (> 100MB)**
  - GIVEN import file > 100MB
  - WHEN attempting import
  - THEN system MUST reject file immediately
  - AND error "File too large" displayed

- [ ] **Test: Large import warning (> 10MB)**
  - GIVEN import file > 10MB but < 100MB
  - WHEN attempting import
  - THEN system MUST show warning/confirmation dialog before processing
  - AND user MUST confirm to proceed

- [ ] **Test: Import spell count limit (10,000)**
  - GIVEN import bundle containing 10,001 spells
  - WHEN attempting import
  - THEN system MUST reject the bundle
  - AND error MUST indicate maximum spell count exceeded

- [ ] **Test: Import JSON nesting depth limit (50 levels)**
  - GIVEN import JSON with objects nested > 50 levels deep
  - WHEN attempting import
  - THEN system MUST reject the input
  - AND error MUST indicate excessive nesting

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
  10. User A verifies library has "Arcane Boom" and "Arcane Boom (1)" (numeric suffix convention: (1), (2), ... for duplicates)

### Workflow: Import Conflict Resolution
- [ ] **E2E: Bulk Conflict Handling**
  1. Start with 20 spells in library
  2. Import bundle of 20 spells (15 duplicates, 5 modified versions)
  3. Logic skips 15 duplicates automatically
  4. Conflict Dialog appears: "5 conflicts found"
  5. User selects "Review Each"
  6. **Spell 1**: User views diff, selects "Replace"
  7. **Spell 2**: User views diff, selects "Keep Existing"
  8. **Spell 3**: User selects "Apply 'Replace' to Remaining 3" (This is the "Apply to All" option with choice Replace for the current session.)
  9. Workflow completes
  10. Verifies: Spell 1 replaced, Spell 2 unchanged, Spells 3-5 replaced

- **Future coverage (optional):** E2E for 10+ conflicts where the summary dialog (Skip All, Replace All, Keep All, Review Each) is exercised.

### Workflow: Export → Re-import Round Trip
- [ ] **E2E: Export and Re-import Same Spell**
  1. User creates spell "Lightning Bolt" with hash H
  2. User exports "Lightning Bolt" to lightning_bolt.json
  3. User re-imports lightning_bolt.json
  4. Import MUST detect hash H already exists in DB
  5. Import MUST skip insertion (deduplication)
  6. Import report MUST show "1 duplicate skipped"
  7. Library MUST still contain exactly one "Lightning Bolt"
  8. No conflict dialog MUST appear (same name + same hash = not a conflict)

## Additional Tests (from spec review)

### Vault Storage (additional)
- [ ] **Test: Vault immediate deletion on last reference removal**
  - GIVEN a spell with content_hash H exists in DB and vault
  - WHEN that spell is explicitly deleted by user (last reference removed)
  - THEN file `spells/{content_hash}.json` MAY be removed immediately
  - AND DB row MUST be deleted
  - NOTE: This validates the "immediate delete" GC approach (alternative to deferred GC)

- [ ] **Test: Vault integrity recovery**
  - GIVEN a spell row exists in DB with content_hash H
  - AND vault file `spells/H.json` is missing (e.g., file corruption, manual deletion)
  - WHEN vault integrity check runs
  - THEN system MUST detect missing file
  - AND re-export from DB canonical_data if available
  - AND log if unrecoverable

### Import Conflict Resolution (additional)
- [ ] **Test: Conflict threshold boundary (exactly 10)**
  - GIVEN 10 spells in library
  - WHEN importing bundle with 10 spells (all same name, different hash)
  - THEN summary dialog MUST appear (Skip All, Replace All, Keep All, Review Each)
  - NOTE: Validates the 10+ conflict threshold

- [ ] **Test: Conflict threshold below boundary (9 conflicts)**
  - GIVEN 9 spells in library
  - WHEN importing bundle with 9 spells (all same name, different hash)
  - THEN individual conflict dialogs MUST appear one by one
  - AND summary dialog MUST NOT appear

- [ ] **Test: Apply to All with Keep Both produces sequential suffixes**
  - GIVEN spells "Fireball", "Magic Missile", "Shield" in library
  - WHEN importing 3 spells with same names but different hashes
  - AND user selects "Apply to All → Keep Both" on first conflict
  - THEN "Fireball (1)" MUST be created
  - AND "Magic Missile (1)" MUST be created
  - AND "Shield (1)" MUST be created
  - AND all three MUST have unique names and distinct content hashes

### Security Tests (additional)
- [ ] **Test: Import with malicious URL in source_refs**
  - GIVEN import JSON with source_ref containing `javascript:alert('XSS')`
  - WHEN imported
  - THEN URL MUST be rejected or sanitized
  - AND error logged
  - AND spell import MAY succeed with sanitized/removed URL

- [ ] **Test: Import with data: protocol URL**
  - GIVEN import JSON with source_ref containing `data:text/html,...`
  - WHEN imported
  - THEN URL MUST be rejected
  - AND only http:// and https:// protocols allowed

### Migration Rollback
- [ ] **Test: Rollback feasibility (mechanical check)**
  - GIVEN list/character rows with `spell_content_hash` set AND `spell_id` still populated
  - WHEN verifying rollback feasibility
  - THEN `spell_id` MUST still be present and valid (not null) for all rows
  - AND `spell.id` join via `spell_content_hash → spell.content_hash → spell.id` MUST resolve for all referenced spells
  - NOTE: This validates that `spell_id` retention during the migration period keeps rollback mechanically possible. A dedicated rollback script is not built but the data path is verified.

### Artifact Integration (additional)
- [ ] **Test: Artifact with missing spell reference**
  - GIVEN artifact row with spell_content_hash H
  - AND spell with hash H no longer exists in spell table
  - WHEN artifact is loaded
  - THEN system MUST handle gracefully (placeholder or error)
  - AND MUST NOT crash

### Missing Spell Reference Handling
- [ ] **Test: Remove action for missing spell in character spellbook**
  - GIVEN character with spell reference to hash H
  - AND spell H no longer exists in library
  - WHEN viewing character spellbook
  - THEN "Spell no longer in library" placeholder MUST appear
  - AND "Remove" action MUST be available
  - WHEN user clicks "Remove"
  - THEN reference MUST be deleted from character

- [ ] **Test: Remove action for missing spell in spell list**
  - GIVEN spell list entry with spell_content_hash H
  - AND spell H no longer exists in library
  - WHEN viewing spell list
  - THEN "Spell no longer in library" placeholder MUST appear
  - AND "Remove" action MUST be available

### Unique Constraint Enforcement
- [ ] **Test: character_class_spell unique constraint on spell_content_hash**
  - GIVEN a row in `character_class_spell` with (character_class_id=1, spell_content_hash=H, list_type='KNOWN')
  - WHEN inserting a duplicate row with the same (character_class_id=1, spell_content_hash=H, list_type='KNOWN')
  - THEN the insert MUST be rejected (unique constraint violation)
  - AND existing row MUST remain unchanged
  - NOTE: Validates the parallel UNIQUE(character_class_id, spell_content_hash, list_type) constraint from Migration 0015

### Vault Integrity Edge Cases
- [ ] **Test: Vault integrity recovery with NULL canonical_data**
  - GIVEN spell row with content_hash H but canonical_data is NULL
  - AND vault file `spells/H.json` is missing
  - WHEN vault integrity check runs
  - THEN system MUST log the entry as unrecoverable
  - AND system MUST NOT crash
  - NOTE: Validates graceful handling when re-export is impossible

### Import Version Validation (additional)
- [ ] **Test: Reject missing bundle_format_version**
  - GIVEN bundle JSON with no `bundle_format_version` field
  - WHEN importing
  - THEN import MUST reject the bundle
  - AND error MUST indicate missing required field

### Import Hash Integrity
- [ ] **Test: Tampered import hash detection**
  - GIVEN import bundle with spell whose `content_hash` is "X"
  - WHEN recomputed hash from spell content is "Y" (X ≠ Y)
  - THEN import MUST warn user of integrity mismatch
  - AND recomputed hash "Y" MUST be used for deduplication
  - AND the imported value "X" MUST NOT be used

### Intra-Bundle Deduplication
- [ ] **Test: Duplicate spells within same import bundle**
  - GIVEN import bundle containing two spells with identical content (same computed hash)
  - WHEN importing
  - THEN first spell MUST be inserted
  - AND second spell MUST be deduplicated (skip insertion, merge metadata)
  - AND import report MUST show 1 imported + 1 duplicate

