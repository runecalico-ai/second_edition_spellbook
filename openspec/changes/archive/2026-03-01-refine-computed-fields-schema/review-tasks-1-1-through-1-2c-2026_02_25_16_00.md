# Code Review — Tasks 1.1, 1.2, 1.2b, 1.2c
## `refine-computed-fields-schema`

**Author:** GitHub Copilot  
**Date:** 2026-02-25  
**Scope:** `spell.schema.json`, `models/area_spec.rs`, `models/duration_spec.rs`, `models/saving_throw.rs`, `models/damage.rs`, `models/magic_resistance.rs`, `models/canonical_spell.rs`

---

## Executive Summary

Three issues were found spanning critical, moderate, and minor severity.

| Severity | Count | Description |
|---|---|---|
| 🔴 Critical | 1 | ✅ **Fixed** — `source_text` pruning now correctly excludes camelCase `sourceText` from canonical hash input |
| 🟡 Moderate | 1 | ✅ **Fixed** — `synthesize_area_text` now uses `area.shape_unit` for dimensional/geometric shapes |
| 🔵 Minor | 1 | `MagicResistanceSpec::is_default()` omits `source_text`, causing silent discard of metadata when kind is Unknown |

All other task requirements are correctly implemented.

---

## Pass 1 — Correctness

### ✅ BUG-1 (Fixed): `prune_metadata_recursive` now prunes both `"source_text"` and `"sourceText"`

**Files:** `src/models/canonical_spell.rs` (prune), `src/models/damage.rs`, `src/models/magic_resistance.rs`, `src/models/experience.rs`

**Root cause:**  
`prune_metadata_recursive` removes `"source_text"` by key name:

```rust
// canonical_spell.rs ~L345
obj.remove("source_text");
```

However, all three structs that carry `source_text` are annotated with `#[serde(rename_all = "camelCase")]`:

| Struct | serde annotation on struct | Serialized key of `source_text` |
|---|---|---|
| `SpellDamageSpec` | `#[serde(rename_all = "camelCase")]` | `"sourceText"` |
| `MagicResistanceSpec` | `#[serde(rename_all = "camelCase")]` | `"sourceText"` |
| `ExperienceComponentSpec` | `#[serde(rename_all = "camelCase")]` | `"sourceText"` |

When `to_canonical_json_pre_normalized()` calls `serde_json::to_value(self)`, the nested structs serialize using their own `rename_all` rules. The resulting JSON therefore contains the key `"sourceText"`, not `"source_text"`. The `obj.remove("source_text")` call never matches, and `source_text` silently remains in the canonical hash input.

**Impact:**  
- `SpellDamageSpec.source_text` and `MagicResistanceSpec.source_text` are intended as **non-hashed metadata** per the design contract (§2.3). Their inclusion in the hash means:
  1. Importing the same spell from two sources with different original text strings produces **different hashes**, breaking deduplication.
  2. Editing `source_text` (e.g., during review cleanup) changes the spell's canonical identity.
- `ExperienceComponentSpec.source_text` has the same pre-existing bug, which means this was never actually working as intended.
- The task checklist states "the existing key-name exclusion for `source_text` (which already handles `ExperienceComponentSpec`) should cover both new fields automatically" — this claim is **incorrect**. ExperienceComponentSpec was also broken for the same reason.

**Reproduction:**  
Construct a `CanonicalSpell` with `damage = Some(SpellDamageSpec { kind: None, source_text: Some("1d6+1 per level"), .. })` and call `compute_hash()`. Repeat with `source_text: Some("different text")`. The hashes will differ despite the structured fields being identical.

**Fix:**  
Add `"sourceText"` to the prune set alongside `"source_text"`:

```rust
// canonical_spell.rs — prune_metadata_recursive
obj.remove("artifacts");
obj.remove("source_refs");
obj.remove("source_text");   // snake_case: covers any future snake_case usage
obj.remove("sourceText");    // camelCase: covers SpellDamageSpec, MagicResistanceSpec, ExperienceComponentSpec
```

