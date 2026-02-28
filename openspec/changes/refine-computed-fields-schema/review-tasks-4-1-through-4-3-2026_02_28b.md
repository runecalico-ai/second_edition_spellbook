# Three-Pass Code Review: Tasks 4.1, 4.2, 4.2b, 4.3 — Detail Views

**Change:** `refine-computed-fields-schema`  
**Commit:** `aaf45d1c6055707b6579d23147cc417043f1b7ee`  
**Date:** 2026-02-28  
**Scope:** `src/ui/spell-detail/` — all 7 detail view components

---

## Files Under Review

| File | Task |
|------|------|
| `SavingThrowDetail.tsx` | 4.1 |
| `RangeDetail.tsx` | 4.2 |
| `DurationDetail.tsx` | 4.2 |
| `AreaDetail.tsx` | 4.2 |
| `CastingTimeDetail.tsx` | 4.2b |
| `DamageDetail.tsx` | 4.3 |
| `MagicResistanceDetail.tsx` | 4.3 |

---

## Pass 1 — Spec Compliance

Validates that each component correctly implements what the tasks.md spec requires.

### 4.1 — `SavingThrowDetail.tsx`

| Requirement | Status | Notes |
|-------------|--------|-------|
| Remove all `dmGuidance`/`dm_guidance` references | ✅ | Component has none; JSDoc confirms v2 removal |
| `single`/`multiple`: `rawLegacyValue` as collapsible "Original source" annotation | ✅ | Both arms use `<details>` with correct label |
| `dm_adjudicated`: `rawLegacyValue` as primary descriptive content | ✅ | `spec.rawLegacyValue ?? "DM adjudicated"` |
| Always display `notes` when present, for all kinds | ✅ | Unconditional block at end of component |

**Verdict: Compliant.**

---

### 4.2 — `RangeDetail.tsx`, `DurationDetail.tsx`, `AreaDetail.tsx`

**Shared requirement:** Fallback chain — (1) `.text` → (2) `rawLegacyValue` → (3) structured synthesis when fields present → (4) `"—"`. No synthesis when fields absent.

| Component | Fallback Chain | Synthesis Guard | Notes field |
|-----------|---------------|-----------------|-------------|
| `RangeDetail` | ✅ `??` chain | ✅ `hasStructuredFields` | ✅ |
| `DurationDetail` | ✅ `??` chain | ✅ `hasStructuredFields` | ✅ |
| `AreaDetail` | ✅ `??` chain | ✅ `hasStructuredFields` | ✅ |

**Verdict: Compliant.**

---

### 4.2b — `CastingTimeDetail.tsx`

| Requirement | Status | Notes |
|-------------|--------|-------|
| Primary: `.text` | ✅ | |
| First fallback: `rawLegacyValue` | ✅ | |
| Second fallback: synthesize from `(baseValue, unit)` via `castingTimeToText()` | ✅ | |
| `||` over `??` justified | ✅ | JSDoc explains `text` is required-but-empty-allowed; `||` skips `""` correctly |

**Verdict: Compliant.**

---

### 4.3 — `DamageDetail.tsx`, `MagicResistanceDetail.tsx`

| Component | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| Damage | Structured formula from algebraic fields (modeled + parts) | ✅ | Guards: `kind === "modeled"` and `hasAlgebraicParts` |
| Damage | Fall back to `sourceText` when algebraic absent | ✅ | `spec.sourceText ?? spec.dmGuidance` — see Pass 2 |
| MR | Display `kind` and `appliesTo` | ✅ | Complete labels for all enum values |
| MR | `appliesTo` hidden when `kind === "unknown"` | ✅ | `showAppliesTo` guard correct |
| MR | `sourceText` as primary content for `kind="special"` | ✅ | `showSourceTextPrimary` path |
| MR | `sourceText` as supplementary for non-special kinds | ✅ | `showSourceTextSupplementary` path |

**Verdict: Compliant.**

---

## Pass 2 — Edge Cases & Correctness

### F1 — `DurationDetail.tsx`: Empty-string `condition` silently produces blank display

