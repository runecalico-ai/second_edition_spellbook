import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type Page, chromium, expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAURI_BIN = (() => {
  if (process.platform === "win32") {
    return path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop.exe");
  }
  if (process.platform === "darwin") {
    return path.resolve(
      __dirname,
      "../src-tauri/target/debug/spellbook-desktop.app/Contents/MacOS/spellbook-desktop",
    );
  }
  return path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop");
})();

let appProcess: ChildProcess | null = null;
const cdpPort = 9222;

const screenshotDir = path.resolve(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

test.beforeAll(async () => {
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/IM", "spellbook-desktop.exe"], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(`Tauri executable not found at ${TAURI_BIN}.`);
  }
  appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: "ignore",
    detached: false,
    shell: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 10000));
});

test.afterAll(() => {
  if (appProcess) appProcess.kill();
});

test.slow();

test("Epic and Quest Spells E2E", async () => {
  console.log("Connecting to browser...");
  const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  page.on("console", (msg) => console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));

  page.on("dialog", async (dialog) => {
    console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
    if (
      dialog.message().includes("fix validation errors") ||
      dialog.message().includes("restricted")
    ) {
      await dialog.dismiss();
    } else if (dialog.message().includes("Delete")) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  console.log("Waiting for app to be ready...");
  await page.waitForLoadState("domcontentloaded");
  const links = await page.getByRole("link").allTextContents();
  console.log(`Available links: ${links.join(", ")}`);
  await page.getByRole("link", { name: "Library" }).waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, "01_initial_load.png") });

  const runId = Date.now();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  // 1. Create a Cantrip
  console.log("Creating a Cantrip...");
  await page.getByRole("link", { name: "Add Spell" }).click();
  await page.getByPlaceholder("Spell Name").fill(cantripName);
  await page.locator('label:has-text("Cantrip") input').check();
  await page.locator("textarea#spell-description").fill("A simple cantrip.");
  await page.screenshot({ path: path.join(screenshotDir, "02_cantrip_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: path.join(screenshotDir, "03_library_after_cantrip.png") });

  // 2. Create an Epic Spell (Arcane only)
  console.log("Creating an Epic Spell (Wizard)...");
  await page.getByRole("link", { name: "Add Spell" }).click();
  await page.getByPlaceholder("Spell Name").fill(epicName);
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Wizard, Mage");
  await page.locator("textarea#spell-description").fill("A powerful 10th circle spell.");
  await page.screenshot({ path: path.join(screenshotDir, "04_epic_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 3. Attempt Epic Spell for Priest (Should be restricted)
  console.log("Attempting Restricted Epic Spell (Priest)...");
  await page.getByRole("link", { name: "Add Spell" }).click();
  await page.getByPlaceholder("Spell Name").fill("Restricted Epic");
  await page.locator("#spell-level").fill("10");
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator("textarea#spell-description").fill("This should fail.");
  await page.screenshot({ path: path.join(screenshotDir, "05_restricted_epic_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  // Expect to stay on the page due to validation failure
  await expect(page).toHaveURL(/\/edit\/new/);
  await page.getByRole("link", { name: "Cancel" }).click();

  // 4. Create a Quest Spell (Divine only)
  console.log("Creating a Quest Spell (Priest)...");
  await page.getByRole("link", { name: "Add Spell" }).click();
  await page.getByPlaceholder("Spell Name").fill(questName);
  await page.locator("#spell-level").fill("7");
  await page.locator('label:has-text("Quest Spell") input').check();
  await page.getByLabel("Classes").fill("Priest, Cleric");
  await page.locator("textarea#spell-description").fill("A holy quest spell.");
  await page.screenshot({ path: path.join(screenshotDir, "06_quest_filled.png") });
  await page.getByRole("button", { name: "Save Spell" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 15000 });

  // 5. Verify Library Filters and Badges
  console.log("Verifying Library badges and filters...");
  await page.getByRole("link", { name: "Library" }).click();

  await expect(page.getByRole("row", { name: cantripName }).locator("text=Cantrip")).toBeVisible();
  await expect(page.getByRole("row", { name: epicName }).locator("text=Epic")).toBeVisible();
  await expect(page.getByRole("row", { name: questName }).locator("text=Quest")).toBeVisible();

  // Filter Quest Spells
  console.log("Filtering Quest spells...");
  await page.locator('label:has-text("Quest Spells") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row", { name: questName })).toBeVisible();
  await expect(page.getByRole("row", { name: cantripName })).not.toBeVisible();
  await page.locator('label:has-text("Quest Spells") input').uncheck();

  // Filter Cantrips
  console.log("Filtering Cantrips...");
  await page.locator('label:has-text("Cantrips Only") input').check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row", { name: cantripName })).toBeVisible();
  await expect(page.getByRole("row", { name: epicName })).not.toBeVisible();
  await page.locator('label:has-text("Cantrips Only") input').uncheck();

  console.log("Tests completed successfully!");
  await browser.close();
});
