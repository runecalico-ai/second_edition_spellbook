# Three-Pass In-Depth Code Review (Review/Implementation)
## Change: `refine-computed-fields-schema`
## Scope: Tasks **1.3**, **1.4**, **1.5**, **1.6**
## Date: 2026-02-26

This document provides a three-pass review of tasks 1.3–1.6 for implementers and reviewers: spec alignment, implementation correctness, and test/readiness.

---

## Review Method

| Pass | Focus | Output |
|------|--------|--------|
| **Pass 1** | Spec & task contract audit | Requirement → code/spec mapping; ambiguities and contradictions |
| **Pass 2** | Implementation correctness & edge cases | Line-level correctness, ordering, error paths, invariants |
| **Pass 3** | Test sufficiency & implementation readiness | Task 1.5 coverage matrix; gaps; implementation order |

**Sources:** `tasks.md`, `specs/backend/spec.md`, `design.md`, and implementation in `apps/desktop/src-tauri/`.

---

## Pass 1 — Spec & Task Contract Audit

### Task 1.3 — Schema version bump and `migrate_to_v2()`

| Req ID | Requirement | Source | Implementation / Note |
|--------|-------------|--------|------------------------|
| 1.3.1 | `CURRENT_SCHEMA_VERSION` = 2 | tasks.md L39, spec §Schema Version 2 | `canonical_spell.rs:24` — `pub const CURRENT_SCHEMA_VERSION: i64 = 2;` |
| 1.3.2 | Migration runs **first** in `normalize()`, guarded by `schema_version < 2` | tasks.md L40, spec §Scenario Version 1 Spell Migration | `canonical_spell.rs:682-685` — `if self.schema_version < CURRENT_SCHEMA_VERSION { migrate_result = self.migrate_to_v2(db_id); }` before any other normalization |
| 1.3.3 | Step 1: `dm_guidance` → `notes` (newline if notes non-empty); truncate at 2048; set `notes_truncated` | tasks.md L41, spec L95, design L37 | `canonical_spell.rs:624-642` — `legacy_dm_guidance.take()`, append with `"\n"`, `chars().count() > 2048` → truncate and set `result.notes_truncated` |
| 1.3.4 | Step 2: Remap 5e units to `"special"`; copy `casting_time.text` → `raw_legacy_value` only if not already set | tasks.md L41, spec L96 | `canonical_spell.rs:645-667` — `matches!(ct.unit, Action|BonusAction|Reaction)`, guard `if ct.raw_legacy_value.is_none()` |
| 1.3.5 | Step 2: If `text` empty/null (treat `""` like null), synthesize from `base_value + unit`; `base_value = 0` → `"0 <unit>"` | tasks.md L41, design L38 | `canonical_spell.rs:653` — `ct.text.trim().is_empty()`; L661 `unwrap_or(0.0)` → `"0 action"` etc. |
| 1.3.6 | Step 3: Move `SpellDamageSpec.raw_legacy_value` → `source_text`, clear old field | tasks.md L41, spec L97 | Handled at **deserialization** via `#[serde(alias = "raw_legacy_value")]` on `source_text` in `damage.rs`; migration step is no-op at runtime (comment at L670-673) |
| 1.3.7 | Step 4: Stamp `schema_version = 2` | tasks.md L41 | `canonical_spell.rs:675` |
| 1.3.8 | Return type `MigrateV2Result { notes_truncated, truncated_spell_id }` | tasks.md L42, spec §Internal Function Contract | `canonical_spell.rs:601-605` |
| 1.3.9 | Single-spell: `notes_truncated` → caller returns `Err`, must NOT persist | tasks.md L42, spec L127 | `compute_hash()` L523-527 and `to_canonical_json()` L297-302 both return `Err` when `res.notes_truncated` |
| 1.3.10 | Bulk: truncated spells in `failed`, batch continues | tasks.md L42, spec L139 | `canonical_spell.rs:3942-3948` — push to `result.failed`, no abort |
| 1.3.11 | `schema_version 0 → 2`: migrate directly to 2; §2.5 default materialization sees 2 and leaves it | tasks.md L43, spec §Scenario schema_version 0→2 | Guard `< CURRENT_SCHEMA_VERSION` includes 0; migration stamps 2 |
| 1.3.12 | `MIN_SUPPORTED_SCHEMA_VERSION` unchanged at 1; document in constant comment | tasks.md L44 | `canonical_spell.rs:25-27` — comment explains v1 migration compatibility |

