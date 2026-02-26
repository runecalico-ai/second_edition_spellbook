# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `1.3`, `1.4`, `1.5`, `1.6`
## Date: 2026-02-26

---

## Review Method (3 Passes)

1. **Pass 1 — Spec Contract Audit**
   Independent re-audit of task requirements (1.3–1.6) against the tasks.md spec text, with special attention to ordering invariants, edge cases, and dual-caller behavior.
2. **Pass 2 — Code Reality Audit**
   Fresh line-level read of `canonical_spell.rs`, `mechanics.rs`, `components.rs`, `area.rs`, `duration.rs`, and `range.rs` to surface correctness issues, dead code, and semantic drift.
3. **Pass 3 — Test Sufficiency Audit**
   Systematic comparison of required test cases from task 1.5 against actual test implementations; gap identification and classification.

---

## Pass 1 — Contract Audit (What must be true)

### Task 1.3 — `migrate_to_v2()` and schema version bump
| # | Requirement | Status |
|---|---|---|
| 1.3-A | `CURRENT_SCHEMA_VERSION = 2` | ✅ line 24 |
| 1.3-B | Migration as **first step** in `normalize()`, guarded by `schema_version < 2` | ✅ lines 704-706 |
| 1.3-C | Step 1: `dm_guidance → notes` (append, newline-sep., 2048 truncation) | ✅ lines 645-665 |
| 1.3-D | Step 2: 5e unit remap → `Special`; copy `text → raw_legacy_value` only if not yet populated | ✅ lines 667-687 |
| 1.3-E | Step 2 empty-text edge case: synthesize from `base_value + unit` (empty string `""` treated same as null) | ✅ `ct.text.trim().is_empty()` covers `""` and whitespace-only |
| 1.3-F | Step 3: `SpellDamageSpec.raw_legacy_value → source_text` | ✅ via serde alias on deserialization (documented in code comment) |
| 1.3-G | Step 4: stamp `schema_version = 2` | ✅ line 689 |
| 1.3-H | Return type `MigrateV2Result { notes_truncated, truncated_spell_id }` | ✅ lines 625-629 |
| 1.3-I | Single-spell truncation: `compute_hash()` and `to_canonical_json()` must return `Err` | ✅ lines 546-550, 297-302 |
| 1.3-J | Bulk truncation: push to `failed`, continue batch | ✅ `run_migration_batch_impl` lines 3836-3842 |
| 1.3-K | `schema_version 0 → 2`: migration guard `< 2` covers `0`, migration stamps `2` | ✅ verified by test at line 3654 |
| 1.3-L | `MIN_SUPPORTED_SCHEMA_VERSION = 1` with explicit comment | ✅ lines 26-27 |

### Task 1.4 — Rust parser `raw_legacy_value` preservation
| # | Requirement | Status |
|---|---|---|
| 1.4-A | All hashed parsers populate `raw_legacy_value` unconditionally | ✅ area, duration, range, casting_time, saving_throw |
| 1.4-B | `kind="special"` fallback on Area/Duration: `.text == raw_legacy_value` | ✅ `synthesize_text()` called on special fallback spec |
| 1.4-C | Parsed Area/Duration: best-effort `.text` synthesized from structured fields | ✅ `synthesize_text()` called unconditionally after main parse |
| 1.4-D | Empty/null input: `raw_legacy_value` must be `None` (not `Some("")`) | ✅ area early returns `None`; duration/range/range have explicit None guards; saving_throw empty/"None" returns `None` |
| 1.4-E | 5e casting units remapped to `Special` at parser layer (not just in migration) | ✅ `parse_casting_time` branches for bonus_action/reaction/action emit `Special` |
| 1.4-F | `SavingThrow.raw_legacy_value` unconditionally populated | ✅ both Single and Multiple paths set it |
| 1.4-G | Save mapping table and `is_standard_complex` correctness | ✅ table rows match spec; heuristic fires before split decision |

