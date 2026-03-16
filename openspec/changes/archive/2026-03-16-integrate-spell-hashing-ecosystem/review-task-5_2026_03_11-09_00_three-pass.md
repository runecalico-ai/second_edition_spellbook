# Task 5 Three-Pass Code Review

Spec: `integrate-spell-hashing-ecosystem`
Task: `5.1 Migrate Spell Lists (per-class known/prepared sets in character_class_spell)`

Review method: three independent passes, each scoped like a small subagent review unit.

**Verification (post-fix):** Findings below have been checked against the codebase. Status for each finding is noted; the Bottom Line and Three Passes sections are updated to reflect completed work.

## Findings

### [P1] Recovered hash-backed rows cannot be mutated from the UI — **Addressed**

In hash mode, `get_character_class_spells_with_conn()` returns `spell_id` from the joined `spell` row, not from `character_class_spell` (`apps/desktop/src-tauri/src/commands/characters.rs:30-41`, `47-58`). That makes sense for display, but the mutation commands still target rows by `character_class_spell.spell_id`:

- remove: `apps/desktop/src-tauri/src/commands/characters.rs:668-678`
- notes update: `apps/desktop/src-tauri/src/commands/characters.rs:724-725`
- UI callers: `apps/desktop/src/ui/CharacterEditor.tsx:868-883`, `920-928`

This breaks an important transition case the code explicitly supports elsewhere: a stale list row with `spell_id = 0` and a valid `spell_content_hash` that later matches a restored/reimported spell. The row renders as a normal spell again, but clicking Remove or editing notes uses the joined live `spell.id`, so the `DELETE`/`UPDATE` hits zero rows.

Impact:

- users can see a restored spell entry but cannot reliably remove it
- notes edits silently no-op on restored rows
- the code already has tests for add/remove-by-hash in restored scenarios, but not for the normal visible-row mutation path

Recommended fix:

- treat `spell_content_hash` as the authoritative row identity once Migration 0015 is present
- add hash-aware variants for note updates and standard remove flow, not just the missing-library cleanup path
- if you keep `spell_id` mutations for legacy DBs, branch on column presence the same way add/read already do

*Implementation:* `remove_character_spell` and `update_character_spell_notes` now resolve `content_hash` from `spell` by the incoming `spell_id`, then mutate by `(character_class_id, spell_content_hash, list_type)` when the hash column exists; they fall back to `spell_id` when no hash or no rows affected. E2E test "restored-row: removing a recovered hash-backed row works from normal UI path" covers the Remove flow.

### [P1] Hash-mode reads mis-handle rows whose backfill left `spell_content_hash` NULL — **Addressed**

Task 5 and the design both acknowledge a transition period where `spell_content_hash` may still be NULL if the prerequisite migration/backfill has not completed cleanly. The current hash-mode read query ignores `ccs.spell_id` completely and joins only on `s.content_hash = ccs.spell_content_hash` (`apps/desktop/src-tauri/src/commands/characters.rs:37-40`, `54-57`).

If a row still has a valid `spell_id` but NULL `spell_content_hash`, the join drops the spell and the UI gets:

- placeholder name via `COALESCE`
- `missing_from_library = false`, because the flag only flips when `spell_content_hash IS NOT NULL` (`apps/desktop/src-tauri/src/commands/characters.rs:36`, `53`)

That is a bad transition state:

- a real spell appears as a pseudo-placeholder
- the UI treats it as a normal row, so it offers notes/remove by `spellId`
- `init_db()` only logs hash backfill failure and continues startup (`apps/desktop/src-tauri/src/db/pool.rs:123-127`), so this state is reachable after partial failures

Recommended fix:

- in hash mode, fall back to `spell_id` when `spell_content_hash` is NULL
- alternatively, hard-fail Task 5 surfaces when backfill has not completed, but that would need to be enforced explicitly rather than just logged
- add a unit test for: `spell_id` valid, `spell_content_hash` NULL, spell should still resolve normally

*Implementation:* Hash-mode read query now joins with `(ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash) OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)`. Unit test `test_get_character_class_spells_fallback_to_id_when_hash_null` covers NULL-hash fallback.

### [P2] The current tests miss the two highest-risk transition regressions — **Mostly addressed**

Coverage is good for:

- migration column/index creation and backfill (`apps/desktop/src-tauri/src/db/migrations.rs:168-338`)
- orphan placeholder rendering/removal (`apps/desktop/src-tauri/src/commands/characters.rs:934-1180`, `apps/desktop/tests/character_edge_cases.spec.ts:171-270`)

But there is no test for either of these user-visible regressions:

1. visible restored row (`spell_content_hash` matches again, stored `spell_id` stale) then Remove/notes edit via the normal UI path
2. hash-column-present row with NULL `spell_content_hash` but valid `spell_id`

