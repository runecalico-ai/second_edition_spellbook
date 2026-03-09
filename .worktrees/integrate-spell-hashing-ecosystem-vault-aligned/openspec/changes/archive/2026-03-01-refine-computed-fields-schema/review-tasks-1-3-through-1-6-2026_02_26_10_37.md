# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `1.3`, `1.4`, `1.5`, `1.6`
## Date: 2026-02-26 10:37 CST
## Test Baseline: **204 tests passing** (`cargo test --lib`) — updated 2026-02-26 after Priority D

---

## Review Method (3 Passes)

1. **Pass 1 — Spec Contract Audit**
   Independent re-derivation of every requirement from tasks.md, backend spec.md, importers spec.md, and design.md. Each requirement is traced to a specific line range in the implementation. Contradictions between specs and tasks are flagged.

2. **Pass 2 — Code Reality Audit**
   Fresh line-level read of all six implementation files: `canonical_spell.rs`, `saving_throw.rs`, `mechanics.rs`, `components.rs`, `area.rs`, `duration.rs`, `range.rs`, `area_spec.rs`, `duration_spec.rs`, `magic_resistance.rs`, `damage.rs`. Focus on semantic correctness, hashing invariants, normalization compliance, and edge-case coverage that was not addressed by the prior reviews (2026-02-25 18:00 and 2026-02-26 06:00).

3. **Pass 3 — Test Sufficiency Audit**
   Systematic comparison of required test scenarios from task 1.5, cross-referenced against the 200 passing tests. Identification of gaps, redundancies, and brittleness risks.

---

## Prior Review Summary

Two prior reviews exist:
- **2026-02-25 18:00** — Initial three-pass review. Identified parser correctness gaps (casting-time raw preservation, 5e unit leaking, duration/saving-throw empty→None). All gaps resolved.
- **2026-02-26 06:00** — Follow-up three-pass review. Identified C1–C6 code quality issues, G1–G3 test gaps. All resolved. All four tasks marked ✅ Complete.

This review is a **fresh re-audit** from first principles, not an incremental delta. All findings are independently verified.

---

## Pass 1 — Spec Contract Audit

### Task 1.3 — `migrate_to_v2()` and Schema Version Bump

| ID | Requirement (from tasks.md + backend spec) | Source | Code Status | Evidence |
|---|---|---|---|---|
| 1.3-A | `CURRENT_SCHEMA_VERSION = 2` | tasks.md:39, spec:89 | ✅ | `canonical_spell.rs:24` — `pub const CURRENT_SCHEMA_VERSION: i64 = 2;` |
| 1.3-B | Migration as **first step** in `normalize()`, guarded by `schema_version < 2` | tasks.md:40, spec:94 | ✅ | `canonical_spell.rs:682-685` — Guard `if self.schema_version < CURRENT_SCHEMA_VERSION { migrate_result = self.migrate_to_v2(db_id); }` before any normalization |
| 1.3-C | Step 1: `dm_guidance → notes` (append with `\n`, 2048 truncation) | tasks.md:41, spec:95, design:37 | ✅ | `canonical_spell.rs:624-642` — `legacy_dm_guidance.take()`, append with newline separator, char-count check > 2048, sets `notes_truncated` flag |
| 1.3-D | Step 2: 5e unit remap → `Special`; copy `text → raw_legacy_value` only if not already populated | tasks.md:41, spec:96, design:38 | ✅ | `canonical_spell.rs:645-667` — `matches!` on Action/BonusAction/Reaction, no-overwrite guard `if ct.raw_legacy_value.is_none()`, copies text or synthesizes |
| 1.3-E | Step 2 empty-text edge case: synthesize from `base_value + unit` (empty `""` treated same as null) | tasks.md:41, spec:96, design:38 | ✅ | `canonical_spell.rs:653` — `ct.text.trim().is_empty()` covers both `""` and whitespace-only |
| 1.3-F | Step 2 `base_value = 0` edge case: `"0 action"` accepted as fallback | design:38 | ✅ | `canonical_spell.rs:661` — `ct.base_value.unwrap_or(0.0)` → if absent, defaults to 0.0 producing "0 action" |
| 1.3-G | Step 3: `SpellDamageSpec.raw_legacy_value → source_text` | tasks.md:41, spec:97 | ✅ | `canonical_spell.rs:670-673` — Handled via serde alias at deserialization time; documented in code comment |
| 1.3-H | Step 4: stamp `schema_version = 2` | tasks.md:41, spec:98 | ✅ | `canonical_spell.rs:675` — `self.schema_version = 2;` |
| 1.3-I | Return type `MigrateV2Result { notes_truncated, truncated_spell_id }` | tasks.md:42, spec:123 | ✅ | `canonical_spell.rs:601-605` — Struct definition matches contract |
| 1.3-J | Single-spell: `notes_truncated` → `compute_hash()` and `to_canonical_json()` return `Err` | tasks.md:42, spec:127 | ✅ | `canonical_spell.rs:523-527` (compute_hash) and `canonical_spell.rs:297-302` (to_canonical_json) both check `res.notes_truncated` |
| 1.3-K | Bulk: truncated spells pushed to `failed`, batch continues | tasks.md:42, spec:139 | ✅ | `canonical_spell.rs:3942-3948` — `result.failed.push(...)` inside truncation check, followed by else branch |
| 1.3-L | `schema_version 0 → 2`: migration guard `< 2` covers `0`, stamps `2` directly | tasks.md:43, spec:114-120 | ✅ | Guard is `< CURRENT_SCHEMA_VERSION` which catches 0; test at `canonical_spell.rs:3704-3712` confirms `spell.schema_version = 0` → final `2` |
| 1.3-M | `MIN_SUPPORTED_SCHEMA_VERSION = 1` with explicit comment | tasks.md:44 | ✅ | `canonical_spell.rs:25-27` — Comment explains v1 migration compatibility |
| 1.3-N | `debug_assert!(>= CURRENT)` post-migration invariant | Prior review C1 | ✅ | `canonical_spell.rs:817-821` — `debug_assert!(self.schema_version >= CURRENT_SCHEMA_VERSION, ...)` |

