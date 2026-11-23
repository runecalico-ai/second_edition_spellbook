/**
 * E2E tests for multi-spell SpellScribe JSON and Markdown spell-list imports.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_LISTS_DIR = path.resolve(TESTS_DIR, "../src-tauri/tests/fixtures/source-lists");
const NETHERIL_JSON = path.join(SOURCE_LISTS_DIR, "Nethril - Empire of Magic - Wizard.json");
const NETHERIL_MD = path.join(SOURCE_LISTS_DIR, "Nethril - Empire of Magic - Wizard.md");

test.describe("Multi-Spell Source List Import (JSON & Markdown)", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test("imports 9-spell Netheril JSON with High-Level notice and library components, then resolves Proctiv conflict on Markdown re-import", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Preview 9-spell Netheril SpellScribe JSON list", async () => {
      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles(NETHERIL_JSON);
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByTestId("canonical-preview-summary")).toContainText(
        "Found 9 spell(s) in JSON",
        { timeout: TIMEOUTS.medium },
      );
      await expect(page.getByTestId("high-level-magic-notice")).toBeVisible();
      await expect(page.getByTestId("canonical-preview-spells")).toContainText("Karsus's Avatar");
      await expect(page.getByTestId("canonical-preview-spells")).toContainText("Field: Mentalism");
    });

    await test.step("Complete JSON import and verify visible components in Library", async () => {
      await page.getByTestId("btn-import-json").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({ timeout: TIMEOUTS.long });
      await expect(page.getByText("Import Complete")).toBeVisible();
      await expect(page.getByText("Imported: 9 spell(s)")).toBeVisible();

      await app.navigate("Library");
      await app.waitForLibrary();
      const karsusRow = page.getByTestId("spell-row-karsus's-avatar");
      await expect(karsusRow).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(karsusRow).toContainText("V, S, M");
    });

    await test.step("Re-import Netheril Markdown and resolve Proctiv conflict while 8 siblings deduplicate", async () => {
      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles(NETHERIL_MD);
      await expect(page.getByTestId("btn-preview-import")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByText("2. Markdown Preview")).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(page.getByTestId("canonical-preview-summary")).toContainText(
        "Found 9 spell(s) in Markdown",
      );

      await page.getByTestId("btn-import-json").click();
      await expect(page.getByTestId("conflict-progress")).toBeVisible({ timeout: TIMEOUTS.long });
      await expect(page.getByText("Proctiv's Breach Crystal Sphere").first()).toBeVisible();

      await page.getByTestId("btn-keep-existing-json").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({ timeout: TIMEOUTS.long });
      await expect(page.getByText(/Duplicates skipped:\s*8/)).toBeVisible();
      await expect(page.getByText(/Conflicts resolved:\s*1\s+kept/)).toBeVisible();
    });
  });

  test("imports fresh 9-spell Netheril Markdown spell list into Library with visible components", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Preview and import Netheril Markdown spell list", async () => {
      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles(NETHERIL_MD);
      await expect(page.getByTestId("btn-preview-import")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByTestId("canonical-preview-summary")).toContainText(
        "Found 9 spell(s) in Markdown",
        { timeout: TIMEOUTS.medium },
      );
      await expect(page.getByTestId("high-level-magic-notice")).toBeVisible();

      await page.getByTestId("btn-import-json").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({ timeout: TIMEOUTS.long });
      await expect(page.getByText("Imported: 9 spell(s)")).toBeVisible();
    });

    await test.step("Verify Library shows imported spell and component string", async () => {
      await app.navigate("Library");
      await app.waitForLibrary();
      const karsusRow = page.getByTestId("spell-row-karsus's-avatar");
      await expect(karsusRow).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(karsusRow).toContainText("V, S, M");
    });
  });

  test("rejects mixing Markdown spell lists with single-spell front-matter notes", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const singleNotePath = fileTracker.track(path.join(testTmpDir, "single-note.md"));
    fs.writeFileSync(
      singleNotePath,
      "---\nname: Single Note\ntradition: ARCANE\nlevel: 1\n---\n\nSingle spell body.\n",
      "utf-8",
    );

    await app.resetImportWizard();
    await page.getByTestId("import-file-input").setInputFiles([NETHERIL_MD, singleNotePath]);

    await expect(page.getByTestId("file-type-error")).toContainText(
      "Cannot mix Markdown spell lists with single-spell notes",
      { timeout: TIMEOUTS.medium },
    );
    await expect(page.getByTestId("btn-preview-import")).not.toBeVisible();
  });
});
