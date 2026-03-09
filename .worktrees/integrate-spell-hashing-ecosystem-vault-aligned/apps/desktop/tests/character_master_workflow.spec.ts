import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Master Workflow", () => {
  test("complete character lifecycle", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    // Inject Playwright flag for exports
    // Inject Playwright flag for exports
    await page.evaluate(() => {
      // @ts-ignore
      window.__IS_PLAYWRIGHT__ = true;
    });

    const runId = Date.now();
    const charName = `Master_Char_${runId}`;
    const spellName = `Master_Spell_${runId}`;

    console.log(`Starting Master Workflow for ${charName}`);

    // 1. Create Character
    await app.createCharacter(charName);

    // 2. Edit Identity
    await app.openCharacterEditor(charName);
    await app.updateIdentity({
      race: "Half-Elf",
      alignment: "Neutral Good",
      enableCom: true,
    });

    // 3. Add Classes
    await app.addClass("Mage");
    await app.getClassLevelInput("Mage").fill("10");
    await app.getClassLevelInput("Mage").blur();
    await page.waitForTimeout(500); // Async save

    await app.addClass("Fighter");
    await app.getClassLevelInput("Fighter").fill("5");
    await app.getClassLevelInput("Fighter").blur();
    await page.waitForTimeout(500); // Async save

    // 4. Create and Add Spell
    await app.createSpell({
      name: spellName,
      level: "3",
      school: "Alteration",
      description: "A test spell for master workflow.",
    });
    // Return to character
    await app.openCharacterEditor(charName);
    await page.waitForTimeout(1000); // Wait for classes to load
    await app.addSpellToClass("Mage", spellName, "KNOWN");
    await app.addSpellToClass("Mage", spellName, "PREPARED");

    // 5. Verify Data Persistence via UI
    await app.navigate("Characters");
    const charItem = page.getByTestId(`character-item-${charName.toLowerCase()}`);
    await expect(charItem).toBeVisible();
    await expect(charItem).toContainText("Mage 10");
    await expect(charItem).toContainText("Fighter 5");

    // 6. Search Functionality
    // Filter by name
    await page.getByTestId("character-search-input").fill(charName);
    await page.waitForTimeout(500); // Debounce
    await expect(page.getByTestId("character-list").getByRole("link")).toHaveCount(1);

    // Filter by wrong class (should hide)
    await page.getByTestId("character-type-filters").getByTitle("Toggle Search Filters").click();
    await page.getByPlaceholder("Class...").fill("Druid");
    await page.waitForTimeout(500);
    await expect(page.getByTestId("no-characters-found")).toBeVisible();

    // Reset filters
    await page.getByPlaceholder("Class...").fill("");
    await page.getByTestId("character-type-filters").getByTitle("Toggle Search Filters").click(); // Close
    await page.getByTestId("character-search-input").fill(charName); // Ensure search is still applied
    await page.waitForTimeout(500);
    await expect(charItem).toBeVisible();

    // 7. Export (Mocked via flag)
    const downloadPromise = page.waitForEvent("download");
    // Click export on the item
    await charItem.hover();
    await charItem.getByTestId("btn-export-character").click();
    await page.getByTestId("btn-export-json").click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(charName.toLowerCase());

    // Close success modal
    await page.getByRole("button", { name: "OK" }).click();
    await page.waitForTimeout(500); // Wait for modal animation

    // 8. Cleanup (Delete)
    await app.deleteCharacterFromList(charName);

    // Verify deletion
    await page.getByTestId("character-search-input").fill(charName);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("no-characters-found")).toBeVisible();

    console.log("Master Workflow Completed Successfully");
  });
});