### Task 1.4 — Rust Parser `raw_legacy_value` Preservation

| ID | Requirement | Source | Code Status | Evidence |
|---|---|---|---|---|
| 1.4-A | **Area** parser: `raw_legacy_value` set unconditionally (success + fallback) | tasks.md:46, importers spec:23,49 | ✅ | `area.rs:316` — `area.raw_legacy_value = Some(input_clean.to_string())` after all parse paths merge |
| 1.4-B | **Duration** parser: `raw_legacy_value` set unconditionally | tasks.md:46, importers:49 | ✅ | `duration.rs` — All return paths set `raw_legacy_value: Some(input_clean.to_string())` |
| 1.4-C | **Range** parser: `raw_legacy_value` set unconditionally | tasks.md:46, importers:23 | ✅ | `range.rs` — All return paths set `raw_legacy_value: Some(input_clean.to_string())` |
| 1.4-D | **Casting time** parser: `raw_legacy_value` set unconditionally for all non-empty branches | tasks.md:46, importers:29 | ✅ | `components.rs:17-114` — All 8 branches (bonus_action, reaction, action, round, minute, hour, segment, generic fallback) set `raw_legacy_value: Some(input_clean.to_string())` |
| 1.4-E | **Saving throw** parser: `raw_legacy_value` set unconditionally | tasks.md:47, importers:97-102 | ✅ | `mechanics.rs:343,354` — Both Multiple and Single return paths set `raw_legacy_value: Some(input_clean.to_string())` |
| 1.4-F | Area/Duration `kind="special"` fallback: `.text == raw_legacy_value` | tasks.md:48, importers:57, design:25 | ✅ | `area.rs:317` calls `synthesize_text()`; `area_spec.rs:392` — `AreaKind::Special => self.raw_legacy_value.clone()`. Same for `duration_spec.rs:158` |
| 1.4-G | Parsed Area/Duration: best-effort `.text` from structured fields | tasks.md:49 | ✅ | `area.rs:317` calls `synthesize_text()` which dispatches by kind; `duration.rs` similarly |
| 1.4-H | Empty/null input: `raw_legacy_value` is `None` (not `Some("")`) | tasks.md:50 | ✅ | `area.rs:40-42` returns `None`; `duration.rs` returns `raw_legacy_value: None` for empty; `range.rs` returns default with None; `components.rs:23` returns `SpellCastingTime::default()` (raw_legacy_value = None); `mechanics.rs:311-316` returns with `raw_legacy_value: None` |
| 1.4-I | 5e casting units remapped to `Special` at parser layer | tasks.md:45, importers:30 | ✅ | `components.rs:39-66` — `CastingTimeUnit::Special` for bonus_action, reaction, action branches |
| 1.4-J | Save mapping table matches spec (6-row, first-match-wins) | tasks.md:51, importers:116-123 | ✅ | `mechanics.rs:378-400` — Order: poison/death/paraly → breath → rod/staff/wand → poly/petri → special → default (spell). Matches spec table exactly |
| 1.4-K | `is_standard_complex` fires before split decision | tasks.md:52 | ✅ | `mechanics.rs:330-332` — Computed before `if parts.len() > 1 && !is_standard_complex` check |
| 1.4-L | `is_standard_complex` — exact normalized category match (C4 resolution) | Prior review C4 | ✅ | `mechanics.rs:21-41` — `is_standard_complex_save_category()` uses `matches!` on normalized canonical phrases |
| 1.4-M | Parser does NOT set `notes` on saving throw (C2 resolution) | Prior review C2 | ✅ | `mechanics.rs:345,356` — Both paths emit `notes: None` |

