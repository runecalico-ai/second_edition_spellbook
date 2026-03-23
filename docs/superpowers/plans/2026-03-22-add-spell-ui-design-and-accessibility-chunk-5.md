# Chunk 5: Cross-App Accessibility and Resize Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chunk 5 of `add-spell-ui-design-and-accessibility` — migrate `Modal.tsx` from `<dialog open>` to native `showModal()`/`close()` for real focus trapping, verify 900px resize safety, audit and fix keyboard navigation and focus indicators across touched pages, audit and fix semantic heading hierarchy and label associations, and verify color contrast compliance.

**Architecture:** Four parallel concerns addressed in dependency order: (1) Modal focus-trap migration changes the shared `ModalShell` component and its test, and adds `dialog::backdrop` CSS — this unlocks all downstream keyboard/focus tests; (2) resize hardening verifies and if needed adds `flex-wrap` to structured field control rows; (3) keyboard/heading/label audit touches SpellEditor, Library, SettingsPage, and App headers; (4) color contrast is a verification pass with targeted fixes. All changes stay within touched files and do not introduce new dependencies.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest (unit tests), Playwright E2E, `@testing-library/react` (already a dev dependency).

---

## Spec and Doc References

- `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` lines 169–203 (Chunk 5 scope)
- `openspec/changes/add-spell-ui-design-and-accessibility/specs/frontend-standards/spec.md` (requirements)
- `openspec/changes/add-spell-ui-design-and-accessibility/design.md` (palette, design decisions)

## Scope Guardrails

- Do NOT change modal store (`useModal.ts`) internals — the store owns no focus tracking.
- Do NOT touch character, vault, or import-flow modals for inline validation migration (Chunk 6 scope).
- Do NOT add any new npm/pnpm dependencies.
- Do NOT implement Chunk 6 test migration items here.
- The Chunk 5 scope for resize is verification + minimal fixes only; full structured-editor redesign is not needed because `structuredPrimaryControlRowClass` already uses `flex-wrap`.

---

## File Map

**Modify:**
- `apps/desktop/src/ui/components/Modal.tsx`
- `apps/desktop/src/ui/components/Modal.test.tsx`
- `apps/desktop/src/index.css`
- `apps/desktop/src/ui/SpellEditor.tsx`
- `apps/desktop/src/ui/Library.tsx`
- `apps/desktop/src/ui/SettingsPage.tsx`
- `apps/desktop/src/ui/App.tsx`

**Create:**
- `apps/desktop/tests/accessibility_and_resize.spec.ts`

**Verify / Read Without Planned Edits (may get small fixes during audit):**
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx` — already has `flex-wrap`; verify only
- `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx` — verify focus indicators
- `apps/desktop/src/ui/CharacterEditor.tsx` — out of primary scope; note any critical contrast issues
- `apps/desktop/src/ui/CharacterManager.tsx` — out of primary scope; note any critical contrast issues

---

## Current Code Anchors

- `Modal.tsx` line 35: `if (!isOpen) return null;` — early-return guard to remove
- `Modal.tsx` line 51: outer wrapper `<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">` — becomes `<dialog>` element
- `Modal.tsx` line 53: backdrop `<button>` — becomes click-on-empty-area handler wired to `onClick` on `<dialog>`
- `Modal.tsx` line 66: `<dialog open aria-modal="true" aria-labelledby="modal-title">` — loses `open` attribute, gains `ref`, gets restructured as root
- `Modal.test.tsx` line 7: `renderToStaticMarkup` — replace with `@testing-library/react`'s `render` since hooks require DOM
- `index.css` — add `dialog::backdrop` styling
- `StructuredFieldInput.tsx` line 53: `structuredPrimaryControlRowClass = "flex min-w-0 flex-wrap items-center gap-2"` — already wraps, verify at 900px
- `App.tsx` line 261: `<div className="mx-auto max-w-6xl space-y-4">` with outer `px-4` padding — gives ~868px content at 900px window; verify no overflow

---

## Task 1: Modal Native Focus-Trap Migration

**Files:**
- Modify: `apps/desktop/src/ui/components/Modal.tsx`
- Modify: `apps/desktop/src/ui/components/Modal.test.tsx`
- Modify: `apps/desktop/src/index.css`

### Background

The current `ModalShell` uses `<dialog open>` as a static attribute. This does NOT give native browser focus trapping. `showModal()` does. The migration restructures the dialog as the outermost element (replacing the wrapper `<div>`), adds `dialog::backdrop` CSS for the overlay, tracks the opener element for focus return, and wires the `cancel` DOM event for Escape dismissal.

`useModal.ts` has an `onClose` callback field but no trigger-element tracking. Focus tracking is the responsibility of the component, not the store — capture `document.activeElement` before `showModal()`.

**Critical mounting requirement:** The new `ModalShell` removes the `if (!isOpen) return null` guard and always renders the `<dialog>` element. This is REQUIRED because `dialog.close()` must be called on an existing DOM element. Verify that `<Modal />` is rendered unconditionally in `App.tsx` (it is — line 325: `<Modal />`). If any parent component conditionally renders Modal/ModalShell, the close() cleanup will NOT fire, leaving the dialog open with a frozen top-layer. Do NOT add conditional rendering anywhere around `<Modal />` or `<ModalShell />`.

**onCancel event forwarding:** React 18+ correctly forwards `onCancel` to native `<dialog>` elements as a synthetic event. Calling `e.preventDefault()` on the synthetic event prevents the browser from closing the dialog directly — our state-driven approach handles the close instead.

### Step-by-step

- [x] **Step 1.1: Read the current Modal.tsx in full**

  Run: read `apps/desktop/src/ui/components/Modal.tsx` (already done by planner — verify no surprises at lines 1–232).

