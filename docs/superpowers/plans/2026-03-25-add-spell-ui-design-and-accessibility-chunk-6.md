# Chunk 6: Test Migration and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chunk 6 of `add-spell-ui-design-and-accessibility` by finishing the change-wide test migration, adding the final end-to-end, accessibility, theme, feedback, and screenshot verification coverage, and updating the required user, overview/README, developer, testing, and architecture documentation to match the behavior delivered in Chunks 1-5.

**Architecture:** Chunk 6 is an integration-and-verification pass, not a feature-design pass. Keep behavior changes minimal: prefer test updates, reusable fixture/page-object extensions, screenshot baselines, and documentation edits. Only touch production code when verification exposes a missing stable selector, a missing accessibility hook, a minimal shared store/pre-hydration fix required for the covered flows, or a behavior gap that directly contradicts the frozen requirements below. Execute in this order: (1) migrate broken validation tests, (2) add missing workflow/accessibility/theme coverage, (3) capture screenshot baselines, (4) update docs to match the shipped behavior, (5) run the full verification matrix.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Vitest + React Testing Library, Playwright with the shared Tauri fixtures/page objects, Storybook stories reused for visual baselines, existing Zustand theme/notification stores, Markdown documentation.

---

## Frozen Requirements Snapshot

This section is intentionally self-contained so plan reviewers can evaluate the spec scope and required outputs without opening the spec files. Implementation steps may still name concrete repository details when those details are needed to execute the plan safely.

### Chunk 6 required outputs

1. Application documentation updates in exactly five repository docs files (this execution-plan file is bookkeeping, not part of the five-file docs deliverable):
   - `docs/user/spell_editor.md`
   - `README.md`
   - `docs/dev/spell_editor_components.md`
   - `docs/TESTING.md`
   - `docs/ARCHITECTURE.md`
2. Migration of existing spell/library E2E tests that still expect routine validation failures to appear in modal dialogs.
3. Final E2E coverage for:
   - new user creates first spell
   - legacy spell edit for basic fields
   - legacy spell structured-field upgrade
   - validation error handling
   - conditional field transitions reach the correct collapsed/expanded end state without leaving stale UI state behind
   - keyboard-only navigation
   - theme switching through `/settings`, including persistence across reload
   - empty library state
   - empty search state
   - empty character spellbook state
4. Accessibility verification for:
   - screen reader validation announcements and field association
   - preserved modal focus trap and focus return
5. Theme and feedback verification for:
   - theme store persistence and first-load behavior
   - hidden live-region theme announcement without visible toast
   - edited views in both light and dark themes
   - non-modal notifications that do not steal focus and stack correctly
   - clipboard copy success through toast/live-region rather than modal
   - modal usage reserved for destructive/blocking/high-severity flows
   - preserved dialogs remaining modal after the Chunk 5 `showModal()` migration
6. Visual regression baselines for:
   - `StructuredFieldInput` states
   - `SpellEditor` with all structured fields in dark mode
   - `SpellEditor` with all structured fields in light mode
   - empty library state in dark and light themes
   - hash display collapsed and expanded

### Frozen behavior from earlier chunks that Chunk 6 must verify, not redesign

- Routine validation errors are inline and identified by stable error testids such as `spell-name-error`, `error-school-required-arcane`, `error-school-required-arcane-tradition`, `error-sphere-required-divine`, `error-sphere-required-divine-tradition`, `error-epic-arcane-class-restriction`, and `error-tradition-conflict`.
- The first failed submit focuses the first invalid field.
- Arcane tradition shows School and unmounts Sphere; Divine tradition shows Sphere and unmounts School.
- Save progress uses a 300 ms threshold before the button text switches to `Saving…`.
- Save success navigates to Library and shows the global toast `Spell saved.`.
- Theme changes are announced through the hidden live region, not a visible toast.
- The hash card uses `spell-detail-hash-display`, `spell-detail-hash-copy`, and `spell-detail-hash-expand`.
- Empty-state CTAs use `empty-library-create-button`, `empty-library-import-button`, `empty-search-reset-button`, and `empty-character-add-spell-button`.
- `ModalShell` uses native `showModal()` / `close()` and keeps preserved dialogs modal.

### Explicit out-of-scope rules

- Do not redesign the spell editor or theme system.
- Do not change backend persistence semantics or parser behavior unless a failing Chunk 6 verification path proves a direct regression in touched flows.
- Do not migrate or alter character, vault, or import-flow modal tests except where the spec explicitly keeps them untouched.
- Do not replace preserved blocking/destructive dialogs with toasts.
- Do not add new dependencies.

### Preserved modal coverage that must remain unchanged

- Keep `apps/desktop/tests/spell_editor_canon_first.spec.ts` blocking `Unsaved changes` dialog coverage at the preserved lines called out by the spec.
- Keep the blocking dialog dismiss coverage in `apps/desktop/tests/spell_editor_structured_data.spec.ts` for the preserved cancel path.
- Leave character-flow, vault-flow, and import-rejection modal coverage out of scope.

---

## Repository Conventions For This Plan

- Command snippets that use shell variables, command substitution, or process substitution assume Bash (for example Git Bash). If the implementer executes from PowerShell instead, translate the command shape faithfully before relying on the result.
- Build before Playwright after code changes because the E2E suite launches the compiled app:
  - TypeScript-only changes: `cd apps/desktop && pnpm build`
  - Rust or uncertain changes: `cd apps/desktop && pnpm tauri:build --debug`
- Preferred E2E stack: Playwright with `tests/fixtures/test-fixtures.ts`, `tests/page-objects/SpellbookApp.ts`, and `fixtures/constants.ts` timeouts.
- Prefer `getByTestId`, then semantic Playwright locators. Do not introduce brittle CSS selectors when a stable testid or role can exist.
- Reuse the existing Storybook stories and existing Playwright visual spec instead of inventing a parallel screenshot harness.
- Keep all interactive elements discoverable with existing or added `data-testid` attributes if verification exposes a missing locator.

---

## File Map

