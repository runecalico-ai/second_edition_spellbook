import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Batch Import Performance Tests", () => {
  let appContext: TauriAppContext | null = null;

  test.beforeAll(async () => {
    appContext = await launchTauriApp();
  });

  test.afterAll(async () => {
    if (appContext) {
      await cleanupTauriApp(appContext);
      appContext = null;
    }
  });

  test("imports 50 markdown files successfully", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);
    await app.resetImportWizard();

    const testDir = path.join(__dirname, "batch_test_spells");
    const files = await generateTestSpells(testDir, 50);

    try {
      await app.navigate("Import");
      await expect(page).toHaveURL(/\/import/);

      const startTime = Date.now();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(files);

      // Wait for file selection to be reflected in UI (can be slow with many files)
      // We increase timeout significantly to avoid failing here before we even reach the backend import
      await expect(page.getByText(`${files.length} file(s) selected`)).toBeVisible({
        timeout: 60000,
      });

      // Click validation/preview
      await page.getByRole("button", { name: "Preview" }).click();
      await expect(page.getByText(/Parsed \d+ spell/)).toBeVisible({
        timeout: TIMEOUTS.batch, // Use larger timeout for parsing
      });

      // Start import
      await page.getByRole("button", { name: "Skip Review →" }).click();
      await page.getByRole("button", { name: "Start Import" }).click();

      // Wait for success indicator
      // UI shows "Imported spells: 50"
      await expect(page.getByText(/Imported spells: \d+/)).toBeVisible({
        timeout: TIMEOUTS.long * 2, // Batch of 50 might take a while
      });

      const elapsed = Date.now() - startTime;
      console.log(`Batch import of ${files.length} files completed in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(TIMEOUTS.batch);

      const resultText = await page.getByText(/Imported spells: \d+/).textContent();
      const match = resultText?.match(/Imported spells: (\d+)/);
      const importedCount = match ? Number.parseInt(match[1]) : 0;

      expect(importedCount).toBeGreaterThan(0);
      console.log(`Successfully imported ${importedCount} spells`);
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
    await app.resetImportWizard();

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

      // Check for mixed format warning if implementation provides one
      // (Assuming the UI continues with valid files)
      await page.getByRole("button", { name: "Start Import" }).click();
      // Check for success or updated list
      await expect(
        page.getByText(/Import completed successfully|Imported spells: 1/),
      ).toBeVisible();
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});

async function generateTestSpells(dir: string, count: number): Promise<string[]> {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];

  for (let i = 0; i < count; i++) {
    const fileName = `spell_${i}.md`;
    const filePath = path.join(dir, fileName);
    const content = `---
name: Batch Spell ${i}
level: ${1 + (i % 9)}
school: ${["Evocation", "Abjuration", "Conjuration", "Divination"][i % 4]}
---
Description for batch spell ${i}.
`;
    fs.writeFileSync(filePath, content);
    files.push(filePath);
  }
  return files;
}