### Task 1.5 — Rust unit tests
| # | Required test | Status |
|---|---|---|
| 1.5-A | `migrate_to_v2()` happy path (3 steps) | ✅ `test_migrate_v1_to_v2` |
| 1.5-B | Notes truncation flag path | ✅ `test_migrate_v1_to_v2_notes_truncation_flag` |
| 1.5-C | Casting time empty/null synthesis | ✅ `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw` |
| 1.5-D | No-overwrite guard | ✅ `test_migrate_v1_to_v2_casting_time_preserves_existing_raw` |
| 1.5-E | `schema_version 0 → 2` ordering | ✅ `test_migrate_v1_to_v2_schema_version_zero_to_two` |
| 1.5-F | `schema_version >= 2` passthrough | ✅ `test_migrate_v1_to_v2_passthrough_for_v2_and_newer` |
| 1.5-G | Parser empty/null → `raw_legacy_value: None` | ✅ all 5 parser types covered |
| 1.5-H | Multiple-save raw capture (full unsplit string) | ✅ `test_parse_saving_throw_multiple_retains_full_raw_legacy_value` |
| 1.5-I | `is_standard_complex`: "Rod, Staff, or Wand" = single save | ✅ `test_parse_saving_throw_rod_staff_wand_single_save` |
| 1.5-J | `raw_legacy_value` included in hash | ✅ `test_raw_legacy_value_included_in_hash` |
| 1.5-K | `source_text` excluded from hash (damage) | ✅ `test_damage_source_text_excluded_from_hash` |
| 1.5-K2 | `source_text` excluded from hash (MR) | ✅ `test_magic_resistance_source_text_excluded_from_hash` |
| 1.5-L | Area/Duration `.text` synthesis after `normalize()` — `kind=Special` path | ✅ `test_normalize_area_duration_text_synthesis` |
| 1.5-M | Area/Duration `.text` synthesis — structured fields (non-Special) path | ✅ `test_normalize_area_duration_text_synthesis_structured_fields` |

### Task 1.6 — `migrate_all_spells_to_v2` bulk command
| # | Requirement | Status |
|---|---|---|
| 1.6-A | Return type `MigrationResult { total, migrated, skipped, failed }` | ✅ lines 617-621 |
| 1.6-B | `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }` | ✅ lines 609-614 |
| 1.6-C | `migration-progress` events with `{ current, total }` | ✅ line 3914 |
| 1.6-D | Spells at `schema_version >= 2` counted in `skipped` | ✅ `schema_version < 2` guard |
| 1.6-E | All successful writes in single `BEGIN`/`COMMIT` | ✅ `conn.transaction()` wraps all updates |
| 1.6-F | Spell-level failures collected without aborting batch | ✅ `continue` on truncation/hash/json/deser errors |
| 1.6-G | DB-level failures rollback entire transaction | ✅ `execute()?` propagates; caller drops tx |
| 1.6-H | `truncated_spell_id` populated in bulk path | ✅ `spell.normalize(Some(db_id))` |

---

## Pass 2 — Code Reality Audit (New Observations)

### C1 — Dead code: secondary schema_version stamp block in `normalize()`
**Severity: Low (no runtime impact; maintenance risk)** — ✅ **FIXED 2026-02-26**

In `normalize()`, after `migrate_to_v2()` has run and stamped `schema_version = 2`, the following block was unreachable (~lines 836–843):

```rust
// Only migrate versions in [MIN_SUPPORTED, CURRENT); reject < MIN_SUPPORTED in validate()
if self.schema_version >= MIN_SUPPORTED_SCHEMA_VERSION {
    if self.schema_version < CURRENT_SCHEMA_VERSION && self.schema_version != 0 {
        eprintln!("WARNING: ...");
    }
    if self.schema_version == 0 || self.schema_version < CURRENT_SCHEMA_VERSION {
        self.schema_version = CURRENT_SCHEMA_VERSION;
    }
}
```

**Why it was unreachable:**
- If `schema_version < 2` on entry → migration guard fires and `migrate_to_v2()` stamps `schema_version = 2`. By the time this block runs, `schema_version = 2`, so `< CURRENT_SCHEMA_VERSION` and `== 0` are both false. The block is a no-op.
- If `schema_version >= 2` on entry → migration guard is skipped; this block runs with `schema_version >= 2`, inner conditions still false. Still a no-op.
- The `== 0` inner path is also unreachable: `0 >= MIN_SUPPORTED_SCHEMA_VERSION` (= `0 >= 1`) is false, so the outer `if` never enters for `schema_version = 0`.

**Resolution:** Replaced the entire block with:
```rust
debug_assert!(
    self.schema_version >= CURRENT_SCHEMA_VERSION,
    "schema_version should be current or newer after migrate_to_v2() (got {})",
    self.schema_version
);
```
**Note:** Initial fix used `debug_assert_eq!(== CURRENT_SCHEMA_VERSION)` which was corrected during double-check: a spell with `schema_version > CURRENT` (permitted by `validate()`) would bypass migration and trip the equality assert in debug builds. The correct post-condition is `>= CURRENT`.

