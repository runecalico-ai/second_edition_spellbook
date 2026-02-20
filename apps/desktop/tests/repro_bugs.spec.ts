import * as path from "node:path";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Spell Editor Bug Reproduction", () => {
  test.use({ tauriOptions: { debug: true } });

  test.beforeEach(async ({ appContext }) => {
    appContext.page.on("console", (msg) => {
      console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
  });

  test("BUG REPRO: Material text within 'Components' line is lost on expand/collapse if dirty", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Material Loss Repro ${runId}`;
    // Legacy style: material description in components line
    const componentsText = "V, S, M (ruby dust worth 100gp)";

    await test.step("Create spell with material in components line", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-tradition-select").selectOption("ARCANE");
      await page.getByTestId("spell-school-input").fill("Alteration");
      await page.getByTestId("spell-description-textarea").fill("Repro.");
      await page.getByTestId("detail-components-input").fill(componentsText);
      await page.getByTestId("btn-save-spell").click();

      // If save fails, log any validation errors visible on screen
      try {
        await app.waitForLibrary();
      } catch (e) {
        const errors = await page.locator('[data-testid^="error-"]').allTextContents();
        if (errors.length > 0) {
          console.error("Validation Errors found:", errors);
        }
        throw e;
      }
    });

    await test.step("Expand Components (parses legacy text)", async () => {
      await app.openSpell(spellName);
      // Wait for the data to be loaded into the form before expanding
      const componentsInput = page.getByTestId("detail-components-input");
      await expect(componentsInput).toHaveValue(componentsText, { timeout: 5000 });
      // Extra wait for React state to settle after DOM update
      await page.waitForTimeout(500);

      console.log("Expanding Components...");
      await app.page.click('[data-testid="detail-components-expand"]');
      await app.page.screenshot({ path: "tests/screenshots/after_expansion_click.png" });
      console.log("Screenshot after expansion click saved.");

      // Verify parsing: V, S, M checked
      await expect(page.getByTestId("component-checkbox-verbal")).toBeChecked();
      await expect(page.getByTestId("component-checkbox-somatic")).toBeChecked();
      const materialCheckbox = page.getByTestId("component-checkbox-material");
      await expect(materialCheckbox).toBeChecked();

      console.log(`MATERIAL CHECKBOX CHECKED: ${await materialCheckbox.isChecked()}`);

      // FIXED: The material text "ruby dust..." IS now extracted into the material list
      // Use toHaveCount(1) to wait for async state update
      try {
        await expect(page.getByTestId("material-component-row")).toHaveCount(1, { timeout: 10000 });
      } catch (e) {
        const debugData = await page.evaluate(() => {
          const win = window as unknown as Record<string, unknown>;
          return {
            ipc: win.__IPC_DEBUG__,
            lastExpand: win.__LAST_EXPAND_CALL,
            form: win.__DEBUG_FORM,
          };
        });
        console.log("WINDOW DEBUG DATA:", JSON.stringify(debugData, null, 2));
        await page.screenshot({ path: "tests/failure_materials.png" });
        throw e;
      }

      const nameInput = page.getByTestId("material-component-name");
      await expect(nameInput).toHaveValue(/ruby dust/);
    });

    await test.step("Trigger dirty state and collapse", async () => {
      // Toggle Focus to mark dirty - this triggers serialization on collapse
      await page.getByTestId("component-checkbox-focus").click();
      await page.getByTestId("detail-components-expand").click(); // Collapse
    });

    await test.step("Verify migration and data preservation", async () => {
      // Expected: "V, S, M, F" in components line
      // Expected: "ruby dust" in material components line
      const componentsValue = await page.getByTestId("detail-components-input").inputValue();
      console.log("Collapsed Components Text:", componentsValue);
      expect(componentsValue).not.toContain("ruby dust");
      expect(componentsValue).toContain("V, S, M, F");

      const materialsValue = await page
        .getByTestId("detail-material-components-input")
        .inputValue();
      console.log("Collapsed Material Components Text:", materialsValue);
      expect(materialsValue).toContain("ruby dust");
    });
  });

  test("BUG REPRO: Async Parse Race Condition", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Race Condition Repro ${runId}`;

    await app.navigate("Add Spell");
    await page.getByTestId("spell-name-input").fill(spellName);
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-tradition-select").selectOption("ARCANE");
    await page.getByTestId("spell-school-input").fill("Alteration");
    await page.getByTestId("spell-description-textarea").fill("Repro test.");

    // Initial value
    await page.getByTestId("detail-range-input").fill("10 yd");

    // Race Test:
    // 1. Expand (starts async parse for "10 yd")
    // 2. IMMEDIATELY update text input to "20 yd"
    // 3. Wait for async to settle
    // 4. Verify that structured form does NOT revert to "10"

    await page.getByTestId("detail-range-expand").click();
    await page.getByTestId("detail-range-input").fill("20 yd");

    // Wait reasonably for any async to settle
    await page.waitForTimeout(500);

    // If bug is fixed, structured state should be cleared by typing "20 yd" and NOT overwritten by "10 yd" async result.
    // The structured input for Distance should be mapped to range-base-value (for fixed mode).
    const distanceInput = page.getByTestId("range-base-value");
    // With the fix, typing "20 yd" should have invalidated the "10 yd" parse.
    // And since structuredRange was set to null in handleChange, the input should show default (0).
    await expect(distanceInput).not.toHaveValue("10", { timeout: 2000 });
  });
});