- [x] **Step 1.2: Write the failing unit tests first**

  Replace `apps/desktop/src/ui/components/Modal.test.tsx` entirely:

  ```typescript
  import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
  import { ModalShell } from "./Modal";

  // jsdom does not implement HTMLDialogElement.showModal / close.
  // We mock the prototype so useEffect calls are captured.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Modal", () => {
    it("renders stable test ids for shared modal controls when open", () => {
      render(
        <ModalShell
          isOpen={true}
          type="warning"
          title="Vault Integrity Check"
          message={["Problem found"]}
          dismissible={true}
          buttons={[
            { label: "Dismiss", variant: "secondary" },
            { label: "Open Vault Maintenance", variant: "primary" },
          ]}
          onRequestClose={() => {}}
        />,
      );

      expect(screen.getByTestId("modal-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("modal-content")).toBeInTheDocument();
      expect(screen.getByTestId("modal-button-dismiss")).toBeInTheDocument();
      expect(
        screen.getByTestId("modal-button-open-vault-maintenance"),
      ).toBeInTheDocument();
    });

    it("calls showModal when isOpen becomes true", async () => {
      // waitFor is needed because showModal() is called inside useEffect (async post-render)
      render(
        <ModalShell
          isOpen={true}
          type="info"
          title="Test"
          message="hello"
          buttons={[]}
          onRequestClose={() => {}}
        />,
      );
      await waitFor(() =>
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1),
      );
    });

    it("calls onRequestClose when Escape cancel event fires and dismissible=true", () => {
      // Note: this test manually fires the 'cancel' event to unit-test the handler.
      // Real Escape key behavior (browser firing cancel event) is verified via E2E tests.
      // React 18 registers `onCancel` as a direct non-delegated listener on the <dialog> element
      // (not through bubble delegation, since 'cancel' does not bubble). Therefore fireEvent
      // dispatching directly to the dialog element WILL trigger the React synthetic handler.
      const onRequestClose = vi.fn();
      render(
        <ModalShell
          isOpen={true}
          type="info"
          title="Test"
          message="hello"
          buttons={[]}
          dismissible={true}
          onRequestClose={onRequestClose}
        />,
      );
      const dialog = screen.getByTestId("modal-dialog");
      fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onRequestClose when Escape fires and dismissible=false", () => {
      const onRequestClose = vi.fn();
      render(
        <ModalShell
          isOpen={true}
          type="info"
          title="Test"
          message="hello"
          buttons={[]}
          dismissible={false}
          onRequestClose={onRequestClose}
        />,
      );
      const dialog = screen.getByTestId("modal-dialog");
      fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
      expect(onRequestClose).not.toHaveBeenCalled();
    });

    it("calls onRequestClose when backdrop area (dialog element) is clicked and dismissible=true", () => {
      const onRequestClose = vi.fn();
      render(
        <ModalShell
          isOpen={true}
          type="info"
          title="Test"
          message="hello"
          buttons={[]}
          dismissible={true}
          onRequestClose={onRequestClose}
        />,
      );
      // Simulates click directly on the <dialog> element (backdrop area).
      // e.target === e.currentTarget when clicking the dialog itself, not its children.
      const dialog = screen.getByTestId("modal-dialog");
      fireEvent.click(dialog);
      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it("does NOT call onRequestClose when clicking inside the content box", () => {
      const onRequestClose = vi.fn();
      render(
        <ModalShell
          isOpen={true}
          type="info"
          title="Test"
          message="hello"
          buttons={[{ label: "OK", variant: "primary" }]}
          dismissible={true}
          onRequestClose={onRequestClose}
        />,
      );
      // The content div (modal-content testid) has stopPropagation — clicking it
      // must NOT trigger the dialog-level dismissal handler.
      const contentBox = screen.getByTestId("modal-content");
      fireEvent.click(contentBox);
      expect(onRequestClose).not.toHaveBeenCalled();
    });

    it("dialog element remains in DOM when isOpen is false (always-render invariant)", () => {
      // CRITICAL: The new ModalShell removes `if (!isOpen) return null`.
      // The <dialog> element must always be in the DOM — dialog.close() can only be
      // called on an existing element. If this test fails, the early-return guard
      // was accidentally left in or re-added.
      const { container } = render(
        <ModalShell
          isOpen={false}
          type="info"
          title="Test"
          message="hello"
          buttons={[]}
          onRequestClose={() => {}}
        />,
      );
      const dialog = container.querySelector("[data-testid='modal-dialog']");
      expect(dialog).not.toBeNull(); // element exists in DOM
      expect((dialog as HTMLDialogElement).open).toBe(false); // but not open
    });
  });
  ```

- [x] **Step 1.3: Verify mock setup then run tests — confirm they FAIL for the right reason**

  First, verify jsdom creates a proper `HTMLDialogElement` by adding a temporary diagnostic at the top of the test file (remove after verification):
  ```typescript
  // Temporary diagnostic — remove after verifying mock works
  it("diagnostic: jsdom creates HTMLDialogElement with mockable prototype", () => {
    const el = document.createElement("dialog");
    expect(el).toBeInstanceOf(HTMLDialogElement);
    // If this fails, jsdom is not creating a real HTMLDialogElement and the mock won't work.
    // Upgrade jsdom version or add: import "jest-fixed-jsdom" or equivalent polyfill.
  });
  ```

  Run: `cd apps/desktop && npx vitest run src/ui/components/Modal.test.tsx`

  Expected: The diagnostic test PASSES (confirming mock is attachable), and ALL other tests FAIL because the implementation still uses `<dialog open>` (showModal is never called with the old code). Remove the diagnostic test before Step 1.5.

  **If the diagnostic FAILS** (jsdom does not create a real `HTMLDialogElement`): check the installed jsdom version in `apps/desktop/package.json`. jsdom >= 20 fully supports `HTMLDialogElement`. If the version is older, upgrade it: `pnpm update jsdom --filter apps/desktop` (check the Dependency Security Policy at `docs/DEPENDENCY_SECURITY.md` before upgrading any dependency).

- [x] **Step 1.4: Add `dialog::backdrop` CSS to `index.css`**

  Append to `apps/desktop/src/index.css`:

  ```css
  /* Native dialog backdrop for modal overlay.
     backdrop-filter is supported in WebView2 (Chromium 79+). WebView2 uses the Chromium
     engine, not EdgeHTML. The fallback `background-color` ensures the overlay works even
     if blur isn't supported. */
  dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.6); /* fallback: works without backdrop-filter */
    backdrop-filter: blur(4px);
  }
  ```