### Task 1.5 — Rust Unit Tests

| ID | Required Test | Source | Status | Test Name |
|---|---|---|---|---|
| 1.5-A | `migrate_to_v2()` happy path (3 steps) | tasks.md:55 | ✅ | `test_migrate_v1_to_v2` |
| 1.5-B | Notes truncation error path (exceeds 2048) | tasks.md:56 | ✅ | `test_migrate_v1_to_v2_notes_truncation_flag` |
| 1.5-C | Casting time empty/null synthesis | tasks.md:57 | ✅ | `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw` |
| 1.5-D | No-overwrite guard for casting time | tasks.md:58 | ✅ | `test_migrate_v1_to_v2_casting_time_preserves_existing_raw` |
| 1.5-E | `schema_version 0 → 2` ordering | tasks.md:59 | ✅ | `test_migrate_v1_to_v2_schema_version_zero_to_two` |
| 1.5-F | `schema_version >= 2` passthrough | tasks.md:60 | ✅ | `test_migrate_v1_to_v2_passthrough_for_v2_and_newer` |
| 1.5-G | Unconditional `raw_legacy_value` on parse success + fallback | tasks.md:62 | ✅ | `test_unconditional_legacy_text_preservation` in area.rs, duration.rs, range.rs |
| 1.5-H | Empty/null input → `raw_legacy_value: None` | tasks.md:63 | ✅ | `test_parse_area_empty_returns_none`, `test_parse_duration_empty_raw_legacy_value_none`, `test_parse_range_empty_raw_legacy_value_none`, `test_parse_casting_time_empty_raw_legacy_value_none`, `test_parse_saving_throw_empty_and_none_raw_legacy_value_none` |
| 1.5-I | Multiple saves: full unsplit raw capture | tasks.md:64 | ✅ | `test_parse_saving_throw_multiple_retains_full_raw_legacy_value` |
| 1.5-J | `is_standard_complex`: "Rod, Staff, or Wand" = single save | tasks.md:65 | ✅ | `test_parse_saving_throw_rod_staff_wand_single_save` |
| 1.5-K | `.text` synthesis from structured fields (non-special) | tasks.md:67 | ✅ | `test_normalize_area_duration_text_synthesis_structured_fields` |
| 1.5-L | `.text` synthesis for `kind="special"` (from raw_legacy_value) | tasks.md:67 | ✅ | `test_normalize_area_duration_text_synthesis` |
| 1.5-M | `raw_legacy_value` IS part of canonical hash | tasks.md:68 | ✅ | `test_raw_legacy_value_included_in_hash` |
| 1.5-N | `source_text` IS excluded/pruned from hash | tasks.md:68 | ✅ | `test_damage_source_text_excluded_from_hash`, `test_magic_resistance_source_text_excluded_from_hash` |
| 1.5-O | `compute_hash()` truncation Err (single-spell) | tasks.md:42 (implied by 1.3-J) | ✅ | `test_compute_hash_and_canonical_json_error_when_notes_truncated` |
| 1.5-P | `SpellDamageSpec` serde alias coexistence | Robustness (C5) | ✅ | `test_damage_spec_alias_raw_legacy_value_reads_into_source_text`, `test_damage_spec_alias_coexistence_rejected_as_duplicate_field` |

### Task 1.6 — `migrate_all_spells_to_v2` Bulk Migration Command

| ID | Requirement | Source | Code Status | Evidence |
|---|---|---|---|---|
| 1.6-A | Return type `MigrationResult { total, migrated, skipped, failed }` | tasks.md:70, spec:137 | ✅ | `canonical_spell.rs:593-599` — Struct matches |
| 1.6-B | `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }` | tasks.md:70, spec:137 | ✅ | `canonical_spell.rs:586-591` — Type matches contract |
| 1.6-C | `migration-progress` events with `{ current, total }` | tasks.md:71, spec:138 | ✅ | `canonical_spell.rs:4017-4021` — `window.emit("migration-progress", ...)` |
| 1.6-D | Spells at `schema_version >= 2` counted in `skipped` | tasks.md:72, spec:141 | ✅ | `canonical_spell.rs:3940,3976-3977` — `if spell.schema_version < 2 { ... } else { result.skipped += 1; }` |
| 1.6-E | All successful writes in single `BEGIN`/`COMMIT` | tasks.md:72, spec:139 | ✅ | `canonical_spell.rs:4016,4023` — `conn.transaction()` + `tx.commit()` |
| 1.6-F | Spell-level failures collected without aborting batch | tasks.md:72, spec:140 | ✅ | `canonical_spell.rs:3942-3975` — Truncation, hash error, JSON error all push to `failed` and continue |
| 1.6-G | DB-level failures rollback entire transaction | tasks.md:72, spec:140 | ✅ | `canonical_spell.rs:4001` — `update_stmt.execute(...)?` propagates; if any `?` fails the function returns Err, and the transaction's Drop rolls back |
| 1.6-H | Progress callback runs even on failure paths | Prior review C6 | ✅ | `canonical_spell.rs:3989-3991` — Progress is outside the match block, runs after all branches (including failure branches) |

