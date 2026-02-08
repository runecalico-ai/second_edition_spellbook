# Design: Integrate Spell Hashing into Ecosystem

## Context

The application is moving from ID-based spell identity to content-addressable identity (canonical content hash). Spec #1 defines the hashing contract and canonical serialization; Spec #2 covers migrating stored data to the new model. This change integrates that model into search, vault, import/export, spell lists, and character spellbooks.

**Current state:**

- **Search**: Legacy `spell` table has an FTS5 virtual table (`spell_fts`) indexing name, description, material_components, tags, source. Queries use this for keyword search; there is no indexing of the new structured/canonical fields.
- **Vault**: User data lives in a single SpellbookVault directory with `spellbook.db` and `attachments/`. Spell definitions are stored in the database; there is no content-addressable spell file layer yet.
- **Import/Export**: Existing flows use integer IDs; sharing spells across instances risks ID collisions and does not support safe deduplication.
- **Spell lists & characters**: Reference spells by ID; they must move to hash-based references for portability and version stability. In this change, **Spell List** means the per-class spell sets (known/prepared) stored in `character_class_spell`, not a separate list entity.

**Constraints:**

- Must not break existing data before or during migration (Spec #2 handles migration; this work consumes migrated data).
- Canonical serialization and hashing are fixed by Spec #1 and the canonical-serialization doc; this design does not redefine them.
- Local-first: no mandatory network; all validation and indexing are local.

**Stakeholders:** Users (search, import/export, conflict resolution), developers (vault GC, FTS triggers, security boundaries).

## Goals / Non-Goals

**Goals:**

- **Search**: Full-text search over spell description and over the human-readable text generated from structured fields (e.g. range, duration, area)—i.e. the text those types are composed from, not the complex types themselves—so users can find spells by content.
- **Vault**: Store spell definitions in a content-addressable way (filename = hash) so duplicate content is deduplicated and integrity is verifiable.
- **Import/Export**: Hash-based interchange (export ID = content hash), deduplication by hash, and a clear conflict-resolution flow when the same name has a different hash. **Export format:** Single-spell export = one `CanonicalSpell` JSON (optional top-level `schema_version`). Bundle export = wrapper object with `schema_version` and a `spells` array of `CanonicalSpell` (optionally a bundle format version field).
- **References**: Spell lists and character spellbooks reference spells by content hash; missing spells are handled gracefully (e.g., placeholder or clear error).
- **Security**: Rigorous validation and sanitization of imports (size limits, schema validation, no script injection), and safe FTS query construction.

**Non-Goals:**

- Defining or changing the canonical schema or hash algorithm (Spec #1).
- Migrating legacy data into the new schema (Spec #2).
- Spell editor UI or editing workflows (Spec #3: `update-spell-editor-structured-data`).
- Changing how attachments (e.g., images) are stored in the vault; only spell-definition storage is in scope for hash-based filenames.

## Decisions

### 1. FTS: Extend vs new table

- **Decision:** Extend `spell_fts` (or recreate it with additional columns) so that FTS indexes the spell description and all searchable text derived from structured data in `canonical_data`—i.e. the human-readable text those fields generate (e.g. range, duration, area), not the raw complex types. Keep FTS5 as the search engine; use triggers so the index stays in sync with spell insert/update/delete. FTS5 virtual tables do not support ALTER; extend by recreating `spell_fts` with the new columns and repopulating (e.g. via migration script).
- **Rationale:** FTS5 is already in use and matches the architecture spec (hybrid search). The intent is to search over description and over the text that structured fields are composed from, so users can find spells by content. A single FTS table aligned with the existing `spell` table keeps the model simple.
- **Alternatives considered:** (a) Keep only legacy FTS and ignore structured text — rejected because the capability spec requires indexing structured fields. (b) Replace FTS with an external search engine — rejected for local-first and complexity.

### 2. Vault spell storage: hash-named files

- **Decision:** Store spell definitions in the vault under a subfolder `spells/` as `spells/{content_hash}.json`. File content must match the hash (integrity check on read/write). The database remains the source of truth for “which spells exist”; vault files are content-addressable storage that can be GC’d when no spell references them. Vault files are written on spell insert/update (content-addressable by content hash). On spell delete, the vault file is removed by GC when no spell row references that hash (or may be deleted immediately when the last reference is removed—implementation choice).
- **Rationale:** Content-addressable storage gives deduplication, safe sharing, and integrity. Using the same hash as in the DB and in import/export keeps one canonical identifier across the ecosystem.
- **Alternatives considered:** (a) Keep spells only in DB — rejected because the delta spec requires the vault to support hash-based spell storage. (b) Store by name — rejected (collision and versioning issues).

### 3. Import conflict resolution: name vs hash

- **Decision:** When an imported spell has the same name as an existing spell but a different content hash, treat it as a conflict and present resolution options: Keep Existing, Replace with New, Keep Both (e.g., “Fireball (1)”), and "Apply to All” for the current import session only (not persisted). For large batches (e.g., 10+ conflicts), offer a summary dialog (Skip All, Replace All, Keep All, Review Each) to avoid dialog fatigue.
- **Rationale:** Same name + different hash means the user might be updating a spell or importing a variant; forcing one behavior (e.g., always replace) would be surprising. Explicit resolution respects user intent. Numeric suffix (1), (2), … is the single convention for "Keep Both".
- **Alternatives considered:** (a) Always replace — rejected (data loss risk). (b) Always keep both — rejected (clutter; user should choose).

**Deduplication (same hash):** When an imported spell’s content hash already exists in the DB, do not insert a new row. Instead, skip insertion and merge metadata from the import into the existing spell (e.g. merge tags, append or merge `source_refs`). This keeps the library deduplicated while preserving new provenance.

### 4. Security: import limits and validation

- **Decision:** Enforce file size limits (e.g., reject > 100 MB, warn/confirm > 10 MB), validate JSON schema and structure (reject deeply nested or huge arrays), sanitize text before display (XSS), and ensure FTS queries use parameterized/controlled construction (no raw user string in MATCH to prevent injection). Use a single bound parameter for the FTS MATCH expression (e.g. `… WHERE spell_fts MATCH ?`) and sanitize/escape FTS special characters in application code before binding. Implementers must escape FTS5 special characters (e.g. `"`, `-`, `*`) before binding the MATCH parameter; see SQLite FTS5 documentation for the full list. Validate URLs in `source_refs` (e.g., disallow `javascript:`).
- **Rationale:** Import is a primary attack surface (malicious or malformed files). Size and structure limits mitigate DoS; sanitization and safe FTS mitigate injection. Binding the search string as a single parameter and escaping FTS operators prevents injection while keeping the pattern clear for implementers.
- **Alternatives considered:** (a) Trust imported content — rejected. (b) Sandbox parsing in a separate process — optional future hardening; not required for this change.

### 5. Spell list and character migration to hash references

- **Decision:** Spell list items and character spellbook entries (both stored in `character_class_spell`) reference spells by `content_hash`. Migrate existing ID-based references to hashes by resolving current IDs to their spell’s content hash (after Spec #2 migration). If a referenced spell is missing (e.g., after import or GC), show a clear placeholder or “Spell no longer in library” and optionally offer to remove the reference.
- **Rationale:** Specs require list/character portability and immutable references by hash; migration is a one-time step per list/character, then all new references are hash-based.
- **Alternatives considered:** (a) Keep dual ID + hash — rejected for long-term complexity. (b) No migration — rejected (would leave broken references after schema switch).

**Schema approach (recommended):** Add a `spell_content_hash TEXT` column to `character_class_spell` and to **`artifact`**. Only `character_class_spell` and `artifact` are in scope; the deprecated `spellbook` table is not modified (read-only/legacy). Backfill from `spell.content_hash` where `spell.id = character_class_spell.spell_id` (and similarly for `artifact.spell_id`). Use `spell_content_hash` for all application reads and joins (join to `spell` on `spell.content_hash = …`). Keep `spell_id` for the migration period so foreign-key integrity and rollback remain possible; a later migration can drop `spell_id` once the hash-based flow is proven. This avoids a big-bang schema change and keeps rollback viable.

### 6. Windows path length and vault layout

- **Decision:** Ensure full path to any vault file stays under 260 characters (Windows MAX_PATH). Vault spell files live under `spells/{content_hash}.json` (see Decision 2). If the vault root is user-configurable, document that a shorter path is recommended; log a warning if a path would exceed the limit and document mitigation (shorter base path).
- **Rationale:** Hash filenames are fixed length; the main variable is the vault root path. Explicit check avoids silent failures on Windows.
- **Alternatives considered:** (a) Ignore path length — rejected (support burden). (b) Use short hash prefix in path — possible future optimization if needed.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| FTS and DB schema drift | Keep FTS populated via triggers or a single source view; run integrity checks in tests. |
| Vault GC deletes a file still referenced by DB | GC only remove files whose hash is not referenced by any spell row; run GC after DB state is committed; add tests for “reference exists but file missing” (repair or re-export). |
| Import conflict UI complexity | Start with single-spell conflict dialog; add “Apply to All” and batch summary in a follow-up; document behavior. |
| Large imports (many spells) | Enforce max spells per import (e.g., 10k); stream parsing where possible; show progress for big files. |
| Path length exceeded on Windows | Validate/log path length at vault init or on first write; document shorter vault path as mitigation. |
| Ranking differences when moving from LIKE to FTS MATCH | Accept that relevance will change; tune FTS options (e.g., bm25) and document in release notes. |

## Migration Plan

1. **Order of work (recommended)**  
   - Implement vault hash-based spell storage (`spells/{content_hash}.json`) and integrity check; then GC (on-demand first; periodic/after-import is implementation choice).  
   - Add FTS indexing for structured/canonical text and switch search to MATCH (single `spell_fts` table).  
   - Implement export with `id` = content hash; then import with validation, deduplication, and conflict resolution.  
   - Migrate spell list, character spellbook, and artifact spell references to hash (DB migration + app logic).  
   - Security pass: parameterized FTS (single bound param + escape FTS special chars), size limits, sanitization, URL validation.  
   - Documentation and E2E tests for import/export and conflict resolution.

2. **Deployment**  
   - Ship behind existing feature surface (no new flags required if migration is automatic).  
   - Ensure Spec #2 migration has run so `content_hash` and canonical data exist before FTS/vault/import rely on them.

3. **Rollback**  
   - DB migrations for list/character hash references should be reversible (e.g., migration script that can restore ID references from a mapping table if we keep one temporarily). Before dropping `spell_id`, ensure a one-time mapping export or migration script can restore `spell_id` from `spell_content_hash` (join to `spell.id`) so rollback can repopulate `spell_id`.  
   - Vault: avoid deleting legacy spell files until the new hash-based flow is proven; keep rollback window where old code can still read legacy storage if needed.

## Resolved (pre-implementation decisions)

- **FTS table layout:** Single `spell_fts` extended with columns for canonical text (no second FTS table).
- **Vault layout:** Spell files stored as `spells/{content_hash}.json` (subfolder to avoid cluttering vault root).
- **“Apply to All” semantics:** Applies only to the current import session; not persisted as a user preference.
- **GC timing:** Implement on-demand GC first; periodic or after-import GC is an implementation choice (can be slow on large imports).