- [x] **Step 1.5: Rewrite `ModalShell` in `Modal.tsx`**

  **First**, replace the existing imports at the top of Modal.tsx (lines 1–3) with the following complete import block. Apply this BEFORE the JSX changes below to avoid TypeScript errors from missing `useRef` and `useEffect`:
  ```tsx
  import clsx from "classnames";
  import { useEffect, useRef } from "react";
  import type { ReactNode } from "react";
  import { useModal } from "../../store/useModal";
  import type { ModalButton, ModalType } from "../../store/useModal";
  ```

  **Then**, replace the full `ModalShell` function (lines 25–206) with the implementation below. The `Modal` default export (lines 208–232) stays exactly as-is.

  Key structural changes:
  - `<dialog>` becomes the root element (replaces the outer `<div>`)
  - `<dialog>` is styled as full-viewport flex center (matching the old wrapper div)
  - The backdrop button is removed; instead `onClick` on `<dialog>` itself detects clicks outside the content div
  - A `ref` is added to call `showModal()`/`close()`
  - `triggerRef` captures `document.activeElement` before opening to restore focus on close
  - `onCancel` handler prevents native close and delegates to `onRequestClose` when dismissible

  ```tsx
  export function ModalShell({
    isOpen,
    type,
    title,
    message,
    buttons,
    customContent,
    dismissible = true,
    onRequestClose,
  }: ModalShellProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<Element | null>(null);

    // Open / close the native dialog and manage focus.
    // Focus capture: we capture document.activeElement HERE, before calling showModal(),
    // because showModal() synchronously moves focus into the dialog. At the time this
    // effect runs (after React render), document.activeElement is still the button/element
    // that triggered the modal open, because no focus-moving code has run since the click
    // that caused the state update. This capture is therefore safe and reliable.
    useEffect(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (isOpen) {
        // Capture before showModal() so we know where to return focus on close.
        triggerRef.current = document.activeElement;
        if (!dialog.open) dialog.showModal();
      } else {
        if (dialog.open) dialog.close();
        // Return focus to the trigger element.
        // If the trigger was removed from the DOM (e.g., a button that's hidden while modal
        // is open), document.body receives focus as the safe final fallback — this is
        // intentional and avoids focus loss.
        if (triggerRef.current instanceof HTMLElement && triggerRef.current.isConnected) {
          triggerRef.current.focus();
        }
        triggerRef.current = null;
      }
    }, [isOpen]);

    const typeStyles = {
      info: "border-blue-500 bg-blue-500/10 text-blue-400",
      success: "border-green-500 bg-green-500/10 text-green-400",
      warning: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
      error: "border-red-500 bg-red-500/10 text-red-400",
    };

    const buttonStyles = {
      primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
      secondary: "bg-neutral-800 hover:bg-neutral-700 text-neutral-300",
      danger: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20",
    };

    return (
      <dialog
        ref={dialogRef}
        data-testid="modal-dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        // Full-viewport positioning so the dialog acts as its own overlay.
        // `border-none` removes the browser's default <dialog> border (NOT the content box border).
        // `p-4` is a spacing gutter so the content box never touches viewport edges on small windows.
        // `bg-transparent` removes the browser's default white dialog background.
        className="fixed inset-0 m-0 flex h-full w-full max-h-none max-w-none items-center justify-center bg-transparent p-4 border-none"
        onClick={(e) => {
          // e.target === e.currentTarget means the click landed directly on the <dialog> element
          // (the backdrop area), NOT on any of its children. This is more robust than checking
          // against dialogRef.current, which could fail if the dialog is replaced during a re-render.
          if (e.target === e.currentTarget && dismissible) {
            onRequestClose();
          }
        }}
        onCancel={(e) => {
          // Escape key fires the 'cancel' event on the native dialog element.
          // Prevent the browser from closing the dialog directly; instead delegate to our state.
          e.preventDefault();
          if (dismissible) onRequestClose();
        }}
      >
        {/* Modal Content Container — stop click propagation so the backdrop-area handler
            on <dialog> only fires when clicking the actual backdrop, not the content box.
            NOTE: testid is "modal-content" (not "modal-backdrop") because the CSS backdrop
            is now the native dialog::backdrop pseudo-element. Existing E2E tests use
            "modal-dialog" and "modal-button-*" testids — no tests use "modal-backdrop" directly,
            so this rename is safe. */}
        <div
          data-testid="modal-content"
          onClick={(e) => e.stopPropagation()}
          className={clsx(
            "relative w-full max-w-md overflow-hidden rounded-xl border bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-200",
            typeStyles[type],
          )}
        >
          {/* Glow effect */}
          <div
            className={clsx(
              "absolute -top-12 -left-12 h-32 w-32 rounded-full blur-3xl opacity-20",
              type === "error"
                ? "bg-red-500"
                : type === "warning"
                  ? "bg-yellow-500"
                  : type === "success"
                    ? "bg-green-500"
                    : "bg-blue-500",
            )}
            aria-hidden="true"
          />

          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={clsx("p-2 rounded-lg border", typeStyles[type])}>
                {type === "error" && (
                  <svg
                    role="img"
                    aria-label="Error icon"
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                )}
                {type === "warning" && (
                  <svg
                    role="img"
                    aria-label="Warning icon"
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                {type === "success" && (
                  <svg
                    role="img"
                    aria-label="Success icon"
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {type === "info" && (
                  <svg
                    role="img"
                    aria-label="Info icon"
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
              <h2 id="modal-title" className="text-xl font-bold text-white">
                {title}
              </h2>
            </div>

            {customContent ? (
              <div className="text-neutral-300">{customContent}</div>
            ) : (
              <div className="text-neutral-300 space-y-2">
                {Array.isArray(message) ? (
                  <ul className="list-disc list-inside space-y-1">
                    {message.map((m, i) => (
                      <li key={`${i}-${m.substring(0, 20)}`}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-wrap">{message}</p>
                )}
              </div>
            )}

            {buttons.length > 0 && (
              <div className="mt-8 flex justify-end gap-3">
                {buttons.map((btn, i) => (
                  <button
                    key={`${i}-${btn.label}`}
                    type="button"
                    data-testid={buttonTestId(btn.label)}
                    onClick={() => btn.onClick?.()}
                    className={clsx(
                      "px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95",
                      buttonStyles[btn.variant || "secondary"],
                    )}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>
    );
  }
  ```

- [x] **Step 1.6: Run the failing unit tests — confirm they now pass**

  Run: `cd apps/desktop && npx vitest run src/ui/components/Modal.test.tsx`

  Expected: All 7 tests PASS (6 written in Step 1.2 + 1 always-render invariant test added after review, minus the diagnostic removed in Step 1.3 = 7 total). The original Modal.test.tsx had only 1 test — all tests here are newly written replacements, not the original. Remove the diagnostic test added in Step 1.3 before this run.

- [x] **Step 1.6a: Manual smoke test on WebView2**

  Run: `cd apps/desktop && pnpm tauri:dev`

  Open the app. Click the Vault Maintenance button. Verify:
  - The modal is centered and the backdrop overlay is visible (dark dimmed background)
  - Pressing Tab cycles focus within the modal only (does not escape to background content)
  - Clicking the close button dismisses the modal and focus returns to the Vault button
  - No visual artifacts or off-center positioning

  If the modal appears off-center or the backdrop is missing after the `showModal()` migration, check whether `position: fixed; inset: 0` on the `<dialog>` element conflicts with WebView2's top-layer behavior. On Chromium 79+ (WebView2), `fixed` positioning within the top layer is supported and should work. If not, remove `fixed inset-0` from the dialog's className and rely on the browser's default `showModal()` centering, then apply custom centering via CSS only on the content div.

- [x] **Step 1.7: Run the full unit test suite to check for regressions**

  Run: `cd apps/desktop && npx vitest run`

  Expected: All tests PASS. Fix any failures before proceeding.

- [x] **Step 1.8: Commit**

  ```bash
  git add apps/desktop/src/ui/components/Modal.tsx \
          apps/desktop/src/ui/components/Modal.test.tsx \
          apps/desktop/src/index.css
  git commit -m "feat(chunk-5): migrate Modal to showModal/close with native focus trap"
  ```

---

## Task 2: Resize Hardening — 900px Viewport Verification

**Files:**
- Verify: `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx` (already has `flex-wrap`)
- Possibly modify: `apps/desktop/src/ui/SpellEditor.tsx` (if overflow found)
- Possibly modify: `apps/desktop/src/ui/App.tsx` (if min-width needed)
- Modify (new): `apps/desktop/tests/accessibility_and_resize.spec.ts` (add first test)

### Background

`structuredPrimaryControlRowClass` and `structuredInlineScalarClusterClass` already have `flex-wrap` from Chunk 4. The 900px task is primarily verification. The outer app container (`max-w-6xl` with `px-4`) at 900px window gives ~868px effective content width — verify no fixed-width layout breaks this.

- [x] **Step 2.0: Pre-verify the `empty-library-create-button` testid exists**

  Run: `grep -n "empty-library-create-button" apps/desktop/src/ui/Library.tsx`

  Expected: At least one match confirming the testid was added in Chunk 3. If not found, use `page.getByRole("button", { name: /create spell/i })` as the locator in Step 2.1 below.

