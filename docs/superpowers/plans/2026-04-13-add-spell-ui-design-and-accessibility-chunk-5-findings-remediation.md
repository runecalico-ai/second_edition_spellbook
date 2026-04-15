# Chunk 5 Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all High, Medium, and Low findings from the Chunk 5 review report so the spell editor, structured editor, and accessibility test coverage fully match the Chunk 5 plan.

**Architecture:** Keep the fixes surgical. One track hardens real UI behavior in the spell editor and structured Magic Resistance input; the other track upgrades Playwright and component tests so accessibility and resize coverage verifies the intended public contract instead of current dialog internals. Preserve existing test IDs and avoid broad component rewrites.

**Tech Stack:** React, TypeScript, Tauri, Zustand, Tailwind, Vitest, Playwright

---

## File Map

**Modify**
- `apps/desktop/src/ui/SpellEditor.tsx`
  - Unify keyboard submit behavior with the visible `Save Spell` action.
- `apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx`
  - Programmatically associate helper text with the disabled Part IDs field.
- `apps/desktop/src/ui/SpellEditor.test.tsx`
  - Add unit coverage for keyboard submit behavior.
- `apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx`
  - Add unit coverage for helper-text association on the Part IDs field.
- `apps/desktop/tests/accessibility_and_resize.spec.ts`
  - Replace implementation-coupled modal assertions with resilient selectors.
  - Add/strengthen coverage for Enter submit, Escape dismissal, and nested 900px overflow checks.
- `apps/desktop/src/ui/components/Modal.test.tsx`
  - Add or tighten unit coverage for dismissible Escape behavior if Playwright cannot reach a stable dismissible modal path.

**Verify for context only**
- `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md`
- `openspec/changes/add-spell-ui-design-and-accessibility/chunk-5-review-report.md`
- `apps/desktop/tests/page-objects/SpellbookApp.ts`
- `apps/desktop/tests/fixtures/test-fixtures.ts`

---

### Task 1: Fix keyboard submit parity in the spell editor

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Test: `apps/desktop/src/ui/SpellEditor.test.tsx`

- [ ] **Step 1: Inspect the existing save entry points**

Run: `rg -n "btn-save-spell|void save\\(|onKeyDown|type=\"button\"|type=\"submit\"|onSubmit" apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/SpellEditor.test.tsx`

Expected: confirm `btn-save-spell` is `type="button"` and Enter-to-save is currently special-cased on the name input.

- [ ] **Step 2: Write a failing unit test for keyboard submit parity**

Add a test in `apps/desktop/src/ui/SpellEditor.test.tsx` that:
- renders the editor in a valid saveable state,
- focuses a non-name field such as description or level,
- sends Enter in the same way a keyboard user would,
- asserts the same save side effect triggered by clicking `btn-save-spell`.

- [ ] **Step 3: Run the focused unit test and confirm it fails**

Run: `pnpm --dir apps/desktop test -- --runInBand src/ui/SpellEditor.test.tsx`

Expected: the new keyboard-submit test fails because Enter outside the name field does not trigger save.

- [ ] **Step 4: Implement a single submit path in `SpellEditor.tsx`**

Implementation target:
- move the editor save flow onto a real form submission path or an equivalent shared submit handler,
- make the visible save button participate in that same path,
- preserve existing validation, disabled-state, delayed-label, and save hint behavior,
- remove the name-field-only Enter special case once the shared submit path is active.

Guardrails:
- keep `btn-save-spell` and `spell-save-validation-hint` unchanged,
- do not change successful save semantics,
- do not introduce double-submit while `savePending` or parser work is active.

- [ ] **Step 5: Extend unit coverage for invalid and pending states**

Add assertions that keyboard submit:
- respects the same blocked-save rules as clicking the button,
- does not bypass disabled conditions,
- still focuses the first invalid field on failed submit.

- [ ] **Step 6: Run the spell editor unit tests**

Run: `pnpm --dir apps/desktop test -- --runInBand src/ui/SpellEditor.test.tsx`

