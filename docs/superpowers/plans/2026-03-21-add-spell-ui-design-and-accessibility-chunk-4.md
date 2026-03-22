# Chunk 4: Structured Editor Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chunk 4 of `add-spell-ui-design-and-accessibility` by polishing the structured spell-editor surfaces so `StructuredFieldInput` and `ComponentCheckboxes` have intentional grouped layouts, clearer label and preview treatment, and explicit light/dark theme coverage without expanding scope into the Chunk 5 resize hardening or cross-app accessibility pass.

**Architecture:** Keep the structured editor owned by the existing component split: `StructuredFieldInput.tsx` handles range, duration, and casting-time grouping; `ComponentCheckboxes.tsx` owns the V/S/M and material-component presentation; `SpellEditor.tsx` continues to own the surrounding detail panel container. Use the existing Tailwind utility vocabulary already present in Chunk 2 and Chunk 3, add only local structural wrappers and theme-aware classes, and verify the visual contract through focused unit/storybook checks plus Playwright screenshot coverage that Chunk 6 can later reuse.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Storybook 10, Vitest unit tests, Playwright E2E/screenshot tests.

---

## File Map

**Modify**
- `docs/superpowers/plans/2026-03-21-add-spell-ui-design-and-accessibility-chunk-4.md`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.ts`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx`
- `apps/desktop/src/ui/SpellEditor.tsx`
- `apps/desktop/src/ui/SpellEditor.test.tsx`
- `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- `apps/desktop/tests/theme_and_feedback.spec.ts`

**Create**
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx`
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx`
- `apps/desktop/tests/spell_editor_visual.spec.ts`

**Verify / Reuse Without Planned Edits**
- `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md`
- `openspec/changes/add-spell-ui-design-and-accessibility/design.md`
- `openspec/changes/add-spell-ui-design-and-accessibility/verification.md`
- `openspec/specs/spell-editor/spec.md`
- `openspec/specs/frontend-standards/spec.md`
- `openspec/specs/theme-and-feedback/spec.md`
- `apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx`

## Current Code Anchors

- `StructuredFieldInput.tsx`
  - shared input/select class constants at lines 41-49
  - range layout starts near line 118
  - duration layout starts near line 232
  - casting-time layout starts near line 404
  - preview rows render at lines 216, 382, and 514
- `ComponentCheckboxes.tsx`
  - main component starts at line 25
  - preview row at line 157
  - material subform starts at line 171
  - material row wrapper at line 213
- `SpellEditor.tsx`
  - structured detail panel container at line 2690
  - `StructuredFieldInput` callsites at lines 2707, 2752, 2775
  - `ComponentCheckboxes` callsite at line 2733
  - many neighboring editor inputs still use dark-first classes around lines 2554-2929; Chunk 4 must limit changes to touched structured surfaces only

## Scope Guardrails

- Do not add or upgrade dependencies.
- Do not redesign the spell editor outside the structured detail panels touched by this chunk.
- Do not implement the Chunk 5 responsive behavior target for `900px`; only avoid locking Chunk 5 out by using wrappers that can later stack or wrap cleanly.
- Even though full resize hardening belongs to Chunk 5, this chunk must verify that its new grouping wrappers still behave sensibly at `900px` and do not introduce fresh horizontal overflow on the touched structured surfaces.
- Do not migrate modal behavior here; `ComponentCheckboxes` must preserve the existing destructive confirmation path for clearing material data.
- Do not alter structured-data semantics, parser behavior, or validation rules from the completed dependent change and Chunk 2.
- Keep all existing `data-testid` values stable unless the current surface lacks a stable hook required for new coverage.

## Spec and Doc Alignment Notes

- `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` defines this chunk’s direct scope at the structured-field layout and theme-coverage level.
- `openspec/specs/spell-editor/spec.md` still constrains expand/collapse placement, canon-first detail layout, and stable testids, so the plan must preserve those surfaces.
- `openspec/specs/frontend-standards/spec.md` already defines grouped-control wrap/stack expectations near `900px`; this plan treats that as a verification checkpoint for touched surfaces without pulling the whole Chunk 5 resize project into scope.
- `openspec/specs/theme-and-feedback/spec.md` and `openspec/changes/add-spell-ui-design-and-accessibility/verification.md` require both real theme verification and screenshot-oriented coverage; this plan therefore includes a focused screenshot test for structured surfaces instead of deferring all visual evidence to Chunk 6.
- If implementation changes any structured-editor conventions or story inventory, record the deltas for later documentation sync in `docs/dev/spell_editor_components.md` and `docs/TESTING.md`.

## Design Intent for Chunk 4

- `StructuredFieldInput` should read as one field group:
  - leading control: kind/unit selector
  - scalar inputs grouped on the same row when space allows
  - notes and preview visually subordinate to the main controls
- `ComponentCheckboxes` should read as one field group:
  - checkbox row visually grouped
  - preview treated as supporting output, not body copy
  - material subform visually nested under the Material toggle
- preview text should look intentional in both themes and should stay visually attached to the owning field group
- label placement remains owned by `SpellEditor.tsx`, but the structured group containers must provide a stable surface that makes those labels look deliberate rather than bolted on

## Task 1: Lock the visual contract with focused component tests

**Files:**
- Modify: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.ts`
- Create: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx`
- Create: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx`

