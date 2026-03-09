# Three-Pass In-Depth Code Review: `refine-computed-fields-schema`

**Date:** 2026-02-28
**Reviewer:** AI three-pass subagent review
**Branch:** `refine-computed-fields` (f9a4d22)
**Base:** `3255f2d` (merge of `feat/remove-both-tradition`)

---

## Executive Summary

The `refine-computed-fields-schema` change introduces schema version 2 for `CanonicalSpell`, adding computed `text` and `raw_legacy_value` fields, renaming `SpellDamageSpec.raw_legacy_value` to `source_text`, adding `MagicResistanceSpec.source_text`, removing `dm_guidance` from `SavingThrowSpec`, removing 5e casting-time units, and implementing a `migrate_to_v2()` pipeline with bulk migration.

**Overall verdict: The implementation is substantially spec-compliant with no data-loss risks.** One Critical finding (incorrect unit tests), three Important advisories, and several Minor items are documented below.

---

## Review Structure

| Pass | Domain | Sections | Reviewer Scope |
|------|--------|----------|----------------|
| **Pass 1** | Backend (Rust) + Python Importers | 1 & 2 | Schema, models, migration, parsers, Python sidecar |
| **Pass 2** | Frontend Types & Editor Components | 3 | TS types, editor forms, SpellEditor, WarningBanner |
| **Pass 3** | Detail Views + Docs + E2E Tests | 4 & 5 | Detail components, canonical-serialization.md, SCHEMA_VERSIONING.md, Playwright |

---

## Critical Findings

### C-1. Three `StructuredFieldInput.test.ts` tests assert incorrect `rawLegacyValue` short-circuit behavior

