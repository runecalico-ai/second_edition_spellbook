# Verification Plan: Ecosystem Integration

## Search Integration Tests

### FTS Indexing
- [ ] **Test: Structured field indexing**
  - GIVEN spell with `range = {text: "10 yards", base_value: 10, unit: "Yards"}`
  - WHEN FTS index is built
  - THEN "10 yards" MUST be searchable
  - AND search for "yards" MUST return this spell

- [ ] **Test: Legacy string indexing**
  - GIVEN spell with old format `range = "10 yards"`
  - WHEN FTS index is built
  - THEN "yards" search MUST still work (backwards compatibility)

- [ ] **Test: Array field indexing**
  - GIVEN spell with `tags = ["Fire", "Damage"]`
  - WHEN searching for "Fire"
  - THEN spell MUST be returned

- [ ] **Test: FTS migration performance**
  - GIVEN database with 10,000 spells
  - WHEN rebuilding FTS index
  - THEN rebuild MUST complete within 30 seconds

## Import/Export Tests

### Hash-Based Deduplication
- [ ] **Test: Import duplicate spell by hash**
  - GIVEN database has "Fireball" with hash A
  - WHEN importing bundle with "Fireball" (hash A)
  - THEN import MUST skip duplicate
  - AND log "Already exists: Fireball (hash: abc123...)"

- [ ] **Test: Import new version by hash**
  - GIVEN database has "Fireball v1" with hash A
  - WHEN importing "Fireball v2" with hash B
  - THEN import MUST offer to keep both or replace
  - AND user MUST choose

- [ ] **Test: Export with hash as ID**
  - GIVEN spell with `id=42` (local DB), `content_hash="abc123..."`
  - WHEN exporting
  - THEN exported JSON MUST have `"id": "abc123..."`
  - AND local DB id (42) MUST NOT appear

- [ ] **Test: Roundtrip import/export**
  - GIVEN 100 spells exported from database A
  - WHEN imported into fresh database B
  - THEN all 100 spells MUST import successfully
  - AND all hashes MUST match original

- [ ] **Test: Cross-platform portability**
  - GIVEN spells exported on Windows
  - WHEN imported on macOS/Linux
  - THEN hashes MUST be identical (UTF-8 consistency, line endings normalized)

## Vault Tests

### Hash-Based Filenames
- [ ] **Test: Save spell to vault**
  - GIVEN spell "Magic Missile" with hash "abc123..."
  - WHEN saved to vault
  - THEN file MUST be named `abc123...def.json`
  - AND file content MUST be valid JSON

- [ ] **Test: Integrity check on load**
  - GIVEN vault file `abc123...def.json`
  - WHEN loading file
  - THEN computed hash MUST match filename
  - AND if mismatch, MUST warn user

- [ ] **Test: Hash collision handling**
  - GIVEN two identical spells (same hash)
  - WHEN saving both to vault
  - THEN only one file MUST exist (same hash = same file)

- [ ] **Test: Vault migration from old naming**
  - GIVEN vault with old file naming (e.g., `fireball_v1.json`)
  - WHEN migration runs
  - THEN files MUST be renamed to hash-based names
  - AND old files MUST be deleted or archived

## Character Integration Tests

### Hash-Based Spell References
- [ ] **Test: Character uses spell by hash**
  - GIVEN character "Gandalf" with memorized spell "Fireball" (hash A)
  - WHEN loading character
  - THEN spell MUST be resolved by hash A
  - AND spell details MUST be displayed

- [ ] **Test: Spell version independence**
  - GIVEN character references "Fireball" hash A
  - WHEN importing "Fireball v2" (hash B)
  - THEN character MUST still show hash A (version pinning)
  - AND v2 MUST NOT affect character

- [ ] **Test: Missing spell graceful handling**
  - GIVEN character references spell hash X
  - WHEN spell hash X is not installed
  - THEN character MUST show placeholder (e.g., "Unknown Spell (hash: abc123...)")
  - AND NOT crash

- [ ] **Test: Character export/import portability**
  - GIVEN character "Gandalf" with 10 spells on machine A
  - WHEN exported and imported on machine B
  - AND machine B has same spells (by hash)
  - THEN character MUST resolve all 10 spells correctly

## Spell List Integration Tests

### Hash-Based List Entries
- [ ] **Test: Create spell list with hashes**
  - GIVEN user creates list "Wizard Starter Pack"
  - WHEN adding spells by hash
  - THEN list MUST store hashes, not local IDs

- [ ] **Test: List portability**
  - GIVEN list "Standard Spells" on machine A
  - WHEN exported and imported on machine B
  - THEN all spells MUST resolve by hash
  - AND list MUST be identical

- [ ] **Test: List resilience to spell updates**
  - GIVEN list references "Fireball" hash A
  - WHEN "Fireball" is updated (hash B)
  - THEN list MUST still reference hash A
  - AND user MUST manually update list if desired

## End-to-End Integration Tests

### Full Workflow: Create → Export → Import
- [ ] **Test: Complete spell lifecycle**
  1. Create spell "Test Spell" on machine A
  2. Verify hash is computed
  3. Export spell to bundle
  4. Import bundle on machine B
  5. Verify hash matches
  6. Add spell to character on machine B
  7. Export character
  8. Import character on machine C
  9. Verify spell resolves correctly

