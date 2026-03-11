# Task 5 Three-Pass Code Review

Spec: `integrate-spell-hashing-ecosystem`
Task: `5.1 Migrate Spell Lists (per-class known/prepared sets in character_class_spell)`

Review method: three independent passes, each scoped like a small subagent review unit.

## Findings

### [P1] Recovered hash-backed rows cannot be mutated from the UI

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

### [P1] Hash-mode reads mis-handle rows whose backfill left `spell_content_hash` NULL

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

### [P2] The current tests miss the two highest-risk transition regressions

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

## Three Passes

### Pass 1: Migration and schema transition

Scope:

- `db/migrations/0015_add_hash_reference_columns.sql`
- `apps/desktop/src-tauri/src/db/migrations.rs`
- startup/backfill behavior in `apps/desktop/src-tauri/src/db/pool.rs`

Assessment:

- migration DDL/backfill shape is mostly aligned with Task 5
- main risk is not index creation; it is what happens when the backfill is partial or fails
- the code currently tolerates partial state at startup but the read path does not fully support that state

Subagent-sized work:

1. Add a read-path test for `spell_id` present + `spell_content_hash` NULL.
2. Decide whether Task 5 should support partial backfill gracefully or block the feature until backfill succeeds.
3. If graceful: implement the join fallback.
4. If blocking: surface a real error instead of only logging `Hash backfill failed`.

### Pass 2: Backend command/read-write behavior

Scope:

- `apps/desktop/src-tauri/src/commands/characters.rs`

Assessment:

- add/prepared-known validation already has hash-aware handling
- remove and notes update are still ID-keyed in the normal path
- the command set therefore supports orphan cleanup but not full hash-authoritative mutation

Subagent-sized work:

1. Add a helper that chooses hash-keyed mutation when `spell_content_hash` exists.
2. Route Remove and notes-update through that helper.
3. Keep the legacy `spell_id` path for DBs without Migration 0015.
4. Add backend tests for restored-row remove and restored-row notes update.

### Pass 3: Frontend spell-list behavior

Scope:

- `apps/desktop/src/ui/CharacterEditor.tsx`
- `apps/desktop/tests/character_edge_cases.spec.ts`

Assessment:

- missing-library placeholder UI is implemented correctly for true orphan rows
- the frontend assumes `missingFromLibrary` cleanly partitions row behavior, but the backend currently leaks transition states that violate that assumption
- once backend identity is fixed, the frontend can stay mostly unchanged

Subagent-sized work:

1. Keep `spellContentHash` on every row as the preferred identity after Task 5.
2. Add an E2E that restores a spell for a previously stale hash row and verifies Remove still works.
3. Add an E2E or component-level assertion that NULL-hash transitional rows do not render as placeholders.

## Implementation Order

1. Fix backend read-path fallback for NULL hashes.
2. Fix backend mutation commands to use hash identity when available.
3. Add backend tests for restored-row and NULL-hash transitions.
4. Add one UI/E2E regression test for the restored-row path.

## Bottom Line

Task 5 is close on schema work and happy-path display, but the transition boundary is still fragile. The code currently handles:

- fully migrated hash rows
- permanently orphaned hash rows

It does not reliably handle:

- restored rows whose stored `spell_id` is stale
- partially migrated rows whose `spell_content_hash` is still NULL
