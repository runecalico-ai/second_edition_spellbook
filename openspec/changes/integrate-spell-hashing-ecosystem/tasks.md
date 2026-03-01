# Tasks: Integrate Spell Hashing into Ecosystem

## Search Implementation
- [ ] Extend FTS5 for spell search (Migration 0014):
    - [ ] DROP existing triggers: `spell_ai`, `spell_ad`, `spell_au`.
    - [ ] DROP existing `spell_fts` virtual table.
    - [ ] CREATE new `spell_fts` with columns: name, description, material_components, tags, source, author, canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text.
    - [ ] CREATE new triggers (`spell_ai`, `spell_ad`, `spell_au`) that extract canonical text fields from `canonical_data` via `json_extract()`. DELETE/UPDATE triggers must pass `old.*` values (including `json_extract(old.canonical_data, ...)`) in the FTS5 `'delete'` command — not empty strings.
    - [ ] Repopulate FTS via explicit `INSERT INTO spell_fts(...) SELECT ... json_extract(canonical_data, ...) FROM spell` (NOT `VALUES('rebuild')` — rebuild reads content table columns by name but canonical text columns don't exist on the `spell` table).
    - [ ] Index searchable fields: name, description, tags, plus `.text` fields from RangeSpec, DurationSpec, AreaSpec, SpellCastingTime in `canonical_data`.
- [ ] Update search query builders:
    - [ ] Switch from `LIKE` queries to `MATCH`.
    - [ ] Implement ranking by relevance.
    - [ ] Implement two-tier search: basic mode (escape all, phrase search) and advanced mode (detect uppercase AND/OR/NOT, pass as operators; NEAR is always escaped; escape remaining special chars; reject malformed expressions and fall back to basic mode).

## Import/Export
- [ ] Implement Import Logic:
    - [ ] Parse imported JSON bundle.
    - [ ] Validate `bundle_format_version` (required field; reject if missing or > supported version).
    - [ ] Validate schema version (Spec #1 logic; reject if > app's current version).
    - [ ] Compute hash for each imported spell.
    - [ ] Verify imported `content_hash` matches recomputed hash; warn user on mismatch (tampered import) and use recomputed hash.
    - [ ] Check for existing hash in local DB (Deduplication).
    - [ ] If new hash + new name => Insert.
    - [ ] If existing hash => Skip insertion, but merge metadata (new tags, source_refs).
    - [ ] If new hash + existing name => Prompt Conflict Resolution.
    - [ ] Enforce tag merge limit: union of existing + imported, cap at 100 (alphabetically sorted).
    - [ ] Enforce source_refs merge limit: existing first + new appended, cap at 50.
    - [ ] Produce import result summary: imported count, duplicates skipped (with metadata merged), conflicts resolved, failures with spell name and error reason.
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
    - [ ] When ≥ 10 conflicts detected, show summary dialog first:
        - [ ] "Found 15 conflicts. Choose default action:".
        - [ ] Options: Skip All, Replace All, Keep All, Review Each.
    - [ ] If "Review Each", show conflict dialog for each spell.
    - [ ] Progress indicator: "Conflict 3 of 15".

## Vault Implementation
- [ ] Update vault storage:
    - [ ] Store spell files under vault subfolder: `spells/{content_hash}.json`.
    - [ ] Ensure file content matches hash (integrity check).
    - [ ] Vault file content: write full CanonicalSpell JSON (with metadata); integrity check recomputes hash via canonical serialization contract (normalize → validate → strip metadata → JCS → SHA-256), not raw file bytes.
    - [ ] Implement vault housekeeping (Garbage Collection):
        - [ ] Find and remove vault spell files not referenced by any spell in DB (feature is required).
        - [ ] Decide when GC runs: on-demand only, or also periodic/after import (implementation choice).
    - [ ] Implement GC/import concurrency guard:
        - [ ] Prevent GC from running during active imports (mutex/lock or UI mutual exclusion).
        - [ ] GC button disabled or blocked while import is in progress.
    - [ ] Implement Windows path length safety:
        - [ ] Verify full path to vault file < 260 chars.
        - [ ] Log warning if path limit exceeded; provide mitigation (shorter base path).
    - [ ] Implement vault integrity recovery:
        - [ ] When vault file is missing but spell row exists with canonical_data, re-export the file.
        - [ ] If canonical_data is NULL, log entry as unrecoverable (do not crash).

## Spell List Integration
- [ ] Migrate Spell Lists (per-class known/prepared sets in `character_class_spell`) (Migration 0015):
    - [ ] Add `spell_content_hash TEXT` column to `character_class_spell`.
    - [ ] Backfill from `spell.content_hash` WHERE `spell.id = character_class_spell.spell_id`.
    - [ ] Add index: `CREATE INDEX idx_ccs_spell_content_hash ON character_class_spell(spell_content_hash)`.
    - [ ] Add unique constraint: `UNIQUE(character_class_id, spell_content_hash, list_type)` (parallel to existing `UNIQUE(character_class_id, spell_id, list_type)` during transition).
    - [ ] Update application reads/joins to use `spell_content_hash`.
    - [ ] Handle missing spells:
        - [ ] Show "Spell no longer in library" placeholder.
        - [ ] Provide "Remove" action to clear the broken reference.

## Artifact Integration
- [ ] Migrate artifact spell references to content hash (Migration 0015):
    - [ ] Add `spell_content_hash TEXT` to `artifact` table; backfill from `spell.content_hash` WHERE `spell.id = artifact.spell_id`.
    - [ ] Add index: `CREATE INDEX idx_artifact_spell_content_hash ON artifact(spell_content_hash)`.
    - [ ] Use `spell_content_hash` for reads/joins; keep `spell_id` for migration period (see design).
    - [ ] Note: `artifact.hash` is the artifact's own file hash; `artifact.spell_content_hash` is the referenced spell's canonical content hash (see design Decision #5).

## Character Integration

> **Note:** Character Integration and Spell List Integration (above) both operate on the `character_class_spell` table. The split reflects different UI contexts (character sheet vs. class spell management) but the underlying DB migration is shared (Migration 0015). Tasks below focus on the character-sheet UI behavior.

- [ ] Update Character Spellbook:
    - [ ] Reference spells by `content_hash` (pinned version).
    - [ ] If that hash is missing from the library:
        - [ ] Show "Spell no longer in library" placeholder.
        - [ ] Provide "Remove" action to clear the broken reference.
    - [ ] Implement explicit spell upgrade:
        - [ ] When character references Hash A and Hash B exists for the same spell name, offer "Upgrade" action.
        - [ ] On upgrade, update `spell_content_hash` from Hash A to Hash B.

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