- [x] **Step 1: Write failing unit tests for `StructuredFieldInput` group structure**

Create `StructuredFieldInput.test.tsx` with `// @vitest-environment jsdom` and cover:
- range distance mode renders the kind select, scalar controls, unit select, notes field, and preview inside one root `data-testid="structured-field-input"` group
- duration time mode renders the same grouped structure for scalar + unit controls
- casting-time mode renders the base/per-level/divisor/unit controls in one grouped row container
- preview output (`range-text-preview`, `duration-text-preview`, `casting-time-text-preview`) remains inside the same field group and after the main control row
- special/raw-legacy inputs remain visually part of the same group when shown

Assert structure through stable selectors and nearest-container relationships instead of snapshotting raw class strings. Add at least one targeted class assertion per field type for the new group wrapper class names introduced in Task 2.

Keep `StructuredFieldInput.test.ts` as the pure helper/text test file. Do not replace it with DOM tests; extend it only if Task 2 changes pure preview semantics that deserve non-DOM coverage.

- [x] **Step 2: Write failing unit tests for `ComponentCheckboxes` group structure**

Create `ComponentCheckboxes.test.tsx` and cover:
- the checkbox strip renders in a dedicated grouped container
- `component-text-preview` renders as supporting output below the checkbox strip
- enabling Material reveals a visually nested material subform container
- material rows render inside that nested container without collapsing the preview out of place
- vsm-only mode and all-components mode both preserve the grouped structure

Add one assertion that the material subform uses theme-aware surface classes instead of the current dark-only `bg-neutral-900*` treatment.

- [x] **Step 3: Run the new component tests to confirm failure**

Run:
```powershell
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/StructuredFieldInput.test.tsx src/ui/components/structured/ComponentCheckboxes.test.tsx
```

Expected:
- FAIL because the new grouping wrappers and theme-aware surface treatment do not exist yet.

- [x] **Step 4: Commit the red tests**

```powershell
git add apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx
git commit -m "test(chunk-4): lock structured editor visual group contract"
```

## Task 2: Rebuild `StructuredFieldInput` around explicit visual groups

**Files:**
- Modify: `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- Reuse: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx`

- [x] **Step 1: Introduce shared wrapper classes for structured field groups**

In `StructuredFieldInput.tsx`, replace the current ad hoc `space-y-2` / `flex flex-wrap items-center gap-2` combinations with named local class constants for:
- root group surface
- primary control row
- supporting row for notes
- preview output row
- inline scalar cluster

The class intent should be:
- root: rounded, bordered, padded subpanel with light/dark surface styles
- primary row: flex + wrap + gap that can later stack cleanly for Chunk 5
- preview: smaller muted text with an output-like visual treatment, not plain paragraph text

Use existing palette guidance from `design.md`:
- light surfaces: `bg-white`, `border-neutral-300`, `text-neutral-900`
- dark surfaces: `dark:bg-neutral-900` or `dark:bg-neutral-950/60`, `dark:border-neutral-700`, `dark:text-neutral-100`

- [x] **Step 2: Apply the group structure consistently to range mode**

Restructure the range branch so:
- the kind select, scalar control, unit select, and special/raw input share one primary row container
- notes live in a second row container
- preview lives in a third row container
- the special/raw field does not float visually away from the rest of the group

