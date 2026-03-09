# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.4`, `3.5`, `3.6` (Frontend Complex Forms & Structured Field Editor)
## Date: 2026-02-27
## Prior review fixes: All three fixes from `2026_02_17_15_00` review verified applied

---

## Review Method

| Pass | Focus | Sources Consulted |
|------|-------|-------------------|
| **Pass 1 — Spec Contract Audit** | Enumerate every atomic requirement from tasks 3.4–3.6 and derive a verification checklist from `tasks.md`, `spell-editor-complex-forms/spec.md`, and `spell-editor-structured-fields/spec.md` | `tasks.md`, both delta specs |
| **Pass 2 — Code Reality Audit** | Line-level read of **all three implementation files** against the checklist; TypeScript error state verified (`get_errors` + `tsc --noEmit`) | `MagicResistanceInput.tsx`, `AreaForm.tsx`, `StructuredFieldInput.tsx`, `spell.ts`, `spell.test.ts`, `StructuredFieldInput.test.ts` |
| **Pass 3 — Cross-Cutting Audit** | State-transition correctness, field-preservation contracts across kind changes, data hygiene (orphaned keys), consistency between AreaForm and StructuredFieldInput patterns, Storybook story coverage, downstream integration with `SpellEditor.tsx` | All implementation files + stories + `SpellEditor.tsx` integration |

---

## Prior Review Status

All three fixes from the `2026_02_17_15_00` review have been verified as applied:

| Fix | Component | Status |
|-----|-----------|--------|
| Fix 1: Orphaned sibling data on MR kind transition | `MagicResistanceInput.tsx` | ✅ Applied — `partial` cleared on `special`, `specialRule` cleared on `partial` |
| Fix 2: `"special"` kind transition `.text` sync | `AreaForm.tsx` | ✅ Applied — `rawLegacyValue` uses `\|\| undefined` (not `""`), `.text` set to `rawLegacyValue` |
| Fix 3: Pre-existing data visibility for Range/Duration | `StructuredFieldInput.tsx` | ✅ Applied — both Range and Duration use `(isSpecial \|\| spec.rawLegacyValue)` guard |

---

## Pass 1 — Spec Contract Audit

### Task 3.4 — `MagicResistanceInput.tsx`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.4-A | tasks.md | Display `sourceText` as a read-only labelled annotation when populated |
| 3.4-B | tasks.md | `appliesTo` selector hidden/disabled when `kind === "unknown"` |
| 3.4-C | tasks.md / complex-forms spec | `kind === "partial"`: render `scope` enum selector + conditional `part_ids` picker |
| 3.4-D | complex-forms spec | `part_ids` disabled with informational message when `damage.kind !== "modeled"` |
| 3.4-E | tasks.md | `kind === "special"`: render `appliesTo` selector + `special_rule` text input |
| 3.4-F | tasks.md | `notes` text area shown for all kinds |
| 3.4-G | complex-forms spec | `appliesTo` labels: `whole_spell → "Whole Spell"`, `harmful_effects_only → "Harmful Effects Only"`, etc. |
| 3.4-H | complex-forms spec | `part_ids` only applicable when `scope === "by_part_id"` |
| 3.4-I | (implicit) | `sourceText` and `notes` preserved across kind transitions |

### Task 3.5 — `AreaForm.tsx`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.5-A | tasks.md | Non-special kinds: bind `.text` as computed canonical text preview (read-only, auto-recomputed) |
| 3.5-B | tasks.md / complex-forms spec | `kind === "special"`: expose `rawLegacyValue` as user-editable field |
| 3.5-C | tasks.md / complex-forms spec | `.text` derived from `rawLegacyValue` when non-empty, or `undefined` when empty |
| 3.5-D | complex-forms spec | `.text` is NOT directly edited by the user for non-special kinds |
| 3.5-E | (implicit, matching StructuredFieldInput pattern) | `.text` recomputed and written to emitted value on every sub-field change |