---

## Pass 2 — Code Reality Audit (New Observations)

### N1 — `parse_magic_resistance` populates `source_text` for empty/`"None"`/`"0"` inputs
**Severity: Low (minor spec tension; no hash impact)**

```rust
// mechanics.rs:252-261
if input_clean.is_empty() || input_clean == "0" || input_clean.eq_ignore_ascii_case("None") {
    return MagicResistanceSpec {
        kind: MagicResistanceKind::Unknown,
        source_text: Some(input_clean.to_string()),
        ..Default::default()
    };
}
```

For empty strings, this produces `source_text: Some("")` — a non-null empty string. The task 1.4 requirement for empty/null → `None` explicitly applies to `raw_legacy_value` on hashed fields (task 1.4 bullet: "For empty/null input: `raw_legacy_value` MUST be `None` (not `Some(\"\")`)"). The `source_text` field on `MagicResistanceSpec` is non-hashed metadata, so this has **no hash impact** — `source_text` is pruned by `prune_metadata_recursive`.

However, there is a semantic inconsistency: the task doesn't explicitly state the empty-input behavior for `source_text` on non-hashed specs, but the importers spec says (§Scenario: Empty or Null Input): "populating `raw_legacy_value` is not required when there is no source text to preserve" — this is about `raw_legacy_value` specifically, not `source_text`.

For `"None"` and `"0"`, storing the sentinel in `source_text: Some("None")` or `Some("0")` is reasonable — there IS source text, and it's informational. For empty `""`, `source_text: Some("")` is a minor wart since `prune_metadata_recursive` strips empty strings from the hash surface anyway, and `skip_serializing_if = "Option::is_none"` will still serialize `Some("")` as `""` in the JSON.

**Assessment:** Non-blocking. The behavior is consistent with the `parse_magic_resistance("Yes")` branch which also sets `source_text: Some(input_clean.to_string())`. The `MagicResistanceSpec.is_default()` check already handles empty `source_text` correctly (checks `self.source_text.is_none()`, which is false for `Some("")`, so the MR spec won't be pruned — but it's kind=Unknown with `source_text: Some("")`, which is functionally harmless).

**Recommendation:** Optional cleanup: set `source_text: None` when `input_clean.is_empty()` to match the spirit of the empty-input convention. Negligible priority.

---

### N2 — `parse_magic_resistance` sets `notes` to raw input unconditionally
**Severity: Low (notes is hashed; similar to C2 but for MR)**

```rust
// mechanics.rs:293-304
MagicResistanceSpec {
    kind,
    applies_to,
    partial,
    special_rule: if kind == MagicResistanceKind::Special {
        Some(input_clean.to_string())
    } else { None },
    notes: Some(input_clean.to_string()),      // <-- HERE
    source_text: Some(input_clean.to_string()),
}
```

The parser unconditionally sets `notes` to the raw input for all non-empty, non-sentinel inputs. Unlike C2 (which was fixed for `SavingThrowSpec`), this has **not** been addressed for `MagicResistanceSpec`.

**Impact analysis:**
- `MagicResistanceSpec.notes` is **not** pruned by `prune_metadata_recursive` (only `source_text`/`sourceText` are pruned at depth).
- However, `MagicResistanceSpec` is pruned at the spec level by `is_default()` check in `normalize()` — but only when ALL fields are default. When `kind != Unknown`, `notes` participates in the canonical hash.
- The same raw input is now in **both** `notes` (hashed) and `source_text` (not hashed), creating a redundancy where the audit text (`source_text`) is duplicated as hashed content (`notes`) for every spell with MR.
- A spell entering the system through the editor with the same structured MR values but custom `notes` will hash differently than one parsed from text.

**However:** This was the pre-existing behavior before any `refine-computed-fields-schema` changes. The parser always set `notes` this way. The change only added `source_text` alongside it. Making `notes: None` here would change hash values for all spells with MR data, which is outside the scope of the v1→v2 migration.

**Assessment:** Non-blocking for this change. This is a pre-existing pattern, not a regression. The existing behavior is preserved, and `source_text` provides the proper non-hashed audit trail regardless.

**Recommendation:** Flag for a future v2→v3 migration if MR `notes` redundancy becomes problematic. Do NOT change now — it would invalidate existing hashes beyond the v1→v2 scope.

---

### N3 — `synthesize_text()` for AreaSpec does not apply unit alias normalization
**Severity: Negligible (normalize() in CanonicalSpell pipeline applies it downstream)**

`AreaSpec::synthesize_text()` at `area_spec.rs:372-468` produces raw text like `"20 ft radius"` without applying `normalize_structured_text_with_unit_aliases()` — unlike `DurationSpec::synthesize_text()` which applies it at `duration_spec.rs:179-181`:

```rust
// duration_spec.rs:178-182 — applies alias normalization
if let Some(t) = synthesized {
    self.text = Some(
        normalize_structured_text_with_unit_aliases(&t),
    );
}
```

```rust
// area_spec.rs:465-467 — does NOT apply alias normalization
if let Some(t) = synthesized {
    self.text = Some(t);  // raw, no alias normalization
}
```

**Impact analysis:** In the full `CanonicalSpell::normalize()` pipeline, `area.normalize()` runs first (which normalizes an existing `.text` if present via the `if let Some(t) = &mut self.text` branch at `area_spec.rs:351-353`), then `area.synthesize_text()` overwrites `.text` with the new un-aliased value. The overwritten value is NOT subsequently re-normalized by the pipeline — there is no second `normalize()` call after `synthesize_text()`.

Wait — looking more carefully at `canonical_spell.rs:712-715`:
```rust
if let Some(area) = &mut self.area {
    area.normalize();      // normalizes existing .text if present
    area.synthesize_text(); // OVERWRITES .text from structured fields
}
```

After `synthesize_text()`, the area's `.text` contains the raw synthesized string without unit alias normalization. For example, if units were stored as `AreaUnit::Ft`, then `to_text()` returns `"ft"` — which is already the normalized form. The alias table converts things like `"yards" → "yd"`, `"feet" → "ft"`, etc. Since `AreaSpec::synthesize_text()` uses `unit.to_text()` which produces the canonical short forms directly (`"ft"`, `"yd"`, `"mi"`, `"inch"`), the alias normalization would be a no-op in practice.

The same is true for `DurationSpec::synthesize_text()` — it uses `unit.to_text()` which produces `"round"`, `"turn"`, etc. — none of which appear in the unit alias table. So the `normalize_structured_text_with_unit_aliases()` call in Duration is technically a no-op as well, but it's there for safety.

**Assessment:** The asymmetry is cosmetic — both produce already-alias-normalized output because `to_text()` returns canonical forms. However, for consistency with Duration and for defense-in-depth, Area should apply the same alias normalization.

**Recommendation:** Add `normalize_structured_text_with_unit_aliases()` to AreaSpec's `synthesize_text()` for parity with DurationSpec. Low priority — functionally equivalent but improves consistency.

---

### N4 — `base_value` synthesis in migration uses `f64` format (potential "0 action" vs "0.0 action")
**Severity: Negligible (no functional impact)**

```rust
// canonical_spell.rs:660-661
ct.raw_legacy_value = Some(format!("{} {}", ct.base_value.unwrap_or(0.0), unit_str));
```

Rust's `f64` Display trait formats `0.0_f64` as `"0"` and `1.0_f64` as `"1"`, so `format!("{} {}", 0.0, "action")` produces `"0 action"` (not `"0.0 action"`). This matches the design document's expected output (`"0 action"`).

For fractional values like `1.5`, this would produce `"1.5 action"`, which is the correct behavior.

**Assessment:** Correct. Verified by test `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw` which asserts `Some("0 action")`.

---

### N5 — `default_schema_version()` returns `2` — important for new spells
**Severity: Informational (correct by design)**

```rust
// canonical_spell.rs:250-252
fn default_schema_version() -> i64 {
    2
}
```

`CanonicalSpell::new()` at line 286 also uses `CURRENT_SCHEMA_VERSION` (= 2). The `default_schema_version()` function is used as the serde default for deserialization of JSON that omits `schema_version`. This means:
- New spells created via `CanonicalSpell::new()` → `schema_version = 2` ✅
- Spells deserialized from JSON without `schema_version` → `schema_version = 2` (treated as current) ✅
- The §2.5 default materialization pathway that would set `0 → 1` is now superseded by `migrate_to_v2()` which runs first and stamps `2`.

**Assessment:** Correct. The serde default of `2` means newly imported spells (from Python or Rust parser) that don't explicitly set `schema_version` will be treated as v2, which is the intended behavior per importers spec §Requirement: Schema Version Stamp for New Imports.

---

### N6 — `CanonicalSpell::normalize()` ordering: migration before normalization roundtrip
**Severity: Informational (verified correct)**

The `normalize()` function at `canonical_spell.rs:680-856` follows this order:
1. **Migration** (`migrate_to_v2`) — lines 682-685
2. **String sanitization** (name, tradition, description, etc.) — lines 687-691
3. **Sub-spec normalization** (materials, range, casting_time, duration, area, damage, MR, ST, XP) — lines 693-731
4. **Tradition-consistent clearing** — lines 737-742
5. **Default materialization/pruning** — lines 744-781
6. **Component sync** — lines 783-811
7. **Schema version assert** — lines 814-821
8. **Array sort/dedup** — lines 823-853

