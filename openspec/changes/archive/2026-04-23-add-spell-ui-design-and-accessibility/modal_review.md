# PASS 1: MODAL USAGE INVENTORY

## SpellEditor.tsx (Primary spell editing UI)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 744 | Navigation blocker (useBlocker) | "You have unsaved changes. Leave and discard?" or "You have unparsed fields. Navigating away will discard your current editor state. Continue?" | BLOCKING DECISION |
| 1698 | Save attempt with validation errors | Array of validation error messages | ERROR |
| 1864 | Save operation failure | "Failed to save: {error}" | ERROR |
| 1871 | Delete spell button | "Are you sure you want to delete this spell?" | DESTRUCTIVE CONFIRMATION |
| 1882 | Delete operation failure | "Failed to delete: {error}" | ERROR |
| 1986 | Cancel button click with unsaved state | "You have unsaved changes. Leave and discard?" | BLOCKING DECISION |
| 2034 | Hash copy success | "Hash copied to clipboard." | STATUS SUCCESS |
| 2036 | Hash copy failure | "Failed to copy hash." | ERROR |
| 2429 | Uncheck Material Components | "Clear all material component data?" | DESTRUCTIVE CONFIRMATION |
| 2611 | Reparse from artifact button | "Re-parse this spell from the original artifact file? This will overwrite manual changes." | DESTRUCTIVE CONFIRMATION |
| 2621 | Reparse success | "Spell re-parsed successfully!" | STATUS SUCCESS |
| 2627 | Reparse failure | "Reparse failed: {error}" | ERROR |

## Library.tsx

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 223 | Delete saved search | "Delete this saved search?" | DESTRUCTIVE CONFIRMATION (shared modalConfirm) |

## App.tsx (Application root)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 117 | Backup success | "Backup created at: {path}" | STATUS SUCCESS |
| 119 | Backup failure | "Backup failed: {error}" | ERROR |
| 127 | Restore button | "This will OVERWRITE your current database. All unsaved changes will be lost. Are you sure?" | DESTRUCTIVE CONFIRMATION |
| 135 | Restore success | "Restore complete. The application will now reload." | STATUS SUCCESS |
| 142 | Restore failure | "Restore failed: {error}" | ERROR |
| 178-183 | Vault integrity check on startup | Formatted vault summary (warnings/repairs/unrecoverable) | WARNING (high-severity system error) |
| 187-193 | Vault startup check failure | "Vault integrity startup check failed: {error}" | WARNING (high-severity system error) |

## CharacterEditor.tsx (Out-of-scope per spec)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 137 | No class selected for export | "No class selected for spellbook pack" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 150 | Print success | "{docType} saved to: {path}" | STATUS SUCCESS (CHARACTER FLOW - OUT OF SCOPE) |
| 152 | Print failure | "Print failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 183 | Save character failure | "Save failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 201 | Save character failure | "Save failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 273 | Delete character button | "Delete {name}? Are you sure?" | DESTRUCTIVE CONFIRMATION (CHARACTER FLOW - OUT OF SCOPE) |
| 282 | Delete failure | "Delete failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 494 | Add class failure | "Failed to add class: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 603 | Remove class failure | "Failed to remove class: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 803 | Bulk remove spells confirmation | "Remove {total} spells?" | DESTRUCTIVE CONFIRMATION (CHARACTER FLOW - OUT OF SCOPE) |
| 823 | Bulk remove failure | "Bulk remove failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 882 | Spell upgrade failure | "Failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 946 | Spell upgrade failure | "Failed to upgrade spell: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 1163 | Bulk error | Error message list | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 1173 | Bulk error | "Bulk Error: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 1184 | Import failure | Error message | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 1388 | Character generation failure | Error message | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 1406 | Character generation failure | "Error: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |

## CharacterImportWizard.tsx (Out-of-scope per spec)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 97 | Import success | "Character imported successfully!" | STATUS SUCCESS (CHARACTER FLOW - OUT OF SCOPE) |
| 101 | Import failure | "Import failed: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |

## CharacterManager.tsx (Out-of-scope per spec)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 113 | Delete character confirmation | `Are you sure you want to delete "{name}"? This cannot be undone.` | DESTRUCTIVE CONFIRMATION (native window.confirm) (CHARACTER FLOW - OUT OF SCOPE) |
| 123 | Delete failure | "Failed to delete character: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 107 | Create character failure | "Failed to create character: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |
| 156, 175, 205, 224 | Export success messages | "Character exported successfully!" | STATUS SUCCESS (CHARACTER FLOW - OUT OF SCOPE) |
| 178, 227 | Export failure | "Failed to export: {error}" | ERROR (CHARACTER FLOW - OUT OF SCOPE) |

## ImportWizard.tsx (Spell import flow)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 498 | Import URL policy save failure | "Import URL policy update failed: {error}" | ERROR |
| 510 | Large file warning | "{filename} is {size} MB and exceeds the 10 MB preview warning threshold. Previewing a large JSON import may take longer. Files over 100 MB are still rejected by the backend." | WARNING |
| 543 | JSON preview failure | "JSON preview failed: {error}" | ERROR |
| 569 | JSON import failure | "JSON import failed: {error}" | ERROR |
| 610 | Bulk conflict resolution failure | "Bulk resolution failed: {error}" | ERROR |
| 654 | Conflict resolution failure | "Conflict resolution failed: {error}" | ERROR |
| 686 | Preview failure | "Preview failed: {error}" | ERROR |
| 728 | Import failure | "Import failed: {error}" | ERROR |
| 767 | Conflict resolution failure | "Conflict resolution failed: {error}" | ERROR |

## ComponentCheckboxes.tsx (Nested component)

| Line | Trigger | Content | Category |
|------|---------|---------|----------|
| 64 | Uncheck Material Components (fallback) | "Clear all material component data?" | DESTRUCTIVE CONFIRMATION (fallback native window.confirm) |

---

# PASS 2: PRESERVATION ANALYSIS

## MUST STAY — DESTRUCTIVE CONFIRMATIONS

### SpellEditor.tsx Line 1871 — Delete Spell
- **Content:** "Are you sure you want to delete this spell?"
- **Classification:** Destructive confirmation
- **Reasoning:** This is an irreversible deletion that permanently removes a spell from the database. User must explicitly confirm the action before proceeding.
- **Test Coverage:** Not explicitly named in spec safe-list but is a core spell editor destructive action
- **Status:** MUST STAY MODAL

### SpellEditor.tsx Line 2429 — Uncheck Material Components
- **Content:** "Clear all material component data?"
- **Classification:** Destructive confirmation
- **Reasoning:** Unchecking the material component checkbox clears all detailed material component data, which is data loss. User must explicitly confirm before permanent data is discarded.
- **Status:** MUST STAY MODAL
- **Note:** This is passed to ComponentCheckboxes.tsx as `onUncheckMaterialConfirm` callback, with fallback to window.confirm line 64

### SpellEditor.tsx Line 2611 — Reparse from Artifact
- **Content:** "Re-parse this spell from the original artifact file? This will overwrite manual changes."
- **Classification:** Destructive confirmation (data loss)
- **Reasoning:** Reparsing will overwrite all manual edits with parsed data from the original artifact. This is irreversible and user must explicitly consent.
- **Status:** MUST STAY MODAL

### Library.tsx Line 223 — Delete Saved Search
- **Content:** "Delete this saved search?"
- **Classification:** Destructive confirmation
- **Reasoning:** Deletes a saved search permanently.
- **Status:** MUST STAY MODAL
- **Implementation:** Uses `modalConfirm()` so the shared `showModal()` / focus-return path applies.

