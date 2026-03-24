# Code Review — Chunk 4: Structured Editor Visual Polish
**Date:** 2026-03-24
**Branch:** add-spell-ui-design-and-accessibility
**Plan source:** `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` (Chunk 4)

Three independent review passes were run (Spec Completeness, Spec Accuracy, Edge Cases & Gaps). Findings were merged and deduplicated before classification.

---

## Summary

Total: **16 findings** — 2 Critical, 3 High, 6 Medium, 5 Low

---

## Findings

### Critical

**[C-001] (92) — Three structured editor components have no light-mode theming**
Plan ref: tasks.md Chunk 4 theme-and-feedback: "Verify the structured editor controls introduced or refined in this chunk remain legible and intentional in both light and dark modes."
Location: `apps/desktop/src/ui/components/structured/SavingThrowInput.tsx`, `DamageForm.tsx`, `MagicResistanceInput.tsx` — throughout
Detail: All three components use hardcoded dark-mode surface classes with zero light-mode counterparts. Every `input`, `select`, `textarea`, and container `div` uses patterns like `bg-neutral-900 border border-neutral-700 ... text-neutral-100` with no `dark:` prefix (i.e., these classes are applied unconditionally). In light mode the controls render near-black-on-near-black. Sub-field labels in `DamageForm.tsx` and `SavingThrowInput.tsx` use `text-neutral-500`, which is below the design.md minimum (`text-neutral-600`) for light surfaces. The annotation spans in all three files use `text-amber-200/70` on `bg-amber-900/10` — invisible in light mode. This is the core unfulfilled item of the chunk; the plan's checkbox for this task is explicitly unchecked. `StructuredFieldInput.tsx`, `ComponentCheckboxes.tsx`, `AreaForm.tsx`, and `ScalarInput.tsx` all implement the dual `bg-white dark:bg-neutral-900` pattern correctly; the three affected components do not.

**[C-002] (88) — Three structured editor components have zero test coverage**
Plan ref: tasks.md Chunk 4 library: "Define `StructuredFieldInput` layout … Define `ComponentCheckboxes` spacing and preview treatment." (by implication, all structured editor components introduced or refined in this chunk must be covered); design.md Verification Strategy: "Screenshot Isolation Verification … structured-input presentation states."
Location: `apps/desktop/src/ui/components/structured/SavingThrowInput.tsx`, `DamageForm.tsx`, `MagicResistanceInput.tsx` — no corresponding test files exist
Detail: There are no test files for `SavingThrowInput`, `DamageForm`, or `MagicResistanceInput`. All three are exported from `index.ts` and are full structured editor surfaces. Layout, DOM structure, `onChange` plumbing, and theme classes are entirely untested. The parallel components (`StructuredFieldInput`, `ComponentCheckboxes`) have both `.test.tsx` and `.test.ts` coverage; these three have none. Without tests, C-001 cannot be confirmed fixed by CI.

---

### High

**[H-001] (68) — `bg-neutral-950` used as a dark-mode background throughout — not in the palette**
Plan ref: tasks.md Chunk 4 theme-and-feedback: "Verify … legible and intentional in both light and dark modes." design.md palette: darkest sanctioned step is `dark:bg-neutral-900` (bg-base) / `dark:bg-neutral-800` (bg-surface) / `dark:bg-neutral-700` (bg-elevated).
Location:
- `StructuredFieldInput.tsx` line 51: `dark:bg-neutral-950/60` (structuredGroupSurfaceClass)
- `StructuredFieldInput.tsx` lines 56–59: `dark:bg-neutral-950/40` (supportingRow), `dark:bg-neutral-950/50` (previewRow)
- `ComponentCheckboxes.tsx` line 98: `dark:bg-neutral-950/60` (outer container)
- `ComponentCheckboxes.tsx` line 213: `dark:bg-neutral-950/60` (MaterialSubForm)
- `ComponentCheckboxes.tsx` line 171: `dark:bg-neutral-950/50` (preview `<output>`)
Detail: `neutral-950` is a step darker than the palette's darkest documented value. The alpha modifiers (`/60`, `/40`, `/50`) do not bring the value within the palette — they remain out-of-palette derivations. The same pattern appears in the preview and supporting row tests, which assert these values and would pass even though the values are wrong. The palette should be the normative source; all dark-surface backgrounds should use `dark:bg-neutral-800`, `dark:bg-neutral-900`, or `dark:bg-neutral-700` per the defined roles.

