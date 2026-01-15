import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";
import { BASE_CDP_PORT, TIMEOUTS } from "./fixtures/constants";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";
import { setupDismissAllDialogs } from "./utils/dialog-handler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.slow();

test("Epic and Quest Spells E2E (Connected)", async () => {
  const browser = await chromium.connectOverCDP(`http://localhost:${BASE_CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const app = new SpellbookApp(page);

  const cleanupDialog = setupDismissAllDialogs(page);

  const libraryLink = page.getByRole("link", { name: "Library", exact: true });
  if (await libraryLink.isVisible()) {
    await libraryLink.click();
  }

  await page.reload().catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.long }).catch(() => {});

  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });
  await page.screenshot({ path: path.join(screenshotDir, "01_library_home.png") });

  const runId = Date.now();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  // 1. Create a Cantrip
  await app.navigate("Add Spell");
  await app.waitForSpellEditor();
  await page.getByPlaceholder("Spell Name").fill(cantripName);
  await page.locator(SELECTORS.cantripCheckbox).check();
  await page.locator(SELECTORS.description).fill("A simple cantrip.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await app.waitForLibrary();

  // 2. Create an Epic Spell (Arcane only)
  await app.navigate("Add Spell");
  await app.waitForSpellEditor();
  await page.getByPlaceholder("Spell Name").fill(epicName);
  await page.locator("#spell-level").fill("12");
  await page.getByLabel("Classes").fill("Wizard, Mage");
  await page.locator(SELECTORS.description).fill("A powerful 10th circle spell.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await app.waitForLibrary();

  // 3. Attempt Epic Spell for Priest (Should be restricted)
  await app.navigate("Add Spell");
  await app.waitForSpellEditor();
  await page.getByPlaceholder("Spell Name").fill("Restricted Epic");
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator(SELECTORS.description).fill("This should fail.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByText("Epic levels (10-12) are Arcane only.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await app.waitForLibrary();

  // 4. Create a Quest Spell (Divine only)
  await app.navigate("Add Spell");
  await app.waitForSpellEditor();
  await page.getByPlaceholder("Spell Name").fill(questName);
  await page.locator("#spell-level").fill("7");
  await page.locator(SELECTORS.questCheckbox).check();
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator(SELECTORS.description).fill("A holy quest spell.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await app.waitForLibrary();

  // 5. Verify Library Filters and Badges
  await page.screenshot({ path: path.join(screenshotDir, "DEBUG_LIBRARY_BEFORE_FILTERS.png") });

  const cantripRow = app.getRow(cantripName);
  await expect(cantripRow).toBeVisible();
  await expect(cantripRow).toContainText("Cantrip");

  const epicRow = app.getRow(epicName);
  await expect(epicRow).toBeVisible();
  await expect(epicRow).toContainText("Epic");

  const questRow = app.getRow(questName);
  await expect(questRow).toBeVisible();
  await expect(questRow).toContainText("Quest");

  // Filter Quest Spells
  await page.locator('label:has-text("Quest Spells") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getRow(questName)).toBeVisible();
  await expect(app.getRow(cantripName)).not.toBeVisible();
  await page.locator('label:has-text("Quest Spells") input').uncheck();

  // Filter Cantrips
  await page.locator('label:has-text("Cantrips Only") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getRow(cantripName)).toBeVisible();
  await expect(app.getRow(epicName)).not.toBeVisible();

  await page.screenshot({ path: path.join(screenshotDir, "FINAL_V8N.png") });

  cleanupDialog();
  await browser.close();
});
