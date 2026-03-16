# Review: Task 7 — Character Spellbook Upgrade Flow

## Pass 1 — Spec Compliance Review (2026-03-13)

Reviewed against:
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md` (Task 7)
- `openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/design.md` (Decision #5)
- Backend: `apps/desktop/src-tauri/src/commands/characters.rs`, `models/character.rs`
- Frontend: `apps/desktop/src/types/character.ts`, `apps/desktop/src/ui/CharacterEditor.tsx`

### Checklist

| # | Requirement | Status | Comment |
|---|-------------|--------|---------|
| 1 | Character spellbook reads use spell_content_hash (hash-first), with spell_id fallback (pre-existing) | **Pass** | `get_character_class_spells_with_conn` uses `LEFT JOIN spell s ON (ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash) OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)`. Hash-first when present, spell_id fallback when hash is NULL. |
| 2 | "Spell no longer in library" placeholder shown when missingFromLibrary is true (pre-existing) | **Pass** | Backend returns `COALESCE(s.name, 'Spell no longer in library')` and `missing_from_library`; frontend uses `displayName = missing ? "Spell no longer in library" : spell.spellName` and renders it in the spell row. |
| 3 | "Remove" action clears orphan reference (pre-existing) | **Pass** | For missing spells, frontend calls `remove_character_spell_by_hash` with `spellContentHash`; backend `remove_character_spell_by_hash_with_conn` deletes by hash (and cascades PREPARED when removing from KNOWN). |
| 4 | available_upgrade_hash and available_upgrade_spell_id populated when same-name different-hash spell exists | **Pass** | Query subqueries populate both when `s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL` and another spell with same name and different content_hash exists; unit test `test_get_character_class_spells_detects_available_upgrade` covers this. |
| 5 | "Upgrade" button only shown when upgrade is available and spell is NOT missing from library | **Pass** | Button rendered only when `!missing && spell.availableUpgradeHash && spell.availableUpgradeSpellId` (CharacterEditor.tsx ~541–547). |
| 6 | On upgrade, spell_content_hash updated to new hash for ALL list types (KNOWN and PREPARED) in the same class | **Pass** | `upgrade_character_class_spell_with_conn` runs `UPDATE character_class_spell SET spell_content_hash = ?, spell_id = ? WHERE character_class_id = ? AND spell_content_hash = ?` with no list_type filter, so all rows for that class and old hash are updated. |
| 7 | spell_id updated alongside spell_content_hash (dual-column write rule) | **Pass** | Same UPDATE sets both `spell_content_hash` and `spell_id`; unit test `test_upgrade_character_class_spell_updates_hash_and_spell_id` asserts both columns. |
| 8 | No upgrade offered for missing-from-library spells | **Pass** | Backend sets `available_upgrade_*` only when spell is resolved (`s.id IS NOT NULL`); frontend also gates the button on `!missing`. |
| 9 | data-testid on Upgrade button follows btn-upgrade-spell-{spellId} convention | **Pass** | `data-testid={\`btn-upgrade-spell-${spell.spellId}\`}` (CharacterEditor.tsx line 546). |

### Verdict

**Approved.** All checklist items pass. Implementation aligns with Task 7, the character spec (hash-first reads, missing placeholder, Remove, Explicit Upgrade, dual-column write), and design Decision #5. No file:line changes requested.

---

## Pass 2 — Backend Correctness Review (2026-03-13)

Reviewed: `apps/desktop/src-tauri/src/commands/characters.rs` (upgrade section, helpers, tests), `apps/desktop/src-tauri/src/models/character.rs` (`CharacterSpellbookEntry`), `lib.rs` (command registration).

### Checklist

| # | Requirement | Status | Comment |
|---|-------------|--------|---------|
| 1 | upgrade_character_class_spell_with_conn uses parameterized SQL (no string injection) | **Pass** | Single UPDATE uses `params![new_hash, new_spell_id, character_class_id, old_hash]`; no string interpolation in SQL. |
| 2 | Returns error when 0 rows match old_hash — no silent no-op | **Pass** | `if updated == 0 { return Err(AppError::Unknown(...)); }` at characters.rs:223–228. |
| 3 | Updates both KNOWN and PREPARED in a single UPDATE (no partial update risk) | **Pass** | UPDATE has no list_type in WHERE; one statement updates all rows for `character_class_id` + `spell_content_hash = old_hash`. |
| 4 | test_seed_character_with_upgradeable_spell guard for missing column is present | **Pass** | `table_has_column(..., "spell_content_hash")` check returns Err with Migration 0015 message (characters.rs:634–639). |
| 5 | Upgrade detection subquery uses ORDER BY s2.id DESC LIMIT 1 — deterministic | **Pass** | Both `available_upgrade_hash` and `available_upgrade_spell_id` subqueries use `ORDER BY s2.id DESC LIMIT 1`. |
| 6 | No upgrade returned for spell_content_hash IS NULL rows (legacy path) | **Pass** | Subqueries wrapped in `CASE WHEN ... AND ccs.spell_content_hash IS NOT NULL THEN ... ELSE NULL END`; legacy path uses map_row_12 with no upgrade columns. |
| 7 | map_row_16 reads column 14 as Option<String> and column 15 as Option<i64> | **Pass** | `row.get(14)?` → available_upgrade_hash (TEXT/NULL), `row.get(15)?` → available_upgrade_spell_id (INTEGER/NULL); matches struct types. |
| 8 | map_row_12 (legacy path) sets both new fields to None — no panic | **Pass** | spell_content_hash, available_upgrade_hash, available_upgrade_spell_id set to None; missing_from_library to false; no column 12–15 read. |
| 9 | New commands registered in lib.rs | **Pass** | `upgrade_character_class_spell` listed in `invoke_handler` (lib.rs:73). |

### Verdict

**Approved.** All backend correctness checklist items pass. No file:line changes requested.

---

## Pass 3 — Test and Maintainability Review (2026-03-13)

Reviewed: `apps/desktop/src-tauri/src/commands/characters.rs` (unit tests), `apps/desktop/tests/character_edge_cases.spec.ts` (upgrade-flow describe block), `apps/desktop/src/ui/CharacterEditor.tsx` (data-testid patterns).

### Checklist

| # | Requirement | Status | Comment |
|---|-------------|--------|---------|
| 1 | Rust unit tests prove spec contract (upgrade detected, no upgrade for single version, no upgrade for missing spell) | **Pass** | `test_get_character_class_spells_detects_available_upgrade` asserts available_upgrade_hash/spell_id; `test_get_character_class_spells_no_upgrade_when_single_version` and `test_get_character_class_spells_no_upgrade_for_missing_spell` assert None and missing_from_library. |
| 2 | test_upgrade_character_class_spell_updates_hash_and_spell_id asserts BOTH KNOWN and PREPARED are updated | **Pass** | Inserts KNOWN + PREPARED with hash-old; after upgrade, asserts `hashes == ["hash-new","hash-new"]` and `spell_ids == [2, 2]` (characters.rs:1316–1334). |
| 3 | test_upgrade_character_class_spell_errors_on_missing_hash proves error case | **Pass** | No character_class_spell row with old_hash; asserts `result.is_err()`. |
| 4 | E2E upgrade test seeds deterministic data (unique runId in spell name and hashes) | **Pass** | `generateRunId()` used for charName, spellName, hashA, hashB (character_edge_cases.spec.ts:362–365). |
| 5 | E2E test verifies: Upgrade button visible before action, no error modal after action, spell still resolves after upgrade | **Pass** | Step 2: `expect(upgradeBtn).toBeVisible()`; Step 3: `expect(modalVisible).toBe(false)`, spell name still visible. |
| 6 | E2E test cleans up character after completion | **Pass** | `await app.navigate("Characters"); await app.deleteCharacterFromList(charName);` at end of test. |
| 7 | No page.waitForTimeout values longer than 2000ms in non-startup context | **Pass** | Upgrade-flow uses 500, 2000, 300, 500, 800 ms; 2000 is at limit (post-reload settlement), none &gt; 2000. |
| 8 | Upgrade button data-testid pattern consistent with existing remove button pattern | **Pass** | Upgrade: `btn-upgrade-spell-${spell.spellId}`; remove: `btn-remove-spell-${spell.spellId}` or `btn-remove-spell-hash-${spell.spellContentHash}` (CharacterEditor.tsx:937, 966–967). Same `btn-{action}-spell[-hash]-{id}` convention. |

### Verdict

**Approved.** All test and maintainability checklist items pass. No file:line changes requested.
