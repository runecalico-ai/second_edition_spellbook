import fs from "node:fs";
import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import {
	createTmpFilePath,
	generateRunId,
	getTestDirname,
} from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal, setupDialogHandler } from "./utils/dialog-handler";

const __dirname = getTestDirname(import.meta.url);

test.describe("Vault Backup and Restore", () => {
	test("Backup and Restore Flow", async ({ appContext, fileTracker }) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();

		const backupSpellName = `Backup Test Spell ${runId}`;
		const backupPath = createTmpFilePath(__dirname, "backup.zip", fileTracker);

		// Setup dialog handler
		const cleanupDialogs = setupDialogHandler(page, {
			acceptDelete: true,
		});

		try {
			await test.step("Create a spell to backup", async () => {
				await app.createSpell({
					name: backupSpellName,
					level: "5",
					description: "A spell created for backup testing.",
				});
				await expect(page.getByText(backupSpellName)).toBeVisible();
			});

			await test.step("Perform backup via UI", async () => {
				// Mock window.prompt to return the backup path
				await page.evaluate((backupFilePath: string) => {
					window.prompt = () => backupFilePath;
				}, backupPath);

				await page.getByRole("button", { name: "Backup" }).click();

				// Handle custom modal success alert
				await handleCustomModal(page, "OK");

				// Verify backup exists and is accessible
				expect(fs.existsSync(backupPath)).toBe(true);
				const stats = fs.statSync(backupPath);
				expect(stats.size).toBeGreaterThan(0);
			});

			await test.step("Delete the spell", async () => {
				await app.navigate("Library");
				await page.getByText(backupSpellName).click();
				await page.getByRole("button", { name: "Delete" }).click();
				await handleCustomModal(page, "Confirm");
				await app.waitForLibrary();
				await expect(page.getByText(backupSpellName)).not.toBeVisible({
					timeout: TIMEOUTS.short,
				});
			});

			await test.step("Restore from backup via UI", async () => {
				// Mock window.prompt
				await page.evaluate((backupFilePath: string) => {
					window.prompt = () => backupFilePath;
				}, backupPath);

				await page.getByRole("button", { name: "Restore" }).click();

				// Handle custom modal confirmation
				await handleCustomModal(page, "Confirm");

				// Handle custom modal success alert
				await handleCustomModal(page, "OK");

				// Wait for reload
				await page.waitForTimeout(2000);
				await page.waitForURL(/\//);
			});

			await test.step("Verify spell is restored", async () => {
				await app.navigate("Library");
				await expect(page.getByText(backupSpellName)).toBeVisible({
					timeout: TIMEOUTS.medium,
				});
			});
		} finally {
			cleanupDialogs();
			// Backup file cleanup handled by fileTracker in afterAll
		}
	});
});