**[H-002] (62) — `border-neutral-500` on interactive inputs — not a named palette border role**
Plan ref: tasks.md Chunk 4 library: "horizontal grouping for scalar, unit, and related controls with existing spacing utilities." design.md palette: border roles are `border-neutral-300` (border) and `border-neutral-400` (border-strong) in light mode.
Location:
- `StructuredFieldInput.tsx` lines 42–47: `structuredSelectClass`, `structuredInputClass`, `structuredTextAreaClass` all use `border-neutral-500`
- `ScalarInput.tsx` line 19: `inputBorderNeutral = "border-neutral-500 dark:border-neutral-700"`
- `ComponentCheckboxes.tsx`: checkbox input borders and material sub-form input borders
- `AreaForm.tsx` line 18: `areaSelectClass`
Detail: `border-neutral-500` is one step darker than the strongest palette entry for borders (`border-neutral-400` = border-strong). This is systematic across all interactive inputs in the structured editor. The dark counterpart (`dark:border-neutral-700`) is correct for the `border` role, but the light-mode border deviates upward without a named palette justification. All input borders should use `border-neutral-300` or `border-neutral-400` per their role.

**[H-003] (55) — No dark-mode story decorator in StructuredFieldInput or ComponentCheckboxes Storybook stories**
Plan ref: tasks.md Chunk 4 theme-and-feedback: "Verify … legible and intentional in both light and dark modes." design.md Verification Strategy: "Screenshot Isolation Verification … structured-input presentation states."
Location: `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`, `ComponentCheckboxes.stories.tsx`
Detail: No story in either file applies a dark-mode decorator (no `backgrounds` parameter, no `class: 'dark'` on `<html>`, no theme parameter). All stories render in light mode only. This means the Storybook visual catalogue provides zero evidence of dark-mode correctness for these components, and visual regression baselines (when captured) will only cover the light theme. A dark-class decorator or a dark-background story should be added to verify both modes per the plan requirement. Note also that `ComponentCheckboxes.stories.tsx` has no story for the `all` variant (Focus, DivineFocus, Experience checkboxes are never shown).

---

### Medium

**[M-001] (47) — ComponentCheckboxes `<output>` preview missing `aria-label`**
Plan ref: tasks.md Chunk 4 library: "Define `ComponentCheckboxes` … preview treatment."
Location: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` line 171
Detail: Every `<output>` in `StructuredFieldInput.tsx` carries an `aria-label` (e.g., "Computed range text", "Computed duration text"), and `StructuredFieldInput.test.tsx` line 54 asserts this via `getAttribute("aria-label")`. The `ComponentCheckboxes` preview `<output>` has no `aria-label`. This breaks the accessible name contract established by the sibling components and means AT users have no programmatic label for the component preview region.

**[M-002] (44) — AreaForm preview uses `<p>` instead of `<output>` — inconsistent semantic contract**
Plan ref: tasks.md Chunk 4 library: "Define label placement and container treatment for structured field groups."
Location: `apps/desktop/src/ui/components/structured/AreaForm.tsx` line 683
Detail: Every other structured field preview uses a semantic `<output>` element (`StructuredFieldInput.tsx` lines 245, 432, 580; `ComponentCheckboxes.tsx` line 170). `AreaForm` uses `<p>`. Using `<p>` breaks semantic consistency — an `<output>` has an implicit `status` role and indicates a computed result, which is the correct semantic for a live text preview. Tests for other components verify the element type as `OUTPUT`; there is no `AreaForm` test file at all, meaning this inconsistency is undetected by CI.

**[M-003] (42) — Label placement convention not codified within structured group components**
Plan ref: tasks.md Chunk 4 library: "Define label placement and container treatment for structured field groups."
Location: `StructuredFieldInput.tsx`, `SavingThrowInput.tsx`, `DamageForm.tsx`, `MagicResistanceInput.tsx`
Detail: The plan requires defining label placement as part of the structured group contract. The container treatment is well-defined (named constants like `structuredGroupSurfaceClass`). However, there is no `<legend>`, `<fieldset>`, heading, or visible label identifying the group (e.g., "Range", "Duration") within any structured field component — this responsibility is left to the parent form without documentation. The three untested components (`SavingThrowInput`, `DamageForm`, `MagicResistanceInput`) use small inline `text-[10px]` spans for sub-field labels but there is no standardized pattern shared across components.

**[M-004] (38) — StructuredFieldInput tests missing light-mode class assertions**
Plan ref: tasks.md Chunk 4 theme-and-feedback: "Verify … legible and intentional in both light and dark modes."
Location: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx` lines 12–25 (`ROOT_SURFACE_CLASSES`, `SUPPORTING_ROW_CLASSES`, `PREVIEW_ROW_CLASSES`)
Detail: `ROOT_SURFACE_CLASSES` asserts `border-neutral-500` and `dark:bg-neutral-950/60` but does not assert `bg-white` (the light-mode background, present at `StructuredFieldInput.tsx` line 51). `SUPPORTING_ROW_CLASSES` asserts the dark background but misses `border-neutral-200`. `PREVIEW_ROW_CLASSES` asserts `bg-neutral-50` but misses `border-neutral-200`. The light-mode `bg-white` assertion would directly verify the dual-mode contract that distinguishes these components from the unthemed ones (C-001).

