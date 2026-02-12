import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal, setupDialogHandler } from "./utils/dialog-handler";

test.describe("Epic and Quest Spells", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test("Epic and Quest Spells E2E", async ({ appContext }) => {

  const { page } = appContext;
  const app = new SpellbookApp(page);

  await test.step("Setup", async () => {
    await page.waitForLoadState("domcontentloaded");
    await page
      .getByRole("link", { name: "Library" })
      .waitFor({ state: "visible", timeout: TIMEOUTS.long });
  });

  const runId = generateRunId();
  const cantripName = `Cantrip ${runId}`;
  const epicName = `Epic Wizard ${runId}`;
  const questName = `Divine Quest ${runId}`;

  await test.step("Create a Cantrip", async () => {
    await app.createSpell({
      name: cantripName,
      level: "0",
      isCantrip: true,
      description: "A simple cantrip.",
    });
  });

  await test.step("Create an Epic Spell (Arcane only)", async () => {
    await app.createSpell({
      name: epicName,
      level: "10",
      school: "Evocation",
      classes: "Wizard, Mage",
      description: "A powerful 10th circle spell.",
    });
  });

  await test.step("Attempt Epic Spell for Priest (Should be restricted)", async () => {
    await app.navigate("Add Spell");
    await page.getByLabel("Name", { exact: true }).fill("Restricted Epic");
    await page.locator("#spell-level").fill("10");
    await page.getByLabel("Classes").fill("Priest, Cleric");
    await page.locator("#spell-description").fill("This should fail.");
    await page.locator("#btn-save-spell").click();

    // Custom Modal handling for validation error
    await handleCustomModal(page, "OK");
    await page.waitForTimeout(300); // Settlement wait for modal close
    await page.locator('button:has-text("Cancel")').click();
  });

  await test.step("Create a Quest Spell (Divine only)", async () => {
    await app.createSpell({
      name: questName,
      level: "8",
      isQuest: true,
      sphere: "All",
      classes: "Priest, Cleric",
      description: "A holy quest spell.",
    });
  });

  await test.step("Verify Library Filters and Badges", async () => {
    await app.navigate("Library");

    await expect(app.getSpellRow(cantripName).getByText("Cantrip", { exact: true })).toBeVisible();
    await expect(app.getSpellRow(epicName).getByText("Epic", { exact: true })).toBeVisible();
    await expect(app.getSpellRow(questName).getByText("Quest", { exact: true })).toBeVisible();

    // Filter Quest Spells
    await app.setLibraryFilters({ questOnly: true });
    await expect(app.getSpellRow(questName)).toBeVisible();
    await expect(app.getSpellRow(cantripName)).toBeHidden({
      timeout: TIMEOUTS.medium,
    });

    await app.setLibraryFilters({ questOnly: false });
    await expect(app.getSpellRow(cantripName)).toBeVisible();

    // Filter Cantrips
    await app.setLibraryFilters({ cantripsOnly: true });
    await expect(app.getSpellRow(cantripName)).toBeVisible();
    await expect(app.getSpellRow(epicName)).toBeHidden({
      timeout: TIMEOUTS.medium,
    });
  });

  // Cleanup native dialog handler if it was used (not strictly needed here as we didn't trigger any native deletes)
  const cleanupDialog = setupDialogHandler(page, { acceptDelete: true });
  cleanupDialog();
  });
});

