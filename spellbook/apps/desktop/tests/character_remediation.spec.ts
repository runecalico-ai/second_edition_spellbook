import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";
import { generateRunId } from "./fixtures/test-utils";

test.skip(
	process.platform !== "win32",
	"Tauri CDP tests require WebView2 on Windows.",
);

test.describe("Character Profile Remediation", () => {
	test("should handle 'Other' class with custom label", async ({
		appContext,
		fileTracker,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();

		await test.step("Create character and add 'Other' class", async () => {
			const charName = `OtherHero_${runId}`;
			await app.createCharacter(charName);
			await app.openCharacterEditor(charName);

			await app.addClass("Other", "Psionicist");
		});

		await test.step("Verify custom class label in UI", async () => {
			const classRow = page.locator('[data-testid="class-row"]');
			await expect(classRow).toContainText("Psionicist");
			await expect(classRow).toContainText("Custom Class");
		});
	});

	test("should enforce 'Prepared MUST be Known' in Spell Picker", async ({
		appContext,
		fileTracker,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();

		await test.step("Setup: Create spell and character", async () => {
			const testSpell = `LogicSpell_${runId}`;
			await app.createSpell({
				name: testSpell,
				level: "1",
				description: "L",
			});

			const charName = `LogicHero_${runId}`;
			await app.createCharacter(charName);
			await app.openCharacterEditor(charName);
			await app.addClass("Ranger");
		});

		await test.step("Try to open PREPARED picker without known spells", async () => {
			// The UI prevents opening the picker if no spells are known for that class
			await app.openSpellPicker("Ranger", "PREPARED");

			// Wait for the alert modal
			await handleCustomModal(page, "OK");
			await page.waitForTimeout(300); // Settlement wait for modal close

			// Verify picker did NOT open
			const picker = page.getByTestId("spell-picker");
			await expect(picker).not.toBeVisible();
		});
	});

	test("should delete character from profile header", async ({
		appContext,
		fileTracker,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();
		const charName = `HeaderDeleteHero_${runId}`;

		await test.step("Setup: Create character and open editor", async () => {
			await app.createCharacter(charName);
			await app.openCharacterEditor(charName);
		});

		await test.step("Delete character via header button", async () => {
			await app.deleteCurrentCharacter();
			await handleCustomModal(page, "Confirm");
			await page.waitForTimeout(300); // Settlement wait for navigation

			// Verify navigation and character removal
			await app.verifyCharacterNotExists(charName);
		});
	});
});
