# Tasks: Add Spell Canonical Hashing

## Specification
- [x] Define JSON Schema (`spell.schema.json`) covering all spell fields (School, Sphere, Calc Props).
- [x] Define Serialization Contract (`canonical-serialization.md`) with sorting/normalization rules.
- [ ] Review and approve schema by core team.

## Backend Implementation (Rust)
- [ ] Add `serde_json` and `sha2` (or similar) dependencies if missing.
- [ ] Create `CanonicalSpell` struct in Rust that strictly matches `spell.schema.json` (or use `serde` macros to enforce strict ordering/renaming).
- [ ] Implement `to_canonical_json(&self) -> String` method for Spell models.
    - [ ] Ensure recursive key sorting (potentially needed via custom serializer or `serde_json::value::Value` manipulation).
    - [ ] Ensure array sorting for Tags, Classes, Subschools, Descriptors.
- [ ] Implement `compute_hash(&self) -> String` (SHA-256).
- [ ] Add unit tests verifying the hashing contract against the examples in `canonical-serialization.md`.

## Database / Migration
- [ ] Add `content_hash` column to `spells` table (if not using as PK).
    - *Note:* If replacing ID, massive migration required. For now, likely an indexed column.
- [ ] Write migration script to compute hashes for all existing spells in the DB.

## Import/Export Logic
- [ ] Update Import logic (`import.rs`) to compute hash of incoming spell.
- [ ] Update deduplication strategy: Look up by Hash first. If match -> Exact duplicate (skip or update refs).
- [ ] Update Export logic to include the canonical hash.

## Validation
- [ ] Verify that `Fireball` imported from Source A has same hash as `Fireball` from Source B if fields match.
- [ ] Verify that changing `description` changes the hash.

## Frontend Implementation
- [ ] Create `StructuredFieldInput` component (Duration/Range/Area/CastingTime)
- [ ] Update `SpellEditor.tsx`:
    - [ ] Integrate structured inputs
    - [ ] Add V/S/M checkboxes
    - [ ] Update school/sphere/tag selection
- [ ] Update `SpellDetail.tsx` to show Hash and formatted structures

## Search Implementation
- [ ] Update `search.rs` / FTS indexing:
    - [ ] Map `duration.text`, `range.text`, etc. to the FTS virtual table.
- [ ] Ensure `tags` and `subschools` arrays are queryable (or flattened for FTS).

## Vault Implementation
- [ ] Update `storage.rs` (or relevant Vault logic):
    - [ ] Implement file naming strategy using Hash (e.g. `{hash}.json`).
    - [ ] Implement integrity check on load (Hash(Content) == Filename).
- [ ] Migrate existing files (if any exist in flat file format) to hashed filenames.

## Character Implementation
- [ ] Update `models/character.rs`:
    - [ ] Change spell storage (memorized/spellbook) to reference `content_hash`.
- [ ] Update Character UI:
    - [ ] Resolve spell details by Hash.
    - [ ] Handle "Missing Spell" case (Hash found in char, but not in DB) - display placeholder or embedded data.

## Spell List Integration (`spec-4_1-spell-list_spec.md`)
- [ ] Update `SpellListEntry` model:
    - [ ] Change `spell_id` to `spell_hash`.
- [ ] Update Spell List logic:
    - [ ] Validating inclusion by Hash.
    - [ ] Ensure "Deterministic Spell Binding" requirement uses portable hashes.