### App.tsx Line 127 — Restore Database
- **Content:** "This will OVERWRITE your current database. All unsaved changes will be lost. Are you sure?"
- **Classification:** Destructive confirmation (high-severity data replacement)
- **Reasoning:** This is a critical system operation that permanently replaces the entire database. Explicit user confirmation is mandatory.
- **Status:** MUST STAY MODAL

---

## MUST STAY — BLOCKING DECISIONS

### SpellEditor.tsx Line 744 — Navigation Blocker (Unsaved/Unparsed)
- **Content:** 
  - "You have unsaved changes. Leave and discard?" 
  - "You have unparsed fields. Navigating away will discard your current editor state. Continue?"
- **Classification:** Blocking decision
- **Reasoning:** User cannot proceed with navigation until they make a choice (Cancel to stay / Confirm to discard). This is a blocking workflow gate that appears when leaving the editor with pending work.
- **Test Coverage:** 
  - spell_editor_canon_first.spec.ts lines 1292, 1297, 1643, 1654, 1665 — `handleCustomModal(page, "Cancel")` and `handleCustomModal(page, "Confirm")`
  - spell_editor_structured_data.spec.ts line 629 — `handleCustomModal(page, "Cancel")` for "Unparsed fields" modal
- **Status:** MUST STAY MODAL (explicitly safe per spec)

### SpellEditor.tsx Line 1986 — Cancel Button with Unsaved State
- **Content:** "You have unsaved changes. Leave and discard?"
- **Classification:** Blocking decision
- **Reasoning:** User explicitly clicked Cancel button. This blocks them from leaving the form without confirming they want to discard changes. Is a blocking gate for a critical workflow decision.
- **Status:** MUST STAY MODAL

---

## MUST STAY — RARE HIGH-SEVERITY ERRORS

### App.tsx Lines 178-183 — Vault Integrity Check Warning (Startup)
- **Content:** Formatted summary of vault integrity issues (warnings, repairs, unrecoverable items)
- **Classification:** Rare high-severity error (system integrity check)
- **Reasoning:** This is a system-level vault integrity check performed at startup. Warnings about database corruption, repairs, or unrecoverable entries are high-severity. User must explicitly acknowledge before proceeding.
- **Status:** MUST STAY MODAL
- **Notes:** 
  - Uses `showModalIfIdle()` to prevent overlapping modals
  - Dismissible: `true` 
  - Provides "Open Vault Maintenance" button as remediation path

### App.tsx Lines 187-193 — Vault Integrity Check Failure (Startup)
- **Content:** "Vault integrity startup check failed: {error}"
- **Classification:** Rare high-severity error (system check failure)
- **Reasoning:** System-level vault check failed at startup. This is a critical integrity issue that requires explicit user acknowledgment.
- **Status:** MUST STAY MODAL
- **Notes:**
  - Uses `showModalIfIdle()` to prevent overlapping modals
  - Dismissible: `true`
  - Provides "Open Vault Maintenance" button as remediation path

---

## SHOULD CONVERT — ROUTINE SUCCESS STATUS (Non-Modal Feedback)

### SpellEditor.tsx Line 2034 — Hash Copy Success
- **Content:** "Hash copied to clipboard."
- **Classification:** Transient success status
- **Reasoning:** Routine clipboard copy confirmation. User does not need a modal blocking interaction. A toast or inline notification would be appropriate.
- **Status:** SHOULD CONVERT TO NON-MODAL
- **Recommendation:** Replace with toast notification

### SpellEditor.tsx Line 2621 — Reparse Success
- **Content:** "Spell re-parsed successfully!"
- **Classification:** Transient success status
- **Reasoning:** Successful completion of background operation. User does not need a blocking modal to acknowledge. Non-modal feedback (toast) is sufficient.
- **Status:** SHOULD CONVERT TO NON-MODAL
- **Recommendation:** Replace with toast notification