### Task 3.6 — `StructuredFieldInput.tsx`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.6-A | tasks.md | Real-time `.text` derivation written to emitted value for Range, Duration, CastingTime on every change |
| 3.6-B | tasks.md / structured-fields spec | Kind-transition field-clearing per transition tables |
| 3.6-C | tasks.md | `rawLegacyValue` visible when `kind === "special"` (Range/Duration) or `unit === "special"` (CastingTime); cleared on switch away |
| 3.6-D | tasks.md | `rawLegacyValue` also visible when pre-existing legacy data loaded (trigger 2) |
| 3.6-E | tasks.md | CastingTime data supersession: switching from any non-special unit that has pre-existing `rawLegacyValue` also clears `rawLegacyValue` |
| 3.6-F | tasks.md / structured-fields spec | `casting_time.text` is schema-required: always emit non-empty `.text` |
| 3.6-G | structured-fields spec | `DurationSpec.text` and `RangeSpec.text` optional but must be computed and emitted |

---

## Pass 2 — Code Reality Audit

### TypeScript Compilation: ✅ Zero errors

All three files (`MagicResistanceInput.tsx`, `AreaForm.tsx`, `StructuredFieldInput.tsx`) pass `tsc --noEmit` with no errors.

---

### Task 3.4 — `MagicResistanceInput.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.4-A** `sourceText` read-only annotation | ✅ | Lines 99–104: `{spec.sourceText && (<div …>Original source: {spec.sourceText}</div>)}` — rendered as `<span>`, not an input; not editable |
| **3.4-B** `appliesTo` hidden for `unknown` | ✅ | Line 45: `const showAppliesTo = spec.kind !== "unknown";` — guards the `appliesTo` `<select>` |
| **3.4-C** `partial` scope enum selector | ✅ | Lines 107–129: `<select>` with all 5 `PARTIAL_SCOPE_OPTIONS` values |
| **3.4-D** `part_ids` disabled when not modeled | ✅ | Line 141: `disabled={damageKind !== "modeled"}` on `<input>`; Lines 151–153: informational message shown when disabled |
| **3.4-E** `special` appliesTo + special_rule | ✅ | Lines 158–166: `<textarea>` for `specialRule` with `e.target.value \|\| undefined` (empty → undefined) |
| **3.4-F** Notes for all kinds | ✅ | Lines 168–175: `<textarea>` rendered unconditionally outside all kind conditionals |
| **3.4-G** `appliesTo` label mapping | ✅ | Lines 13–18: `APPLIES_TO_LABELS` matches spec exactly |
| **3.4-H** Part IDs only for `by_part_id` | **⚠️ P2** | See Finding F1 below |
| **3.4-I** sourceText/notes preserved on kind transition | ✅ | Line 54: `{ ...spec, kind }` spread preserves both fields |

**Finding F1 — Part IDs input visible for all partial scopes (P2 — Medium):**

The Part IDs input and its disabled-state message are rendered for all scopes within `kind === "partial"`, not just when `scope === "by_part_id"`. The complex-forms spec states part_ids are "only applicable when scope is `by_part_id`".

Current code (lines 130–153):
```tsx
{spec.kind === "partial" && (
  <div className="flex flex-col gap-2 …">
    {/* scope selector */}
    <div className="flex items-center gap-2">
      <label …>Part IDs:</label>
      <input … disabled={damageKind !== "modeled"} />     {/* ← always visible */}
      {damageKind !== "modeled" && (
        <p …>No modeled damage parts available…</p>       {/* ← always visible */}
      )}
    </div>
  </div>
)}
```

The Part IDs row should be gated by `spec.partial?.scope === "by_part_id"`. For other scopes, showing the Part IDs field is confusing — the concept doesn't apply.

> **Recommended fix:** Wrap the Part IDs label + input + message in `{spec.partial?.scope === "by_part_id" && ( ... )}`.

---

