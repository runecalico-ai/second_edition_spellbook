import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";

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

    await test.step("Attempt Epic Spell for Priest (client inline restriction)", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill("Restricted Epic");
      await page.getByTestId("spell-level-input").fill("10");
      await page.getByTestId("spell-school-input").fill("Evocation");
      await page.getByTestId("spell-classes-input").fill("Priest, Cleric");
      await page
        .getByTestId("spell-description-textarea")
        .fill("This should fail client validation.");
      await page.getByTestId("btn-save-spell").click();

      await expect(page.getByTestId("error-epic-arcane-class-restriction")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.expectNoBlockingDialog();
      await page.getByTestId("btn-cancel-edit").click();
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "Confirm");
      await app.waitForLibrary();
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

      await expect(
        app.getSpellRow(cantripName).getByText("Cantrip", { exact: true }),
      ).toBeVisible();
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
  });
});
