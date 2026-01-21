import { test, expect } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateRunId } from "./fixtures/test-utils";

test.skip(
	process.platform !== "win32",
	"Tauri CDP tests require WebView2 on Windows.",
);

test.describe("Character Profiles Foundation", () => {
	test("should handle character creation, identity, and abilities", async ({
		appContext,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);

		const charName = `Hero_${generateRunId()}`;

		await app.createCharacter(charName);
		await app.openCharacterEditor(charName);

		await app.updateIdentity({
			race: "Half-Elf",
			alignment: "Chaotic Good",
			enableCom: true,
		});

		await expect(page.getByLabel("Race")).toHaveValue("Half-Elf");

		await app.updateAbilities({
			str: 18,
			dex: 17,
			con: 16,
			int: 15,
			wis: 14,
			cha: 13,
			com: 19,
		});

		await expect(page.getByLabel("STR", { exact: true })).toHaveValue("18");
		await expect(page.getByLabel("COM", { exact: true })).toHaveValue("19");
	});

	test("should delete a character including checking cascade", async ({
		appContext,
	}) => {
		const { page } = appContext;
		const app = new SpellbookApp(page);

		const charName = `DeleteMe_${generateRunId()}`;

		// 1. Create Character
		await app.createCharacter(charName);
		await app.openCharacterEditor(charName);

		// 2. Add some data (class, spell) to ensure deep deletion doesn't error
		await app.updateIdentity({ race: "Elf" });
		await app.addClass("Thief");

		// 3. Delete using new helper
		await app.deleteCharacterFromList(charName);
	});
});
