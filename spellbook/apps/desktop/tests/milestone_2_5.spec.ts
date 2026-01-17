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

  // Wait for modal to be visible
  await expect(page.getByRole("heading", { name: "Add spells" })).toBeVisible();

  // Scope all selectors to the modal to avoid selecting the page size dropdown
  const modal = page.locator('[role="dialog"], .fixed.inset-0').last();

  // Filter by School: Evocation
  const schoolSelect = modal.locator("select[multiple]");
  await schoolSelect.selectOption("Evocation");
  await modal.getByRole("button", { name: "Search" }).click();
  await expect(app.getSpellRow(spell1)).toBeVisible();
  await expect(app.getSpellRow(spell2)).not.toBeVisible();

  // Filter by Level: 3 (clear school filter first)
  await schoolSelect.selectOption([]);
  const levelSelects = modal.locator("select:not([multiple])");
  await levelSelects.first().selectOption("3"); // Min level
  await modal.getByRole("button", { name: "Search" }).click();
  await expect(app.getSpellRow(spell2)).toBeVisible();
  await expect(app.getSpellRow(spell1)).not.toBeVisible();

  // Add Spell B to spellbook
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Close" }).click();

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