Or, refactor to prune both forms in a single helper. A regex-based prune is unnecessary given the fixed set of keys.

> **Note on `DurationSpec.notes` and `AreaSpec.notes`** — These are also camelCase-adjacent fields on camelCase structs but are intentionally hashed (they carry semantic content). Only `source_text` / `sourceText` is non-hashed metadata. The fix is additive; no existing field should be removed from its current behavior.

---

### ✅ BUG-2 (Fixed): `synthesize_area_text` now uses `area.shape_unit` for dimensional shapes

**File:** `src/models/canonical_spell.rs` — `synthesize_area_text()`  
**Task:** 1.2b

**Background:**  
`AreaSpec` has two unit fields:
- `shape_unit: Option<AreaShapeUnit>` — linear dimensions (ft/yd/mi/inch); required by schema `allOf` for `radius_circle`, `radius_sphere`, `cone`, `line`, `rect`, `rect_prism`, `cylinder`, `wall`, `cube`.
- `unit: Option<AreaUnit>` — the full set including area units (`ft2`, `yd2`, `square`, `ft3`, `yd3`, `hex`, `room`, `floor`); required for `surface`, `volume`, `tiles`, `creatures`, `objects`.

The synthesis function uses the generic `shaped()` closure which takes `area.unit`:

```rust
// canonical_spell.rs
let shaped = |scalar: &Option<SpellScalar>, unit: Option<AreaUnit>| -> Option<String> {
    scalar.as_ref().map(|s| {
        format!("{} {}", scalar_to_text(s), area_unit_to_text(unit.unwrap_or(AreaUnit::Ft)))
    })
};

// Used for geometric shapes:
AreaKind::RadiusCircle => shaped(&area.radius, area.unit).map(|v| format!("{} radius", v)),
AreaKind::Cone         => shaped(&area.length, area.unit).map(|v| format!("{} cone", v)),
AreaKind::Line         => shaped(&area.length, area.unit).map(|v| format!("{} line", v)),
AreaKind::Cube         => shaped(&area.edge,   area.unit).map(|v| format!("{} cube", v)),
```

**Impact:**  
For a `radius_circle` area where the parser correctly sets `shape_unit = Some(AreaShapeUnit::Yd)` and leaves `unit = None`, the `shaped()` call produces `"20 ft radius"` (wrong — defaulting to Ft) instead of `"20 yd radius"`. The hash will encode the wrong unit in `.text`.

More critically, if a spell data record has `shape_unit = Some(AreaShapeUnit::Yd)` and also `unit = Some(AreaUnit::Ft2)` (which is valid per schema — the two fields are independent), the synthesis uses `area.unit` (`Ft2`) and produces nonsensical text like `"20 ft2 radius"`.

**Minimal repro case:**
```json
{ "kind": "radius_circle", "radius": {"mode": "fixed", "value": 20}, "shape_unit": "yd" }
```
Expected `.text`: `"20 yd radius"`  
Actual `.text`: `"20 ft radius"` (unit defaults to Ft because `area.unit` is None)

**Fix:**  
Update the `shaped()` helper to accept an `AreaShapeUnit` (or simply a `&'static str` from a unit conversion), and thread `area.shape_unit` through for the geometric shape branches. The `AreaShapeUnit` values (Ft, Yd, Mi, Inch) all have counterpart string outputs:

```rust
fn area_shape_unit_to_text(unit: AreaShapeUnit) -> &'static str {
    match unit {
        AreaShapeUnit::Ft   => "ft",
        AreaShapeUnit::Yd   => "yd",
        AreaShapeUnit::Mi   => "mi",
        AreaShapeUnit::Inch => "inch",
    }
}
```

Then update geometric branches to use `area.shape_unit`:

```rust
AreaKind::RadiusCircle => {
    let unit_str = area.shape_unit
        .map(area_shape_unit_to_text)
        .unwrap_or("ft");
    area.radius.as_ref().map(|r| {
        normalize_structured_text_with_unit_aliases(
            &format!("{} {} radius", scalar_to_text(r), unit_str)
        )
    })
}
// etc. for Cone, Line, Cube, RectPrism, Cylinder, Wall
```

Keep `area.unit` for volume, surface, tiles, creatures, objects (these correctly use the broad `AreaUnit` type).

---

### ✅ Task 1.1 — Schema (`spell.schema.json`)

All six enumerated changes are present and correct:

| Requirement | Schema location | Status |
|---|---|---|
| Add `AreaSpec.text: string` (optional) | `$defs.AreaSpec.properties.text` (line 604) | ✅ |
| Add `DurationSpec.text: string` (optional) | `$defs.DurationSpec.properties.text` (line 1803) | ✅ |
| Add `SavingThrowSpec.raw_legacy_value: string` | `$defs.SavingThrowSpec.properties.raw_legacy_value` (line 1661) | ✅ |
| Add `MagicResistanceSpec.source_text: string` | `$defs.MagicResistanceSpec.properties.source_text` (line 1624) | ✅ |
| Remove `SavingThrowSpec.dm_guidance` | `SavingThrowSpec` has no `dm_guidance` property | ✅ |
| Remove `SpellDamageSpec.raw_legacy_value`, add `source_text` | `SpellDamageSpec.properties` has `source_text` (line 1302), no `raw_legacy_value` | ✅ |
| Remove `"action"`, `"bonus_action"`, `"reaction"` from `casting_time.unit` enum | Enum is `[segment, round, turn, hour, minute, special, instantaneous]` | ✅ |
| Do NOT modify `ResolvedAreaSpec`, `ResolvedDurationSpec`, `ResolvedRangeSpec` | No resolved spec types exist in schema (constraint is trivially satisfied) | ✅ |

The intermediate-state shim in `SpellCastingTime::normalize()` correctly remaps 5e units to `Special` before schema validation fires, as documented in the task notice.

---

### ✅ Task 1.2 — Rust data models

| Requirement | Location | Status |
|---|---|---|
| `AreaSpec.text: Option<String>` with `skip_serializing_if` | `area_spec.rs` line ~260 | ✅ |
| `DurationSpec.text: Option<String>` with `skip_serializing_if` | `duration_spec.rs` line ~79 | ✅ |
| `SavingThrowSpec.raw_legacy_value: Option<String>` with `skip_serializing_if` | `saving_throw.rs` | ✅ |
| `MagicResistanceSpec.source_text: Option<String>` with `skip_serializing_if` | `magic_resistance.rs` | ✅ |
| `SpellDamageSpec.source_text` renamed from `raw_legacy_value`, backward alias added | `damage.rs` — field is `source_text` with `alias = "raw_legacy_value"` | ✅ |
| `SavingThrowSpec.dm_guidance` shadow field with `skip_serializing` | `saving_throw.rs` — `legacy_dm_guidance` with `rename = "dm_guidance"`, `skip_serializing` | ✅ |
| `prune_metadata_recursive` prunes `source_text` | **Broken — see BUG-1** | ❌ |

---

### ✅ Task 1.2b — `.text` synthesis for `AreaSpec` and `DurationSpec`

| Requirement | Status |
|---|---|
| `synthesize_duration_text()` builds canonical string from structured fields | ✅ |
| `DurationKind::Special` derives `.text` from `raw_legacy_value` | ✅ — `DurationKind::Special => duration.raw_legacy_value.clone()` |
| Unit alias normalization applied to synthesized text | ✅ — `normalize_structured_text_with_unit_aliases()` called on result |
| `synthesize_area_text()` builds canonical string from structured fields | ✅ (but uses wrong unit field for dimensional shapes — BUG-2) |
| `AreaKind::Special` derives `.text` from `raw_legacy_value` | ✅ — `AreaKind::Special => area.raw_legacy_value.clone()` |
| `raw_legacy_value` is NEVER `.text` input when structured fields are present | ✅ — only `Special` kind uses `raw_legacy_value` |
| Synthesis overwrites `.text` unconditionally in the canonical pipeline | ✅ — both `synthesize_*` are called unconditionally in `CanonicalSpell::normalize()` after `spec.normalize()` |