This means:
- `migrate_to_v2()` runs on the raw v1-shaped spell before any normalization.
- After migration stamps `schema_version = 2`, the sub-spec normalization (e.g. `ct.normalize()`) runs on the migrated fields.
- The `SavingThrowSpec::normalize()` at `saving_throw.rs:172-190` normalizes `notes` via Textual mode — this correctly normalizes `notes` AFTER migration has appended `dm_guidance` content.
- `raw_legacy_value` on hashed specs is NOT normalized by any sub-spec `normalize()` method, which is correct per Decision 6.

**Assessment:** Ordering is correct and matches the canonical-serialization contract.

---

### N7 — Bulk migration `compute_hash()` double-normalizes migrated spells
**Severity: Low (performance, no correctness impact)**

In `run_migration_batch_impl()` at `canonical_spell.rs:3941-3950`:
```rust
let res = spell.normalize(Some(db_id));  // normalize (includes migration)
if res.notes_truncated { ... } else {
    match spell.compute_hash() {   // compute_hash clones + normalizes again
```

`compute_hash()` at `canonical_spell.rs:520-536` clones the spell and calls `normalize()` a second time:
```rust
pub fn compute_hash(&self) -> Result<String, String> {
    let mut normalized_clone = self.clone();
    let res = normalized_clone.normalize(None);  // <-- second normalization
    ...
}
```

Since `spell` has already been normalized (schema_version = 2 after migration), the second `normalize()` call inside `compute_hash()` will:
- Skip migration (schema_version >= 2)
- Re-run all normalization steps (which are idempotent but redundant)

**Assessment:** Functionally correct due to normalization idempotency, but wastes CPU time by normalizing every spell twice in the batch path. For a large database this could matter.

**Recommendation:** Consider using `to_canonical_json_pre_normalized()` directly in the batch path since the spell was already normalized by `spell.normalize(Some(db_id))`. This requires computing the hash manually:
```rust
let canonical_json = spell.to_canonical_json_pre_normalized()?;
let hash = Sha256::digest(canonical_json.as_bytes());
let hash_hex = hex::encode(hash);
```
Low priority — current approach is correct.

---

### N8 — `SpellCastingTime::normalize()` removes the 5e safety shim comment but not the runtime logic
**Severity: Negligible (comment correctness)**

```rust
// canonical_spell.rs:124-126
// Task 1.3: migrate_to_v2() now handles remapping Action/BonusAction/Reaction
// to Special before this normalize() call, so we no longer need the shim here.
```

The comment says the shim is removed, and indeed no remapping code exists in `SpellCastingTime::normalize()`. However, task 1.1's intermediate-state notice (tasks.md:24) mentioned a "pre-migration safety shim" that was added to remap 5e units before validation. The comment confirms this was removed after task 1.3 made it unnecessary.

**Assessment:** Correct. The migration now runs first in `normalize()`, so by the time `SpellCastingTime::normalize()` runs, all 5e units are already remapped.

---

### N9 — `parse_saving_throw` for `"None"` sentinel returns `raw_legacy_value: None` but `kind: SavingThrowKind::None`
**Severity: Informational (matches contract)**

```rust
// mechanics.rs:311-316
if input_clean.is_empty() || input_clean == "None" {
    return SavingThrowSpec {
        raw_legacy_value: None,
        ..Default::default()
    };
}
```

The `"None"` sentinel (meaning "no saving throw required") correctly produces `raw_legacy_value: None`. The default `SavingThrowSpec` has `kind: SavingThrowKind::None`, which matches. Then `is_default()` returns `true` for this spec, causing it to be pruned to `saving_throw: None` on the `CanonicalSpell` during normalization at `canonical_spell.rs:764-768`.

**Assessment:** Correct. A spell with no saving throw has no SavingThrowSpec, no raw source text to preserve.

---

## Pass 3 — Test Sufficiency Audit

### Complete Coverage Map