### Performance Tests
- [ ] **Test: Search performance with 10K spells**
  - GIVEN database with 10,000 spells (half legacy, half structured)
  - WHEN searching for "fire"
  - THEN results MUST return within 100ms

- [ ] **Test: Import performance**
  - GIVEN bundle with 1,000 spells
  - WHEN importing
  - THEN import MUST complete within 10 seconds
  - AND deduplicate by hash efficiently

## End-to-End Workflows

### Workflow: Power User Import/Edit/Export Cycle
- [ ] **E2E: Complete Data Management Workflow**
  1. User imports spell bundle (100 spells)
  2. Import detects 10 duplicates by hash
  3. Dialog shows: "10 spells already exist. Skip or replace?"
  4. User chooses "Skip"
  5. 90 new spells imported successfully
  6. User selects spell "Enhanced Fireball"
  7. Opens spell in editor
  8. Changes damage from "10d6" to "12d6"
  9. Saves spell (hash updates from A to B)
  10. User adds spell to character "Wizard Supreme"
  11. Character now references hash B
  12. User adds spell to custom list "Campaign Spells"
  13. User exports character + list + modified spell
  14. Fresh database on machine B
  15. Import character export
  16. Verify spell resolves by hash B
  17. Verify character sheet shows correct spell
  18. Verify spell list contains correct spell

### Workflow: Collaborative Spell Library
- [ ] **E2E: Multi-User Spell Sharing**
  1. **User A (DM) on Windows:**
     - Creates 50 custom campaign spells
     - Exports as "campaign_spells.json"
     - Shares file with players via Discord/email
  2. **User B (Player 1) on macOS:**
     - Imports "campaign_spells.json"
     - All 50 spells imported (hash-based deduplication)
     - Creates character "Fighter"
     - Adds 10 spells from campaign bundle
     - Exports character as "fighter.json"
  3. **User C (Player 2) on Linux:**
     - Imports "campaign_spells.json"
     - All 50 spells imported (same hashes as User B)
     - Imports "fighter.json" (from User B)
     - Character resolves all 10 spells correctly
     - Verifies spell details match User B's exactly
  4. **User A (DM) later:**
     - Updates spell "Improved Lightning" (hash changes A → B)
     - Exports updated spell bundle
  5. **Users B & C:**
     - Import updated bundle
     - Both versions exist (hash A and hash B)
     - Existing characters still reference hash A
     - New characters can use hash B

### Workflow: Campaign Management
- [ ] **E2E: DM Maintains Campaign Spell Lists**
  1. DM creates spell list "Approved Campaign Spells"
  2. Adds 30 spells by hash
  3. Exports list + all referenced spells
  4. Sends to 4 players
  5. Each player imports on different OS (Windows/Mac/Linux)
  6. All players create characters using list
  7. DM modifies one spell (balance adjustment)
  8. Spell hash changes (A → B)
  9. DM exports updated spell only
  10. Players import updated spell
  11. Player characters still reference hash A (version pinning)
  12. New characters can choose hash B
  13. DM creates new character using hash B
  14. Verifies both versions coexist

### Error Scenarios

#### Error: Corrupted Import Bundle
- [ ] **E2E: Handle Invalid Import Data**
  - GIVEN user attempts to import corrupted JSON file
  - WHEN import process starts
  - THEN error dialog appears: "Import failed: Invalid JSON format"
  - AND no partial imports (rollback)
  - AND user can select different file

#### Error: Missing Spell Reference
- [ ] **E2E: Handle Missing Spell in Character**
  - GIVEN character references spell hash X
  - WHEN opening character sheet
  - AND spell hash X not in database
  - THEN placeholder shows: "Unknown Spell (hash: abc123...)"
  - AND character sheet doesn't crash
  - AND user can remove placeholder or import missing spell

#### Error: Vault Integrity Check Failure
- [ ] **E2E: Detect Corrupted Vault File**
  - GIVEN vault file `abc123.json` (manually edited)
  - WHEN loading vault
  - THEN integrity check computes hash
  - AND detects mismatch (filename ≠ content hash)
  - AND warning shows: "Vault file corrupted: abc123.json. Recompute hash?"
  - AND user can choose to recompute or delete

#### Error: FTS Migration Failure
- [ ] **E2E: Handle FTS Rebuild Errors**
  - GIVEN database with 10,000 spells
  - WHEN FTS migration encounters corrupted record
  - THEN error logged: "Skipping spell ID 5423: invalid data"
  - AND migration continues (doesn't crash)
  - AND final report shows: "Success: 9,999 | Errors: 1"

### Bulk Operations

#### Bulk Import Performance
- [ ] **E2E: Import 5,000 Spells**
  - GIVEN bundle with 5,000 spells
  - WHEN importing
  - THEN progress bar shows: "Importing spell 1,234 of 5,000..."
  - AND ETA updates every 100 spells
  - AND import completes within 45 seconds
  - AND all hashes computed correctly

#### Bulk Export with Character/List Dependencies
- [ ] **E2E: Export Character with 100+ Spell References**
  - GIVEN character with 100 memorized spells
  - WHEN exporting character
  - THEN export includes character data + all 100 spell definitions
  - AND export file size reasonable (< 5MB)
  - AND re-import resolves all 100 spells by hash