### App.tsx Line 117 — Backup Success
- **Content:** "Backup created at: {path}"
- **Classification:** Transient success status
- **Reasoning:** Routine backup completion. User does not need a modal. Non-modal feedback is sufficient.
- **Status:** SHOULD CONVERT TO NON-MODAL
- **Recommendation:** Replace with toast notification

### App.tsx Line 135 — Restore Success
- **Content:** "Restore complete. The application will now reload."
- **Classification:** Transient status (though followed by page reload)
- **Reasoning:** Although this is followed by a page reload, the modal is not necessary for the action to be destructive. The destructive action (restore) is confirmed by the modalConfirm at line 127. This modal is just informational before reload.
- **Status:** AMBIGUOUS → likely SHOULD CONVERT
- **Recommendation:** This is informational only. Could use a toast or skip the notification altogether since reload is automatic.

### ImportWizard.tsx Line 510 — Large File Warning
- **Content:** "{filename} is {size} MB... warning threshold..."
- **Classification:** Warning that prompts user decision (BUT context-dependent)
- **Reasoning:** This is a warning that REQUIRES user to make a choice (proceed or cancel). It's a decision gate for a risky operation.
- **Status:** AMBIGUOUS → KEEP AS MODAL
- **Reasoning Revised:** This uses `modalConfirm()` which returns a boolean decision. User must choose to proceed or cancel large file import. This is a blocking decision, not just informational.

---

## SHOULD CONVERT — ROUTINE ERROR STATUS (Operations that can fail gracefully)

All non-blocking, non-critical errors should convert to non-modal feedback:

### SpellEditor.tsx
- Line 1698: Validation Errors → SHOULD CONVERT (can be shown inline in form)
- Line 1864: Save Error → AMBIGUOUS (might need modal depending on context, but consider toast if user can retry)
- Line 2036: Hash Copy Error → SHOULD CONVERT (routine operation failure, toast is sufficient)
- Line 2627: Reparse Error → SHOULD CONVERT (toast notification sufficient)

### App.tsx
- Line 119: Backup Error → SHOULD CONVERT (toast sufficient)
- Line 142: Restore Error → SHOULD CONVERT (toast sufficient)

### ImportWizard.tsx
- Line 498: Import URL Policy Error → SHOULD CONVERT (toast sufficient)
- Line 543: JSON Preview Error → SHOULD CONVERT (toast sufficient)
- Line 569: JSON Import Error → SHOULD CONVERT (toast sufficient)
- Line 610: Bulk Resolution Error → SHOULD CONVERT (toast sufficient)
- Line 654: Conflict Resolution Error → SHOULD CONVERT (toast sufficient)
- Line 686: Preview Error → SHOULD CONVERT (toast sufficient)
- Line 728: Import Error → SHOULD CONVERT (toast sufficient)
- Line 767: Conflict Resolution Error → SHOULD CONVERT (toast sufficient)

---

# PASS 3: COMPLETENESS AND RISK ASSESSMENT

## Borderline Cases & Recommendations