### Task 3.5 — `AreaForm.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.5-A** Non-special: `.text` auto-recomputed | **⚠️ P1** | See Finding F2 below |
| **3.5-B** Special: `rawLegacyValue` user-editable | ✅ | Lines 567–581: `<input type="text">` with `rawLegacyValue` binding |
| **3.5-C** `.text` derived from `rawLegacyValue` or `undefined` | ✅ | Line 574: `text: rawLegacyValue` (undefined when empty via `e.target.value \|\| undefined`) |
| **3.5-D** `.text` not directly editable for non-special | ✅ | Text preview is a `<p>` tag at line 584, not an input |
| **3.5-E** `.text` on emitted value for non-special | **⚠️ P1** | See Finding F2 below |

**Finding F2 — AreaForm never writes computed `.text` to emitted value for non-special kinds (P1 — Important):**

This is the most significant finding in this review. The `updateSpec` helper and the kind-transition handler both fail to populate `.text` with the computed preview for non-special kinds.

**Impact 1 — `updateSpec` does not recompute `.text`:**

```tsx
const updateSpec = (updates: Partial<AreaSpec>) => {
    onChange({ ...spec, ...updates });
    // ← no text = areaToText({...spec, ...updates})
};
```

Every sub-field change (radius, shapeUnit, length, width, height, etc.) passes through `updateSpec`, which spreads the updates onto the existing spec without recomputing `.text`. After a kind transition sets `text: undefined` for non-special kinds, all subsequent sub-field changes continue to emit `text: undefined`.

**Contrast with StructuredFieldInput Range** (which does this correctly):
```tsx
<ScalarInput
  value={spec.distance ?? { mode: "fixed", value: 0 }}
  onChange={(d) => {
    const next = { ...spec, distance: d };
    next.text = rangeToText(next);  // ← recomputes text on every change ✅
    onChange(next);
  }}
/>
```

**Impact 2 — Kind transition sets `text: undefined` for non-special kinds:**

```tsx
if (kind === "special") {
  next.rawLegacyValue = spec.rawLegacyValue || undefined;
  next.text = next.rawLegacyValue;
} else {
  next.rawLegacyValue = undefined;
  next.text = undefined;    // ← should be areaToText(next)
}
```

After transitioning to (say) `radius_circle`, the emitted spec has `text: undefined` even though `areaToText` would produce `"0-ft radius"`.

**Mitigation:** The backend `normalize()` computes `.text` authoritatively on save, so persisted data is correct. And `SpellEditor.tsx` calls `areaToText(spec)` externally for the form display string. However, the emitted spec object does not match the contract specified by task 3.5-A ("auto-recomputed").

> **Recommended fix — two changes:**
>
> 1. Update `updateSpec` to recompute `.text`:
> ```tsx
> const updateSpec = (updates: Partial<AreaSpec>) => {
>     const next = { ...spec, ...updates };
>     if (next.kind !== "special") {
>       next.text = areaToText(next);
>     }
>     onChange(next);
> };
> ```
>
> 2. Update the kind-transition `else` branch:
> ```tsx
> } else {
>   next.rawLegacyValue = undefined;
>   // remaining kind-specific initialization branches run below...
> }
> // After all kind-specific init:
> if (kind !== "special") {
>   next.text = areaToText(next);
> }
> ```

**Finding F3 — AreaForm does not clear stale sub-fields on kind transition (P2 — Medium):**

The kind `onChange` handler uses `{ ...spec, kind }` as the base for `next`, then conditionally initializes fields relevant to the new kind. However, it never explicitly clears fields from the previous kind.

**Example — switching from `radius_circle` → `cone`:**
```tsx
const next: AreaSpec = { ...spec, kind };  // spreads radius, shapeUnit from old spec
if (["cone", "line"].includes(kind)) {
  next.length = spec.length ?? { mode: "fixed", value: 0 };
  next.shapeUnit = spec.shapeUnit ?? "ft";
  // ← next.radius is still present from the spread!
}
```

The emitted `AreaSpec` contains `radius` even though `cone` doesn't use it. The UI won't render it (the conditional rendering gates by kind), but the data object carries orphaned keys.