| Category | Tests | Count | Assessment |
|---|---|---|---|
| **Migration happy path** | `test_migrate_v1_to_v2` | 1 | ✅ All 3 steps covered |
| **Migration truncation** | `test_migrate_v1_to_v2_notes_truncation_flag`, `test_compute_hash_and_canonical_json_error_when_notes_truncated` | 2 | ✅ Flag + Err paths |
| **Migration casting time** | `test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw`, `test_migrate_v1_to_v2_casting_time_preserves_existing_raw` | 2 | ✅ Synthesis + no-overwrite |
| **Migration schema_version** | `test_migrate_v1_to_v2_schema_version_zero_to_two`, `test_migrate_v1_to_v2_passthrough_for_v2_and_newer`, `test_migrate_v1_to_v2_passthrough_future_schema_version` | 3 | ✅ 0→2, ≥2 passthrough, future (3+) passthrough |
| **Parser empty/null → None** | 5 tests across area, duration, range, components, mechanics | 5 | ✅ All hashed parsers |
| **Parser unconditional raw** | `test_unconditional_legacy_text_preservation` in area, duration, range | 3 | ✅ Success + fallback |
| **Multiple-save raw capture** | `test_parse_saving_throw_multiple_retains_full_raw_legacy_value` | 1 | ✅ Full unsplit string |
| **is_standard_complex** | `test_parse_saving_throw_rod_staff_wand_single_save`, `test_parse_saving_throw_death_magic_or_polymorph_splits_multiple` | 2 | ✅ Single + split cases |
| **Hash semantics** | `test_raw_legacy_value_included_in_hash`, `test_damage_source_text_excluded_from_hash`, `test_magic_resistance_source_text_excluded_from_hash` | 3 | ✅ raw=included, source_text=excluded |
| **.text synthesis** | `test_normalize_area_duration_text_synthesis` (special), `test_normalize_area_duration_text_synthesis_structured_fields` (structured) | 2 | ✅ Both paths |
| **Serde alias** | `test_damage_spec_alias_raw_legacy_value_reads_into_source_text`, `test_damage_spec_alias_coexistence_rejected_as_duplicate_field` | 2 | ✅ Single-key + coexistence |
| **Batch migration** | `test_migration_batch_spell_level_failure_does_not_abort`, `test_migration_batch_db_failure_rollback`, `test_migration_batch_progress_emitted_on_truncation_failure` | 3 | ✅ Spell-level, DB-level, progress |
| **Priority D (TG2–TG5)** | `test_magic_resistance_normalize_applies_textual_to_source_text`, `test_raw_legacy_value_unchanged_by_normalize`, `test_migrate_v1_to_v2_step_ordering_both_steps_in_single_normalize`, `test_migrate_v1_to_v2_passthrough_future_schema_version` | 4 | ✅ MR source_text normalization, ST raw_legacy_value passthrough, migration step ordering, future schema passthrough |

### Test Gap Assessment

| ID | Potential Gap | Assessment | Priority |
|---|---|---|---|
| TG2 | **`MagicResistanceSpec.source_text` Textual normalization test** — No test verifies that `mr.normalize()` applies Textual mode to `source_text`. The normalize implementation is correct (`magic_resistance.rs:121-125`), but there's no test asserting it. | ✅ Resolved | Low |
| TG3 | **`SavingThrowSpec.raw_legacy_value` is NOT normalized test** — No test explicitly verifies that `raw_legacy_value` passes through `SavingThrowSpec::normalize()` unchanged (stored as-is). The code is correct (no normalization applied to raw_legacy_value in `normalize()`), but there's no explicit regression test. | ✅ Resolved | Low |
| TG4 | **Migration step ordering test** — No test explicitly verifies that migration step (1) runs before step (2); e.g., a spell with both `dm_guidance` AND a 5e casting time should have `dm_guidance` moved to `notes` AND 5e unit remapped after a single `normalize()` call. The happy-path test covers all 3 steps but could be strengthened. | ✅ Resolved | Low |
| TG5 | **`schema_version > CURRENT` passthrough** — `test_migrate_v1_to_v2_passthrough_for_v2_and_newer` uses exactly `schema_version = 2`. No test uses a future version (e.g., `schema_version = 3`) to verify forward compatibility. The code (`>= CURRENT_SCHEMA_VERSION`) handles it, but a `schema_version = 3` test would be stronger. | ✅ Resolved | Very Low |

---

## Findings Summary

### New Findings (this review)

| ID | Description | Severity | Type | Blocking? | Status |
|---|---|---|---|---|---|
| N1 | `parse_magic_resistance` sets `source_text: Some("")` for empty input | Low | Consistency | No | ✅ Resolved 2026-02-26 |
| N2 | `parse_magic_resistance` sets `notes` to raw input (pre-existing; redundant with `source_text`) | Low | Pre-existing | No | — |
| N3 | `AreaSpec::synthesize_text()` omits `normalize_structured_text_with_unit_aliases()` (functionally no-op) | Negligible | Consistency | No | ✅ Resolved 2026-02-26 |
| N7 | Bulk migration double-normalizes spells via `compute_hash()` | Low | Performance | No | ✅ Resolved 2026-02-26 |
| TG2-5 | Minor test coverage gaps (no incorrect behavior) | Low | Test gaps | No | ✅ Resolved 2026-02-26 |

### Confirmed Resolutions from Prior Reviews

| Prior ID | Description | Status |
|---|---|---|
| C1 | Dead secondary schema_version stamp block | ✅ Replaced with `debug_assert!` |
| C2 | Parser populates `notes` from raw input (SavingThrowSpec) | ✅ notes set to None |
| C3 | Casting time special fallback sentinel values | ✅ Replaced with `..Default::default()` |
| C4 | `is_standard_complex` substring matching | ✅ Replaced with exact normalized category matching |
| C5 | Damage spec serde alias coexistence coverage | ✅ Tests added |
| C6 | Progress events skipped for failure paths | ✅ Restructured; test added |
| G1 | Area/Duration .text synthesis from structured fields | ✅ Test added |
| G2 | `compute_hash()` truncation Err path | ✅ Test added |
| G3 | SpellDamageSpec serde alias coexistence | ✅ Tests added |