Expected: PASS, including the new keyboard-submit tests.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/SpellEditor.test.tsx
git commit -m "fix: align spell editor keyboard submit behavior"
```

---

### Task 2: Associate Magic Resistance helper text with the disabled Part IDs field

**Files:**
- Modify: `apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx`
- Test: `apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx`

- [ ] **Step 1: Inspect the current helper-text rendering**

Run: `rg -n "magic-resistance-part-ids|No modeled damage parts available|aria-describedby" apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx`

Expected: confirm the helper text is rendered visually but not associated to the input.

- [ ] **Step 2: Write a failing component test**

Add a test in `MagicResistanceInput.test.tsx` that renders:
- `kind="partial"`,
- `scope="by_part_id"`,
- `damageKind` not equal to `"modeled"`,

and asserts:
- the input is disabled,
- the helper text is visible,
- the input exposes the helper text through `aria-describedby`.

- [ ] **Step 3: Run the focused test and confirm it fails**

Run: `pnpm --dir apps/desktop test -- --runInBand src/ui/components/structured/MagicResistanceInput.test.tsx`

Expected: FAIL on the missing descriptive association.

- [ ] **Step 4: Implement the descriptive relationship**

Implementation target in `MagicResistanceInput.tsx`:
- give the helper text a stable id,
- apply `aria-describedby` to `magic-resistance-part-ids` when the helper text is present,
- preserve the visible `<label>` as the primary accessible name,
- avoid adding redundant `aria-label` values beyond what the component already needs.

- [ ] **Step 5: Verify no regression when `damageKind === "modeled"`**

Add a second assertion or test proving:
- the field stays enabled when modeled damage is available,
- the helper text and `aria-describedby` are absent in that state.

- [ ] **Step 6: Run the Magic Resistance component tests**

Run: `pnpm --dir apps/desktop test -- --runInBand src/ui/components/structured/MagicResistanceInput.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx
git commit -m "fix: describe disabled magic resistance part ids input"
```

---

### Task 3: Replace brittle modal assertions with resilient selector usage

**Files:**
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`
- Verify for consistency: `apps/desktop/src/ui/components/Modal.tsx`

- [ ] **Step 1: Locate modal assertions coupled to dialog internals**

Run: `rg -n "dialog\\[open\\]|showModal\\(|querySelector\\(\"dialog|aria-modal" apps/desktop/tests/accessibility_and_resize.spec.ts`

Expected: identify all assertions tied to `dialog[open]` or explicit `showModal()` wording.

- [ ] **Step 2: Rewrite the modal-focus tests around public contract selectors**

In `accessibility_and_resize.spec.ts`, update the preserved-dialog tests to rely on:
- `page.getByTestId("modal-dialog")`,
- `getByRole("heading", ...)`,
- visible/invisible state,
- focus containment against the modal test id container,

instead of:
- `dialog[open][data-testid='modal-dialog']`,
- direct `querySelector("dialog[open]...")` checks,
- explicit assertions that name `showModal()`.

- [ ] **Step 3: Keep one focused assertion for behavior, not implementation**

Preserve verification that matters to the plan:
- focus is trapped,
- focus returns to the opener,
- dismissible behavior works where applicable,

but do not require the `open` attribute or a native method name in the test wording or selectors.

- [ ] **Step 4: Run the accessibility spec and confirm modal tests still pass**

Run: `pnpm --dir apps/desktop exec playwright test tests/accessibility_and_resize.spec.ts --grep "Modal focus trap|Preserved modal modality"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/tests/accessibility_and_resize.spec.ts
git commit -m "test: decouple accessibility modal checks from dialog internals"
```

---

### Task 4: Strengthen 900px resize verification for nested structured surfaces

**Files:**
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`
- Verify for context: `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- Verify for context: `apps/desktop/src/ui/components/structured/DamageForm.tsx`
- Verify for context: `apps/desktop/src/ui/components/structured/SavingThrowInput.tsx`
- Verify for context: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx`

- [ ] **Step 1: Identify the densest structured surfaces already reachable in the editor**

Run: `rg -n "structured-field-primary-row|damage-form|saving-throw-input|component-checkboxes" apps/desktop/src/ui apps/desktop/tests`

Expected: confirm concrete containers that can be measured for nested overflow.

- [ ] **Step 2: Add a helper in the Playwright spec to detect nested horizontal clipping**

In `accessibility_and_resize.spec.ts`, add a small page-evaluated helper that:
- inspects targeted containers,
- compares `scrollWidth` vs `clientWidth` on the container itself,
- optionally checks descendants likely to host wrapped controls,
- returns failing container test ids or selectors for easier debugging.

- [ ] **Step 3: Upgrade the existing 900px editor tests**

Update the current resize tests so they verify:
- root document has no horizontal scrollbar,
- targeted structured editor surfaces also have no nested horizontal overflow,
- the populated-data test exercises the densest rows rather than only the page root.

- [ ] **Step 4: Keep the minimum-width contract explicit**

Retain the existing `innerWidth === 900` guard, but remove the comment that accepts hidden overflow as “acceptable” for this requirement. The test should now reject clipped nested overflow rather than explicitly ignoring it.

- [ ] **Step 5: Run the resize-only coverage**

Run: `pnpm --dir apps/desktop exec playwright test tests/accessibility_and_resize.spec.ts --grep "Resize Hardening"`

Expected: PASS at 900px with stronger overflow checks.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/tests/accessibility_and_resize.spec.ts
git commit -m "test: harden 900px resize coverage for nested structured overflow"
```

