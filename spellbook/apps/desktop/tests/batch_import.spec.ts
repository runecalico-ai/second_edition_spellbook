import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateTestSpells } from "./utils/test-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Batch Import Performance Tests", () => {
  let appContext: TauriAppContext | null = null;

  test.beforeAll(async () => {
    appContext = await launchTauriApp({ cdpPort: 9223 });
  });

  test.afterAll(() => {
    cleanupTauriApp(appContext);
  });

  test("imports 50 markdown files successfully", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const testDir = path.join(__dirname, "batch_test_spells");
    const files = await generateTestSpells(testDir, 50);

    try {
      await app.navigate("Import");
      await expect(page).toHaveURL(/\/import/);

      const startTime = Date.now();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(files);

      await expect(page.getByText("spell_0000.md")).toBeVisible();

      await page.getByRole("button", { name: "Preview →" }).click();
      await expect(page.getByText(/Parsed \d+ spell/)).toBeVisible();
      await page.getByRole("button", { name: "Skip Review →" }).click();
      await expect(page.getByText(/Ready to import/)).toBeVisible();

      await page.getByRole("button", { name: "Start Import" }).click();

      await expect(page.getByText(/Imported spells: \d+/)).toBeVisible({ timeout: TIMEOUTS.batch });

      const elapsed = Date.now() - startTime;
      console.log(`Batch import of 50 files completed in ${elapsed}ms`);

      expect(elapsed).toBeLessThan(TIMEOUTS.batch);

      const resultText = await page.getByText(/Imported spells: \d+/).textContent();
      const match = resultText?.match(/Imported spells: (\d+)/);
      const importedCount = match ? Number.parseInt(match[1]) : 0;

      expect(importedCount).toBeGreaterThan(0);
      console.log(`Successfully imported ${importedCount} spells`);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("handles mixed format files gracefully", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const testDir = path.join(__dirname, "mixed_format_test");
    fs.mkdirSync(testDir, { recursive: true });

    try {
      const mdFile = path.join(testDir, "valid_spell.md");
      fs.writeFileSync(
        mdFile,
        "---\nname: Valid Markdown Spell\nlevel: 3\n---\nThis is a valid spell description.\n",
      );

      const txtFile = path.join(testDir, "unsupported.txt");
      fs.writeFileSync(txtFile, "This should be rejected");

      await app.navigate("Import");

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([mdFile, txtFile]);

      await page.getByRole("button", { name: "Preview →" }).click();
      await expect(page.getByText(/Parsed \d+ spell/)).toBeVisible();
      await page.getByRole("button", { name: "Skip Review →" }).click();
      await expect(page.getByText(/Ready to import/)).toBeVisible();

      await page.getByRole("button", { name: "Start Import" }).click();

      await expect(
        page.getByText(/Imported spells: 1/).or(page.getByText(/Conflicts\/Errors/)),
      ).toBeVisible({ timeout: TIMEOUTS.long });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
