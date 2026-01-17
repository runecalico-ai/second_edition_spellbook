import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";
import { setupDialogHandler } from "./utils/dialog-handler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;

test.beforeAll(async () => {
  appContext = await launchTauriApp({ timeout: TIMEOUTS.long });
});

test.afterAll(async () => {
  await cleanupTauriApp(appContext);
});

test.slow();

test("Epic and Quest Spells E2E", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);

  const cleanupDialog = setupDialogHandler(page, {
    acceptDelete: true,
    dismissValidation: true,
  });

  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("link", { name: "Library" })
    .waitFor({ state: "visible", timeout: TIMEOUTS.long });
  await page.screenshot({ path: path.join(screenshotDir, "01_initial_load.png") });

  const runId = Date.now();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  // 1. Create a Cantrip
  await app.createSpell({ name: cantripName, isCantrip: true, description: "A simple cantrip." });
  await page.screenshot({ path: path.join(screenshotDir, "03_library_after_cantrip.png") });

  // 2. Create an Epic Spell (Arcane only)
  await app.navigate("Add Spell");
  await page.getByPlaceholder("Spell Name").fill(epicName);
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Wizard, Mage");
  await page.locator(SELECTORS.description).fill("A powerful 10th circle spell.");
  await page.screenshot({ path: path.join(screenshotDir, "04_epic_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  await app.waitForLibrary();

  // 3. Attempt Epic Spell for Priest (Should be restricted)
  await app.navigate("Add Spell");
  await page.getByPlaceholder("Spell Name").fill("Restricted Epic");
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator(SELECTORS.description).fill("This should fail.");
  await page.screenshot({ path: path.join(screenshotDir, "05_restricted_epic_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page).toHaveURL(/\/edit\/new/);
  await page.getByRole("link", { name: "Cancel" }).click();

  // 4. Create a Quest Spell (Divine only)
  await app.createSpell({
    name: questName,
    level: "7",
    isQuest: true,
    classes: "Priest, Cleric",
    description: "A holy quest spell.",
  });

  // 5. Verify Library Filters and Badges
  await app.navigate("Library");

  await expect(app.getSpellRow(cantripName).locator("text=Cantrip")).toBeVisible();
  await expect(app.getSpellRow(epicName).locator("text=Epic")).toBeVisible();
  await expect(app.getSpellRow(questName).locator("text=Quest")).toBeVisible();

  // Filter Quest Spells
  await page.locator('label:has-text("Quest Spells") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getSpellRow(questName)).toBeVisible();
  await expect(app.getSpellRow(cantripName)).not.toBeVisible();
  await page.locator('label:has-text("Quest Spells") input').uncheck();

  // Filter Cantrips
  await page.locator('label:has-text("Cantrips Only") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getSpellRow(cantripName)).toBeVisible();
  await expect(app.getSpellRow(epicName)).not.toBeVisible();

  cleanupDialog();
});
