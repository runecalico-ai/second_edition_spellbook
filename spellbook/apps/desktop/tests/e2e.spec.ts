import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect, test } from "@playwright/test";

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

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

/**
 * Page Object Model / Helper class for the Spellbook application.
 * Encapsulates common UI interactions to keep test scripts clean.
 */
class SpellbookApp {
  constructor(public page: Page) {}

  async navigate(name: string) {
    await this.page.getByRole("link", { name, exact: true }).click();
  }

  async createSpell(name: string, level: string, description: string, source = "") {
    await this.navigate("Add Spell");
    await this.page.getByPlaceholder("Spell Name").fill(name);
    await this.page.getByPlaceholder("Level").fill(level);
    await this.page.getByLabel("Source").fill(source);
    await this.page.locator("textarea").fill(description);
    await this.page.getByRole("button", { name: "Save Spell" }).click();
    await this.navigate("Library");
  }

  async importFile(filePath: string, allowOverwrite = false) {
    await this.navigate("Import");

    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible();

    await this.page.getByRole("button", { name: "Preview →" }).click();
    await expect(this.page.getByText(/Parsed \d+ spell/)).toBeVisible();
    await this.page.getByRole("button", { name: "Skip Review →" }).click();
    await expect(this.page.getByText(/Ready to import/)).toBeVisible();

    const overwriteCheckbox = this.page.getByLabel("Overwrite existing spells");
    if (allowOverwrite) {
      await overwriteCheckbox.check();
    } else {
      await overwriteCheckbox.uncheck();
    }

    await this.page.getByRole("button", { name: "Start Import" }).click();
  }
}

let appProcess: ChildProcess | null = null;
const cdpPort = 9222;

test.beforeAll(async () => {
  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(
      `Tauri executable not found at ${TAURI_BIN}. Run 'cargo build' in src-tauri first.`,
    );
  }

  // Launch with remote debugging
  appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: "ignore",
    detached: false,
    shell: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));
});

test.afterAll(() => {
  if (appProcess) appProcess.kill();
});

test("Milestone Verification Flow", async () => {
  const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const app = new SpellbookApp(page);
  const runId = Date.now();
  const uniqueSpellName = `POM Known Spell ${runId}`;
  const characterName = `POM Character ${runId}`;

  await test.step("Milestone 0: Backup UI", async () => {
    const backupBtn = page.getByRole("button", { name: "Backup" });
    const restoreBtn = page.getByRole("button", { name: "Restore" });
    await expect(backupBtn).toBeVisible();
    await expect(restoreBtn).toBeVisible();
  });

  await test.step("Setup: Create Spell", async () => {
    await app.createSpell(uniqueSpellName, "3", "Cleanly created via helper.");
  });

  await test.step("Milestone 1: Character Linkage", async () => {
    const charLink = page.getByRole("link", { name: "Characters", exact: true });
    await expect(charLink).toBeVisible();
    await charLink.click();
    console.log("URL after clicking Characters:", page.url());
    await expect(page).toHaveURL(/\/character/);
    await expect(page.getByRole("heading", { name: "Characters" })).toBeVisible();
    await app.navigate("Library");
    await expect(page).toHaveURL(/\/$/);
    const select = page.locator("tbody tr").first().locator("select").first();
    await expect(select).toBeVisible();
  });

  await test.step("Milestone 1b: Known toggles persist", async () => {
    await app.navigate("Characters");
    await expect(page.getByRole("heading", { name: "Characters" })).toBeVisible();

    await page.getByPlaceholder("New Name").fill(characterName);
    await page.getByRole("button", { name: "+" }).click();
    const characterButton = page.getByRole("button", { name: characterName });
    await expect(characterButton).toBeVisible();
    await characterButton.click();

    await app.navigate("Library");
    const spellRow = page.getByRole("row", { name: new RegExp(uniqueSpellName) });
    await expect(spellRow).toBeVisible();
    const addDialog = page.waitForEvent("dialog");
    await spellRow.getByRole("combobox").selectOption({ label: characterName });
    await (await addDialog).accept();

    await app.navigate("Characters");
    await expect(characterButton).toBeVisible();
    await characterButton.click();
    const knownCheckbox = page
      .getByRole("row", { name: new RegExp(uniqueSpellName) })
      .getByRole("checkbox")
      .nth(1);
    await expect(knownCheckbox).toBeVisible();
    await knownCheckbox.setChecked(false);

    await app.navigate("Library");
    await app.navigate("Characters");
    await expect(characterButton).toBeVisible();
    await characterButton.click();
    const knownCheckboxAfter = page
      .getByRole("row", { name: new RegExp(uniqueSpellName) })
      .getByRole("checkbox")
      .nth(1);
    await expect(knownCheckboxAfter).not.toBeChecked();
  });

  await test.step("Milestone 2: Import Wizard & Provenance", async () => {
    const uniqueName = `Import Test Spell ${Date.now()}`;
    const samplePath = path.resolve(__dirname, "sample.md");
    fs.writeFileSync(
      samplePath,
      `---\nname: ${uniqueName}\nlevel: 2\nsource: TestSource\n---\nImported description details.`,
    );

    // Test First Import
    await app.importFile(samplePath, false);
    await expect(page.getByText("Imported spells: 1")).toBeVisible({ timeout: 10000 });

    // Test Skip Duplicate
    await app.importFile(samplePath, false);
    await expect(page.getByText("1 spells skipped")).toBeVisible();

    // Test Overwrite
    await app.importFile(samplePath, true);
    await expect(page.getByText("Imported spells: 1")).toBeVisible();

    // Verify Provenance
    await app.navigate("Library");
    await page.getByText(uniqueName).click();
    await expect(page.getByPlaceholder("Spell Name")).toHaveValue(uniqueName);
    await expect(page.getByText("Provenance (Imports)")).toBeVisible();
    await expect(page.getByText("Type: MD")).toBeVisible();
    await expect(page.getByText(/SHA256: [a-f0-9]{64}/)).toBeVisible();
  });

  await browser.close();
});

test("Import conflict merge review flow", async () => {
  const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const app = new SpellbookApp(page);
  const runId = Date.now();
  const conflictName = `Conflict Spell ${runId}`;
  const conflictSource = `Conflict Source ${runId}`;
  const originalDescription = "Original description";
  const incomingDescription = "Incoming description";

  await test.step("Setup: Create Existing Spell", async () => {
    await app.createSpell(conflictName, "1", originalDescription, conflictSource);
  });

  await test.step("Trigger conflict import and resolve", async () => {
    const samplePath = path.resolve(__dirname, `conflict-${runId}.md`);
    fs.writeFileSync(
      samplePath,
      `---\nname: ${conflictName}\nlevel: 1\nsource: ${conflictSource}\n---\n${incomingDescription}`,
    );

    await app.navigate("Import");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePath);
    await page.getByRole("button", { name: "Preview →" }).click();
    await page.getByRole("button", { name: "Skip Review →" }).click();
    await page.getByRole("button", { name: "Start Import" }).click();

    await expect(page.getByText("Resolve Conflicts")).toBeVisible();
    await page.getByRole("button", { name: "Use Incoming" }).first().click();
    await page.getByRole("button", { name: "Apply Resolutions" }).click();
    await expect(page.getByText("Conflict resolutions")).toBeVisible({ timeout: 10000 });
  });

  await test.step("Verify updated spell", async () => {
    await app.navigate("Library");
    await page.getByText(conflictName).click();
    await expect(page.getByLabel("Description")).toHaveValue(incomingDescription);
  });

  await browser.close();
});
