# Library Saved Search Delete Modal Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library saved-search deletion flow's native `window.confirm()` call with the shared modal store so the destructive confirmation still stays modal, but now follows the documented `showModal()` / focus-return path and keeps the affected unit/E2E coverage aligned.

**Architecture:** Keep the production change narrow. `Library.tsx` should adopt `useModal().confirm()` for the delete-saved-search flow without changing button text, backend commands, or the existing error-toast behavior. The supporting work is mostly in tests: `Library.test.tsx` must render the shared `Modal` in jsdom and stub `<dialog>.showModal()` / `close()`, while the existing Playwright saved-search workflow must stop relying on native dialog auto-accept and instead use `handleCustomModal()` against the shared modal. Finish by syncing the change artifact `modal_review.md` so it no longer reports a fixed `window.confirm()` inconsistency.

**Tech Stack:** React 18 + TypeScript, Zustand (`useModal`, `useNotifications`), React Testing Library + Vitest, Playwright with Tauri fixtures, Markdown/OpenSpec artifacts.

---

## Scope Check

This is one subsystem: Library saved-search deletion plus the directly affected unit/E2E coverage and modal-review artifact. Do not split it further.

## Execution Preconditions

- Execute from a dedicated worktree if you implement this plan, per the `writing-plans` skill.
- Relevant implementation skills: `@subagent-driven-development`, `@playwright-e2e-spellbook`, `@verification-before-completion`.
- Do not add dependencies.
- Treat [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#L148) as the contract to align with; no redesign is needed.

## File Map

**Modify**
- `apps/desktop/src/ui/Library.tsx:1-6, 221-230`
  Responsibility: import `useModal`, obtain `modalConfirm`, and route the saved-search destructive confirmation through the shared modal store without changing the delete command or the failure toast.
- `apps/desktop/src/ui/Library.test.tsx:1-120, 258-325`
  Responsibility: render the shared `Modal`, stub `HTMLDialogElement.showModal()` / `close()` in jsdom, reset `useModal` state between tests, add cancel/focus regression coverage, and adapt the existing delete-failure regression to confirm through the shared modal.
- `apps/desktop/tests/milestone_3.spec.ts:1-120`
  Responsibility: stop assuming native dialog auto-accept for saved-search deletion, use `handleCustomModal(page, "Confirm")`, and assert the saved search is actually removed after confirmation.
- `openspec/changes/add-spell-ui-design-and-accessibility/modal_review.md:24, 124-129, 367-372, 417, 450, 469`
  Responsibility: remove Library's outdated `window.confirm()` inconsistency notes while preserving the classification that delete-saved-search must remain modal because it is destructive.

**Check-only**
- `apps/desktop/src/store/useModal.ts`
  Responsibility: existing `confirm(message, title)` API contract; do not change unless the current signature is truly insufficient.
- `apps/desktop/src/ui/components/Modal.tsx`
  Responsibility: source of stable `modal-dialog` / `modal-button-*` testids and focus-return behavior; reuse these rather than inventing new selectors.
- `apps/desktop/tests/utils/dialog-handler.ts`
  Responsibility: reuse `handleCustomModal()`; no new dialog helper should be added for this work.
- `docs/ARCHITECTURE.md:148-215`
  Responsibility: confirm the final implementation matches the documented shared modal and focus-return path. No text edit should be necessary if the implementation is correct.

## Behavior To Preserve

- Saved-search deletion must remain a destructive modal confirmation.
- Keep the existing delete button/testid: `btn-delete-saved-search`.
- Keep the backend call exactly `invoke("delete_saved_search", { id })`.
- Keep the failure path toast copy pattern: `Failed to delete saved search: ...`.
- Canceling the modal must leave the current saved-search selection intact.
- The shared modal should use the standard `Cancel` / `Confirm` buttons returned by `useModal().confirm()`.
- Focus should return through the shared modal path instead of bypassing it with the browser's native dialog.

### Task 1: Unit-Test And Implement The Shared Delete Confirmation Path

 [x] **Step 6: Commit the Library migration and unit coverage**
 [x] **Step 4: Commit the E2E migration**
 [x] **Step 4: Commit the artifact sync and verification-ready state**
- Modify: `apps/desktop/src/ui/Library.tsx:1-6`
- Modify: `apps/desktop/src/ui/Library.tsx:221-230`
- Reference: `apps/desktop/src/ui/components/Modal.test.tsx:1-40`

- [x] **Step 1: Write the failing unit regression and jsdom modal harness in `Library.test.tsx`**

```tsx
import { useModal } from "../store/useModal";
import Modal from "./components/Modal";

let showModalMock: ReturnType<typeof vi.fn>;
let closeMock: ReturnType<typeof vi.fn>;
let originalShowModal: HTMLDialogElement["showModal"] | undefined;
let originalClose: HTMLDialogElement["close"] | undefined;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalShowModal = HTMLDialogElement.prototype.showModal;
  originalClose = HTMLDialogElement.prototype.close;
  showModalMock = vi.fn(function mockShowModal(this: HTMLDialogElement) {
    Object.defineProperty(this, "open", { configurable: true, value: true });
  });
  closeMock = vi.fn(function mockClose(this: HTMLDialogElement) {
    Object.defineProperty(this, "open", { configurable: true, value: false });
  });
  HTMLDialogElement.prototype.showModal =
    showModalMock as unknown as HTMLDialogElement["showModal"];
  HTMLDialogElement.prototype.close = closeMock as unknown as HTMLDialogElement["close"];
  confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => {
    throw new Error("Saved-search delete must use useModal().confirm()");
  });
  useModal.setState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
    buttons: [],
    queuedModal: undefined,
    customContent: undefined,
    dismissible: undefined,
    onClose: undefined,
  });
});

afterEach(() => {
  if (originalShowModal) {
    HTMLDialogElement.prototype.showModal = originalShowModal;
  } else {
    HTMLDialogElement.prototype.showModal =
      undefined as unknown as HTMLDialogElement["showModal"];
  }
  if (originalClose) {
    HTMLDialogElement.prototype.close = originalClose;
  } else {
    HTMLDialogElement.prototype.close = undefined as unknown as HTMLDialogElement["close"];
  }
});

function renderLibraryWithViewport() {
  const router = createMemoryRouter([{ path: "/", element: <Library /> }], {
    initialEntries: ["/"],
  });
  return render(
    <div>
      <RouterProvider router={router} />
      <NotificationViewport />
      <Modal />
    </div>,
  );
}

it("delete saved search opens the shared modal, cancels cleanly, and restores focus", async () => {
  // seed one saved search
  // select it and focus the delete button
  // click delete
  await waitFor(() => expect(screen.getByTestId("modal-dialog")).toHaveAttribute("open"));
  expect(screen.getByRole("heading", { name: "Delete Saved Search" })).toBeTruthy();
  expect(screen.getByTestId("modal-button-cancel")).toBeTruthy();
  fireEvent.click(screen.getByTestId("modal-button-cancel"));
  await waitFor(() => expect(screen.getByTestId("modal-dialog")).not.toHaveAttribute("open"));
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("delete_saved_search", expect.anything());
  expect(document.activeElement).toBe(deleteBtn);
  expect(confirmSpy).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run the targeted unit test and confirm it fails for the current native-confirm implementation**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/Library.test.tsx -t "delete saved search opens the shared modal, cancels cleanly, and restores focus"`
Expected: FAIL because the click path still reaches native `window.confirm()` instead of opening the shared modal and `confirmSpy` throws `Saved-search delete must use useModal().confirm()`.

- [x] **Step 3: Write the minimal production change in `Library.tsx`**

```tsx
import { useModal } from "../store/useModal";

export default function Library() {
  const { pushNotification } = useNotifications();
  const { confirm: modalConfirm } = useModal();

  const handleDeleteSavedSearch = async (id: number) => {
    const confirmed = await modalConfirm("Delete this saved search?", "Delete Saved Search");
    if (!confirmed) return;
    try {
      await invoke("delete_saved_search", { id });
      setSelectedSavedSearchId(null);
      loadSavedSearches();
    } catch (e) {
      pushNotification("error", `Failed to delete saved search: ${e}`);
    }
  };
}
```

- [x] **Step 4: Update the existing delete-failure unit test to confirm through the shared modal instead of skipping straight to the toast**

```tsx
it("delete-saved-search failure shows an error toast and does not call window.alert", async () => {
  // seed one saved search and focus the delete button
  fireEvent.click(deleteBtn);

  await waitFor(() => expect(screen.getByTestId("modal-dialog")).toHaveAttribute("open"));
  fireEvent.click(screen.getByTestId("modal-button-confirm"));

  await waitFor(() => {
    const viewport = notificationViewport();
    expect(within(viewport).getByText(/Failed to delete saved search:/)).toBeTruthy();
    expect(within(viewport).getByTestId("toast-notification-error")).toBeTruthy();
  });
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(deleteBtn);
});
```

- [x] **Step 5: Re-run the saved-search Library unit slice until it is green**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/Library.test.tsx -t "delete saved search|delete-saved-search"`
Expected: PASS for the new cancel-path regression and the updated failure-toast regression, with no fallback to `window.confirm()`.

- [x] **Step 6: Commit the Library migration and unit coverage**

```bash
git add apps/desktop/src/ui/Library.tsx apps/desktop/src/ui/Library.test.tsx
git commit -m "feat: route saved-search delete through shared modal"
```

### Task 2: Update The Saved-Search E2E Workflow For The Shared Modal

**Files:**
- Modify: `apps/desktop/tests/milestone_3.spec.ts:1-120`
- Reference: `apps/desktop/tests/utils/dialog-handler.ts:1-80`

- [x] **Step 1: Update the Playwright spec to use the shared modal helper and verify deletion actually completes**

```ts
import { dismissAllAppModals, handleCustomModal } from "./utils/dialog-handler";

// ... after loading the saved search
const deleteBtn = page.getByTestId("btn-delete-saved-search");
await deleteBtn.focus();
await deleteBtn.click();

const modal = page.getByRole("dialog");
await expect(modal.getByRole("heading", { name: "Delete Saved Search" })).toBeVisible({
  timeout: TIMEOUTS.medium,
});
await handleCustomModal(page, "Confirm");

await expect(page.getByTestId("saved-searches-select")).toHaveValue("");
await expect(
  page.getByTestId("saved-searches-select").locator("option").filter({ hasText: saveName }),
).toHaveCount(0);
```

Remove the `setupAcceptAllDialogs(page)` import, setup, and cleanup scaffolding from this spec unless you first identify another native browser dialog in this exact file.

- [x] **Step 2: Rebuild the desktop app before Playwright**

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: the debug Tauri bundle rebuilds successfully for the changed frontend assets.

- [x] **Step 3: Run the saved-search workflow spec**

Run: `pnpm --dir apps/desktop exec playwright test tests/milestone_3.spec.ts`
Expected: PASS. The saved-search delete step uses the custom modal interaction, and the deleted search no longer appears in the select after confirmation.

- [x] **Step 4: Commit the E2E migration**

```bash
git add apps/desktop/tests/milestone_3.spec.ts
git commit -m "test: migrate saved-search delete e2e to shared modal"
```

### Task 3: Sync The Modal Review Artifact And Run Focused Verification

**Files:**
- Modify: `openspec/changes/add-spell-ui-design-and-accessibility/modal_review.md:24, 124-129, 367-372, 417, 450, 469`
- Check: `docs/ARCHITECTURE.md:148-215`
- Check: `apps/desktop/src/ui/Library.tsx:221-230`

- [x] **Step 1: Update `modal_review.md` so Library is no longer reported as a native-confirm inconsistency**

```md
| 223 | Delete saved search | "Delete this saved search?" | DESTRUCTIVE CONFIRMATION (shared modalConfirm) |

### Library.tsx Line 223 — Delete Saved Search
- **Content:** "Delete this saved search?"
- **Classification:** Destructive confirmation
- **Reasoning:** Deletes a saved search permanently.
- **Status:** MUST STAY MODAL
- **Implementation:** Uses `modalConfirm()` so the shared `showModal()` / focus-return path applies.
```

Also remove Library from the outstanding `window.confirm()` inconsistency list while leaving the still-out-of-scope `CharacterManager.tsx` and fallback `ComponentCheckboxes.tsx` notes intact.

- [x] **Step 2: Grep for stale native-confirm references before claiming the migration is done**

Run: `rg --line-number "Delete this saved search|window.confirm|modalConfirm" apps/desktop/src/ui/Library.tsx openspec/changes/add-spell-ui-design-and-accessibility/modal_review.md`
Expected: `Library.tsx` shows `modalConfirm("Delete this saved search?", "Delete Saved Search")`, and `modal_review.md` no longer claims Library is an outstanding native-confirm inconsistency.

- [x] **Step 3: Run the focused verification matrix**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/Library.test.tsx`
Expected: PASS.

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: PASS.

Run: `pnpm --dir apps/desktop exec playwright test tests/milestone_3.spec.ts`
Expected: PASS.

- [x] **Step 4: Commit the artifact sync and verification-ready state**

```bash
git add openspec/changes/add-spell-ui-design-and-accessibility/modal_review.md
git commit -m "docs: sync saved-search modal review"
```

## Notes For The Implementer

- Do not add new modal-specific `data-testid`s for this work. Reuse the existing shared modal selectors: `modal-dialog`, `modal-button-cancel`, and `modal-button-confirm`.
- If the focused Playwright assertion on option removal proves brittle, keep the stronger invariant `saved-searches-select` value resets to `""` and assert the backend-visible effect by attempting to re-select the deleted label and expecting no matching option.
- `docs/ARCHITECTURE.md` already documents the desired shared-modal behavior. If the implementation matches that contract, leave the architecture doc unchanged and only sync the modal-review artifact.