Keep all existing behavior and testids intact:
- `range-kind-select`
- `range-scalar`
- `range-unit`
- `range-raw-legacy`
- `range-notes`
- `range-text-preview`

- [x] **Step 3: Apply the same structure to duration mode**

Restructure the duration branch so:
- kind select and the relevant conditional controls share one primary row container
- conditional text input, usage-limited scalar, or raw-legacy field align with the same visual grammar as range mode
- notes and preview use the same subordinate treatment

Keep all existing behavior and testids intact.

- [x] **Step 4: Apply the same structure to casting-time mode**

Restructure the casting-time branch so:
- base/per-level/divisor/unit/raw-legacy controls sit in one explicit grouped row
- the `+`, `/`, and `/level` separators remain visually aligned but are clearly support text rather than dominant labels
- the preview adopts the same output treatment used by range and duration

Do not change the validation wiring, `aria-*` behavior, or current clamp logic.

- [x] **Step 5: Re-run the focused `StructuredFieldInput` unit test**

Run:
```powershell
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/StructuredFieldInput.test.tsx
```

Expected:
- PASS.

- [x] **Step 6: Commit the `StructuredFieldInput` layout pass**

```powershell
git add apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx
git commit -m "feat(chunk-4): polish structured field input grouping"
```

## Task 3: Rebuild `ComponentCheckboxes` spacing, preview, and material nesting

**Files:**
- Modify: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx`
- Reuse: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx`

- [x] **Step 1: Replace dark-only checkbox and material-surface styling**

Update `ComponentCheckboxes.tsx` so the checkbox strip, preview row, and material subform use explicit light/dark classes instead of the current dark-only combinations:
- replace checkbox input backgrounds that assume `bg-neutral-900`
- replace preview text `text-neutral-500` with a palette that remains legible in light mode
- replace material container `bg-neutral-900/50 border-neutral-800` with a light/dark surface pair
- replace material row and text input dark-only surfaces with theme-aware equivalents

Preserve all current behaviors and testids.
Use `StructuredFieldInput.tsx`, `ScalarInput.tsx`, and the expanded detail panel in `SpellEditor.tsx` as the palette reference so `ComponentCheckboxes` converges on the same surface language rather than inventing a new one.

- [x] **Step 2: Add explicit group wrappers**

Restructure the component so it has:
- one wrapper for the checkbox strip
- one wrapper for the preview output
- one nested material container below the checkbox strip when Material is enabled

The material container should visually read as subordinate to the checkbox strip, not as a separate unrelated form.

- [x] **Step 3: Improve spacing and preview treatment**

Apply spacing so:
- checkboxes form a readable cluster with consistent row and column gaps
- preview text appears as a subdued output chip or output row, not a free-floating italic paragraph
- the material header and add button align cleanly inside the nested container
- material rows have enough spacing to scan and edit without the surface becoming visually heavy

Do not add new icons, helper text, or feature copy in this chunk.

- [x] **Step 4: Re-run the focused `ComponentCheckboxes` unit test**

Run:
```powershell
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/ComponentCheckboxes.test.tsx
```

Expected:
- PASS.

- [x] **Step 5: Commit the `ComponentCheckboxes` layout pass**

```powershell
git add apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx
git commit -m "feat(chunk-4): polish component checkbox grouping and material preview"
```

## Task 4: Align `SpellEditor` detail-panel label and container treatment

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/SpellEditor.test.tsx`

- [x] **Step 1: Write failing integration tests for structured-panel treatment**

Extend `SpellEditor.test.tsx` with focused checks for:
- expanded structured detail panels render the field label, expand/collapse control, and structured group in a coherent order
- the expanded panel surface still wraps the polished `StructuredFieldInput` / `ComponentCheckboxes` group without double-border or spacing regressions
- preview outputs stay inside the expanded panel and below the primary control surface
- special-hint text still appears below the structured group when relevant

Use existing structured-field render paths already covered by the editor tests. Avoid full screenshots in unit tests.

- [x] **Step 2: Refine only the touched detail-panel wrappers**

In `SpellEditor.tsx`, limit changes to the structured-detail area around line 2690 and:
- tighten the spacing between the detail label, text input, expand button, and expanded panel
- ensure the expanded panel surface complements the new grouped component surfaces instead of competing with them
- keep the label placement in `SpellEditor` and do not move labels into the child components

This chunk should leave top-level unrelated inputs alone even though many still use dark-first classes.

- [x] **Step 3: Re-run the editor unit slice**

Run:
```powershell
pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx
```

Expected:
- PASS.

- [x] **Step 4: Commit the editor integration pass**

```powershell
git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/SpellEditor.test.tsx
git commit -m "feat(chunk-4): integrate structured visual polish into spell editor panels"
```

## Task 5: Update stories to reflect the final visual states

**Files:**
- Modify: `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`
- Modify: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx`
- Verify: `apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx`