**Severity: Important**  
**File:** `DurationDetail.tsx`

`hasStructuredFields` checks `spec.condition != null` for `DURATION_CONDITION_KINDS`:

```typescript
if (DURATION_CONDITION_KINDS.includes(spec.kind as typeof DURATION_CONDITION_KINDS[number]))
  return spec.condition != null;
```

An empty string `""` is `!= null` → returns `true` → synthesis proceeds. `durationToText` for condition kinds returns:

```typescript
return spec.condition ?? spec.kind.replace(/_/g, " ");
```

With `condition = ""`, `spec.condition` is truthy-falsy ambiguous: `??` only skips `null`/`undefined`, not `""`. So `durationToText` returns `""`.

The outer display chain uses `??`, which does not skip empty strings:

```typescript
const displayText = spec.text ?? spec.rawLegacyValue ?? (hasStructuredFields(spec) ? durationToText(spec) : null) ?? "—";
```

When `durationToText` returns `""`, `displayText = ""` and the component renders a blank span instead of `"—"`.

**Fix:** Change the condition guard to explicitly exclude empty strings:

```typescript
if (DURATION_CONDITION_KINDS.includes(spec.kind as typeof DURATION_CONDITION_KINDS[number]))
  return spec.condition != null && spec.condition !== "";
```

Or equivalently: `return !!spec.condition;` (truthy check excludes both `null`/`undefined` and `""`).

---

### F2 — `MagicResistanceDetail.tsx`: `specialRule` silently hidden when `sourceText` is present

**Severity: Minor**  
**File:** `MagicResistanceDetail.tsx`

Current logic:

```typescript
const showSourceTextPrimary = spec.kind === "special" && spec.sourceText;
const showSpecialRule = spec.kind === "special" && spec.specialRule != null && !showSourceTextPrimary;
```

When `kind === "special"` and **both** `sourceText` and `specialRule` are populated, `showSpecialRule` is `false`. `specialRule` is completely hidden. These are distinct fields: `sourceText` is the raw imported string; `specialRule` is a curated rule annotation. Suppressing `specialRule` when `sourceText` exists could silently drop meaningful authored data.

`specialRule` is populated in the editor when `kind === "special"` (task 3.4). A spell may have both a raw source string (`sourceText`) and a distinct curated rule note (`specialRule`). Only showing one of them in the detail view means the user cannot see the curated rule unless they open the editor.

**Fix:** Show `specialRule` unconditionally when present (alongside `sourceText`):

```typescript
const showSpecialRule = spec.kind === "special" && spec.specialRule != null;
```

And remove the `!showSourceTextPrimary` guard. Both can render together since they represent different data.

---

### F3 — `AreaDetail.tsx`: `hasStructuredFields` misses `regionUnit`/`scopeUnit` fields

**Severity: Minor**  
**File:** `AreaDetail.tsx`

`hasStructuredFields` checks dimensional fields (`radius`, `length`, `edge`, etc.) but not:
- `spec.regionUnit` (used by `kind="region"`)
- `spec.scopeUnit` (used by `kind="scope"`)
- `spec.tileUnit` (used independently of `tileCount`)

A `region` spec with `regionUnit` set but no dimensional count would return `false` from `hasStructuredFields`, skip synthesis, and show `"—"`, even though `areaToText` would fall through to `spec.kind.replace(/_/g, " ")` → `"region"`. This is a very minor gap. Impact is low (rare kind + unusual partial-data scenario), but worth noting for completeness.

**Note:** `areaToText` for these kinds falls through to `spec.kind.replace(/_/g, " ")`. Whether that's useful synthesis is debatable — the guard keeping it out may actually be the right behavior (no meaningful synthesis from those fields alone). **No immediate fix required**, but document the intentional omission.

---

### F4 — `DamageDetail.tsx`: `dmGuidance` in fallback chain exceeds spec

**Severity: Minor / Noted Behavior**  
**File:** `DamageDetail.tsx`

Task 4.3 specifies: "fall back to `sourceText` when algebraic fields are absent or empty." It does not mention `dmGuidance`.

The implementation:

```typescript
const fallbackText = spec.sourceText ?? spec.dmGuidance;
```

`dmGuidance` is kept on `SpellDamageSpec` (Decision 3) and is required for `kind="dm_adjudicated"` by schema. For v1 data, `sourceText` may be absent while `dmGuidance` holds the narrative text. Using `dmGuidance` as a secondary fallback is correct pragmatic v1 backward-compat.

**The behavior is correct, but the spec note is incomplete.** The fallback order (`sourceText` preferred over `dmGuidance`) is correct because v2 migration populates `sourceText`. No code change needed. Consider adding a comment:

```typescript
// sourceText: v2 renamed field; dmGuidance: v1 fallback (dm_adjudicated kind)
const fallbackText = spec.sourceText ?? spec.dmGuidance;
```

---

### F5 — `SavingThrowDetail.tsx`: `kind="single"` with missing `spec.single` renders silently empty

**Severity: Minor / Noted Behavior**  
**File:** `SavingThrowDetail.tsx`

If `kind="single"` but `spec.single` is `null`/`undefined`, the `spec.kind === "single" && spec.single && (...)` guard fails silently — no save entry renders, no rawLegacyValue renders. Only `notes` would show. This is a defensive guard against invalid data (the schema requires `single` to be present when `kind="single"`), so no fix is needed, but consider a defensive log or fallback text for robustness.

---

### F6 — `RangeDetail.tsx`/`AreaDetail.tsx`: `"special"` kind with absent `rawLegacyValue` shows `"—"` rather than `"Special"`

**Severity: Minor / Design Choice**

For `kind="special"` with no `rawLegacyValue` and no `.text`, all three spec-based detail views (`RangeDetail`, `DurationDetail`, `AreaDetail`) show `"—"`. The underlying `*ToText()` functions would return `"Special"` in this scenario. The `hasStructuredFields` guard correctly blocks synthesis for `"special"` kind (no structured fields), so `"—"` is the fallback.

Per the spec: "do NOT attempt to synthesize from empty/absent structured fields." Since `rawLegacyValue` _is_ the content for `"special"` kind, and it's absent, `"—"` is the correct output. The behavior is correct; this is noted for completeness.

---

## Pass 3 — Code Quality & Test Coverage

### Q1 — No unit tests for any detail view component

**Severity: Important**

There are zero unit or component tests for `SavingThrowDetail`, `RangeDetail`, `DurationDetail`, `AreaDetail`, `CastingTimeDetail`, `DamageDetail`, or `MagicResistanceDetail`. The `spell.test.ts` file tests the underlying `*ToText()` utility functions, but not the React components themselves.

The fallback chain logic, `hasStructuredFields` guards, conditional render paths, and `dmGuidance`/`rawLegacyValue`/`sourceText` branching go entirely untested at the component level. This means regressions in the fallback chain (like F1 above — `""` condition) would not be caught by CI.

**Key scenarios that should be covered:**

- `SavingThrowDetail`: `kind="none"` → nothing rendered; `kind="single"` → collapsible shows when `rawLegacyValue` present; `kind="dm_adjudicated"` without `rawLegacyValue` → fallback text; `notes` always renders when present
- `RangeDetail`/`DurationDetail`/`AreaDetail`: `.text` preferred; `rawLegacyValue` used when no `.text`; synthesis called when both absent and structured fields present; `"—"` when all absent
- `CastingTimeDetail`: empty `.text` falls through to `rawLegacyValue`; empty `rawLegacyValue` falls through to synthesis
- `DamageDetail`: `kind="modeled"` with parts shows formula; fallback to `sourceText`; fallback to `dmGuidance` when `sourceText` absent
- `MagicResistanceDetail`: `kind="special"` shows `sourceText` as primary; `kind="unknown"` hides `appliesTo`

These align with task 5.5 (Vitest unit tests) but component-level tests are not explicitly required there; they should be added regardless.

---

### Q2 — Duplicate `data-testid` values in `SavingThrowDetail`

**Severity: Minor**  
**File:** `SavingThrowDetail.tsx`

