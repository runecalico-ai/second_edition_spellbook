# Code review: Chunk 6 — Test Migration and Verification

**Change:** `add-spell-ui-design-and-accessibility`  
**Plan source:** `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` — **Chunk 6 only** (lines 206–280).  
**Review date:** 2026-04-04  
**Method:** Three sequential read-only reviewer passes (spec completeness, spec accuracy, edge cases & gaps), merged and triaged below. No application source files were modified.

---

## Summary

**Total: 10 findings — 0 Critical, 1 High, 5 Medium, 4 Low**

---

## Findings

### Critical

*(None. No evidence that migrated validation paths still incorrectly depend on post-save `handleCustomModal` for routine inline errors, or that core Chunk 6 workflows are absent.)*

### High

**[H-001] (72) — Contradiction between migration bullet and preserved-modal bullet for `Save Error`**

**Plan ref:** `tasks.md` Chunk 6 **“Migrate affected existing tests”**: `spell_editor_canon_first.spec.ts` lines 575–583: “`<dialog>` ‘Save Error’ heading -> replace `<dialog>` check with inline error assertion, remove `handleCustomModal`” **vs** **“Transient feedback and modal-boundary verification”**: “Modal usage remains reserved for destructive confirmations, blocking choices, and **rare high-severity errors** in the touched flows.”

**Location:** `apps/desktop/tests/spell_editor_canon_first.spec.ts` (~589–616): test `Backend Save Error modal: Quest spell with Wizard-only classes still rejected by server` — expects `role="dialog"`, heading “Save Error”, and `handleCustomModal(page, "OK")`. Separate step (~572–586) correctly asserts **client** epic restriction with **no** validation dialog.

**Detail:** The implementation keeps a **server-side** `Save Error` modal, which matches the preserved-modal intent and `README.md` (“Real backend save failures surface as a **Save Error** modal”) but **does not** satisfy a literal reading of the migration line that calls for removing that dialog check. The fix step should **reconcile the plan text** (clarify that routine/client validation is inline; backend rejection may remain modal) so tasks and tests are not read as conflicting.

### Medium

**[M-001] (48) — “Animate” in conditional field transitions is not verified**

**Plan ref:** Chunk 6 **“End-to-end workflows”**: “Conditional field transitions **animate** and collapse cleanly when controlling fields change.”

**Location:** `apps/desktop/tests/spell_editor_canon_first.spec.ts`, `spell_editor_structured_data.spec.ts`, `spell_editor_save_workflow.spec.ts` (conditional tradition/school/sphere and expand/collapse behavior); `apps/desktop/tests/spell_editor_visual.spec.ts` (`animations: "disabled"` on screenshots).

**Detail:** Tests assert DOM state, values, and visibility/collapse outcomes, not **motion** (e.g. transition end, reduced-motion, or layout stability during animation). The **animate** portion of the requirement is untested.

**[M-002] (44) — Screen-reader / ARIA validation contract is only fully exercised for spell name**

**Plan ref:** Chunk 6 **“Accessibility verification”**: “Screen reader validation announcements verify the chosen error-announcement model behaves **consistently** and error text is associated with the **owning field**.”

**Location:** `apps/desktop/tests/accessibility_and_resize.spec.ts` (~467–515): `invalid spell-name field exposes aria-invalid and aria-describedby…`. Migrated inline errors elsewhere use `error-school-required-*`, `error-sphere-required-*`, `error-tradition-conflict`, etc. (`spell_editor_structured_data.spec.ts`, `spell_editor_save_workflow.spec.ts`) without parallel `aria-invalid` / `aria-describedby` E2E checks.

**Detail:** **Consistency** of the announcement/association model across those fields is assumed, not proven in E2E. Real screen reader behavior (NVDA/JAWS) is also outside Playwright’s scope unless documented as manual QA.

**[M-003] (40) — Hash copy: “without shifting focus” is not fully asserted**

**Plan ref:** Chunk 6 **“Transient feedback and modal-boundary verification”**: “Clipboard copy success is announced through the toast/live-region channel **without shifting focus**.”

**Location:** `apps/desktop/tests/theme_and_feedback.spec.ts` (~315–348): notification viewport, `aria-live`, toast text, auto-dismiss, `expectNoBlockingDialog()`.

**Detail:** There is no **before/after `activeElement`** assertion on `spell-detail-hash-copy` (or equivalent) to prove focus did not move into the toast stack. Save success explicitly checks dismiss control is not focused (`spell_editor_save_workflow.spec.ts` ~230); hash copy does not mirror that pattern.

**[M-004] (36) — `modal_review.md` preservation is not systematically enforced in tests**

**Plan ref:** Chunk 6 **“Transient feedback and modal-boundary verification”**: “Verify **preserved dialogs identified in `modal_review.md`** remain modal after the modal implementation changes.”

