import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;

test.beforeAll(async () => {
  appContext = await launchTauriApp({ timeout: TIMEOUTS.medium });
});

test.afterAll(async () => {
  await cleanupTauriApp(appContext);
});

test("Milestone 2.5: Advanced Picker & Printing", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);

  const runId = Date.now();
  const charName = `M2.5 Char ${runId}`;
  const spell1 = `M2.5 Spell A ${runId}`;
  const spell2 = `M2.5 Spell B ${runId}`;
  const spell3 = `M2.5 Spell C ${runId}`;
  const spell4 = `M2.5 Spell D ${runId}`;

  // 1. Setup: Create test spells and character
  // Add Spell A (Evocation, Level 2)
  await app.createSpell({
    name: spell1,
    level: "2",
    school: "Evocation",
    description: "Description A",
  });

  // Add Spell B (Abjuration, Level 3)
  await app.createSpell({
    name: spell2,
    level: "3",
    school: "Abjuration",
    description: "Description B",
  });

  // Add Spell C (All, Quest Spell)
  await app.createSpell({
    name: spell3,
    level: "3",
    sphere: "All",
    description: "Description C",
    isQuest: true,
  });

  // Add Spell D (Evocation, Cantrip)
  await app.createSpell({
    name: spell4,
    level: "0",
    school: "Evocation",
    description: "Description D",
    isCantrip: true,
  });

  // Create Character
  await app.createCharacter(charName);

  // Add Mage Class
  await app.openCharacterEditor(charName);
  await app.addClass("Mage");
  await app.addClass("Cleric");

  // Select Mage Class and Add Spells to known list
  // TODO:

  // Filter Cantrips
  // TODO:

  // Add Cantrip (Spell D) to known list for Mage
  // TODO:

  // Filter by School: Evocation
  // TODO:

  // Filter by Level: 3 (clear school filter first)
  // TODO:

  // Add Spell B to KNOWN list for Mage
  // TODO:


  // Select Cleric Class and Add Spells to prepared list
  // TODO:

  // Filter by School: All
  // TODO:

  // Add Spell C to PREPARED list for Cleric
  // TODO:



  // 3. Printing Spellbook
  const pageSizeSelect = page.locator("select").first();
  await pageSizeSelect.selectOption("a4");

  await page.getByRole("button", { name: "Print Compact" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });

  await page.getByRole("button", { name: "Print Stat-block" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });

  // 4. Printing Single Spell
  await app.navigate("Library");
  await page.getByText(spell1).click();

  const editorPageSize = page.locator("select").first();
  await editorPageSize.selectOption("letter");
  await page.getByRole("button", { name: "Print Stat-block" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });
});