**Contract notes:**
- **SpellDamageSpec step 3:** The spec says “move `raw_legacy_value` to `source_text`”. Implementation relies on serde alias so v1 JSON with `raw_legacy_value` deserializes into `source_text`; no explicit migration code needed. Correct and consistent with “clear raw_legacy_value” (it never appears in v2 output).
- **Truncation:** Spec says “truncate and set truncation flag”; caller must surface. Implementation truncates to 2048 chars and sets `notes_truncated`; single-spell path returns `Err` from `compute_hash`/`to_canonical_json`. ✅

---

### Task 1.4 — Rust in-app parsers: unconditional legacy text preservation

| Req ID | Requirement | Source | Implementation / Note |
|--------|-------------|--------|------------------------|
| 1.4.1 | All parsers (area, duration, range, casting_time, saving_throw) set `raw_legacy_value` on every call (success + failure) | tasks.md L46, backend spec §Universal Legacy Value Preservation | Area: `area.rs:316` after merge; Duration: all return paths set it; Range: L336/446/456; Casting: `components.rs` all branches L44–111; Saving throw: `mechanics.rs:347,358` |
| 1.4.2 | SavingThrowSpec: populate `raw_legacy_value` unconditionally (new field) | tasks.md L47 | Both Single and Multiple paths set `raw_legacy_value: Some(input_clean.to_string())` |
| 1.4.3 | Area/Duration `kind="special"` fallback: set `.text` = `raw_legacy_value` | tasks.md L48, design L25 | Area: `synthesize_text()`; `area_spec.rs` Special branch returns `raw_legacy_value.clone()`. Duration: `duration_spec.rs` equivalent |
| 1.4.4 | Parsed Area/Duration: best-effort `.text` from structured fields | tasks.md L49 | `area.rs:317` calls `synthesize_text()`; duration same; `normalize()` overwrites authoritatively on save |
| 1.4.5 | Empty/null input: `raw_legacy_value` = `None` (not `Some("")`) | tasks.md L50 | Area: early return `None` (no spec); Duration: `raw_legacy_value: None` for empty; Range: default; Casting: `SpellCastingTime::default()`; Mechanics: L311-317 for empty/`"None"` |
| 1.4.6 | Save mapping table: 6-row, first-match-wins; match importers spec §Legacy Save Mapping | tasks.md L51 | `mechanics.rs:378-400` — order matches spec (poison/death/paraly → breath → rod/staff/wand → poly/petri → special → spell) |
| 1.4.7 | `is_standard_complex` heuristic before split; “Rod, Staff, or Wand” = single save | tasks.md L52 | `mechanics.rs:330-332` — computed before `parts.len() > 1 && !is_standard_complex`; category check via normalized phrase match |

**Contract notes:**
- Task 1.4 says “Rust in-app parsers” only; Python importer is Section 2. ✅
- Empty input: “populating raw_legacy_value is not required when there is no source text” — all parsers use `None` for empty/sentinel. ✅

---

### Task 1.5 — Rust unit tests

