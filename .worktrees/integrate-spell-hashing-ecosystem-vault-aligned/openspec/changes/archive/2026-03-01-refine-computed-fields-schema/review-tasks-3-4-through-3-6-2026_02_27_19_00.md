# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.4`, `3.5`, `3.6` (Frontend Complex Forms & Structured Field Editor)
## Date: 2026-02-27
## Prior reviews: `2026_02_17_15_00` (3 bugs found + fixed), `2026_02_27_18_00` (5 findings found + fixed)
## Post-review fixes applied: 2026-02-27 (NF1, NF2, NF3 — all 3 findings fixed)

---

## Review Method

| Pass | Focus | Files Read |
|------|-------|------------|
| **Pass 1 — Prior Fix Verification** | Confirm all 8 cumulative prior-review fixes are present in current source before auditing for new issues | `MagicResistanceInput.tsx`, `AreaForm.tsx`, `StructuredFieldInput.tsx` |
| **Pass 2 — Fresh Spec Audit** | Independent line-level audit of all three files against tasks.md requirements, `spell.ts` type contracts, and text-function semantics | All three implementation files + `spell.ts` |
| **Pass 3 — Cross-Cutting & Edge-Case Audit** | Trigger-2 UX edge cases, notes universality, annotation layout, kind-transition completeness, downstream integration, consistency with StructuredFieldInput patterns | All three files + SpellEditor integration points |

---

## Pass 1 — Prior Fix Verification

### Cumulative Fix Ledger (8 fixes across 2 prior reviews)

| Fix | Description | Verified In Code |
|-----|-------------|-----------------|
| Fix-1 (2017) | `MagicResistanceInput` — orphaned sibling data: `partial` cleared on `special` transition, `specialRule` cleared on `partial` transition | ✅ Lines 56–67: `else if (kind === "partial") { …next.specialRule = undefined; }` (line 59) and `else if (kind === "special") { …next.partial = undefined; }` (line 63) |
| Fix-2 (2017) | `AreaForm` — special kind: `rawLegacyValue` coerced with `\|\| undefined`, `.text` set to `rawLegacyValue` on kind-change | ✅ Lines 129–130: `next.rawLegacyValue = spec.rawLegacyValue \|\| undefined; next.text = next.rawLegacyValue;` |
| Fix-3 (2017) | `StructuredFieldInput` — trigger-2 visibility: Range and Duration use `(isSpecial \|\| spec.rawLegacyValue)` guard | ✅ Lines 149 and 307: both use `(isSpecial \|\| spec.rawLegacyValue)` |
| F1 (2027) | `MagicResistanceInput` — Part IDs block gated by `scope === "by_part_id"` | ✅ Line 135: `{spec.partial?.scope === "by_part_id" && ( …)}` |
| F2 (2027) | `AreaForm` — `updateSpec` calls `areaToText` before emitting for non-special kinds | ✅ Lines 108–115: `const next = { …spec, …updates }; if (next.kind !== "special") { next.text = areaToText(next); } onChange(next);` |
| F3 (2027) | `AreaForm` — stale sub-fields cleared on kind transition via clean construction | ✅ Line 127: `const next: AreaSpec = { kind, notes: spec.notes } as AreaSpec;` — no spread of old spec, only kind + notes carried forward |
| F4 (2027) | `StructuredFieldInput` — Range/Duration special rawLegacyValue handler calls `rangeToText(next)` / `durationToText(next)` instead of inline `text: rawLegacyValue` | ✅ Range line 159: `next.text = rangeToText(next);`; Duration line 317: `next.text = durationToText(next);` |
| F5 (2027) | `StructuredFieldInput` — Duration condition onChange uses `durationToText(next)` | ✅ Line 288: `next.text = durationToText(next);` |

**All 8 prior fixes verified present. Proceeding to fresh audit.**

---

## Pass 2 — Fresh Spec Audit

### Task 3.4 — `MagicResistanceInput.tsx`

