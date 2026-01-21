import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateRunId } from "./fixtures/test-utils";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Character Negative Value Validation", () => {
  test("should prevent negative ability and level values", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    await test.step("Setup: Create character and open editor", async () => {
      const charName = `IntegrityHero_${runId}`;
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
    });

    await test.step("Verify abilities cannot be negative", async () => {
      const strInput = page.getByLabel("STR", { exact: true });
      await expect(strInput).toHaveValue("10", { timeout: TIMEOUTS.medium });

      // Use keyboard to decrement - press down arrow key 11 times
      await strInput.focus();
      for (let i = 0; i < 11; i++) {
        await strInput.press("ArrowDown");
      }

      // Verify it stopped at 0
      await expect(strInput).toHaveValue("0");

      await page.getByRole("button", { name: "Save Abilities" }).click();
      await page.waitForTimeout(300); // Settlement wait for save operation
    });

    await test.step("Verify level cannot be negative", async () => {
      await app.addClass("Druid");

      // Find the level input using the test ID
      const levelInput = page.getByTestId("class-level-input");
      await levelInput.waitFor({ state: "visible", timeout: TIMEOUTS.medium });

      // Verify initial value is 1
      await expect(levelInput).toHaveValue("1");

      // Try to set it to -1 directly
      await levelInput.fill("-1");

      // The input should clamp to 0 (negative values not allowed)
      await expect(levelInput).toHaveValue("0");

      // Try to set it to -5
      await levelInput.fill("-5");

      // Should still be clamped to 0
      await expect(levelInput).toHaveValue("0");
    });
  });
});
