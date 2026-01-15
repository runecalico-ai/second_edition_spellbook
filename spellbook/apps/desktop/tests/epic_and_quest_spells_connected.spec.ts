import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

const cdpPort = 9222;

test.slow();

test("Epic and Quest Spells E2E (Connected)", async () => {
  console.log("Connecting to browser...");
  const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  page.on("console", (msg) => console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));

  page.on("dialog", async (dialog) => {
    console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
    await dialog.dismiss();
  });

  console.log("Ensuring app is on Library page...");
  // Check current URL first
  console.log(`Current URL: ${page.url()}`);

  const libraryLink = page.getByRole("link", { name: "Library", exact: true });
  if (await libraryLink.isVisible()) {
    console.log("Found Library link, clicking...");
    await libraryLink.click();
  } else {
    console.log("Library link not visible, checking for Library heading...");
  }

  console.log("Reloading page...");
  await page.reload().catch((e) => console.log(`Reload failed: ${e}`));

  console.log("Waiting for network idle...");
  await page
    .waitForLoadState("networkidle", { timeout: 30000 })
    .catch((e) => console.log(`Wait failed: ${e}`));

  console.log("Waiting for Library heading...");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({ path: path.join(screenshotDir, "01_library_home.png") });

  const runId = Date.now();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  // 1. Create a Cantrip
  console.log("Creating a Cantrip...");
  await page.getByRole("link", { name: "Add Spell", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New Spell", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByPlaceholder("Spell Name").fill(cantripName);
  await page.locator('label:has-text("Cantrip") input').check();
  await page.locator("textarea#spell-description").fill("A simple cantrip.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 2. Create an Epic Spell (Arcane only)
  console.log("Creating an Epic Spell (Wizard)...");
  await page.getByRole("link", { name: "Add Spell", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New Spell", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByPlaceholder("Spell Name").fill(epicName);
  await page.locator("#spell-level").fill("12");
  await page.getByLabel("Classes").fill("Wizard, Mage");
  await page.locator("textarea#spell-description").fill("A powerful 10th circle spell.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 3. Attempt Epic Spell for Priest (Should be restricted)
  console.log("Attempting Restricted Epic Spell (Priest)...");
  await page.getByRole("link", { name: "Add Spell", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New Spell", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByPlaceholder("Spell Name").fill("Restricted Epic");
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator("textarea#spell-description").fill("This should fail.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  // The warning should be visible
  await expect(page.getByText("Epic levels (10-12) are Arcane only.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 4. Create a Quest Spell (Divine only)
  console.log("Creating a Quest Spell (Priest)...");
  await page.getByRole("link", { name: "Add Spell", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New Spell", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByPlaceholder("Spell Name").fill(questName);
  await page.locator("#spell-level").fill("7");
  await page.locator('label:has-text("Quest Spell") input').check();
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator("textarea#spell-description").fill("A holy quest spell.");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 5. Verify Library Filters and Badges
  console.log("Verifying Library badges and filters...");
  await page.screenshot({ path: path.join(screenshotDir, "DEBUG_LIBRARY_BEFORE_FILTERS.png") });

  const cantripRow = page.locator("tr").filter({ hasText: cantripName }).first();
  await expect(cantripRow).toBeVisible();
  await expect(cantripRow).toContainText("Cantrip");

  const epicRow = page.locator("tr").filter({ hasText: epicName }).first();
  await expect(epicRow).toBeVisible();
  await expect(epicRow).toContainText("Epic");

  const questRow = page.locator("tr").filter({ hasText: questName }).first();
  await expect(questRow).toBeVisible();
  await expect(questRow).toContainText("Quest");

  // Filter Quest Spells
  console.log("Filtering Quest spells...");
  await page.locator('label:has-text("Quest Spells") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator("tr").filter({ hasText: questName })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: cantripName })).not.toBeVisible();
  await page.locator('label:has-text("Quest Spells") input').uncheck();

  // Filter Cantrips
  console.log("Filtering Cantrips...");
  await page.locator('label:has-text("Cantrips Only") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator("tr").filter({ hasText: cantripName })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: epicName })).not.toBeVisible();

  console.log("Tests completed successfully!");
  await page.screenshot({ path: path.join(screenshotDir, "FINAL_V8N.png") });
});
