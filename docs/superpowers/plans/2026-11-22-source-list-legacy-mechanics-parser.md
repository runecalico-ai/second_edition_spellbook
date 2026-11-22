# Source-List Legacy Mechanics → Parser Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the editor-compatible saving-throw and magic-resistance mappers out of `commands/source_list.rs` into `src/utils/parsers/` and reach them through the `SpellParser` facade, with no behavior change.

**Architecture:** A new domain module `utils/parsers/legacy_mechanics.rs` holds the two mappers (moved verbatim, `OnceLock` statics kept). `SpellParser` gains two facade methods with distinct `*_editor_compat` names so the existing `MechanicsParser::parse_saving_throw` / `parse_magic_resistance` (different semantics, other callers) stay untouched. `source_list.rs` calls the facade through the `parser` it already builds per record.

**Tech Stack:** Rust, `regex` crate, `std::sync::OnceLock`, cargo test / clippy.

**Spec:** Review finding (this task's request): *"`commands/source_list.rs` implements its own saving-throw and magic-resistance regex machinery instead of placing that behavior in the centralized parsing layer. This violates `apps/desktop/src-tauri/AGENTS.md` ('Avoid writing ad-hoc regexes in commands; use the centralized parsers' / 'Use `SpellParser::new()` to access parsing methods'). Move these editor-compatible mappings into `src/utils/parsers/` and expose them through the facade, preserving their intended semantics."* Reference behavior: `apps/desktop/src/ui/hooks/useSpellParser.ts:267-350` (`normalizeLegacyText`, `mapLegacySavingThrow`, `mapLegacyMagicResistance`).

All paths below are relative to `apps/desktop/src-tauri/` unless they start with `docs/` (repo root).

## Global Constraints

- Behavior-preserving move: the Rust mappers' current output is the contract (it is a superset of the TS editor: `DmAdjudicated` sets `notes`; notes / `special_rule` / `source_text` are truncated). Do not "fix" mappings in this change.
- Truncation limit: use `crate::models::canonical_spell::SAVING_THROW_NOTES_MAX_CHARS` (`2048`, `canonical_spell.rs:4494`). Delete the duplicate `const SAVING_THROW_NOTES_MAX_CHARS: usize = 2_048;` at `source_list.rs:28`.
- Layering: nothing under `src/utils/` may import from `crate::commands`. Truncate inline (char-based: `s.chars().take(N).collect::<String>()`), do not import `source_list::truncate_chars` (it stays — still used at `source_list.rs:759`).
- Keep the `OnceLock<Regex>` statics. Do **not** compile these regexes in a constructor: `map_source_list_record` creates a `SpellParser` per record (`source_list.rs:701`), so constructor-compiled regexes would be recompiled per spell.
- Existing `SpellParser::parse_saving_throw` / `parse_magic_resistance` and `MechanicsParser` are not modified.
- No new dependencies.
- Out of scope (leave untouched): `SOURCE_PAGE_RE` / `parse_source_bullet` (markdown file-format parsing), the `*_with_editor_fallback` helpers and `validate_*` functions.
- Lint gate: `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` clean.

## Review Focus

1. **Over-long multi-byte input** (e.g. `"é"` × 2049 with no outcome token, and as MR text) — expect `notes` / `special_rule` / `source_text` truncated to exactly 2048 chars without panicking on a char boundary, and `raw_legacy_value` holding the full untruncated string. → Task 1 test `test_editor_compat_truncates_multibyte_at_char_boundary`.
2. **Fraction outcome `"Save vs. Spell for 1/2"`** — `/` survives normalization, so expect `Single` / `ReducedEffect`. → Task 1 test `test_editor_compat_saving_throw_fraction_and_case`.
3. **Shouty/punctuated input `"SAVE VS. POISON; NEGATES"`** — expect `ParalyzationPoisonDeath` / `SaveVs::Poison` / `NoEffect`, `raw_legacy_value` = original text (not normalized). → same test.
4. **`"No"` means different things per field** — ST `"No"` → `SavingThrowKind::None` with `raw_legacy_value: None`; MR `"No"` → `IgnoresMr`. MR `"Yes, partial"` → `Normal` (first match wins). → Task 1 test `test_editor_compat_no_and_first_match_wins`.
5. **Import wiring actually uses the facade** — a source-list record with `saving_throw: "Special"` and `magic_resistance: "50% only"` produces `DmAdjudicated` + `Special` on the mapped spell. → Task 2 test `test_map_source_list_record_uses_editor_compat_mechanics`.

**Known parity defect — report, do not fix here:** `\bparaly\b`, `\bpoly\b`, `\bpetrif\b` never match the full words "paralyzation", "polymorph", "petrification" (no word boundary mid-word), so e.g. `"Save vs. Polymorph negates"` maps to `SaveType::Spell` in both TS and Rust. Fixing one side alone breaks editor parity; it needs a separate change covering both. Do not write a test asserting the current wrong result.

---

### Task 1: `legacy_mechanics` parser module + facade methods

**Files:**
- Create: `src/utils/parsers/legacy_mechanics.rs`
- Modify: `src/utils/parsers/mod.rs` (add `pub mod legacy_mechanics;` and a `- **legacy_mechanics**: ...` line in the module doc list)
- Modify: `src/utils/spell_parser.rs` (two facade methods + one delegation test)
- Modify: `docs/PARSER_COVERAGE.md` (add a row to the parser table at line ~21)

**Interfaces:**
- Consumes: `SAVING_THROW_NOTES_MAX_CHARS` from `crate::models::canonical_spell`; model types from `crate::models::saving_throw` / `crate::models::magic_resistance`.
- Produces:
  - `pub fn map_editor_saving_throw(legacy: &str) -> SavingThrowSpec` (free fn in `legacy_mechanics`)
  - `pub fn map_editor_magic_resistance(legacy: &str) -> MagicResistanceSpec` (free fn in `legacy_mechanics`)
  - `SpellParser::parse_saving_throw_editor_compat(&self, input: &str) -> SavingThrowSpec`
  - `SpellParser::parse_magic_resistance_editor_compat(&self, input: &str) -> MagicResistanceSpec`

- [ ] **Step 1: Write the failing tests**

In `legacy_mechanics.rs` `#[cfg(test)] mod tests`:
- Move `test_map_legacy_saving_throw_special_and_none` and `test_map_legacy_magic_resistance_parity` from `source_list.rs:1402-1465` **unchanged in assertions**, renaming the calls to `map_editor_saving_throw` / `map_editor_magic_resistance`. (In this step copy them; Task 2 deletes the originals.)
- Add the Review Focus tests:

```rust
#[test]
fn test_editor_compat_truncates_multibyte_at_char_boundary() {
    let long = "é".repeat(2049);
    let st = map_editor_saving_throw(&long);
    assert_eq!(st.kind, SavingThrowKind::DmAdjudicated);
    assert_eq!(st.notes.as_ref().unwrap().chars().count(), 2048);
    assert_eq!(st.raw_legacy_value.as_deref(), Some(long.as_str()));

    let mr = map_editor_magic_resistance(&long);
    assert_eq!(mr.kind, MagicResistanceKind::Special);
    assert_eq!(mr.special_rule.as_ref().unwrap().chars().count(), 2048);
    assert_eq!(mr.source_text.as_ref().unwrap().chars().count(), 2048);
}

#[test]
fn test_editor_compat_saving_throw_fraction_and_case() {
    let frac = map_editor_saving_throw("Save vs. Spell for 1/2");
    assert_eq!(frac.single.unwrap().on_success.result, SaveResult::ReducedEffect);

    let loud = map_editor_saving_throw("SAVE VS. POISON; NEGATES");
    assert_eq!(loud.kind, SavingThrowKind::Single);
    assert_eq!(loud.raw_legacy_value.as_deref(), Some("SAVE VS. POISON; NEGATES"));
    let s = loud.single.unwrap();
    assert_eq!(s.save_type, SaveType::ParalyzationPoisonDeath);
    assert_eq!(s.save_vs, SaveVs::Poison);
    assert_eq!(s.on_success.result, SaveResult::NoEffect);
    assert_eq!(s.on_failure.result, SaveResult::FullEffect);
}

#[test]
fn test_editor_compat_no_and_first_match_wins() {
    let st = map_editor_saving_throw("No");
    assert_eq!(st.kind, SavingThrowKind::None);
    assert_eq!(st.raw_legacy_value, None);
    assert_eq!(map_editor_magic_resistance("No").kind, MagicResistanceKind::IgnoresMr);
    assert_eq!(map_editor_magic_resistance("Yes, partial").kind, MagicResistanceKind::Normal);
}
```

In `spell_parser.rs` tests, add (matching the `test_facade_*` pattern):

```rust
#[test]
fn test_facade_editor_compat_mechanics_delegation() {
    let parser = SpellParser::new();
    assert_eq!(parser.parse_saving_throw_editor_compat("Special").kind, SavingThrowKind::DmAdjudicated);
    assert_eq!(parser.parse_magic_resistance_editor_compat("Yes").kind, MagicResistanceKind::Normal);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --lib legacy_mechanics; cargo test --lib test_facade_editor_compat`
Expected: compile FAIL — `map_editor_saving_throw` / `parse_saving_throw_editor_compat` not found (and module not declared until `mod.rs` is edited).

- [ ] **Step 3: Implement**

- `legacy_mechanics.rs`: move `normalize_legacy_text` (private), `map_legacy_saving_throw` → `pub fn map_editor_saving_throw`, `map_legacy_magic_resistance` → `pub fn map_editor_magic_resistance` verbatim from `source_list.rs:341-521`. Only changes: replace the two `truncate_chars(legacy, SAVING_THROW_NOTES_MAX_CHARS)` calls with an inline char-take using the canonical constant. Module doc comment: states these mirror `mapLegacySavingThrow` / `mapLegacyMagicResistance` in `src/ui/hooks/useSpellParser.ts` and must change in lockstep with them; contrasts with `MechanicsParser`'s richer (non-editor) parsing.
- `spell_parser.rs`: the two facade methods delegate to the free functions (no new struct field).
- `mod.rs`: `pub mod legacy_mechanics;` + doc-list line.
- `docs/PARSER_COVERAGE.md` table row: `| legacy_mechanics (editor-compat) | legacy_mechanics.rs | Saving throw / MR mapping identical to the Spell Editor's legacy mappers; used by source-list import |`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --lib legacy_mechanics; cargo test --lib test_facade_`
Expected: all PASS (5 tests in `legacy_mechanics`, 5 facade tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers/legacy_mechanics.rs src/utils/parsers/mod.rs src/utils/spell_parser.rs ../../../docs/PARSER_COVERAGE.md
git commit -m "refactor(parsers): add editor-compat saving throw and MR mappers to SpellParser facade"
```

---

### Task 2: Rewire `source_list.rs` to the facade and remove its regex machinery

**Files:**
- Modify: `src/commands/source_list.rs` (lines 11-18 imports, 28 const, 341-521 delete, 745-748 call sites, 1402-1465 delete moved tests, add one test)

**Interfaces:**
- Consumes: `SpellParser::parse_saving_throw_editor_compat`, `SpellParser::parse_magic_resistance_editor_compat` (Task 1).
- Produces: nothing new; `map_legacy_saving_throw` / `map_legacy_magic_resistance` / `normalize_legacy_text` cease to exist.

- [ ] **Step 1: Write the failing test**

In `source_list.rs` tests, add `test_map_source_list_record_uses_editor_compat_mechanics`. Drive it through `parse_markdown_spell_list` (same pattern as `test_parse_markdown_spell_list_splitter_edge_cases`, ~line 1595), with a section like:

```rust
let md = "## Arcane Bolt\n\n- Tradition: arcane\n- Class: Wizard\n- Level: 1\n- School: Evocation\n- Saving Throw: Special\n- Magic Resistance: 50% only\n\nA bolt.\n";
let classified = parse_markdown_spell_list("bolt.md", md).expect("valid list");
assert!(classified.failures.is_empty());
let spell = classified.spells[0].spell.clone();
let st = spell.saving_throw.expect("saving throw");
assert_eq!(st.kind, SavingThrowKind::DmAdjudicated);
assert_eq!(st.raw_legacy_value.as_deref(), Some("Special"));
let mr = spell.magic_resistance.expect("magic resistance");
assert_eq!(mr.kind, MagicResistanceKind::Special);
assert_eq!(mr.special_rule.as_deref(), Some("50% only"));
```

Then delete the old local functions/tests (Step 3) — before that, this test passes against old code; it is a regression guard for the rewire, so run it now to confirm the baseline.

- [ ] **Step 2: Run baseline**

Run: `cargo test --lib test_map_source_list_record_uses_editor_compat_mechanics`
Expected: PASS (baseline, pre-rewire).

- [ ] **Step 3: Rewire and delete**

- Lines 745-748: `.map(|raw| parser.parse_saving_throw_editor_compat(&raw))` and `.map(|raw| parser.parse_magic_resistance_editor_compat(&raw))`.
- Delete `normalize_legacy_text`, `map_legacy_saving_throw`, `map_legacy_magic_resistance` (341-521), the local `SAVING_THROW_NOTES_MAX_CHARS` (line 28), and the two moved tests (1402-1465).
- Prune now-unused imports (likely `SaveAppliesTo, SaveOutcomeEffect, SaveResult, SaveTiming, SaveType, SaveVs, SingleSave, MrAppliesTo, MrPartialScope, MrPartialSpec`, possibly `MagicResistanceKind`/`SavingThrowKind` outside tests). Let the compiler/clippy decide; keep `regex::Regex` and `OnceLock` (still used by `SOURCE_PAGE_RE` at ~1107). Test-only needs go in `mod tests` `use` lines.

- [ ] **Step 4: Verify**

Run:
```
cargo test --lib source_list
cargo test --lib legacy_mechanics
cargo clippy --all-targets -- -D warnings
cargo fmt --check
rg -n "Regex::new" src/commands/source_list.rs
```
Expected: tests PASS; clippy and fmt clean; `rg` shows only the `SOURCE_PAGE_RE` line.

- [ ] **Step 5: Commit**

```bash
git add src/commands/source_list.rs
git commit -m "refactor(import): route source-list saving throw and MR through SpellParser facade"
```
