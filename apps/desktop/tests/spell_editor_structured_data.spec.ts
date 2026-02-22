import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";

test.describe("Spell Editor structured data and hash display", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test("SpellDetail hash display: show hash, Copy, Expand when spell has content_hash", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Hash Test Spell ${runId}`;

    await test.step("Create and save a spell", async () => {
      await app.createSpell({
        name: spellName,
        level: "1",
        description: "Description for hash test.",
        school: "Evocation",
        classes: "Wizard",
      });
    });

    await test.step("Reopen spell and verify hash display", async () => {
      await app.openSpell(spellName);
      await page.waitForTimeout(500);

      await expect(page.getByTestId("spell-detail-hash-display")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("spell-detail-hash-copy")).toBeVisible();
      await expect(page.getByTestId("spell-detail-hash-expand")).toBeVisible();
    });

    await test.step("Expand shows full hash", async () => {
      await page.getByTestId("spell-detail-hash-expand").click();
      await page.waitForTimeout(200);
      const display = page.getByTestId("spell-detail-hash-display");
      await expect(display).not.toContainText("...");
    });
  });

  test("Tradition validation: Epic (level 10) requires School", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell, set level 10, leave School empty", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Epic No School");
      await page.getByTestId("spell-level-input").fill("10");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
    });

    await test.step("Save is blocked and inline error shown", async () => {
      await page.getByTestId("btn-save-spell").click();
      await expect(page.getByTestId("error-school-required-arcane")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "OK");
      await page.waitForTimeout(300);
    });
  });

  test("Tradition validation: Quest requires Sphere", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell, set level 8 and Quest, leave Sphere empty", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Quest No Sphere");
      await page.getByTestId("spell-level-input").fill("8");
      await page.getByTestId("chk-quest").check();
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Cleric");
    });

    await test.step("Save is blocked and inline error shown", async () => {
      await page.getByTestId("btn-save-spell").click();
      await expect(page.getByTestId("error-sphere-required-divine")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "OK");
      await page.waitForTimeout(300);
    });
  });

  test("StructuredFieldInput: range emits structured value and text preview", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell and set range", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Range Test Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
    });

    await test.step("Expand Range then select Distance kind and enter value", async () => {
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(500);
      await page.getByTestId("range-kind-select").selectOption("distance");
      await page.waitForTimeout(100);
      await page.getByTestId("range-base-value").fill("30");
      await page.getByTestId("range-unit").selectOption("ft");
      await page.waitForTimeout(100);
    });

    await test.step("Verify text preview", async () => {
      const preview = page.getByTestId("range-text-preview");
      await expect(preview).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(preview).toContainText("30");
      await expect(preview).toContainText("ft");
    });
  });

  test("StructuredFieldInput: duration text preview auto-computes", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Duration Test Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
    });

    await test.step("Expand Duration then select Time kind and enter value", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await page.waitForTimeout(500);
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(100);
      await page.getByTestId("duration-base-value").fill("1");
      await page.getByTestId("duration-unit").selectOption("round");
      await page.waitForTimeout(100);
    });

    await test.step("Verify duration text preview", async () => {
      const preview = page.getByTestId("duration-text-preview");
      await expect(preview).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(preview).toContainText("round");
    });
  });

  test("ComponentCheckboxes: V/S/M state and text preview", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Component Test Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
    });

    await test.step("Expand Components then check Verbal and Somatic", async () => {
      await page.getByTestId("detail-components-expand").click();
      await page.waitForTimeout(500);
      await page.getByTestId("component-checkbox-verbal").check();
      await page.getByTestId("component-checkbox-somatic").check();
      await page.waitForTimeout(100);
    });

    await test.step("Verify text preview shows V, S", async () => {
      const preview = page.getByTestId("component-text-preview");
      await expect(preview).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(preview).toContainText("V, S");
    });

    await test.step("Check Material and verify sub-form appears", async () => {
      await page.getByTestId("component-checkbox-material").check();
      await page.waitForTimeout(100);
      await expect(page.getByTestId("material-component-add")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });
  });

  test("ComponentCheckboxes: add material, name required, quantity validation", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell, expand Components, enable Material", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Material Test Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("detail-components-expand").click();
      await page.waitForTimeout(500);
      await page.getByTestId("component-checkbox-material").check();
      await page.waitForTimeout(100);
    });

    await test.step("Add first material and set name", async () => {
      await page.getByTestId("material-component-add").click();
      await page.waitForTimeout(100);
      const nameInput = page.getByTestId("material-component-name").first();
      await nameInput.fill("Bat guano");
      await expect(nameInput).toHaveValue("Bat guano");
    });

    await test.step("Set quantity and verify min 1", async () => {
      const qtyInput = page.getByTestId("material-component-quantity").first();
      await qtyInput.fill("0.5");
      await qtyInput.blur();
      await page.waitForTimeout(100);
      // Validation clamps to >= 1; quantity 1 is displayed as 1.0 (hashing consistency)
      await expect(qtyInput).toHaveValue("1.0");
    });

    await test.step("Add second material component", async () => {
      await page.getByTestId("material-component-add").click();
      await page.waitForTimeout(100);
      const materialRows = page.getByTestId("material-component-row");
      await expect(materialRows).toHaveCount(2);
      const secondNameInput = page.getByTestId("material-component-name").nth(1);
      await secondNameInput.fill("Sulfur");
      await expect(secondNameInput).toHaveValue("Sulfur");
    });

    await test.step("Remove first material component", async () => {
      const removeButton = page.getByTestId("material-component-remove").first();
      await removeButton.click();
      await page.waitForTimeout(100);
      const materialRows = page.getByTestId("material-component-row");
      await expect(materialRows).toHaveCount(1);
      // Verify remaining material is the second one (Sulfur)
      const remainingName = page.getByTestId("material-component-name").first();
      await expect(remainingName).toHaveValue("Sulfur");
    });
  });

  test("Tradition dropdown shows only Arcane and Divine", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell and interact with tradition dropdown", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      const traditionSelect = page.getByTestId("spell-tradition-select");

      const optionValues = await traditionSelect
        .locator("option")
        .evaluateAll((opts) => Array.from(opts).map((o) => (o as HTMLOptionElement).value));

      expect(optionValues).toContain("ARCANE");
      expect(optionValues).toContain("DIVINE");
      expect(optionValues).not.toContain("BOTH");
    });
  });

  test("Tradition validation: new spell save shows school error, no BOTH errors", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell, default ARCANE, try save", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Arcane Missing School");
      await page.getByTestId("spell-level-input").fill("1");
      await page
        .getByTestId("spell-description-textarea")
        .fill("Valid description so it doesn't fail on this.");
    });

    await test.step("Save blocked by school required error, NOT tradition error", async () => {
      await page.getByTestId("btn-save-spell").click();

      await expect(page.getByTestId("error-school-required-arcane-tradition")).toBeVisible({
        timeout: TIMEOUTS.short,
      });

      await expect(page.getByTestId("error-tradition-conflict")).not.toBeVisible();

      await handleCustomModal(page, "OK");
      await page.waitForTimeout(300);
    });
  });

  // Option A (remove-both-tradition): Import rejects spells with both school and sphere.
  // The "open conflicted spell → banner → dismiss" UI is only reachable for pre-existing/legacy
  // DB records (e.g. before this change); we do not seed such records in E2E.
  test("Import rejects spell with both school and sphere; spell does not appear in library", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Both Tradition Conflict ${runId}`;

    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `both_spell_${runId}.md`);
    const mdContent = [
      "---",
      `name: "${spellName}"`,
      "level: 1",
      "tradition: ARCANE",
      "school: Evocation",
      "sphere: Combat",
      'description: "A synthetic conflict test spell."',
      "class_list: [Wizard]",
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(tmpFile, mdContent, "utf-8");

    try {
      await test.step("Run import wizard; backend rejects co-present school and sphere", async () => {
        await app.resetImportWizard();
        await app.navigate("Import");
        const fileInput = page.locator(SELECTORS.fileInput);
        await expect(fileInput).toBeVisible({ timeout: TIMEOUTS.medium });
        await fileInput.setInputFiles(tmpFile);
        await expect(page.getByText(path.basename(tmpFile))).toBeVisible();
        await page.getByRole("button", { name: "Preview →" }).click();
        await expect(page.getByText(/Parsed \d+ spell\(s\)/)).toBeVisible({
          timeout: TIMEOUTS.medium,
        });
        await page.getByRole("button", { name: "Skip Review →" }).click();
        await page.getByRole("button", { name: "Start Import" }).click();

        const modal = page.getByRole("dialog");
        await expect(modal).toBeVisible({ timeout: TIMEOUTS.medium });
        await expect(
          modal.getByText(/mutually exclusive|School and sphere|Import failed/i),
        ).toBeVisible();
        await handleCustomModal(page, "OK");
        await page.waitForTimeout(300);
      });

      await test.step("Spell does not appear in library", async () => {
        await app.navigate("Library");
        await page.getByPlaceholder(/Search spells/i).fill(spellName);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect(app.getSpellRow(spellName)).not.toBeVisible({ timeout: TIMEOUTS.short });
      });
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
  });
});