| Req ID | Required scenario | Source | Test(s) / Status |
|--------|-------------------|--------|------------------|
| 1.5.1 | Migration happy path (three steps) | tasks.md L55 | `test_migrate_v1_to_v2` |
| 1.5.2 | Notes truncation → `notes_truncated = true` | tasks.md L56 | `test_migrate_v1_to_v2_notes_truncation_flag`, `test_compute_hash_and_canonical_json_error_when_notes_truncated` |
| 1.5.3 | Casting time empty/null → synthesize from base_value+unit; `base_value=0` → `"0 <unit>"`; `""` = null | tasks.md L57 | `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw` |
| 1.5.4 | Casting time: no overwrite when `raw_legacy_value` already set | tasks.md L58 | `test_migrate_v1_to_v2_casting_time_preserves_existing_raw` |
| 1.5.5 | `schema_version` 0 → 2; final version 2 | tasks.md L59 | `test_migrate_v1_to_v2_schema_version_zero_to_two` |
| 1.5.6 | `schema_version >= 2` passthrough (migration not called) | tasks.md L60 | `test_migrate_v1_to_v2_passthrough_for_v2_and_newer` (and future-version test if present) |
| 1.5.7 | Parser: unconditional `raw_legacy_value` on success and on `kind="special"` | tasks.md L62 | `test_unconditional_legacy_text_preservation` in area, duration, range |
| 1.5.8 | Empty/null input → `raw_legacy_value: None` | tasks.md L63 | Tests in area, duration, range, components, mechanics (empty / "None") |
| 1.5.9 | Multiple saves: full unsplit source string in `raw_legacy_value` | tasks.md L64 | `test_parse_saving_throw_multiple_retains_full_raw_legacy_value` |
| 1.5.10 | `is_standard_complex`: “Rod, Staff, or Wand” = single save | tasks.md L65 | `test_parse_saving_throw_rod_staff_wand_single_save` |
| 1.5.11 | `.text` synthesis: Area/Duration from structured fields; `kind="special"` from `raw_legacy_value` | tasks.md L67 | `test_normalize_area_duration_text_synthesis`, `test_normalize_area_duration_text_synthesis_structured_fields` |
| 1.5.12 | Hash: `raw_legacy_value` in hash; `source_text` excluded (pruned) | tasks.md L68 | `test_raw_legacy_value_included_in_hash`, `test_damage_source_text_excluded_from_hash`, `test_magic_resistance_source_text_excluded_from_hash` |

All task 1.5 bullets have corresponding tests in the codebase.

---

### Task 1.6 — `migrate_all_spells_to_v2` bulk migration command

| Req ID | Requirement | Source | Implementation / Note |
|--------|-------------|--------|------------------------|
| 1.6.1 | Return type `MigrationResult { total, migrated, skipped, failed }` | tasks.md L70, spec §Bulk Migration Command Contract | `canonical_spell.rs:593-599` |
| 1.6.2 | `MigrationFailure { spell_id, spell_name, error }` | tasks.md L70 | `canonical_spell.rs:586-591` |
| 1.6.3 | Emit `migration-progress` with `{ current, total }` | tasks.md L71, spec L138 | `canonical_spell.rs:4017` (callback) and L4105 event name; progress invoked at L4076 after each spell `(i+1, result.total)` |
| 1.6.4 | `schema_version >= 2` → count in `skipped` (idempotent) | tasks.md L72, spec L141 | `canonical_spell.rs:3960-3962` — `else { result.skipped += 1; }` |
| 1.6.5 | All successful writes in single `BEGIN`/`COMMIT` | tasks.md L72, spec L139 | Transaction in command; `run_migration_batch_impl` receives `tx`; commit at L4023 |
| 1.6.6 | Spell-level failures in `failed`, batch continues | tasks.md L72, spec L140 | Truncation, validate error, hash error, JSON error all push to `failed` and continue loop |
| 1.6.7 | DB-level failure → full rollback | tasks.md L72, spec L140 | `?` on DB ops; transaction `Drop` rolls back on early return |

**Contract notes:**
- Progress: “after each spell (or each batch)” — implementation emits after each spell (`(i+1) as u32, result.total`). ✅
- Batch path uses pre-normalized spell for hashing (`to_canonical_json_pre_normalized()` after `normalize()`), avoiding double normalization in the success path. ✅

---

## Pass 2 — Implementation Correctness & Edge Cases

### 1.3 — Migration and normalization order

- **Order in `normalize()`:** Migration (L682-685) runs before string sanitization, sub-spec normalization, default materialization, and component sync. This matches the spec (“first step … before §2.5 default materialization”). ✅
- **Post-migration invariant:** `debug_assert!(self.schema_version >= CURRENT_SCHEMA_VERSION)` at L817-821 catches logic bugs in non-release builds. ✅
- **Truncation and `truncated_spell_id`:** Set when `db_id` is `Some` (bulk); single-spell callers typically pass `None`. Single-spell persistence must check `notes_truncated` from `compute_hash`/`to_canonical_json` and not persist on `Err`. ✅
- **Step 2 synthesis:** `format!("{} {}", ct.base_value.unwrap_or(0.0), unit_str)` — Display for `f64` gives `"0"` for 0.0, so `"0 action"` is correct. ✅
- **Step 3 (Damage):** No in-migration move of `raw_legacy_value` → `source_text`; alias at deserialization means v1 JSON already populates `source_text`. Migration only stamps version. Consistent with spec. ✅

