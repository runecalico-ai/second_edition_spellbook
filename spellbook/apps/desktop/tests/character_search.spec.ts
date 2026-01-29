import { test, expect } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateRunId } from "./fixtures/test-utils";

test.describe("Character Search & Filtering", () => {
  test("should filter characters by name, type, race, class, and level", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    // Create test characters
    const char1 = `Search_Mage_${runId}`;
    await app.createCharacter(char1);
    await app.openCharacterEditor(char1);
    await app.updateIdentity({ race: "Elf" });
    await app.addClass("Mage");
    await app.getClassLevelInput("Mage").fill("5");
    // Need to trigger save or blur? Usually input change works. CharacterEditor saves on change/blur?
    // CharacterEditor saves class level on blur/change? No, logic says "Save Classes" or auto-save?
    // Looking at CharacterEditor.tsx (not shown fully), usually inputs invoke update on change/blur.
    // I'll assume fill triggers change event, maybe blur needs to be explicit or save button?
    // There isn't a "Save Classes" button visible in `CharacterEditor.tsx` snippet.
    // Wait, lines 304 in characters.rs `update_character_class_level`.
    // Let's assume auto-save or I should blur.
    await app.getClassLevelInput("Mage").blur();
    await app.navigate("Characters");

    const char2 = `Search_Cleric_${runId}`;
    await app.createCharacter(char2);
    await app.openCharacterEditor(char2);
    await app.updateIdentity({ race: "Dwarf" });
    await app.addClass("Cleric");
    await app.getClassLevelInput("Cleric").fill("3");
    await app.getClassLevelInput("Cleric").blur();
    await app.navigate("Characters");

    // Test Name Search
    await page.getByTestId("character-search-input").fill("Mage");
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeVisible();
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeHidden();

    await page.getByTestId("character-search-input").fill("");
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeVisible();

    // Test Advanced Filters
    await page.getByTitle("Toggle Search Filters").click();
    const filters = page.getByTestId("character-advanced-filters");
    await expect(filters).toBeVisible();

    // Race Filter
    await filters.getByPlaceholder("Race...").fill("Elf");
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeVisible();
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeHidden();
    await filters.getByPlaceholder("Race...").fill("");

    // Class Filter
    await filters.getByPlaceholder("Class...").fill("Cleric");
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeHidden();
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeVisible();
    await filters.getByPlaceholder("Class...").fill("");

    // Level Filter
    await filters.getByPlaceholder("Min").fill("4");
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeVisible(); // Level 5
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeHidden(); // Level 3

    await filters.getByPlaceholder("Min").fill("");
    await filters.getByPlaceholder("Max").fill("4");
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeHidden(); // Level 5
    await expect(page.getByTestId(`character-item-${char2.toLowerCase()}`)).toBeVisible(); // Level 3

    // Clean up - Clear filters first so we can find the items to delete!
    await filters.getByPlaceholder("Max").fill("");
    await page.getByTestId("character-search-input").fill("");
    // Ensure we see both before trying to delete
    await expect(page.getByTestId(`character-item-${char1.toLowerCase()}`)).toBeVisible();

    await app.deleteCharacterFromList(char1);
    await app.deleteCharacterFromList(char2);
  });

  test("should filter characters by ability score thresholds", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const charSmart = `Smart_${runId}`;
    const charStrong = `Strong_${runId}`;

    await test.step("Setup: Create characters with different stats", async () => {
      // Smart Character (Int 18)
      await app.createCharacter(charSmart);
      await app.openCharacterEditor(charSmart);
      await app.updateAbilities({ int: 18, str: 8 });
      await app.navigate("Characters");

      // Strong Character (Int 8)
      await app.createCharacter(charStrong);
      await app.openCharacterEditor(charStrong);
      await app.updateAbilities({ int: 8, str: 18 });
      await app.navigate("Characters");
    });

    await test.step("Filter: Min Int 15", async () => {
      await page.getByTitle("Toggle Search Filters").click();
      const filters = page.getByTestId("character-advanced-filters");

      await filters.getByTestId("filter-min-int").fill("15");
      // Wait for debounce
      await page.waitForTimeout(500);

      await expect(page.getByTestId(`character-item-${charSmart.toLowerCase()}`)).toBeVisible();
      await expect(page.getByTestId(`character-item-${charStrong.toLowerCase()}`)).toBeHidden();
    });

    await test.step("Cleanup", async () => {
      // Clear filter to find Strong char
      await page.getByTestId("filter-min-int").fill("");
      await page.waitForTimeout(500);

      await app.deleteCharacterFromList(charSmart);
      await app.deleteCharacterFromList(charStrong);
    });
  });

  test("should show loading skeleton when searching with empty list", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    // Start with a search that returns nothing to ensure list is empty
    const input = page.getByTestId("character-search-input");
    await input.fill(`NonExistent_${runId}`);
    await expect(page.getByTestId("no-characters-found")).toBeVisible({ timeout: 10000 });

    // Now search for something else and check for skeleton quickly
    await input.fill("Any");
    // Use a more reliable way to wait for the skeleton
    await page.waitForSelector(".animate-pulse", { state: "visible", timeout: 5000 });

    // Eventually it should show "No characters found" again
    await expect(page.getByTestId("no-characters-found")).toBeVisible({ timeout: 10000 });
  });
});
