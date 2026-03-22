# Chunk 4 Code Review: Structured Editor Visual Polish

- Review date: 2026-03-22
- Review target: Chunk 4 implementation from `docs/superpowers/plans/2026-03-21-add-spell-ui-design-and-accessibility-chunk-4.md`
- Method: Three-pass parallel subagent review + independent verification
- Pass 1: Code structure & correctness
- Pass 2: Spec compliance, design intent, theme coverage
- Pass 3: Accessibility, test completeness, E2E robustness

---

## Summary

All 37 unit tests pass. No Critical findings. High findings are actionable and concentrated in:
(a) misleading test authoring artifacts (stale comments, brittle class assertions),
(b) a semantic HTML inconsistency for the component preview element, and
(c) missing `data-testid` on expanded section panels required by project E2E conventions.

---

## Critical (75–100)

None found.

---

## High (50–74)

### CR-H1 — Stale "MUST FAIL" comments in `ComponentCheckboxes.test.tsx` ✅ RESOLVED

**Score: 62**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx` — three test blocks around lines 213–260

**Description:** Three consecutive tests carry comments declaring they "MUST FAIL" because certain classes or `data-testid` attributes were not yet present. The implementation has since been completed; all three tests now pass. The stale comments give a completely false picture of implementation status and will confuse any developer performing a future TDD audit or attempting to understand what was shipped in this chunk.

Affected tests:
1. `"material subform uses theme-aware surface classes not dark-only"` — comment says `dark:bg-neutral-900` does not exist yet, but it is present at line 202 of `ComponentCheckboxes.tsx`.
2. `"material component rows use theme-aware row background class"` — comment says plain `bg-neutral-900` is used, but implemented rows use `bg-neutral-50 dark:bg-neutral-800`.
3. `"enabling Material reveals a visually nested material-subform container"` — comment says `data-testid="material-subform"` does not exist, but it is present at line 202 of `ComponentCheckboxes.tsx`.

**Fix:** Remove all three "MUST FAIL" marker comments, remove the inline HTML-string assertion comments explaining the old failing state, and update test description strings to reflect what they actually verify (not what they used to fail on).

---

### CR-H2 — `ComponentCheckboxes` preview uses `<p>` while `StructuredFieldInput` uses `<output>` ✅ RESOLVED

**Score: 58**

**Files:**
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` — `component-text-preview` rendered as `<p>`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx` — `range-text-preview`, `duration-text-preview`, `casting-time-text-preview` all rendered as `<output>`

**Description:** The `<output>` element is the HTML-spec-designated semantic element for computed or generated output values. `StructuredFieldInput` uses it correctly for all three preview types. `ComponentCheckboxes` uses `<p>` for the identically-purposed VSM preview text. This semantic inconsistency means screen readers classify the component preview as paragraph text rather than a form output, and it breaks the authored visual-design contract: both components are supposed to use the same "output chip" treatment, but they use different HTML semantics.

**Fix:**
- Change `<p ... data-testid="component-text-preview">` to `<output ... data-testid="component-text-preview">` in `ComponentCheckboxes.tsx`.
- Add a corresponding `expect(preview.tagName).toBe("OUTPUT")` assertion in `ComponentCheckboxes.test.tsx` for the `component-text-preview` element (matching the `expectPreviewRow` helper pattern in `StructuredFieldInput.test.tsx`).

---

### CR-H3 — Expanded `<section>` panels lack `data-testid`; E2E uses brittle CSS attribute selectors ✅ RESOLVED

**Score: 55**

**Files:**
- `apps/desktop/src/ui/SpellEditor.tsx` — `<section aria-label="Structured {label}">` (around line 2693) has no `data-testid`
- `apps/desktop/tests/spell_editor_visual.spec.ts` — screenshot tests use `page.locator('section[aria-label="Structured Range"]')` etc.

**Description:** The project convention (documented in `docs/LOCATOR_STRATEGY.md` and `apps/desktop/tests/AGENTS.md`) requires `data-testid` for stable E2E locators. The three screenshot tests in `spell_editor_visual.spec.ts` instead locate target sections via CSS attribute selectors on `aria-label`. If the label text ever changes (e.g., label refinement, i18n, or the "Casting Time" → "Cast Time" shortening), the selector silently returns nothing and the test screenshots an empty region without a clear error. The plan itself notes: "If implementation exposes missing stable selectors for screenshot capture, add them in the implementation pass."

**Fix:**
- In `SpellEditor.tsx`, add `data-testid={`structured-panel-${kebabField}`}` to the `<section>` element.
- Update the three screenshot locators in `spell_editor_visual.spec.ts`:
  - `page.locator('section[aria-label="Structured Range"]')` → `page.getByTestId("structured-panel-range")`
  - `page.locator('section[aria-label="Structured Duration"]')` → `page.getByTestId("structured-panel-duration")`
  - `page.locator('section[aria-label="Structured Casting Time"]')` → `page.getByTestId("structured-panel-casting-time")`

---

## Medium (25–49)

### CR-M1 — Material subform dark-mode surface diverges from palette baseline ✅ RESOLVED

**Score: 45**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` — `material-subform` container class (around line 202)