---

### ✅ Task 1.2c — Textual normalization of `source_text`

| Requirement | Location | Status |
|---|---|---|
| `SpellDamageSpec.normalize()` applies `NormalizationMode::Textual` to `source_text` | `damage.rs` line ~367 | ✅ |
| `MagicResistanceSpec.normalize()` applies `NormalizationMode::Textual` to `source_text` | `magic_resistance.rs` line ~101 | ✅ |
| `raw_legacy_value` fields are NOT normalized anywhere | All `raw_legacy_value` fields in all specs — confirm no calls to normalize on these | ✅ |

The normalization mode (NFC + trim horizontal whitespace + preserve distinct lines) matches `ExperienceComponentSpec.source_text` behavior. The reference is `NormalizationMode::Textual`, which is correct.

---

## Pass 2 — Contract Compliance

### C-1: `CURRENT_SCHEMA_VERSION` remains `1` — expected and correct

`canonical_spell.rs` line 17:
```rust
pub const CURRENT_SCHEMA_VERSION: i64 = 1;
```

This is intentional. Task 1.3 (not yet started) will increment it to `2`. The intermediate-state shim in `SpellCastingTime::normalize()` prevents runtime panics for v1 spells with 5e casting units. The schema version comment describing the shim is accurate and helpful.

No compliance violation here — the version bump is gated on task 1.3 as documented.

---

### C-2: `SavingThrowSpec.legacy_dm_guidance` shadow field contract

The shadow field uses:
```rust
#[serde(
    default,
    skip_serializing,
    rename = "dm_guidance",
    alias = "dmGuidance"
)]
pub legacy_dm_guidance: Option<String>,
```

**Condition 1 — no serialize:** `skip_serializing` unconditionally omits the field from output. ✅  
**Condition 2 — deserialize from v1 JSON:** Both `"dm_guidance"` (via `rename`) and `"dmGuidance"` (via `alias`) are accepted as input keys. ✅  
**Condition 3 — `is_default()` intentionally excludes `legacy_dm_guidance`:** The comment in `is_default()` explains this:

> `legacy_dm_guidance` is intentionally omitted from this check. `migrate_to_v2()` (task 1.3) runs before pruning and always moves `dm_guidance` into `notes`. Including it here would prevent pruning a spec that is otherwise at default but still carries a pre-migration `dm_guidance` value.

This is architecturally correct — the migration task (1.3) must drain it before normalize-prune runs. ✅

**Observation (minor):** The field is named `legacy_dm_guidance` (descriptive) but the rename means it de/serializes as `dm_guidance`. This asymmetry is deliberate but could surprise a future reader who searches for `dm_guidance` and doesn't find a field by that name. The comment on the field explains this adequately.

---

### C-3: `MagicResistanceSpec::is_default()` omits `source_text` — minor data-loss risk

**File:** `src/models/magic_resistance.rs`  
**Severity:** 🔵 Minor

```rust
pub fn is_default(&self) -> bool {
    self.kind == MagicResistanceKind::Unknown
        && self.applies_to == MrAppliesTo::WholeSpell
        && self.partial.is_none()
        && self.special_rule.is_none()
        && self.notes.is_none()
    // source_text is not checked
}
```

Used in `CanonicalSpell::normalize()`:
```rust
if let Some(mr) = &self.magic_resistance {
    if mr.is_default() {
        self.magic_resistance = None; // entire spec is pruned
    }
}
```

If a spell has `magic_resistance = Some(MagicResistanceSpec { kind: Unknown, source_text: Some("Yes"), ..defaults })`, the spec is pruned during normalization and the normalized clone (used for hashing and canonical JSON storage) does not contain `source_text`.