---

## Verdict

| Task | Status | Confidence | New Findings | Follow-on Work |
|---|---|---|---|---|
| **1.3** | ✅ Complete | **High** | N4 (informational), N5 (informational), N7 (performance) | N7 done 2026-02-26 |
| **1.4** | ✅ Complete | **High** | N1 (low), N2 (pre-existing), N9 (informational) | N1 done 2026-02-26 |
| **1.5** | ✅ Complete | **High** | TG2-5 resolved (tests added) | — |
| **1.6** | ✅ Complete | **High** | N7 (performance) | N7 done 2026-02-26 |

**Overall Assessment:** All four tasks are **fully implemented and correct**. The 204 passing tests (including Priority D TG2–TG5, added 2026-02-26) provide comprehensive coverage of all contract requirements. No blocking issues or correctness defects were found. The new findings are minor consistency improvements and optional performance optimizations that do not affect the correctness or safety of the v1→v2 migration.

---

## Recommended Priority Actions

### Priority A — Correctness Blockers
**None.** All spec contracts are correctly implemented.

### Priority B — Consistency improvements (Optional, non-blocking) — **Completed 2026-02-26**

| ID | Issue | File | Status |
|---|---|---|---|
| N1 | Set `source_text: None` for empty MR input | `mechanics.rs` `parse_magic_resistance` | ✅ Done |
| N3 | Add `normalize_structured_text_with_unit_aliases()` to `AreaSpec::synthesize_text()` | `area_spec.rs` | ✅ Done |

### Priority C — Performance improvements (Optional, non-blocking) — **Completed 2026-02-26**

| ID | Issue | File | Status |
|---|---|---|---|
| N7 | Avoid double normalization in batch migration path | `canonical_spell.rs` `run_migration_batch_impl` | ✅ Done |

### Priority D — Test hardening (Optional, non-blocking) — **Completed 2026-02-26**

| ID | Issue | File | Status | Test name |
|---|---|---|---|---|
| TG2 | MR `source_text` Textual normalization test | `magic_resistance.rs` | ✅ Done | `test_magic_resistance_normalize_applies_textual_to_source_text` |
| TG3 | ST `raw_legacy_value` not-normalized assertion test | `saving_throw.rs` | ✅ Done | `test_raw_legacy_value_unchanged_by_normalize` |
| TG4 | Migration step ordering combination test | `canonical_spell.rs` | ✅ Done | `test_migrate_v1_to_v2_step_ordering_both_steps_in_single_normalize` |
| TG5 | Future schema_version (3+) passthrough test | `canonical_spell.rs` | ✅ Done | `test_migrate_v1_to_v2_passthrough_future_schema_version` |

---

## Evidence Index

| Artifact | Path |
|---|---|
| Schema version constants, migration, normalize(), bulk command | `apps/desktop/src-tauri/src/models/canonical_spell.rs` |
| Saving throw model, normalize, is_default | `apps/desktop/src-tauri/src/models/saving_throw.rs` |
| Area spec model, normalize, synthesize_text | `apps/desktop/src-tauri/src/models/area_spec.rs` |
| Duration spec model, normalize, synthesize_text | `apps/desktop/src-tauri/src/models/duration_spec.rs` |
| Magic resistance model, normalize | `apps/desktop/src-tauri/src/models/magic_resistance.rs` |
| Damage spec model, serde alias | `apps/desktop/src-tauri/src/models/damage.rs` |
| Saving throw parser, save mapping, is_standard_complex | `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs` |
| Casting time parser | `apps/desktop/src-tauri/src/utils/parsers/components.rs` |
| Area parser | `apps/desktop/src-tauri/src/utils/parsers/area.rs` |
| Duration parser | `apps/desktop/src-tauri/src/utils/parsers/duration.rs` |
| Range parser | `apps/desktop/src-tauri/src/utils/parsers/range.rs` |
| Task requirements | `openspec/changes/refine-computed-fields-schema/tasks.md` |
| Backend spec | `openspec/changes/refine-computed-fields-schema/specs/backend/spec.md` |
| Importers spec | `openspec/changes/refine-computed-fields-schema/specs/importers/spec.md` |
| Design document | `openspec/changes/refine-computed-fields-schema/design.md` |
| Prior review (2026-02-25 18:00) | `openspec/changes/refine-computed-fields-schema/review-tasks-1-3-through-1-6-2026_02_25_18_00.md` |
| Prior review (2026-02-26 06:00) | `openspec/changes/refine-computed-fields-schema/review-tasks-1-3-through-1-6-2026_02_26_06_00.md` |
