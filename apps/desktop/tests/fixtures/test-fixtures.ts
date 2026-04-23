/**
 * Playwright fixtures for Tauri E2E tests.
 * Provides automatic lifecycle management for app context and file tracking.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "@playwright/test";
import type { FileTracker, TauriAppContext } from "./tauri-fixture";
import {
  captureDebugScreenshot,
  cleanupTauriApp,
  createFileTracker,
  launchTauriApp,
} from "./tauri-fixture";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));
const TESTS_ROOT_DIR = path.resolve(FIXTURES_DIR, "..");

/**
 * Extended test fixtures for Tauri E2E tests.
 * Provides automatic setup and teardown of:
 * - testTmpDir: Per-test workspace under tests/tmp/e2e (removed after the test)
 * - appContext: Tauri app instance with browser, page, and process
 * - fileTracker: Automatic cleanup of temporary test files
 *
 * Options for customizing Tauri app launch: use `test.use({ tauriOptions: { ... } })`.
 */
type TauriFixtureOptions = {
  /** Timeout for app readiness. Defaults to TIMEOUTS.long * 2 */
  timeout?: number;
  /** Pipe stdout/stderr for debugging. Defaults to true */
  debug?: boolean;
};

type TauriTestFixtures = {
  /**
   * Absolute path to an isolated directory for this test under tests/tmp/e2e.
   * Prefer writing artifacts here; the directory is deleted after the test.
   */
  testTmpDir: string;
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
 * test("my test", async ({ appContext, fileTracker, testTmpDir }) => {
 *   const { page } = appContext;
 *   const app = new SpellbookApp(page);
 *
 *   const tempFile = fileTracker.track(path.join(testTmpDir, "test.md"));
 * });
 * ```
 */
export const test = base.extend<TauriTestFixtures>({
  // Default options for Tauri app launch
  tauriOptions: [{}, { option: true }],

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture has no dependencies
  testTmpDir: async ({}, use, testInfo) => {
    const segment =
      `w${testInfo.workerIndex}-p${testInfo.parallelIndex}-${testInfo.testId}`.replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
    const dir = path.join(TESTS_ROOT_DIR, "tmp", "e2e", segment);
    fs.mkdirSync(dir, { recursive: true });
    await use(dir);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Failed to remove e2e test tmp dir ${dir}:`, e);
    }
  },

  // Depends on fileTracker so teardown order is: appContext → fileTracker → testTmpDir (app releases files before rm).
  appContext: async (
    { tauriOptions, testTmpDir: _testTmpDir, fileTracker: _fileTracker },
    use,
    testInfo,
  ) => {
    void _testTmpDir;
    void _fileTracker;
    const ctx = await launchTauriApp({
      workerIndex: testInfo.workerIndex,
      timeout: tauriOptions.timeout,
      debug: tauriOptions.debug,
    });

    await use(ctx);

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

    await cleanupTauriApp(ctx);
  },

  fileTracker: async ({ testTmpDir: _testTmpDir }, use) => {
    void _testTmpDir;
    const tracker = createFileTracker();
    await use(tracker);
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
