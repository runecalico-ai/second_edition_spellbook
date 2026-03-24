# Code Review — Chunk 5: Cross-App Accessibility and Resize Hardening

> **Branch:** `add-spell-ui-design-and-accessibility`
> **Plan document:** `docs/superpowers/plans/2026-03-22-add-spell-ui-design-and-accessibility-chunk-5.md`
> **Review date:** 2026-03-24
> **Three independent review passes conducted:** Pass 1 (Spec Completeness), Pass 2 (Spec Accuracy), Pass 3 (Edge Cases & Gaps)

---

## Summary

**Total: 19 findings — 0 Critical, 4 High, 7 Medium, 8 Low**

---

## Findings

### High

---

**[H-001] (67) — Structured spell-editing components missing `focus-visible:ring` classes entirely**

Plan ref: Task 3 — "Add `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900` to ALL interactive elements" including structured components

Location: Four files — `apps/desktop/src/ui/components/structured/DamageForm.tsx` (all `<select>`, `<input>`, `<textarea>`, `<button>` elements); `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx` (`structuredSelectClass` and `structuredInputClass` constants, lines 41–46); `apps/desktop/src/ui/components/structured/ScalarInput.tsx` (mode `<select>` line 121; numeric `<input>` line 154); `apps/desktop/src/ui/components/structured/AreaForm.tsx` (`areaSelectClass` and all `<input>` / `<textarea>` elements)

Detail: None of these four components have any `focus-visible:ring-*` Tailwind class on their interactive controls. The `structuredSelectClass`, `structuredInputClass`, `selectSurfaceClass`, and `areaSelectClass` constants all omit focus rings entirely. These are the primary structured-field editors for Range, Duration, CastingTime, Damage, and Area — the core of the spell-editing workflow. Keyboard users receive zero visible focus indicator when navigating these controls. This is the largest single accessibility gap in the Chunk 5 delivery: Task 3 explicitly required the ring pattern on all interactive elements, and these files were listed as "touched files" in the plan.

---

**[H-002] (61) — Modal focus-return guard missing `instanceof HTMLElement` check**

Plan ref: Task 1 — "Focus return: call `triggerRef.current.focus()` only if `instanceof HTMLElement` AND `isConnected`"

Location: `apps/desktop/src/ui/components/Modal.tsx`, focus-return block (~line 65)

Detail: The implementation checks `triggerRef.current.isConnected` before calling `.focus()`, but does NOT perform the `instanceof HTMLElement` check the plan explicitly requires. The `triggerRef` is typed as `useRef<HTMLElement | null>(null)`, which means TypeScript does not enforce a runtime check. The plan documented this as a named safety contract — skipping the `instanceof` guard means a non-HTMLElement object (e.g., an SVG element or a detached node whose type changed) could have `.focus()` called on it, throwing a TypeError at runtime. The implementation is correct in the common case but missing a defensive guard the plan specified.

---

**[H-003] (58) — Library `<h1>` text is "Library" not "Spell Library"**

Plan ref: Task 4 — "Library: `<h1>Spell Library</h1>` — exact text"

Location: `apps/desktop/src/ui/Library.tsx`, line 334 — `<h1 className="text-xl font-bold">Library</h1>`

Detail: The plan's heading hierarchy table explicitly specifies the exact heading text as "Spell Library". The implementation renders "Library". Note that Task 4 steps are marked `- [ ]` (incomplete) in the plan document, so this may be a known open item, but the factual deviation from the spec stands. Screen readers announce this heading as the page's accessible name — "Library" is less descriptive than the application's full name for this page.

---

**[H-004] (55) — SpellEditor heading level skip: `<h1>` → `<h3>` with no intervening `<h2>`**

Plan ref: Task 4 — "Do NOT skip heading levels (e.g., go from h1 to h3 without h2)"; SpellEditor requires "`<h2>` for Basic Information, Structured Fields, Components sections"

Location: `apps/desktop/src/ui/SpellEditor.tsx` — `<h1>` at line 2118, `<h3>` ("Provenance (Imports)") at line 3018; no `<h2>` elements in the file

Detail: SpellEditor has exactly one `<h1>` and one `<h3>` with zero `<h2>` elements. The plan required `<h2>` subheadings for the three form sections (Identity / Basic Info, Structured Fields, Components / Provenance). Assistive technology encounters a jump from heading level 1 to level 3, which is a WCAG 1.3.1 (Info and Relationships) violation. The "Provenance (Imports)" `<h3>` block is conditionally rendered only when artifacts exist, so the broken hierarchy appears only in some sessions but is a structural defect when it does. Task 4 steps are marked `- [ ]` in the plan, confirming this is a known incomplete item.

