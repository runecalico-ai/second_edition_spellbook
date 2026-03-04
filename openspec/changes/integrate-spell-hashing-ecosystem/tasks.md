# Tasks: Integrate Spell Hashing into Ecosystem

## 0. Foundation
- [x] 0.1 Execute the v1->v2 Bulk Migration (`migrate_all_spells_to_v2`).
    - [x] Define or document the trigger for running the bulk migration (e.g. Settings, first launch after upgrade, or manual Tauri invocation); see design "Migration trigger".
    - [x] Treat this as a hard prerequisite gate for hash-reference migrations and hash-based import/export behavior.
    - [x] Ensure all `spell.content_hash` entries in the SQLite DB are recalculated according to the v2 serialization contract (including `raw_legacy_value`).
    - [x] Verify that the migration handles 5e unit remapping and `dm_guidance` cleanup.

## 1. Search Implementation
- [x] 1.1 Extend FTS5 for spell search (Migration 0014):
    - [x] DROP existing triggers: `spell_ai`, `spell_ad`, `spell_au`.
    - [x] DROP existing `spell_fts` virtual table.
    - [x] CREATE new `spell_fts` with columns: name, description, material_components, tags, source, author, canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text, canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text.
    - [x] CREATE new triggers (`spell_ai`, `spell_ad`, `spell_au`) that extract canonical text fields from `canonical_data` via `json_extract()`. DELETE/UPDATE triggers must pass `old.*` values (including `json_extract(old.canonical_data, ...)`) in the FTS5 `'delete'` command — not empty strings.
    - [x] Repopulate FTS via explicit `INSERT INTO spell_fts(...) SELECT ... json_extract(canonical_data, ...) FROM spell` (NOT `VALUES('rebuild')` — rebuild reads content table columns by name but canonical text columns don't exist on the `spell` table).
    - [x] Index searchable fields: name, description, tags, plus text-bearing fields from RangeSpec, DurationSpec, AreaSpec, SpellCastingTime, SavingThrowSpec, SpellDamageSpec, MagicResistanceSpec, ExperienceComponentSpec in `canonical_data`.
- [x] 1.2 Update search query builders:
    - [x] Switch from `LIKE` queries to `MATCH`.
    - [x] Implement ranking by relevance.
    - [x] Implement two-tier search: basic mode (escape all, phrase search) and advanced mode (detect uppercase AND/OR/NOT, pass as operators; NEAR is always escaped; escape remaining special chars; reject malformed expressions and fall back to basic mode).
- [x] 1.3 Address code review findings (review-task-1_2026_03_03_14_00):
    - [x] Leading NOT → invalid FTS5 syntax (guard + test fix).
    - [x] LIKE wildcard escaping in all 6 filter branches + unit tests.
    - [x] Missing verification-plan test 2 (single-token Fireball vs Frostbolt).
    - [x] Duplicate test fixed; empty-query tests added.
    - [x] Minor: migration comments, doc comments, col-prefix guard, LIMIT constant, BTreeSet, setup_fts_db dedup, empty-string filter bypass. Three-pass re-review passed.

## 2. Import/Export
- [ ] 2.1 Implement Import Logic:
    - [ ] **Pipeline order (per spell):** Normalize/truncate metadata (tags ≤100, source_refs ≤50) → validate schema and bundle/schema version → run migration if needed (e.g. `migrate_to_v2()`) → compute content hash → deduplication and conflict detection.
    - [ ] Parse imported JSON bundle.
    - [ ] Normalize and truncate metadata cardinality limits before schema validation (`tags` max 100 unique alphabetically sorted; `source_refs` max 50 unique using SourceRef dedup policy).
    - [ ] Validate `bundle_format_version` (required field if payload is a bundle object with a `spells` array; reject if missing or > supported version. Must not fail single-spell imports where `bundle_format_version` is correctly omitted).
    - [ ] Validate schema version (Spec #1 logic; warn and continue best-effort if > app's current version, aligned with schema versioning policy).
    - [ ] Execute migration pipeline for lower versions (e.g. `migrate_to_v2()`) and full re-normalization.
    - [ ] Compute hash for each imported spell.
    - [ ] Verify imported `content_hash` matches recomputed hash; warn user on mismatch (tampered import) and use recomputed hash.
    - [ ] Check for existing hash in local DB (Deduplication).
    - [ ] If new hash + new name => Insert.
    - [ ] If existing hash => Skip insertion, but merge metadata (new tags, source_refs). **Deduplicate source_refs by key policy: by URL when both refs have URL, otherwise by `(system, book, page, note)`.** (Merge rules apply ONLY to skipped duplicates, not Replacements).
    - [ ] If new hash + existing name => Prompt Conflict Resolution.
    - [ ] Enforce tag merge limit: union of existing + imported, cap at 100 (alphabetically sorted).
    - [ ] Enforce source_refs merge limit: existing first + new appended, cap at 50.
    - [ ] Produce import result summary: imported count, duplicates skipped (with metadata merged), conflicts resolved, failures with spell name and error reason.
    - [ ] Create `change_log` entries when "Replace with New" updates a spell row (record field-level changes by `spell_id`).
- [ ] 2.2 Implement Export Logic:
    - [ ] Export `CanonicalSpell` JSON structure.
    - [ ] Set exported `id` to the spell's `content_hash`.
    - [ ] Include required `schema_version` metadata in single-spell and bundle exports.
    - [ ] Include required `bundle_format_version` in bundle exports.
    - [ ] Ensure single-spell exports do not require or emit `bundle_format_version`.
    - [ ] Support bundle export (multiple spells).

- [ ] 2.3 Baseline capability alignment:
    - [ ] Align `openspec/specs/importers/spec.md` deduplication semantics with hash-first identity and name-collision conflict handling.

### 3. Import Conflict Resolution UI
- [ ] 3.1 Design conflict resolution dialog:
    - [ ] Show when importing spell with same name but different hash.
    - [ ] Display spell comparison:
        - [ ] Side-by-side diff view (old vs. new).
        - [ ] Highlight changed fields (damage, range, description).
        - [ ] Show both hashes for reference.
    - [ ] Provide resolution options:
        - [ ] "Keep Existing" - Skip import, retain current version.
        - [ ] "Replace with New" - Overwrite with imported version. Perform a cascading update of `content_hash` in `character_class_spell` and `artifact` from old hash to new hash. Overwrite metadata strictly without merging.
        - [ ] "Keep Both" - Import as separate spell (append numeric suffix to name: (1), (2), (3), ...).
        - [ ] "Apply to All" - Use same choice for remaining conflicts.
- [ ] 3.2 Implement bulk conflict resolution:
    - [ ] When ≥ 10 conflicts detected, show summary dialog first:
        - [ ] "Found 15 conflicts. Choose default action:".
        - [ ] Options: Skip All, Replace All, Keep All, Review Each.
    - [ ] If "Review Each", show conflict dialog for each spell.
    - [ ] Progress indicator: "Conflict 3 of 15".

## 4. Vault Implementation
- [ ] 4.1 Update vault storage:
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
    - [ ] Implement settings key `vault.integrityCheckOnOpen`:
        - [ ] `true`: run integrity check automatically when vault opens.
        - [ ] `false`: skip open-time integrity check (integrity check before GC remains required).

## 5. Spell List Integration
- [ ] 5.1 Migrate Spell Lists (per-class known/prepared sets in `character_class_spell`) (Migration 0015):
    - [ ] Add `spell_content_hash TEXT` column to `character_class_spell`.
    - [ ] Backfill from `spell.content_hash` WHERE `spell.id = character_class_spell.spell_id`.
    - [ ] Add index: `CREATE INDEX idx_ccs_spell_content_hash ON character_class_spell(spell_content_hash)`.
    - [ ] Add unique constraint via index: `CREATE UNIQUE INDEX idx_ccs_character_hash_list ON character_class_spell(character_class_id, spell_content_hash, list_type)` (parallel to existing `UNIQUE(character_class_id, spell_id, list_type)` during transition).
    - [ ] Update application reads/joins to use `spell_content_hash`.
    - [ ] Handle missing spells:
        - [ ] Show "Spell no longer in library" placeholder.
        - [ ] Provide "Remove" action to clear the broken reference.

## 6. Artifact Integration
- [ ] 6.1 Migrate artifact spell references to content hash (Migration 0015):
    - [ ] Add `spell_content_hash TEXT` to `artifact` table; backfill from `spell.content_hash` WHERE `spell.id = artifact.spell_id`.
    - [ ] Add index: `CREATE INDEX idx_artifact_spell_content_hash ON artifact(spell_content_hash)`.
    - [ ] Use `spell_content_hash` for reads/joins; keep `spell_id` for migration period (see design).
    - [ ] Note: `artifact.hash` is the artifact's own file hash; `artifact.spell_content_hash` is the referenced spell's canonical content hash (see design Decision #5).

## 7. Character Integration

> **Note:** Character Integration and Spell List Integration (above) both operate on the `character_class_spell` table. The split reflects different UI contexts (character sheet vs. class spell management) but the underlying DB migration is shared (Migration 0015). Tasks below focus on the character-sheet UI behavior.

- [ ] 7.1 Update Character Spellbook:
    - [ ] Reference spells by `content_hash` (pinned version).
    - [ ] If that hash is missing from the library:
        - [ ] Show "Spell no longer in library" placeholder.
        - [ ] Provide "Remove" action to clear the broken reference.
    - [ ] Implement explicit spell upgrade:
        - [ ] When character references Hash A and Hash B exists for the same spell name, offer "Upgrade" action.
        - [ ] On upgrade, update `spell_content_hash` from Hash A to Hash B.

## Security Review
### 8. SQL Injection & Input Validation
- [ ] 8.1 **SQL injection prevention:**
    - [ ] Audit all database queries use parameterized statements.
    - [ ] FTS: use a single bound parameter for MATCH (e.g. `WHERE spell_fts MATCH ?`) and sanitize/escape FTS5 special characters in application code before binding (reference SQLite FTS5 docs for the full list).
    - [ ] Review FTS query construction (no string concatenation).
    - [ ] Test with malicious inputs (e.g., `'; DROP TABLE spell;--`).
- [ ] 8.2 **Input validation:**
    - [ ] Validate all fields against schema before insertion after required normalization/truncation preprocessing.
    - [ ] Reject spells with excessively long fields (DoS prevention).
    - [ ] Sanitize spell descriptions/names before display (XSS prevention).

### 9. Import Security
- [ ] 9.1 **File size limits:**
    - [ ] Reject imports > 100MB (DoS prevention).
    - [ ] Warn for imports > 10MB (confirm before processing).
- [ ] 9.2 **JSON structure validation:**
    - [ ] Validate JSON schema before parsing.
    - [ ] Reject deeply nested objects (> 50 levels).
    - [ ] Limit array sizes (e.g., max 10,000 spells per import).
- [ ] 9.3 **Content sanitization:**
    - [ ] Sanitize spell names/descriptions before display.
    - [ ] Strip potentially malicious HTML/scripts.
    - [ ] Validate all URLs in source_refs (allowlist: http, https, mailto; reject javascript:, data:, ipfs:, etc.).
    - [ ] Implement settings key `import.sourceRefUrlPolicy`:
        - [ ] Default `drop-ref`: remove invalid SourceRef, continue importing spell with warning.
        - [ ] Optional `reject-spell`: reject entire spell if any SourceRef URL fails validation.

## 10. Performance Validation
- [ ] 10.1 Benchmark vault GC:
    - [ ] Verify GC for 10,000 vault files completes in < 30 seconds.
- [ ] 10.2 Benchmark FTS rebuild:
    - [ ] Verify Migration 0014 FTS rebuild/repopulate for 10,000 spells completes in < 60 seconds.

## 11. Documentation
- [ ] 11.1 User documentation:
    - [ ] Update import/export documentation:
        - [ ] Explain hash-based deduplication (duplicates skipped automatically).
        - [ ] Document spell versioning with hashes.
        - [ ] Document conflict resolution: Keep Existing, Replace with New, Keep Both (numeric suffix (1), (2), …), Apply to All (current session only).
        - [ ] Provide examples of import scenarios (new spells, duplicates, updated versions).
    - [ ] Create vault documentation:
        - [ ] Explain hash-based file naming (`spells/{content_hash}.json`).
        - [ ] Document vault integrity checks.
