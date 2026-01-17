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

  // Create Character
  await app.createCharacter(charName);
  await app.selectCharacter(charName);

  // 2. Advanced Picker Filtering
  await page.getByRole("button", { name: "Add Spells" }).click();

  // Filter by School: Evocation
  const schoolSelect = page.locator("select").first();
  await schoolSelect.selectOption("Evocation");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(app.getSpellRow(spell1)).toBeVisible();
  await expect(app.getSpellRow(spell2)).not.toBeVisible();

  // Filter by Level: 3
  await schoolSelect.selectOption([]);
  const levelMin = page.locator("select").nth(1);
  await levelMin.selectOption("3");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(app.getSpellRow(spell2)).toBeVisible();
  await expect(app.getSpellRow(spell1)).not.toBeVisible();

  // Add Spell B to spellbook
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Close" }).click();

  // 3. Printing Spellbook
  const pageSizeSelect = page.locator("select").first();
  await pageSizeSelect.selectOption("a4");

  await page.getByRole("button", { name: "Print Compact" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });

  await page.getByRole("button", { name: "Print Stat-block" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });

  // 4. Printing Single Spell
  await page.getByRole("link", { name: "Spellbook Builder" }).click();
  await app.navigate("Library");
  await page.getByText(spell1).click();

  const editorPageSize = page.locator("select").first();
  await editorPageSize.selectOption("letter");
  await page.getByRole("button", { name: "Print Stat-block" }).click();
  await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: TIMEOUTS.medium });
});