---

### C2 — `parse_saving_throw()` duplicates input into `notes` — erroneous hash participation
**Severity: Medium (hash integrity)** — ✅ **FIXED 2026-02-26**

Both the Single and Multiple return paths unconditionally set `notes: Some(input_clean.to_string())`. Task 1.4 only requires `raw_legacy_value` to be unconditionally populated — `notes` is not mentioned as required parser output.

**Critical impact:** `SavingThrowSpec.notes` is **not pruned** by `prune_metadata_recursive` (only `source_text`/`sourceText` are pruned). It is therefore **part of the canonical hash**. This means:
- A spell parsed from legacy text will have `saving_throw.notes` = the raw save string (e.g., `"Fortitude partial; Will negates"`) baked into its hash.
- A spell entering the system through the editor with the same structured saving throw values but no notes will hash differently.
- The same raw text is now represented twice in the canonical JSON (in both `raw_legacy_value` and `notes`), with `raw_legacy_value` carrying the audit contract and `notes` carrying redundant noise that also inflates the hash surface.

**Compounding issue:** If the user views the spell and sees a pre-filled Notes field containing the raw save text, they may leave it in place. After `migrate_to_v2()` also appends `dm_guidance` into `notes`, the field becomes a mix of migration artifacts and parse noise, which is user-confusing and hash-polluting.

**Resolution:** Removed `notes: Some(input_clean.to_string())` from both the `SavingThrowKind::Multiple` and `SavingThrowKind::Single` return paths. Both now emit `notes: None`. No existing tests asserted on `saving_throw.notes`; all 195 tests pass.

---

### C3 — `parse_casting_time()` special fallback emits ephemeral sentinel values
**Severity: Negligible (runtime-safe; cosmetic)** — ✅ **FIXED 2026-02-26**

The generic Special fallback branch (for unrecognized input) emitted:
```rust
SpellCastingTime {
    text: input_clean.to_string(),
    unit: CastingTimeUnit::Special,
    base_value: Some(0.0),
    per_level: Some(0.0),    // pruned by normalize()
    level_divisor: Some(1.0), // pruned by normalize()
    raw_legacy_value: Some(input_clean.to_string()),
}
```

`per_level: Some(0.0)` is pruned if `0.0` and `level_divisor: Some(1.0)` is pruned if `1.0` by `SpellCastingTime::normalize()`. The parsed struct seen before normalization (e.g., in a parser unit test asserting on the raw output) would unexpectedly contain these fields. This is a "surprise on inspection" issue with no hashing or validation impact.

**Resolution:** Replaced the explicit sentinel fields with `..Default::default()`, making the fallback consistent with the three named Special branches (bonus_action, reaction, action) above it:
```rust
SpellCastingTime {
    text: input_clean.to_string(),
    unit: CastingTimeUnit::Special,
    base_value: Some(0.0),
    raw_legacy_value: Some(input_clean.to_string()),
    ..Default::default()
}
```

---

### C4 — `is_standard_complex` uses unconstrained substring matching
**Severity: Low (domain-bounded false-positive risk)**

```rust
let is_standard_complex = !lower.contains(" then ")
    && (lower.contains("rod")
        || lower.contains("staff")
        || lower.contains("wand")
        || lower.contains("poison")
        || lower.contains("death")
        || lower.contains("paraly")
        || lower.contains("poly")
        || lower.contains("petri"));
```

`"poly"` matches "polymorph", "polygon", "polyphony". `"death"` matches "deathblow", "undead". `"poison"` matches "poisonous". `"petri"` matches "petrification" (intended) and any word that begins with "petri" in another language.

In the AD&D spell domain these are safe. However, a future save text like `"Save vs. Death Magic or Polymorph"` would trigger `is_standard_complex = true` even though it contains `" or "` as a real delimiter, causing it to be classified as single instead of multiple.

**Recommendation:** Add a word-boundary test for the key terms: 
```rust
|| Regex::new(r"\b(rod|staff|wand|poison|death|paraly|poly|petri)\b").unwrap().is_match(&lower)
```
Or, more practically, convert the check to require the phrase to exactly match a known canonical multi-word save category rather than substring-matching.

---

### C5 — Migration step (3) now has explicit coexistence coverage
**Severity: Resolved (was Low confidence gap)**