#### Full Requirement Matrix

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.4-A | tasks.md | `sourceText` read-only labelled annotation when populated | ✅ | Lines 96–100: `{spec.sourceText && (<div>…Original source text:…</div>)}` — rendered as `<span>` elements, no input binding |
| 3.4-B | tasks.md | `appliesTo` hidden/disabled when `kind === "unknown"` | ✅ | Line 40: `const showAppliesTo = spec.kind !== "unknown";` gates selector |
| 3.4-C | tasks.md | `kind === "partial"`: scope enum selector | ✅ | Lines 104–134 block gated by `kind === "partial"`, containing `<select>` with all 5 `PARTIAL_SCOPE_OPTIONS` values |
| 3.4-D | tasks.md | `part_ids` picker disabled + informational message when `damage.kind !== "modeled"` | ✅ | `disabled={damageKind !== "modeled"}` on the input; informational message in the `by_part_id` conditional block |
| **3.4-D-gate** | tasks.md | `part_ids` picker only shown when `scope === "by_part_id"` | ✅ | Line 135: gated by `spec.partial?.scope === "by_part_id"` |
| 3.4-E | tasks.md | `kind === "special"`: `appliesTo` selector shown | ✅ | `showAppliesTo = spec.kind !== "unknown"` — true for special |
| **3.4-E** | tasks.md | `kind === "special"`: `special_rule` text input | ✅ | Line 178: `{spec.kind === "special" && (<textarea …specialRule…/>)}`; `e.target.value \|\| undefined` |
| **3.4-F** | tasks.md | `notes` textarea for all kinds | ✅ | Lines 188–196: unconditional, outside all kind conditionals |
| 3.4-I | (implicit) | `sourceText` preserved across kind transitions | ✅ | `{ ...spec, kind }` spread preserves `sourceText` |
| 3.4-I | (implicit) | `notes` preserved across kind transitions | ✅ | Same spread via `{ ...spec, kind }` |

**Finding NF1 — `sourceText` annotation in inline flex row rather than its own block (P3 — Low) — ✅ Fixed:**

The `sourceText` annotation (lines 96–100) is rendered inside the same `<div className="flex flex-wrap items-center gap-2">` that contains the kind dropdown (line 44) and `appliesTo` dropdown (line 80). For a `sourceText` value of moderate length (e.g., `"Yes, all effects, including beneficial"`), the annotation wraps unpredictably within the flex row, may push the apply-to selector onto a second line, or collide visually with the control elements.

```tsx
<div className="flex flex-wrap items-center gap-2">  {/* line 44 */}
  <select …>…</select>          {/* kind — line 45 */}
  {showAppliesTo && <select …>…</select>}   {/* appliesTo — line 80 */}
  {spec.sourceText && (
    <div className="… amber annotation …">   {/* ← inline with controls — line 96 */}
      <span>Original source text:</span>
      <span>{spec.sourceText}</span>
    </div>
  )}
</div>
```

Compare with the pattern in `DamageForm.tsx` and `SavingThrowInput.tsx` where the read-only annotation is placed in a separate `<div>` **below** the control row for visual separation.

> **Recommended fix:** Move the `sourceText` annotation outside the flex-wrap control row into its own sibling `<div>` below:
> ```tsx
> {/* … selectors row … */}
> {spec.sourceText && (
>   <div className="flex items-center gap-2 px-2 py-1 bg-amber-900/10 border border-amber-900/30 rounded text-[10px] text-amber-200/70 italic">
>     <span className="font-bold uppercase not-italic">Original source text:</span>
>     <span>{spec.sourceText}</span>
>   </div>
> )}
> ```

**No other new findings for task 3.4.**

---

### Task 3.5 — `AreaForm.tsx`

#### Full Requirement Matrix

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.5-A | tasks.md | Non-special kinds: `.text` computed read-only preview | ✅ | `updateSpec` (line 108) calls `areaToText(next)` at line 111 for non-special kinds; preview `<p>` element |
| **3.5-B** | tasks.md | `kind === "special"`: `rawLegacyValue` user-editable field | ✅ | Line 558: `{spec.kind === "special" && (<input type="text">…)}` bound to `rawLegacyValue` |
| **3.5-C** | tasks.md | `.text = rawLegacyValue` when non-empty; `text: undefined` when empty | ✅ | Line 566: `const rawLegacyValue = e.target.value \|\| undefined; onChange({ ...spec, rawLegacyValue, text: rawLegacyValue })` |
| **3.5-D** | tasks.md | `.text` not directly editable for non-special | ✅ | Preview is a `<p data-testid="area-text-preview">` element, not an input |
| **3.5-E** | tasks.md | `.text` written to emitted value on every sub-field change | ✅ | `updateSpec` (line 108) recomputes `areaToText` on every call; kind-transition computes `if (kind !== "special") { next.text = areaToText(next); }` at line 177 |
| kind-transition-clean | F3-fix | No stale sub-fields survive kind transition | ✅ | Line 127: `const next: AreaSpec = { kind, notes: spec.notes }` — clean construction |

**Finding NF2 — `notes` textarea hidden for `kind === "point"` (P2 — Medium) — ✅ Fixed:**

