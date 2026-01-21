import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import {
	cleanupTauriApp,
	launchTauriApp,
	type TauriAppContext,
} from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";

test.skip(
	process.platform !== "win32",
	"Tauri CDP tests require WebView2 on Windows.",
);

let appContext: TauriAppContext | null = null;

test.beforeEach(async () => {
	appContext = await launchTauriApp({ timeout: TIMEOUTS.medium });
});

test.afterEach(async () => {
	await cleanupTauriApp(appContext);
	appContext = null;
});

test.describe("Character Profile Remediation", () => {
	test("should handle 'Other' class with custom label", async () => {
		if (!appContext) throw new Error("App context not initialized");
		const { page } = appContext;
		const app = new SpellbookApp(page);

		const charName = `OtherHero_${Date.now()}`;
		await app.createCharacter(charName);
		await app.openCharacterEditor(charName);

		await app.addClass("Other", "Psionicist");
		await expect(page.locator('[data-testid="class-row"]')).toContainText(
			"Psionicist",
		);
		await expect(page.locator('[data-testid="class-row"]')).toContainText(
			"Custom Class",
		);
	});

	test("should prevent negative ability and level values", async () => {
		if (!appContext) throw new Error("App context not initialized");
		const { page } = appContext;
		const app = new SpellbookApp(page);

		const charName = `IntegrityHero_${Date.now()}`;
		await app.createCharacter(charName);
		await app.openCharacterEditor(charName);

		// 1. Ability Non-Negative
		const strInput = page.getByLabel("STR", { exact: true });
		await expect(strInput).toHaveValue("10", { timeout: TIMEOUTS.medium });
		await strInput.fill("-5");
		// Frontend should clamp to 0
		await expect(strInput).toHaveValue("0");
		await page.getByRole("button", { name: "Save Abilities" }).click();
		// await page.waitForTimeout(500); // Wait for save

		// 2. Level Non-Negative
		await app.addClass("Druid");
		const section = page.locator('div[aria-label="Class section for Druid"]');
		const levelInput = section.locator('input[type="number"]').first();
		await expect(levelInput).toHaveValue("1", { timeout: TIMEOUTS.medium });
		await levelInput.fill("-1");
		// Negative numbers can't be input, -1 will end up as 01
		await expect(levelInput).toHaveValue("0");
		// Level saves automatically, but wait for reload
		// await page.waitForTimeout(500);
	});

	test("should enforce 'Prepared MUST be Known' in Spell Picker", async () => {
		if (!appContext) throw new Error("App context not initialized");
		const { page } = appContext;
		const app = new SpellbookApp(page);

		const runId = Date.now();
		const testSpell = `LogicSpell_${runId}`;
		await app.createSpell({ name: testSpell, level: "1", description: "L" });

		const charName = `LogicHero_${runId}`;
		await app.createCharacter(charName);
		await app.openCharacterEditor(charName);
		await app.addClass("Ranger");

		// Try to add to PREPARED without KNOWN
		// Note: The UI now prevents the picker from even opening if there are no known spells.
		// So we manually find the ADD button and expect the alert immediately.
		// const classSection = page.locator(
		// 	'div[aria-label="Class section for Ranger"]',
		// );
		// await classSection.getByRole("button", { name: "KNOWN" }).click();
		// await classSection.getByRole("button", { name: "PREPARED" }).click();
		// // await page.waitForTimeout(300);
		// await classSection.getByRole("button", { name: "+ ADD" }).click();
		await app.openSpellPicker("Ranger", "PREPARED");
		// Wait for the modal to appear
		// await expect(page.getByRole("dialog")).toBeVisible();

		await handleCustomModal(page, "OK");

		// Verify picker did NOT open
		const picker = page.getByTestId("spell-picker");
		await expect(picker).not.toBeVisible();
	});

	test("should delete character from profile header", async () => {
		if (!appContext) throw new Error("App context not initialized");
		const { page } = appContext;
		const app = new SpellbookApp(page);

		await app.createCharacter("HeaderDeleteHero");
		await app.openCharacterEditor("HeaderDeleteHero");

		// Click DELETE PROFILE button in header
		await page.getByRole("button", { name: "DELETE PROFILE" }).click();
		await handleCustomModal(page, "Confirm");

		// Should navigate back to list
		await expect(page).toHaveURL(/\/character/);
		await expect(
			page.getByRole("link", { name: /HeaderDeleteHero/ }),
		).not.toBeVisible();
	});
});