**[M-005] (35) — ComponentCheckboxes tests missing light-mode class assertions and "all" variant preview content**
Plan ref: tasks.md Chunk 4 library: "Define `ComponentCheckboxes` … preview treatment."
Location: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx`
Detail: The test at line 277 (`"material subform uses theme-aware surface classes"`) asserts `dark:bg-neutral-950/60` and `border-neutral-500` but not `bg-white`. No test checks the root `component-checkboxes` container for `bg-white`. The preview `<output>` uses `bg-neutral-50` and `border-neutral-200` with no test assertions for those light-mode classes. Additionally, no test verifies the `all` variant preview text content — there is no test asserting that checking Focus emits `"F"`, DivineFocus emits `"DF"`, or Experience emits `"XP"`.

**[M-006] (29) — ComponentCheckboxes checkbox strip uses `gap-4` while all structured primary rows use `gap-2`**
Plan ref: tasks.md Chunk 4 library: "Define `ComponentCheckboxes` spacing … with existing spacing utilities."
Location: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` line 102
Detail: `structuredPrimaryControlRowClass` in `StructuredFieldInput.tsx` uses `gap-2`. The `component-checkbox-strip` div uses `gap-4`. The plan specifies "existing spacing utilities" and consistency with the structured layout. The deviation is undocumented; if intentional (checkboxes may warrant more breathing room), it should be reflected in a named spacing constant or comment.

---

### Low

**[L-001] (22) — AreaForm preview `text-neutral-500` on a white surface — likely below WCAG AA contrast**
Plan ref: tasks.md Chunk 4 theme-and-feedback: verify legibility in both modes. design.md note: "Any text currently using `text-neutral-400` or `text-neutral-500` on surfaces that will become light-theme visible should be reviewed carefully for contrast."
Location: `apps/desktop/src/ui/components/structured/AreaForm.tsx` line 683
Detail: `text-neutral-500` on `bg-white` is approximately 3.5:1 contrast ratio, below the WCAG AA threshold of 4.5:1 for normal text. The palette's sanctioned muted text is `text-neutral-600` (light) / `dark:text-neutral-400` (dark). The dark class is correct; only the light-mode class needs to move to `text-neutral-600`. `StructuredFieldInput.tsx` uses `text-neutral-600 dark:text-neutral-400` for muted text correctly.

**[L-002] (18) — Duration kind-only rendering branch untested in StructuredFieldInput**
Plan ref: tasks.md Chunk 4 library: "Define `StructuredFieldInput` layout: horizontal grouping for scalar, unit, and related controls."
Location: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx`
Detail: Duration kinds that require only the kind select (e.g., `permanent`, `until_dispelled`, `until_rest`, `variable`) are handled by the else-branch in the duration render (lines 299–307 of `StructuredFieldInput.tsx`). No test exercises these kinds. The DOM contract for the kind-only path (only the primary row with the select, no scalar/condition/raw-legacy inputs) is undefined in the test suite.

**[L-003] (16) — ComponentCheckboxes vsm normalization invariant not tested**
Plan ref: tasks.md Chunk 4 library: "Define `ComponentCheckboxes` spacing and preview treatment."
Location: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` lines 38–43; `ComponentCheckboxes.test.tsx`
Detail: When `variant="vsm"`, the `updateComponents` callback forces `focus`, `divineFocus`, and `experience` to `false`. There is no test that passes `variant="vsm"` with `focus: true` in the incoming `components` prop and then verifies `onChange` is called with those fields forced to `false`. This is a normalization contract with no test guard.

**[L-004] (14) — casting_time supporting-row absence not negatively asserted**
Plan ref: tasks.md Chunk 4 library: "Define `StructuredFieldInput` layout."
Location: `apps/desktop/src/ui/components/structured/StructuredFieldInput.test.tsx` lines 273–301
Detail: The `casting_time` render branch intentionally omits the supporting row (notes textarea). The test does not call `getSupportingRow()`, which is correct, but it does not assert `screen.queryByTestId("structured-field-supporting-row")` returns `null`. The absence is not contract-locked; an accidental addition would go undetected.

**[L-005] (12) — Placeholder contrast tokens untested**
Plan ref: tasks.md Chunk 4 library / theme-and-feedback: verify legibility.
Location: `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx` lines 238, 425
Detail: Notes textareas use `placeholder:text-neutral-500 dark:placeholder:text-neutral-400`. The dark placeholder is lighter than the light-mode placeholder (400 vs 500), which may be intentional but is the reverse of the typical pattern. No test in `StructuredFieldInput.test.tsx` asserts these placeholder token classes, so they are not part of the DOM contract.