- [x] **Step 2.1: Create the E2E test file with the 900px resize test**

  Create `apps/desktop/tests/accessibility_and_resize.spec.ts`:

  ```typescript
  import { expect, test } from "./fixtures/test-fixtures";
  import { TIMEOUTS } from "./fixtures/constants";
  import { SpellbookApp } from "./page-objects/SpellbookApp";

  test.describe("Resize Hardening — 900px viewport", () => {
    test("spell editor structured fields do not overflow at 900px window width", async ({
      appContext,
    }) => {
      const { page } = appContext;
      const app = new SpellbookApp(page);

      await test.step("Navigate to spell editor (new spell)", async () => {
        await app.navigate("Library");
        await page.waitForTimeout(500);
        await page.getByTestId("empty-library-create-button")
          .or(page.getByRole("button", { name: /create spell/i }))
          .first()
          .click();
        await expect(
          page.locator("[data-testid='spell-name-input'], input[placeholder*='name' i]").first(),
        ).toBeVisible({ timeout: TIMEOUTS.medium });
      });

      await test.step("Resize window to 900px wide", async () => {
        await page.setViewportSize({ width: 900, height: 768 });
        await page.waitForTimeout(500); // 500ms matches standard settlement wait in this codebase
      });

      await test.step("Confirm viewport width is actually 900px", async () => {
        // setViewportSize() in CDP/WebView2 mode sets the emulated viewport.
        // If window.innerWidth !== 900, the resize did not take effect in the real window —
        // in that case skip the test rather than failing hard, since the overflow check below
        // would be testing the wrong viewport. Re-run the resize test manually at 900px.
        const innerWidth = await page.evaluate(() => window.innerWidth);
        if (innerWidth !== 900) {
          test.skip(true, `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`);
          return;
        }
        expect(innerWidth).toBe(900);
      });

      await test.step("Verify no horizontal scrollbar on spell editor page", async () => {
        // Checks root-level overflow. Note: content hidden by overflow:hidden on parents
        // won't be detected here — that's acceptable for the 900px minimum-width requirement.
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);
      });

      await test.step("Restore viewport", async () => {
        await page.setViewportSize({ width: 1280, height: 768 });
      });
    });

    test("library page does not overflow at 900px window width", async ({
      appContext,
    }) => {
      const { page } = appContext;
      const app = new SpellbookApp(page);

      await test.step("Navigate to library", async () => {
        await app.navigate("Library");
        await page.waitForTimeout(500);
      });

      await test.step("Resize window to 900px wide", async () => {
        await page.setViewportSize({ width: 900, height: 768 });
        await page.waitForTimeout(500);
      });

      await test.step("Verify no horizontal scrollbar", async () => {
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);
      });

      await test.step("Restore viewport", async () => {
        await page.setViewportSize({ width: 1280, height: 768 });
      });
    });

    test("spell editor structured fields do not overflow at 900px with populated data", async ({
      appContext,
    }) => {
      // This test verifies that structured fields (Range, Duration, CastingTime)
      // wrap correctly when populated — a minimal/empty editor may pass even with broken flex.
      const { page } = appContext;
      const app = new SpellbookApp(page);

      // Capture the spell name so we can reopen it with app.openSpell()
      const spellName = `Chunk5 Resize Test ${Date.now()}`;

      await test.step("Create a spell with structured field data", async () => {
        // Use app.createSpell with tradition=Arcane so school/casting/range/duration fields appear
        await app.createSpell({
          name: spellName,
          level: 1,
        });
        // After save, spell is in Library; open it for editing
        await app.waitForLibrary();
      });

      await test.step("Open the newly created spell in editor", async () => {
        // Use app.openSpell() (search-and-click workflow) rather than clicking the first spell row
        // directly, as clicking a row may not navigate to the editor if the row click-to-edit
        // behavior changes. app.openSpell() is the robust page-object method for this workflow.
        await app.openSpell(spellName);
        await page.waitForTimeout(500);
      });

      await test.step("Resize to 900px wide", async () => {
        await page.setViewportSize({ width: 900, height: 768 });
        await page.waitForTimeout(500);
      });

      await test.step("Verify no horizontal overflow with populated editor", async () => {
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);
      });

      await test.step("Restore viewport", async () => {
        await page.setViewportSize({ width: 1280, height: 768 });
      });
    });
  });
  ```

- [x] **Step 2.2: Build the frontend and run the resize tests**

  Run:
  ```bash
  cd apps/desktop
  pnpm build
  npx playwright test accessibility_and_resize.spec.ts --reporter=line
  ```

  Expected: All three resize tests PASS. If a test fails due to overflow:

  - Open DevTools / check which element overflows
  - Common fix: add `min-w-0` and `overflow-x-hidden` to the relevant container in `SpellEditor.tsx` or `App.tsx`
  - Fix the overflow, rebuild (`pnpm build`), rerun

- [x] **Step 2.3: Commit**

  ```bash
  git add apps/desktop/tests/accessibility_and_resize.spec.ts
  # If SpellEditor.tsx or App.tsx was also changed:
  # git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/App.tsx
  git commit -m "test(chunk-5): add 900px resize overflow verification tests"
  ```

---

