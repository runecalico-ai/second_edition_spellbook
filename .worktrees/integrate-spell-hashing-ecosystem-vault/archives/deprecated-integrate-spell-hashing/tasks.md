# Tasks: Ecosystem Integration

## Search Implementation
**Spec:** [specs/search/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing/specs/search/spec.md)

- [ ] Update FTS schema for structured fields:
    - [ ] Create new FTS virtual table or add columns for `.text` extraction.
    - [ ] Map `range.text`, `duration.text`, `casting_time.text`, `area.text` to FTS columns.
    - [ ] Ensure `tags` array (stored as JSON) is queryable (comma-separated or JSON extraction).
    - [ ] Ensure `subschools` and `descriptors` arrays are queryable.
- [ ] Update `search.rs` indexing logic:
    - [ ] Extract `.text` fields from structured objects when building FTS index.
    - [ ] Handle legacy spells with string fields (fallback to original string).
    - [ ] Index `class_list` array (extract individual classes).
- [ ] Migrate existing FTS indexes:
    - [ ] Rebuild FTS index for all spells with new schema.
    - [ ] Verify search results match pre-migration behavior.
- [ ] Test backwards compatibility:
    - [ ] Verify existing search queries still work (e.g., "range:yards").
    - [ ] Test edge cases (spells with only `.text`, spells with full structured data).
    - [ ] Performance test: ensure FTS index rebuild completes in acceptable time.

## Import/Export
**Spec:** [specs/import-export/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing/specs/import-export/spec.md)

- [ ] Update Import logic:
    - [ ] Deduplicate by `content_hash` instead of `(name, level, source)`.
    - [ ] If incoming spell has matching hash, skip import (already exists).
    - [ ] If hash differs but name matches, treat as new version (user chooses to keep both or replace).
    - [ ] Validate imported spells against schema before computing hash.
- [ ] Update Export logic:
    - [ ] Set `id` field to `content_hash` in exported JSON.
    - [ ] Exclude local database ID from export.
    - [ ] Include metadata fields (`source_refs`, `edition`, etc.) for human readability.
- [ ] Test import/export roundtrip:
    - [ ] Export spells, import on fresh database, verify hashes match.
    - [ ] Test cross-platform portability (Windows ↔ macOS ↔ Linux).

## Vault Implementation
**Spec:** [specs/vault/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing/specs/vault/spec.md)

- [ ] Implement file naming strategy:
    - [ ] Save spell files as `{content_hash}.json` (e.g., `abc123...def.json`).
    - [ ] Ensure filename uniqueness (hash collision = same file).
- [ ] Implement integrity check on load:
    - [ ] Compute hash of loaded file content.
    - [ ] Compare to filename hash.
    - [ ] If mismatch, warn user (file corrupted or manually edited).
- [ ] Handle vault migration:
    - [ ] Rename existing vault files from old naming scheme to hash-based.
    - [ ] Or: Keep old files, new files use hash naming (hybrid approach).

## Spell List Integration
**Spec:** [specs/spellbooks/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing/specs/spellbooks/spec.md)

- [ ] Update `SpellListEntry` schema:
    - [ ] Add `spell_hash` field (TEXT, stores content_hash).
    - [ ] Deprecate or remove `spell_id` field (local DB ID).
    - [ ] Create migration to populate `spell_hash` from existing `spell_id`.
- [ ] Test list portability:
    - [ ] Create list "Standard Wizard Spells" with hash references.
    - [ ] Export list, import on different machine.
    - [ ] Verify all spells resolve by hash correctly.

## Character Integration
**Spec:** [specs/characters/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing/specs/characters/spec.md)

- [ ] Update Character memorization schema:
    - [ ] Add `spell_hash` field to character spell references.
    - [ ] Migrate existing character spell slots to use hashes.
- [ ] Update lookup logic:
    - [ ] Resolve spell references by hash instead of ID.
    - [ ] Handle missing spells gracefully (spell not installed, show placeholder).
- [ ] Test version independence:
    - [ ] Character references spell Hash A.
    - [ ] Import new version of spell (Hash B).
    - [ ] Verify character still shows Hash A (version pinning).
- [ ] Test portability:
    - [ ] Export character, import on different machine.
    - [ ] Verify spells resolve correctly if same hash exists.

## Documentation
- [ ] User documentation:
    - [ ] Update import/export documentation:
        - [ ] Explain hash-based deduplication (duplicates skipped automatically).
        - [ ] Document spell versioning with hashes.
        - [ ] Provide examples of import scenarios (new spells, duplicates, updated versions).
    - [ ] Create vault documentation:
        - [ ] Explain hash-based file naming (`{hash}.json`).
        - [ ] Document vault integrity checks.
        - [ ] Provide troubleshooting for corrupted vault files.
    - [ ] Update character management documentation:
        - [ ] Explain how characters reference spells by hash.
        - [ ] Document spell version independence (character keeps old version).
        - [ ] Provide examples of character portability.
    - [ ] Create spell list documentation:
        - [ ] Document spell list portability with hash references.
        - [ ] Explain cross-machine sharing of spell lists.
- [ ] Developer documentation:
    - [ ] Document search FTS integration:
        - [ ] How to index `.text` fields from structured data.
        - [ ] Backwards compatibility with legacy string fields.
    - [ ] Document import/export API:
        - [ ] Hash-based deduplication logic.
        - [ ] Conflict resolution strategies.
    - [ ] Document vault API:
        - [ ] File naming conventions.
        - [ ] Integrity check implementation.

## Import Conflict Resolution UI
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
        - [ ] "Found 15 conflicts. Choose default action:"
        - [ ] Options: Skip All, Replace All, Keep All, Review Each.
    - [ ] If "Review Each", show conflict dialog for each spell.
    - [ ] Progress indicator: "Conflict 3 of 15".
- [ ] Add conflict resolution to verification:
    - [ ] Test: Single conflict resolution (choose "Replace").
    - [ ] Test: Bulk conflict (15 conflicts, "Keep Both").
    - [ ] Test: Conflict cancellation (user cancels, no changes made).

## Security Review
- [ ] Import security validation:
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
- [ ] Add security tests:
    - [ ] Test: Import bundle with XSS in spell name.
    - [ ] Test: Import bundle with SQL injection in description.
    - [ ] Test: Import 150MB file (should be rejected).
    - [ ] Test: Import with 20,000 spells (should be limited or batched).

