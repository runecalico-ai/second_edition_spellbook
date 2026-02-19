import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";

test.describe("Spell Editor canon-first default", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.beforeEach(async ({ appContext }) => {
    const { page } = appContext;
    page.on("dialog", (dialog) => {
      console.log(`DIALOG: [${dialog.type()}] ${dialog.message()}`);
      // Only dismiss if it's an alert or confirm we don't need for navigation
      if (dialog.type() === "alert") {
        dialog.dismiss().catch(() => {});
      }
    });
  });
  test.slow();

  test("canon-first default › Default view: canon single-line inputs and expand controls visible; no structured forms", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Canon inputs and expand controls visible", async () => {
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("detail-range-expand")).toBeVisible();
      await expect(page.getByTestId("detail-duration-input")).toBeVisible();
      await expect(page.getByTestId("detail-duration-expand")).toBeVisible();
      await expect(page.getByTestId("detail-casting-time-input")).toBeVisible();
      await expect(page.getByTestId("detail-casting-time-expand")).toBeVisible();
      await expect(page.getByTestId("detail-components-input")).toBeVisible();
      await expect(page.getByTestId("detail-components-expand")).toBeVisible();
      await expect(page.getByTestId("detail-area-input")).toBeVisible();
      await expect(page.getByTestId("detail-area-expand")).toBeVisible();
      await expect(page.getByTestId("detail-saving-throw-input")).toBeVisible();
      await expect(page.getByTestId("detail-saving-throw-expand")).toBeVisible();
      await expect(page.getByTestId("detail-damage-input")).toBeVisible();
      await expect(page.getByTestId("detail-damage-expand")).toBeVisible();
      await expect(page.getByTestId("detail-magic-resistance-input")).toBeVisible();
      await expect(page.getByTestId("detail-magic-resistance-expand")).toBeVisible();
      await expect(page.getByTestId("detail-material-components-input")).toBeVisible();
      await expect(page.getByTestId("detail-material-components-expand")).toBeVisible();
    });

    await test.step("Structured controls not visible when collapsed", async () => {
      await expect(page.getByTestId("range-kind-select")).not.toBeVisible();
      await expect(page.getByTestId("duration-kind-select")).not.toBeVisible();
    });

    await test.step("Collapsed expand controls omit aria-controls when panels are unmounted", async () => {
      await expect(page.getByTestId("detail-range-expand")).not.toHaveAttribute(
        "aria-controls",
        /.+/,
      );
      await expect(page.getByTestId("detail-duration-expand")).not.toHaveAttribute(
        "aria-controls",
        /.+/,
      );
      await expect(page.getByTestId("detail-saving-throw-expand")).not.toHaveAttribute(
        "aria-controls",
        /.+/,
      );
      await expect(page.getByTestId("detail-magic-resistance-expand")).not.toHaveAttribute(
        "aria-controls",
        /.+/,
      );
    });
  });

  test("Edit spell in canon view only, save; assert saved text", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Canon Only ${runId}`;

    await test.step("Create spell with canon fields only", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-duration-input").fill("1 round/level");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and verify canon text persisted", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("30 ft", {
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-duration-input")).toHaveValue("1 round/level");
    });
  });

  test("Components text-only save without expansion preserves canonical structured interpretation", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Components Text Only ${runId}`;
    const componentsText = "V, S, M";
    const materialsText = "ruby dust (worth 100 gp, consumed)";

    await test.step("Create spell using collapsed canon text fields only", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Components text only save path.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-components-input").fill(componentsText);
      await page.getByTestId("detail-material-components-input").fill(materialsText);

      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and verify canon text persisted", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-components-input")).toHaveValue(componentsText, {
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-material-components-input")).toHaveValue(materialsText);
    });

    await test.step("Expand components and verify parser-backed structured interpretation", async () => {
      await page.getByTestId("detail-components-expand").click();
      await expect(page.getByTestId("component-checkbox-verbal")).toBeChecked({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("component-checkbox-somatic")).toBeChecked();
      await expect(page.getByTestId("component-checkbox-material")).toBeChecked();
      await expect(page.getByTestId("material-component-name").first()).toHaveValue("ruby dust");
      await expect(page.getByTestId("material-component-gp-value").first()).toHaveValue("100");
      await expect(page.getByTestId("material-component-consumed").first()).toBeChecked();
      await expect(page.getByTestId("component-text-preview")).toContainText("V, S, M");
    });
  });

  test("Material row expansion parses components canon text when material text is empty", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Material Expand Parses Components ${runId}`;

    await test.step("Create spell with V/S components and empty material text", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page
        .getByTestId("spell-description-textarea")
        .fill("Material row expand parsing check.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-components-input").fill("V, S");
      await page.getByTestId("detail-material-components-input").fill("");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Expand Material Components row and verify checkbox state parses from components line", async () => {
      await app.openSpell(spellName);
      await page.getByTestId("detail-material-components-expand").click();
      await expect(page.getByTestId("component-checkbox-verbal")).toBeChecked({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("component-checkbox-somatic")).toBeChecked();
      await expect(page.getByTestId("component-checkbox-material")).not.toBeChecked();
      await page.getByTestId("detail-material-components-expand").click();
      await expect(page.getByTestId("detail-components-input")).toHaveValue("V, S");
    });

    await test.step("Save after material row collapse and verify canon line behavior is preserved", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-components-input")).toHaveValue("V, S");
      await expect(page.getByTestId("detail-material-components-input")).toHaveValue("");
    });
  });

  test("Expand field, edit structured form, collapse; single line updates from spec", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Expand Edit Collapse ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("10 feet");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Range, edit structured value, collapse", async () => {
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("range-base-value").fill("30");
      await page.getByTestId("range-unit").selectOption("yd");
      await page.getByTestId("detail-range-expand").click(); // collapse
      await expect(page.getByTestId("range-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Canon line updated from serialized spec", async () => {
      const rangeInput = page.getByTestId("detail-range-input");
      await expect(rangeInput).toHaveValue("30 yd");
    });
  });

  test("Casting Time expand/edit/collapse updates canon line and persists after save", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Casting Time Round Trip ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Casting time round-trip.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-casting-time-input").fill("1 round");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-casting-time-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Casting Time, edit structured form, collapse", async () => {
      await page.getByTestId("detail-casting-time-expand").click();
      await expect(page.getByTestId("casting-time-base-value")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("casting-time-base-value").fill("2");
      await page.getByTestId("casting-time-per-level").fill("1");
      await page.getByTestId("casting-time-level-divisor").fill("3");
      await page.getByTestId("casting-time-unit").selectOption("round");
      await page.getByTestId("detail-casting-time-expand").click();
      await expect(page.getByTestId("casting-time-base-value")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Canon line updates from structured serialization", async () => {
      await expect(page.getByTestId("detail-casting-time-input")).toHaveValue(
        "2 + 1/3/level round",
      );
    });

    await test.step("Save and reopen; persisted value remains", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-casting-time-input")).toHaveValue(
        "2 + 1/3/level round",
      );
    });
  });

  test("Area expand/edit/collapse updates canon line and persists after save", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Area Round Trip ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Area round-trip.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-area-input").fill("Point");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-area-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Area, edit structured form, collapse", async () => {
      await page.getByTestId("detail-area-expand").click();
      await expect(page.getByTestId("area-form-kind")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("area-form-kind").selectOption("radius_sphere");
      await page.getByTestId("area-form-radius-value").fill("20");
      await page.getByTestId("area-form-shape-unit").selectOption("ft");
      await page.getByTestId("detail-area-expand").click();
      await expect(page.getByTestId("area-form-kind")).not.toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Canon line updates from structured serialization", async () => {
      await expect(page.getByTestId("detail-area-input")).toHaveValue("20-ft radius (sphere)");
    });

    await test.step("Save and reopen; persisted value remains", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-area-input")).toHaveValue("20-ft radius (sphere)");
    });
  });

  test("Damage expand/edit/collapse updates canon line and persists after save", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Damage Round Trip ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Damage round-trip.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-damage-input").fill("");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-damage-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Damage, edit structured form, collapse", async () => {
      await page.getByTestId("detail-damage-expand").click();
      await expect(page.getByTestId("damage-form-kind")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("damage-form-kind").selectOption("modeled");
      await page.getByTestId("damage-form-part-formula").first().fill("2d8");
      await page.getByTestId("detail-damage-expand").click();
      await expect(page.getByTestId("damage-form-kind")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Canon line updates from structured serialization", async () => {
      await expect(page.getByTestId("detail-damage-input")).toHaveValue("2d8 fire (half save)");
    });

    await test.step("Save and reopen; persisted value remains", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-damage-input")).toHaveValue("2d8 fire (half save)");
    });
  });

  test("Range save while expanded and dirty persists structured serialization", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Range Save Expanded Dirty ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Range save while expanded.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("10 feet");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Range, edit structured form, save without collapsing", async () => {
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("range-base-value").fill("45");
      await page.getByTestId("range-unit").selectOption("yd");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and verify canon line reflects structured edit", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("45 yd", {
        timeout: TIMEOUTS.short,
      });
    });
  });

  test("Failed save after structured range edit keeps canon text synchronized and stays on editor", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Failed Save Structured Sync ${runId}`;

    await test.step("Create spell and open editor for update path", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page
        .getByTestId("spell-description-textarea")
        .fill("Failed save structured sync test.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("10 ft");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("10 ft", {
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand range, make structured edit, and set deterministic backend-rejected payload", async () => {
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("range-base-value").fill("60");
      await page.getByTestId("range-unit").selectOption("ft");

      await page.getByTestId("spell-level-input").fill("10");
      await page.getByTestId("spell-classes-input").fill("Cleric");
      await expect(page.getByTestId("range-base-value")).toHaveValue("60");
    });

    await test.step("Save shows error modal, canon remains synchronized, and editor stays open", async () => {
      await page.getByTestId("btn-save-spell").click();

      const saveErrorDialog = page.getByRole("dialog");
      await expect(saveErrorDialog).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(saveErrorDialog.getByRole("heading", { name: "Save Error" })).toBeVisible();
      await expect(saveErrorDialog).toContainText("Failed to save");
      await expect(saveErrorDialog).toContainText("Arcane casters (Wizard/Mage)");
      await handleCustomModal(page, "OK");

      await expect(page.getByRole("heading", { name: "Edit Spell" })).toBeVisible();
      await expect(page).toHaveURL(/\/edit\/\d+/, { timeout: TIMEOUTS.short });
      await expect(page.getByRole("heading", { name: "Library" })).not.toBeVisible();
      await expect(page.getByTestId("detail-range-input")).toHaveValue("60 ft", {
        timeout: TIMEOUTS.medium,
      });
    });
  });

  test("Rapid expand toggling race guard leaves only Duration expanded", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Rapid Expand Toggle ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Rapid expand race guard.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-duration-input").fill("1 round");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-expand")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-duration-expand")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Rapidly toggle Range then Duration expansion", async () => {
      await page.evaluate(() => {
        const rangeExpand = document.querySelector('[data-testid="detail-range-expand"]');
        const durationExpand = document.querySelector('[data-testid="detail-duration-expand"]');
        rangeExpand?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        durationExpand?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    });

    await test.step("Duration remains expanded and Range is collapsed", async () => {
      await expect(page.getByTestId("detail-duration-expand")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(page.getByTestId("detail-range-expand")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("range-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });
  });

  test("Duration parser fallback special is preserved across expand/collapse/save", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Duration Fallback Preserve ${runId}`;
    const fallbackDuration = "duration?? totally_unparseable_value";

    await test.step("Create spell with deterministic unparseable duration text", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page
        .getByTestId("spell-description-textarea")
        .fill("Special fallback preservation behavior.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Alteration");
      await page.getByTestId("detail-duration-input").fill(fallbackDuration);
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Expand Duration and assert special/fallback indicators", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(fallbackDuration, {
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-duration-special-hint")).toBeVisible();
      await expect(page.getByTestId("spell-editor-special-fallback-banner")).toBeVisible();
    });

    await test.step("Collapse, save, and verify fallback text/indicator persisted", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByText("(special)")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(fallbackDuration, {
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByText("(special)")).toBeVisible({ timeout: TIMEOUTS.short });
    });
  });

  test("Only one detail field expanded at a time: expanding B while A is open collapses A and expands B", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Only One Expanded ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-duration-input").fill("1 round");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Range", async () => {
      const rangeExpand = page.getByTestId("detail-range-expand");
      await rangeExpand.click();
      await expect(rangeExpand).toHaveAttribute("aria-controls", "detail-range-panel");
      await expect(page.locator("#detail-range-panel")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Duration while Range is expanded; Range collapses, Duration expands", async () => {
      const durationExpand = page.getByTestId("detail-duration-expand");
      await durationExpand.click();
      await expect(durationExpand).toHaveAttribute("aria-controls", "detail-duration-panel");
      await expect(page.locator("#detail-duration-panel")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("range-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Only Duration structured form visible", async () => {
      await expect(page.getByTestId("detail-range-expand")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(page.getByTestId("detail-duration-expand")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(page.locator("#detail-range-panel")).toHaveCount(0);
    });
  });

  test("Editing canon detail input while expanded collapses same field panel and preserves text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Canon Edit Collapses Expanded ${runId}`;
    const editedRangeText = "40 yards";

    await test.step("Create and open spell", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Range collapse regression test.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Range structured panel", async () => {
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("detail-range-expand")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(page.locator("#detail-range-panel")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Type into detail-range-input while expanded", async () => {
      await page.getByTestId("detail-range-input").fill(editedRangeText);
    });

    await test.step("Range panel collapses and canon input retains typed text", async () => {
      await expect(page.getByTestId("detail-range-expand")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(page.locator("#detail-range-panel")).toHaveCount(0);
      await expect(page.getByTestId("detail-range-input")).toHaveValue(editedRangeText);
    });
  });

  test("Material-only structured edit updates material canon text without overwriting components canon text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Material Only Edit Preserves Components ${runId}`;
    const componentsText = "V, S, M";
    const initialMaterialText = "powdered silver";
    const editedMaterialName = "powdered ruby";

    await test.step("Create and open spell with components and material canon text", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page
        .getByTestId("spell-description-textarea")
        .fill("Material-only structured edit should not overwrite components text.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-components-input").fill(componentsText);
      await page.getByTestId("detail-material-components-input").fill(initialMaterialText);
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-components-input")).toHaveValue(componentsText, {
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-material-components-input")).toHaveValue(
        initialMaterialText,
      );
    });

    await test.step("Expand material row only, edit structured material, then collapse", async () => {
      await page.getByTestId("detail-material-components-expand").click();
      await expect(page.getByTestId("material-component-name").first()).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("material-component-name").first().fill(editedMaterialName);
      await page.getByTestId("detail-material-components-expand").click();
      await expect(page.getByTestId("detail-material-components-expand")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    await test.step("Components canon text remains unchanged while material canon text is updated", async () => {
      await expect(page.getByTestId("detail-components-input")).toHaveValue(componentsText);
      await expect(page.getByTestId("detail-material-components-input")).not.toHaveValue(
        initialMaterialText,
      );
      await expect(page.getByTestId("detail-material-components-input")).toHaveValue(
        new RegExp(editedMaterialName, "i"),
      );
    });
  });

  test("Expand field, do not edit structured form, collapse; canon line unchanged", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `View Only Collapse ${runId}`;
    const canonLine = "1 turn";

    await test.step("Create spell with duration text", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Test duration line permanence.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Alteration");
      await page.getByTestId("detail-duration-input").fill("1 turn");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Duration, do not edit, collapse", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-duration-expand").click(); // collapse without editing
      await expect(page.getByTestId("duration-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Canon line unchanged", async () => {
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(canonLine);
    });
  });

  test("Expand, edit structured form, collapse then view-only expand/collapse leaves canon unchanged", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Dirty Reset ${runId}`;

    await test.step("Create spell with duration, open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Dirty reset lifecycle.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Alteration");
      await page.getByTestId("detail-duration-input").fill("1 turn");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Duration, edit structured form, collapse", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("duration-kind-select").selectOption("time");
      await page.getByTestId("duration-base-value").fill("1");
      await page.getByTestId("duration-unit").selectOption("round");
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    const expectedAfterFirstCollapse = "1 round";
    await test.step("Canon line shows serialized value after first collapse", async () => {
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(
        expectedAfterFirstCollapse,
      );
    });

    await test.step("Expand again (view-only), collapse", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Canon line unchanged after view-only collapse (dirty was reset)", async () => {
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(
        expectedAfterFirstCollapse,
      );
    });
  });

  test("Collapse returns focus to expand button (a11y / keyboard)", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Collapse Focus ${runId}`;

    await test.step("Create spell and open", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-duration-input").fill("1 round");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Duration via click", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Collapse; focus returns to expand button", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
      const expandBtn = page.getByTestId("detail-duration-expand");
      await expect(expandBtn).toBeFocused({ timeout: TIMEOUTS.short });
    });
  });

  test("New spell: all fields collapsed with empty lines; expand one field shows parsed form", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill("New Spell Expand");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
    });

    await test.step("Detail inputs empty or placeholder", async () => {
      await expect(page.getByTestId("detail-range-input")).toBeVisible();
      await expect(page.getByTestId("detail-duration-input")).toHaveValue("");
    });

    await test.step("Expand Duration, loading then structured form appears", async () => {
      await page.getByTestId("detail-duration-expand").click();
      // Wait for loading to finish, then assert structured form
      await expect(page.getByTestId("detail-duration-loading")).not.toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });
  });

  test("Unsaved changes: warn on Cancel", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell and edit canon line", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill("Unsaved Test");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("detail-range-input").fill("Touch");
    });

    await test.step("Click Cancel, confirm dialog appears", async () => {
      await page.getByTestId("btn-cancel-edit").click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible();
    });

    await test.step("Cancel dialog keeps user on editor", async () => {
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /cancel|no|stay/i }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("spell-name-input")).toBeVisible();
      await expect(page.getByTestId("detail-range-input")).toHaveValue("Touch");
    });
  });

  test("Load spell with canonical_data, expand field; structured form from canonical_data (no re-parse)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Canon Data Load ${runId}`;

    await test.step("Create spell with range, expand Range so backend stores canonical_data, save", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.medium });
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen spell and expand Range", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("detail-range-expand").click();
    });

    await test.step("Structured form shows from canonical_data without loading state", async () => {
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("detail-range-loading")).not.toBeVisible();
      const baseValue = page.getByTestId("range-base-value");
      await expect(baseValue).toBeVisible();
      await expect(baseValue).toHaveValue("30");
    });
  });

  test("Loading a second spell resets structured state; expand parses from current canon text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellA = `Canonical Source ${runId}`;
    const spellB = `Parse On Expand ${runId}`;

    await test.step("Create Spell A with canonical structured range", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellA);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("30 ft");
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.medium });
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Create Spell B with canon text only", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellB);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill("Touch");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Open Spell A and confirm canonical structured range", async () => {
      await app.openSpell(spellA);
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("range-base-value")).toHaveValue("30");
    });

    await test.step("Open Spell B and expand Range parses from Spell B text", async () => {
      await app.openSpell(spellB);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("Touch", {
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("range-kind-select")).toHaveValue("touch");
      await expect(page.getByTestId("range-base-value")).not.toBeVisible();
    });
  });

  test("Expand field with special, edit structured form to fix, collapse; canon line updates", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Manual Fix Special ${runId}`;

    await test.step("Create spell with clearly unparseable duration text", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Alteration");
      await page.getByTestId("detail-duration-input").fill("duration?? totally_unparseable_value");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Expand Duration and assert special hint/banner", async () => {
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("detail-duration-special-hint")).toBeVisible();
      await expect(page.getByTestId("spell-editor-special-fallback-banner")).toBeVisible();
      await expect(page.getByTestId("spell-editor-special-fallback-banner")).toContainText(
        "could not be fully parsed",
      );
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByText("(special)")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(
        page.getByTitle("Stored as text; not fully structured for hashing"),
      ).toBeVisible();
    });

    await test.step("Re-expand Duration and edit structured form", async () => {
      await page.getByTestId("detail-duration-expand").click();
      const kindSelect = page.getByTestId("duration-kind-select");
      await expect(kindSelect).toBeVisible({ timeout: TIMEOUTS.short });
      await kindSelect.selectOption("permanent");
      await page.getByTestId("detail-duration-expand").click();
      await expect(kindSelect).not.toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Canon line updated with serialized value", async () => {
      const canonInput = page.getByTestId("detail-duration-input");
      await expect(canonInput).toHaveValue("Permanent");
    });
  });

  test("Unsaved changes: dirty state and navigate away shows confirm dialog, no auto-serialize", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Open new spell, edit canon line then navigate away", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("spell-name-input").fill("Nav Unsaved");
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Description.");
      await page.getByTestId("detail-duration-input").fill("1 round");
    });

    await test.step("Navigate to Library without saving; confirm dialog appears", async () => {
      await app.navigate("Library");
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible();
    });

    await test.step("Cancel dialog stays on editor; Confirm discards", async () => {
      await handleCustomModal(page, "Cancel");
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: TIMEOUTS.short });
      await expect(page.getByTestId("spell-name-input")).toBeVisible();
      await app.navigate("Library");
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: TIMEOUTS.short });
      await handleCustomModal(page, "Confirm");
      await app.waitForLibrary();
    });
  });

  test("Damage and Magic Resistance stay visible and empty when missing", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Empty Damage MR ${runId}`;

    await test.step("New spell shows empty damage/MR lines", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("detail-damage-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-magic-resistance-input")).toBeVisible();
      await expect(page.getByTestId("detail-damage-input")).toHaveValue("");
      await expect(page.getByTestId("detail-magic-resistance-input")).toHaveValue("");
    });

    await test.step("Save spell without damage/MR, then reopen", async () => {
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("No damage or MR.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Alteration");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
    });

    await test.step("Persisted spell still shows empty damage/MR", async () => {
      await expect(page.getByTestId("detail-damage-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await expect(page.getByTestId("detail-magic-resistance-input")).toBeVisible();
      await expect(page.getByTestId("detail-damage-input")).toHaveValue("");
      await expect(page.getByTestId("detail-magic-resistance-input")).toHaveValue("");
    });
  });

  test("Saving Throw and Magic Resistance canon mappings expand to semantic structured kinds", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const cases = [
      { label: "none", savingThrow: "None", savingThrowKind: "none", mr: "", mrKind: "unknown" },
      {
        label: "negates pattern + yes pattern",
        savingThrow: "Save negates",
        savingThrowKind: "single",
        mr: "MR applies (yes)",
        mrKind: "normal",
      },
      {
        label: "half pattern + no pattern",
        savingThrow: "1/2 damage",
        savingThrowKind: "single",
        mr: "Does not apply",
        mrKind: "ignores_mr",
      },
      {
        label: "partial pattern + partial pattern",
        savingThrow: "Partial effect",
        savingThrowKind: "single",
        mr: "Partial",
        mrKind: "partial",
      },
    ] as const;

    for (const testCase of cases) {
      const spellName = `Canon Map ${testCase.label} ${runId}`;
      await test.step(`Create spell: ${testCase.label}`, async () => {
        await app.navigate("Add Spell");
        await page.getByTestId("spell-name-input").fill(spellName);
        await page.getByTestId("spell-level-input").fill("1");
        await page.getByTestId("spell-description-textarea").fill("Canon mapping validation");
        await page.getByTestId("spell-classes-input").fill("Wizard");
        await page.getByLabel("School").fill("Invocation");
        await page.getByTestId("detail-saving-throw-input").fill(testCase.savingThrow);
        await page.getByTestId("detail-magic-resistance-input").fill(testCase.mr);
        await page.getByTestId("btn-save-spell").click();
        await app.waitForLibrary();
      });

      await test.step(`Expand and assert structured kinds: ${testCase.label}`, async () => {
        await app.openSpell(spellName);

        const savingThrowExpand = page.getByTestId("detail-saving-throw-expand");
        await savingThrowExpand.click();
        await expect(savingThrowExpand).toHaveAttribute(
          "aria-controls",
          "detail-saving-throw-panel",
        );
        await expect(page.locator("#detail-saving-throw-panel")).toBeVisible({
          timeout: TIMEOUTS.short,
        });
        await expect(page.getByTestId("saving-throw-kind")).toHaveValue(testCase.savingThrowKind);
        if (testCase.savingThrowKind === "single") {
          await expect(page.getByTestId("saving-throw-kind")).not.toHaveValue("dm_adjudicated");
        }

        const magicResistanceExpand = page.getByTestId("detail-magic-resistance-expand");
        await magicResistanceExpand.click();
        await expect(magicResistanceExpand).toHaveAttribute(
          "aria-controls",
          "detail-magic-resistance-panel",
        );
        await expect(page.locator("#detail-magic-resistance-panel")).toBeVisible({
          timeout: TIMEOUTS.short,
        });
        await expect(page.getByTestId("magic-resistance-kind")).toHaveValue(testCase.mrKind);
        if (testCase.mrKind !== "unknown") {
          await expect(page.getByTestId("magic-resistance-kind")).not.toHaveValue("special");
        }
      });
    }
  });

  test("View-only expand does not rewrite parseable Saving Throw and Magic Resistance canon text on save", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `View Only Save Map ${runId}`;

    await test.step("Create spell with parseable canon text", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("View-only expansion save check");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-saving-throw-input").fill("Negates");
      await page.getByTestId("detail-magic-resistance-input").fill("Yes");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and expand fields without editing", async () => {
      await app.openSpell(spellName);
      const savingThrowExpand = page.getByTestId("detail-saving-throw-expand");
      await savingThrowExpand.click();
      await expect(savingThrowExpand).toHaveAttribute("aria-controls", "detail-saving-throw-panel");
      await expect(page.getByTestId("saving-throw-kind")).toHaveValue("single");
      const magicResistanceExpand = page.getByTestId("detail-magic-resistance-expand");
      await magicResistanceExpand.click();
      await expect(magicResistanceExpand).toHaveAttribute(
        "aria-controls",
        "detail-magic-resistance-panel",
      );
      await expect(page.getByTestId("magic-resistance-kind")).toHaveValue("normal");
    });

    await test.step("Save and verify canon lines remain unchanged", async () => {
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-saving-throw-input")).toHaveValue("Negates");
      await expect(page.getByTestId("detail-magic-resistance-input")).toHaveValue("Yes");
    });
  });

  test("Unrelated save preserves previously loaded Saving Throw/MR structured specs", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Preserve Structured Specs ${runId}`;

    await test.step("Create baseline spell", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Baseline for spec preservation");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-saving-throw-input").fill("Negates");
      await page.getByTestId("detail-magic-resistance-input").fill("Partial");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Add richer structured details and save", async () => {
      await app.openSpell(spellName);

      await page.getByTestId("detail-saving-throw-expand").click();
      await expect(page.getByTestId("saving-throw-kind")).toHaveValue("single");
      await page.getByTestId("saving-throw-single-modifier").fill("2");

      await page.getByTestId("detail-magic-resistance-expand").click();
      await expect(page.getByTestId("magic-resistance-kind")).toHaveValue("partial");
      await page.getByTestId("magic-resistance-part-ids").fill("part_a, part_b");

      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Edit unrelated field and save", async () => {
      await app.openSpell(spellName);
      await page
        .getByTestId("spell-description-textarea")
        .fill("Baseline for spec preservation (updated description)");
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and verify structured details persisted", async () => {
      await app.openSpell(spellName);
      await page.getByTestId("detail-saving-throw-expand").click();
      await expect(page.getByTestId("saving-throw-kind")).toHaveValue("single");
      await expect(page.getByTestId("saving-throw-single-modifier")).toHaveValue("2");

      await page.getByTestId("detail-magic-resistance-expand").click();
      await expect(page.getByTestId("magic-resistance-kind")).toHaveValue("partial");
      await expect(page.getByTestId("magic-resistance-part-ids")).toHaveValue("part_a, part_b");
    });
  });

  test("Canonical_data spell save without expansion preserves canon text byte-for-byte", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Canon Preserve No Expand ${runId}`;
    const canonRange = "30  ft";

    await test.step("Create spell and add canonical_data by structured edit", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("No-expand canonical preservation");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-range-input").fill(canonRange);

      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("detail-range-input")).toHaveValue(canonRange);

      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen and save without expanding details", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue(canonRange);
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Canon text remains byte-equivalent", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue(canonRange);
    });
  });

  test("Expand view-only then collapse/save preserves unchanged canon text", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Canon Preserve View Only ${runId}`;
    const canonDuration = "1   round/level";

    await test.step("Create spell with canonical_data available", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("View-only canonical preservation");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByLabel("School").fill("Invocation");
      await page.getByTestId("detail-duration-input").fill(canonDuration);

      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(canonDuration);

      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Reopen, expand view-only, collapse, then save", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(canonDuration);
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("duration-kind-select")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await page.getByTestId("detail-duration-expand").click();
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(canonDuration);
      await page.getByTestId("btn-save-spell").click();
      await app.waitForLibrary();
    });

    await test.step("Canon text remains unchanged", async () => {
      await app.openSpell(spellName);
      await expect(page.getByTestId("detail-duration-input")).toHaveValue(canonDuration);
    });
  });

  test("Unsaved beforeunload and multiple navigation paths warn and allow stay", async ({
    appContext,
  }) => {
    test.setTimeout(60_000);
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    await test.step("Open new spell and make unsaved changes", async () => {
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(`Unsaved Path A ${runId}`);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("Unsaved path test");
      await page.getByTestId("detail-duration-input").fill("2 rounds");
    });

    await test.step("beforeunload event is canceled when dirty", async () => {
      const beforeUnloadResult = await page.evaluate(() => {
        const evt = new Event("beforeunload", { cancelable: true });
        const dispatchResult = window.dispatchEvent(evt);
        return { defaultPrevented: evt.defaultPrevented, dispatchResult };
      });
      expect(beforeUnloadResult.defaultPrevented).toBeTruthy();
      expect(beforeUnloadResult.dispatchResult).toBeFalsy();
    });

    await test.step("Navigate to Characters and stay on cancel", async () => {
      await page.getByRole("navigation").getByRole("link", { name: "Characters" }).click();
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "Cancel");
      await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Navigate to Library and stay on cancel", async () => {
      await page.getByRole("navigation").getByRole("link", { name: "Library" }).click();
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "Cancel");
      await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Click editor Cancel and stay on modal cancel", async () => {
      await page.getByTestId("btn-cancel-edit").click();
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
      await handleCustomModal(page, "Cancel");
      await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });
  });
});
