# Tasks: Integrate Spell Hashing into Ecosystem

## Search Implementation
- [ ] Implement FTS5 table:
    - [ ] Create `spells_fts` virtual table.
    - [ ] Define triggers to update FTS on insert/update/delete.
    - [ ] Index searchable fields: name, description, tags, text preview (sync'd from `canonical_data`).
- [ ] Update search query builders:
    - [ ] Switch from `LIKE` queries to `MATCH`.
    - [ ] Implement ranking by relevance.
    - [ ] Support boolean operators (AND, OR, NOT).

## Import/Export
- [ ] Implement Import Logic:
    - [ ] Parse imported JSON bundle.
    - [ ] Validate schema version (Spec #1 logic).
    - [ ] Compute hash for each imported spell.
    - [ ] Check for existing hash in local DB (Deduplication).
    - [ ] If new hash + new name => Insert.
    - [ ] If existing hash => Skip insertion, but merge metadata (new tags, source_refs).
    - [ ] If new hash + existing name => Prompt Conflict Resolution.
- [ ] Implement Export Logic:
    - [ ] Export `CanonicalSpell` JSON structure.
    - [ ] Include `schema_version` metadata.
    - [ ] Support bundle export (multiple spells).

### Import Conflict Resolution UI
- [ ] Design conflict resolution dialog:
    - [ ] Show when importing spell with same name but different hash.
    - [ ] Display spell comparison:
        - [ ] Side-by-side diff view (old vs. new).
        - [ ] Highlight changed fields (damage, range, description).
        - [ ] Show both hashes for reference.
    - [ ] Provide resolution options:
        - [ ] "Keep Existing" - Skip import, retain current version.
        - [ ] "Replace with New" - Overwrite with imported version.
        - [ ] "Keep Both" - Import as separate spell (append version to name).
        - [ ] "Apply to All" - Use same choice for remaining conflicts.
- [ ] Implement bulk conflict resolution:
    - [ ] When 10+ conflicts detected, show summary dialog first:
        - [ ] "Found 15 conflicts. Choose default action:".
        - [ ] Options: Skip All, Replace All, Keep All, Review Each.
    - [ ] If "Review Each", show conflict dialog for each spell.
    - [ ] Progress indicator: "Conflict 3 of 15".

## Vault Implementation
- [ ] Update vault storage:
    - [ ] Store spell files using hash as filename: `{hash}.json`.
    - [ ] Ensure file content matches hash (integrity check).
    - [ ] Implement vault housekeeping (Garbage Collection):
        - [ ] Find and remove files in vault not referenced by any spell in DB.
    - [ ] Implement Windows path length safety:
        - [ ] Verify full path to vault file < 260 chars.
        - [ ] Log warning if path limit exceeded; provide mitigation (shorter base path).
    - [ ] Implement garbage collection for orphaned files (optional).

## Spell List Integration
- [ ] Migrate Spell Lists:
    - [ ] Update list items to reference `content_hash` instead of ID.
    - [ ] Create migration for existing lists (resolve IDs to hashes).
    - [ ] Handle missing spells (show "Unknown Spell {id}" placeholder).

## Character Integration
- [ ] Update Character Spellbook:
    - [ ] Reference spells by `content_hash`.
    - [ ] Support specific version pinning (hash) vs. latest version.
    - [ ] Handle missing spells gracefully.

## Security Review
### SQL Injection & Input Validation
- [ ] **SQL injection prevention:**
    - [ ] Audit all database queries use parameterized statements.
    - [ ] Review FTS query construction (no string concatenation).
    - [ ] Test with malicious inputs (e.g., `'; DROP TABLE spells;--`).
- [ ] **Input validation:**
    - [ ] Validate all fields against schema before insertion.
    - [ ] Reject spells with excessively long fields (DoS prevention).
    - [ ] Sanitize spell descriptions/names before display (XSS prevention).

### Import Security
- [ ] **File size limits:**
    - [ ] Reject imports > 100MB (DoS prevention).
    - [ ] Warn for imports > 10MB (confirm before processing).
- [ ] **JSON structure validation:**
    - [ ] Validate JSON schema before parsing.
    - [ ] Reject deeply nested objects (> 50 levels).
    - [ ] Limit array sizes (e.g., max 10,000 spells per import).
- [ ] **Content sanitization:**
    - [ ] Sanitize spell names/descriptions before display.
    - [ ] Strip potentially malicious HTML/scripts.
    - [ ] Validate all URLs in source_refs (no javascript: protocol).

## Documentation
- [ ] User documentation:
    - [ ] Update import/export documentation:
        - [ ] Explain hash-based deduplication (duplicates skipped automatically).
        - [ ] Document spell versioning with hashes.
        - [ ] Provide examples of import scenarios (new spells, duplicates, updated versions).
    - [ ] Create vault documentation:
        - [ ] Explain hash-based file naming (`{hash}.json`).
        - [ ] Document vault integrity checks.
