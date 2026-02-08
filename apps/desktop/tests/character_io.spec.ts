import * as fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";

test.describe("Character Import/Export", () => {
  test.beforeEach(async ({ appContext }) => {
    appContext.page.on("console", (msg) => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
    // signal frontend to use legacy download instead of native dialogs
    await appContext.page.addInitScript(() => {
      window.__IS_PLAYWRIGHT__ = true;
    });
    await appContext.page.evaluate(() => {
      window.__IS_PLAYWRIGHT__ = true;
    });
  });

  test("should export and import a character bundle (Round Trip)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `IO_Char_${runId}`;

    // 1. Create Character
    await app.createCharacter(charName);

    // 2. Export Character
    console.log(`Starting export for ${charName}...`);
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });

    const itemSelector = `[data-testid="character-item-${charName.toLowerCase()}"]`;
    const item = page.locator(itemSelector);

    // Ensure item is visible before interacting
    await expect(item).toBeVisible();
    await item.hover();

    const exportBtn = item.locator('[data-testid="btn-export-character"]');
    // Force click because the hover transition might be flaky in headless
    console.log("Clicking main export icon...");
    await exportBtn.click({ force: true });

    // Modal appears, click JSON
    console.log("Waiting for format modal...");
    await expect(page.getByTestId("btn-export-json")).toBeVisible({ timeout: 5000 });
    console.log("Clicking btn-export-json...");
    await page.getByTestId("btn-export-json").click();

    console.log("Waiting for download event...");
    const download = await downloadPromise;
    const downloadPath = await download.path();
    console.log(`Downloaded to: ${downloadPath}`);

    // Verify content basic structure
    const content = fs.readFileSync(downloadPath, "utf-8");
    const bundle = JSON.parse(content);
    expect(bundle.name).toBe(charName);
    expect(bundle.formatVersion).toBe("1.0.0");

    // Handle success modal
    console.log("Handling success modal...");
    await handleCustomModal(page, "OK");

    // 3. Delete Character
    console.log("Deleting character for restore test...");
    await app.deleteCharacterFromList(charName);
    await expect(page.locator(itemSelector)).not.toBeVisible();

    // 4. Import Character
    console.log("Importing character...");
    await page.getByTestId("btn-open-import-wizard").click();

    const fileInput = page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles(downloadPath);

    // Wait for preview
    await expect(page.getByTestId("preview-char-name")).toHaveText(charName);

    // Confirm Import
    await page.getByTestId("btn-confirm-import").click();

    // Handle success modal
    await handleCustomModal(page, "OK");

    // 5. Verify Character Restored
    await expect(page.locator(itemSelector)).toBeVisible();
  });

  test("should handle collision by creating copy (Overwrite=False)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Col_Char_${runId}`;

    await app.createCharacter(charName);

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    const itemSelector = `[data-testid="character-item-${charName.toLowerCase()}"]`;
    const item = page.locator(itemSelector);
    await expect(item).toBeVisible();
    await item.hover();
    await item.locator('[data-testid="btn-export-character"]').click({ force: true });

    await page.getByTestId("btn-export-json").click();

    const download = await downloadPromise;
    const downloadPath = await download.path();
    await handleCustomModal(page, "OK");

    await page.getByTestId("btn-open-import-wizard").click();
    await page.locator('[data-testid="import-file-input"]').setInputFiles(downloadPath);

    await expect(page.getByText("Exists")).toBeVisible();
    const overwriteChk = page.getByTestId("overwrite-checkbox");
    await expect(overwriteChk).not.toBeChecked();

    await page.getByTestId("btn-confirm-import").click();
    await handleCustomModal(page, "OK");

    const importedName = `${charName} (Imported)`;
    await expect(page.getByText(importedName)).toBeVisible();

    await app.deleteCharacterFromList(charName);
    await app.deleteCharacterFromList(importedName);
  });

  test("should handle collision by overwriting (Overwrite=True)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Over_Char_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);
    await app.updateIdentity({ race: "Human", alignment: "True Neutral" });
    await app.navigate("Characters");

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    const itemSelector = `[data-testid="character-item-${charName.toLowerCase()}"]`;
    const item = page.locator(itemSelector);
    await expect(item).toBeVisible();
    await item.hover();
    await item.locator('[data-testid="btn-export-character"]').click({ force: true });
    await page.getByTestId("btn-export-json").click();

    const download = await downloadPromise;
    const downloadPath = await download.path();
    await handleCustomModal(page, "OK");

    await app.openCharacterEditor(charName);
    await app.updateIdentity({ race: "Elf", alignment: "Chaotic Evil" });
    await app.navigate("Characters");

    await page.getByTestId("btn-open-import-wizard").click();
    await page.locator('[data-testid="import-file-input"]').setInputFiles(downloadPath);
    await page.getByTestId("overwrite-checkbox").check();

    await page.getByTestId("btn-confirm-import").click();
    await handleCustomModal(page, "OK");

    await app.openCharacterEditor(charName);
    await expect(page.locator("#char-race")).toHaveValue("Human");
    await expect(page.locator("#char-alignment")).toHaveValue("True Neutral");

    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });

  test("should export character as Markdown ZIP and re-import (Round Trip)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Md_Trip_${runId}`;

    await app.createCharacter(charName);

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    const itemSelector = `[data-testid="character-item-${charName.toLowerCase()}"]`;
    const item = page.locator(itemSelector);
    await expect(item).toBeVisible();
    await item.hover();
    await item.locator('[data-testid="btn-export-character"]').click({ force: true });

    await page.getByTestId("btn-export-markdown").click();
    const download = await downloadPromise;
    const downloadPath = path.join(path.dirname(await download.path()), `export_${runId}.zip`);
    await download.saveAs(downloadPath);
    await handleCustomModal(page, "OK");

    await app.deleteCharacterFromList(charName);
    await expect(page.locator(itemSelector)).not.toBeVisible();

    await page.getByTestId("btn-open-import-wizard").click();
    const fileInput = page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles(downloadPath);

    await expect(page.getByTestId("preview-char-name")).toHaveText(charName);

    await page.getByTestId("btn-confirm-import").click();
    await handleCustomModal(page, "OK");

    await expect(page.locator(itemSelector)).toBeVisible();
    await app.deleteCharacterFromList(charName);
  });

  test("should export character as Markdown ZIP", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Md_Char_${runId}`;

    await app.createCharacter(charName);

    const itemSelector = `[data-testid="character-item-${charName.toLowerCase()}"]`;
    const item = page.locator(itemSelector);
    await expect(item).toBeVisible();
    await item.hover();
    await item.locator('[data-testid="btn-export-character"]').click({ force: true });

    await expect(page.getByText("Export Character")).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.getByTestId("btn-export-markdown").click();

    const download = await downloadPromise;
    const downloadPath = path.join(path.dirname(await download.path()), `export_${runId}.zip`);
    await download.saveAs(downloadPath);
    const filename = download.suggestedFilename();

    expect(filename.toLowerCase()).toContain(".zip");
    expect(filename.toLowerCase()).toContain("md_char_");

    await handleCustomModal(page, "OK");
    await app.deleteCharacterFromList(charName);
  });

  test("should print character sheet and spellbook pack (PDF)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Print_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);
    await app.addClass("Mage");
    await app.addClass("Cleric");

    // Print Character Sheet
    console.log("Testing Character Sheet Print...");
    await page.getByTestId("btn-print-sheet").click();
    await expect(page.getByText("Character sheet saved to:")).toBeVisible({ timeout: 20000 });
    await handleCustomModal(page, "OK");

    // Print Spellbook Pack (Mage)
    console.log("Testing Spellbook Pack Print (Mage)...");
    const mageSection = page.locator('[aria-label="Class section for Mage"]');
    await mageSection.getByTestId("btn-print-pack").click();
    await expect(page.getByText("Spellbook pack saved to:")).toBeVisible({ timeout: 20000 });
    await handleCustomModal(page, "OK");

    await app.deleteCurrentCharacter();
    await handleCustomModal(page, "Confirm");
  });
});
