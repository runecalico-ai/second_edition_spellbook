import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { cleanupTauriApp, launchTauriApp, type TauriAppContext } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;

test.beforeEach(async () => {
  appContext = await launchTauriApp({ timeout: TIMEOUTS.medium });
});

test.afterEach(async () => {
  await cleanupTauriApp(appContext);
  appContext = null;
});

test.describe("Character Search Filters (KNOWN vs PREPARED)", () => {
  test("should filter correctly when adding spells to KNOWN list", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const runId = Date.now();
    // Create diverse spells
    const spells = [
      { name: `Quest_Spell_${runId}`, level: "8", sphere: "All", description: "Q", isQuest: true },
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
      { name: `Sphere_Spell_${runId}`, level: "2", sphere: "Healing", description: "S" },
    ];

    for (const s of spells) {
      await app.createSpell(s);
    }

    const charName = `Searcher_${runId}`;
    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);
    await app.addClass("Mage");

    // 1. KNOWN List (Global Search)
    await app.openSpellPicker("Mage", "KNOWN");
    const picker = page.getByTestId("spell-picker");

    // Test Quest filter
    await picker.locator("label").filter({ hasText: "Quest" }).locator("input").check();
    await expect(picker.getByText(`Quest_Spell_${runId}`)).toBeVisible();
    await expect(picker.getByText(`Cantrip_Spell_${runId}`)).not.toBeVisible();
    await picker.locator("label").filter({ hasText: "Quest" }).locator("input").uncheck();

    // Test Level Range (9-9)
    await picker.getByPlaceholder("Min").fill("9");
    await picker.getByPlaceholder("Max").fill("9");
    await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
    await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();
    await picker.getByPlaceholder("Min").clear();
    await picker.getByPlaceholder("Max").clear();

    // Test Tags filter
    await picker.getByPlaceholder("TAGS...").fill("Chaos");
    await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
    await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();
    await picker.getByPlaceholder("TAGS...").clear();

    // Add them all to KNOWN for next step using checkboxes and BULK ADD
    for (const s of spells) {
      await picker.getByPlaceholder("Search spells by name...").fill(s.name);
      const row = picker.getByTestId(`spell-row-${s.name}`);
      await expect(row).toBeVisible();
      await row.locator('input[type="checkbox"]').check();
      await picker.getByPlaceholder("Search spells by name...").clear();
    }
    await picker.getByRole("button", { name: "BULK ADD", exact: true }).click();

    // 2. PREPARED List (Local Filter)
    await app.openSpellPicker("Mage", "PREPARED");

    // Test Cantrip filter locally
    await picker.locator("label").filter({ hasText: "Cantrip" }).locator("input").check();
    await expect(picker.getByText(`Cantrip_Spell_${runId}`)).toBeVisible();
    await expect(picker.getByText(`High_Level_${runId}`)).not.toBeVisible();
    await picker.locator("label").filter({ hasText: "Cantrip" }).locator("input").uncheck();

    // Test Sphere filter locally
    await picker.locator("select").nth(1).selectOption("Healing");
    await expect(picker.getByText(`Sphere_Spell_${runId}`)).toBeVisible();
    await expect(picker.getByText(`Cantrip_Spell_${runId}`)).not.toBeVisible();
  });

  test("should reset all filters when spell picker dialog is reopened", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const runId = Date.now();
    const testSpell = `FilterTest_${runId}`;

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

    // 1. Open spell picker and apply various filters
    await app.openSpellPicker("Mage", "KNOWN");
    const picker = page.getByTestId("spell-picker");

    await picker.locator("label").filter({ hasText: "Quest" }).locator("input").check();
    await picker.getByPlaceholder("Min").fill("5");
    await picker.getByPlaceholder("Max").fill("9");
    await picker.getByPlaceholder("TAGS...").fill("Fire");
    await picker.locator("select").first().selectOption("Necromancy"); // School filter

    // 2. Close the dialog
    await picker.getByRole("button", { name: "CANCEL" }).click();

    // 3. Reopen the dialog
    await app.openSpellPicker("Mage", "KNOWN");

    // 4. Assert all filters are reset to defaults
    await expect(
      picker.locator("label").filter({ hasText: "Quest" }).locator("input"),
    ).not.toBeChecked();
    await expect(
      picker.locator("label").filter({ hasText: "Cantrip" }).locator("input"),
    ).not.toBeChecked();
    await expect(picker.getByPlaceholder("Search spells by name...")).toHaveValue("");
    await expect(picker.getByPlaceholder("Min")).toHaveValue("");
    await expect(picker.getByPlaceholder("Max")).toHaveValue("");
    await expect(picker.getByPlaceholder("TAGS...")).toHaveValue("");

    // School select should be at default (first option is "All Schools")
    const schoolSelect = picker.locator("select").first();
    await expect(schoolSelect).toHaveValue("");
  });
});