**Description:** The material subform container uses `dark:bg-neutral-900` (a solid dark background). The parent `ComponentCheckboxes` root uses `dark:bg-neutral-950/60` and the `StructuredFieldInput` root uses the same `dark:bg-neutral-950/60`. The plan (Task 3 Step 1) explicitly requires palette convergence: "Use `StructuredFieldInput.tsx`, `ScalarInput.tsx`, and the expanded detail panel in `SpellEditor.tsx` as the palette reference so `ComponentCheckboxes` converges on the same surface language." Using `dark:bg-neutral-900` makes the material subform appear lighter than its parent surface in dark mode, reading as a visually prominent foreground element rather than a nested subordinate container.

Current:
```
dark:bg-neutral-900
```
Expected:
```
dark:bg-neutral-950/60
```

**Fix:** Change the `material-subform` container class `dark:bg-neutral-900` to `dark:bg-neutral-950/60`.

---

### CR-M2 — `renderToStaticMarkup` used for class assertions in a jsdom test file ✅ RESOLVED

**Score: 38**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx` — three tests using `renderToStaticMarkup` + `expect(html).toContain(classString)`

**Description:** Three tests import `renderToStaticMarkup` from `react-dom/server` and assert class strings via HTML substring matching. This imports a server-side rendering dependency into a client-side component test, and it makes class assertions more brittle: `html.toContain("dark:bg-neutral-900")` passes if that string appears anywhere in the rendered tree (even in an unrelated element), not specifically on the targeted node. The rest of the file (34 other tests) consistently uses `@testing-library/react` `render()` + DOM node inspection, which is more precise and idiomatic.

**Fix:** Replace `renderToStaticMarkup` usage with DOM assertions using `render()` + `screen.getByTestId("material-subform")` + direct class inspection. Example:
```typescript
const { } = render(<ComponentCheckboxes components={withMaterial} ... />);
const subform = screen.getByTestId("material-subform");
expect(subform.className).toContain("dark:bg-neutral-900");
```
Remove the `import { renderToStaticMarkup } from "react-dom/server"` line.

---

### CR-M3 — `openExpandedVisualSpell` function name does not match its behavior ✅ RESOLVED

**Score: 35**

**Files:** `apps/desktop/tests/spell_editor_visual.spec.ts` — function `openExpandedVisualSpell` (around line 53)

**Description:** The function name strongly implies it opens the spell editor with structured fields already expanded. In reality it only calls `seedVisualSpell(app)` — it seeds the spell and opens the editor page, with no expansion of any fields. Every caller must then call `expandStructuredField()` and `expandComponents()` separately. A developer adding a new test expecting the helper to expand fields would omit those calls and get silent visual regressions with incomplete screenshots.

**Fix:** Rename to `openSpellInEditor` to accurately describe what it does (seed + open, no expansion).

---

### CR-M4 — No test verifying focus management on panel expand ✅ RESOLVED

**Score: 35**

**Files:** `apps/desktop/src/ui/SpellEditor.test.tsx`

**Description:** SpellEditor implements explicit focus management on expand: after calling `expandDetailField()`, a `requestAnimationFrame` fires to focus the first focusable child, or the section itself as fallback. This is a meaningful accessibility behavior that has no unit test coverage. If the `querySelector` selector changes or the `requestAnimationFrame` callback is accidentally removed, no test would catch the regression.

**Fix:** Add a test in `SpellEditor.test.tsx` that simulates clicking a detail-range-expand button and asserts `document.activeElement` becomes the `range-kind-select` input after `await waitFor(...)`.

---

### CR-M5 — Material component ARIA labels lack row-index context ✅ RESOLVED

**Score: 35**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` — `MaterialSubForm` inputs (around lines 223–280)