## Task 3: Keyboard Navigation Audit and Focus Indicators

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/Library.tsx`
- Modify: `apps/desktop/src/ui/SettingsPage.tsx`
- Modify: `apps/desktop/src/ui/App.tsx`

### Background

Every interactive element must have a visible `:focus-visible` ring. The established pattern in this codebase (from `ComponentCheckboxes.tsx`) is:

```
focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900
```

Use this class string on all `<button>`, `<input>`, `<select>`, `<a>`, and `<textarea>` elements that do not already have it.

Keyboard submit: verify `<form>` elements have `<button type="submit">` or that pressing Enter in inputs triggers the expected action.

Escape dismissal: now handled natively by the modal migration (Task 1).

- [x] **Step 3.1: Read SpellEditor.tsx and apply focus indicator audit**

  Read `apps/desktop/src/ui/SpellEditor.tsx`.

  Scan every `<button>`, `<input>`, `<select>`, and `<a>` element for the presence of a `focus-visible:ring` class. Add the standard ring classes to any element missing them:

  ```
  focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900
  ```

  For **invalid-state** inputs, use the red-ring variant where applicable:
  ```
  focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900
  ```

  **Focus style replacement guidance:** If an element already has a custom `focus:` (not `focus-visible:`) style that applies to both mouse and keyboard focus, replace it with `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900`. If an element already has a `focus-visible:ring` style that uses a different color or width, replace it with the standard pattern above for consistency. Exception: if an element has a domain-specific custom focus treatment that is intentional and WCAG-compliant (e.g., a large visible outline), document the exception in a comment but do not remove it.

  Verify the save button, name input, tradition select, school select, and all other form controls have visible rings.

  **Form/Enter key check:** Read SpellEditor.tsx and determine whether it uses a `<form>` element wrapping the save button. If it does, pressing Enter in the name input will submit the form. If it does NOT use `<form>`, verify that the name input has an explicit `onKeyDown` handler that triggers the save action on Enter. If neither exists, add:
  ```tsx
  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
  ```
  to the spell name input so keyboard submit works.

  **Manual focus indicator verification:** After applying the focus classes, run `pnpm tauri:dev`, navigate to the spell editor, and press Tab through all fields. Verify each field shows a clearly visible blue ring when focused. If a ring class conflicts with an existing Tailwind `focus:` style or a component library override, remove the conflicting old class first.

- [x] **Step 3.2: Read Library.tsx and apply focus indicator audit**

  Read `apps/desktop/src/ui/Library.tsx`.

  Apply the same `focus-visible:ring` pattern to all interactive elements. Pay particular attention to:
  - Search input
  - Filter selects
  - Spell row action buttons (edit, add-to-character)
  - Pagination controls (if any)
  - Empty-state CTA buttons (`empty-library-create-button`, `empty-library-import-button`, `empty-search-reset-button`)

- [x] **Step 3.3: Read SettingsPage.tsx and App.tsx and apply focus indicator audit**

  Read `apps/desktop/src/ui/SettingsPage.tsx` and `apps/desktop/src/ui/App.tsx`.

  In `App.tsx`: ensure all nav `<Link>` elements and header buttons (Backup, Vault, Restore, Settings gear) have visible focus rings. The `Tab` component uses `Link` — verify it has a focus ring class. The settings gear `Link` already has `focus` styles — verify `focus-visible` is used (not just `focus:` which includes mouse focus).

  In `SettingsPage.tsx`: ensure the theme select and follow-system checkbox have visible focus rings.

- [x] **Step 3.4: Run unit tests to ensure no regressions**

  Run: `cd apps/desktop && npx vitest run`

  Expected: All tests PASS.

- [x] **Step 3.5: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx \
          apps/desktop/src/ui/Library.tsx \
          apps/desktop/src/ui/SettingsPage.tsx \
          apps/desktop/src/ui/App.tsx
  git commit -m "feat(chunk-5): add visible focus indicators across touched pages"
  ```

---

## Task 4: Semantic Heading Hierarchy Audit

> **Scope note:** This task IS in Chunk 5 scope. `tasks.md` line 187 ("Audit touched pages and dialogs for proper semantic heading hierarchy") is listed under the "Keyboard navigation and labels" section of Chunk 5.

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/Library.tsx`
- Modify: `apps/desktop/src/ui/SettingsPage.tsx`
- Modify: `apps/desktop/src/ui/App.tsx`

### Background

The spec requires a proper semantic heading hierarchy. The pattern is:
- `<h1>` — page-level heading (one per page, describes what the page is)
- `<h2>` — section headings within the page
- `<h3>` — sub-section headings

Note: the app header "Spellbook" text in `App.tsx` (line 263) uses `<div>` — it is a logo/brand, NOT a page heading. This is acceptable. Each route's content should provide its own `<h1>`.

**Expected canonical heading structure per page** (use as the target — implement what is missing, do not add extra headings):

| Page | Expected heading hierarchy |
|------|---------------------------|
| Library (`Library.tsx`) | `<h1>Spell Library</h1>`, `<h2>` for filter panel if present |
| SpellEditor (`SpellEditor.tsx`) | `<h1>New Spell</h1>` or `<h1>Edit Spell</h1>` (dynamic), `<h2>` for "Basic Information", "Structured Fields", "Components" sections |
| SettingsPage (`SettingsPage.tsx`) | `<h1>Settings</h1>`, `<h2 id="settings-appearance-heading">Appearance</h2>` (keep this id stable — used by `aria-labelledby`) |
| App shell (`App.tsx`) | No headings — the logo div is decorative |

If the current code uses `<div>` with heading-sized typography instead of `<h*>` elements, replace the `<div>` with the appropriate heading tag. Do NOT change visual styling — only the element type.

The `SettingsPage` already uses `id="settings-appearance-heading"` for an `aria-labelledby` association — that heading must remain stable.

Rules:
- Do NOT skip heading levels (e.g., go from `h1` to `h3` without `h2`)
- Do NOT use headings just for visual size — use them for semantic structure
- `Modal.tsx` has `<h2 id="modal-title">` which is correct (modal content is a secondary context)

- [ ] **Step 4.1: Audit heading structure in SpellEditor.tsx**

  Read `apps/desktop/src/ui/SpellEditor.tsx`.

  Look for `<h1>`, `<h2>`, `<h3>`, `<h4>` elements and any divs styled as headings (e.g., large bold text that acts as a section header but uses `<div>` or `<span>`).

  Expected state: SpellEditor should have a `<h1>` (e.g., "New Spell" or "Edit Spell") and section headings `<h2>` or `<h3>` for "Basic Info", "Structured Fields", etc.

  Fix any headings that are wrong type or using non-semantic elements. Do not change visual styling, only the element type.

- [ ] **Step 4.2: Audit heading structure in Library.tsx**

  Read `apps/desktop/src/ui/Library.tsx`.

  Expected: Library has a `<h1>` for the page title (e.g., "Spell Library") and `<h2>` for any sections. The EmptyState component renders its own heading — verify it uses the correct level in context.

- [ ] **Step 4.3: Audit heading structure in SettingsPage.tsx**

  Read `apps/desktop/src/ui/SettingsPage.tsx`.

  Expected: SettingsPage has a `<h1>` ("Settings") and `<h2>` for each section (e.g., the "Appearance" heading with `id="settings-appearance-heading"`).

  The `aria-labelledby="settings-appearance-heading"` association must remain intact.

- [ ] **Step 4.4: Run unit tests to ensure no regressions**

  Run: `cd apps/desktop && npx vitest run`

  Expected: All tests PASS.

- [ ] **Step 4.5: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx \
          apps/desktop/src/ui/Library.tsx \
          apps/desktop/src/ui/SettingsPage.tsx
  git commit -m "feat(chunk-5): fix semantic heading hierarchy on touched pages"
  ```

---