### 1.4 — Parser edge cases

- **Casting time empty:** `components.rs` returns `SpellCastingTime::default()` for empty input; `raw_legacy_value` is `None`. ✅
- **Saving throw "None" sentinel:** `mechanics.rs:311-316` returns `raw_legacy_value: None`, `kind` default (None). ✅
- **Saving throw parser:** Does **not** set `notes` from raw input (both branches use `notes: None`); only `raw_legacy_value` is set from input. ✅
- **Magic resistance / Damage:** Task 1.4 explicitly limits to “Rust in-app parsers” and hashed/computed fields. `source_text` on MR/Damage is set in parsers where applicable; empty MR can set `source_text: Some("")` or `None` — design says “no source text to preserve” for empty; optional cleanup to use `None` for empty is non-blocking (no hash impact for MR/Damage as metadata). ✅

### 1.6 — Bulk migration edge cases

- **Progress on failure:** Progress callback is invoked after processing each spell (L4076), including when a spell is pushed to `failed`. So UI can show “processed N of M” even when some fail. ✅
- **Transaction scope:** All reads and the loop run inside the same transaction; updates are collected and applied in batch; single `tx.commit()`. On any `?` failure (e.g. prepare/execute), function returns and transaction is dropped (rollback). ✅
- **Skipped vs failed:** Only spells with `schema_version < 2` are normalized and either migrated or failed; `schema_version >= 2` only increments `skipped`. ✅

### Invariants to preserve

- **Hash:** `raw_legacy_value` on hashed specs (Area, Duration, Range, SavingThrow, casting_time) is included in canonical JSON (not pruned). `source_text` on SpellDamageSpec and MagicResistanceSpec is pruned by `prune_metadata_recursive`. ✅ (covered by tests)
- **Resolved specs:** Per Decision 7 and tasks 1.1, resolved specs must not gain `text`, `raw_legacy_value`, or `source_text`. No changes in resolved spec types in this change. ✅

---

## Pass 3 — Test Sufficiency & Implementation Readiness

### Coverage matrix (task 1.5 checklist)

| Category | Task ref | Tests | Status |
|----------|----------|-------|--------|
| Migration happy path | 1.5.1 | `test_migrate_v1_to_v2` | ✅ |
| Notes truncation | 1.5.2 | `test_migrate_v1_to_v2_notes_truncation_flag`, `test_compute_hash_and_canonical_json_error_when_notes_truncated` | ✅ |
| Casting time empty synthesis / no overwrite | 1.5.3, 1.5.4 | `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw`, `test_migrate_v1_to_v2_casting_time_preserves_existing_raw` | ✅ |
| Schema version 0→2 and ≥2 passthrough | 1.5.5, 1.5.6 | `test_migrate_v1_to_v2_schema_version_zero_to_two`, `test_migrate_v1_to_v2_passthrough_for_v2_and_newer` | ✅ |
| Parser unconditional raw + empty→None | 1.5.7, 1.5.8 | Area/duration/range unconditional + empty tests; components casting time empty; mechanics saving throw empty/None | ✅ |
| Multiple saves full raw | 1.5.9 | `test_parse_saving_throw_multiple_retains_full_raw_legacy_value` | ✅ |
| is_standard_complex | 1.5.10 | `test_parse_saving_throw_rod_staff_wand_single_save` | ✅ |
| .text synthesis (structured + special) | 1.5.11 | `test_normalize_area_duration_text_synthesis`, `test_normalize_area_duration_text_synthesis_structured_fields` | ✅ |
| Hash inclusion/exclusion | 1.5.12 | `test_raw_legacy_value_included_in_hash`, `test_damage_source_text_excluded_from_hash`, `test_magic_resistance_source_text_excluded_from_hash` | ✅ |
| Bulk migration | — | Batch failure non-abort, DB rollback, progress on truncation failure | ✅ |