---

### Medium

---

**[M-001] (44) — Modal `<dialog>` applies `flex` conditionally, not as a static class**

Plan ref: Task 1 — `<dialog>` styled as `"fixed inset-0 m-0 flex h-full w-full max-h-none max-w-none items-center justify-center bg-transparent p-4 border-none"` (all static)

Location: `apps/desktop/src/ui/components/Modal.tsx`, dialog element className (~line 158)

Detail: The plan specifies `flex items-center justify-center` as part of the static class string. The implementation uses `[&[open]]:flex` (Tailwind arbitrary variant selector — flex is applied only when the `[open]` attribute is present on the dialog). `items-center` and `justify-center` may not be applied when the dialog is closed but still in the DOM. While functionally the flex layout only matters when visible, this deviates from the plan's explicitly specified class list and introduces an undocumented `[open]`-state dependency. Additionally `z-[100]` and `overflow-y-auto` are present in the implementation but were not in the plan's specified className.

---

**[M-002] (39) — E2E focus-trap tab loop minimum floor is 8, plan specifies 5**

Plan ref: Task 7 — "Tab (count + 2) times... `const tabCount = Math.max(focusableCount + 2, 5)`"

Location: `apps/desktop/tests/accessibility_and_resize.spec.ts`, line 197 — `Math.max(focusableCount + 2, 8)`

Detail: The plan specifies a minimum tab loop count of `Math.max(focusableCount + 2, 5)` (floor of 5). The implementation uses a floor of 8. If the VaultMaintenanceDialog has only 1 focusable element (the Close button), the test will tab 8 times instead of the plan's 5, each time calling `page.evaluate()`. At slow CI speeds this increases test duration and may approach timeout thresholds. More importantly, it is a literal deviation from the plan's specified formula that could cause test instability.

---

**[M-003] (37) — Library tab-order E2E test uses `library-search-input` testid; plan specifies `search-input`**

Plan ref: Task 7 — "Focus the search input first... `page.getByTestId('search-input').or(page.getByRole('searchbox'))`"

Location: `apps/desktop/tests/accessibility_and_resize.spec.ts`, lines 255–258

Detail: The plan specifies `search-input` as the primary testid, with `getByRole("searchbox")` as fallback. The implementation uses `library-search-input` as the primary testid (which is the actual testid in Library.tsx) — the plan's `search-input` testid is not what the Library component actually uses. While the test correctly targets the right element, the deviation from the plan's testid specification means the `or()` fallback path is the one actually executing, not the primary path the plan specified. The plan's `search-input` testid requirement appears to be based on an incorrect assumption about the Library component's testid.

---

**[M-004] (35) — `DamageForm` uses hardcoded dark-mode-only colors without light-mode variants**

Plan ref: Task 6 — Color contrast audit for all structured component files; consistency with the project color palette

Location: `apps/desktop/src/ui/components/structured/DamageForm.tsx`, e.g., lines 217, 235, 274, 291 — `bg-neutral-900 border border-neutral-700 text-neutral-100` without `dark:` prefixes

Detail: `DamageForm` controls use dark-mode colors as defaults with no light-mode variants (no `dark:` prefix needed because the dark values are used unconditionally). In light mode, these controls appear as dark-background-with-light-text islands surrounded by light-theme content — an incorrect inversion. Other structured components (`StructuredFieldInput`, `AreaForm`, `ScalarInput`) correctly use `dark:` prefix variants. The Task 6 audit was supposed to cover all structured component files, but DamageForm was apparently missed.

---

**[M-005] (33) — `border-neutral-300` remains in `SpellbookBuilder.tsx` while touched components use `border-neutral-500`**

Plan ref: Task 6, Step 6.4 — "Be consistent. Do not mix upgraded borders in some components and kept `border-neutral-300` in others."

Location: `apps/desktop/src/ui/SpellbookBuilder.tsx`, 14+ occurrences of `border-neutral-300` on interactive controls

Detail: `SpellEditor.tsx`, `SettingsPage.tsx`, `App.tsx`, and structured sub-components all use `border-neutral-500` for the upgraded contrast value (or have the deviation comment). `SpellbookBuilder.tsx` retains `border-neutral-300` across 14 interactive controls. SpellbookBuilder was not listed in Task 6's explicit file scope, but the plan's consistency rule states the choice must be applied uniformly once adopted. Whether the exclusion was intentional is undocumented.

