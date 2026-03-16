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

- [ ] **Test: FTS update trigger old.* correctness**
  - GIVEN spell "Fireball" indexed with `canonical_range_text` = "ranged, 100-foot radius"
  - WHEN the spell's range is updated so `canonical_range_text` = "self"
  - THEN searching for "ranged, 100-foot radius" MUST NOT return "Fireball"
  - NOTE: Validates that the `spell_au` trigger passes `old.*` values (including `json_extract(old.canonical_data, ...)`), not empty strings, in the FTS5 `'delete'` command. Empty strings would leave a stale index entry that makes this search incorrectly succeed

- [ ] **Test: FTS delete trigger old.* correctness**
  - GIVEN spell "Fireball" indexed in `spell_fts` with description "A massive ball of flame"
  - WHEN the spell is deleted from the `spell` table
  - THEN searching for "massive ball of flame" MUST NOT return "Fireball"
  - NOTE: Validates that the `spell_ad` (AFTER DELETE) trigger passes `old.*` values (including `json_extract(old.canonical_data, ...)` for canonical text columns) in the FTS5 `'delete'` command. Empty strings would leave a stale index entry so the deleted spell would still appear in search results

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

- [ ] **Test: Tag merge limit enforcement (Deduplication ONLY)**
  - GIVEN spell with 95 existing tags
  - WHEN importing same hash with 10 new unique tags (total would be 105)
  - THEN resulting tags MUST be capped at 100
  - AND the first 100 tags (existing + new, alphabetically sorted) MUST be kept
  - AND excess tags MUST be silently dropped
  - AND import MUST succeed without error

- [ ] **Test: Warn on future schema version and continue best-effort**
  - GIVEN the app's current schema version (from code)
  - WHEN importing a spell with a schema version greater than the app's
  - THEN import MUST emit a forward-compatibility warning
  - AND import SHOULD continue best-effort processing
  - AND behavior MUST match schema-versioning policy

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

- [ ] **Test: Import migration (v1 -> v2)**
  - GIVEN a v1 spell (e.g., uses "action" unit in casting_time, no raw_legacy_value)
  - WHEN importing
  - THEN `migrate_to_v2()` MUST execute
  - AND the recomputed hash MUST include the v2-computed `raw_legacy_value`
  - AND the stored spell MUST have `schema_version: 2`.

### Vault Storage
- [ ] **Test: File integrity**
  - GIVEN spell saved to vault
  - WHEN reading file `spells/{content_hash}.json`
  - THEN hash MUST be recomputed by applying canonical serialization (strip metadata, JCS, SHA-256) to the file content
  - AND the recomputation MUST be version-aware (handles v1->v2 migration if necessary)
  - AND recomputed hash MUST match filename hash.

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
  - GIVEN vault root such that full path to a spell file would exceed 260 characters
  - WHEN writing a spell file or initializing vault
  - THEN log warning and document mitigation (shorter base path)
  - AND GIVEN vault root selection leads to typical path > 240 characters
  - THEN implementer MUST log a preemptive warning during configuration/initialization.

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

#### Missing spell handling
- [ ] **Verification: Migration 0015 — column, backfill, and indexes**
  - Migration 0015 adds column `spell_content_hash` to `character_class_spell`, backfills from `spell.content_hash`, and creates unique index `idx_ccs_character_hash_list` (and optionally `idx_ccs_spell_content_hash`) on a fresh DB.
- [ ] **Verification: get_character_class_spells returns missing_from_library and placeholder**
  - When no spell row exists for a given `spell_content_hash`, `get_character_class_spells` returns `missing_from_library: true` and a placeholder name (e.g. "Spell no longer in library").
- [ ] **Verification: remove_character_spell_by_hash removes row and cascades PREPARED**
  - `remove_character_spell_by_hash` removes the `character_class_spell` row and cascades PREPARED when removing KNOWN (same `character_class_id` and `spell_content_hash`).

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