**Modify: test migration / workflow / verification**
- `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
- `apps/desktop/tests/theme_and_feedback.spec.ts`
- `apps/desktop/tests/accessibility_and_resize.spec.ts`
- `apps/desktop/tests/spell_editor_visual.spec.ts`
- generated Playwright snapshot artifacts adjacent to `apps/desktop/tests/spell_editor_visual.spec.ts` if Task 5 updates baselines
- additional `apps/desktop/tests/*.spec.ts` files only if Task 2 audit reveals extra spell/library routine-validation dialog expectations

**Modify: page objects / shared E2E helpers if coverage needs reusable flows**
- `apps/desktop/tests/page-objects/SpellbookApp.ts`
- `apps/desktop/tests/fixtures/test-fixtures.ts` if pre-boot theme seeding or app-launch control must move into the shared fixture layer
- `apps/desktop/tests/fixtures/test-utils.ts`
- `apps/desktop/tests/utils/test-data.ts` if a reusable legacy-seed helper is needed
- `apps/desktop/tests/fixtures/constants.ts` only if an existing timeout is demonstrably insufficient and the change benefits the full suite

**Modify only if verification reveals a direct support gap**
- `apps/desktop/src/ui/SpellEditor.tsx`
- `apps/desktop/src/ui/Library.tsx`
- `apps/desktop/src/ui/CharacterEditor.tsx`
- `apps/desktop/src/ui/CharacterManager.tsx`
- `apps/desktop/src/ui/SettingsPage.tsx`
- `apps/desktop/src/ui/App.tsx`
- `apps/desktop/src/ui/components/NotificationViewport.tsx`
- `apps/desktop/src/ui/components/Modal.tsx`
- `apps/desktop/src/store/useTheme.ts`
- `apps/desktop/src/theme/preHydrationTheme.ts`
- `apps/desktop/src/store/useNotifications.ts`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx`

**Modify: Storybook state definitions only if Task 5 needs visual-state normalization**
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx`

**Modify: documentation**
- `docs/user/spell_editor.md`
- `README.md`
- `docs/dev/spell_editor_components.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`

**Plan artifact**
- `docs/superpowers/plans/2026-03-25-add-spell-ui-design-and-accessibility-chunk-6.md`

---

## Current Coverage And Reuse Anchors

- `apps/desktop/tests/page-objects/SpellbookApp.ts` already provides navigation, spell creation, spell opening, library waits, filter helpers, character creation, and character editor flows. Extend it only when a repeated Chunk 6 flow would otherwise duplicate brittle locator logic.
- `apps/desktop/tests/accessibility_and_resize.spec.ts` already contains resize and modal focus-trap patterns from Chunk 5. Extend that file rather than creating a second accessibility-only spec unless the file becomes unreadable.
- `apps/desktop/tests/theme_and_feedback.spec.ts` already covers theme and notification behavior from Chunk 1. Add the persistence/live-region/stacking regression cases there first.
- `apps/desktop/tests/spell_editor_visual.spec.ts` already exists and should remain the visual-regression home for structured-editor and empty-state screenshots.
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx` and `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx` already carry dark-theme coverage from Chunk 4; reuse their states as the source of truth for screenshot naming and permutations.
- Prior chunk handoffs require Chunk 6 docs to capture: theme support, inline validation timing, delayed save feedback, library success toast, empty-state UX, hash display/copy behavior, structured-field grouped layout conventions, and modal focus-trap behavior.

---

## Task 1: Lock Scope And Establish A Clean Verification Baseline

**Files:**
- Read/verify: this plan file only

- [x] **Step 1.1: Confirm the no-redesign guardrails before touching tests**

Run: read this plan header and `Frozen Requirements Snapshot`
Expected: implementation worker understands that Chunk 6 is verification/documentation first and may only make minimal production fixes when tests reveal a direct support gap, including the smallest shared store or pre-hydration correction needed to restore a frozen requirement in the covered flows.

- [x] **Step 1.2: Install no new dependencies and keep the current fixture stack**

Run: no command
Expected: all work remains inside the existing Playwright, Vitest, Storybook, and Markdown tooling.

- [x] **Step 1.3: Capture the current failing/passing baseline for the touched E2E files before edits**

Run:

```bash
cd apps/desktop
pnpm build
npx playwright test tests/spell_editor_structured_data.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_canon_first.spec.ts tests/spell_editor_save_workflow.spec.ts tests/spell_notes_persistence.spec.ts tests/spell_editor_visual.spec.ts tests/e2e.spec.ts tests/milestone_3.spec.ts tests/repro_bugs.spec.ts tests/theme_and_feedback.spec.ts tests/accessibility_and_resize.spec.ts
```

Expected: current failures identify existing red assertions and current runtime regressions across the full closed starting inventory plus the Task 4 theme/accessibility slice. This baseline run does not prove coverage completeness by itself.

- [x] **Step 1.4: Build a requirements-to-steps audit from the frozen requirements in this plan before fixing anything**

Run: no command
Expected: `Implementation Notes` contains a short checklist mapping each required Chunk 6 output in `Frozen Requirements Snapshot` to the task/step that will verify it, so missing planned coverage is identified from this document rather than inferred from the baseline run.

- [x] **Step 1.5: Record baseline results in the implementation notes section of this plan before fixing anything**

Run: no command
Expected: each failing area is mapped to one of the tasks below so later review can confirm the fix was intentional. If the starting slice is fully green, record that explicitly so the later edits still have before/after evidence.

- [x] **Step 1.5a: Record the pre-task documentation baseline**

Run:

```bash
mkdir -p .tmp
for path in README.md docs/user/spell_editor.md docs/dev/spell_editor_components.md docs/TESTING.md docs/ARCHITECTURE.md; do
   mkdir -p ".tmp/chunk6-doc-baseline/$(dirname "$path")"
   cp "$path" ".tmp/chunk6-doc-baseline/$path"
done
git diff --name-only -- '*.md' | sort | tee .tmp/chunk6-doc-baseline/dirty-doc-paths.txt
```

Expected: `Implementation Notes` records any pre-existing markdown/documentation changes before Chunk 6 docs edits begin, the five required docs are copied to `.tmp/chunk6-doc-baseline/`, and the current dirty markdown path list is saved to `.tmp/chunk6-doc-baseline/dirty-doc-paths.txt`, so Step 7.4 can verify the Chunk 6 docs deliverable by file-content delta rather than raw working-tree state.

- [ ] **Step 1.6: If Task 2 audit discovers additional spell/library specs to edit, baseline those files before modifying them**

Run: the same targeted `npx playwright test <extra-specs>` command for any extra spec files discovered by Step 2.1.
Expected: every file edited under the audit-expanded migration scope has a before/after baseline recorded in `Implementation Notes`.

---

## Implementation Notes

This plan document is also the execution log for baseline evidence and final verification. Use this section during implementation so review stays anchored to the source-of-truth plan file rather than chat summaries.

- **Baseline results from Step 1.3:**
   - Date: 2026-03-25; two runs performed to confirm baseline
   - **Run 1** (~18:23–18:42, 3 workers): partial output only (terminal buffer exceeded); confirmed 2 failures before buffer overflow
   - **Run 2** (~19:05–19:20, 1 worker; full output in `.tmp/chunk6-doc-baseline/test_baseline_out.txt` at workspace root — *move to `.tmp/chunk6-doc-baseline/` when `Remove-Item` policy allows*): 110 tests total, 1 worker
   - Build: `pnpm build` SUCCESS — vite 7.3.0, 3.02s, output ~521KB JS bundle
   - Spec files run: `spell_editor_structured_data.spec.ts`, `epic_and_quest_spells.spec.ts`, `spell_editor_canon_first.spec.ts`, `spell_editor_save_workflow.spec.ts`, `spell_notes_persistence.spec.ts`, `spell_editor_visual.spec.ts`, `e2e.spec.ts`, `milestone_3.spec.ts`, `repro_bugs.spec.ts`, `theme_and_feedback.spec.ts`, `accessibility_and_resize.spec.ts`
   - Total tests in full run: **110** (1 worker, confirmed from `test_baseline_out.txt`)
   - **Deterministic failures (2 — pre-existing, reproduce reliably):**
     1. `tests/e2e.spec.ts:64:3` — "Milestone Verification Flow > Milestone 3: Library filters for components and tags > Apply filters and verify results" — TIMEOUT 360s (6.1 min). Root cause: `locator.selectOption` hang at `SpellbookApp.ts:519`, `waiting for getByLabel('Class filter')` when the Tauri app page closed mid-test. **Maps to Task 3 (workflow coverage), pre-existing before Chunk 6.**
     2. `tests/milestone_3.spec.ts:19:1` — "Milestone 3: Robust Search & Saved Searches" — FAILED 43.6s. Pre-existing milestone test failure. **Maps to Task 3 (workflow coverage), pre-existing before Chunk 6.**
   - **Intermittent infrastructure flake (1 — not an assertion regression):**
     3. `tests/spell_editor_canon_first.spec.ts` — "...collapse then view-only expand/collapse leaves canon unchanged" — appears in Run 1 only, not Run 2. Tauri app abnormal exit (STATUS_CONTROL_C_EXIT) with "load timeout — continuing anyway". Port-cleanup artifact between tests, not deterministic. **Task 7's final matrix should expect 2 deterministic failures; a third appearance of this flake is not a regression.**
   - **PASSING (Run 2):** 108 of 110 tests passing across all 11 spec files
   - **Pre-existing dirty markdown files at baseline:** none (git diff showed no unstaged `.md` changes)
   - **Raw artifact:** `.tmp/chunk6-doc-baseline/test_baseline_out.txt` (immutable pre-change reference; also present as `test_baseline_out.txt` at workspace root — will be deleted when `Remove-Item` policy allows)
- **Requirement-to-step audit from Step 1.4:**
   - FR-1 (5 docs files updated) → **Task 6** (all 5 docs: `docs/user/spell_editor.md`, `README.md`, `docs/dev/spell_editor_components.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`)
   - FR-2 (migration of validation-modal tests) → **Task 2** (Steps 2.1–2.11; targets `spell_editor_structured_data.spec.ts`, `epic_and_quest_spells.spec.ts`, `spell_editor_canon_first.spec.ts`)
   - FR-3a (new user creates first spell) → **Task 3, Step 3.1**
   - FR-3b (legacy spell edit basic fields) → **Task 3, Step 3.2**
   - FR-3c (legacy structured-field upgrade) → **Task 3, Step 3.2–3.3**
   - FR-3d (validation error handling) → **Task 2** (migration) + **Task 3** (workflow coverage)
   - FR-3e (conditional field transitions collapsed/expanded) → **Task 2, Steps 2.4–2.5** (stale-state migration) + **Task 3** (expanded/collapsed end-state workflow coverage)
   - FR-3f (keyboard-only navigation) → **Task 4** (accessibility spec)
   - FR-3g (theme switching through /settings + persistence) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-3h (empty library state) → **Task 3** (empty-state coverage)
   - FR-3i (empty search state) → **Task 3** (empty-state coverage)
   - FR-3j (empty character spellbook state) → **Task 3** (empty-state coverage)
   - FR-4a (screen reader validation announcements / field association) → **Task 4** (accessibility_and_resize.spec.ts extensions)
   - FR-4b (modal focus trap and focus return) → **Task 4, Step 4.2**
   - FR-5a (theme store persistence + first-load) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-5b (hidden live-region theme announcement) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-5c (editor in both themes) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-5d (non-modal notifications) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-5e (clipboard copy via toast/live-region) → **Task 4** (theme_and_feedback.spec.ts)
   - FR-5f (modal reserved for destructive/blocking) → **Task 4, Step 4.2** via preserved-modal coverage
   - FR-5g (preserved dialogs remain modal post Chunk 5) → **Task 4, Step 4.2**
   - FR-6a (`StructuredFieldInput` visual regression baselines) → **Task 5** (spell_editor_visual.spec.ts)
   - FR-6b (`SpellEditor` structured fields dark mode baseline) → **Task 5**
   - FR-6c (`SpellEditor` structured fields light mode baseline) → **Task 5**
   - FR-6d (empty library dark+light baselines) → **Task 5**
   - FR-6e (hash display collapsed+expanded baselines) → **Task 5**
   - **Coverage gap flagged:** FR-3 tasks e2e.spec.ts:64 Milestone 3 tag filter test is currently FAILING (pre-existing timeout). Task 3 must fix or stabilize this before final verification matrix (Task 7).
- **Step 2.1a audit ledger:** *(filled in Task 2, Step 2.1a — deferred to that step)*
    - audit commands run:
       - initial Windows-safe candidate scan: `Push-Location 'C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop'; $spellLibrarySpecs = rg --files tests | rg '\.spec\.ts$' | rg -v '^tests[\\/](character_|vault|batch_import|import_)'; Write-Host 'CANDIDATE_INVENTORY'; $spellLibrarySpecs; Write-Host 'DIALOG_AUDIT'; rg -n '(handleCustomModal\(|Save Error|Validation Error|getByRole\(["''](?:dialog|alertdialog)["'']|locator\(["'']dialog["'']|modalAlert|modalConfirm|getByText\(["'']Save Error|getByText\(["'']Validation Error|toHaveCount\(0\).*dialog|not\.toBeVisible\(\).*dialog)' -- $spellLibrarySpecs; Pop-Location`
       - note: the first attempt used a slash-only exclude pattern and over-included Windows `tests\character_*` paths; the corrected `^tests[\\/]...` pattern above is the authoritative Step 2.1 command/result.
    - candidate inventory produced by Step 2.1: `tests/accessibility_and_resize.spec.ts`, `tests/milestone_3.spec.ts`, `tests/theme_and_feedback.spec.ts`, `tests/spell_notes_persistence.spec.ts`, `tests/spell_editor_visual.spec.ts`, `tests/spell_editor_structured_data.spec.ts`, `tests/spell_editor_save_workflow.spec.ts`, `tests/spell_editor_canon_first.spec.ts`, `tests/repro_bugs.spec.ts`, `tests/e2e.spec.ts`, `tests/epic_and_quest_spells.spec.ts`
    - final authoritative spell/library inventory reviewed and saved to `.tmp/chunk6-spell-library-ledger.txt`:
       - `apps/desktop/tests/spell_editor_structured_data.spec.ts`
       - `apps/desktop/tests/epic_and_quest_spells.spec.ts`
       - `apps/desktop/tests/spell_editor_canon_first.spec.ts`
       - `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
       - `apps/desktop/tests/spell_notes_persistence.spec.ts`
       - `apps/desktop/tests/spell_editor_visual.spec.ts`
       - `apps/desktop/tests/e2e.spec.ts`
       - `apps/desktop/tests/milestone_3.spec.ts`
       - `apps/desktop/tests/repro_bugs.spec.ts`
    - extra specs discovered beyond the starting inventory: none added. `tests/accessibility_and_resize.spec.ts` and `tests/theme_and_feedback.spec.ts` appeared in the broader candidate scan but were not spell/library migration-ledger files and had no Task 2 dialog assertions to classify.
    - Step 1.6 status: not needed because no additional spell/library specs were added to the authoritative ledger.
    - per-file classification summary:
       - `apps/desktop/tests/spell_editor_structured_data.spec.ts` → (a) routine-validation inline migration/verification for `error-school-required-arcane`, `error-sphere-required-divine`, `error-school-required-arcane-tradition`, `error-sphere-required-divine-tradition`, `error-tradition-conflict`, and `spell-name-error`; (c) preserved blocking/destructive modal coverage kept for import failure and unparsed-fields navigation guard.
      - `apps/desktop/tests/epic_and_quest_spells.spec.ts` → (a) routine-validation inline migration/verification for `error-epic-arcane-class-restriction`; (c) preserved `Unsaved changes` confirmation kept.
       - `apps/desktop/tests/spell_editor_canon_first.spec.ts` → (b) explicit negative no-dialog assertion kept for inline epic class restriction path; (c) preserved backend `Save Error` modal and `Unsaved changes` modal coverage kept; no missing-name routine-validation modal path remained, so Step 2.8 required no code edit.
       - `apps/desktop/tests/spell_editor_save_workflow.spec.ts` → (b) explicit no-dialog protection kept for routine validation flows; (c) preserved delete-confirmation modal coverage kept.
       - `apps/desktop/tests/spell_notes_persistence.spec.ts` → (d) no dialog assertions found; not part of the Task 2 migration ledger beyond manual inventory review.
       - `apps/desktop/tests/spell_editor_visual.spec.ts` → (d) no dialog assertions found; visual-only coverage.
       - `apps/desktop/tests/e2e.spec.ts` → (d) no dialog assertions found in the reviewed spell/library milestone flow.
       - `apps/desktop/tests/milestone_3.spec.ts` → (d) `setupAcceptAllDialogs` is legacy harness noise, not routine spell/library validation coverage.
       - `apps/desktop/tests/repro_bugs.spec.ts` → (d) only `Validation Errors found` console text matched the audit; no dialog assertions to migrate.
    - additional Task 2 spec modification note: no extra spec files needed modification beyond the named Task 2 targets, and `apps/desktop/tests/spell_editor_canon_first.spec.ts` did not require a code change because the targeted missing-name / routine-validation `Save Error` path no longer existed.
- **Selector or support gaps found during workflow/accessibility work:**
   - Task 3 required one minimal production affordance to cover the empty character spellbook path end-to-end: `apps/desktop/src/ui/CharacterEditor.tsx` now exposes a visible `link-open-spellbook-builder` header link so E2E can open the builder through the same UI path users see.
   - `apps/desktop/tests/page-objects/SpellbookApp.ts` gained reusable workflow helpers instead of repeating brittle spec-local setup: `seedConflictedSpell(name)`, `expectActiveTraditionField(tradition)`, and an `openSpellbookBuilder(name)` helper that opens the character editor and clicks `link-open-spellbook-builder`.
   - `apps/desktop/tests/spell_editor_save_workflow.spec.ts` now verifies the delayed-save contract with a browser-side `MutationObserver` helper (`captureSaveButtonDelayTimeline`) anchored to the save click, rather than Playwright-side sleep checkpoints.
- **Task 4 implementation evidence (Steps 4.1–4.10):**
   - Step 4.1 (keyboard nav): New test `"Settings theme controls are keyboard-navigable: follow-system toggle and theme select"` added to `apps/desktop/tests/accessibility_and_resize.spec.ts` inside new describe block `"Keyboard navigation — settings controls"`. SpellEditor keyboard path already covered all run 2 baseline by `"keyboard path: Tab navigation reaches fields with visible focus, then saves"` in `spell_editor_save_workflow.spec.ts`.
   - Step 4.2 (modal focus-trap for preserved dialogs): Source inspection confirmed `apps/desktop/src/ui/components/Modal.tsx` lines 48–49 call `dialog.showModal()` and lines 55–57 call `dialog.close()`. Native modality is enforced by the browser. New test `"Unsaved changes preserved dialog uses native showModal() and traps focus"` added to `apps/desktop/tests/accessibility_and_resize.spec.ts` inside new describe block `"Preserved modal modality"`. Inline native-dialog assertions (`dialog[open][data-testid='modal-dialog']` + `aria-modal="true"`) added to `"Unsaved changes: warn on Cancel"` in `spell_editor_canon_first.spec.ts` and to the import-rejection modal step in `spell_editor_structured_data.spec.ts`.
   - Step 4.3 (first-load theme behavior): New test `"explicit persisted theme preference is applied to the document root before first user interaction on a warm reload"` added to `theme_and_feedback.spec.ts`. It seeds `spellbook-theme` in localStorage before reload and asserts `document.documentElement.dataset.theme` immediately, verifying `preHydrationTheme.ts`. Cold-start and follow-system behavior already covered in baseline tests.
   - Step 4.4 (theme switching persistence through /settings): Fully covered by pre-existing test in `theme_and_feedback.spec.ts`. No new code needed.
   - Step 4.5 (hidden live-region announcements): Added `await expect(themeLiveRegion).toHaveAttribute("aria-live", "polite")` to the first test in `theme_and_feedback.spec.ts`. Visual sr-only hiding is covered by `App.test.tsx` unit tests. Pre-existing `toHaveText("Dark mode")` + no-toast assertions cover the content verification.
   - Step 4.6 (ARIA validation): New test `"invalid spell-name field exposes aria-invalid and aria-describedby pointing to a visible error element"` added to `apps/desktop/tests/accessibility_and_resize.spec.ts` inside new describe block `"Accessibility — ARIA validation"`. Checks `aria-invalid="true"`, `aria-describedby` contains `"spell-name-error"`, `#spell-name-error` is visible, and `spell-name-input` is focused after first failed submit. Production `ariaInvalidForField` and `describedByByField` already present in SpellEditor.tsx.
   - Step 4.7 (stacked notifications, clipboard copy, routine non-modal contract): Pre-existing `"Library add-to-character success uses toast in global viewport (not alert)"` verifies toast doesn't steal focus. `"exposes the shared notification live region when a notification-producing flow is triggered"` covers hash copy via toast. `expectNoBlockingDialog()` added to that test to complete the modal-boundary contract.
   - Step 4.8 (edited views in both themes): Covered by pre-existing `"inline validation stays visible under explicit light and dark themes"` and `"delayed save progress styling is explicit in both light and dark themes"` in `spell_editor_save_workflow.spec.ts`, and `"structured spell editor surfaces stay legible when switching from light to dark mode"` in `theme_and_feedback.spec.ts`.
   - Step 4.10 (modal-boundary negative tests): Pre-existing `"first failed submit… no validation dialog"`, `"pristine required fields stay quiet… no validation dialog"`, and `"modal boundaries: delete confirmation opens dialog; validation does not"` cover negative contract. `expectNoBlockingDialog()` added to hash copy test for the clipboard copy path. Theme-change-no-dialog already proven by no-toast assertion in existing test.
   - **All 8 new/modified tests pass** (verified with targeted Playwright runs after `pnpm build`).
- **Modal.tsx showModal() / close() source inspection evidence (Step 4.2):**
   - File: `apps/desktop/src/ui/components/Modal.tsx`
   - `showModal()` is called at line 48-49: `if (typeof dialog.showModal === "function") { dialog.showModal(); }`
   - `close()` is called at lines 55-57: `if (typeof dialog.close === "function") { dialog.close(); }`
   - `triggerRef.current` is set to `document.activeElement` at line 46 when `isOpen` becomes true, enabling focus restoration after close
   - All preserved dialogs that use `ModalShell`/`Modal.tsx` inherit this native `showModal()` modality contract
- **Manual NVDA verification evidence from Task 4:**
   - date: (pending — manual step required; see procedure below)
   - NVDA version: (pending)
   - Chromium version: (pending)
   - exact labels announced: (pending)
   - exact error text announced: (pending)
   - setup notes: To reproduce: (1) Open spell editor with a saveable record; (2) clear spell name and click Save so `spell-name-error` appears and spell-name-input receives focus; (3) record NVDA-announced label ("Spell name" or similar) and error text ("Spell name is required" or similar); (4) switch tradition to ARCANE or DIVINE to expose a tradition-specific validation error and record the announced label/error pair; (5) compare with DOM wiring verified by Step 4.6 E2E test (`aria-describedby="spell-name-error"` + `aria-invalid="true"`). Record any mismatch as a blocking failure.
- **Visual regression artifact inventory from Task 5:**
   - Actual snapshot names captured for the Task 5 required inventory:
     - `structured-field-input-states-light-win32.png`
     - `structured-field-input-states-dark-win32.png`
     - `spell-editor-structured-light-win32.png`
     - `spell-editor-structured-dark-win32.png`
     - `empty-library-light-win32.png`
     - `empty-library-dark-win32.png`
     - `hash-display-collapsed-win32.png`
     - `hash-display-expanded-win32.png`
   - `apps/desktop/tests/spell_editor_visual.spec.ts` was rewritten to cover exactly the required eight-shot inventory.
   - Structured-field gallery note: `structured-field-input-states-*` comes from dedicated `VisualGallery` and `VisualGalleryDark` stories in `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`, served through Storybook and captured by the existing Playwright visual spec via Storybook `iframe.html` URLs. The gallery intentionally covers multiple stabilized variants per field family rather than a single representative example.
   - Full-editor view note: the `spell-editor-structured-*` baselines now come from the real Tauri `SpellEditor` surface again. The Playwright visual spec seeds a fully populated spell, enables the Playwright-only `__SPELLBOOK_E2E_VISUAL_CONTRACT__ = "all-structured"` flag, and captures the production editor fieldset with every structured panel expanded so the screenshot actually contains the structured controls themselves.
   - Story normalization: yes; `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx` gained `VisualGallery` / `VisualGalleryDark`, a deterministic light-theme wrapper, and synchronous theme stamping for the Storybook screenshot flows. `apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx` no longer serves as the full-editor screenshot source.
   - Storybook bootstrap hardening: the visual spec now reserves a free localhost port per run and verifies `iframe.html` responds on that exact port before opening screenshot pages, avoiding the old fixed-port false-green risk.
   - Production hook note: `apps/desktop/src/ui/SpellEditor.tsx` and `apps/desktop/src/globals.d.ts` now include a narrow visual-contract hook that is inert outside Playwright and exists solely to expand all structured panels for the Task 5 baselines.
   - Commands run:
     - `cd apps/desktop && pnpm build` ✅
     - `cd apps/desktop && npx playwright test tests/spell_editor_visual.spec.ts --update-snapshots` ✅ (`8 passed`)
     - `cd apps/desktop && npx playwright test tests/spell_editor_visual.spec.ts` ✅ (`8 passed`)
     - `cd apps/desktop && pnpm build` ✅ after the visual-contract hook fix
     - `cd apps/desktop && pnpm test:storybook` ✅ (`14 files, 142 tests passed`) after the final Storybook visual-fixture adjustments
     - `git diff --name-only -- apps/desktop/tests | rg '__snapshots__|\.png$'` returned no paths because `apps/desktop/tests/*.ts-snapshots/` is ignored by `.gitignore`; inventory was verified by direct directory listing of `apps/desktop/tests/spell_editor_visual.spec.ts-snapshots/` instead.
- **Production code edits made to support verification:**
   - `apps/desktop/src/ui/CharacterEditor.tsx` gained a visible `link-open-spellbook-builder` header link so the empty character spellbook workflow can reach `/character/:id/builder` through the user-facing UI instead of a route rewrite shortcut.
   - `apps/desktop/src/ui/SpellEditor.tsx` gained `spell-editor-visual-contract`, a stable fieldset locator used only to capture the real integrated editor baselines without depending on brittle structural selectors.
- **Docs proof table for Step 6.6 (Task 6):**

| Item verified in code | Source of truth (file / symbol) | Doc location updated |
|----------------------|-----------------------------------|----------------------|
| Hash truncation 16 chars + `...` | `SpellEditor.tsx` (`slice(0, 16)`) | `docs/user/spell_editor.md` |
| Hash testids: `spell-detail-hash-card`, `spell-detail-hash-display`, `spell-detail-hash-copy`, `spell-detail-hash-expand` | `SpellEditor.tsx` | `docs/user/spell_editor.md` |
| Copy toasts: *Hash copied to clipboard.* / *Failed to copy hash.* | `SpellEditor.tsx` `pushNotification` | `docs/user/spell_editor.md` |
| Save hint + testid `spell-save-validation-hint` | `SpellEditor.tsx` | `docs/user/spell_editor.md` |
| *Spell saved.* success toast | `SpellEditor.tsx` | `docs/user/spell_editor.md`, `README.md`, `docs/TESTING.md` |
| *Saving…* / *Save Spell* / 300 ms | `SpellEditor.tsx`, tests | existing docs; `docs/TESTING.md` cross-ref |
| Empty library copy + CTAs + testids | `Library.tsx` `EMPTY_*`, buttons | `docs/user/spell_editor.md` |
| Empty character spellbook + `empty-character-add-spell-button` | `SpellbookBuilder.tsx` | `docs/user/spell_editor.md` |
| Library live region `library-empty-state` | `Library.tsx` `EmptyStateLiveRegion` | `docs/user/spell_editor.md` |
| Theme key `spellbook-theme`, modes | `useTheme.ts` `THEME_STORAGE_KEY` | `README.md`, `docs/ARCHITECTURE.md` |
| Theme announcement live region + strings | `App.tsx` `getThemeAnnouncement`, `theme-announcement-live-region` | `README.md`, `docs/ARCHITECTURE.md` |
| Name validation message *Name is required.* | `spellEditorValidation.ts` | `docs/TESTING.md` (NVDA step) |
| Routine validation not `modalAlert` | `SpellEditor.tsx` + `spellEditorValidation.ts` | `docs/dev/spell_editor_components.md` (pitfall #3) |
| Chunk 6 Playwright file roles | `apps/desktop/tests/*.spec.ts` | `docs/TESTING.md` |

- **Task 6 verification loop (subagent reviewers):** Iteration 1 collected findings (wrong validation API names, message drift, Storybook a11y contradiction, Spellbook Builder `alert` vs toast, live-region testid wording, broken `../dev/` link from `docs/TESTING.md`, stale DamageForm story names, etc.). Fixes were applied in the five target docs; iterations 2–4 re-ran sequential `code-reviewer` subagents until three consecutive passes returned **GATE_CLEAR** with **zero Critical / High / Medium** findings. **Low / pre-existing:** `docs/ARCHITECTURE.md` older sections still use shorthand `src/` paths for the Tauri tree (documented at plan time as repo-root-relative for the backend half); not introduced by Task 6.

---

## Task 2: Migrate Broken Validation-Modal Expectations To Inline Error Assertions

**Files:**
- Modify: `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- Modify: `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- Modify: `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- Modify: any additional `apps/desktop/tests/*.spec.ts` files revealed by Step 2.1 or Step 2.10 that still encode routine validation as dialog-driven feedback

- [x] **Step 2.1: Define the spell/library dialog-pattern audit that supports the routine-validation migration claim without overclaiming full repository proof**

Run:

```bash
cd apps/desktop
spell_library_specs=$(rg --files tests | rg '\.spec\.ts$' | rg -v '^tests/(character_|vault|batch_import|import_)')
rg -n '(handleCustomModal\(|Save Error|Validation Error|getByRole\(["'"''](?:dialog|alertdialog)["'"'']|locator\(["'"'']dialog["'"'']|modalAlert|modalConfirm|getByText\(["'"'']Save Error|getByText\(["'"'']Validation Error|toHaveCount\(0\).*dialog|not\.toBeVisible\(\).*dialog)' $spell_library_specs
```

Expected: the repo-wide discovery command produces the candidate non-out-of-scope E2E spec inventory first, then the dialog-pattern scan runs against that candidate set. Step 2.1a narrows that candidate set into the actual spell/library migration ledger. After the migration is complete, every dialog-related match returned by the candidate scan is reviewed and classified in `Implementation Notes` as either (a) obsolete routine-validation dialog handling to migrate, (b) explicit negative dialog assertions that should remain because they prove routine flows stay non-modal, (c) preserved blocking/destructive modal coverage to keep, or (d) not part of the spell/library migration ledger. If the discovered inventory differs from the starting inventory in Step 2.1a, update the Step 2.1a audit ledger before editing and run Step 1.6 for the newly added specs.

For Chunk 6, the authoritative spell/library migration inventory is the final Step 2.1a audit ledger after the exhaustive non-out-of-scope scan in Step 2.1 plus the required manual inspection. The final no-dialog contract closes against that ledger after Task 4.10 and the Task 7 verification matrix.

- [x] **Step 2.1a: Manually inspect the spell/library spec set, not just the regex hits**

Use this closed starting inventory for the manual inspection pass, then append only true audit discoveries beyond it:
- `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
- `apps/desktop/tests/spell_notes_persistence.spec.ts`
- `apps/desktop/tests/spell_editor_visual.spec.ts`
- `apps/desktop/tests/e2e.spec.ts`
- `apps/desktop/tests/milestone_3.spec.ts`
- `apps/desktop/tests/repro_bugs.spec.ts`

Inspect every dialog assertion in that inventory and classify it in `Implementation Notes` as either routine-validation legacy behavior to migrate, explicit no-dialog protection that should remain, not-applicable noise from a non-validation interaction, or preserved blocking/destructive behavior to keep. If Step 2.1 surfaces an additional spell/library spec outside that inventory, add it to the same ledger before editing so the inspected set stays closed and reviewable.

This manual classification is the backstop for dialog expectations that may not match the regex exactly.

Before leaving Step 2.1a, save the final authoritative spell/library ledger file list to `.tmp/chunk6-spell-library-ledger.txt` so Step 7.3a can rerun the final audit against the exact same inventory rather than recomputing it.

- [x] **Step 2.2: Replace the arcane school validation modal expectation with the inline error assertion**

Target: `apps/desktop/tests/spell_editor_structured_data.spec.ts` validation case for missing arcane school.

Required assertion shape:

```typescript
await expect(page.getByTestId("error-school-required-arcane")).toBeVisible();
```

Remove: `handleCustomModal(page, "OK")` for that path.

- [x] **Step 2.3: Replace the divine sphere validation modal expectation with the inline error assertion**

Target assertion:

```typescript
await expect(page.getByTestId("error-sphere-required-divine")).toBeVisible();
```

- [x] **Step 2.4: Update the arcane tradition transition case to assert both positive and negative visibility**

Required assertions:

```typescript
await expect(page.getByTestId("error-school-required-arcane-tradition")).toBeVisible();
await expect(page.getByTestId("error-tradition-conflict")).toHaveCount(0);
```

Use the zero-count assertion for the stale tradition-conflict error so the test proves the obsolete error node is removed rather than merely hidden. In the same tradition-conditional coverage area, also verify the divine-tradition counterpart as a required path:

```typescript
await expect(page.getByTestId("error-sphere-required-divine-tradition")).toBeVisible();
```

- [x] **Step 2.5: Update the tradition-conflict case to assert `error-tradition-conflict` inline**

Remove the modal helper and assert the specific error testid instead.

- [x] **Step 2.6: Update the missing-name save case to assert `spell-name-error` inline**

Preserve the save attempt and focus behavior checks if they already exist.

- [x] **Step 2.7: Update the epic arcane class restriction test to assert the stable inline testid contract**

Required assertion shape:

```typescript
await expect(page.getByTestId("error-epic-arcane-class-restriction")).toBeVisible();
```

Remove any fallback-to-visible-text assertion for this regression path.

- [x] **Step 2.8: Audit the targeted canon-first validation path and confirm whether any routine-validation modal assertion still needs migration**

If the targeted missing-name canon-first save path exists, it should use:

```typescript
await expect(page.getByTestId("spell-name-error")).toBeVisible();
```

Audit result for this repository state: the targeted missing-name canon-first routine-validation `Save Error` path no longer existed, so no code edit was required in `apps/desktop/tests/spell_editor_canon_first.spec.ts`. Step 2.8 is satisfied by the closed audit ledger and by preserving the remaining backend `Save Error` modal coverage as out of scope for routine-validation migration.

- [x] **Step 2.9: Keep preserved modal paths unchanged and hand off their formal modality verification to Task 4.2**

Do not edit the preserved `Unsaved changes` and blocking-cancel cases except to keep them passing if shared helper behavior changed elsewhere. Task 4.2 owns the formal preserved-dialog verification for focus trap, focus return, and true modality.

- [x] **Step 2.10: Run the legacy-marker audit again after the targeted migrations**

Run:

```bash
cd apps/desktop
spell_library_specs=$(rg --files tests | rg '\.spec\.ts$' | rg -v '^tests/(character_|vault|batch_import|import_)')
rg -n '(handleCustomModal\(|Save Error|Validation Error|getByRole\(["'"''](?:dialog|alertdialog)["'"'']|locator\(["'"'']dialog["'"'']|modalAlert|modalConfirm|getByText\(["'"'']Save Error|getByText\(["'"'']Validation Error|toHaveCount\(0\).*dialog|not\.toBeVisible\(\).*dialog)' $spell_library_specs
```

Expected: no reviewed spell/library routine-validation path under `apps/desktop/tests` still relies on dialog handling; any remaining spell/library matches are either preserved modal coverage or explicit no-dialog assertions and are listed in `Implementation Notes` with file-level classification. Before closing this step, confirm the Step 2.1a ledger includes every file returned by the repo-wide discovery command plus any manually discovered additions.

- [x] **Step 2.11: Run only the migrated specs to verify the red-to-green change**

Build the rerun command from the three named specs plus any additional spec files uncovered by Steps 2.1 and 2.10. Record the exact rerun command in `Implementation Notes`.

Run:

```bash
cd apps/desktop
migrated_specs="tests/spell_editor_structured_data.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_canon_first.spec.ts"
pnpm build
npx playwright test $migrated_specs
```

Expected: migrated validation tests pass in the three targeted specs, preserved modal tests remain intact, and no new modal regressions appear in the touched files. If the Step 2.1a ledger identifies an additional spec that was actually migrated, append only that migrated file path to `migrated_specs` before running and record the final command in `Implementation Notes`.

Step 2.11 execution log:
- build command run after code changes: `Push-Location 'C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop'; pnpm build; exit $LASTEXITCODE` → success (`vite build`, 105 modules transformed, built in ~3.08s; only the existing chunk-size warning remained).
- exact migrated-spec rerun command: `Push-Location 'C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop'; npx playwright test tests/spell_editor_structured_data.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_canon_first.spec.ts --max-failures=1 --reporter=list; Pop-Location`
- Step 2.11 result: failed on the first test before the full slice completed. Failure was `tests/epic_and_quest_spells.spec.ts:11:3 › Epic and Quest Spells › Epic and Quest Spells E2E › Create a Quest Spell (Divine only)`.
- failure summary: `SpellbookApp.waitForLibrary()` timed out waiting for `getByRole('heading', { name: 'Spell Library' })` after `app.createSpell(...)` in the quest-spell creation path (`tests/page-objects/SpellbookApp.ts:112`, invoked from `tests/epic_and_quest_spells.spec.ts:69`). This occurred after the inline restriction migration step had already passed and before any canon-first or structured-data failures were reported.
- root-cause note: reproducing the exact migrated assertion subset showed the failure happens immediately after the preserved `Unsaved changes` confirmation in `tests/epic_and_quest_spells.spec.ts`, before the quest-spell form opens. The test moved into the next step before the Library route had visibly settled; adding `await app.waitForLibrary()` after `handleCustomModal(page, "Confirm")` fixed that race without changing the preserved modal coverage.
- focused verification command after the race fix: `Push-Location 'C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop'; npx playwright test tests/spell_editor_structured_data.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_canon_first.spec.ts --grep "Epic and Quest Spells E2E|Tradition validation: Epic \(level 10\) requires School|Tradition validation: Quest requires Sphere|Tradition validation: new spell save shows school error, no BOTH errors|Seeded conflicted edit path shows inline tradition conflict until user resolves it|WarningBanner: persists after failed save|Failed save after structured range edit keeps canon text synchronized and stays on editor|Backend Save Error modal: Quest spell with Wizard-only classes still rejected by server" --reporter=line`
- focused verification result after the race fix: the redirected run surfaced a second targeted failure in `tests/spell_editor_structured_data.spec.ts:447` because the test clicked `btn-save-spell` after the first invalid submit had already disabled the button (`hasAttemptedSubmit && isInvalid`). That earlier failing run was debugging evidence only and did not satisfy the Step 2.11 completion gate.
- follow-up fix note: the tradition-transition case now asserts the reactive Divine inline error and disabled Save state instead of trying to click a disabled button. The latest targeted rerun artifact at `.tmp/task2-targeted-verification.txt` now ends with `8 passed (4.7m)`.
- pre-existing failure discovery (initial full run, `63 passed / 3 failed`): three tests at `spell_editor_structured_data.spec.ts:479`, `:566`, and `:597` failed consistently in the full run AND in isolation, with `Test timeout of 360000ms exceeded / locator.fill: Target page, context or browser has been closed`. Root cause: all three used `page.getByPlaceholder(/Search spells/i)` but the Library search input's actual placeholder is `"Keywords or spell name…"` (`data-testid="search-input"`). The locator never matched; Playwright retried for the full 360s timeout, then teardown closed the browser. These bugs predated Task 2 (added in commit `78e5f55`); confirmed not regressions by running all three in isolation before the fix — all three failed even without any preceding test from Task 2.
- pre-existing failure fix: replaced `page.getByPlaceholder(/Search spells/i)` with `page.getByTestId("search-input")` in the three tests; also added `await app.waitForLibrary()` after `app.navigate("Library")` in the test at `:597` (consistent with the `openSpell()` pattern). Fix verified: isolated run of the three tests shows `3 passed (1.6m)`.
- **FINAL full-suite result: `66 passed (34.1m)` exit code 0.** Artifact: `.tmp/task2-full-rerun-final.txt`. Step 2.11 closed.

---

## Task 3: Fill The Missing E2E Workflow Coverage

**Files:**
- Modify: `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
- Modify: `apps/desktop/tests/spell_editor_structured_data.spec.ts` only if a workflow fits naturally there
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts` if a reusable helper removes duplication
- Modify: `apps/desktop/tests/utils/test-data.ts` if reusable legacy spell fixtures or seed helpers are needed
- Modify only if required for stable selectors: `apps/desktop/src/ui/SpellEditor.tsx`, `apps/desktop/src/ui/Library.tsx`, `apps/desktop/src/ui/CharacterEditor.tsx`, `apps/desktop/src/ui/CharacterManager.tsx`

- [x] **Step 3.1: Add the new-user first-spell workflow**

Required path:
1. start from an empty library
2. enter Add Spell
3. create the first spell
4. save successfully
5. verify Library return, `Spell saved.` toast, and the created spell is present in the Library list

Do not require hash-card visibility in this workflow; hash display coverage stays in the dedicated hash and visual-regression steps below.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` via `first-spell workflow starts from empty library, saves, and returns to the library list`, which requires the empty-library entry path, asserts the exact `Spell saved.` toast, and verifies the new Library row after save.

- [x] **Step 3.2: Add the legacy basic-field edit workflow**

Required path:
1. start from an existing legacy/basic spell fixture or seeded record created before the workflow begins
2. open editor
3. modify plain text/basic fields only
4. save
5. verify updated library state and correct save-progress/save-success behavior
6. reopen the same spell and verify the edited basic-field values persisted

This regression path must not create a brand-new spell as its setup shortcut; it must prove editing starts from legacy data.

Preferred seed source: reuse an existing deterministic fixture/helper in `apps/desktop/tests/utils/test-data.ts` or add one there so the same legacy record can support both the basic-field and structured-upgrade flows.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` via `legacy import: basic-field edit workflow saves, updates the library, and persists after reopen`, which starts from imported legacy data, edits only basic fields, asserts save feedback, and reopens the same spell to prove persistence.

- [x] **Step 3.3: Add the legacy structured-field upgrade workflow**

Required path:
1. open a spell with legacy/raw structured values
2. switch/edit the structured field
3. verify preview/conditional state update
4. save and reopen
5. verify persisted upgraded value

Use the same fixture/seed helper approach as Step 3.2 so the legacy source data is reviewable and repeatable.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` via `legacy import: structured range upgrade updates observable state and persists after reopen`, which starts from legacy/raw range data, verifies the upgraded structured state before save, then reopens to confirm persistence.

- [x] **Step 3.4: Add the validation error handling workflow**

This scenario must cover the real timing contract: pristine required fields stay quiet until blur or failed submit, first failed submit focuses the first invalid field, and errors clear when the user fixes the relevant field.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` through the paired validation tests covering quiet pristine fields, first-invalid focus on failed submit, and inline error clearance after correction while preserving the no-dialog contract.

- [x] **Step 3.5: Add an explicit delayed-save feedback verification step for the 300 ms `Saving…` contract**

Required assertions:
1. reuse the delayed-save verification pattern already present in `apps/desktop/tests/spell_editor_save_workflow.spec.ts`, or extract that same deterministic hold-open helper into the same spec if reuse is awkward
2. immediately after clicking Save, assert the button has not switched to `Saving…` yet
3. while the save is still intentionally held open, assert the button remains non-`Saving…` at a checkpoint strictly before the 300 ms threshold and then flips to `Saving…` at a checkpoint strictly after the 300 ms threshold; use concrete checkpoints such as 250 ms and 350 ms, or the nearest deterministic clock-control equivalents supported by the helper
4. after completion, assert the UI returns to its post-save state and the success toast path still works

Supportable timing method:
- keep the save deterministically blocked under test control; do not rely on incidental slowness, arbitrary sleeps, or a new wall-clock-only fallback
- use the same timing technique already established in `spell_editor_save_workflow.spec.ts` for delayed-save coverage rather than inventing a second approach for Chunk 6

Record the exact helper or hold-open mechanism used, plus the timestamps or clock advances used, in `Implementation Notes` so reviewers can see how the timing contract was verified.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` via `delayed save feedback waits 300 ms before showing Saving…, then navigates to Library with a toast`. The test holds save completion open with `window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 1200` and uses `captureSaveButtonDelayTimeline(page, "btn-save-spell")` to capture the immediate post-click state plus the first `Saving…` mutation. The asserted contract is: immediate post-click state remains non-`Saving…`, the first `Saving…` transition occurs only after 300 ms, and the post-save Library return plus `Spell saved.` toast still occur.

- [x] **Step 3.6: Add the conditional field transition workflow**

Explicitly verify the Arcane/Divine switch behavior using observable end-state assertions rather than timing-sensitive animation checks: newly relevant field appears, the previously relevant field count becomes `0`, the newly relevant field count becomes `1`, stale errors clear, and only one tradition-specific field wrapper remains in the classification area after the switch so no dead spacer/panel is left behind. This step verifies the user-visible collapsed/expanded result of the transition, not frame-by-frame animation behavior.

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts`. The workflow now covers both validation-state cleanup and stale conflict cleanup across Arcane/Divine switches, with reusable end-state assertions centralized in `SpellbookApp.expectActiveTraditionField(tradition)`.

- [x] **Step 3.7: Add empty-state workflows for library, search, and character spellbook**

Place all three empty-state workflows in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` so Step 3.8 reruns the entire empty-state slice, including the character case, in one command.

Required path for empty character spellbook:
1. create or open a character profile with no known/prepared spells
2. navigate to the character spellbook view that renders the empty state
3. verify the explanatory copy and `empty-character-add-spell-button`
4. if the CTA or wrapper lacks a stable selector, add the minimum support change in the relevant character UI file and record it in `Implementation Notes`

Required path for empty search:
1. seed at least one spell so the Library has searchable content
2. enter a search query guaranteed not to match any spell
3. verify the empty-search copy and `empty-search-reset-button`
4. activate the reset control and verify the seeded result list returns

Required assertions:
- empty library shows `empty-library-create-button` and `empty-library-import-button`
- empty search shows `empty-search-reset-button`
- empty character spellbook shows `empty-character-add-spell-button`

Status: complete in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` with three dedicated workflows covering the empty library CTA state, empty search reset flow, and empty character spellbook CTA opening the Add Spells dialog. The empty character path now clicks the visible `link-open-spellbook-builder` affordance in `apps/desktop/src/ui/CharacterEditor.tsx`.

- [x] **Step 3.8: Run the workflow-focused spec slice**

Run:

```bash
cd apps/desktop
pnpm build
npx playwright test tests/spell_editor_save_workflow.spec.ts tests/spell_editor_structured_data.spec.ts
```

Expected: all new workflow coverage passes without introducing character/vault/import-scope changes.

Status: complete. Verified with:

```bash
cd apps/desktop
pnpm build
npx playwright test tests/spell_editor_save_workflow.spec.ts tests/spell_editor_structured_data.spec.ts
```

Initial result: `48 passed (21.7m)` with slow-file notices for `tests/spell_editor_structured_data.spec.ts` and `tests/spell_editor_save_workflow.spec.ts` only; no assertion failures.

Post-fix helper verification rerun:

```bash
cd apps/desktop
npx playwright test tests/spell_editor_save_workflow.spec.ts tests/spell_editor_structured_data.spec.ts tests/character_profiles_foundation_one.spec.ts --grep "Known spell requirement for Prepared list|."
```

Latest result: `50 passed (21.5m)` including the direct consumer of the updated picker/remove page-object helpers.

Accepted low-severity follow-up debt after the mandatory review loop:

- documentation precision: the recorded helper-rerun grep `"Known spell requirement for Prepared list|."` is broader than the narrative implies because the `|.` branch effectively matches every title; if this evidence block is revisited later, tighten the grep to the exact intended test title or describe the rerun as a broader regression slice.
- helper adoption cleanup: two post-save library assertions in `apps/desktop/tests/spell_editor_structured_data.spec.ts` still drive the search box directly instead of reusing the newer Library settled-state helper contract; this was left out of the current cleanup because it is low severity and not required to keep the shared-helper gate green.

---

## Task 4: Extend Accessibility, Theme, Feedback, And Modal-Boundary Verification

**Files:**
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`
- Modify: `apps/desktop/tests/theme_and_feedback.spec.ts`
- Modify: `apps/desktop/tests/spell_editor_save_workflow.spec.ts` if the preserved save-failure modal proof needs to live with the deterministic save helpers
- Modify: `apps/desktop/tests/spell_editor_canon_first.spec.ts` if Step 4.2 strengthens the preserved `Unsaved changes` modal assertions in place
- Modify: `apps/desktop/tests/spell_editor_structured_data.spec.ts` if Step 4.2 strengthens the preserved blocking cancel/dismiss modal assertions in place
- Modify: `apps/desktop/tests/fixtures/test-fixtures.ts` if pre-boot theme seeding or fresh-launch control cannot be expressed cleanly from the spec body
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts` if navigation helpers are needed
- Modify only if required for stable verification: `apps/desktop/src/ui/SettingsPage.tsx`, `apps/desktop/src/ui/App.tsx`, `apps/desktop/src/ui/components/NotificationViewport.tsx`, `apps/desktop/src/ui/components/Modal.tsx`, `apps/desktop/src/ui/SpellEditor.tsx`, `apps/desktop/src/store/useNotifications.ts`, `apps/desktop/src/store/useTheme.ts`, `apps/desktop/src/theme/preHydrationTheme.ts`

- [x] **Step 4.1: Add keyboard-only navigation coverage for the touched flows**

Cover at least Library filters/nav, settings theme controls, and the core SpellEditor save/validation path. Prefer role/testid locators over tab-count magic when possible. Successful keyboard-only coverage must prove:
- focus advances through the intended controls in a stable order
- Enter/Space can activate the relevant control without mouse input
- the spell-editor path can be completed or intentionally blocked by validation without using the mouse

- [x] **Step 4.2: Add modal focus-trap and focus-return verification for preserved dialogs**

Reuse the Chunk 5 patterns. The purpose here is regression protection after all Chunk 6 edits, not a second modal rewrite. The preserved-dialog verification must prove both:
- focus remains trapped and returns correctly after close
- the dialog remains truly modal while open by preventing interaction with underlying page controls until dismissal
- `apps/desktop/src/ui/components/Modal.tsx` still drives preserved dialogs through the native `showModal()` / `close()` path named in the frozen requirements

Verify the native-dialog implementation point by inspecting `apps/desktop/src/ui/components/Modal.tsx` for the actual `showModal()` / `close()` call path used by the preserved dialogs and recording the confirmation in `Implementation Notes` together with the behavioral test result.

Repository note for self-containment: in the current repo, the `ModalShell` contract frozen by this plan is implemented through `apps/desktop/src/ui/components/Modal.tsx`; record that mapping in `Implementation Notes` when doing the source inspection so the contract-bearing component name and inspected file stay aligned.

Tie this verification back to the two explicit preserved cases frozen by this plan rather than a detached generic modal sample:
- the `Unsaved changes` path in `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- the preserved blocking cancel/dismiss path in `apps/desktop/tests/spell_editor_structured_data.spec.ts`

If those exact specs need edits to carry the stronger modality assertions, treat them as Task 4 files for this step and rerun them in Step 4.11.

- [x] **Step 4.3: Add first-load theme behavior verification**

Required path:
1. start the app with no persisted theme preference and verify the default first-load resolution before any user interaction
2. start the app with an already-persisted explicit theme preference
3. verify the resolved light/dark theme is correct before any user interaction
4. open `/settings` and confirm the persisted selection is reflected in the controls
5. repeat once with follow-system mode enabled to confirm first-load system resolution under a controlled system-theme stub

Reproducible mechanism for the follow-system branch:
- before app boot, use Playwright `page.addInitScript` to seed the persisted theme mode in browser storage under the exact key `spellbook-theme`, which is read by `apps/desktop/src/store/useTheme.ts` and `apps/desktop/src/theme/preHydrationTheme.ts`
- before app boot, use Playwright `page.addInitScript` to stub `window.matchMedia('(prefers-color-scheme: dark)')` to a known result
- run the first-load assertion once with the stub returning dark and once with it returning light while the persisted preference is follow-system
- observe the resolved theme through the document root theme class plus the reflected `/settings` control state

For the explicit-theme branch, use the same pre-boot storage seeding mechanism with a concrete `light` or `dark` stored value before the app hydrates. At plan time the current implementation detail is the `spellbook-theme` storage key in `apps/desktop/src/store/useTheme.ts` and `apps/desktop/src/theme/preHydrationTheme.ts`; if that key changes before execution, record the actual key used in `Implementation Notes` and keep the test anchored to first-load behavior rather than key identity.

For the no-persisted-preference branch, launch from a fresh browser context with the current theme storage entry cleared before boot and assert that first load resolves deterministically and that the resolved theme is reflected consistently in `/settings`. Prove that by running the clean-start branch twice under the same controlled system-theme stub and confirming the same initial theme/result each time. If the current implementation intentionally follows system when no preference exists, record that in `Implementation Notes`; if it uses a different default, record that actual default contract instead and keep Task 6 docs aligned to the verified behavior.

Record the exact storage key/value setup, init-script stub, and any platform-specific caveats in `Implementation Notes`.

- [x] **Step 4.4: Add theme switching persistence coverage through `/settings`**

Required assertions:
1. open settings through `settings-gear-button`
2. change theme via `settings-theme-select`
3. verify immediate light/dark application on the document root
4. reload the app/page and verify persistence
5. toggle `settings-follow-system-checkbox` and verify select enable/disable rules

- [x] **Step 4.5: Verify hidden live-region theme announcements and absence of a visible theme toast**

The assertion must prove the change is announced to assistive-tech infrastructure without showing a visible toast notification for theme changes.

Concrete observable/assertion target:
- assert that the hidden global announcement node used for routine non-modal announcements changes in response to the theme toggle and semantically reflects the selected mode (light, dark, or system); if the node is not already uniquely addressable, add a dedicated testid for that exact announcer and use it for the assertion
- assert that the announcer is still wired as a live region during the interaction by checking its `aria-live`/role contract and that it remains visually hidden rather than appearing as a visible toast-like surface
- assert that no visible toast item appears in the notification viewport for the same theme-change interaction

- [x] **Step 4.6: Add automated validation announcement and error-field association coverage**

Add automated assertions for the accessibility contract in the real editor flow. At minimum verify:
- invalid fields expose `aria-invalid="true"`
- the invalid field references its help/error content through `aria-describedby`
- the referenced error element exists and is visible when the validation error is active
- the first-invalid-field focus path after submit still lands on the field whose error is announced

Use the stable error testids already called out in this plan plus whichever field locator is already stable in the touched spec. If the field itself is not uniquely addressable for the ARIA assertions, add the minimum field-side testid support and record it in `Implementation Notes`.

- [x] **Step 4.7: Verify stacked non-modal notifications, clipboard copy behavior, and the routine non-modal contract**

Cover:
- routine success/error toasts do not steal focus
- multiple notifications remain readable
- hash copy success uses the routine feedback channel through the toast/live-region path rather than a modal
- routine validation and success paths do not open dialogs
- if notification behavior or theme hydration issues trace back to shared stores rather than UI surfaces, fix the minimum necessary logic in `apps/desktop/src/store/useNotifications.ts`, `apps/desktop/src/store/useTheme.ts`, or `apps/desktop/src/theme/preHydrationTheme.ts`

- [x] **Step 4.8: Verify edited views in both light and dark themes**

This is functional verification, distinct from screenshot capture. At minimum exercise these edited views in both themes:
- SpellEditor with populated structured fields: open, edit one value, trigger/save one validation-sensitive interaction, and confirm the core controls remain usable
- Library after returning from an edit/save flow: confirm the saved spell row, success toast path, and primary navigation/filter controls remain usable

Use the same assertions in both themes so review can compare like-for-like behavior rather than subjective visual judgment.

- [x] **Step 4.9: Capture manual NVDA + Chromium verification notes for validation announcements and field association**

Record:
- date
- NVDA version
- Chromium version
- exact label announced
- exact error text announced
- setup notes to reproduce

Use this exact manual sequence so the evidence is repeatable:
1. open the spell editor with a saveable record
2. clear the spell name and trigger save so `spell-name-error` appears and focus returns to the invalid field
3. record the announced field label plus the announced error text
4. switch tradition to a path that exposes the conditional tradition-specific validation state and record the announced label/error pairing there as well

Also record whether the field label and error association announced by NVDA matched the DOM wiring verified in Step 4.6.

Treat any mismatch between the manual NVDA announcement and the DOM wiring expected by Step 4.6 as a blocking failure for Chunk 6: fix the underlying label/error association or announcement path, then rerun Steps 4.6 and 4.9 before closing the task.

Store these notes in the `Implementation Notes` section of this plan during Task 4, then fold only the durable guidance into `docs/TESTING.md` during Task 6.4 so execution order remains tests first, docs second.

- [x] **Step 4.10: Add explicit modal-boundary negative tests**

Add at least one negative assertion per routine flow family touched by this change to prove dialogs do **not** open where the policy requires inline feedback or toasts:
- validation error path stays inline with no dialog opening
- save success path uses toast/live-region with no dialog opening
- theme change path uses hidden live region with no dialog opening
- hash copy success path uses the toast/live-region path with no dialog opening

Pair these with the preserved-dialog assertions from Step 4.2 so the plan proves both sides of the modal boundary contract.

Add one representative positive assertion for the preserved high-severity branch in `apps/desktop/tests/spell_editor_save_workflow.spec.ts`, using the same deterministic save-failure helper already present there if available, or by adding the smallest equivalent test-controlled failure hook in that spec/helper layer if not. That proof must show a backend/hard save failure still surfaces the modal `Save Error` experience rather than silently degrading into inline or toast-only feedback.

- [x] **Step 4.11: Run the accessibility/theme slice**

Run:

```bash
cd apps/desktop
pnpm build
npx playwright test tests/accessibility_and_resize.spec.ts tests/theme_and_feedback.spec.ts tests/spell_editor_save_workflow.spec.ts tests/spell_editor_canon_first.spec.ts tests/spell_editor_structured_data.spec.ts
```

Expected: keyboard, modal, theme, and notification regressions are covered with passing tests.

---

## Task 5: Refresh The Visual Regression Baselines

**Files:**
- Modify: `apps/desktop/tests/spell_editor_visual.spec.ts`
- Modify if state setup needs normalization: `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx`
- Modify if state setup needs normalization: `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx`
- Modify only if a stable screenshot locator is missing: `apps/desktop/src/ui/SpellEditor.tsx`, `apps/desktop/src/ui/Library.tsx`

Hash-display ownership note: the hash display/copy/expand controls live in `apps/desktop/src/ui/SpellEditor.tsx`, so no separate hash-specific source file should be needed unless implementation reveals an unexpected wrapper.

- [x] **Step 5.1: Record the expected snapshot artifact inventory before updating baselines**

Expected artifact inventory to capture in `Implementation Notes` and verify after the snapshot refresh:
- `structured-field-input-states-light`
- `structured-field-input-states-dark`
- `spell-editor-structured-light`
- `spell-editor-structured-dark`
- `empty-library-light`
- `empty-library-dark`
- `hash-display-collapsed`
- `hash-display-expanded`

If the existing visual spec uses a different but stable naming scheme, record the actual names in `Implementation Notes` and keep them consistent rather than forcing a rename-only churn.

- [x] **Step 5.2: Add or normalize screenshot coverage for structured-field states**

Cover the relevant `StructuredFieldInput` variants already stabilized in Chunk 4. Use deterministic viewport sizing, disabled animations, and hidden scrollbars consistent with the existing visual spec.

- [x] **Step 5.3: Add or normalize screenshot coverage for full SpellEditor light/dark structured views**

Verify that the same content renders correctly in both themes with **all structured fields populated** in the captured SpellEditor state, matching the frozen requirement for full structured coverage rather than a partial subset.

- [x] **Step 5.4: Add or normalize screenshot coverage for empty library light/dark states**

If empty search or empty character spellbook naturally fit the same file and provide high-value baselines, include them without exploding the snapshot set. The required minimum remains empty library dark/light.

- [x] **Step 5.5: Add or normalize screenshot coverage for collapsed and expanded hash display**

Use the stable hash testids and ensure the capture shows the truncation/expanded states clearly.

- [x] **Step 5.6: Refresh snapshots deliberately**

Run:

```bash
cd apps/desktop
pnpm build
npx playwright test tests/spell_editor_visual.spec.ts --update-snapshots
```

Expected: only the intended new or updated baselines change.

- [x] **Step 5.7: Re-run the visual spec without snapshot updates**

Run:

```bash
cd apps/desktop
npx playwright test tests/spell_editor_visual.spec.ts
```

Expected: clean green pass against the refreshed baselines.

- [x] **Step 5.8: Verify the changed snapshot artifact set matches the recorded inventory**

Run:

```bash
cd apps/desktop
git diff --name-only -- tests | rg '__snapshots__|\.png$'
```

Expected: this command identifies any changed snapshot artifacts that are visible to git. If it returns no paths because snapshot directories are ignored by `.gitignore`, fall back to a direct directory listing of `apps/desktop/tests/spell_editor_visual.spec.ts-snapshots/` and record that inventory in `Implementation Notes` instead. The recorded snapshot set must still line up with the Step 5.1 inventory, with no required artifact missing and no unrelated baseline churn.

---

## Task 6: Update Documentation To Match The Final Behavior

**Files:**
- Modify: `docs/user/spell_editor.md`
- Modify: `README.md`
- Modify: `docs/dev/spell_editor_components.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/ARCHITECTURE.md`

- [x] **Step 6.1: Update the user spell-editor guide**

Document:
- inline validation timing and messaging
- first-invalid focus behavior
- save-progress `Saving…` threshold behavior
- Library-view success notification after save
- empty library/search/character spellbook UX and CTA behavior where end users encounter it
- hash card display/copy behavior
- any structured-field transition behavior the user actually experiences

- [x] **Step 6.2: Update the top-level README overview**

Document only user-visible overview changes appropriate for the README:
- Light/Dark/System themes
- routine non-modal feedback conventions
- empty-state UX if the README describes application overview flows

- [x] **Step 6.3: Update the developer spell-editor component guide**

Document:
- validation helper contract
- grouped-layout contract for `StructuredFieldInput` and `ComponentCheckboxes`
- ARIA/error association expectations
- shared UI conventions that future workers must preserve

- [x] **Step 6.4: Update the testing guide**

Document:
- current Playwright files covering this change
- build-before-Playwright rule
- visual-regression workflow and snapshot-update command
- manual NVDA verification procedure and what evidence to record

- [x] **Step 6.5: Update the architecture guide**

Document:
- theme persistence and first-load behavior
- hidden live-region theme announcement model
- notification-versus-modal boundary contract
- spell-editor validation/state flow
- modal focus-trap behavior now relied on by preserved dialogs

- [x] **Step 6.6: Proofread docs against the actual testids/copy used in code**

Do not let docs drift on user-visible strings such as `Spell saved.` or on stable testids called out as contracts. Record the proof in the `Implementation Notes` docs-proof table so reviewers can see which files/copy/testids were checked.

---

## Task 7: Run The Final Verification Matrix

**Files:**
- Verify all touched test and documentation files

- [ ] **Step 7.1: Run unit tests for any production/UI files that were touched during Chunk 6**

Run only if any file under `apps/desktop/src/` changed to support verification. If Chunk 6 changed only tests/docs, explicitly record `skipped - no src changes` in `Implementation Notes`.

Run:

```bash
cd apps/desktop
pnpm test:unit
```

Expected: required when any `src/` file changed to support stable verification.

- [ ] **Step 7.1a: Run Storybook verification if any `.stories.tsx` file changed during Task 5**

Run only if `apps/desktop/src/ui/components/structured/StructuredFieldInput.stories.tsx` or `apps/desktop/src/ui/components/structured/ComponentCheckboxes.stories.tsx` changed.

Run:

```bash
cd apps/desktop
pnpm test:storybook
```

Expected: story state normalization changes did not break the story-driven coverage the visual plan depends on.

- [ ] **Step 7.2: Run lint and types for the desktop app**

Run:

```bash
cd apps/desktop
pnpm lint
pnpm tsc --noEmit
```

Expected: no new lint or type regressions from tests, selectors, or documentation-adjacent code edits.

- [ ] **Step 7.3: Run the full Playwright suite for confidence in touched flows**

Run:

```bash
cd apps/desktop
pnpm tauri:build --debug
npx playwright test
```

Expected: full E2E suite passes, including preserved modal scenarios outside the directly migrated files.

- [ ] **Step 7.3a: Run one final dialog-marker audit across the authoritative Step 2.1a inventory**

Run:

```bash
cd apps/desktop
final_inventory=$(cat ../../.tmp/chunk6-spell-library-ledger.txt)
rg -n '(handleCustomModal\(|Save Error|Validation Error|getByRole\(["'"''](?:dialog|alertdialog)["'"'']|locator\(["'"'']dialog["'"'']|modalAlert|modalConfirm|getByText\(["'"'']Save Error|getByText\(["'"'']Validation Error|toHaveCount\(0\).*dialog|not\.toBeVisible\(\).*dialog)' $final_inventory
```

Expected: every remaining match in the final Step 2.1a inventory is explainable as preserved modal coverage or explicit no-dialog protection, and the final classification is recorded in `Implementation Notes`.

- [ ] **Step 7.4: Verify the docs describe the shipped behavior rather than the plan language**

Run:

```bash
expected_docs=$(printf '%s\n' README.md docs/user/spell_editor.md docs/dev/spell_editor_components.md docs/TESTING.md docs/ARCHITECTURE.md | sort)
changed_required_docs=$(for path in README.md docs/user/spell_editor.md docs/dev/spell_editor_components.md docs/TESTING.md docs/ARCHITECTURE.md; do
   if ! cmp -s "$path" ".tmp/chunk6-doc-baseline/$path"; then
      echo "$path"
   fi
done | sort)
baseline_dirty_docs=$(cat .tmp/chunk6-doc-baseline/dirty-doc-paths.txt 2> /dev/null || true)
current_dirty_docs=$(git diff --name-only -- '*.md' | rg -v '^docs/superpowers/plans/2026-03-25-add-spell-ui-design-and-accessibility-chunk-6\.md$' | sort)
net_dirty_docs=$(comm -13 <(printf '%s\n' "$baseline_dirty_docs" | sort) <(printf '%s\n' "$current_dirty_docs" | sort))
extra_docs=$(printf '%s\n' "$net_dirty_docs" | rg -v '^(README.md|docs/user/spell_editor.md|docs/dev/spell_editor_components.md|docs/TESTING.md|docs/ARCHITECTURE.md)$' | sort)
diff <(printf '%s\n' "$expected_docs") <(printf '%s\n' "$changed_required_docs")
test -z "$extra_docs"
```

Then manually read the five documentation targets after tests are green.

Expected: wording matches actual behavior and test evidence, each of the five required docs differs from its saved baseline copy, and no extra repository docs file outside those five appears in the docs diff. This plan file may still be updated as execution bookkeeping and is explicitly excluded from the comparison.

- [ ] **Step 7.5: Update this plan file with completion notes and any residual low-risk follow-ups**

Append:
- commands run
- pass/fail outcomes
- snapshot files updated
- manual NVDA evidence summary
- any intentionally deferred low-risk follow-up not required by Chunk 6

---

## Acceptance Checklist

- [ ] All required modal-to-inline test migrations completed in the three targeted E2E files plus any additional spell/library specs uncovered by the Task 2 authoritative inventory, and the final Step 7.3a dialog-pattern audit plus Task 4 negative assertions show no leftover routine-validation dialog expectations across that inventory outside preserved modal cases.
- [ ] Preserved blocking/destructive dialogs still remain modal and covered.
- [ ] Workflow coverage explicitly includes first-spell creation, legacy basic-field edit from pre-existing legacy data with reopen-based persistence proof, legacy structured-field upgrade, validation handling, the explicit 300 ms delayed-save feedback check, conditional field transitions' observable collapsed/expanded end state, and library/search/character empty states.
- [ ] Accessibility coverage includes keyboard-only navigation, automated error-field association assertions, preserved modal focus-trap/focus-return verification, and manual NVDA evidence.
- [ ] Theme verification explicitly covers cold-start no-preference resolution, first-load persisted resolution, `/settings` persistence, follow-system behavior, and hidden live-region announcements.
- [ ] Manual NVDA validation evidence has been collected, documented, and matches the DOM/error-association contract verified in Step 4.6.
- [ ] Theme, live-region, stacked-toast, clipboard-copy, and modal-boundary verification are covered, including negative assertions that routine flows do not open dialogs.
- [ ] Edited views in both light and dark themes are explicitly exercised with the same assertions in both themes.
- [ ] Screenshot baselines cover the required structured states, editor themes, empty library, and hash display states, and the actual artifact names are recorded in `Implementation Notes`.
- [ ] `docs/user/spell_editor.md`, `README.md`, `docs/dev/spell_editor_components.md`, `docs/TESTING.md`, and `docs/ARCHITECTURE.md` all reflect the final shipped behavior.
- [ ] `pnpm lint`, `pnpm tsc --noEmit`, relevant unit tests, conditional `pnpm test:storybook` when stories changed, and `npx playwright test` have passed.

---

## Suggested Commit Slices For The Implementer

1. `test(chunk-6): migrate inline validation e2e assertions`
2. `test(chunk-6): add workflow and accessibility verification coverage`
3. `test(chunk-6): refresh visual regression baselines`
4. `docs(chunk-6): document final ui, testing, and architecture behavior`
