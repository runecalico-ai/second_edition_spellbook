/**
 * Playwright fixtures for Tauri E2E tests.
 * Provides automatic lifecycle management for app context and file tracking.
 */
import { test as base } from "@playwright/test";
import type { TauriAppContext } from "./tauri-fixture";
import {
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
type TauriTestFixtures = {
	/** Tauri app context with browser, page, and process handles */
	appContext: TauriAppContext;
	/** File tracker for automatic cleanup of temporary files */
	fileTracker: ReturnType<typeof createFileTracker>;
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
	appContext: async ({}, use, testInfo) => {
		// Launch the app once per worker
		const ctx = await launchTauriApp({
			workerIndex: testInfo.workerIndex,
		});

		// Provide the context to the test
		await use(ctx);

		// Cleanup after the test
		await cleanupTauriApp(ctx);
	},

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