- [ ] **Test: Cascading Update on Replace**
  - GIVEN existing spell "Fireball" (Hash A)
  - AND character with "Fireball" (Hash A)
  - WHEN importing "Fireball" (Hash B) and user selects "Replace with New"
  - THEN content_hash of the spell row MUST change from Hash A to Hash B
  - AND character`s `spell_content_hash` MUST automatically update to Hash B
  - AND character MUST seamlessly show the updated "Fireball" without errors

- [ ] **Test: Replace rollback on cascade failure**
  - GIVEN existing spell "Fireball" (Hash A)
  - AND replacing to Hash B would trigger at least one failing cascade update (for example, unique constraint conflict in `character_class_spell`)
  - WHEN user selects "Replace with New"
  - THEN the replace operation MUST fail for that spell
  - AND the spell row MUST remain unchanged with Hash A
  - AND no partial cascade updates MUST be committed

- [ ] **Test: Replace with New creates change_log entries**
  - GIVEN existing spell "Fireball" (Hash A, spell_id 42)
  - WHEN importing "Fireball" (Hash B) and user selects "Replace with New"
  - AND the replace and cascade complete successfully
  - THEN the application MUST create `change_log` entries for the updated spell (spell_id 42)
  - AND entries MUST record field-level changes at minimum for `content_hash` and `canonical_data`

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
  4. Individual conflict review flow begins for 5 conflicts (no summary dialog, threshold is >= 10)
  5. User selects "Review Each"
  6. **Spell 1**: User views diff, selects "Replace"
  7. **Spell 2**: User views diff, selects "Keep Existing"
  8. **Spell 3**: User selects "Apply 'Replace' to Remaining 3" (This is the "Apply to All" option with choice Replace for the current session.)
  9. Workflow completes
  10. Verifies: Spell 1 replaced, Spell 2 unchanged, Spells 3-5 replaced
  11. Verifies: All characters referencing the old hashes of Spells 1, 3-5 are cascaded to their new hashes.

- **Future coverage (optional):** E2E for 10+ conflicts where the summary dialog (Skip All, Replace All, Keep All, Review Each) is exercised.

- [ ] **E2E: Bulk Summary Dialog (10+ conflicts)**
  1. Start with 12 spells in library
  2. Import bundle of 12 spells (all same names, different hashes)
  3. Summary dialog MUST appear (≥ 10 threshold): "12 conflicts found. Choose default action:"
  4. Options: Skip All, Replace All, Keep All, Review Each
  5. User selects "Replace All"
  6. All 12 spells MUST be replaced
  7. All character references to old hashes MUST cascade to new hashes
  NOTE: This E2E exercises the ≥10 conflict threshold. The "Bulk Conflict Handling" E2E above intentionally tests the individual-dialog path (5 conflicts < 10 threshold).

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
- [ ] **Test: Conflict threshold at boundary (10 conflicts → summary dialog)**
  - GIVEN 10 spells in library
  - WHEN importing bundle with 10 spells (all same name, different hash)
  - THEN summary dialog MUST appear (Skip All, Replace All, Keep All, Review Each)
  - NOTE: Validates the ≥10 conflict threshold

- [ ] **Test: Conflict threshold below boundary (9 conflicts → individual dialogs)**
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
  - THEN invalid URL MUST be rejected by protocol allowlist
  - AND under default policy (`import.sourceRefUrlPolicy=drop-ref`) the SourceRef MUST be dropped with warning
  - AND spell import MUST continue when remaining content is valid

- [ ] **Test: Import with malicious URL in strict mode**
  - GIVEN `import.sourceRefUrlPolicy=reject-spell`
  - AND import JSON with source_ref containing `javascript:alert('XSS')`
  - WHEN imported
  - THEN the spell MUST be rejected
  - AND error MUST indicate unsupported protocol

- [ ] **Test: Import with data: protocol URL**
  - GIVEN import JSON with source_ref containing `data:text/html,...`
  - WHEN imported
  - THEN URL MUST be rejected
  - AND only `http:`, `https:`, and `mailto:` protocols are allowed (ipfs: and others are also rejected)

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
  - NOTE: Validates the parallel `CREATE UNIQUE INDEX` from Migration 0015

### Vault Integrity Edge Cases
- [ ] **Test: Vault integrity recovery with NULL canonical_data**
  - GIVEN spell row with content_hash H but canonical_data is NULL
  - AND vault file `spells/H.json` is missing
  - WHEN vault integrity check runs
  - THEN system MUST log the entry as unrecoverable
  - AND system MUST NOT crash
  - NOTE: Validates graceful handling when re-export is impossible

### Import Version Validation (additional)
- [ ] **Test: Reject missing bundle_format_version in bundle**
  - GIVEN bundle JSON with a `spells` array but no `bundle_format_version` field
  - WHEN importing
  - THEN import MUST reject the bundle
  - AND error MUST indicate missing required field

- [ ] **Test: Accept missing bundle_format_version for single spell**
  - GIVEN single-spell JSON object with no `bundle_format_version` field (only `schema_version`)
  - WHEN importing
  - THEN import MUST accept and process the spell normally
  - AND NO error for missing bundle field MUST appear

- [ ] **Test: Reject malformed bundle shape (spells present but non-array)**
  - GIVEN JSON payload with top-level `spells` key set to a non-array value
  - WHEN importing
  - THEN import MUST reject payload as malformed
  - AND error MUST indicate `spells` must be an array when present

### Import Hash Integrity
- [ ] **Test: Tampered import hash detection**
  - GIVEN import bundle with spell whose `content_hash` is "X"
  - WHEN recomputed hash from spell content is "Y" (X ≠ Y)
  - THEN import MUST warn user of integrity mismatch (non-blocking inline warning in import summary)
  - AND the spell MUST be counted as "imported with warning" (not rejected)
  - AND recomputed hash "Y" MUST be used for deduplication
  - AND the imported value "X" MUST NOT be used

### Intra-Bundle Deduplication
- [ ] **Test: Duplicate spells within same import bundle**
  - GIVEN import bundle containing two spells with identical content (same computed hash), in document order (first at index 0, second at index 1)
  - WHEN importing
  - THEN first spell (index 0) MUST be inserted
  - AND second spell (index 1) MUST be deduplicated (skip insertion, merge metadata)
  - AND import report MUST show 1 imported + 1 duplicate
  - NOTE: Spells are processed in document order; first-encountered wins

### Replace Hash Collision
- [ ] **Test: Replace fails when target hash already exists**
  - GIVEN existing spells "Fireball" (Hash A, id 42) and "Super Fireball" (Hash B)
  - WHEN importing "Fireball" (Hash B) and user selects "Replace with New"
  - THEN Replace MUST fail with a clear error (e.g., "This version already exists in your library as Super Fireball")
  - AND spell row id 42 MUST NOT be modified
  - AND Hash A MUST remain in the DB

### Export Validation
- [ ] **Test: Export includes all required fields**
  - GIVEN a spell with content_hash H and schema_version 2
  - WHEN exported as single-spell JSON
  - THEN `id` field MUST equal H (content_hash)
  - AND `schema_version` MUST be present and equal the app's current version
  - AND all non-null CanonicalSpell fields MUST be included

- [ ] **Test: Bundle export includes bundle_format_version**
  - GIVEN 3 spells exported as a bundle
  - WHEN bundle JSON is produced
  - THEN `bundle_format_version` MUST be present
  - AND `schema_version` MUST be present
  - AND `spells` array MUST contain 3 entries

- [ ] **Test: Export rejects spell with NULL content_hash**
  - GIVEN a spell with content_hash IS NULL (un-migrated)
  - WHEN export is attempted
  - THEN export MUST reject the spell
  - AND prompt user to run migration first

### Vault Integrity with V1 File
- [ ] **Test: Vault integrity check migrates v1 file**
  - GIVEN a vault file `spells/H.json` written with schema_version 1
  - WHEN vault integrity check runs
  - THEN the file MUST be migrated to v2 (via `migrate_to_v2()`)
  - AND the content hash MUST be recomputed from the v2 content
  - AND the recomputed hash MUST match the filename
  - NOTE: Validates the version-aware integrity check described in design Decision #2

### Settings Coverage
- [ ] **Test: Vault open integrity setting toggles behavior**
  - GIVEN `vault.integrityCheckOnOpen=true`
  - WHEN opening vault
  - THEN integrity check MUST run automatically
  - AND GIVEN `vault.integrityCheckOnOpen=false`
  - WHEN opening vault
  - THEN integrity check MUST NOT run automatically
  - AND integrity checks before GC MUST still run in both cases

### FTS Malformed Query Fallback
- [ ] **Test: Malformed advanced query falls back to basic mode**
  - GIVEN spells "Fire Shield" and "Frostbolt"
  - WHEN searching "fire AND AND" (malformed: consecutive operators)
  - THEN the system MUST reject the malformed expression
  - AND fall back to basic search mode (escape all, phrase search)
  - AND results MUST match as if searching for the literal phrase "fire AND AND"

- [ ] **Test: Trailing operator falls back to basic mode**
  - GIVEN spells "Fire Shield" and "Frostbolt"
  - WHEN searching "fire AND" (malformed: trailing operator)
  - THEN the system MUST reject the malformed expression
  - AND fall back to basic search mode