### 1. **ValidationErrors Modal (SpellEditor.tsx Line 1698)**
- **Current:** Shows validation errors in a modal (type="error")
- **Issue:** Validation errors are not blocking — user can stay in the form and fix them. This is routine validation feedback.
- **Decision:** SHOULD CONVERT → Inline form validation display (don't use modal at all)
- **Risk:** LOW — Converting to inline display is safe and improves UX

### 2. **Save/Delete Error Modals (SpellEditor.tsx Lines 1864, 1882)**
- **Current:** Modal errors after save/delete operations fail
- **Issue:** These are technical error messages that don't require modal blocking
- **Decision:** SHOULD CONVERT → Toast notifications with potential retry option
- **Risk:** LOW → User can retry the action if needed

### 3. **Hash Copy Error (SpellEditor.tsx Line 2036)**
- **Current:** Modal error
- **Issue:** Routine clipboard operation failure, non-critical
- **Decision:** SHOULD CONVERT → Toast notification
- **Risk:** LOW

### 4. **Restore Operation Messages (App.tsx Lines 127, 135, 142)**
- **Current Line 127:** Destructive confirmation modal (CORRECT)
- **Current Line 135:** Success modal before reload (QUESTIONABLE)
- **Current Line 142:** Error modal (QUESTIONABLE)
- **Issue:** Lines 135 and 142 are informational/error feedback, not a destructive decision. Line 127 is the only blocking decision.
- **Decision:** 
  - Line 127: MUST STAY (destructive confirmation)
  - Line 135: SHOULD CONVERT (just informational, reload happens anyway)
  - Line 142: SHOULD CONVERT (error toast sufficient)
- **Risk:** MEDIUM — Only convert 135 if application behavior is clear (automatic reload)

---

## Test Coverage for Preserved Modals

### Safe Modal List from Spec

The spec explicitly names these test locations as "safe" (modal should be preserved):

1. **spell_editor_canon_first.spec.ts — Unsaved changes / discard dialogs**
   - Lines 1292, 1297: `handleCustomModal(page, "Cancel"/"Confirm")` 
   - **Maps to:** SpellEditor.tsx line 744 navigation blocker modal
   - **Status:** ✓ Tests correctly cover unsaved changes modal (MUST STAY)

2. **spell_editor_canon_first.spec.ts — Navigation tests**
   - Lines 1643, 1654, 1665: `handleCustomModal(page, "Cancel")` when navigating away
   - **Maps to:** SpellEditor.tsx line 744 and 1986 navigation/unsaved state modals
   - **Status:** ✓ Tests correctly cover blocking decision modals (MUST STAY)

3. **spell_editor_structured_data.spec.ts — Line 629**
   - `handleCustomModal(page, "Cancel")` dismissing "Unparsed fields" modal
   - **Maps to:** SpellEditor.tsx line 744 (hasBannerActive branch)
   - **Status:** ✓ Tests correctly cover unparsed fields blocking modal (MUST STAY)

### Test Coverage Assessment

**Preserved Modals WITH Test Coverage:**
- ✓ SpellEditor.tsx line 744: "Unsaved changes"/"Unparsed fields" — COVERED (spell_editor_canon_first.spec.ts, spell_editor_structured_data.spec.ts)
- ✓ SpellEditor.tsx line 1986: Cancel button with unsaved state — COVERED (indirectly via blocker tests)

**Preserved Modals WITHOUT Explicit Test Coverage:**
- ✗ SpellEditor.tsx line 1871: "Delete Spell" — NOT FOUND in provided test lines
- ✗ SpellEditor.tsx line 2429: "Clear material components" — NOT FOUND in provided test lines
- ✗ SpellEditor.tsx line 2611: "Reparse spell" — NOT FOUND in provided test lines
- ✓ Library.tsx line 223: "Delete saved search" — covered by shared modal unit tests
- ✗ App.tsx line 127: "Restore database" — NOT FOUND in provided test lines
- ✗ App.tsx lines 178-183, 187-193: Vault integrity modals — NOT FOUND in provided test lines

**Risk Assessment:** Several destructive confirmation modals exist in the codebase but are NOT covered by the tests cited in the spec as "safe." These should either:
1. Be tested (recommended)
2. Be re-evaluated for preservation status

---

## Out-of-Scope Modal Catalog

### CHARACTER FLOW (Explicitly out-of-scope per spec)

**CharacterEditor.tsx:**
- Line 137: No class selected error
- Line 150: Print success
- Line 152: Print failure  
- Line 183: Save failure
- Line 201: Save failure
- Line 273: Delete character confirmation
- Line 282: Delete failure
- Line 494: Add class failure
- Line 603: Remove class failure
- Line 803: Bulk remove confirmation
- Line 823: Bulk remove failure
- Line 882: Spell upgrade failure
- Line 946: Spell upgrade failure
- Line 1163: Bulk error
- Line 1173: Bulk error
- Line 1184: Import failure
- Line 1388: Character generation failure
- Line 1406: Character generation failure

**CharacterImportWizard.tsx:**
- Line 97: Import success
- Line 101: Import failure

**CharacterManager.tsx:**
- Line 107: Create failure
- Line 113: Delete character confirmation (window.confirm)
- Line 123: Delete failure
- Lines 156, 175, 205, 224: Export success
- Lines 178, 227: Export failure

**STATUS:** All character/vault/import flow modals are explicitly out-of-scope per the spec and should NOT be modified as part of this task.

---

## Gaps & Uncategorized Modals

### Gap 1: Inconsistent Confirmation APIs
**Issue:** Some destructive confirmations use native `window.confirm()` instead of `modalConfirm()`:
- CharacterManager.tsx line 113: `window.confirm("Are you sure you want to delete...")`
- ComponentCheckboxes.tsx line 64: Fallback `window.confirm()` when no `onUncheckMaterialConfirm` provided

**Recommendation:** Standardize all confirmations to use the modal framework's `modalConfirm()` for consistent UX. The fallback to `window.confirm()` in ComponentCheckboxes.tsx is acceptable as a safety net.

**Risk:** LOW — These are still blocking confirmations, just using different UIs. Converting to `modalConfirm()` would improve consistency.

### Gap 2: Validation Error Modal (SpellEditor.tsx Line 1698)
**Issue:** Validation errors are shown in a modal, but validation is a non-blocking, inline concern.

**Current:** `await modalAlert(validationErrors, "Validation Errors", "error")`

**Recommendation:** Remove the modal entirely. Instead, display validation errors inline in the form (red borders, helper text beneath fields, etc.). User should be able to fix errors without a blocking modal.

**Risk:** MEDIUM — Need to implement inline validation display if removing modal.

### Gap 3: Vault Integrity Modal Dismissibility
**Issue:** Vault integrity warnings are dismissible (`dismissible: true`), which means users can dismiss critical system warnings without taking action.

**Current:** App.tsx lines 178-183 and 187-193 both have `dismissible: true` and no required action to close.

**Question:** Should vault integrity warnings be dismissible? Or should they require clicking "Dismiss" explicitly with a button?

**Recommendation:** Review whether vault integrity warnings should be dismissible at all. If they're "rare high-severity errors," making them non-dismissible (require explicit button click) might be more appropriate.

**Risk:** MEDIUM — This is a policy decision about system error handling.

### Gap 4: No Modal for Character Deletion Confirmation in Character Flow
**Note:** CharacterManager.tsx line 113 uses `window.confirm()` instead of the modal system. This is out-of-scope but noted for consistency tracking.

---

## Summary Table: All Modals & Their Status

| File | Line | Content | Type | Status | Reasoning |
|------|------|---------|------|--------|-----------|
| **SpellEditor.tsx** | 744 | Unsaved changes / Unparsed fields | BLOCKING DECISION | MUST STAY | Navigation blocker requires user decision |
| | 1698 | Validation Errors | ERROR | SHOULD CONVERT | Non-blocking, can be inline |
| | 1864 | Save Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 1871 | Delete Spell | DESTRUCTIVE | MUST STAY | Irreversible action |
| | 1882 | Delete Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 1986 | Unsaved changes (Cancel btn) | BLOCKING DECISION | MUST STAY | Blocking workflow gate |
| | 2034 | Hash Copied | SUCCESS | SHOULD CONVERT | Toast sufficient |
| | 2036 | Hash Copy Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 2429 | Clear Material Data | DESTRUCTIVE | MUST STAY | Data loss confirmation |
| | 2611 | Reparse Spell | DESTRUCTIVE | MUST STAY | Overwrites manual edits |
| | 2621 | Reparse Success | SUCCESS | SHOULD CONVERT | Toast sufficient |
| | 2627 | Reparse Error | ERROR | SHOULD CONVERT | Toast sufficient |
| **Library.tsx** | 223 | Delete Saved Search | DESTRUCTIVE | MUST STAY | Irreversible (uses shared modalConfirm) |
| **App.tsx** | 117 | Backup Success | SUCCESS | SHOULD CONVERT | Toast sufficient |
| | 119 | Backup Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 127 | Restore Confirm | DESTRUCTIVE | MUST STAY | Database overwrite requires confirmation |
| | 135 | Restore Success | STATUS | SHOULD CONVERT | Informational only |
| | 142 | Restore Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 178-183 | Vault Integrity Warning | HIGH-SEVERITY ERROR | MUST STAY | System integrity check, rare error |
| | 187-193 | Vault Check Failure | HIGH-SEVERITY ERROR | MUST STAY | System check failed at startup |
| **ImportWizard.tsx** | 498 | URL Policy Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 510 | Large File Warning | BLOCKING DECISION | MUST STAY | Requires user choice to proceed |
| | 543 | Preview Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 569 | Import Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 610 | Bulk Resolution Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 654 | Conflict Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 686 | Preview Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 728 | Import Error | ERROR | SHOULD CONVERT | Toast sufficient |
| | 767 | Conflict Error | ERROR | SHOULD CONVERT | Toast sufficient |
| **ComponentCheckboxes.tsx** | 64 | Clear Material (fallback) | DESTRUCTIVE | MUST STAY | Fallback for data loss confirmation |
| **[OUT OF SCOPE]** | Various | Character/Vault/Import flows | Various | DEFER | Explicitly out-of-scope per spec |

---

## Final Recommendations by Priority

### Phase 1: MUST DO (Preserve these — do NOT convert)
1. ✓ SpellEditor.tsx line 744: "Unsaved changes"/"Unparsed fields" modal
2. ✓ SpellEditor.tsx line 1871: "Delete Spell" confirmation
3. ✓ SpellEditor.tsx line 1986: Cancel button with unsaved state
4. ✓ SpellEditor.tsx line 2429: "Clear material components" confirmation
5. ✓ SpellEditor.tsx line 2611: "Reparse spell" confirmation
6. ✓ App.tsx line 127: "Restore database" confirmation
7. ✓ App.tsx lines 178-183: Vault integrity warning
8. ✓ App.tsx lines 187-193: Vault check failure warning
9. ✓ Library.tsx line 223: "Delete saved search" (uses shared modalConfirm — DONE)
10. ✓ ImportWizard.tsx line 510: "Large file warning" (blocking decision modal)
11. ✓ ComponentCheckboxes.tsx line 64: Fallback material component confirmation

### Phase 2: SHOULD CONVERT (Replace with non-modal feedback)
1. SpellEditor.tsx line 1698: Validation Errors → Inline form validation
2. SpellEditor.tsx line 1864: Save Error → Toast
3. SpellEditor.tsx line 1882: Delete Error → Toast
4. SpellEditor.tsx line 2034: Hash Copied → Toast
5. SpellEditor.tsx line 2036: Hash Copy Error → Toast
6. SpellEditor.tsx line 2621: Reparse Success → Toast
7. SpellEditor.tsx line 2627: Reparse Error → Toast
8. App.tsx line 117: Backup Success → Toast
9. App.tsx line 119: Backup Error → Toast
10. App.tsx line 135: Restore Success → Toast (or remove, since reload follows)
11. App.tsx line 142: Restore Error → Toast
12. ImportWizard.tsx lines 498, 543, 569, 610, 654, 686, 728, 767: All errors → Toasts

### Phase 3: STANDARDIZE (Improve consistency)
1. ✓ Library.tsx line 223: Migrated from `window.confirm()` to `modalConfirm()` — DONE
2. Ensure all destructive confirmations use consistent modal API
3. Review vault integrity modal dismissibility policy