Both the `kind="single"` and `kind="multiple"` arms use `data-testid="saving-throw-legacy-collapsible"` and `data-testid="saving-throw-raw-legacy"`. Since only one arm can render at a time (discriminated union on `kind`), this does not cause test false positives. However, it creates ambiguity when reading test failures — you cannot tell from the testid which arm was active.

**Suggestion** (low priority): Differentiate as `"saving-throw-legacy-collapsible-single"` / `"saving-throw-legacy-collapsible-multiple"` if test diagnostics matter, otherwise acceptable as-is.

---

### Q3 — `CastingTimeDetail` is the only component returning `<span>` not `<div>`

**Severity: Informational**

`CastingTimeDetail` returns a flat `<span>` while all other detail components return a `<div className="space-y-1">`. This is correct because `SpellCastingTime` has no `notes` field (flat object, not a spec), so there's nothing to space. The asymmetry is intentional and correct; just good to note for future contributors.

---

### Q4 — `AreaDetail.tsx`: `kind="special"` with rogue dimensional fields triggers `areaToText` via synthesis

**Severity: Informational**

If a `kind="special"` spec somehow has dimensional fields populated (e.g., `radius != null`), `hasStructuredFields` returns `true` and `areaToText` is called. `areaToText` for `kind="special"` returns `rawLegacyValue ?? "Special"`. Since step 2 already consumed `rawLegacyValue`, this returns `"Special"`. Not wrong — just a slightly surprising interaction. The guard `spec.kind !== "special"` could be added to `hasStructuredFields` for clarity, but it would only matter for invalid data.

---

## Summary

### Findings by Severity

| ID | Severity | File | Description |
|----|----------|------|-------------|
| F1 | **Important** | `DurationDetail.tsx` | Empty-string `condition` passes guard, synthesis returns `""`, shows blank instead of `"—"` |
| F2 | **Minor** | `MagicResistanceDetail.tsx` | `specialRule` hidden when `sourceText` present; may suppress curated rule note |
| F3 | **Minor** | `AreaDetail.tsx` | `hasStructuredFields` misses `regionUnit`/`scopeUnit` — noted, no fix required |
| F4 | **Minor / Noted** | `DamageDetail.tsx` | `dmGuidance` fallback exceeds spec; correct for v1 compat; add comment |
| F5 | **Minor / Noted** | `SavingThrowDetail.tsx` | `kind="single"` with missing `spec.single` silently renders empty |
| F6 | **Minor / Design** | `RangeDetail`, `AreaDetail` | `"special"` with absent rawLegacyValue shows `"—"`; correct per spec |
| Q1 | **Important** | All 7 files | Zero component-level tests; fallback chain regressions go undetected |
| Q2 | **Minor** | `SavingThrowDetail.tsx` | Duplicate testids between `single` and `multiple` arms |
| Q3 | **Info** | `CastingTimeDetail.tsx` | `<span>` vs `<div>` — intentional and correct |
| Q4 | **Info** | `AreaDetail.tsx` | `kind="special"` with rogue dimensional fields triggers unexpected synthesis path |

### Required Actions Before Proceeding

| Finding | Action |
|---------|--------|
| **F1** | Fix `DurationDetail.tsx`: change `condition != null` to `!!spec.condition` (exclude empty string) |
| **F2** | Fix `MagicResistanceDetail.tsx`: remove `!showSourceTextPrimary` guard from `showSpecialRule` so both render |
| **F4** | Add inline comment to `DamageDetail.tsx` explaining `dmGuidance` v1 fallback |
| **Q1** | Add Vitest component tests for the seven detail views (can be done in task 5.5 scope) |

### Assessment

The implementation is **mostly correct and spec-compliant**. Two functional bugs were found:

1. `DurationDetail` will render blank text instead of `"—"` when `condition = ""` — an edge case but a real rendering defect that could show up for conditionally-typed spells with empty condition strings.
2. `MagicResistanceDetail` silently hides `specialRule` when `sourceText` is present — a data visibility issue for spells with both fields populated.

Fix F1 and F2 before proceeding to task 5.