**Description:** All material row inputs use generic ARIA labels: `aria-label="Material name"`, `aria-label="Quantity"`, `aria-label="GP value"`, etc. When a spell has multiple material components, screen reader users encounter multiple consecutive "Material name" inputs with no differentiation. This makes it impossible to understand which row is being edited without navigating to surrounding context.

**Fix:** Incorporate the row index into each label:
```tsx
aria-label={`Material ${idx + 1} name`}
aria-label={`Material ${idx + 1} quantity`}
// etc.
```

---

### CR-M6 — Duration `usage_limited` variant missing preview text assertion ✅ RESOLVED

**Score: 28**

**Files:** `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx` — "keeps duration usage-limited scalar controls in the primary row" test

**Description:** The duration `usage_limited` test verifies that `duration-uses-scalar` is in the primary row, but unlike the "time", "conditional", and "special" tests, it does not assert the preview output text. All other duration-mode tests end with an `expectPreviewRow(...)` call. The absence of a preview assertion for `usage_limited` means a regression in `durationToText()` for this mode would not be caught by the component tests.

**Fix:** Add `expect(preview.contains(expectPreviewRow("duration-text-preview", "2 uses"))).toBe(true)` (or the appropriate expected string from `durationToText`) after the existing primary-row assertions in that test.

---

### CR-M7 — No unit test for 900px flex-wrap behavior on structured group containers ✅ RESOLVED

**Score: 28**

**Files:** `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx`

**Description:** The plan scope guardrail explicitly requires: "verify that its new grouping wrappers still behave sensibly at 900px and do not introduce fresh horizontal overflow on the touched structured surfaces." The E2E spec does check `expectNoHorizontalOverflow` at 900px (confirmed by subagent via `spell_editor_structured_data.spec.ts`), but there is no unit-level assertion that `structuredPrimaryControlRowClass` includes `flex-wrap`. If `flex-wrap` is accidentally removed from the constant, the E2E test is the only safety net (and it requires a full app build to run).

**Fix:** Add one assertion in `StructuredFieldInput.test.tsx` that the primary control row node contains the `flex-wrap` class, ensuring the class constant maintains this property.

---

## Low (1–24)

### CR-L1 — Material row `key` prop includes mutable name/quantity values ⏸ DEFERRED

**Score: 22 | File:** `ComponentCheckboxes.tsx`

Using `key={`material-${idx}-${m.name || "unnamed"}-${m.quantity || 0}`}` mixes index with mutable content. If both name and quantity change simultaneously for a multi-row form, React may misidentify row identity. Use either a stable UUID on creation or `key={idx}` (with documented assumption that materials are add/remove only, not reordered).

---

### CR-L2 — `prepareFullEditorScreenshot` conflates data validation with visual setup ⏸ DEFERRED

**Score: 20 | File:** `spell_editor_visual.spec.ts`

The `await expect(page.getByTestId("component-text-preview")).toHaveText(/V,\s*S,\s*M/i)` assertion appears inside the screenshot setup helper. If it fails, the subsequent full-page screenshots are never taken, making debugging ambiguous. Move it to a named `test.step("verify seed data rendered")` before screenshot assertions.

---

### CR-L3 — `<section>` fallback focus lacks a visible CSS focus indicator ⏸ DEFERRED

**Score: 18 | File:** `SpellEditor.tsx`