### Implementation order (for someone implementing from scratch)

1. **1.3** — Bump `CURRENT_SCHEMA_VERSION`, add `MigrateV2Result`, implement `migrate_to_v2()` (all four steps), call it first in `normalize()`, wire `notes_truncated` in `compute_hash` and `to_canonical_json`. Add `legacy_dm_guidance` (deserialization-only) on `SavingThrowSpec` if not already present.
2. **1.4** — In each parser (area, duration, range, components, mechanics): set `raw_legacy_value` on every non-empty path; for empty/sentinel return `None`; for Area/Duration special fallback set `.text` from `raw_legacy_value`; verify save mapping and `is_standard_complex` order.
3. **1.5** — Add migration tests (happy path, truncation, casting time synthesis/no-overwrite, 0→2, passthrough), parser tests (unconditional raw, empty→None, multiple-save raw, rod/staff/wand), normalization/hash tests (.text synthesis, raw in hash, source_text excluded), and bulk tests (failure handling, progress).
4. **1.6** — Implement `run_migration_batch_impl` (transaction, loop, normalize, truncation→failed, success→updates, skipped for v2+), then Tauri command that opens transaction, calls impl, commits, emits `migration-progress`; return `MigrationResult`.

### Gaps / optional hardening

- **Future schema version:** A test with `schema_version = 3` (or higher) verifying passthrough without migration is optional but strengthens forward-compatibility.
- **MR empty input:** Using `source_text: None` when `input_clean.is_empty()` would align with “no source text to preserve”; low priority, no hash impact.
- **AreaSpec unit alias in synthesize_text:** Duration applies `normalize_structured_text_with_unit_aliases` in `synthesize_text()`; Area does not. If Area only emits already-normalized unit tokens from enums, behavior is equivalent; adding the same normalization to Area is a consistency improvement.

---

## Summary for Implementation

| Task | Spec alignment | Implementation status | Test coverage |
|------|----------------|------------------------|---------------|
| **1.3** | All requirements mappable to code; Step 3 (Damage) correctly delegated to serde alias | Complete; migration first in `normalize()`, truncation and single/bulk behavior correct | Full for migration, truncation, casting time, version 0→2 and passthrough |
| **1.4** | Parsers match “unconditional raw_legacy_value, empty→None, special→.text” | Complete across area, duration, range, components, mechanics | Unconditional raw, empty, multiple-save, is_standard_complex covered |
| **1.5** | All bullets in tasks.md L55–68 have corresponding tests | Test suite covers migration, parser, normalization, and hash semantics | No blocking gaps |
| **1.6** | Return type, progress, skipped/failed, transaction, rollback match spec | Complete; progress on every spell including failures; single transaction | Batch failure, DB rollback, progress-on-failure tested |

**Verdict:** Tasks 1.3, 1.4, 1.5, and 1.6 are fully specified and implemented. The three-pass review did not find spec contradictions or blocking correctness issues. Optional improvements (MR empty→None, Area unit alias in synthesize_text, future-version passthrough test) are non-blocking for review/implementation sign-off.

---

## Evidence Index

| Artifact | Path |
|----------|------|
| Tasks | `openspec/changes/refine-computed-fields-schema/tasks.md` |
| Backend spec | `openspec/changes/refine-computed-fields-schema/specs/backend/spec.md` |
| Design | `openspec/changes/refine-computed-fields-schema/design.md` |
| Migration, normalize, bulk | `apps/desktop/src-tauri/src/models/canonical_spell.rs` |
| Saving throw model | `apps/desktop/src-tauri/src/models/saving_throw.rs` |
| Area/Duration spec, synthesize_text | `apps/desktop/src-tauri/src/models/area_spec.rs`, `duration_spec.rs` |
| Damage spec (serde alias) | `apps/desktop/src-tauri/src/models/damage.rs` |
| Parsers | `apps/desktop/src-tauri/src/utils/parsers/area.rs`, `duration.rs`, `range.rs`, `components.rs`, `mechanics.rs` |