The `notes` textarea is conditionally rendered only when `spec.kind !== "point"` (line 577):

```tsx
{spec.kind !== "point" && (   {/* line 577 */}
  <textarea
    data-testid="area-form-notes"
    aria-label="Area notes"
    placeholder="Area notes (optional)..."
    value={spec.notes ?? ""}
    onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
    …
  />
)}
```

The `notes` field is defined on `AreaSpec` universally — the schema places no conditional restriction on which kinds may have notes. A point area (e.g., "the caster's current location, or any point within range") might legitimately carry notes (e.g., "Point must be within direct line of sight"). Hiding it for `point` creates an inconsistency with all other components in this changeset: `MagicResistanceInput`, `SavingThrowInput`, `StructuredFieldInput` (Range/Duration), and `DamageForm` all show the `notes` field unconditionally across all kinds.

Additionally, `spec.notes` **is** preserved during a kind transition (via `{ kind, notes: spec.notes }`), so notes data on a `point` area survives format round-trips but is inaccessible via the UI.

> **Recommended fix:** Remove the `kind !== "point"` gate:
> ```tsx
> <textarea
>   data-testid="area-form-notes"
>   aria-label="Area notes"
>   placeholder="Area notes (optional)..."
>   value={spec.notes ?? ""}
>   onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
>   …
> />
> ```

**Observation on `textPreview` useMemo (P4 — Cosmetic, no fix required):**

`textPreview = useMemo(() => areaToText(spec), [spec])` is used for the preview `<p>` at the bottom. For non-special kinds, `spec.text` is already set to the same value by `updateSpec` and the kind-transition handler. The `useMemo` re-derives the same value redundantly. This has no correctness impact (both computations call the same function with the same spec), but `{spec.text ?? "—"}` would be equivalent and marginally cheaper. Not action-required.

**No other new findings for task 3.5.**

---

### Task 3.6 — `StructuredFieldInput.tsx`

#### Full Requirement Matrix

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.6-A | tasks.md | Real-time `.text` derivation for Range on every change | ✅ | Every Range onChange path: `next.text = rangeToText(next)` |
| 3.6-A | tasks.md | Real-time `.text` derivation for Duration on every change | ✅ | Every Duration onChange path: `next.text = durationToText(next)` |
| 3.6-A | tasks.md | Real-time `.text` derivation for CastingTime on every change | ✅ | `updateCt` always calls `castingTimeToText` |
| **3.6-B** | tasks.md | Range kind-transition clearing: distance kinds init `distance`+`unit`, clear `rawLegacyValue`; others clear `distance`+`unit`+`rawLegacyValue`; special preserves `rawLegacyValue` | ✅ | Lines 89–107 |
| **3.6-B** | tasks.md | Duration kind-transition clearing: time inits `unit`+`duration`; condition kinds init `condition`; `usage_limited` inits `uses`; others clear all; special preserves `rawLegacyValue` | ✅ | Lines 200–234 |
| **3.6-C** | tasks.md | Trigger-1: rawLegacyValue shown when `kind/unit === "special"` | ✅ | Range line 72: `isSpecial = spec.kind === "special"`; Duration line 192: same; CastingTime: `ct.unit === "special"` |
| 3.6-C | tasks.md | Trigger-1: rawLegacyValue cleared when switching away from special | ✅ | Range/Duration: `rawLegacyValue = undefined` in non-special branches; CastingTime: `{ unit, rawLegacyValue: undefined }` |
| **3.6-D** | tasks.md | Trigger-2: rawLegacyValue shown when pre-existing data loaded (non-special unit) | ✅ | Range line 149: `(isSpecial \|\| spec.rawLegacyValue)`; Duration line 307: same; CastingTime: `(ct.unit === "special" \|\| ct.rawLegacyValue)` |
| 3.6-E | tasks.md | CastingTime data supersession: `rawLegacyValue` cleared when switching away from special unit | ✅ | Line 403: `updateCt(unit === "special" ? { unit } : { unit, rawLegacyValue: undefined })` — any non-special unit switch clears rawLegacyValue |
| 3.6-F | tasks.md | `casting_time.text` always non-empty | ✅ | `castingTimeToText`: returns `rawLegacyValue ?? "Special"` for special; `"1 ${u}"` or `"${base} ${u}s"` for structured; `base=0` → `"0 ${u}s"` (non-empty) |
| 3.6-G | tasks.md | Range/Duration `.text` computed and emitted | ✅ | Every change path computes and emits `.text` |

**Finding NF3 — Trigger-2 rawLegacyValue inputs editable while kind/unit is non-special (P3 — Low) — ✅ Fixed:**