**Contrast with StructuredFieldInput Range** (which cleans up correctly):
```tsx
const next: RangeSpec = { ...spec, kind };
if (RANGE_DISTANCE_KINDS.includes(kind as ...)) {
  next.unit = spec.unit ?? "ft";
  next.distance = spec.distance ?? { mode: "fixed", value: 0 };
  next.rawLegacyValue = undefined;
} else {
  next.unit = undefined;
  next.distance = undefined;          // ← explicitly cleared
  if (kind !== "special") {
    next.rawLegacyValue = undefined;   // ← explicitly cleared
  }
}
```

Orphaned fields on `AreaSpec` include: `radius`, `diameter`, `length`, `width`, `height`, `thickness`, `edge`, `surfaceArea`, `volume`, `tileUnit`, `tileCount`, `count`, `countSubject`, `regionUnit`, `scopeUnit`, `shapeUnit`, `unit`.

> **Mitigation:** The backend `normalize()` reads only kind-relevant fields, so orphaned keys don't corrupt data. However, they add noise to debug inspection and could cause subtle issues if any downstream code iterates over all spec keys.
>
> **Recommended fix:** Add a clearing step before the kind-specific initialization:
> ```tsx
> // Clear all kind-specific sub-fields first
> const next: AreaSpec = {
>   kind,
>   notes: spec.notes,
>   rawLegacyValue: kind === "special" ? (spec.rawLegacyValue || undefined) : undefined,
>   text: undefined,
> };
> // Then initialize kind-specific fields...
> ```

---

### Task 3.6 — `StructuredFieldInput.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.6-A** Real-time `.text` for all field types | ✅ | Range: every `onChange` path calls `next.text = rangeToText(next)`; Duration: kind/unit/scalar onChange all set `next.text`; CastingTime: `updateCt` always calls `castingTimeToText` |
| **3.6-B** Kind-transition field-clearing | ✅ | Range: distance kinds init distance+unit, kind-only clears both + rawLegacyValue, special preserves rawLegacyValue. Duration: time inits unit+duration, condition kinds init condition, usage_limited inits uses, kind-only clears all, special preserves rawLegacyValue |
| **3.6-C** rawLegacyValue trigger 1 (kind/unit) | ✅ | Range: `isSpecial` = `spec.kind === "special"`; Duration: same; CastingTime: `ct.unit === "special"` |
| **3.6-D** rawLegacyValue trigger 2 (pre-existing) | ✅ | Range: `(isSpecial \|\| spec.rawLegacyValue)`; Duration: same; CastingTime: `(ct.unit === "special" \|\| ct.rawLegacyValue)` |
| **3.6-E** CastingTime data supersession | ✅ | Line 406: `updateCt(unit === "special" ? { unit } : { unit, rawLegacyValue: undefined })` — any non-special unit switch clears rawLegacyValue |
| **3.6-F** CastingTime `.text` always non-empty | ✅ | `castingTimeToText` returns: rawLegacyValue if truthy, `"Special"` for special without rawLegacyValue, or `"N segment"` / `"N segments"` for structured values. Zero-value input `baseValue: 0` → `"0 segments"` (non-empty) |
| **3.6-G** Range/Duration `.text` computed and emitted | **⚠️ P3** | See Finding F4 below |

**Finding F4 — Range/Duration special with empty `rawLegacyValue`: `.text` = `undefined` vs computed `"Special"` (P3 — Low):**

When the user clears the rawLegacyValue text input for a `kind === "special"` Range or Duration:

```tsx
// Range special rawLegacyValue input handler (line 177)
onChange={(e) => {
  const rawLegacyValue = e.target.value || undefined;
  const next = { ...spec, rawLegacyValue, text: rawLegacyValue };  // text = undefined
  onChange(next);
}}
```

Emitted `.text` = `undefined`. However, `rangeToText({ kind: "special" })` returns `"Special"` and `durationToText({ kind: "special" })` returns `"Special"`. The inline handler bypasses the text computation function.

**Contrast with CastingTime** (which uses `updateCt` → `castingTimeToText` → returns `"Special"`).

