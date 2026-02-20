# Deep Analysis Report: add-spell-editor-canon-first-default

**Scope:** OpenSpec change `add-spell-editor-canon-first-default` (design, delta spec, tasks) vs implementation (`SpellEditor.tsx`, `detailDirty.ts`, `canonicalFieldDecision.ts`, E2E, docs).

**Method:** (1) Map requirements and scenarios to code paths; (2) Identify gaps, conflicts, or bugs; (3) For each finding, perform a second in-depth validation.

---

## Summary

| Finding | Type | Severity | Validated |
|--------|------|----------|-----------|
| 1. `canonical_data` field with value `null` treated as "suppress parse" | Bug | **High** | Yes |
| 2. (No further gaps/conflicts identified) | — | — | — |

---

## Finding 1: `canonical_data` null field should trigger parse on expand (BUG)

### First-level analysis

**Spec (main spell-editor spec, Hybrid Loading Logic Details):**

- **Missing field:** `undefined` (not in object) → parse legacy string on expand. ✓ Implemented: `decideCanonicalField` returns `{ suppressExpandParse: false }` when `!hasOwnProperty.call(canonicalRaw, key)`.
- **`null` field:** "Field exists but value is `null`. **Treat as missing** for hybrid loading purposes (**parse legacy string if available**)."

**Implementation:**

- In `canonicalFieldDecision.ts` (lines 20–22):
  ```ts
  const rawValue = canonicalRaw[key];
  if (rawValue === null) {
    return { suppressExpandParse: true };
  }
  ```
- So when a key is present with value `null`, the code **suppresses** parse and does **not** return a `structuredValue`.
- On load: `suppressExpandParse.range = true` (e.g.) is set; `structuredRange` is never set (no `structuredValue`).
- On first expand: `hasStructured()` is true because `suppressExpandParse[field]` is true, so the editor **does not** call the Tauri parser and does not run loading; the expanded panel renders with `structuredRange === null` (e.g. `value={undefined}`).
- Result: User sees an **empty/default** structured form instead of the result of **parsing the legacy text** (e.g. `form.range` like `"Touch"`). Legacy text is ignored for that field on expand.

**Conclusion:** Behavior contradicts the spec: `null` must be treated like a missing field and trigger parse-on-expand.

### Second-level validation

1. **Spec wording:** The spec explicitly says "**Treat as missing**" and "parse legacy string if available" for a `null` field. So the intended behavior is: on expand, run the same path as when the field is missing (invoke parser with legacy string). The current implementation does the opposite (skip parse, show no structured value).

2. **Call sites:** `decideCanonicalField` is used in the spell-load effect in `SpellEditor.tsx` for `range`, `duration`, `casting_time`, `area`, `damage`, `saving_throw`, `magic_resistance`, and components. For any of these, if the backend stores `canonical_data` with e.g. `"range": null`, the same bug applies: expand shows default/empty structured form instead of parsed legacy.

3. **Backend possibility:** If the backend or migrations ever write a key with an explicit `null` (e.g. "no structured value for this field"), that is exactly the hybrid case the spec addresses: treat as missing and parse legacy. So the fix is required for spec compliance and for correct behavior when `null` appears.

4. **Fix:** In `canonicalFieldDecision.ts`, for `rawValue === null`, return the same as for a missing field: `return { suppressExpandParse: false };` so that on expand the editor invokes the parser with the legacy string and shows the parsed (or special) result.

**Validated:** Bug confirmed; fix is to treat `null` as "do not suppress parse" (i.e. treat as missing).

---

## Other areas checked (no issues)

- **Field order and labels:** `DETAIL_FIELD_ORDER` matches spec (Range, Components, Duration, Casting Time, Area, Saving Throw, Damage, Magic Resistance, Material Component). "Area" is labeled "Area of Effect" in the UI. ✓  
- **Single expand / collapse-before-expand:** `expandedDetailField` is single; `expandDetailField` calls `collapseExpandedField()` first and serializes when dirty. ✓  
- **Dirty tracking and collapse:** Serialize to canon line only when dirty; clear dirty on collapse+serialize and on save (via `clearDetailDirtyForFormOverrides`). ✓  
- **Save with expanded+dirty:** Save builds `formOverrides` from `detailDirty` + structured state, applies to form and payload, clears dirty for serialized fields. ✓  
- **Loading state:** `detailLoading` set before async parse, cleared in `finally` and when `hasStructured()`; savingThrow/magicResistance are sync so loading is cleared in same tick. ✓  
- **Special hint and collapsed indicator:** "Could not be fully parsed" when expanded; "(special)" when collapsed for special/dm_adjudicated. ✓  
- **Stable test IDs:** `detail-${kebabField}-input` and `detail-${kebabField}-expand`; `inputId` for `htmlFor`/`getElementById` uses camelCase and matches `getLegacy()` DOM fallback. ✓  
- **Unsaved changes:** `useBlocker(hasUnsavedState)`, confirm dialog, `beforeunload`; no auto-serialize on navigate/close. ✓  
- **Accessibility:** Expand button has `aria-expanded`, `aria-controls`; focus moves to panel on expand and back to expand button on collapse. ✓  
- **Components and Material Component:** Both rows bound to form; expanded view shared (ComponentCheckboxes + material list); serialize via `componentsToText` when dirty. ✓  
- **Optional Material Component row:** Implemented as ninth row; spec allows "MAY include"; no conflict. ✓  

---

## Recommendation

1. **Fix Finding 1:** In `apps/desktop/src/ui/canonicalFieldDecision.ts`, change the `rawValue === null` branch to return `{ suppressExpandParse: false }` so that a `null` field is treated as missing and the editor parses the legacy string on first expand.
2. **Tests:** Add a test (E2E or unit) that loads a spell with `canonical_data` containing a field set to `null` (e.g. `"range": null`) and a legacy string for that field, then expands that field and asserts the structured form is populated from the parsed legacy (or special), not left default/empty. *Satisfied by unit test in `canonicalFieldDecision.test.ts` that asserts `decideCanonicalField({ range: null }, "range", ...)` returns `suppressExpandParse: false` (so the editor will parse on expand); full E2E would require a test-only way to persist canonical_data with a null field.*
3. **Verification:** Re-run verification after the fix and update `VERIFICATION_REPORT.md` if needed.

---

## Two-pass verification (deliverables complete)

**Pass 1 — Deliverables implemented:**

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| Fix Finding 1 | Done | `canonicalFieldDecision.ts`: `rawValue === null` → `return { suppressExpandParse: false }` with spec comment. |
| Tests | Done | `canonicalFieldDecision.test.ts`: null case expects `suppressExpandParse: false`; test name reflects hybrid loading spec. |
| Verification report | Done | `VERIFICATION_REPORT.md`: Post-analysis fix section added; Correctness table includes "Hybrid: canonical_data field null → parse on expand"; final assessment updated. |

**Pass 2 — Consistency and correctness:**

- **Code:** Null branch is the only change in `canonicalFieldDecision.ts`; missing and null both return `suppressExpandParse: false`; no other branches altered.
- **Unit tests:** All 5 tests in `canonicalFieldDecision.test.ts` pass (including the updated null test). Full unit suite: 48 tests pass.
- **Docs:** ANALYSIS_REPORT and VERIFICATION_REPORT align on the fix, test, and readiness for archive.
- **Lint:** No linter errors on modified files.