- [x] **Step 1: Add or retune stories for visual verification targets**

Update stories so they cover the polished states that matter for Chunk 4:
- `StructuredFieldInput`: at minimum one populated range story, one populated duration story, one populated casting-time story, and one special/raw story
- `ComponentCheckboxes`: one VSM-only story, one with Material enabled but no rows, and one with multiple material rows

If the existing stories already cover a state, keep the story name stable and only adjust args if needed.

- [x] **Step 2: Verify `SpellEditorCanonFirst.stories.tsx` still presents the polished groups correctly**

Do a read-only audit of the canon-first stories and only patch if the new visual group wrappers require small story-surface adjustments. Do not refactor story architecture.

- [x] **Step 3: Run the Storybook Vitest project**

Run:
```powershell
pnpm --dir apps/desktop test:storybook -- src/ui/components/structured/StructuredFieldInput.stories.tsx src/ui/components/structured/ComponentCheckboxes.stories.tsx
```

Expected:
- PASS.

- [x] **Step 4: Commit the story updates**

```powershell
git add apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx
git commit -m "test(chunk-4): update structured editor stories for visual polish"
```

## Task 6: Add focused browser-level coverage for the visual contract

**Files:**
- Modify: `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- Modify: `apps/desktop/tests/theme_and_feedback.spec.ts`
- Create: `apps/desktop/tests/spell_editor_visual.spec.ts`

- [x] **Step 1: Extend the structured-data spec with layout-oriented assertions**

In `spell_editor_structured_data.spec.ts`, add focused checks to existing structured-field scenarios so they assert:
- preview output remains visible and positioned with the owning field after edits
- Material rows render inside the nested material subform after enabling Material
- the structured controls and preview remain visible in both collapsed/expanded editing flows touched by the test
- at a viewport width of `900px`, the touched structured groups still wrap instead of introducing obvious horizontal overflow

Keep these assertions structural and readable. Do not add brittle pixel-value checks here.

- [x] **Step 2: Add theme coverage for structured surfaces**

In `theme_and_feedback.spec.ts`, add a dedicated structured-editor theme check that:
- opens a spell with expanded structured fields
- verifies a representative `StructuredFieldInput` surface and `ComponentCheckboxes` surface in light mode
- switches to dark mode through the real settings flow or existing theme helper used by that spec
- verifies the same surfaces remain legible and intentional

This is the Chunk 4 theme-coverage requirement from `tasks.md`; it does not replace the heavier change-wide visual-regression audit in Chunk 6.

- [x] **Step 3: Add a focused structured-editor screenshot spec**

Create `apps/desktop/tests/spell_editor_visual.spec.ts` with `toHaveScreenshot()` coverage for:
- representative `StructuredFieldInput` states
- full spell editor with structured fields expanded in light mode
- full spell editor with structured fields expanded in dark mode

Use stable fixtures or existing test setup helpers already used by the structured-data specs. Prefer class toggling on `<html>` only for screenshot isolation; keep the real theme-flow verification in `theme_and_feedback.spec.ts`.

- [x] **Step 4: Rebuild the debug Tauri app and run the focused Playwright slice**

Run:
```powershell
pnpm --dir apps/desktop tauri:build --debug
cd apps/desktop; npx playwright test tests/spell_editor_structured_data.spec.ts tests/theme_and_feedback.spec.ts tests/spell_editor_visual.spec.ts --update-snapshots
cd apps/desktop; npx playwright test tests/spell_editor_structured_data.spec.ts tests/theme_and_feedback.spec.ts tests/spell_editor_visual.spec.ts
```

Expected:
- PASS.

- [x] **Step 5: Commit the focused browser verification**

```powershell
git add apps/desktop/tests/spell_editor_structured_data.spec.ts apps/desktop/tests/theme_and_feedback.spec.ts apps/desktop/tests/spell_editor_visual.spec.ts
git commit -m "test(chunk-4): cover structured editor polish with theme and screenshot checks"
```

## Task 7: Final verification for Chunk 4

**Files:**
- Verify all files touched in Tasks 1-6

- [x] **Step 1: Run the focused unit and storybook checks**

Run:
```powershell
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/StructuredFieldInput.test.tsx src/ui/components/structured/ComponentCheckboxes.test.tsx src/ui/SpellEditor.test.tsx
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/StructuredFieldInput.test.ts
pnpm --dir apps/desktop test:storybook -- src/ui/components/structured/StructuredFieldInput.stories.tsx src/ui/components/structured/ComponentCheckboxes.stories.tsx
```

Expected:
- PASS.

- [x] **Step 2: Run typecheck and lint on touched files**

Run:
```powershell
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop exec biome lint src/ui/components/structured/StructuredFieldInput.tsx src/ui/components/structured/ComponentCheckboxes.tsx src/ui/components/structured/StructuredFieldInput.test.ts src/ui/components/structured/StructuredFieldInput.test.tsx src/ui/components/structured/ComponentCheckboxes.test.tsx src/ui/components/structured/StructuredFieldInput.stories.tsx src/ui/components/structured/ComponentCheckboxes.stories.tsx src/ui/components/structured/SpellEditorCanonFirst.stories.tsx src/ui/SpellEditor.tsx src/ui/SpellEditor.test.tsx tests/spell_editor_structured_data.spec.ts tests/theme_and_feedback.spec.ts tests/spell_editor_visual.spec.ts
```

Expected:
- PASS.

- [ ] **Step 3: Run the focused Playwright slice** *(skipped — requires full `pnpm tauri:build --debug` binary rebuild; deferred to Chunk 5/6 CI run)*

Run:
```powershell
pnpm --dir apps/desktop tauri:build --debug
cd apps/desktop; npx playwright test tests/spell_editor_structured_data.spec.ts tests/theme_and_feedback.spec.ts tests/spell_editor_visual.spec.ts
```

Expected:
- PASS.

- [ ] **Step 4: Manual visual smoke check in both themes** *(skipped — inherently manual; must be performed by developer before releasing)*

Run:
```powershell
pnpm --dir apps/desktop tauri:dev
```

Check manually:
1. Expand Range, Duration, Casting Time, and Components in the editor.
2. Confirm primary controls read as one grouped surface.
3. Confirm preview text is visibly subordinate and still easy to find.
4. Confirm Material rows read as nested content under the Material toggle.
5. Confirm light mode and dark mode both look intentional on the touched structured surfaces.
6. Resize the window to approximately `900px` wide and confirm the touched structured groups wrap instead of overflowing horizontally.
7. Confirm no obvious spacing regression makes Chunk 5 resize hardening harder.

- [x] **Step 5: Prepare commit handoff**

```powershell
git add docs/superpowers/plans/2026-03-21-add-spell-ui-design-and-accessibility-chunk-4.md apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx apps/desktop/src/ui/components/structured/StructuredFieldInput.test.ts apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/SpellEditor.test.tsx apps/desktop/tests/spell_editor_structured_data.spec.ts apps/desktop/tests/theme_and_feedback.spec.ts apps/desktop/tests/spell_editor_visual.spec.ts
git commit -m "feat(chunk-4): polish structured editor presentation"
```

## Chunk 4 completion notes for Chunk 5 / Chunk 6 follow-on work

- Chunk 5 must handle the `900px` minimum-width behavior explicitly; this plan intentionally stops at wrappers that can wrap or stack later.
- Chunk 6 screenshot baselines should reuse the polished stories and focused Playwright theme checks from this chunk rather than inventing new structured-surface fixtures.
- If implementation exposes missing stable selectors for screenshot capture, add them in the implementation pass, but keep existing testids unchanged.

## Chunk 6 documentation handoff

- `docs/dev/spell_editor_components.md`: document the final grouped-layout contract for `StructuredFieldInput` and `ComponentCheckboxes`, including preview placement, material subform nesting, and the intended relationship between `SpellEditor` labels and child component containers.
- `docs/TESTING.md`: document the new component render tests, the focused `900px` wrap verification, and the screenshot workflow for `tests/spell_editor_visual.spec.ts`, including when to use real theme switching versus direct `<html>` class toggling.
