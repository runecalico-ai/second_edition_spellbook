import fs from "node:fs";
import path from "node:path";
import { TIMEOUTS } from "./fixtures/constants";
import type { FileTracker } from "./fixtures/tauri-fixture";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId, getTestDirname } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __dirname = getTestDirname(import.meta.url);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Batch Import Performance Tests", () => {
  test("imports 50 markdown files successfully", async ({ appContext, fileTracker }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const testDir = path.join(__dirname, `tmp/batch_test_${runId}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const files = await generateTestSpells(testDir, 50, fileTracker);

    await test.step("Perform batch import", async () => {
      const startTime = Date.now();

      await app.importFile(files);

      const elapsed = Date.now() - startTime;
      console.log(`Batch import of ${files.length} files completed in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(TIMEOUTS.batch);

      const resultText = await page.getByText(/Imported spells: \d+/).textContent();
      const match = resultText?.match(/Imported spells: (\d+)/);
      const importedCount = match ? Number.parseInt(match[1]) : 0;

      expect(importedCount).toBe(50);
    });
  });

  test("handles mixed format files gracefully", async ({ appContext, fileTracker }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const testDir = path.join(__dirname, `tmp/mixed_test_${runId}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const mdFile = fileTracker.track(path.join(testDir, "valid_spell.md"));
    fs.writeFileSync(
      mdFile,
      "---\nname: Valid Markdown Spell\nlevel: 3\n---\nThis is a valid spell description.\n",
    );

    const txtFile = fileTracker.track(path.join(testDir, "unsupported.txt"));
    fs.writeFileSync(txtFile, "This should be rejected");

    await test.step("Import mixed files", async () => {
      await app.importFile([mdFile, txtFile]);

      // Check for success indicator for valid file
      await expect(
        page.getByText(/Import completed successfully|Imported spells: 1/),
      ).toBeVisible();
    });
  });
});

async function generateTestSpells(
  dir: string,
  count: number,
  fileTracker: FileTracker,
): Promise<string[]> {
  const files: string[] = [];

  for (let i = 0; i < count; i++) {
    const fileName = `spell_${i}.md`;
    const filePath = fileTracker.track(path.join(dir, fileName));
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