Because both gaps sit exactly at the migration boundary, they are the most likely failures to escape to production.

Recommended fix:

- backend unit tests for restored-row remove/update-notes behavior
- backend unit test for NULL-hash fallback read behavior
- one E2E covering a restored row, not just a permanently orphaned row

*Implementation:* NULL-hash fallback has backend unit test. Restored-row notes path covered by `test_upsert_character_class_spell_with_hash_updates_existing_hash_row`; restored-row Remove covered by E2E "restored-row: removing a recovered hash-backed row works from normal UI path". No dedicated Rust unit test for `remove_character_spell(..., spell_id, ...)` on a restored row (behavior is implemented and E2E-verified). Optional: E2E that NULL-hash transitional rows do not render as placeholders was not added.

## Three Passes

### Pass 1: Migration and schema transition — **Done**

Scope:

- `db/migrations/0015_add_hash_reference_columns.sql`
- `apps/desktop/src-tauri/src/db/migrations.rs`
- startup/backfill behavior in `apps/desktop/src-tauri/src/db/pool.rs`

Assessment:

- migration DDL/backfill shape is mostly aligned with Task 5
- main risk is not index creation; it is what happens when the backfill is partial or fails
- the code currently tolerates partial state at startup but the read path does not fully support that state

Subagent-sized work:

1. ~~Add a read-path test for `spell_id` present + `spell_content_hash` NULL.~~ **Done:** `test_get_character_class_spells_fallback_to_id_when_hash_null`
2. ~~Decide whether Task 5 should support partial backfill gracefully or block the feature until backfill succeeds.~~ **Done:** graceful.
3. ~~If graceful: implement the join fallback.~~ **Done:** join uses `(ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)`.
4. If blocking: surface a real error instead of only logging `Hash backfill failed`. *N/A (graceful path chosen).*

### Pass 2: Backend command/read-write behavior — **Done**

Scope:

- `apps/desktop/src-tauri/src/commands/characters.rs`

Assessment:

- add/prepared-known validation already has hash-aware handling
- ~~remove and notes update are still ID-keyed in the normal path~~ **Fixed:** both resolve by hash when column exists.
- the command set now supports hash-authoritative mutation with legacy fallback.

Subagent-sized work:

1. ~~Add a helper that chooses hash-keyed mutation when `spell_content_hash` exists.~~ **Done:** inline in `remove_character_spell` / `update_character_spell_notes` (resolve hash from `spell` by `spell_id`, then mutate by hash).
2. ~~Route Remove and notes-update through that helper.~~ **Done.**
3. ~~Keep the legacy `spell_id` path for DBs without Migration 0015.~~ **Done:** fallback when `deleted == 0` / `updated == 0`.
4. Add backend tests for restored-row remove and restored-row notes update. **Done:** notes via upsert test; remove covered by E2E (no separate Rust unit for remove-by-spell_id on restored row).

### Pass 3: Frontend spell-list behavior — **Done** (item 3 optional, not added)

Scope:

- `apps/desktop/src/ui/CharacterEditor.tsx`
- `apps/desktop/tests/character_edge_cases.spec.ts`

Assessment:

- missing-library placeholder UI is implemented correctly for true orphan rows
- backend identity is fixed, so transition states are handled; frontend unchanged as expected.
- frontend continues to use `spellId` for normal rows and `spellContentHash` for missing rows; backend resolves hash from spell id for mutations.

Subagent-sized work:

1. ~~Keep `spellContentHash` on every row as the preferred identity after Task 5.~~ **Done:** row includes `spellContentHash`; Remove/notes use backend hash resolution for normal rows.
2. ~~Add an E2E that restores a spell for a previously stale hash row and verifies Remove still works.~~ **Done:** "restored-row: removing a recovered hash-backed row works from normal UI path".
3. Add an E2E or component-level assertion that NULL-hash transitional rows do not render as placeholders. *Optional; not implemented.*

## Implementation Order

1. ~~Fix backend read-path fallback for NULL hashes.~~ **Done**
2. ~~Fix backend mutation commands to use hash identity when available.~~ **Done**
3. ~~Add backend tests for restored-row and NULL-hash transitions.~~ **Done** (NULL-hash unit test; restored-row notes via upsert test; restored-row remove via E2E).
4. ~~Add one UI/E2E regression test for the restored-row path.~~ **Done**

## Bottom Line

**Post-fix:** The transition boundary has been addressed. The code now handles:

- fully migrated hash rows
- permanently orphaned hash rows
- **restored rows whose stored `spell_id` is stale** (mutations resolve by hash from live spell id)
- **partially migrated rows whose `spell_content_hash` is still NULL** (read path falls back to `spell_id` join; unit test added)

Original assessment (for context): Task 5 was close on schema work and happy-path display, but the transition boundary was fragile; the two P1 findings and the main P2 test gaps have since been fixed.
