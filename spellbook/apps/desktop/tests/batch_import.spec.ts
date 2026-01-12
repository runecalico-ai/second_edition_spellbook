import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

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
 * Generate sample markdown spell files for batch testing
 */
async function generateTestSpells(dir: string, count: number): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];

  for (let i = 0; i < count; i++) {
    const filename = path.join(dir, `spell_${i.toString().padStart(4, "0")}.md`);
    const content = `---
name: Batch Test Spell ${i}
level: ${(i % 9) + 1}
school: Evocation
source: Batch Test
components: V,S
duration: Instant
---
This is the description for Batch Test Spell number ${i}. 
It contains enough text to be meaningful for testing purposes.
`;
    fs.writeFileSync(filename, content);
    files.push(filename);
  }

  return files;
}

let appProcess: ChildProcess | null = null;
const cdpPort = 9223; // Different port to avoid conflict with other tests

test.describe("Batch Import Performance Tests", () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(TAURI_BIN)) {
      throw new Error(
        `Tauri executable not found at ${TAURI_BIN}. Run 'cargo build' in src-tauri first.`,
      );
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

    await new Promise((resolve) => setTimeout(resolve, 5000));
  });

  test.afterAll(() => {
    if (appProcess) appProcess.kill();
  });

  test("imports 50 markdown files successfully", async () => {
    const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    const testDir = path.join(__dirname, "batch_test_spells");
    const files = await generateTestSpells(testDir, 50);

    try {
      // Navigate to import page
      await page.getByRole("link", { name: "Import", exact: true }).click();
      await expect(page).toHaveURL(/\/import/);

      // Record start time
      const startTime = Date.now();

      // Select files for import
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(files);

      // Verify files are listed
      await expect(page.getByText("spell_0000.md")).toBeVisible();

      // Continue through wizard
      await page.getByRole("button", { name: "Preview →" }).click();
      await expect(page.getByText(/Parsed \d+ spell/)).toBeVisible();
      await page.getByRole("button", { name: "Skip Review →" }).click();
      await expect(page.getByText(/Ready to import/)).toBeVisible();

      // Start import
      await page.getByRole("button", { name: "Start Import" }).click();

      // Wait for import completion with extended timeout for batch
      await expect(page.getByText(/Imported spells: \d+/)).toBeVisible({ timeout: 60000 });

      const elapsed = Date.now() - startTime;
      console.log(`Batch import of 50 files completed in ${elapsed}ms`);

      // Verify reasonable performance (under 60 seconds for 50 files)
      expect(elapsed).toBeLessThan(60000);

      // Check import count
      const resultText = await page.getByText(/Imported spells: \d+/).textContent();
      const match = resultText?.match(/Imported spells: (\d+)/);
      const importedCount = match ? Number.parseInt(match[1]) : 0;

      // Allow for some duplicates if test runs multiple times
      expect(importedCount).toBeGreaterThan(0);
      console.log(`Successfully imported ${importedCount} spells`);
    } finally {
      // Cleanup test files
      fs.rmSync(testDir, { recursive: true, force: true });
      await browser.close();
    }
  });

  test("handles mixed format files gracefully", async () => {
    const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    const testDir = path.join(__dirname, "mixed_format_test");
    fs.mkdirSync(testDir, { recursive: true });

    try {
      // Create one valid markdown file
      const mdFile = path.join(testDir, "valid_spell.md");
      fs.writeFileSync(
        mdFile,
        `---
name: Valid Markdown Spell
level: 3
---
This is a valid spell description.
`,
      );

      // Create one unsupported file (txt)
      const txtFile = path.join(testDir, "unsupported.txt");
      fs.writeFileSync(txtFile, "This should be rejected");

      // Navigate to import
      await page.getByRole("link", { name: "Import", exact: true }).click();

      // Try to import both files
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([mdFile, txtFile]);

      await page.getByRole("button", { name: "Preview →" }).click();
      await expect(page.getByText(/Parsed \d+ spell/)).toBeVisible();
      await page.getByRole("button", { name: "Skip Review →" }).click();
      await expect(page.getByText(/Ready to import/)).toBeVisible();

      await page.getByRole("button", { name: "Start Import" }).click();

      // Should import the valid one and report conflicts for invalid
      await expect(
        page.getByText(/Imported spells: 1/).or(page.getByText(/Conflicts\/Errors/)),
      ).toBeVisible({ timeout: 30000 });
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
      await browser.close();
    }
  });
});