---

**[M-006] (30) — Disabled Save button contrast gap: Task 6 audit not evidenced for disabled-state colors**

Plan ref: Task 6, Step 6.3b — "Also audit disabled button text: disabled buttons that use `text-neutral-500` on `bg-neutral-100` light: check the combination."

Location: `apps/desktop/src/ui/SpellEditor.tsx`, Save Spell button line ~2217 — `disabled:bg-blue-300 disabled:text-blue-950`

Detail: The disabled state uses `disabled:bg-blue-300 disabled:text-blue-950` in light mode. The combination `blue-950 on blue-300` (~5.2:1) technically passes, but this was never explicitly verified in the plan's audit trail, no test covers it, and a future color change could silently break the contrast ratio with no automated guard.

---

**[M-007] (28) — `DamageForm` missing `aria-invalid` and `aria-describedby` for error states**

Plan ref: Task 5 — "`aria-invalid='true'` and `aria-describedby` pointing to error element id for invalid fields"; DamageForm listed as "touched file" for label/ARIA audit

Location: `apps/desktop/src/ui/components/structured/DamageForm.tsx` — all `<input>` and `<textarea>` elements (formula, per-die-modifier, ticks, flat-increment, notes, etc.)

Detail: DamageForm inputs have no `aria-invalid` or `aria-describedby` attributes. The plan lists DamageForm as a "Modify" file for Task 5's label/ARIA audit. Without these attributes, any error state on damage fields has no accessibility announcement path. While DamageForm may not currently display per-field inline errors, wiring the ARIA attributes was a Task 5 audit requirement.

---

### Low

---

**[L-001] (20) — CSS backdrop uses `background:` shorthand instead of `background-color:`**

Plan ref: Task 1, Step 1.4 — "Add `dialog::backdrop { background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); }`"

Location: `apps/desktop/src/index.css`, line 6 — `background: rgba(0, 0, 0, 0.6)`

Detail: The plan specifies `background-color` as the property name. The implementation uses `background` (shorthand). These are functionally equivalent in this context but technically deviate from the plan's literal specification. The comment about the fallback is correct and present.

---

**[L-002] (18) — Four Modal unit test names differ from plan's exact wording**

Plan ref: Task 1, Step 1.2 — exact test name strings specified in the plan

Location: `apps/desktop/src/ui/components/Modal.test.tsx`, tests 4, 5, 6, and 7

Detail:
- Test 4: plan says `"does NOT call onRequestClose when Escape fires and dismissible=false"` → implementation has lowercase "not"
- Test 5: plan says `"calls onRequestClose when backdrop area (dialog element) is clicked and dismissible=true"` → implementation says `"...when the dialog root is clicked..."`
- Test 6: plan says `"does NOT call onRequestClose when clicking inside the content box"` → implementation says `"...when clicking inside modal content"`
- Test 7: plan says `"dialog element remains in DOM when isOpen is false (always-render invariant)"` → implementation omits the parenthetical

Test coverage is complete; only the names differ.

---

**[L-003] (15) — E2E resize tests use additional fallback locators beyond plan specification**

Plan ref: Task 2, Step 2.1 — "click `empty-library-create-button`, wait for `spell-name-input` visible"

Location: `apps/desktop/tests/accessibility_and_resize.spec.ts`, lines 21–27

Detail: The plan specifies a direct `getByTestId("empty-library-create-button")` click and `getByTestId("spell-name-input")` wait. The implementation adds `.or(page.getByRole("button", { name: /create spell/i })).first()` fallback for the button click and a comma-separated locator fallback for the input wait. These robustness additions are arguably improvements but deviate from the exact locators the plan specified.

---

**[L-004] (14) — Escape E2E omission comment contains a factual inaccuracy**

Plan ref: Task 7, Step 7.0b — "The `onCancel` handler is fully covered by the unit tests in Task 1 (cancel event simulation). E2E Escape behavior cannot be reliably tested without a controllable dismissible modal trigger."

Location: `apps/desktop/tests/accessibility_and_resize.spec.ts`, lines 235–239

Detail: The omission comment states "all modals reachable from header buttons use dismissible:false" as justification. However, `App.tsx` contains a startup vault warning modal (`createVaultStartupWarningModal`) with `dismissible: true`. The omission is still correct (the startup modal is not reliably triggerable in E2E), but the stated reason is factually incomplete and could mislead future developers into believing no dismissible modal code path exists.

---

**[L-005] (12) — Modal test suite does not assert `e.preventDefault()` is called on both `onCancel` branches**

