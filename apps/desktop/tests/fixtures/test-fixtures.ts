/**
 * Playwright fixtures for Tauri E2E tests.
 * Provides automatic lifecycle management for app context and file tracking.
 */
import { test as base } from "@playwright/test";
import type { FileTracker, TauriAppContext } from "./tauri-fixture";
import {
  captureDebugScreenshot,
  cleanupTauriApp,
  createFileTracker,
  launchTauriApp,
} from "./tauri-fixture";

/**
 * Extended test fixtures for Tauri E2E tests.
 * Provides automatic setup and teardown of:
 * - appContext: Tauri app instance with browser, page, and process
 * - fileTracker: Automatic cleanup of temporary test files
 */
/**
 * Options for customizing Tauri app launch behavior.
 * Use test.use({ tauriOptions: { ... } }) to override defaults.
 */
type TauriFixtureOptions = {
  /** Timeout for app readiness. Defaults to TIMEOUTS.long * 2 */
  timeout?: number;
  /** Pipe stdout/stderr for debugging. Defaults to true */
  debug?: boolean;
};

type TauriTestFixtures = {
  /** Tauri app context with browser, page, and process handles */
  appContext: TauriAppContext;
  /** File tracker for automatic cleanup of temporary files */
  fileTracker: FileTracker;
  /** Options for customizing Tauri app launch behavior */
  tauriOptions: TauriFixtureOptions;
};

/**
 * Extended Playwright test with Tauri fixtures.
 * Use this instead of the base Playwright test to get automatic app lifecycle management.
 *
 * @example
 * ```typescript
 * import { test, expect } from "./fixtures/test-fixtures";
 * import { SpellbookApp } from "./page-objects/SpellbookApp";
 *
 * test("my test", async ({ appContext, fileTracker }) => {
 *   const { page } = appContext;
 *   const app = new SpellbookApp(page);
 *
 *   // Use the app...
 *   await app.navigate("Library");
 *
 *   // Track temporary files
 *   const tempFile = fileTracker.track("./tmp/test.md");
 * });
 * ```
 */
export const test = base.extend<TauriTestFixtures>({
  // Default options for Tauri app launch
  tauriOptions: [{}, { option: true }],

  appContext: async ({ tauriOptions }, use, testInfo) => {
    // Launch the app once per worker with custom options
    const ctx = await launchTauriApp({
      workerIndex: testInfo.workerIndex,
      timeout: tauriOptions.timeout,
      debug: tauriOptions.debug,
    });

    // Provide the context to the test
    await use(ctx);

    // Auto-capture screenshot on test failure (CDP traces don't capture screenshots)
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        const screenshot = await ctx.page.screenshot({ fullPage: true });
        await testInfo.attach("failure-screenshot", {
          body: screenshot,
          contentType: "image/png",
        });
      } catch (error) {
        console.warn("Failed to capture failure screenshot:", error);
      }
    }

    // Cleanup after the test
    await cleanupTauriApp(ctx);
  },

  // biome-ignore lint/correctness/noEmptyPattern:
  fileTracker: async ({}, use) => {
    // Create file tracker
    const tracker = createFileTracker();

    // Provide to the test
    await use(tracker);

    // Cleanup tracked files
    tracker.cleanup();
  },
});

/**
 * Re-export expect from Playwright for convenience.
 * This allows tests to import both test and expect from the same file.
 */
export { expect } from "@playwright/test";

/**
 * Re-export screenshot helper for manual screenshot capture.
 * Use this for visual debugging since CDP traces don't capture screenshots automatically.
 */
export { captureDebugScreenshot };