---

### Task 5: Cover Escape dismissal and keyboard submit in accessibility workflows

**Files:**
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`
- Modify if needed: `apps/desktop/src/ui/components/Modal.test.tsx`
- Verify for context: `apps/desktop/src/ui/App.tsx`
- Verify for context: `apps/desktop/src/ui/components/Modal.tsx`

- [ ] **Step 1: Find a stable dismissible modal path reachable in tests**

Inspect current flows that use `dismissible: true` and can be triggered deterministically from Playwright. If no stable E2E path exists, document that and cover Escape behavior in `Modal.test.tsx` instead.

Run: `rg -n "dismissible: true|dismissible = true|onCancel" apps/desktop/src/ui apps/desktop/tests`

Expected: determine whether a real dismissible modal can be exercised in Playwright without broad fixture work.

- [ ] **Step 2: Add keyboard-submit E2E coverage**

In `accessibility_and_resize.spec.ts`, add a test that:
- opens the spell editor in a valid state,
- focuses a non-name field,
- presses Enter,
- verifies the same outcome as activating `btn-save-spell`.

This complements Task 1’s unit coverage with an accessibility workflow check.

- [ ] **Step 3: Add Escape dismissal coverage using the best reachable layer**

Preferred: Playwright test on a real dismissible modal path.

Fallback: `Modal.test.tsx` unit coverage that verifies:
- pressing Escape on a dismissible modal triggers `onRequestClose`,
- pressing Escape on a non-dismissible modal does not close it.

If the fallback is used, update the Playwright spec comments so they no longer read as an accepted permanent gap.

- [ ] **Step 4: Run the focused test suites**

Run one or both:
- `pnpm --dir apps/desktop exec playwright test tests/accessibility_and_resize.spec.ts --grep "Keyboard navigation|Accessibility"`
- `pnpm --dir apps/desktop test -- --runInBand src/ui/components/Modal.test.tsx`

Expected: PASS, with direct coverage for the remaining plan-required keyboard paths.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/tests/accessibility_and_resize.spec.ts apps/desktop/src/ui/components/Modal.test.tsx
git commit -m "test: cover keyboard accessibility gaps for submit and escape"
```

---

### Task 6: Final verification and review artifact update

**Files:**
- Verify: `apps/desktop/src/ui/SpellEditor.tsx`
- Verify: `apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx`
- Verify: `apps/desktop/tests/accessibility_and_resize.spec.ts`
- Verify: `apps/desktop/src/ui/components/Modal.test.tsx`
- Verify: `apps/desktop/src/ui/SpellEditor.test.tsx`
- Verify: `apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx`

- [ ] **Step 1: Run the full targeted verification set**

Run:

```bash
pnpm --dir apps/desktop test -- --runInBand src/ui/SpellEditor.test.tsx src/ui/components/structured/MagicResistanceInput.test.tsx src/ui/components/Modal.test.tsx
pnpm --dir apps/desktop exec playwright test tests/accessibility_and_resize.spec.ts
```

Expected:
- all targeted unit tests PASS,
- accessibility and resize Playwright coverage PASS,
- no new failures around save, modal focus, or structured editor accessibility.

- [ ] **Step 2: Spot-check for accidental contract drift**

Run: `rg -n "btn-save-spell|spell-save-validation-hint|magic-resistance-part-ids|modal-dialog" apps/desktop/src apps/desktop/tests`

Expected: existing test ids remain intact.

- [ ] **Step 3: Update the review report status manually if your workflow requires it**

Do not rewrite the findings. If your team tracks remediation inline, add a follow-up note in the appropriate issue/PR instead of mutating the original review evidence.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/components/structured/MagicResistanceInput.tsx apps/desktop/src/ui/SpellEditor.test.tsx apps/desktop/src/ui/components/structured/MagicResistanceInput.test.tsx apps/desktop/src/ui/components/Modal.test.tsx apps/desktop/tests/accessibility_and_resize.spec.ts
git commit -m "test: verify chunk 5 accessibility remediation"
```

---

## Notes for the Implementer

- Keep fixes scoped to the five findings in `openspec/changes/add-spell-ui-design-and-accessibility/chunk-5-review-report.md`.
- Do not rename existing test IDs used by broader Playwright coverage.
- Prefer visible `<label>` plus `aria-describedby`; only add new `aria-label` values when the visible label truly cannot serve as the accessible name.
- The modal behavior goal is resilient tests, not proving a particular DOM attribute exists.
- The resize goal is not just “no page scrollbar”; it is “no clipped or overflowing structured editing UI at 900px.”

## Plan Review

The `writing-plans` skill normally calls for a plan-document review subagent. I did not dispatch one here because this session’s tool policy only permits `spawn_agent` when the user explicitly asks for delegation/subagents.
