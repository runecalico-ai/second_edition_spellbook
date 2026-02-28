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

  test("Tradition conflict derives from live school/sphere edits", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell and create school+sphere conflict", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Tradition Live Conflict");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-school-input").fill("Evocation");
      await page.getByTestId("spell-sphere-input").fill("Combat");

      await expect(page.getByTestId("error-tradition-conflict")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Clearing sphere removes conflict banner immediately", async () => {
      await page.getByTestId("spell-sphere-input").fill("");
      await expect(page.getByTestId("error-tradition-conflict")).not.toBeVisible();
    });
  });

  test("Tradition conflict blocks save when both school and sphere are set", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell and set both school and sphere", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Tradition Save Block");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-school-input").fill("Evocation");
      await page.getByTestId("spell-sphere-input").fill("Combat");
    });

    await test.step("Save shows conflict validation error", async () => {
      await page.getByTestId("btn-save-spell").click();

      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(modal.getByText(/School and Sphere cannot both be set/i)).toBeVisible({
        timeout: TIMEOUTS.short,
      });

      await handleCustomModal(page, "OK");
      await expect(page.getByTestId("error-tradition-conflict")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });
  });

  test("Whitespace-only sphere is normalized and save succeeds", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Whitespace Sphere ${runId}`;

    await test.step("Open new spell and enter school with whitespace-only sphere", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-school-input").fill("Evocation");
      await page.getByTestId("spell-sphere-input").fill("   ");

      await expect(page.getByTestId("error-tradition-conflict")).not.toBeVisible();
    });

    await test.step("Save succeeds and spell appears in library", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();

      await page.getByPlaceholder(/Search spells/i).fill(spellName);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(app.getSpellRow(spellName)).toBeVisible({ timeout: TIMEOUTS.medium });
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

  test("CastingTime dropdown: 5e unit options absent (action, bonus_action, reaction)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell and expand Casting Time", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("detail-casting-time-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Verify 5e unit options are absent and AD&D 2e units are present", async () => {
      const unitSelect = page.getByTestId("casting-time-unit");
      await expect(unitSelect).toBeVisible({ timeout: TIMEOUTS.short });

      const optionValues = await unitSelect
        .locator("option")
        .evaluateAll((opts) => Array.from(opts).map((o) => (o as HTMLOptionElement).value));

      // 5e combat economy units must NOT be present (schema v2 removed these)
      expect(optionValues).not.toContain("action");
      expect(optionValues).not.toContain("bonus_action");
      expect(optionValues).not.toContain("reaction");

      // AD&D 2e units must be present
      expect(optionValues).toContain("segment");
      expect(optionValues).toContain("round");
      expect(optionValues).toContain("turn");
    });
  });

  test("WarningBanner: visible when field falls back to special (unparseable value)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell and fill basic fields", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Banner Test Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for banner test.");
    });

    await test.step("Fill range with unparseable value", async () => {
      await page.getByTestId("detail-range-input").fill("totally??unparseable_range_text_xyz");
    });

    await test.step("Expand range to trigger parser", async () => {
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Assert warning banner is visible with expected content", async () => {
      const banner = page.getByTestId("spell-editor-special-fallback-banner");
      await expect(banner).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(banner).toContainText("Range");
      await expect(banner).toContainText("could not be fully parsed");
    });
  });

  test("WarningBanner: persists after failed save (validation block)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
    });

    await test.step("Fill range with unparseable value and expand to trigger parser", async () => {
      await page.getByTestId("detail-range-input").fill("totally??unparseable_range_text_xyz");
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Wait for banner to appear", async () => {
      const banner = page.getByTestId("spell-editor-special-fallback-banner");
      await expect(banner).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Attempt save without required name — validation blocks save", async () => {
      await page.getByTestId("btn-save-spell").click();
      await handleCustomModal(page, "OK");
    });

    await test.step("Banner is still visible after dismissed modal", async () => {
      const banner = page.getByTestId("spell-editor-special-fallback-banner");
      await expect(banner).toBeVisible({ timeout: TIMEOUTS.short });
    });
  });

  test("WarningBanner: dismissed after successful save", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Banner Dismissed ${runId}`;

    await test.step("Navigate to Add Spell and fill required fields", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for banner dismiss test.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
    });

    await test.step("Fill range with unparseable value and expand to trigger parser", async () => {
      await page.getByTestId("detail-range-input").fill("totally??unparseable_range_text_xyz");
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Wait for banner to appear", async () => {
      const banner = page.getByTestId("spell-editor-special-fallback-banner");
      await expect(banner).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Collapse range section and save successfully", async () => {
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(200);
      await page.getByTestId("btn-save-spell").click();
    });

    await test.step("App navigates to library after successful save (banner dismissed)", async () => {
      // Note: banner dismissal is verified indirectly — a successful save calls setParserFallbackFields(new Set())
      // and navigates to library. Direct banner visibility after navigate is not testable since
      // the editor is unmounted. If `waitForLibrary()` succeeds, the save path ran fully.
      await app.waitForLibrary();
    });
  });

  test("WarningBanner: nav guard modal shows 'Unparsed fields' title when banner active", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell and make form dirty", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Nav Guard Banner Spell");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for nav guard test.");
    });

    await test.step("Fill range with unparseable value and expand to trigger parser and banner", async () => {
      await page.getByTestId("detail-range-input").fill("totally??unparseable_range_text_xyz");
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
      const banner = page.getByTestId("spell-editor-special-fallback-banner");
      await expect(banner).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Navigate away via Library nav link to trigger nav guard", async () => {
      await page.getByRole("link", { name: "Library" }).click();
    });

    await test.step("Nav guard modal appears with 'Unparsed fields' messaging", async () => {
      const modal = page.getByTestId("modal-container");
      await expect(modal).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(modal).toContainText("Unparsed fields");
    });

    await test.step("Dismiss modal and stay on page", async () => {
      await handleCustomModal(page, "Cancel");
    });
  });

  test("SavingThrowInput: rawLegacyValue annotation rendered when saving throw is parsed from legacy text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Saving Throw Annotation ${runId}`;

    await test.step("Create and save a spell with a saving throw raw value", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for saving throw test.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByTestId("detail-saving-throw-input").fill("Save vs. Spell");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen spell and expand saving throw", async () => {
      await app.openSpell(spellName);
      await page.waitForTimeout(500);
      await page.getByTestId("detail-saving-throw-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Saving throw expanded form is visible", async () => {
      await expect(page.getByTestId("saving-throw-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Raw legacy annotation is visible with saved text", async () => {
      const annotation = page.getByTestId("saving-throw-raw-legacy-annotation");
      await expect(annotation).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(annotation).toContainText("Save vs. Spell");
    });
  });

  test("DamageForm: sourceText annotation rendered when damage text is present", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Damage Annotation Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for damage annotation test.");
    });

    await test.step("Fill damage canon input with text to verify sourceText annotation", async () => {
      await page.getByTestId("detail-damage-input").fill("1d6 fire per level");
      await page.getByTestId("detail-damage-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Damage form is visible", async () => {
      await expect(page.getByTestId("damage-form")).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Source text annotation is visible with original damage text", async () => {
      const annotation = page.getByTestId("damage-source-text-annotation");
      await expect(annotation).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(annotation).toContainText("1d6 fire per level");
    });
  });

  test("MagicResistanceInput: sourceText annotation rendered when loaded from legacy text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Magic Resistance Annotation Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for magic resistance annotation test.");
    });

    await test.step("Fill magic resistance canon input with a non-standard value", async () => {
      await page.getByTestId("detail-magic-resistance-input").fill("Yes (special conditions apply)");
      await page.getByTestId("detail-magic-resistance-expand").click();
      await page.waitForTimeout(300);
    });

    await test.step("Magic resistance input form is visible", async () => {
      await expect(page.getByTestId("magic-resistance-input")).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Source text annotation is visible with original magic resistance text", async () => {
      const annotation = page.getByTestId("magic-resistance-source-text-annotation");
      await expect(annotation).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(annotation).toContainText("Yes (special conditions apply)");
    });
  });

  test("StructuredFieldInput Range: switching from distance kind to 'personal' clears distance fields", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Range Kind Transition Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for range kind transition test.");
    });

    await test.step("Expand range and set kind to distance", async () => {
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("range-kind-select").selectOption("distance");
      await page.waitForTimeout(300);
    });

    await test.step("Distance value field is visible after selecting distance kind", async () => {
      await expect(page.getByTestId("range-base-value")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Switch to 'personal' and verify distance fields are hidden", async () => {
      await page.getByTestId("range-kind-select").selectOption("personal");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("range-base-value")).not.toBeVisible();
      await expect(page.getByTestId("range-raw-legacy")).not.toBeVisible();
    });
  });

  test("StructuredFieldInput Duration: switching from 'time' to 'instant' shows Instant in text preview", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Duration Instant Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for duration instant test.");
    });

    await test.step("Expand duration and set kind to time", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-unit")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Switch to 'instant' and verify time fields hidden", async () => {
      await page.getByTestId("duration-kind-select").selectOption("instant");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-unit")).not.toBeVisible();
      await expect(page.getByTestId("duration-base-value")).not.toBeVisible();
    });

    await test.step("duration-text-preview contains 'Instant'", async () => {
      await expect(page.getByTestId("duration-text-preview")).toContainText("Instant");
    });
  });

  test("StructuredFieldInput Duration: switching from 'instant' to 'time' re-initializes duration unit and value", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Duration Time Reinit Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for duration time reinit test.");
    });

    await test.step("Expand duration and set kind to instant then time", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("duration-kind-select").selectOption("instant");
      await page.waitForTimeout(300);
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(300);
    });

    await test.step("duration-unit and duration-base-value are visible after switching to time", async () => {
      await expect(page.getByTestId("duration-unit")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("duration-base-value")).toBeVisible({ timeout: TIMEOUTS.short });
    });
  });

  test("StructuredFieldInput Duration: switching to 'special' kind shows raw legacy field; switching away hides it", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Duration Special Raw Legacy Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for duration special raw legacy test.");
    });

    await test.step("Expand duration and set to time — raw legacy not visible", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-raw-legacy")).not.toBeVisible();
    });

    await test.step("Switch to special — raw legacy becomes visible", async () => {
      await page.getByTestId("duration-kind-select").selectOption("special");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-raw-legacy")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Switch back to time — raw legacy hidden again", async () => {
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-raw-legacy")).not.toBeVisible();
    });
  });

  test("StructuredFieldInput CastingTime: switching to 'special' unit shows raw legacy field; switching away hides it", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("CastingTime Special Unit Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for casting time special unit test.");
    });

    await test.step("Expand casting time and set unit to round — raw legacy not visible", async () => {
      await page.getByTestId("detail-casting-time-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("casting-time-unit")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("casting-time-unit").selectOption("round");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("casting-time-raw-legacy")).not.toBeVisible();
    });

    await test.step("Switch casting time unit to special — raw legacy becomes visible", async () => {
      await page.getByTestId("casting-time-unit").selectOption("special");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("casting-time-raw-legacy")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Switch casting time unit back to round — raw legacy hidden again", async () => {
      await page.getByTestId("casting-time-unit").selectOption("round");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("casting-time-raw-legacy")).not.toBeVisible();
    });
  });

  test("StructuredFieldInput Range kind=special: text preview reflects rawLegacyValue input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Range Special Text Preview Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for range special text preview test.");
    });

    await test.step("Expand range and set kind to special", async () => {
      await page.getByTestId("detail-range-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("range-kind-select").selectOption("special");
      await page.waitForTimeout(300);
    });

    await test.step("range-raw-legacy is visible and editable (not readOnly) when kind is special", async () => {
      const rawLegacy = page.getByTestId("range-raw-legacy");
      await expect(rawLegacy).toBeVisible({ timeout: TIMEOUTS.short });
      // readOnly={!isSpecial} — must use not.toHaveAttribute("readonly"), not not.toBeDisabled()
      await expect(rawLegacy).not.toHaveAttribute("readonly");
    });

    await test.step("Fill raw legacy value and verify text preview updates", async () => {
      await page.getByTestId("range-raw-legacy").fill("Varies by caster level");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("range-text-preview")).toContainText("Varies by caster level");
    });
  });

  test("SpellEditor: parsers-pending-indicator is hidden after parser resolves", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Parsers Pending Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for parsers pending test.");
    });

    await test.step("Fill range input and expand to trigger parser invocation", async () => {
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-range-expand").click();
    });

    await test.step("parsers-pending-indicator appears then disappears after resolve", async () => {
      // Verify the indicator appeared (parsers started), then cleared (parsers resolved)
      await expect(page.getByTestId("parsers-pending-indicator")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("parsers-pending-indicator")).not.toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });
  });

  test("StructuredFieldInput Duration: usage_limited kind shows uses input; round-trip through time restores uses input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("spell-name-input").fill("Duration Usage Limited Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description for duration usage limited test.");
    });

    await test.step("Expand duration and set to usage_limited — uses input visible", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("duration-kind-select").selectOption("usage_limited");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-uses-value")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Switch to time — uses input hidden", async () => {
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-uses-value")).not.toBeVisible();
    });

    await test.step("Switch back to usage_limited — uses input visible again", async () => {
      await page.getByTestId("duration-kind-select").selectOption("usage_limited");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("duration-uses-value")).toBeVisible({ timeout: TIMEOUTS.short });
    });
  });
});