`migrate_to_v2()` step (3) comment reads:
> `SpellDamageSpec.raw_legacy_value → source_text`. This move is performed at deserialization time via `SpellDamageSpec.source_text` alias = `"raw_legacy_value"` in models/damage.rs. By migration time, legacy values are already materialized in `source_text`.

This is correct and well-documented. Coexistence behavior is now explicitly tested: when both `"raw_legacy_value"` and `"source_text"` are present, deserialization is rejected as a duplicate field by serde, and single-key variants deserialize into `source_text` as intended.

**Resolution:** Added `test_damage_spec_alias_raw_legacy_value_reads_into_source_text` and `test_damage_spec_alias_coexistence_rejected_as_duplicate_field` in `damage.rs` tests.

---

### C6 — Progress events skipped for `continue`-path failures in `run_migration_batch_impl`
**Severity: Low (UX / observability)**

In the migration loop, three `continue` statements (truncation, hash error, JSON serialization error) skip the progress callback:
```rust
if res.notes_truncated {
    result.failed.push(...);
    continue; // <-- progress callback not called
}
let hash = match spell.compute_hash() {
    Err(e) => { result.failed.push(...); continue; } // <-- same
    ...
};
let json = match serde_json::to_string(&spell) {
    Err(e) => { result.failed.push(...); continue; } // <-- same
    ...
};
// Only here does the progress check run:
if (i + 1) % 10 == 0 || ... { progress(...); }
```

If a batch has a high proportion of hash/JSON failures (e.g., during a bad deployment), the frontend's progress bar stalls and the user has no indication that processing continues. Deserialization failures do reach the progress check (no `continue` in the `Err(e)` arm of the outer `match`), so this only affects the inner failure paths.

**Recommendation:** Move the `progress` call to run before any `continue`, or restructure as: `let should_progress = ...; if should_progress { progress(...) }` at the end of each branch rather than a single check after all branches.

---

## Pass 3 — Test Sufficiency Audit

### Gap G1 — Completed: Area/Duration `.text` synthesis from structured (non-Special) fields ✅
**Task 1.5 requirement:** "verify `AreaSpec.text` and `DurationSpec.text` are correctly built from structured fields after `normalize()`"

Added `test_normalize_area_duration_text_synthesis_structured_fields`, covering structured synthesis after `normalize()` for:
- `AreaKind::RadiusCircle` + `radius=20` + `shape_unit=Ft` → `text = "20 ft radius"`
- `DurationKind::Time` + `duration=3` + `unit=Round` → `text = "3 round"`

**Outcome:** Structured synthesis regressions in `AreaSpec::synthesize_text()` and `DurationSpec::synthesize_text()` are now covered.

---

### Gap G2 — Completed: `compute_hash()` truncation error path ✅
**Task 1.3 requirement:** "On single-spell normalization, the caller MUST return an `Err` and MUST NOT persist the spell when `notes_truncated` is true."

Added `test_compute_hash_and_canonical_json_error_when_notes_truncated`, which verifies both:
- `compute_hash()` returns `Err` containing `"truncated"`
- `to_canonical_json()` returns `Err` containing `"truncated"`

**Outcome:** Single-spell truncation guard behavior is now directly protected by tests.

---

### Gap G3 — Completed: `SpellDamageSpec` serde alias coexistence behavior ✅
Added coverage in `damage.rs` tests:
- `test_damage_spec_alias_raw_legacy_value_reads_into_source_text`
- `test_damage_spec_alias_coexistence_rejected_as_duplicate_field`

Behavior documented by tests:
- `"raw_legacy_value"` and `"source_text"` each map into `source_text` when present alone.
- When both are present in one JSON object, serde rejects deserialization with a duplicate-field error.

---