When no focusable children exist in the expanded section (edge case), the section itself receives `tabIndex = -1` and `focus()`. The section has no `:focus-visible` Tailwind class. Add `focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2` to the section for this unlikely but spec-compliant case.

---

### CR-L4 — Platform skip condition duplicated across three E2E files ⏸ DEFERRED

**Score: 15 | Files:** `spell_editor_visual.spec.ts`, `spell_editor_structured_data.spec.ts`, `theme_and_feedback.spec.ts`

`test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.")` is copied verbatim. Extract into `fixtures/constants.ts` as `IS_TAURI_WINDOWS_ONLY` to keep future changes in one place.

---

### CR-L5 — Material rows not tested for direct containment inside `material-subform` ✅ RESOLVED

**Score: 15 | File:** `ComponentCheckboxes.test.tsx`

`"material-component-row appears for each material entry"` asserts count but not nesting. Use `within(screen.getByTestId("material-subform")).getAllByTestId("material-component-row")` to verify rows are directly inside the container, not floating elsewhere.

---

## Findings by Action Required

| ID | Score | Severity | Status | Action |
|----|-------|----------|--------|--------|
| CR-H1 | 62 | High | ✅ FIXED | Remove stale MUST FAIL comments from `ComponentCheckboxes.test.tsx` |
| CR-H2 | 58 | High | ✅ FIXED | Change `<p>` → `<output>` for component preview + update test |
| CR-H3 | 55 | High | ✅ FIXED | Add `data-testid` to section panels in SpellEditor; update E2E locators |
| CR-M1 | 45 | Medium | ✅ FIXED | Fix `dark:bg-neutral-900` → `dark:bg-neutral-950/60` in material subform |
| CR-M2 | 38 | Medium | ✅ FIXED | Replace `renderToStaticMarkup` with DOM assertions in test |
| CR-M3 | 35 | Medium | ✅ FIXED | Rename `openExpandedVisualSpell` → `openSpellInEditor` |
| CR-M4 | 35 | Medium | ✅ FIXED | Add panel-expand focus management test to `SpellEditor.test.tsx` |
| CR-M5 | 35 | Medium | ✅ FIXED | Add row-index context to material input ARIA labels |
| CR-M6 | 28 | Medium | ✅ FIXED | Add `usage_limited` preview text assertion in `StructuredFieldInput.test.tsx` |
| CR-M7 | 28 | Medium | ✅ FIXED | Add `flex-wrap` class assertion in `StructuredFieldInput.test.tsx` |
| CR-L1 | 22 | Low | ⏸ DEFERRED | Fix material row key prop |
| CR-L2 | 20 | Low | ⏸ DEFERRED | Separate data validation from screenshot setup |
| CR-L3 | 18 | Low | ⏸ DEFERRED | Add focus-visible ring to section element (fallback path) |
| CR-L4 | 15 | Low | ⏸ DEFERRED | Extract platform skip to shared constant |
| CR-L5 | 15 | Low | ✅ FIXED | Test material rows with `within()` for direct containment |

---

---

## Implementation Record (Pass 1 Fixes)

All Critical/High/Medium findings were implemented. Final unit test count: **292 tests, 24 files, all passing**.

| ID | Status | Fix Applied |
|----|--------|-------------|
| CR-H1 | ✅ FIXED | Removed stale MUST FAIL comments; replaced renderToStaticMarkup with DOM assertions |
| CR-H2 | ✅ FIXED | `<p>` → `<output>` in ComponentCheckboxes; tagName assertion added |
| CR-H3 | ✅ FIXED | `data-testid="structured-panel-${kebabField}"` on SpellEditor section; E2E uses `getByTestId` |
| CR-M1 | ✅ FIXED | Material subform `dark:bg-neutral-900` → `dark:bg-neutral-950/60` |
| CR-M2 | ✅ FIXED | (same fix as CR-H1) |
| CR-M3 | ✅ FIXED | `openExpandedVisualSpell` → `openSpellInEditor` everywhere |
| CR-M4 | ✅ FIXED | Focus management test added to SpellEditor.test.tsx Task 3 describe block |
| CR-M5 | ✅ FIXED | Material ARIA labels include row index: `Material ${idx + 1} name` etc. |
| CR-M6 | ✅ FIXED | `usage_limited` preview text assertion added (`"2 use(s)"`) |
| CR-M7 | ✅ FIXED | `flex-wrap` + `min-w-0` class assertion added |
| CR-L5 | ✅ FIXED | `within(subform).getAllByTestId("material-component-row")` containment test |

