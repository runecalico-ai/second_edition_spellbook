# Tasks: Integrate Spell Hashing into Ecosystem

## Search Implementation
- [ ] Extend FTS5 for spell search:
    - [ ] Extend `spell_fts` (or recreate with new columns) to align with `spell` table schema.
    - [ ] Define triggers to update FTS on insert/update/delete.
    - [ ] Index searchable fields: name, description, tags, and text derived from structured fields in `canonical_data` (the human-readable text those fields generate, not the complex types themselves).
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
        - [ ] "Keep Both" - Import as separate spell (append numeric suffix to name: (1), (2), (3), ...).
        - [ ] "Apply to All" - Use same choice for remaining conflicts.
- [ ] Implement bulk conflict resolution:
    - [ ] When 10+ conflicts detected, show summary dialog first:
        - [ ] "Found 15 conflicts. Choose default action:".
        - [ ] Options: Skip All, Replace All, Keep All, Review Each.
    - [ ] If "Review Each", show conflict dialog for each spell.
    - [ ] Progress indicator: "Conflict 3 of 15".

## Vault Implementation
- [ ] Update vault storage:
    - [ ] Store spell files under vault subfolder: `spells/{content_hash}.json`.
    - [ ] Ensure file content matches hash (integrity check).
    - [ ] Implement vault housekeeping (Garbage Collection):
        - [ ] Find and remove vault spell files not referenced by any spell in DB (feature is required).
        - [ ] Decide when GC runs: on-demand only, or also periodic/after import (implementation choice).
    - [ ] Implement Windows path length safety:
        - [ ] Verify full path to vault file < 260 chars.
        - [ ] Log warning if path limit exceeded; provide mitigation (shorter base path).

## Spell List Integration
- [ ] Migrate Spell Lists (per-class known/prepared sets in `character_class_spell`):
    - [ ] Update list items to reference `content_hash` instead of ID.
    - [ ] Create migration for existing lists (resolve IDs to hashes).
    - [ ] Handle missing spells (show "Spell no longer in library" placeholder).

## Artifact Integration
- [ ] Migrate artifact spell references to content hash:
    - [ ] Add `spell_content_hash TEXT` to `artifact` table; backfill from `spell.content_hash`.
    - [ ] Use `spell_content_hash` for reads/joins; keep `spell_id` for migration period (see design).

## Character Integration
- [ ] Update Character Spellbook:
    - [ ] Reference spells by `content_hash` (pinned version).
    - [ ] If that hash is missing from the library, show "Spell no longer in library" and optionally offer to remove the reference.

## Security Review
### SQL Injection & Input Validation
- [ ] **SQL injection prevention:**
    - [ ] Audit all database queries use parameterized statements.
    - [ ] FTS: use a single bound parameter for MATCH (e.g. `WHERE spell_fts MATCH ?`) and sanitize/escape FTS5 special characters in application code before binding (reference SQLite FTS5 docs for the full list).
    - [ ] Review FTS query construction (no string concatenation).
    - [ ] Test with malicious inputs (e.g., `'; DROP TABLE spell;--`).
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
        - [ ] Document conflict resolution: Keep Existing, Replace with New, Keep Both (numeric suffix (1), (2), …), Apply to All (current session only).
        - [ ] Provide examples of import scenarios (new spells, duplicates, updated versions).
    - [ ] Create vault documentation:
        - [ ] Explain hash-based file naming (`spells/{content_hash}.json`).
        - [ ] Document vault integrity checks.