## Task 5: Label and ARIA Association Audit

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/Library.tsx`
- Modify: `apps/desktop/src/ui/SettingsPage.tsx`

### Background

Per the spec:
- **Prefer visible `<label>` elements** as the primary accessible name for inputs
- Use `aria-label` only where there is NO visible label text or where disambiguation is needed
- Associate error text with its field via `aria-describedby` pointing to the error element's `id`
- Associate help text (e.g., hint text below an input) via `aria-describedby` as well

Existing correct pattern (from Chunk 2): invalid fields have `aria-invalid="true"` and `aria-describedby` pointing to the error message element.

Existing incorrect pattern to fix: inputs that have BOTH a visible `<label>` AND a redundant `aria-label` with the same text — remove the `aria-label` in those cases.

- [ ] **Step 5.1: Audit SpellEditor.tsx for label/aria associations**

  Read `apps/desktop/src/ui/SpellEditor.tsx`.

  **Decision tree for each input/select/textarea:**
  1. Has an associated visible `<label htmlFor="...">` or wrapping `<label>`?
     - YES → This is the primary accessible name. Remove any `aria-label` that duplicates the same text verbatim (redundant). Keep `aria-label` ONLY if it provides additional context beyond what the visible label says.
     - NO → Has visible text near the input (e.g., a `<span>` label, column header, or inline text)?
       - YES → Associate via `<label htmlFor>` (preferred) or `aria-labelledby` pointing to the text element's `id`.
       - NO → Has only a placeholder or is icon-only? → Add `aria-label` describing the input's purpose.
  2. Is the field in an error state? → Confirm `aria-invalid="true"` is present AND `aria-describedby` points to the error message element's `id`.
  3. Is there help text below the field (e.g., a hint about format)? → Add `aria-describedby` referencing the help text element's `id` (in addition to any error `aria-describedby`; use space-separated ids: `aria-describedby="help-field-name error-field-name"`).
  4. Placeholder text alone is NOT a substitute for a label — it disappears when the user types.

- [ ] **Step 5.2: Audit Library.tsx for label/aria associations**

  Apply the same rules. The Library filter inputs (schools, min/max level, source, class, component, tag) already have `aria-label` per the existing code — verify these are necessary (i.e., no visible label exists for those filter controls).

- [ ] **Step 5.3: Audit SettingsPage.tsx for label/aria associations**

  The settings theme select and follow-system checkbox should have visible `<label>` elements per the spec (design.md Decision 9). Verify they have proper `htmlFor`/`id` pairings.

- [ ] **Step 5.4: Run unit tests to ensure no regressions**

  Run: `cd apps/desktop && npx vitest run`

  Expected: All tests PASS.

- [ ] **Step 5.5: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx \
          apps/desktop/src/ui/Library.tsx \
          apps/desktop/src/ui/SettingsPage.tsx
  git commit -m "feat(chunk-5): fix label associations and aria-describedby on touched pages"
  ```

---

## Task 6: Color Contrast Verification and Fixes

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx` (if violations found)
- Modify: `apps/desktop/src/ui/Library.tsx` (if violations found)
- Modify: `apps/desktop/src/ui/SettingsPage.tsx` (if violations found)
- Modify: `apps/desktop/src/ui/App.tsx` (if violations found)

### Background

WCAG 2.1 AA requirements:
- Normal text (< 18px or < 14px bold): **4.5:1** contrast ratio vs background
- Large text (≥ 18px or ≥ 14px bold): **3:1** contrast ratio
- Non-text interactive elements (borders of inputs, buttons): **3:1** contrast ratio
- Error and warning text: must meet normal text ratio in both themes

The project palette (from design.md):

| Role | Light class | Dark class |
|------|------------|------------|
| bg-base | `bg-neutral-50` | `dark:bg-neutral-900` |
| bg-surface | `bg-white` | `dark:bg-neutral-800` |
| border | `border-neutral-300` | `dark:border-neutral-700` |
| text-muted | `text-neutral-600` | `dark:text-neutral-400` |
| error-bg | `bg-red-50` | `dark:bg-red-950` |

Known risk areas to verify:
- `text-neutral-600` on `bg-white` (light mode): #525252 on #ffffff = ~7:1 — PASS
- `text-neutral-400` on `bg-neutral-900` (dark mode): #a3a3a3 on #171717 = ~7.4:1 — PASS
- `text-neutral-300` on `bg-neutral-900` (dark mode): #d4d4d4 on #171717 = ~11.8:1 — PASS
- Error text `text-red-600` on `bg-red-50` (light mode): #dc2626 on #fef2f2 = ~3.9:1 — FAILS for small text (below 4.5:1 threshold). Fix required: use `text-red-700 dark:text-red-400` on red-tinted backgrounds
- Warning text `text-yellow-500` on `bg-neutral-900` (dark mode): #eab308 on #171717 = ~7.5:1 — PASS
- `text-neutral-500` placeholder text: may fail 4.5:1 — verify in context

The main risk is error/warning text in light mode and placeholder text.

- [ ] **Step 6.1: Audit and fix error text contrast in light mode**

  Search in `SpellEditor.tsx`, `Library.tsx`, `SettingsPage.tsx` for error-state text classes:

  ```bash
  grep -n "text-red-" apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/Library.tsx
  ```

  If `text-red-500` or `text-red-400` is used for error text on light backgrounds, replace with `text-red-600 dark:text-red-400` (red-600 on white passes at ~5.9:1).

  If `text-red-600` is already used for error text, it passes on white. Verify the background: if on `bg-red-50`, the ratio drops to ~3.9:1 which FAILS for small text. Fix: use `text-red-700 dark:text-red-400` on red-tinted backgrounds.

  Verification ratios (approximate):
  - `text-red-700` (#b91c1c) on `bg-red-50` (#fef2f2): ~5.7:1 — PASS
  - `text-red-600` (#dc2626) on `bg-white` (#ffffff): ~5.9:1 — PASS
  - `text-red-400` (#f87171) on `bg-neutral-900` (#171717): ~5.3:1 — PASS (dark mode)

- [ ] **Step 6.2: Audit and fix warning text contrast**

  Search for `text-yellow-` classes used for small warning text.

  `text-yellow-500` (#eab308) on `bg-white`: ~2.7:1 — FAILS for small text. Fix: use `text-yellow-700 dark:text-yellow-400` for warning text labels.

  `text-yellow-400` (#facc15) on dark `bg-neutral-900`: ~9.7:1 — PASS.

- [ ] **Step 6.3: Audit and fix placeholder/muted text contrast**

  Search for `placeholder-` and `text-neutral-500` classes on light backgrounds.

  `text-neutral-500` (#737373) on `bg-white`: ~4.6:1 — borderline PASS (just above 4.5:1). OK to leave.

  `placeholder-neutral-500` on white: same calculation. Placeholder text is informational, not required to pass in some interpretations, but target 4.5:1 for AA. This passes.

  If `text-neutral-400` (#a3a3a3) on `bg-white` (#ffffff): ~2.6:1 — FAILS. Fix: use `text-neutral-500 dark:text-neutral-400`.

- [ ] **Step 6.3b: Audit ALL muted/secondary text colors (not just error/warning)**

  Search for these patterns in touched files and verify they meet 4.5:1 on their backgrounds:
  ```bash
  grep -n "text-neutral-400\|text-neutral-500\|text-stone-400\|text-stone-500\|text-slate-400" \
    apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/Library.tsx \
    apps/desktop/src/ui/SettingsPage.tsx apps/desktop/src/ui/App.tsx
  ```

  Known passing combinations:
  - `text-neutral-400` on `bg-neutral-900` (dark): ~7.4:1 ✓
  - `text-neutral-500` on `bg-white` (light): ~4.6:1 ✓ (borderline — acceptable)

  Risk: `text-neutral-400` (#a3a3a3) on `bg-white` (#ffffff): ~2.6:1 — FAILS. If found in light mode, change to `text-neutral-500 dark:text-neutral-400`.

  Also audit disabled button text: disabled buttons that use `text-neutral-500` on `bg-neutral-100` light: check the combination. If failing, use `text-neutral-600 dark:text-neutral-400` for disabled state.

- [ ] **Step 6.3c: Audit large text elements for 3:1 ratio**

  Large text (≥ 18px or ≥ 14px bold) only needs 3:1. Search for heading elements and large text classes:
  ```bash
  grep -n "text-xl\|text-2xl\|text-3xl\|text-4xl\|<h1\|<h2\|<h3" \
    apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/Library.tsx \
    apps/desktop/src/ui/SettingsPage.tsx apps/desktop/src/ui/App.tsx
  ```

  All neutral-900+ text on white and all neutral-100+ text on neutral-900 large text comfortably exceed 3:1. No action needed unless a colored heading is found (e.g., a red or yellow `<h2>` title). If a colored heading is found, verify its ratio against the page background.

- [ ] **Step 6.4: Document the interactive element border contrast decision**

  `border-neutral-300` (#d4d4d4) on `bg-white` (#ffffff): ~1.6:1 — FAILS the 3:1 non-text WCAG requirement for input borders.

  **Required action**: This is a spec requirement (`tasks.md` line 200: "Ensure interactive elements meet minimum 3:1 contrast ratio"). The design system has used `border-neutral-300` throughout Chunks 1-4. There are two acceptable resolutions — choose ONE and apply it consistently:

  **Option A (Recommended):** Upgrade input border color on light backgrounds from `border-neutral-300` to `border-neutral-400` in touched components (SpellEditor.tsx, Library.tsx, SettingsPage.tsx). `border-neutral-400` (#a3a3a3) on white: ~2.6:1 — still fails. Use `border-neutral-500` (#737373) on white: ~4.6:1 — PASSES both 3:1 and 4.5:1. Update the pattern: `border-neutral-500 dark:border-neutral-700`.

  **Option B (Accepted deviation):** If the design system decision is that desktop app border contrast is intentionally relaxed below 3:1, document this explicitly: Add a comment to each affected component file: `{/* Border contrast: border-neutral-300 on white bg = 1.6:1, below WCAG 3:1 for non-text — accepted deviation for Tauri desktop app per design system decision [date] */}`. The focus-visible ring (from Task 3) provides functional keyboard accessibility even with low-contrast borders.

  **Whichever option you choose**: Be consistent. Do not mix upgraded borders in some components and kept `border-neutral-300` in others.

- [ ] **Step 6.5: Run unit tests to ensure no regressions**

  Run: `cd apps/desktop && npx vitest run`

  Expected: All tests PASS.

- [ ] **Step 6.6: Commit**

  ```bash
  git add apps/desktop/src/ui/SpellEditor.tsx \
          apps/desktop/src/ui/Library.tsx \
          apps/desktop/src/ui/SettingsPage.tsx \
          apps/desktop/src/ui/App.tsx
  git commit -m "feat(chunk-5): fix color contrast violations on error/warning text"
  ```

---

## Task 7: E2E Tests for Focus Trap and Keyboard Navigation

**Files:**
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`