When a spell is loaded with a pre-existing `rawLegacyValue` on a non-special kind/unit (trigger-2 scenario — legacy import), the rawLegacyValue input field is displayed and is **fully editable**. However, for non-special kinds, neither `rangeToText`, `durationToText`, nor `castingTimeToText` consults `rawLegacyValue` in their text derivation. The effect is that typing into a trigger-2 rawLegacyValue field changes the data model but produces no observable change in the `.text` preview — the UI silently accepts input without feedback.

This is inconsistent with the treatment of `sourceText` fields in `MagicResistanceInput` and `DamageForm`, which are rendered as `<span>` (uneditable) precisely because they are read-only metadata. `rawLegacyValue` in trigger-2 state is conceptually the same: original text preserved from the importer, surfaced for reference, not intended as an editing affordance for the current structured kind.

The `data supersession` contract (clearing `rawLegacyValue` on kind switch away from special) correctly drains trigger-2 state when the user takes an action. But while in trigger-2 state, the field should communicate its read-only nature.

> **Recommended fix:** Add `readOnly` to the trigger-2 branch for Range, Duration, and CastingTime:
> ```tsx
> {/* Trigger-2 is active when rawLegacyValue exists but kind !== "special" */}
> {(isSpecial || spec.rawLegacyValue) && (
>   <input
>     type="text"
>     readOnly={!isSpecial}          {/* read-only for trigger-2; editable for trigger-1 */}
>     data-testid="range-raw-legacy"
>     …
>   />
> )}
> ```
> Same pattern for Duration and CastingTime (using `!isSpecial` for Duration; `ct.unit !== "special"` for CastingTime).

---

## Pass 3 — Cross-Cutting & Edge-Case Audit

### A. Text-Function Semantic Consistency Across Components

| Scenario | Range / Duration | CastingTime | AreaForm |
|----------|-----------------|-------------|----------|
| special + non-empty `rawLegacyValue` → `.text` | `rawLegacyValue` ✅ | `rawLegacyValue` ✅ | `rawLegacyValue` ✅ |
| special + empty `rawLegacyValue` → `.text` | `"Special"` (via `xToText`) ✅ | `"Special"` ✅ | `undefined` (inline `text: rawLegacyValue`) |
| non-special kind change → `.text` | computed from fields ✅ | computed from fields ✅ | computed via `areaToText` ✅ |
| sub-field change on non-special → `.text` | recomputed per onChange ✅ | `updateCt` always recomputes ✅ | `updateSpec` always recomputes ✅ |

**Observation on AreaForm `kind === "special"` empty rawLegacyValue → `text: undefined` vs `"Special"`:**

`AreaForm` emits `text: undefined` when `rawLegacyValue` is empty/cleared for `kind === "special"`. This is **correct per the task spec**: "emit `text: undefined` (not `""` — `AreaSpec.text` is optional)". However, `areaToText` returns `"Special"` for the same state. This is an intentional divergence: the form enforces the "undefined for no-input" contract from task 3.5-C, while `areaToText` provides a graceful fallback for display-only callers. The `SpellEditor` integration correctly computes display text as `areaToText(spec)` independently, so this doesn't cause a UI regression. ✅

### B. `SpellEditor.tsx` Integration Points

**MagicResistanceInput integration (line ~2102):**
```tsx
<MagicResistanceInput
  value={structuredMagicResistance ?? undefined}
  damageKind={structuredDamage?.kind}
  onChange={(spec) => {
    setStructuredMagicResistance(spec);
    setDetailDirtyFor("magicResistance");
    setForm((prev) => ({ ...prev, magicResistance: magicResistanceToText(spec) }));
  }}
/>
```
`damageKind` is correctly threaded from `structuredDamage?.kind`. Part IDs disabled state works end-to-end. ✅

**AreaForm integration (line ~2070):**
```tsx
<AreaForm
  value={structuredArea ?? defaultAreaSpec()}
  onChange={(spec) => {
    setStructuredArea(spec);
    setDetailDirtyFor("area");
    setForm((prev) => ({ ...prev, area: areaToText(spec) }));
  }}
/>
```
`SpellEditor` independently calls `areaToText(spec)` for the form display string, bypassing `spec.text` — the gap from the prior review (now fixed) would have caused stale display strings, but the independent `areaToText` call provides a safety net. The fix still matters because `spec.text` conformance is part of the data contract for downstream serialization. ✅

### C. Kind-Transition Field Preservation Summary