---

## Second-Pass Review (2026-03-22)

A second-pass review was dispatched after all pass-1 fixes were applied. All 11 pass-1 fixes were **verified correct**. The following additional findings were identified and fixed:

### P2-H1 — `handleMaterialChange` double-`onChange` leaves `materialComponents` uncleared ✅ FIXED

**Score: 65 | High | File:** `ComponentCheckboxes.tsx`

When the user unchecked Material with existing rows and confirmed the destructive dialog, two separate `onChange` calls fired. `updateMaterials([])` cleared the rows, but `updateComponents({...comp, material: false})` closed over the original (stale) `materials` list, so React's automatic batching resolved state with `material: false` but the original non-empty material rows intact — the confirmation accomplished nothing.

**Fix:** Replaced the two-call sequence with a single atomic `onChange(cleared, [])` in the confirm branch.

### P2-M1 — Destructive confirm test masked P2-H1 ✅ FIXED

**Score: 35 | Medium | File:** `ComponentCheckboxes.test.tsx`

The confirm test only asserted `expect(onChange).toHaveBeenCalled()` with no argument verification, so the stale-closure bug passed silently.

**Fix:** Added typed destructuring of `onChange.mock.calls[0]` with assertions on both `resultComp.material === false` and `resultMaterials.length === 0`.

### P2-L1 — Preview text colour tokens diverge ✅ FIXED

**Score: 5 | Low | Files:** `ComponentCheckboxes.tsx`

`<output>` used `text-neutral-600 dark:text-neutral-400` while `StructuredFieldInput` uses `text-neutral-700 dark:text-neutral-300`.

**Fix:** Aligned `ComponentCheckboxes.tsx` to `text-neutral-700 dark:text-neutral-300`.

### P2-L2 — Unused `page` parameter in `openSpellInEditor` ✅ FIXED

**Score: 5 | Low | File:** `spell_editor_visual.spec.ts`

**Fix:** Changed `page: Page` → `_page: Page` to signal intentional non-use.

### P2-L3 — `<output>` implicit `role="status"` verbosity (informational)

**Score: 10 | Low | Informational — no code change.**

`<output>` carries an implicit `aria-live="polite"` ARIA role. This may produce verbose screen-reader announcements during rapid input. Accepted as-is — live preview announcements are a feature of the design. Can be reconsidered if user testing reveals annoyance.

---

## Final Status

**Second-pass unit test count:** 292 tests, 24 files, all passing.

| Band | Remaining Issues |
|------|-----------------|
| Critical (75–100) | 0 |
| High (50–74) | 0 |
| Medium (25–49) | 0 |
| Low (1–24) | 0 (informational P2-L3 accepted; CR-L1/L2/L3/L4 deferred) |

**Chunk 4 review cycle complete. All Critical, High, and Medium findings resolved.**

---

## Pass Verifications (no action required)

- CSS class constants in `StructuredFieldInput.tsx` are correctly defined, free of typos, and match test expectations. ✅
- All seven constants include light/dark pairs. ✅
- Range, duration, and casting-time DOM contracts are correctly implemented and locked. ✅
- `SpellCastingTime` has no `notes` field; casting-time omitting a notes row is correct. ✅
- Chunk 5 readiness: all primary rows use `flex flex-wrap min-w-0`. ✅
- 900px `expectNoHorizontalOverflow` check present in `spell_editor_structured_data.spec.ts`. ✅
- Stories coverage meets plan requirements. ✅
- Scope guardrails honored: no new dependencies, no label migration, existing testids stable. ✅
- `theme_and_feedback.spec.ts` structured-editor test covers both components in both themes. ✅
- All 37 unit tests pass. ✅