### Background

These tests complete the `accessibility_and_resize.spec.ts` file started in Task 2. They verify:
1. Modal shows and returns focus to the opener
2. Escape key dismisses a dismissible modal
3. Keyboard navigation tab order is logical on the Library page

The modal tests must rebuild the frontend first since Task 1 changed `Modal.tsx`.

- [ ] **Step 7.0: Pre-check: verify Playwright version supports `toPass()`**

  Run: `npx playwright --version` in `apps/desktop`.

  Expected: version >= 1.32 (where `expect(...).toPass()` was introduced). If the installed version is older, replace the `toPass` block in Step 7.1's focus-return assertion with a manual polling loop:
  ```typescript
  // Fallback if Playwright < 1.32:
  let focusedTestId: string | null = null;
  for (let i = 0; i < 10; i++) {
    focusedTestId = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid"),
    );
    if (focusedTestId === "btn-vault-maintenance") break;
    await page.waitForTimeout(200);
  }
  expect(focusedTestId).toBe("btn-vault-maintenance");
  ```

- [ ] **Step 7.0b: Verify VaultMaintenanceDialog's close button testid**

  Run: `grep -n "testid\|data-testid\|close" apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx | head -20`

  Expected: VaultMaintenanceDialog has a close/done button with testid `btn-close-vault-maintenance` (per the existing code). Confirm the exact testid before writing the test. If the testid is different, update Step 7.1's references accordingly.

  **Important constraints established from reading App.tsx:**
  - `btn-vault-maintenance` opens `showModal({ dismissible: false, buttons: [], customContent: <VaultMaintenanceDialog /> })`
  - `btn-backup` / `btn-restore` open `modalAlert()`/`modalConfirm()` — both set `dismissible: false`
  - The `useModal` convenience helpers (`alert`, `confirm`) always use `dismissible: false`
  - **All modals triggered by the header buttons are non-dismissible**
  - Only the vault startup integrity warning modal (`showModalIfIdle({ dismissible: true })`) is dismissible, but it triggers only when vault issues are detected at startup

  **Consequence for E2E tests:**
  - Focus-return test: use the VaultMaintenanceDialog's own close button (confirmed testid in step above)
  - Escape-dismissal E2E test: OMIT from this spec. The `onCancel` handler is fully covered by the unit tests in Task 1 (cancel event simulation). E2E Escape behavior cannot be reliably tested without a controllable dismissible modal trigger.
  - Backdrop-click-dismiss E2E test: similarly omit — no dismissible modal is reachable from a deterministic flow

