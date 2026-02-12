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
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Expand Duration while Range is expanded; Range collapses, Duration expands", async () => {
      await page.getByTestId("detail-duration-expand").click();
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
