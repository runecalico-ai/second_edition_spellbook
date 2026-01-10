import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAURI_BIN = path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop.exe");

/**
 * Page Object Model / Helper class for the Spellbook application.
 * Encapsulates common UI interactions to keep test scripts clean.
 */
class SpellbookApp {
  constructor(public page: Page) {}

  async navigate(name: string) {
    await this.page.getByRole("link", { name, exact: true }).click();
  }

  async createSpell(name: string, level: string, description: string) {
    await this.navigate("Add Spell");
    await this.page.getByPlaceholder("Spell Name").fill(name);
    await this.page.getByPlaceholder("Level").fill(level);
    await this.page.locator("textarea").fill(description);
    await this.page.getByRole("button", { name: "Save Spell" }).click();
    await this.navigate("Library");
  }

  async importFile(filePath: string, allowOverwrite = false) {
    await this.navigate("Import");

    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible();

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

  await test.step("Milestone 0: Backup UI", async () => {
    const backupBtn = page.getByRole("button", { name: "Backup" });
    const restoreBtn = page.getByRole("button", { name: "Restore" });
    await expect(backupBtn).toBeVisible();
    await expect(restoreBtn).toBeVisible();
  });

  await test.step("Setup: Create Spell", async () => {
    await app.createSpell("POM Test Fireball", "3", "Cleanly created via helper.");
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
