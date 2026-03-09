/**
 * Dialog handling utilities for E2E tests.
 * Supports both native browser dialogs (window.alert/confirm)
 * and our custom React-based Modal component.
 */
import type { Dialog, Page } from "@playwright/test";

export interface DialogHandlerOptions {
  /** Accept dialogs containing "Delete" by default */
  acceptDelete?: boolean;
  /** Dismiss validation error dialogs */
  dismissValidation?: boolean;
  /** Log dialog events to console */
  debug?: boolean;
  /** Custom handler for specific dialogs */
  custom?: (dialog: Dialog) => Promise<boolean>;
}

/**
 * Sets up a native browser dialog handler.
 * NOTE: For the custom React modal, use handleCustomModal().
 */
export function setupDialogHandler(page: Page, options: DialogHandlerOptions = {}): () => void {
  const { acceptDelete = true, dismissValidation = true, debug = false, custom } = options;

  const handler = async (dialog: Dialog) => {
    const message = dialog.message();

    if (debug) {
      console.log(`DIALOG: ${dialog.type()} - ${message}`);
    }

    // Custom handler takes precedence
    if (custom) {
      const handled = await custom(dialog);
      if (handled) return;
    }

    // Handle validation errors
    if (
      dismissValidation &&
      (message.includes("fix validation errors") || message.includes("restricted"))
    ) {
      await dialog.dismiss().catch(() => {});
      return;
    }

    // Handle delete confirmations
    if (acceptDelete && message.includes("Delete")) {
      await dialog.accept().catch(() => {});
      return;
    }

    // Default: dismiss
    await dialog.dismiss().catch(() => {});
  };

  page.on("dialog", handler);

  // Return cleanup function
  return () => {
    page.removeListener("dialog", handler);
  };
}

/**
 * Handles our custom React-based modal.
 * This is an async helper that can be used inside tests to detect and interact with the modal.
 */
export async function handleCustomModal(page: Page, action: "OK" | "Cancel" | "Confirm" = "OK") {
  const modal = page.getByRole("dialog");
  await modal.waitFor({ state: "visible", timeout: 5000 });
  const button = modal.getByRole("button", { name: action, exact: true });
  await button.click();
  await modal.waitFor({ state: "hidden", timeout: 5000 });
}

/** Simple dialog handler that always dismisses */
export function setupDismissAllDialogs(page: Page, debug = false): () => void {
  const handler = async (dialog: Dialog) => {
    if (debug) {
      console.log(`DIALOG (dismissed): ${dialog.type()} - ${dialog.message()}`);
    }
    await dialog.dismiss().catch(() => {});
  };

  page.on("dialog", handler);
  return () => page.removeListener("dialog", handler);
}

/** Simple dialog handler that always accepts */
export function setupAcceptAllDialogs(page: Page, debug = false): () => void {
  const handler = async (dialog: Dialog) => {
    if (debug) {
      console.log(`DIALOG (accepted): ${dialog.type()} - ${dialog.message()}`);
    }
    await dialog.accept().catch(() => {});
  };

  page.on("dialog", handler);
  return () => page.removeListener("dialog", handler);
}
