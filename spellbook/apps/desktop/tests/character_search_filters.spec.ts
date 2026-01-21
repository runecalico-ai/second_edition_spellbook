import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateRunId } from "./fixtures/test-utils";

test.skip(
	process.platform !== "win32",
	"Tauri CDP tests require WebView2 on Windows.",
);

test.describe("Character Search Filters (KNOWN vs PREPARED)", () => {
	test("should filter correctly when adding spells to KNOWN list", async ({
		appContext,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();

		const spells = [
			{
				name: `Quest_Spell_${runId}`,
				level: "8",
				sphere: "All",
				description: "Q",
				isQuest: true,
			},
			{
				name: `Cantrip_Spell_${runId}`,
				level: "0",
				school: "Alteration",
				description: "C",
				isCantrip: true,
			},
			{
				name: `High_Level_${runId}`,
				level: "9",
				school: "Necromancy",
				description: "H",
				tags: "Chaos",
			},
			{
				name: `Sphere_Spell_${runId}`,
				level: "2",
				sphere: "Healing",
				description: "S",
			},
		];

		await test.step("Setup: Create diverse spells", async () => {
			for (const s of spells) {
				await app.createSpell(s);
			}
		});

		await test.step("Setup: Create character and add Mage class", async () => {
			const charName = `Searcher_${runId}`;
			await app.createCharacter(charName);
			await app.openCharacterEditor(charName);
			await app.addClass("Mage");
		});

		await test.step("KNOWN List: Test search and global filters", async () => {
			await app.openSpellPicker("Mage", "KNOWN");
			const picker = page.getByTestId("spell-picker");

			// Test Quest filter
			await app.setSpellPickerFilters({ questOnly: true });
			await expect(picker.getByText(`Quest_Spell_${runId}`)).toBeVisible();
			await expect(
				picker.getByText(`Cantrip_Spell_${runId}`),
			).not.toBeVisible();

			// Reset quest and test Level Range
			await app.setSpellPickerFilters({
				questOnly: false,
				minLevel: "9",
				maxLevel: "9",
			});
			await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
			await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();

			// Reset level and test Tag filter
			await app.setSpellPickerFilters({
				minLevel: "",
				maxLevel: "",
				tags: "Chaos",
			});
			await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
			await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();

			// Add spells via bulk add
			await app.bulkAddSpells(spells.map((s) => s.name));
		});

		await test.step("PREPARED List: Test local filters", async () => {
			await app.openSpellPicker("Mage", "PREPARED");
			const picker = page.getByTestId("spell-picker");

			// Test Cantrip filter locally
			await app.setSpellPickerFilters({ cantripsOnly: true });
			await expect(picker.getByText(`Cantrip_Spell_${runId}`)).toBeVisible();
			await expect(picker.getByText(`High_Level_${runId}`)).not.toBeVisible();

			// Test Sphere filter locally
			await app.setSpellPickerFilters({
				cantripsOnly: false,
				sphere: "Healing",
			});
			await expect(picker.getByText(`Sphere_Spell_${runId}`)).toBeVisible();
			await expect(
				picker.getByText(`Cantrip_Spell_${runId}`),
			).not.toBeVisible();
		});
	});

	test("should reset all filters when spell picker dialog is reopened", async ({
		appContext,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);
		const runId = generateRunId();

		const testSpell = `FilterTest_${runId}`;

		await test.step("Setup: Create spell and character", async () => {
			await app.createSpell({
				name: testSpell,
				level: "5",
				school: "Evocation",
				description: "Test",
				tags: "Fire",
			});

			const charName = `FilterReset_${runId}`;
			await app.createCharacter(charName);
			await app.openCharacterEditor(charName);
			await app.addClass("Mage");
		});

		await test.step("Apply filters and close picker", async () => {
			await app.openSpellPicker("Mage", "KNOWN");
			await app.setSpellPickerFilters({
				questOnly: true,
				minLevel: "5",
				maxLevel: "9",
				tags: "Fire",
				school: "Necromancy",
			});

			await page.getByRole("button", { name: "CANCEL" }).click();
			await expect(page.getByTestId("spell-picker")).not.toBeVisible();
		});

		await test.step("Reopen picker and verify filters are reset", async () => {
			await app.openSpellPicker("Mage", "KNOWN");
			const picker = page.getByTestId("spell-picker");

			await expect(
				picker.locator("label").filter({ hasText: "Quest" }).locator("input"),
			).not.toBeChecked();
			await expect(
				picker.locator("label").filter({ hasText: "Cantrip" }).locator("input"),
			).not.toBeChecked();
			await expect(
				picker.getByPlaceholder("Search spells by name..."),
			).toHaveValue("");
			await expect(picker.getByPlaceholder("Min")).toHaveValue("");
			await expect(picker.getByPlaceholder("Max")).toHaveValue("");
			await expect(picker.getByPlaceholder("TAGS...")).toHaveValue("");

			const schoolSelect = picker.locator("select").first();
			await expect(schoolSelect).toHaveValue("");
		});
	});
});
