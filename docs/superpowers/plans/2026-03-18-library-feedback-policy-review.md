# Library: Feedback Policy Application — Three-Pass Code Review

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify every modal/alert usage in touched spell and library flows, classify each as compliant or non-compliant with the feedback decision policy, and produce a prioritized implementation plan to bring all non-compliant usages into spec.

**Architecture:** The app uses a Zustand `useModal` store for structural modals and raw `alert()`/`confirm()` calls for ad-hoc feedback. The spec requires routine status to move to a transient toast system (not yet built) and validation errors to move inline (partially implemented).

**Tech Stack:** React + TypeScript + Tauri, Zustand, Tailwind CSS, Playwright E2E

---

## Review Scope

Two task items under `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` → **library › Feedback policy application**:

1. **Item A**: _"Replace modal alerts used for routine status in touched spell and library flows with inline or transient non-modal feedback."_
2. **Item B**: _"Preserve modal/dialog usage for destructive confirmations, blocking decisions, and rare high-severity errors only."_

**Touched flows** = spell editor save/validation, library spell management (add-to-character, save/delete saved search).
**Out of scope** = character, vault, import flows.

---

## Chunk 1: Pass 1 — Modal/Alert Inventory

Three files were audited: [SpellEditor.tsx](apps/desktop/src/ui/SpellEditor.tsx), [Library.tsx](apps/desktop/src/ui/Library.tsx), [SpellbookBuilder.tsx](apps/desktop/src/ui/SpellbookBuilder.tsx). App.tsx and out-of-scope files were catalogued for completeness.

### SpellEditor.tsx — Touched Flow Usages