**Is this actually a problem?**  
For hash correctness: `source_text` is non-hashed metadata, so pruning it from the hash is correct behavior. The concern is whether the original `source_text` is also discarded from persisted `canonical_data`. If `canonical_data` stored in the DB is derived from `to_canonical_json()` (which normalizes first then prunes metadata), then yes — a `kind=Unknown` spec with only `source_text` would not be persisted.

In practice, when the importer sets `magic_resistance = { kind: "unknown", source_text: "Yes" }`, the import pipeline should also map to `kind: "normal"` for common cases, leaving `kind: "unknown"` only for truly unparseable inputs. A spec that is `Unknown` with only `source_text` is an edge case that may never occur in practice. Nonetheless, this represents a latent risk.

**Recommendation:** Add `source_text` to `is_default()` to prevent silent loss:

```rust
pub fn is_default(&self) -> bool {
    self.kind == MagicResistanceKind::Unknown
        && self.applies_to == MrAppliesTo::WholeSpell
        && self.partial.is_none()
        && self.special_rule.is_none()
        && self.notes.is_none()
        && self.source_text.is_none()  // do not prune if we have preserved source text
}
```

Similarly verify `SavingThrowSpec::is_default()` for the same pattern (raw_legacy_value is already in the check ✅).

---

### C-4: `synthesize_duration_text` for `DurationKind::Time` with missing fields

```rust
DurationKind::Time => match (&duration.duration, duration.unit.clone()) {
    (Some(value), Some(unit)) => {
        Some(format!("{} {}", scalar_to_text(value), duration_unit_to_text(unit)))
    }
    _ => None,  // duration.text = None if either field absent
},
```

The schema's `allOf` constraint requires both `unit` and `duration` for `kind="time"`, so `None` fields for a `time` spec should only occur in malformed input. If they do occur, `.text = None` is returned — this does not produce an incorrect hash value but omits the text, which may affect display. This is an acceptable degradation.

---

### C-5: `SpellDamageSpec.source_text` alias ordering and IPC key

The serde attributes on `source_text`:
```rust
#[serde(
    default,
    skip_serializing_if = "Option::is_none",
    alias = "source_text",
    alias = "raw_legacy_value"
)]
pub source_text: Option<String>,
```

With `rename_all = "camelCase"` on the struct, the **serialized output key** is `"sourceText"`. The Frontend TypeScript type must use `sourceText` (camelCase) to correctly receive this via IPC. Verify that the TypeScript `SpellDamageSpec` interface (task 3.1) uses `sourceText?: string`, not `source_text?: string`. This is a frontend task concern but the serde choice here locks in the IPC contract.

The `alias = "source_text"` allows DB-stored canonical JSON that may carry snake_case keys to deserialize correctly. The `alias = "raw_legacy_value"` enables backward compat with v1 database rows. Both aliases are deserialization-only. ✅

---

## Pass 3 — Design & Maintainability

### ✅ D-1 (Done): Pruning mechanism regression coverage for metadata hash exclusion added

The `prune_metadata_recursive` function is central to the correctness of the canonical hash. The discovered BUG-1 (camelCase vs snake_case key mismatch) went undetected because there are no unit tests that verify:
- `compute_hash()` produces the same result regardless of `source_text` value on `SpellDamageSpec`
- `compute_hash()` produces the same result regardless of `source_text` value on `MagicResistanceSpec`
- `compute_hash()` produces the same result regardless of `source_text` value on `ExperienceComponentSpec`

**Recommendation:** Add a regression test in task 1.5:

```rust
#[test]
fn test_source_text_excluded_from_hash() {
    let base = make_canonical_spell_with_damage(DamageKind::None, None);
    let with_source = make_canonical_spell_with_damage(DamageKind::None, Some("1d6+1 per level"));
    assert_eq!(
        base.compute_hash().unwrap(),
        with_source.compute_hash().unwrap(),
        "source_text must not affect canonical hash"
    );
}
```

---