Since `RangeSpec.text` and `DurationSpec.text` are optional per schema, emitting `undefined` is not incorrect — but it's inconsistent with the CastingTime pattern and with the "must still be computed and emitted" clause in 3.6-G.

> **Recommended fix:** Use the text computation function instead of inline assignment:
> ```tsx
> const rawLegacyValue = e.target.value || undefined;
> const next = { ...spec, rawLegacyValue };
> next.text = rangeToText(next);  // returns "Special" when rawLegacyValue absent
> onChange(next);
> ```

**Finding F5 — Duration condition handler duplicates `durationToText` logic inline (P3 — Low):**

```tsx
// Duration condition input handler (line 290)
onChange={(e) => {
  const condition = e.target.value || undefined;
  const next = {
    ...spec,
    condition,
    text: condition ?? spec.kind.replace(/_/g, " "),  // ← inline duplication
  };
  onChange(next);
}}
```

The expression `condition ?? spec.kind.replace(/_/g, " ")` replicates the logic from `durationToText` for condition kinds:
```typescript
if (DURATION_CONDITION_KINDS.includes(spec.kind as ...)) {
  return spec.condition ?? spec.kind.replace(/_/g, " ");
}
```

Currently equivalent, but if `durationToText` ever changes (e.g., adds capitalization or formatting), the inline version would diverge.

> **Recommended fix:** Replace inline text with `durationToText(next)`.

---

## Pass 3 — Cross-Cutting Audit

### A. Pattern Consistency: AreaForm vs StructuredFieldInput

| Behavior | StructuredFieldInput (Range/Duration/CastingTime) | AreaForm |
|----------|--------------------------------------------------|----------|
| `.text` recomputed on kind transition | ✅ `next.text = xToText(next)` | ❌ `next.text = undefined` for non-special |
| `.text` recomputed on sub-field change | ✅ Every onChange path calls text function | ❌ `updateSpec` does not recompute text |
| Stale sub-fields cleared on kind transition | ✅ Explicit `undefined` in else branch | ❌ Orphaned keys survive via spread |
| `rawLegacyValue` visibility trigger 2 | ✅ `(isSpecial \|\| spec.rawLegacyValue)` | N/A (Area only shows rawLegacyValue for special) |
| `notes` preserved on kind transition | ✅ Spread captures it | ✅ Spread captures it |
| Data supersession on switch away from special | ✅ rawLegacyValue cleared for non-special | ✅ rawLegacyValue cleared for non-special |

**Assessment:** AreaForm has two structural gaps (F2 and F3) relative to the pattern established by StructuredFieldInput. These are the primary implementation issues in this review.

### B. MagicResistanceInput Integration with SpellEditor

```tsx
// SpellEditor.tsx line 2102
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

Integration is correct: `damageKind` is threaded from the parent's `structuredDamage?.kind`, which drives the Part IDs disabled state. ✅

### C. AreaForm Integration with SpellEditor

```tsx
// SpellEditor.tsx line 2070
<AreaForm
  value={structuredArea ?? defaultAreaSpec()}
  onChange={(spec) => {
    setStructuredArea(spec);
    setDetailDirtyFor("area");
    setForm((prev) => ({ ...prev, area: areaToText(spec) }));
  }}