**Pass:** 2 | **Files:** [StructuredFieldInput.test.ts](apps/desktop/src/ui/components/structured/StructuredFieldInput.test.ts#L22-L113)
**Spec:** Design Decision 2 — "rawLegacyValue is NEVER the .text input when structured fields are present"

**Description:** Three tests titled "returns rawLegacyValue when present (documents short-circuit)" assert that `rangeToText`, `durationToText`, and `castingTimeToText` return `rawLegacyValue` even for non-special kinds (e.g., `kind: "distance"` with `rawLegacyValue: "weird text"`). The actual implementations in `spell.ts` only short-circuit on `rawLegacyValue` when `kind === "special"` (or `unit === "special"` for casting time). **These tests will fail at runtime:**

- `rangeToText({kind: "distance", distance: {mode: "fixed", value: 30}, unit: "ft", rawLegacyValue: "weird text"})` → returns `"30 ft"`, test expects `"weird text"`
- `durationToText({kind: "time", unit: "round", duration: {mode: "fixed", value: 3}, rawLegacyValue: "stale"})` → returns `"3 round"`, test expects `"stale"`
- `castingTimeToText({..., unit: "round", baseValue: 1, rawLegacyValue: "stale"})` → returns `"1 round"`, test expects `"stale"`

**Suggested fix:** Remove or invert these tests. They should assert that `rawLegacyValue` is **ignored** for non-special kinds, matching existing tests in `spell.test.ts` (e.g., `"ignores rawLegacyValue for non-special kinds"`).

---

## Important Findings

### I-1. `default_schema_version()` returns 2 — potential migration skip for legacy JSON

**Pass:** 1 | **File:** [canonical_spell.rs](apps/desktop/src-tauri/src/models/canonical_spell.rs#L251)
**Spec:** Task 1.3 — `migrate_to_v2()` runs when `schema_version < 2`

The serde default for `schema_version` is `CURRENT_SCHEMA_VERSION` (2). If any pre-existing `canonical_data` JSON blobs lack a `schema_version` key, deserialization defaults to 2, silently skipping migration. Such spells would retain 5e units, `dm_guidance`, and old field names.

**Risk:** Low — all code paths serialize the full struct. Only manually-crafted JSON imports without the field would trigger this.
**Suggested fix:** Add a defensive log/comment near `default_schema_version()` documenting this assumption.

### I-2. `is_standard_complex_save_category` exact-match heuristic doesn't handle trailing modifiers

**Pass:** 1 | **File:** [mechanics.rs](apps/desktop/src-tauri/src/utils/parsers/mechanics.rs#L22)
**Spec:** Importers spec § "Saving Throw Parsing" — heuristic must fire before split logic

An input like `"Rod, Staff, or Wand at -2"` normalizes to `"rod staff or wand at -2"`, which doesn't match any exact pattern, so it's incorrectly split by `" or "` into separate saves. `raw_legacy_value` still captures the full input (no data loss), but the structured decomposition may be wrong.

**Risk:** Medium — likely pre-existing, but affects all save parsing now that `raw_legacy_value` is unconditional.
**Suggested fix:** Use `starts_with()` matching or strip modifier suffixes before comparing.

### I-3. Per-field banner dismissal doesn't fire on structured form edits

**Pass:** 2 | **File:** [SpellEditor.tsx](apps/desktop/src/ui/SpellEditor.tsx#L1166-L1172)
**Spec:** Task 3.7d — "fields are removed from the banner individually when the user edits them to a non-special value"

The `parserFallbackFields` removal logic only fires inside `handleChange` (legacy text edits). When the user changes `kind` from `"special"` to `"distance"` via the structured form, the banner persists until after a successful save.

**Impact:** UX gap — banner stays even after the user has fixed the field. No data loss.
**Suggested fix:** Add a check in structured form `onChange` handlers to remove the field from `parserFallbackFields` when the new value's kind is no longer `"special"`.

### I-4. `SCHEMA_VERSIONING.md` — contradicts spec on `schema_version = 0` handling

**Pass:** 3 | **File:** [SCHEMA_VERSIONING.md](docs/SCHEMA_VERSIONING.md#L41-L44)
**Spec:** Task 1.3 — "schema_version 0 → 2 scenario: a spell with schema_version = 0 satisfies < 2 and migrates directly to 2"

The doc states: "schema_version = 0 is now **rejected** by the validator [...] Only spells with schema_version = 1 are migrated." The tasks.md spec explicitly says version 0 satisfies `< 2` and migrates directly. Rust tests include a `schema_version 0 → 2` passthrough test. The doc contradicts either the spec or the code (depending on actual runtime behavior).

**Suggested fix:** Verify the actual Rust behavior. If v0 migrates to v2 (per spec), update the doc. If v0 is rejected (per `MIN_SUPPORTED_SCHEMA_VERSION = 1`), add a note reconciling spec vs implementation.

---

## Minor Findings

### M-1. `"petri"` vs spec's `"petrif"` in save_type mapping

**Pass:** 1 | **File:** [mechanics.rs](apps/desktop/src-tauri/src/utils/parsers/mechanics.rs#L395)

Code uses `lower.contains("petri")` where the spec says `"petrif"`. Both match `"petrification"`, but `"petri"` is strictly broader. Negligible risk in AD&D 2e context.

### M-2. Redundant empty check on Duration parser `raw_legacy_value`

**Pass:** 1 | **File:** [duration.rs](apps/desktop/src-tauri/src/utils/parsers/duration.rs#L293-L296)

Function returns `None` for empty input at line ~41, so `input_clean.is_empty()` at line 293 is dead code. Area/Range parsers use unconditional `Some(input_clean.to_string())`.

### M-3. Missing clarifying comment on `raw_legacy_value` inclusion in hash

**Pass:** 1 | **File:** [canonical_spell.rs](apps/desktop/src-tauri/src/models/canonical_spell.rs#L349-L350)

`prune_metadata_recursive` removes `source_text`/`sourceText` but intentionally keeps `raw_legacy_value`/`rawLegacyValue` in the hash. The asymmetry is correct per spec but undocumented at the pruning site.

### M-4. `castingTimeToText` uses plurals while `durationToText` uses bare units

**Pass:** 2 | **File:** [spell.ts](apps/desktop/src/types/spell.ts#L741-L746)

`castingTimeToText` returns `"3 segments"` while `durationToText` returns `"3 round"`. Spec only specifies bare units for duration; the inconsistency may confuse users.

### M-5. `parserValidation.ts` uses hand-written validators instead of Zod

**Pass:** 2 | **File:** [parserValidation.ts](apps/desktop/src/lib/parserValidation.ts)

Spec says "Zod schema validation **(or equivalent type guard)**" — parenthetical clause permits this. Validators are thorough, but hand-written ones risk divergence from TS types over time.

### M-6. SavingThrow `dm_adjudicated` fallback triggers the warning banner

**Pass:** 2 | **File:** [SpellEditor.tsx](apps/desktop/src/ui/SpellEditor.tsx#L1008-L1010)

When `mapLegacySavingThrow` returns `kind: "dm_adjudicated"`, the code adds "Saving throw" to `parserFallbackFields`. The spec defines the banner for `kind: "special"` fallbacks only, and `SavingThrowSpec` has no `kind: "special"`.

### M-7. E2E test for `kind="special"` → `.text` assertion only checks display, not value shape

**Pass:** 3 | **File:** [spell_editor_structured_data.spec.ts](apps/desktop/tests/spell_editor_structured_data.spec.ts#L940-L965)

The test asserts the text preview displays "Special" after clearing `rawLegacyValue`, but doesn't directly verify `.text` is `undefined` (not `""`). The spec requires `text: undefined` for the no-input state.

### M-8. v1 canonical_data loading E2E is deferred (not implemented)

**Pass:** 3 | **File:** Tasks.md

Marked `[x]` in tasks.md but accompanied by an HTML comment `<!-- deferred: no file-injection fixture infrastructure -->`. Consider marking as `[~]` or adding a `test.fixme()` placeholder.

### M-9. `migrate_to_v2()` Step 3 relies on serde alias rather than explicit field move

**Pass:** 1 | **File:** [canonical_spell.rs](apps/desktop/src-tauri/src/models/canonical_spell.rs#L673-L676)

The `#[serde(alias = "raw_legacy_value")]` on `SpellDamageSpec.source_text` handles the rename at deserialization time. Correct behavior, but spec implies a runtime field move. A comment expansion would clarify the mechanism.

### M-10. Regex compilation inside parsing functions

**Pass:** 1 | **File:** [mechanics.rs](apps/desktop/src-tauri/src/utils/parsers/mechanics.rs)

Some `Regex::new(...)` calls remain inside parsing functions. Existing clippy suppression comments acknowledge this. Low impact — not a tight-loop context.

---

## Strengths

### Backend (Pass 1)
1. **Serde attribute composition** — `rename`, `alias`, `skip_serializing`, `deny_unknown_fields` on `SavingThrowSpec.legacy_dm_guidance` seamlessly absorbs v1 `dm_guidance` without re-serializing
2. **Dual-casing pruning** — `prune_metadata_recursive` removes both `source_text` (snake_case) and `sourceText` (camelCase) for hash exclusion
3. **Migration safety** — `MigrateV2Result.notes_truncated` prevents silent data loss; bulk migration collects per-spell failures rather than aborting
4. **Comprehensive test coverage** — Regression tests cover 5e remap, empty-text synthesis, dm_guidance truncation, alias deserialization, is_standard_complex, save_type/save_vs mapping, bulk rollback
5. **Python sidecar discipline** — Stamps `schema_version = 2` on all three import paths with test verification

### Frontend Editor (Pass 2)
6. **v1→v2 compatibility handling** — `normalizeSavingThrowSpec` and `normalizeDamageSpec` correctly remap v1 fields with newline append and preference priority
7. **Correct `== null` loose equality** — `canonicalFieldDecision.ts` follows spec exactly (covers both `undefined` and `null`)
8. **Parallel parser dispatch** — `buildParserTasks` + `Promise.all` with `parsersPending` loading state and `finally` cleanup
9. **DamagePart defaults match spec exactly** — `application: { scope: "per_target" }`, `save: { kind: "none" }`, ID pattern matching `^[a-z][a-z0-9_]{0,31}$`
10. **5e units thoroughly removed** — Compile-time `@ts-expect-error` assertions in spell.test.ts verify rejection
11. **Kind transition clearing is comprehensive** — All Duration/Range/CastingTime tables implemented correctly
12. **MagicResistanceInput partial/special handling** — Scope enum, conditional part_ids picker with disabled message, special_rule input

### Detail Views + Docs + E2E (Pass 3)
13. **Consistent fallback chains** — All spec-based detail views follow `text ?? rawLegacyValue ?? (guard ? synthesis : null) ?? "—"`
14. **`hasStructuredFields` guards** prevent empty synthesis attempts per spec
15. **Storybook stories with play-function assertions** — Component-level test coverage with explicit regression guards
16. **Documentation is comprehensive** — §2.2.1, §2.3, and §3 tables all correctly updated
17. **E2E test coverage is substantial** — 5e absence, banner lifecycle, kind transitions, annotation rendering, parsers-pending lifecycle

---

## Spec Compliance Matrix

### Pass 1: Backend + Python Importers

| # | Requirement | Verdict | Notes |
|---|------------|---------|-------|
| 1.1 | Schema JSON field changes | **PASS** | All additions, removals, and enum changes correct |
| 1.2 | Rust model serde attributes | **PASS** | `deny_unknown_fields`, `skip_serializing_if`, aliases correct |
| 1.2b | `.text` synthesis (AreaSpec, DurationSpec) | **PASS** | Special→rawLegacyValue; Structured→algebraic; normalized |
| 1.2c | `source_text` Textual normalization | **PASS** | NFC, trim, preserve lines |
| 1.3 | `migrate_to_v2()` four steps | **PASS** | All steps correct; truncation handled |
| 1.4 | Parser unconditional `raw_legacy_value` | **PASS** | All parsers populate; save_type/save_vs mapping correct |
| 1.5 | Rust unit tests | **PASS** | Comprehensive coverage |
| 1.6 | Bulk migration command | **PASS** | Single tx, failures collected, progress events |
| 2.1 | Python sidecar changes | **PASS** | `schema_version = 2` on all paths |
| 2.2 | Python tests | **PASS** | String passthrough and version verified |

### Pass 2: Frontend Types & Editor

| # | Requirement | Verdict | Notes |
|---|------------|---------|-------|
| 3.1 | TypeScript types updated | **PASS** | All field additions/removals/renames correct |
| 3.2 | DamageForm | **PASS** | sourceText, dmGuidance retained, DamagePart defaults |
| 3.3 | SavingThrowInput | **PASS** | dmGuidance removed, rawLegacyValue shown, notes for all kinds |
| 3.4 | MagicResistanceInput | **PASS** | sourceText, partial/special sub-forms, notes for all |
| 3.5 | AreaForm | **PASS** | .text preview, special→rawLegacyValue, undefined (not "") |
| 3.6 | StructuredFieldInput | **PASS** | Kind transitions, text preview, rawLegacyValue triggers |
| 3.7a | canonical_data loading | **PASS** | v1 compat, loose equality, snake→camelCase |
| 3.7b | Parser dispatch | **PASS** | Parallel, disabled state, validation, fallbacks |
| 3.7c | Save path v2-shaped | **PASS** | toV2 transforms applied |
| 3.7d | WarningBanner | **PARTIAL** | Non-dismissible ✓; per-field on save ✓; per-field on edit: only legacy text path (I-3) |
| 5.5 | Vitest tests | **PARTIAL** | Coverage good; 3 StructuredFieldInput tests incorrect (C-1) |

### Pass 3: Detail Views + Docs + E2E

| # | Requirement | Verdict | Notes |
|---|------------|---------|-------|
| 4.1 | SavingThrowDetail | **PASS** | dmGuidance removed, rawLegacyValue annotation, notes always |
| 4.2 | Range/Duration/Area detail | **PASS** | Correct 3-tier fallback chain |
| 4.2b | CastingTimeDetail | **PASS** | `\|\|` chain handles empty string correctly |
| 4.3 | Damage + MR detail | **PASS** | Structured→sourceText fallback; v1 compat with dmGuidance |
| 5.1 | canonical-serialization.md | **PASS** | §2.2.1, §2.3, §3 all correctly updated |
| 5.2 | SCHEMA_VERSIONING.md | **PARTIAL** | Thorough but contradicts spec on v0 handling (I-4) |
| 5.3 | E2E tests | **PASS** | Comprehensive; v1 loading deferred with doc comment |
| 5.4 | Storybook stories | **PASS** | All 7 detail + 6 editor component stories updated |

---

## Action Items Summary

| Priority | Finding | Action |
|----------|---------|--------|
| **Critical** | C-1: 3 incorrect StructuredFieldInput tests | Remove/invert assertions; rawLegacyValue must be ignored for non-special kinds |
| **Important** | I-1: default_schema_version() | Add defensive comment documenting assumption |
| **Important** | I-2: is_standard_complex heuristic | Consider `starts_with()` or modifier-stripping in follow-up |
| **Important** | I-3: Per-field banner dismissal gap | Add structured form onChange check for non-special kind |
| **Important** | I-4: SCHEMA_VERSIONING.md v0 claim | Verify Rust behavior and reconcile doc with spec |
| Minor | M-1–M-10 | Address in cleanup pass; none blocking |
