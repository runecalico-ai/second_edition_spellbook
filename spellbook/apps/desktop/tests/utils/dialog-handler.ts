/**
 * Dialog handling utilities for E2E tests.
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
 * Sets up a dialog handler on the page with sensible defaults.
 * Returns a cleanup function to remove the handler.
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
      await dialog.dismiss();
      return;
    }

    // Handle delete confirmations
    if (acceptDelete && message.includes("Delete")) {
      await dialog.accept();
      return;
    }

    // Default: dismiss
    await dialog.dismiss();
  };

  page.on("dialog", handler);

  // Return cleanup function
  return () => {
    page.removeListener("dialog", handler);
  };
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