**Location:** `apps/desktop/tests/accessibility_and_resize.spec.ts` (Vault maintenance focus trap; Unsaved changes `showModal` / focus); `spell_editor_structured_data.spec.ts` (import rejection `dialog[open][data-testid='modal-dialog']`); other flows listed in `modal_review.md` not shown to have matching E2E modality checks.

**Detail:** Coverage is **partial** and **not traceable** to the full `modal_review.md` inventory in CI. Regressions on less-tested modals would not be caught by the current matrix alone.

**[M-005] (32) — Theme live-region wording vs first-load / guard behavior**

**Plan ref:** Chunk 6 **“Real theme and feedback verification”**: “Verify the theme change announcement is emitted through the hidden live region **without** showing a visible toast.”

**Location:** `apps/desktop/tests/theme_and_feedback.spec.ts` (test “follows the current system preference on first load…”, comments ~295–298 about empty live region until a real transition).

**Detail:** On cold start in system mode, the live region may remain **empty** until a transition — consistent with implementation comments but **narrow** readings of “theme change announcement” could expect an immediate announcement. Worth aligning plan wording or test/docs so first-load is explicitly in scope.

### Low

**[L-001] (22) — Chunk 6 documentation checkboxes in `tasks.md` still unchecked**

**Plan ref:** Chunk 6 **“Application documentation updates”** through **“Visual Regression”** (`tasks.md` ~214–219, ~241–279) — all listed as `[ ]`.

**Location:** `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md`.

**Detail:** Repo `docs/user/spell_editor.md`, `README.md`, `docs/dev/spell_editor_components.md`, `docs/TESTING.md`, and `docs/ARCHITECTURE.md` already contain substantial content aligned with those bullets. **Tracking** in the change file is out of sync with the repo (process/completion signal gap).

**[L-002] (20) — Stale line-number anchors in the migration checklist**

**Plan ref:** Chunk 6 **“Migrate affected existing tests”** and **“Safe, unchanged modal coverage”** (`tasks.md` ~224–236) citing specific file lines.

**Location:** Current `apps/desktop/tests/spell_editor_structured_data.spec.ts` (e.g. validation cases moved; ~62+ is helper code); `handleCustomModal` for import at ~641, not ~629.

**Detail:** Anchors can mislead maintainers into thinking migration is incomplete or editing the wrong block. Update the plan to **test names** or current line ranges.

**[L-003] (18) — “Validation error handling” workflow is underspecified for exit criteria**

**Plan ref:** Chunk 6 **“End-to-end workflows”**: “Test: **Validation error handling**.”

**Location:** Multiple specs (`spell_editor_save_workflow.spec.ts`, `spell_editor_structured_data.spec.ts`, others).

**Detail:** Coverage exists but is **distributed**; the single checkbox does not define which rules/traditions/fields must be included, making “done” **ambiguous** without cross-referencing other bullets.

**[L-004] (15) — StructuredFieldInput visual “states” scope**

**Plan ref:** Chunk 6 **“Visual Regression”**: “Screenshot test: **StructuredFieldInput states**.”

**Location:** `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx` (`VisualGallery` / `VisualGalleryDark`); `apps/desktop/tests/spell_editor_visual.spec.ts` (Storybook screenshots).

**Detail:** The gallery showcases multiple **filled / kind** variants (range, duration, casting time). The plan does not enumerate **empty / focused / error / disabled** tiles; if those states were intended as part of “states,” the Storybook gallery may be **incomplete** relative to an unstated matrix.

---

## Positive alignment (brief)

- **Migration pattern:** `spell_editor_structured_data.spec.ts` uses inline `expectFieldError` / `expectNoBlockingDialog` for the listed validation testids; import rejection and nav-guard modals retain `handleCustomModal` per out-of-scope / preserved-dialog rules.
- **`epic_and_quest_spells.spec.ts`:** Inline `error-epic-arcane-class-restriction`; `handleCustomModal` only for **Unsaved changes** after cancel — matches preserved-dialog guidance.
- **`spell_editor_canon_first.spec.ts`:** Client epic restriction path asserts no dialog; unsaved flows still use modals.
- **Workflows:** `spell_editor_save_workflow.spec.ts` covers first spell from empty library, empty search, empty character spellbook, legacy import edit/upgrade, keyboard save, first-failed-submit focus, delayed save label, modal boundaries.
- **Theme / feedback / visuals:** `theme_and_feedback.spec.ts`, `spell_editor_visual.spec.ts`, and `accessibility_and_resize.spec.ts` substantively address Chunk 6 theme, notification, keyboard settings, modal trap/focus return, and screenshot inventory.

---

## Report output

This file is the **input for the fix step** (plan reconciliation, test gaps, and checklist updates as appropriate).