### D-2: `synthesize_area_text` — `Rect`/`Cylinder`/`Wall` branches use `area.unit` but miss the `None` case differently from `shaped()`

The multi-dimension match arms for `Rect`, `Cylinder`, `Wall` return `None` when `area.unit` is `None`:

```rust
AreaKind::Rect => match (&area.length, &area.width, area.unit) {
    (Some(l), Some(w), Some(u)) => ...,
    _ => None,  // unit missing → text = None
},
```

But the single-dimension `shaped()` helper defaults to `AreaUnit::Ft` when `unit = None`:

```rust
area_unit_to_text(unit.unwrap_or(AreaUnit::Ft))
```

This creates inconsistent behavior: a missing unit for a `RadiusCircle` silently defaults to "ft", while a missing unit for a `Rect` yields `None` text. Once BUG-2 is fixed (using `shape_unit` for dimensional shapes), this inconsistency should also be resolved by handling the `None` case uniformly.

---

### D-3: `CastingTimeUnit` deserialization-only variant documentation is thorough

The three 5e variants (`Action`, `BonusAction`, `Reaction`) have clear doc comments explaining they are deserialization-only:

```rust
/// Deserialization-only: 5e unit removed from schema in v2. `migrate_to_v2()` (task 1.3)
/// remaps this to `Special` and preserves the original text in `raw_legacy_value`.
/// A pre-migration safety shim in `SpellCastingTime::normalize()` also remaps it.
#[serde(alias = "ACTION", alias = "Action")]
Action,
```

This documentation is excellent — it explains *why* the variant exists, what happens during normalization, and what task will complete the migration. ✅

---

### D-4: `synthesize_duration_text` `Concentration` / `UntilDispelled` don't use `raw_legacy_value`

For `DurationKind::Concentration` and `DurationKind::UntilDispelled`, the text is synthesized as a constant string (`"Concentration"`, `"Until dispelled"`) regardless of what the original source text was:

```rust
DurationKind::Concentration => Some("Concentration".to_string()),
DurationKind::UntilDispelled => Some("Until dispelled".to_string()),
```

This is correct per the specification — for kinds with no variable structured fields, the synthesized text is deterministic and overrides any pre-existing `.text`. `raw_legacy_value` still captures the original string for admin review. No issue; noted for transparency.

---

### D-5: `normalize_structured_text_with_unit_aliases` applies word-boundary replacement correctly

The `replace_word_boundary_alias` function uses a manual byte-indexed scan rather than a regex, checking both left and right boundary conditions:

```rust
let left_ok  = prev_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');
let right_ok = next_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');
```

This correctly handles the documented example: "backyard" → unchanged (right boundary fails), "10 yards" → "10 yd" (both boundaries clear). The implementation is correct and matches the spec requirement from task 1.2b. ✅

---

## Action Items Summary

| ID | Severity | Task | File | Action |
|---|---|---|---|---|
| BUG-1 | 🔴 Critical | 1.2 | `canonical_spell.rs` | ✅ **Fixed** — added `obj.remove("sourceText")` alongside `obj.remove("source_text")` in `prune_metadata_recursive` |
| BUG-2 | 🟡 Moderate | 1.2b | `canonical_spell.rs` | ✅ **Fixed** — replaced geometric synthesis unit usage with `area.shape_unit`; added `area_shape_unit_to_text()` helper |
| C-3 | 🔵 Minor | 1.2 | `magic_resistance.rs` | Add `&& self.source_text.is_none()` to `MagicResistanceSpec::is_default()` |
| C-2 | 🔵 Observation | — | `saving_throw.rs` | Consider adding `// NOTE: skip_serializing is load-bearing — removing it would expose dm_guidance to callers` on `legacy_dm_guidance` |
| D-1 | 🔵 Test gap | 1.5 | `canonical_spell.rs` / test | ✅ **Done** — added `source_text` hash-exclusion regression tests for SpellDamageSpec, MagicResistanceSpec, and ExperienceComponentSpec |
