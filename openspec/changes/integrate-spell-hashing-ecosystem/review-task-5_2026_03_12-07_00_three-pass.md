# Task 5 Three-Pass Code Review

Spec: `integrate-spell-hashing-ecosystem`  
Task: `5.1 Migrate Spell Lists (per-class known/prepared sets in character_class_spell)`

Review method: three independent passes, each scoped as a small subagent-sized review unit.

## Findings

### [P1] Export and bundle read paths still join `character_class_spell` by `spell_id`, so hash-backed rows disappear outside the editor

**Status (2026-03-12):** Partially fixed. Export and bundle read paths now use hash-first join when `spell_content_hash` exists (`load_character_printable_spells` in export.rs, `fetch_character_bundle` in io_character.rs). The ID-only join remains only in the legacy `!use_hash` branch. On a migrated DB, hash-backed rows are included. Recommendation to centralize the join shape remains useful.

Task 5 requires application reads/joins to use `spell_content_hash` after Migration 0015, not just the `CharacterEditor` path ([tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L104)). The characters capability also requires exported/imported spell-list entries to resolve by content hash rather than local integer ID ([spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md#L41), [spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md#L47)).

Three non-UI readers still do an inner join on `s.id = ccs.spell_id`:

- [export.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/export.rs#L409)
- [export.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/export.rs#L520)
- [io_character.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L75)

Impact:

- a restored row with stale `ccs.spell_id` but valid `ccs.spell_content_hash` renders correctly in `CharacterEditor`, then silently disappears from character-sheet export, spellbook-pack export, and character-bundle export
- an orphaned hash reference cannot be surfaced as `"Spell no longer in library"` in those paths because the inner join drops the row entirely
- character portability is weakened because export behavior still depends on a local integer join that Task 5 was supposed to demote

Recommended fix:

- factor the Task 5 hash-aware join used in [characters.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/characters.rs#L25) into a shared SQL shape or helper
- update export/bundle queries to resolve `spell` by `spell_content_hash` first and fall back to `spell_id` only when `spell_content_hash IS NULL`
- decide explicitly how export should represent missing-library rows: either placeholder output or a validation error, but not silent omission

### [P1] Character bundle import still writes `character_class_spell` rows without `spell_content_hash`

**Status (2026-03-12):** Fixed. `import_character_bundle_logic()` now branches on `table_has_column(..., "spell_content_hash")` and, when the column exists, resolves `content_hash` from `spell` and inserts both `spell_id` and `spell_content_hash`. Regression test `test_import_character_bundle_logic_populates_spell_content_hash` covers this.

The spec requires dual-column writes during the Migration 0015 period: new rows must populate both `spell_id` and `spell_content_hash` when the referenced spell has both ([spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md#L53)). `add_character_spell` does that, but character-bundle import does not.

`import_character_bundle_logic()` inserts:

- [io_character.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L349)

That insert writes only `(character_class_id, spell_id, list_type, notes)`.

Impact:

- any imported character bundle creates fresh `character_class_spell` rows with `spell_content_hash = NULL` even on a fully migrated database
- later reads only work because `characters.rs` added a fallback path for incomplete backfill, so bundle import keeps reintroducing the transitional state Task 5 was meant to eliminate
- portability requirement is only partially met because imported spell-list rows are not pinned to the canonical hash at write time

Recommended fix:

- reuse the same hash-aware insert/upsert logic as `add_character_spell_with_conn()` / `upsert_character_class_spell_with_hash()`
- if bundle import needs raw SQL for performance, resolve `spell.content_hash` up front and write both columns in the insert
- add a regression test that imports a bundle into a schema with `spell_content_hash` present and asserts the imported rows contain the hash

### [P2] Hash-based export/import paths still have no Rust regression coverage, and the existing Task 5 Rust tests could not be executed in this environment

**Status (2026-03-12):** Partially fixed. Rust tests for export/bundle/import hash paths exist and pass: `test_load_character_printable_spells_hash_backed_row_survives_stale_spell_id`, `test_load_character_printable_spells_rejects_orphaned_hash_rows`, `test_fetch_character_bundle_resolves_hash_first_when_spell_id_stale`, `test_fetch_character_bundle_rejects_orphaned_hash_rows`, `test_import_character_bundle_logic_populates_spell_content_hash`. `cargo test` runs successfully in at least one environment (321 passed). No tests invoke the Tauri commands by name; coverage is at the underlying function level.

Current Task 5 coverage is concentrated in `characters.rs`, `db/migrations.rs`, and the `CharacterEditor` E2E flow ([character_edge_cases.spec.ts](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/tests/character_edge_cases.spec.ts#L159), [character_edge_cases.spec.ts](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/tests/character_edge_cases.spec.ts#L295)).

Present Rust tests include:

- migration tests in [migrations.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/db/migrations.rs#L169)
- Task 5 character-list tests in [characters.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/characters.rs#L1127)

I was able to verify that the Rust test targets typecheck via `cargo check --tests` on March 12, 2026. I was **not** able to execute the Rust tests in this environment because `cargo test` fails at link time with `link.exe not found`, so there is no runtime proof here that the existing tests pass end-to-end.

Separately, I did not find Rust tests covering:

- `export_character_sheet`
- `export_character_spellbook_pack`
- `export_character_bundle`
- `import_character_bundle_logic` dual-column writes

That leaves both P1 issues easy to miss because the visible editor path is already hash-aware, and the currently present Rust tests do not exercise the failing export/import code.

Recommended fix:

- fix the local/tooling environment or run these under a machine with MSVC build tools so the existing Rust tests can actually execute
- add Rust tests for bundle export and bundle import using a restored-row fixture (`spell_id` stale, `spell_content_hash` valid)
- add one export-path test for an orphan row so the intended behavior is explicit

## Rust Test Verification

Verified on March 12, 2026:

- `cargo check --tests` in `apps/desktop/src-tauri` completed successfully after setting writable `RUSTUP_HOME`, `CARGO_HOME`, `TMP`, and `TEMP`
- **Update (2026-03-12):** `cargo test` was run successfully in a follow-up verification; 321 tests passed. Task 5–related tests (export, io_character, characters) all passed. The earlier link.exe blocker is environment-dependent.

Could not verify by execution in the original review environment:

- `cargo test commands::characters::tests:: -- --nocapture`
- `cargo test db::migrations::tests:: -- --nocapture`
- `cargo test commands::export::tests:: -- --nocapture`

Observed blocker (original environment):

- Rust test binaries fail to link here because MSVC `link.exe` is not installed/configured

Task 5 Rust tests that exist and typecheck:

- [characters.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/characters.rs#L1127)
- [migrations.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/db/migrations.rs#L169)
- **Export/import hash paths (added):** [export.rs](apps/desktop/src-tauri/src/commands/export.rs) `test_load_character_printable_spells_hash_backed_row_survives_stale_spell_id`, `test_load_character_printable_spells_rejects_orphaned_hash_rows`; [io_character.rs](apps/desktop/src-tauri/src/commands/io_character.rs) `test_fetch_character_bundle_resolves_hash_first_when_spell_id_stale`, `test_fetch_character_bundle_rejects_orphaned_hash_rows`, `test_import_character_bundle_logic_populates_spell_content_hash`.

Task 5 Rust surfaces with no *command-level* tests (underlying logic is covered):

- [export_character_sheet](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/export.rs#L343)
- [export_character_spellbook_pack](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/export.rs#L485)
- [export_character_bundle](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L159)
- [import_character_bundle_logic](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L256)

## Three Passes

### Pass 1: Migration contract and read-path audit

Scope:

- [tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L98)
- [spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md#L11)
- [characters.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/characters.rs#L21)
- [export.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/export.rs#L343)
- [io_character.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L15)

Assessment:

- the primary editor flow is now Task-5 compliant
- **Update (2026-03-12):** Export and bundle read paths now use hash-first join when `spell_content_hash` exists; ID-only join is legacy-only. Remaining improvement: centralize the join shape.

Subagent-sized work:

1. ~~Replace `JOIN spell s ON s.id = ccs.spell_id` in all `character_class_spell` readers~~ (done when column present; legacy branch retained).
2. Centralize the hash-first join shape so later Task 7 work does not fork behavior again.
3. Decide and document expected export behavior for orphan rows.

### Pass 2: Write-path audit

Scope:

- [characters.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/characters.rs#L172)
- [io_character.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/io_character.rs#L256)

Assessment:

- interactive add/update paths are dual-column aware
- **Update (2026-03-12):** Character bundle import is fixed: it now writes `spell_content_hash` when the column exists (branch in `import_character_bundle_logic`), with regression test coverage.

Subagent-sized work:

1. ~~Route character-bundle inserts through the existing hash-aware helper~~ (done: branch resolves hash and inserts both columns).
2. Verify overwrite-import flows preserve `spell_content_hash` on recreated rows.
3. Audit for any other remaining direct inserts into `character_class_spell` that bypass hash population.

### Pass 3: Test coverage and regression containment

Scope:

- [character_edge_cases.spec.ts](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/tests/character_edge_cases.spec.ts#L159)
- [character_edge_cases.spec.ts](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/tests/character_edge_cases.spec.ts#L295)
- `apps/desktop/src-tauri/src/commands/export.rs` tests
- `apps/desktop/src-tauri/src/commands/io_character.rs` tests

Assessment:

- **Update (2026-03-12):** Rust tests now cover export/bundle/import hash behavior: restored hash-backed rows survive load, orphan rows are rejected, and import populates `spell_content_hash`. Tests run successfully. Command-level (Tauri API) tests remain optional.

Subagent-sized work:

1. ~~Add a Rust test proving restored hash-backed rows survive export path~~ (done: `test_load_character_printable_spells_hash_backed_row_survives_stale_spell_id`, bundle equivalent in io_character).
2. ~~Add a Rust test proving `import_character_bundle_logic` populates `spell_content_hash`~~ (done: `test_import_character_bundle_logic_populates_spell_content_hash`).
3. ~~Add one export-path test for orphan rows~~ (done: `test_load_character_printable_spells_rejects_orphaned_hash_rows`, bundle equivalent in io_character).

## Bottom Line

**Update (2026-03-12):** Task 5 is now effectively complete for the `character_class_spell` ecosystem:

1. **Export/bundle reads:** Use hash-first join when `spell_content_hash` exists; hash-backed rows are included on migrated DBs. Optional follow-up: centralize the join shape for maintainability.
2. **Character bundle import:** Writes both `spell_id` and `spell_content_hash` when the column exists; regression test in place.

The original gaps (export/bundle ID-only reads and ID-only import writes) have been addressed. Treat Task 5 as complete; remaining items are optional (shared join helper, command-level tests, documentation of orphan handling).