Plan ref: Task 1 — `onCancel` handler: "`e.preventDefault()` always, call `onRequestClose()` only if dismissible" (two separate guarantees)

Location: `apps/desktop/src/ui/components/Modal.test.tsx`, `onCancel` tests

Detail: The `onCancel` tests correctly verify that `onRequestClose` is called (dismissible=true) or not called (dismissible=false). However, neither test asserts that `event.defaultPrevented === true`. The implementation correctly calls `e.preventDefault()` unconditionally, but if a future refactor moves it inside the `if (dismissible)` branch, all tests would still pass while the critical contract (browser must not close the dialog directly) would be broken.

---

**[L-006] (10) — Plan document states "7 total tests"; implementation has 14**

Plan ref: Task 1, Step 1.6 — "Expected: All 7 tests PASS (6 written in Step 1.2 + 1 always-render invariant test... = 7 total)"

Location: `apps/desktop/src/ui/components/Modal.test.tsx` — 14 `it()` blocks

Detail: The plan expected 7 tests; the implementation delivers 14 (additional coverage for Tab-wrap, Shift+Tab, focus-clamp for non-focusable elements, focus-return to opener, fallback to body). The additional tests are valuable improvements. The plan document's stated count of 7 is now inaccurate and should be updated to reflect 14.

---

**[L-007] (9) — `WarningBanner` uses `text-amber-900/dark:text-amber-100` instead of plan's `text-yellow-700/dark:text-yellow-400`**

Plan ref: Task 6, Step 6.2 — "Fix `text-yellow-500` on `bg-white` → use `text-yellow-700 dark:text-yellow-400` for warning text labels"

Location: `apps/desktop/src/ui/components/WarningBanner.tsx`, line 18

Detail: `WarningBanner` uses `text-amber-900 dark:text-amber-100`. The plan's Task 6 requirement specifies `text-yellow-700 dark:text-yellow-400` for warning text. `text-amber-900` is darker (passes contrast), but `dark:text-amber-100` is significantly brighter than `dark:text-yellow-400`, creating a visual inconsistency with the warning text color standard the rest of the app follows.

---

**[L-008] (7) — `text-yellow-500` remains in `CharacterEditor.tsx` and `SpellbookBuilder.tsx`**

Plan ref: Task 6, Step 6.2 — Fix `text-yellow-500` on light backgrounds (2.7:1, fails WCAG)

Location: `apps/desktop/src/ui/CharacterEditor.tsx` lines 949 and 1367; `apps/desktop/src/ui/SpellbookBuilder.tsx` line 668

Detail: These files are outside Task 6's explicit file scope, so this is not a direct Chunk 5 obligation. Noted for tracking: `text-yellow-500` on white fails at 2.7:1, and these usages were not patched. A future accessibility pass should address them.

---

## Coverage Confirmed Correct

The following plan requirements were verified as correctly implemented:

- **Task 1:** `showModal()`/`close()` useEffect, `if (!isOpen) return null` guard removed, `dialog.open` guard in useEffect, `onCancel` correctly delegates, backdrop click `e.target === e.currentTarget` check, `triggerRef` captured before `showModal()`, `<Modal />` in App.tsx rendered unconditionally (line 346), `isConnected` fallback to body on focus return
- **Task 2:** All three resize tests present with correct titles, skip guard present in all three tests, populated-data test uses `app.openSpell()`
- **Task 3:** `SpellEditor.tsx`, `Library.tsx`, `SettingsPage.tsx`, `App.tsx` — all have `focus-visible:ring` classes on interactive elements; settings gear uses `focus-visible:` not `focus:`; spell name input has `onKeyDown` Enter handler (line 2303–2310)
- **Task 5:** `aria-labelledby="settings-appearance-heading"` + `id="settings-appearance-heading"` pairing in SettingsPage still intact; Library Radix Slider thumb `aria-label` values are required (no visible label), not redundant
- **Task 6:** `text-red-700 dark:text-red-400` correctly applied for error text on red-tinted backgrounds; `text-yellow-700 dark:text-yellow-400` applied in SpellEditor and Library; `border-neutral-300` deviation comment present in App.tsx and SettingsPage.tsx
- **Task 7:** `btn-close-vault-maintenance` testid confirmed in VaultMaintenanceDialog.tsx; `dialog.contains(activeElement)` check correct; focus-return uses `toPass({ timeout: TIMEOUTS.short })`; Escape E2E test intentionally absent; `Modal />` is rendered unconditionally