| Line | Trigger | Content | API |
|------|---------|---------|-----|
| [1698](apps/desktop/src/ui/SpellEditor.tsx#L1698) | Save with validation errors | Array of validation error strings | `modalAlert(…, "Validation Errors", "error")` |
| [1864](apps/desktop/src/ui/SpellEditor.tsx#L1864) | Save operation fails | `Failed to save: ${e}` | `modalAlert(…, "Save Error", "error")` |
| [1871](apps/desktop/src/ui/SpellEditor.tsx#L1871) | Delete spell button | "Are you sure you want to delete this spell?" | `modalConfirm(…, "Delete Spell")` |
| [1882](apps/desktop/src/ui/SpellEditor.tsx#L1882) | Delete operation fails | `Failed to delete: ${e}` | `modalAlert(…, "Delete Error", "error")` |
| [1986](apps/desktop/src/ui/SpellEditor.tsx#L1986) | Cancel button + unsaved | "You have unsaved changes. Leave and discard?" | `modalConfirm(…, "Unsaved changes")` |
| [2034](apps/desktop/src/ui/SpellEditor.tsx#L2034) | Hash copy succeeds | "Hash copied to clipboard." | `modalAlert(…, "Copied", "success")` |
| [2036](apps/desktop/src/ui/SpellEditor.tsx#L2036) | Hash copy fails | "Failed to copy hash." | `modalAlert(…, "Copy Error", "error")` |
| [744](apps/desktop/src/ui/SpellEditor.tsx#L744) | Navigation blocker | "You have unsaved changes. Leave and discard?" / "Unparsed fields…" | `modalConfirm` via `useBlocker` |
| [2429](apps/desktop/src/ui/SpellEditor.tsx#L2429) | Uncheck Material checkbox | "Clear all material component data?" | `modalConfirm` |
| [2611](apps/desktop/src/ui/SpellEditor.tsx#L2611) | Reparse from artifact | "Re-parse this spell from the original artifact file? This will overwrite manual changes." | `modalConfirm` |
| [2621](apps/desktop/src/ui/SpellEditor.tsx#L2621) | Reparse succeeds | "Spell re-parsed successfully!" | `modalAlert(…, "Reparse Complete", "success")` |
| [2627](apps/desktop/src/ui/SpellEditor.tsx#L2627) | Reparse fails | `Reparse failed: ${e}` | `modalAlert(…, "Reparse Error", "error")` |

### Library.tsx — Touched Flow Usages

| Line | Trigger | Content | API |
|------|---------|---------|-----|
| [140](apps/desktop/src/ui/Library.tsx#L140) | Save search fails | `Failed to save search: ${e}` | `alert(…)` native |
| [183](apps/desktop/src/ui/Library.tsx#L183) | Delete saved search initiated | "Delete this saved search?" | `window.confirm(…)` native |
| [188](apps/desktop/src/ui/Library.tsx#L188) | Delete saved search fails | `Failed to delete saved search: ${e}` | `alert(…)` native |
| [267](apps/desktop/src/ui/Library.tsx#L267) | Add spell to character succeeds | "Spell added to character!" | `alert(…)` native |
| [269](apps/desktop/src/ui/Library.tsx#L269) | Add spell to character fails | `Failed to add spell: ${e}` | `alert(…)` native |

### SpellbookBuilder.tsx — Touched Flow Usages

| Line | Trigger | Content | API |
|------|---------|---------|-----|
| [137](apps/desktop/src/ui/SpellbookBuilder.tsx#L137) | Add spell to spellbook fails | `Failed to add spell: ${e}` | `alert(…)` native |
| [150](apps/desktop/src/ui/SpellbookBuilder.tsx#L150) | Remove spell fails | `Failed to remove spell: ${e}` | `alert(…)` native |
| [~168](apps/desktop/src/ui/SpellbookBuilder.tsx#L168) | Update spell fails | `Failed to update ${entry.spellName}: ${e}` | `setStatusMessage` inline ✓ |

> Note: SpellbookBuilder.tsx line ~168 already uses `setStatusMessage` for inline feedback — this is the correct pattern and serves as a reference.

### Out-of-Scope Catalog (do not modify)

- **App.tsx**: Vault integrity warnings/failures (lines 178–193) → high-severity system modals, preserve
- **App.tsx**: Backup/Restore success+error modals (lines 117–142) → App-level, not spell/library flow; convert in a future change if desired
- **ImportWizard.tsx**: 8 error locations (lines 498, 543, 569, 610, 654, 686, 728, 767) → import flow, out of scope
- **ImportWizard.tsx line 510**: Large file confirmation — blocking decision, MUST STAY
- **CharacterEditor.tsx**, **CharacterManager.tsx**, **CharacterImportWizard.tsx**: 27+ locations — all out of scope per spec

---

## Chunk 2: Pass 2 — Spec Compliance Analysis (Item A)

Policy from `design.md` Decision 5:

| Use modal for | Use non-modal for |
|---|---|
| Destructive/irreversible confirmations | Successful saves |
| Blocking choices (user must decide before continuing) | Clipboard copy success |
| Rare high-severity errors requiring explicit acknowledgment | Add-to-character confirmation |
| | Validation guidance fixable in place |
| | Other transient status updates |

### Compliance Verdict — SpellEditor.tsx Touched Flows

| Line | Verdict | Reasoning |
|------|---------|-----------|
| [1698](apps/desktop/src/ui/SpellEditor.tsx#L1698) | ❌ NON-COMPLIANT | Validation errors are in-place fixable. design.md: "Validation becomes **field-level and inline**, not modal-driven." Modal blocks form interaction unnecessarily. |
| [1864](apps/desktop/src/ui/SpellEditor.tsx#L1864) | ❌ NON-COMPLIANT | Save failure is transient, non-blocking. User stays on editor and retries. Toast is sufficient. |
| [1871](apps/desktop/src/ui/SpellEditor.tsx#L1871) | ✅ COMPLIANT | Destructive delete confirmation. Permanently removes spell. MUST STAY. |
| [1882](apps/desktop/src/ui/SpellEditor.tsx#L1882) | ❌ NON-COMPLIANT | Delete failure is transient, not a blocking decision. Toast is sufficient. |
| [1986](apps/desktop/src/ui/SpellEditor.tsx#L1986) | ✅ COMPLIANT | Blocking decision: user must choose to discard or stay. MUST STAY. |
| [2034](apps/desktop/src/ui/SpellEditor.tsx#L2034) | ❌ NON-COMPLIANT | Clipboard copy success is explicitly listed in design.md as non-modal. "Replace modal-based copy confirmation with transient non-modal success feedback plus a polite live-region announcement." |
| [2036](apps/desktop/src/ui/SpellEditor.tsx#L2036) | ❌ NON-COMPLIANT | Clipboard copy failure is transient and non-blocking. Toast is sufficient. |
| [744](apps/desktop/src/ui/SpellEditor.tsx#L744) | ✅ COMPLIANT | Navigation blocker — workflow gate requiring explicit user decision. Spec explicitly lists this as safe. MUST STAY. |
| [2429](apps/desktop/src/ui/SpellEditor.tsx#L2429) | ✅ COMPLIANT | Destructive: clearing all material component data is irreversible. MUST STAY. |
| [2611](apps/desktop/src/ui/SpellEditor.tsx#L2611) | ✅ COMPLIANT | Destructive: overwriting manual edits from artifact reparse is irreversible. MUST STAY. |
| [2621](apps/desktop/src/ui/SpellEditor.tsx#L2621) | ❌ NON-COMPLIANT (low priority) | Reparse success is transient status. Toast is sufficient. Note: reparse itself is an artifact/vault flow — borderline out-of-scope. |
| [2627](apps/desktop/src/ui/SpellEditor.tsx#L2627) | ❌ NON-COMPLIANT (low priority) | Reparse failure is transient. Toast sufficient. Same borderline out-of-scope note. |

### Compliance Verdict — Library.tsx Touched Flows

| Line | Verdict | Reasoning |
|------|---------|-----------|
| [140](apps/desktop/src/ui/Library.tsx#L140) | ❌ NON-COMPLIANT | Save search failure is transient error. Toast is sufficient. |
| [183](apps/desktop/src/ui/Library.tsx#L183) | ✅ COMPLIANT (with issue) | Destructive: deletes saved search. Confirmation is correct. **Issue**: uses `window.confirm()` instead of `modalConfirm()` — inconsistent API. Should be standardized in a follow-up or as part of this task. |
| [188](apps/desktop/src/ui/Library.tsx#L188) | ❌ NON-COMPLIANT | Delete search failure is transient error. Toast sufficient. |
| [267](apps/desktop/src/ui/Library.tsx#L267) | ❌ NON-COMPLIANT | Add-to-character success is explicitly listed in design.md as non-modal feedback. |
| [269](apps/desktop/src/ui/Library.tsx#L269) | ❌ NON-COMPLIANT | Add-to-character failure is transient. Toast sufficient. |

### Compliance Verdict — SpellbookBuilder.tsx Touched Flows

| Line | Verdict | Reasoning |
|------|---------|-----------|
| [137](apps/desktop/src/ui/SpellbookBuilder.tsx#L137) | ❌ NON-COMPLIANT | Add to spellbook failure is transient. Toast sufficient. |
| [150](apps/desktop/src/ui/SpellbookBuilder.tsx#L150) | ❌ NON-COMPLIANT | Remove from spellbook failure is transient. Toast sufficient. |

### Summary: 11 NON-COMPLIANT, 6 COMPLIANT (touched flows only)

---

## Chunk 3: Pass 2 — Spec Compliance Analysis (Item B)

> Item B: _"Preserve modal/dialog usage for destructive confirmations, blocking decisions, and rare high-severity errors only."_

### Preserved Modals — Complete Inventory

The following modals are correctly classified as MUST STAY and must not be converted:

| Location | Content | Classification | Test Covered |
|----------|---------|----------------|--------------|
| [SpellEditor.tsx:744](apps/desktop/src/ui/SpellEditor.tsx#L744) | "Unsaved changes" / "Unparsed fields" navigation blocker | Blocking decision | ✅ spec_editor_canon_first lines 1292, 1297, 1643, 1654, 1665; structured_data line 629 |
| [SpellEditor.tsx:1871](apps/desktop/src/ui/SpellEditor.tsx#L1871) | "Delete Spell" confirmation | Destructive | ✗ No test |
| [SpellEditor.tsx:1986](apps/desktop/src/ui/SpellEditor.tsx#L1986) | "Unsaved changes" (Cancel btn) | Blocking decision | ✅ Covered by blocker tests |
| [SpellEditor.tsx:2429](apps/desktop/src/ui/SpellEditor.tsx#L2429) | "Clear material component data?" | Destructive | ✗ No test |
| [SpellEditor.tsx:2611](apps/desktop/src/ui/SpellEditor.tsx#L2611) | "Reparse from artifact?" | Destructive | ✗ No test |
| [Library.tsx:183](apps/desktop/src/ui/Library.tsx#L183) | "Delete this saved search?" | Destructive | ✗ No test |
| [App.tsx:127](apps/desktop/src/ui/App.tsx#L127) | "Restore database — OVERWRITE" | Destructive | ✗ No test |
| [App.tsx:178–183](apps/desktop/src/ui/App.tsx#L178) | Vault integrity warning | High-severity system | ✗ No test |
| [App.tsx:187–193](apps/desktop/src/ui/App.tsx#L187) | Vault startup check failure | High-severity system | ✗ No test |
| [ImportWizard.tsx:510](apps/desktop/src/ui/ImportWizard.tsx#L510) | Large file preview warning | Blocking decision | ✗ No test |
| [ComponentCheckboxes.tsx:64](apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx#L64) | "Clear material data?" (fallback) | Destructive (fallback) | ✗ No test |

### Test Coverage Gap for Preserved Modals

Only 2 of 11 preserved destructive/blocking modals have E2E test coverage. The 9 uncovered ones are risk areas — if the modal store or components are refactored, these could silently break.

**Recommendation**: Add E2E coverage for at least the highest-risk ones (Delete Spell, Delete Saved Search, Restore Database).

### API Inconsistency

[Library.tsx:183](apps/desktop/src/ui/Library.tsx#L183) uses `window.confirm()` (native browser dialog) instead of `modalConfirm()` (the app's modal framework). This is MUST STAY functionally, but should be standardized to `modalConfirm()` for visual consistency.

---

## Chunk 4: Pass 3 — Implementation Plan

### Prerequisites (must exist before touched-flow changes)

#### Prerequisite P1: Toast Notification System

All 10 non-compliant usages require a transient toast/notification system. This is defined in `tasks.md` under `theme-and-feedback › Tooltip and Notification Patterns`:

```
- Build a minimal non-modal notification component
- Semantic: role="status" / polite announcement
- Position and stacking: fixed portal with bounded visible count
- Mount in src/ui/App.tsx
```

**Expected shape** (implementation guidance):
- Store: `src/store/useNotification.ts` — Zustand store with `success(msg)`, `error(msg)`, `warning(msg)` methods
- Component: `src/ui/components/Toast.tsx` — renders portal with bounded stack
- Data-testids: `toast-notification-success`, `toast-notification-warning`, `toast-notification-error`
- `aria-live="polite"` on container; also serves as clipboard copy live-region

**This plan does NOT implement the toast system.** It assumes it exists. If running this plan, implement P1 (from the theme-and-feedback task) first.

#### Prerequisite P2: Inline Validation Already Partially Implemented

[SpellEditor.tsx:2072–2074](apps/desktop/src/ui/SpellEditor.tsx#L2072) shows the correct inline error pattern:

```tsx
{isNameInvalid && (
  <p className="text-xs text-red-400 mt-1" data-testid="error-name-required">
    Name is required.
  </p>
)}
```

Field-level errors for school/sphere/tradition are also already rendered inline (lines ~2174, ~2193, ~2218, ~2225). The main gap is that the `save()` function still calls `modalAlert(validationErrors, …)` at line 1698 in **addition** to these inline errors.

---

### Task 1: Remove Validation Error Modal — SpellEditor.tsx

**Files:**
- Modify: [apps/desktop/src/ui/SpellEditor.tsx:1695–1700](apps/desktop/src/ui/SpellEditor.tsx#L1695)
- Test: `apps/desktop/tests/spell_editor_structured_data.spec.ts` (8 migration sites)
- Test: `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- Test: `apps/desktop/tests/spell_editor_canon_first.spec.ts`

- [ ] **Step 1: Verify inline errors render on submit attempt**

  Read [SpellEditor.tsx lines 1694–1702](apps/desktop/src/ui/SpellEditor.tsx#L1694) and confirm the current flow:
  ```
  const isInvalid = validationErrors.length > 0;
  const save = async () => {
    if (isInvalid) {
      await modalAlert(validationErrors, "Validation Errors", "error");  // ← remove this
      return;
    }
  ```

- [ ] **Step 2: Remove the modalAlert call**

  In `save()`, replace the validation modal block with a simple early return:
  ```tsx
  const save = async () => {
    if (isInvalid) {
      return; // Inline field errors are already rendered in JSX
    }
    // ...
  ```

- [ ] **Step 3: Verify inline error testids exist for all validation cases**

  Check that each error in `validationErrors` has a corresponding inline `data-testid`:
  - `error-name-required` — line ~2072 ✓ (**see naming note below**)
  - `error-level-range` — line ~2133 ✓
  - `error-epic-quest-conflict` — line ~2148 ✓
  - `error-tradition-conflict` — line ~2174 ✓
  - `error-school-required-arcane` / `error-school-required-arcane-tradition` — lines ~2193, ~2200 ✓
  - `error-sphere-required-divine` / `error-sphere-required-divine-tradition` — lines ~2218, ~2225 ✓
  - `error-description-required` — line ~2593 ✓
  - `warning-epic-arcane` — line ~2138 ✓ (yellow warning, inline, covers `isEpicRestricted`)
  - `warning-quest-divine` — line ~2143 ✓ (yellow warning, inline, covers `isQuestRestricted`)
  - **Missing**: `isCantripRestricted` ("Cantrips must be Level 0") has no inline display element — add one adjacent to the level field

  > **⚠️ testid naming conflict**: The spec's `{fieldname}-error` pattern (tasks.md data-testid table) requires `spell-name-error` for the name field. The current code uses `error-name-required`. These are **different testids**. The test migration at line 541–544 targets `spell-name-error`. **Resolution required**: rename the testid at SpellEditor.tsx:2072 from `error-name-required` to `spell-name-error` before migrating that test location. All other existing tests using `error-name-required` must be updated in the same commit.

- [ ] **Step 4: Migrate test files** per verification.md fix pattern:

  For each location in the test migration list (see `tasks.md` lines 143–150), replace the `handleCustomModal(page, "OK")` call with an assertion on the inline error testid:
  ```ts
  // BEFORE
  await page.getByTestId("btn-save-spell").click();
  await handleCustomModal(page, "OK");

  // AFTER
  await page.getByTestId("btn-save-spell").click();
  await expect(page.getByTestId("error-school-required-arcane")).toBeVisible({ timeout: TIMEOUTS.short });
  await expect(page.getByRole("heading", { name: /Edit Spell|New Spell/ })).toBeVisible();
  ```

  Affected locations (DO NOT change the safe modals listed in `tasks.md` lines 152–156):
  - `spell_editor_structured_data.spec.ts` lines 62–70 → `error-school-required-arcane`
  - `spell_editor_structured_data.spec.ts` lines 84–94 → `error-sphere-required-divine`
  - `spell_editor_structured_data.spec.ts` lines 290–297 → `error-tradition-conflict`
  - `spell_editor_structured_data.spec.ts` lines 340–353 → `error-tradition-conflict`
  - `spell_editor_structured_data.spec.ts` lines 425–434 → inline error element
  - `spell_editor_structured_data.spec.ts` lines 541–544 → `spell-name-error`
  - `epic_and_quest_spells.spec.ts` lines 52–57 → inline error + update navigation
  - `spell_editor_canon_first.spec.ts` lines 575–583 → inline error (replaces `<dialog>` check)

- [ ] **Step 5: Run the migrated tests**

  ```bash
  cd apps/desktop && npx playwright test tests/spell_editor_structured_data.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_canon_first.spec.ts
  ```
  > **Note**: E2E tests run against the compiled binary. Before running, rebuild the frontend: `cd apps/desktop && pnpm build`

  Expected: All migrated test locations pass. Safe modal locations (lines 1292, 1297, 1643, 1654, 1665 of canon_first; line 629 of structured_data) still pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/tests/
  git commit -m "feat(library): remove validation modal, assert inline errors in tests"
  ```

---

### Task 2: Replace Hash Copy Modal with Toast — SpellEditor.tsx

**Files:**
- Modify: [apps/desktop/src/ui/SpellEditor.tsx:2031–2037](apps/desktop/src/ui/SpellEditor.tsx#L2031)

**Requires:** Prerequisite P1 (toast system) must be implemented first.

- [ ] **Step 1: Import notification hook**

  At top of SpellEditor.tsx add:
  ```tsx
  import { useNotification } from "../store/useNotification";
  ```
  Inside the component:
  ```tsx
  const notify = useNotification();
  ```

- [ ] **Step 2: Replace hash copy modal with toast**

  Current code at lines ~2031–2037:
  ```tsx
  onClick={async () => {
    try {
      await navigator.clipboard.writeText(form.contentHash ?? "");
      await modalAlert("Hash copied to clipboard.", "Copied", "success");
    } catch {
      await modalAlert("Failed to copy hash.", "Copy Error", "error");
    }
  }}
  ```

  Replace with:
  ```tsx
  onClick={async () => {
    try {
      await navigator.clipboard.writeText(form.contentHash ?? "");
      notify.success("Hash copied to clipboard.");
    } catch {
      notify.error("Failed to copy hash.");
    }
  }}
  ```

- [ ] **Step 3: Verify no focus shift on hash copy**

  Hash copy is a focus-preserving event. The toast container uses `role="status"` / `aria-live="polite"`, which fulfills the spec requirement: "screen reader users SHALL receive a polite live announcement."

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx
  git commit -m "feat(library): replace hash copy modal with toast notification"
  ```

---

### Task 3: Replace Save Error Modal with Toast — SpellEditor.tsx

**Files:**
- Modify: [apps/desktop/src/ui/SpellEditor.tsx:1863–1865](apps/desktop/src/ui/SpellEditor.tsx#L1863)

**Requires:** Prerequisite P1 (toast system).

- [ ] **Step 1: Replace save error modal**

  Current code at line ~1864:
  ```tsx
  } catch (e) {
    await modalAlert(`Failed to save: ${e}`, "Save Error", "error");
  }
  ```

  Replace with:
  ```tsx
  } catch (e) {
    notify.error(`Failed to save: ${e}`);
  }
  ```

  The user stays on the editor (no navigate call). They can retry.

- [ ] **Step 2: Replace delete error modal**

  Current code at line ~1882:
  ```tsx
  } catch (e) {
    await modalAlert(`Failed to delete: ${e}`, "Delete Error", "error");
  }
  ```

  Replace with:
  ```tsx
  } catch (e) {
    notify.error(`Failed to delete: ${e}`);
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx
  git commit -m "feat(library): replace save/delete error modals with toast notifications"
  ```

---

### Task 4: Replace Library alert() Calls with Toast — Library.tsx

**Files:**
- Modify: [apps/desktop/src/ui/Library.tsx](apps/desktop/src/ui/Library.tsx)

**Requires:** Prerequisite P1 (toast system).

- [ ] **Step 1: Import notification hook in Library.tsx**

  ```tsx
  import { useNotification } from "../store/useNotification";
  ```
  Inside component:
  ```tsx
  const notify = useNotification();
  ```

- [ ] **Step 2: Replace save search failure (line ~140)**

  ```tsx
  // BEFORE
  alert(`Failed to save search: ${e}`);
  // AFTER
  notify.error(`Failed to save search: ${e}`);
  ```

- [ ] **Step 3: Replace delete saved search failure (line ~188)**

  ```tsx
  // BEFORE
  alert(`Failed to delete saved search: ${e}`);
  // AFTER
  notify.error(`Failed to delete saved search: ${e}`);
  ```

  > The `confirm()` at line ~183 is a destructive confirmation — do NOT change it.

- [ ] **Step 4: Replace add-to-character success (line ~267)**

  ```tsx
  // BEFORE
  alert("Spell added to character!");
  // AFTER
  notify.success("Spell added to character!");
  ```

- [ ] **Step 5: Replace add-to-character failure (line ~269)**

  ```tsx
  // BEFORE
  alert(`Failed to add spell: ${e}`);
  // AFTER
  notify.error(`Failed to add spell: ${e}`);
  ```

- [ ] **Step 6: Standardize delete confirmation API (optional consistency fix)**

  Current code at line ~183:
  ```ts
  if (!confirm("Delete this saved search?")) return;
  ```
  Consider replacing with `modalConfirm()` for visual consistency:
  ```ts
  const ok = await modalConfirm("Delete this saved search?", "Delete Saved Search");
  if (!ok) return;
  ```
  This is a low-priority consistency fix. Only do this if the modal import is already present.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/desktop/src/ui/Library.tsx
  git commit -m "feat(library): replace alert() calls with toast notifications in Library"
  ```

---

### Task 5: Replace SpellbookBuilder alert() Calls with Toast

**Files:**
- Modify: [apps/desktop/src/ui/SpellbookBuilder.tsx](apps/desktop/src/ui/SpellbookBuilder.tsx)

**Requires:** Prerequisite P1 (toast system).

- [ ] **Step 1: Import notification hook**

  ```tsx
  import { useNotification } from "../store/useNotification";
  ```

- [ ] **Step 2: Replace add spell failure (line ~137)**

  ```tsx
  // BEFORE
  alert(`Failed to add spell: ${e}`);
  // AFTER
  notify.error(`Failed to add spell: ${e}`);
  ```

- [ ] **Step 3: Replace remove spell failure (line ~150)**

  ```tsx
  // BEFORE
  alert(`Failed to remove spell: ${e}`);
  // AFTER
  notify.error(`Failed to remove spell: ${e}`);
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellbookBuilder.tsx
  git commit -m "feat(library): replace alert() calls with toast notifications in SpellbookBuilder"
  ```

---

### Task 6: Add E2E Test Coverage for Preserved Destructive Modals

The review found 9 of 11 MUST-STAY modals have no E2E coverage. The highest-risk are:

**Files:**
- Add to: `apps/desktop/tests/spell_editor_canon_first.spec.ts` (delete spell confirmation)
- Create: `apps/desktop/tests/library.spec.ts` (new file for library-specific tests; no existing library spec file exists)

> **Note**: `spell_editor_core.spec.ts` and `library.spec.ts` do not currently exist. Existing spell editor specs are: `spell_editor_canon_first.spec.ts`, `spell_editor_structured_data.spec.ts`, `epic_and_quest_spells.spec.ts`.

- [ ] **Step 1: Add test for "Delete Spell" confirmation stays modal**

  ```ts
  test("delete spell requires confirmation and stays modal", async ({ page }) => {
    // Navigate to an existing spell
    await page.getByTestId("spell-link-fireball").click();
    // Click delete
    await page.getByTestId("btn-delete-spell").click();
    // Modal should appear
    await expect(page.getByRole("dialog")).toBeVisible();
    // Cancel — should stay on editor
    await handleCustomModal(page, "Cancel");
    await expect(page.getByRole("heading", { name: /Edit Spell/ })).toBeVisible();
  });
  ```

- [ ] **Step 2: Add test for "Delete Saved Search" confirmation stays modal**

  ```ts
  test("delete saved search requires confirmation", async ({ page }) => {
    // Create then attempt to delete a saved search
    // ...
    await page.getByTestId("btn-delete-saved-search").click();
    // A confirmation dialog or modal should appear
    // Cancel — saved search should still be present
    // Confirm — saved search should be removed
  });
  ```

- [ ] **Step 3: Run new tests**

  ```bash
  cd apps/desktop && pnpm build && npx playwright test tests/spell_editor_canon_first.spec.ts tests/library.spec.ts
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/tests/
  git commit -m "test(library): add E2E coverage for preserved destructive confirmation modals"
  ```

---

## Verification Checklist

After all tasks complete, verify the full feedback policy:

- [ ] **No routine-status modals remain** in spell editor save, validation, and hash copy flows
- [ ] **No routine-status modals remain** in Library add-to-character, save search, delete search failure flows
- [ ] **No routine-status modals remain** in SpellbookBuilder add/remove spell failure flows
- [ ] **Destructive confirmations are preserved**: Delete Spell (1871), Cancel with unsaved (1986), Navigation blocker (744), Clear material (2429), Reparse (2611), Delete saved search (Library 183), Restore database (App 127)
- [ ] **Test migration complete**: All 8 `handleCustomModal` sites in tasks.md migrated to inline error assertions
- [ ] **Safe modals untouched**: spell_editor_canon_first lines 1292, 1297, 1643, 1654, 1665 and structured_data line 629 still pass
- [ ] **All E2E tests pass**: `pnpm test:e2e`

---

## Summary: Change Impact Matrix

| File | Non-Compliant Changes | MUST STAY (no change) |
|------|-----------------------|-----------------------|
| SpellEditor.tsx | Lines 1698, 1864, 1882, 2034, 2036 | Lines 744, 1871, 1986, 2429, 2611 |
| Library.tsx | Lines 140, 188, 267, 269 | Line 183 (confirm preserved, API optional upgrade) |
| SpellbookBuilder.tsx | Lines 137, 150 | — |
| **Total** | **11 locations to convert** | **6+ locations to preserve** |

**Prerequisite blockers**: Toast notification system (theme-and-feedback task) must be built before Tasks 2–5 can be completed. Task 1 (validation modal removal) has no external dependency.
