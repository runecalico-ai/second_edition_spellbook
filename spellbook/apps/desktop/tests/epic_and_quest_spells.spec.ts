import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal, setupDialogHandler } from "./utils/dialog-handler";

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

  const runId = Date.now();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  // 1. Create a Cantrip
  await app.createSpell({ name: cantripName, isCantrip: true, description: "A simple cantrip." });

  // 2. Create an Epic Spell (Arcane only)
  await app.navigate("Add Spell");
  await page.getByLabel("Name", { exact: true }).fill(epicName);
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Wizard, Mage");
  await page.locator(SELECTORS.description).fill("A powerful 10th circle spell.");
  await page.locator("#btn-save-spell").click();
  await app.waitForLibrary();

  // 3. Attempt Epic Spell for Priest (Should be restricted)
  await app.navigate("Add Spell");
  await page.getByLabel("Name", { exact: true }).fill("Restricted Epic");
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator(SELECTORS.description).fill("This should fail.");
  await page.locator("#btn-save-spell").click();

  // Custom Modal handling for validation error
  await handleCustomModal(page, "OK");

  await page.locator('button:has-text("Cancel")').click();

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

  await expect(app.getSpellRow(cantripName).getByText("Cantrip", { exact: true })).toBeVisible();
  await expect(app.getSpellRow(epicName).getByText("Epic", { exact: true })).toBeVisible();
  await expect(app.getSpellRow(questName).getByText("Quest", { exact: true })).toBeVisible();

  // Filter Quest Spells
  const questCheckbox = page.locator('label:has-text("Quest Spells") input');
  await questCheckbox.check();
  // Automatic search should trigger. Wait for the list to update.
  await expect(app.getSpellRow(questName)).toBeVisible();
  await expect(app.getSpellRow(cantripName)).toBeHidden({ timeout: TIMEOUTS.medium });

  await questCheckbox.uncheck();
  await expect(app.getSpellRow(cantripName)).toBeVisible();

  // Filter Cantrips
  const cantripCheckbox = page.locator('label:has-text("Cantrips Only") input');
  await cantripCheckbox.check();
  await expect(app.getSpellRow(cantripName)).toBeVisible();
  await expect(app.getSpellRow(epicName)).toBeHidden({ timeout: TIMEOUTS.medium });

  cleanupDialog();
});