- [ ] **Step 7.1: Add modal focus-trap and focus-return E2E tests**

  Append to `apps/desktop/tests/accessibility_and_resize.spec.ts`:

  ```typescript
  test.describe("Modal focus trap and focus return", () => {
    test("modal traps focus within dialog and returns it to opener after close", async ({
      appContext,
    }) => {
      const { page } = appContext;
      const app = new SpellbookApp(page);

      await test.step("Navigate to Library to get a stable page state", async () => {
        await app.navigate("Library");
        await page.waitForTimeout(500);
      });

      await test.step("Verify Vault Maintenance button is present before interacting", async () => {
        // Fast-fail if the button is missing rather than hanging at a click or waitFor
        await expect(page.getByTestId("btn-vault-maintenance")).toBeVisible({
          timeout: TIMEOUTS.short,
        });
      });

      await test.step("Open Vault Maintenance modal via header button", async () => {
        await page.getByTestId("btn-vault-maintenance").click();
        await expect(page.getByTestId("modal-dialog")).toBeVisible({
          timeout: TIMEOUTS.short,
        });
      });

      await test.step("Verify focus is trapped inside the modal", async () => {
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("[data-testid='modal-dialog']");
          return dialog?.contains(document.activeElement) ?? false;
        });
        expect(isInsideModal).toBe(true);
      });

      await test.step("Tab through all focusable elements — focus never escapes modal", async () => {
        // Count focusable elements first so we tab enough to guarantee a full cycle.
        // Note: this test verifies focus STAYS inside the modal after N tabs, not that
        // wrap-around works specifically — wrap-around is browser-native behavior guaranteed
        // by showModal(). Even with 1 focusable element, after 5 tabs focus stays inside.
        const focusableCount = await page
          .locator("[data-testid='modal-dialog'] button, [data-testid='modal-dialog'] input, [data-testid='modal-dialog'] [tabindex]:not([tabindex='-1'])")
          .count();
        // Tab (count + 2) times to cycle through all + one wrap-around
        const tabCount = Math.max(focusableCount + 2, 5);
        for (let i = 0; i < tabCount; i++) {
          await page.keyboard.press("Tab");
          const isInsideModal = await page.evaluate(() => {
            const dialog = document.querySelector("[data-testid='modal-dialog']");
            return dialog?.contains(document.activeElement) ?? false;
          });
          expect(isInsideModal).toBe(true);
        }
      });

      await test.step("Verify the VaultMaintenanceDialog close button testid matches Step 7.0", async () => {
        // If this fails, re-run Step 7.0 grep to find the real close button testid
        await expect(page.getByTestId("btn-close-vault-maintenance")).toBeVisible({
          timeout: TIMEOUTS.short,
        });
      });

      await test.step("Close modal via VaultMaintenanceDialog close button", async () => {
        await page.getByTestId("btn-close-vault-maintenance").click();
        await expect(page.getByTestId("modal-dialog")).not.toBeVisible({
          timeout: TIMEOUTS.short,
        });
      });

      await test.step("Verify focus returned to the Vault Maintenance button", async () => {
        // Use toPass() with timeout to handle the async focus restoration in useEffect
        await expect(async () => {
          const focusedTestId = await page.evaluate(
            () => document.activeElement?.getAttribute("data-testid"),
          );
          expect(focusedTestId).toBe("btn-vault-maintenance");
        }).toPass({ timeout: TIMEOUTS.short });
      });
    });
  });
  // NOTE: Escape-key dismissal is not E2E-tested here because all modals reachable
  // from header buttons use dismissible:false. The onCancel handler that processes
  // the Escape 'cancel' event is covered by unit tests in Modal.test.tsx.
  // If a dismissible modal trigger is added in a future chunk, add the Escape E2E
  // test at that time.
  ```

  ```typescript
  test.describe("Keyboard navigation tab order", () => {
    test("Library page has logical tab order through search and filters", async ({
      appContext,
    }) => {
      const { page } = appContext;
      const app = new SpellbookApp(page);

      await test.step("Navigate to Library", async () => {
        await app.navigate("Library");
        await page.waitForTimeout(500);
      });

      await test.step("Tab from search input reaches filter controls in order", async () => {
        // Focus the search input first
        await page.getByTestId("search-input").or(
          page.getByRole("searchbox")
        ).first().click();

        // Tab through a few controls and verify focus moves forward logically
        // (not backward, not stuck)
        const focusedElements: string[] = [];
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press("Tab");
          const testId = await page.evaluate(
            () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? "",
          );
          focusedElements.push(testId);
        }

        // All focused elements should be non-empty (focus must be moving)
        expect(focusedElements.every((id) => id.length > 0)).toBe(true);
        // No element should appear twice (no focus loops in first 5 tabs)
        const unique = new Set(focusedElements);
        expect(unique.size).toBe(focusedElements.length);
      });
    });
  });
  ```

- [ ] **Step 7.2: Build the frontend and run ALL accessibility tests**

  Run:
  ```bash
  cd apps/desktop
  pnpm build
  npx playwright test accessibility_and_resize.spec.ts --reporter=line
  ```

  Expected: All tests PASS.

  Common failure modes and fixes:
  - **"modal-dialog not visible"**: Check if the VaultMaintenanceDialog opens the custom Modal or a native dialog. If the modal uses `customContent`, the dialog is still rendered via `Modal.tsx` and should have `data-testid="modal-dialog"`.
  - **"focus not inside modal"**: The native `showModal()` auto-focuses the first focusable element inside the dialog. Verify the `<dialog>` element (or the content div inside it) contains at least one focusable element.
  - **"btn-close-vault-maintenance not found"**: The actual testid may differ — re-run Step 7.0's grep to get the correct testid from VaultMaintenanceDialog.tsx.
  - **"focus not returned to btn-vault-maintenance"**: Verify the trigger capture runs BEFORE `showModal()` in the useEffect. The `triggerRef.current = document.activeElement` assignment happens before `dialog.showModal()` so this should work if the button was focused when clicked.

- [ ] **Step 7.3: Run the full E2E suite to check for regressions**

  Run: `cd apps/desktop && npx playwright test --reporter=line`

  Expected: All previously passing tests still pass. Investigate any failures related to the modal change:
  - If existing tests used `page.getByRole("dialog")` they will still work (native `<dialog>` has role="dialog")
  - The existing unit test (`Modal.test.tsx`) that previously asserted `data-testid="modal-backdrop"` is fully replaced in Step 1.2. No E2E tests reference `modal-backdrop` — confirmed by grepping the test suite before writing this plan. The new inner content div uses `data-testid="modal-content"`.

- [ ] **Step 7.4: Commit**

  ```bash
  git add apps/desktop/tests/accessibility_and_resize.spec.ts
  git commit -m "test(chunk-5): add modal focus-trap, Escape dismissal, and keyboard nav tests"
  ```

---

## Summary of All Files Changed

| File | Change Type | Reason |
|------|-------------|--------|
| `apps/desktop/src/ui/components/Modal.tsx` | Rewrite ModalShell | Native focus trap via showModal() |
| `apps/desktop/src/ui/components/Modal.test.tsx` | Rewrite tests | Move from renderToStaticMarkup to @testing-library/react |
| `apps/desktop/src/index.css` | Append | dialog::backdrop CSS for overlay |
| `apps/desktop/src/ui/SpellEditor.tsx` | Audit / fix | Focus indicators, headings, labels, contrast |
| `apps/desktop/src/ui/Library.tsx` | Audit / fix | Focus indicators, headings, labels |
| `apps/desktop/src/ui/SettingsPage.tsx` | Audit / fix | Focus indicators, headings, labels |
| `apps/desktop/src/ui/App.tsx` | Audit / fix | Focus indicators, nav heading, contrast |
| `apps/desktop/tests/accessibility_and_resize.spec.ts` | Create | Resize, focus-trap, Escape, keyboard nav tests |

## Verification Checklist Before Declaring Done

- [ ] `npx vitest run` — 0 failures
- [ ] `npx playwright test accessibility_and_resize.spec.ts` — 0 failures
- [ ] `npx playwright test` (full suite) — 0 new failures
- [ ] Manual check: open a modal, press Tab several times — focus stays inside modal
- [ ] Manual check: press Escape — dismissible modal closes; focus returns to opener
- [ ] Manual check: resize window to 900px — no horizontal scrollbar on Library or SpellEditor
- [ ] Manual check: tab through Library filters — visible focus ring on each element
- [ ] All Chunk 5 items in `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` lines 169–203 checked off
- [ ] Documentation sync: check `docs/TESTING.md` and `docs/ARCHITECTURE.md` for any references to the old `<dialog open>` pattern or Modal behavior — update if they describe the old focus behavior or omit the new focus-trap behavior
- [ ] `handleCustomModal` compatibility: confirm at least one existing E2E test that calls `handleCustomModal` still passes with the `showModal()`/`close()` migration (the `dialog.close()` sets `display:none`, so `waitFor({ state: 'hidden' })` in `handleCustomModal` should still work)