### Existing coverage assessment
| Category | Coverage | Notes |
|---|---|---|
| Migration happy path (all 3 steps) | ✅ | Step 3 implicitly via serde alias |
| Notes truncation (flag + single-spell Err) | ✅ | Flag + `compute_hash()`/`to_canonical_json()` Err paths tested |
| casting_time empty/null synthesis | ✅ | Whitespace-only covers `""` |
| casting_time no-overwrite guard | ✅ | |
| schema_version 0 → 2 | ✅ | |
| schema_version ≥ 2 passthrough | ✅ | |
| Parser empty/null → `None` | ✅ | All 5 parsers covered |
| Multiple-save full raw capture | ✅ | |
| is_standard_complex single-save | ✅ | |
| raw_legacy_value changes hash | ✅ | |
| source_text excluded from hash (damage) | ✅ | |
| `source_text` excluded from hash (MR) | ✅ | `test_magic_resistance_source_text_excluded_from_hash` |
| Area/Duration .text (Special path) | ✅ | |
| Area/Duration .text (structured path) | ✅ | `test_normalize_area_duration_text_synthesis_structured_fields` |
| compute_hash truncation Err | ✅ | `test_compute_hash_and_canonical_json_error_when_notes_truncated` |
| SpellDamageSpec alias coexistence | ✅ | alias single-key + duplicate-field coexistence tests |
| Batch spell-level failure non-aborting | ✅ | `test_migration_batch_spell_level_failure_does_not_abort` |
| Batch DB-level failure rollback | ✅ | `test_migration_batch_db_failure_rollback` |

---

## Implementation Plan

### Priority A — Correctness fixes

None. All spec contracts are implemented correctly.

### Priority B — Code quality improvements

| ID | Issue | File | Status |
|---|---|---|---|
| C1 | Dead secondary schema_version stamp block | `canonical_spell.rs` | ✅ Replaced with `debug_assert!(>= CURRENT_SCHEMA_VERSION)` — 2026-02-26 |
| C2 ⚠️ | Parser populates `notes` (hashed field) from raw input | `mechanics.rs` `parse_saving_throw` | ✅ Removed `notes: Some(...)` from both return paths — 2026-02-26 |
| C3 | Casting time special fallback sentinel values | `components.rs` | ✅ Replaced explicit sentinels with `..Default::default()` — 2026-02-26 |

### Priority C — Test gaps

| ID | Gap | Location | Effort |
|---|---|---|---|
| G1 | Area/Duration .text synthesis (structured fields) | `canonical_spell.rs` tests | ✅ Completed (`test_normalize_area_duration_text_synthesis_structured_fields`) |
| G2 | `compute_hash()` truncation Err path | `canonical_spell.rs` tests | ✅ Completed (`test_compute_hash_and_canonical_json_error_when_notes_truncated`) |
| G3 | `SpellDamageSpec` serde alias coexistence | `damage.rs` tests | ✅ Completed (single-key alias + duplicate-field coexistence tests) |

### Priority D — Robustness improvements

| ID | Issue | File | Status |
|---|---|---|---|
| C4 | `is_standard_complex` substring matching | `mechanics.rs` | ✅ Replaced broad substring heuristic with exact normalized category matching (`is_standard_complex_save_category`) and added `test_parse_saving_throw_death_magic_or_polymorph_splits_multiple` — 2026-02-26 |
| C6 | Progress events skipped for error-path `continue` branches | `canonical_spell.rs` | ✅ Restructured `run_migration_batch_impl` to avoid early `continue` paths before progress emission; added `test_migration_batch_progress_emitted_on_truncation_failure` — 2026-02-26 |

---

## Verdict

| Task | Status | Findings | Follow-on work |
|---|---|---|---|
| 1.3 | ✅ Complete | C1 fixed (2026-02-26); truncation/hash/json guards verified; no open migration correctness issues | — |
| 1.4 | ✅ Complete | C2 fixed (2026-02-26); C3 fixed (2026-02-26); C4 robustness fix completed (2026-02-26) | — |
| 1.5 | ✅ Complete | G1/G2/G3 test gaps closed; Priority D regression tests added and passing | — |
| 1.6 | ✅ Complete | C6 progress emission robustness fix completed (2026-02-26) and verified by focused batch test | — |

---

## Evidence Index

| Artifact | Path |
|---|---|
| Schema version constants, migration, bulk command, tests | `apps/desktop/src-tauri/src/models/canonical_spell.rs` |
| Saving throw parsing, is_standard_complex | `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs` |
| Casting time parsing | `apps/desktop/src-tauri/src/utils/parsers/components.rs` |
| Area parsing, synthesize_text | `apps/desktop/src-tauri/src/utils/parsers/area.rs` |
| Duration parsing | `apps/desktop/src-tauri/src/utils/parsers/duration.rs` |
| Range parsing | `apps/desktop/src-tauri/src/utils/parsers/range.rs` |
| Task requirements | `openspec/changes/refine-computed-fields-schema/tasks.md` |
| Previous review (2026-02-25 18:00) | `openspec/changes/refine-computed-fields-schema/review-tasks-1-3-through-1-6-2026_02_25_18_00.md` |