/>
```

The parent calls `areaToText(spec)` to update the form display string. This means the display string is always correct (computed externally). The `spec.text` omission (F2) only affects the `structuredArea` state object — it won't cause a visible UI bug in the current integration, but it violates the data contract.

### D. Storybook Coverage Gaps

| Component | Coverage Assessment |
|-----------|-------------------|
| `MagicResistanceInput.stories.tsx` | **Missing:** story with `sourceText` populated (to verify read-only annotation renders); story with `notes` populated; story with `scope: "by_part_id"` and `damageKind: "modeled"` (to see enabled Part IDs picker) |
| `AreaForm.stories.tsx` | **Missing:** story with `text` pre-populated (to verify text preview uses computed value, not stored); story with both `rawLegacyValue` and structured fields on non-special kind (to verify rawLegacyValue is cleared) |
| `StructuredFieldInput.stories.tsx` | **Missing:** story for trigger-2 visibility (e.g., `unit: "segment"` + `rawLegacyValue: "1 action"` on CastingTime); story for Duration with `rawLegacyValue` on non-special kind |

These gaps are noted for task 5.4 (Storybook updates) and do not block implementation.

### E. Test Coverage Analysis

| File | Assessment |
|------|-----------|
| `StructuredFieldInput.test.ts` | Tests `rangeToText`, `durationToText`, `castingTimeToText` thoroughly including short-circuit behavior, per_level formatting, and special kind fallback. ✅ |
| `spell.test.ts` → `areaToText` | Tests point, radius_circle/sphere, cone/line, rawLegacyValue short-circuit. **Finding F1 from 3.1-3.3 review still applies:** no test asserts `spec.text` takes priority over `rawLegacyValue`. Deferred to areaToText fix. |
| `spell.test.ts` → `magicResistanceToText` | Tests unknown, normal, ignores_mr, partial scope. ✅ |
| Component-level render tests | None exist for these three components. All testing is via Storybook stories and E2E tests (task 5.3). |

---

## Finding Summary

| ID | Component | Severity | Description | Status |
|----|-----------|----------|-------------|--------|
| **F1** | `MagicResistanceInput.tsx` | P2 | Part IDs input visible for all partial scopes; should only show when `scope === "by_part_id"` | ✅ Fixed |
| **F2** | `AreaForm.tsx` | P1 | `.text` never computed or emitted for non-special kinds — `updateSpec` omits recomputation, kind transition sets `text: undefined` | ✅ Fixed |
| **F3** | `AreaForm.tsx` | P2 | Stale sub-fields (radius, length, width, etc.) not cleared on kind transition — orphaned keys survive via spread | ✅ Fixed |
| **F4** | `StructuredFieldInput.tsx` | P3 | Range/Duration special with empty rawLegacyValue: `text = undefined` instead of computed `"Special"` | ✅ Fixed |
| **F5** | `StructuredFieldInput.tsx` | P3 | Duration condition handler inlines `durationToText` logic instead of calling the function | ✅ Fixed |

---

## Recommended Fix Order

1. **F2 (P1)** — AreaForm `.text` emission. Two-part fix: update `updateSpec` to call `areaToText`, and update kind-transition handler to compute text after kind-specific initialization.
2. **F3 (P2)** — AreaForm stale sub-field clearing. Rebuild kind-transition to construct a clean `next` from only `kind`, `notes`, and kind-relevant fields (instead of spreading from old spec).
3. **F1 (P2)** — MagicResistanceInput Part IDs visibility. Gate by `scope === "by_part_id"`.
4. **F4 (P3)** — StructuredFieldInput special text consistency. Use text function instead of inline assignment.
5. **F5 (P3)** — StructuredFieldInput Duration condition deduplication. Call `durationToText(next)`.

---

## Overall Assessment

| Dimension | Rating |
|-----------|--------|
| Spec compliance (task 3.4) | ✅ Excellent — one UX refinement opportunity (F1) |
| Spec compliance (task 3.5) | ⚠️ One P1 gap — `.text` emission contract not met (F2) |
| Spec compliance (task 3.6) | ✅ Excellent — all core requirements met, two P3 polish items |
| Code quality | Good — clean component structure, proper TypeScript typing, consistent patterns |
| Kind-transition safety | Mixed — StructuredFieldInput exemplary; AreaForm needs catch-up (F2, F3) |
| Data preservation | ✅ `notes`, `sourceText`, `rawLegacyValue` all correctly preserved via spread |
| Storybook coverage | Partial — functional stories exist for all kinds; edge-case stories missing |

**Verdict:** Address F2 before proceeding to task 3.7 (SpellEditor integration). F3 and F1 should also be fixed in this pass. F4/F5 are acceptable deferrals.