| Field | MagicResistanceInput | AreaForm | StructuredFieldInput (Range) | StructuredFieldInput (Duration) |
|-------|---------------------|----------|-----------------------------|---------------------------------|
| `notes` | ✅ spread preserved | ✅ explicit `{ kind, notes }` | ✅ spread preserved | ✅ spread preserved |
| `sourceText` | ✅ spread preserved | N/A | N/A | N/A |
| `rawLegacyValue` | N/A | ✅ cleared for non-special; preserved into special | ✅ cleared on distance/kind-only → special preserves | ✅ same pattern |
| `text` | N/A | ✅ recomputed on transition | ✅ recomputed on transition | ✅ recomputed on transition |
| Sibling-kind fields | ✅ explicit clear | ✅ clean construction | ✅ explicit clear | ✅ explicit clear |

All field preservation contracts verified. ✅

### D. TypeScript Type Coverage

- `MagicResistanceSpec.sourceText?: string` — present in `spell.ts` line 464 ✅
- `AreaSpec.text?: string` — present in `spell.ts` line 268 ✅
- `RangeSpec`, `DurationSpec`, `SpellCastingTime` have `rawLegacyValue?: string` ✅
- `PARTIAL_SCOPE_OPTIONS` is untyped (`string[]`). The `scope` field on `MagicResistancePartial` is typed as `string` in `spell.ts`. No TypeScript enforcement of valid scope values. Acceptable given the schema is the authoritative validator, but a `const PARTIAL_SCOPE_OPTIONS = [...] as const` would tighten this (P4, no fix required).

### E. Edge Case: CastingTime `base = 0`

`castingTimeToText` with `baseValue = 0` and any non-special unit:
```typescript
if (base === 1) return `1 ${u}`;
return `${base} ${u}s`;   // base=0 → "0 segments"
```
Returns `"0 segments"` — non-empty, satisfying the schema-required text contract (3.6-F). The Rust `normalize()` side produces `"0 <unit>"` without the `s` suffix, creating a minor pluralization divergence between the TS and Rust display paths. This is out of scope for tasks 3.4–3.6 and tracked by task 5.5 (Vitest unit test for `castingTimeToText`).

---

## Finding Summary

| ID | Component | Severity | Status | Description |
|----|-----------|----------|--------|-------------|
| **NF1** | `MagicResistanceInput.tsx` | P3 — Low | ✅ Fixed | `sourceText` annotation moved out of the selector flex row into its own sibling `<div>` below the control row |
| **NF2** | `AreaForm.tsx` | P2 — Medium | ✅ Fixed | `kind !== "point"` gate removed — `notes` textarea now renders unconditionally for all area kinds |
| **NF3** | `StructuredFieldInput.tsx` | P3 — Low | ✅ Fixed | `readOnly={!isSpecial}` added to Range/Duration inputs; `readOnly={ct.unit !== "special"}` added to CastingTime input |

All 8 fixes from prior reviews: ✅ Verified present.

---

## Recommended Fix Order

1. **NF2 (P2)** — Remove the `kind !== "point"` gate from the `notes` textarea in `AreaForm.tsx`. One-line change. ✅ Applied 2026-02-27
2. **NF1 (P3)** — Move `sourceText` annotation in `MagicResistanceInput.tsx` outside the flex control row into its own sibling `<div>`. ✅ Applied 2026-02-27
3. **NF3 (P3)** — Add `readOnly={!isSpecial}` (Range/Duration) / `readOnly={ct.unit !== "special"}` (CastingTime) to the rawLegacyValue inputs when in trigger-2 state. ✅ Applied 2026-02-27

---

## Overall Assessment

| Dimension | Rating |
|-----------|--------|
| Spec compliance (task 3.4) | ✅ Excellent — NF1 layout refinement applied |
| Spec compliance (task 3.5) | ✅ Excellent — NF2 schema-universality gap closed |
| Spec compliance (task 3.6) | ✅ Excellent — NF3 UX contract applied |
| Prior-fix regression safety | ✅ All 8 prior fixes stable, no regressions observed |
| Code quality | Good — clean TypeScript, consistent patterns, correct type imports |
| Field-preservation contracts | ✅ All fields correctly preserved or cleared on every kind transition |
| Text-function consistency | ✅ All three field types compute and emit `.text` on every onChange path |
| Data integrity | ✅ `rawLegacyValue` never leaks onto non-hashed paths; `sourceText` correctly read-only |

**Verdict:** All 3 findings (NF1, NF2, NF3) fixed on 2026-02-27. Cumulative fix count: 11 fixes across 3 reviews. Codebase is clean — no open findings. Ready for task 5.3 E2E test authoring.
