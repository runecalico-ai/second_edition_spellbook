import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId, getTestDirname } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __dirname = getTestDirname(import.meta.url);

async function clearPlaywrightEditorHooks(page: Page) {
  await page.evaluate(() => {
    window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = undefined;
    window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE = undefined;
  });
}

async function fillValidSpellForSave(page: Page, name: string) {
  await page.getByTestId("spell-name-input").fill(name);
  await page.getByTestId("spell-level-input").fill("1");
  await page.getByTestId("spell-description-textarea").fill("Theme-aware save body.");
  await page.getByTestId("spell-classes-input").fill("Wizard");
  await page.getByTestId("spell-school-input").fill("Evocation");
}

async function getButtonVisualState(page: Page) {
  return page.getByTestId("btn-save-spell").evaluate((el) => {
    const styles = getComputedStyle(el);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      cursor: styles.cursor,
    };
  });
}

async function tabUntilTestId(page: Page, testId: string, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i++) {
    const match = await page.evaluate((want) => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("data-testid") === want;
    }, testId);
    if (match) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Could not reach data-testid="${testId}" within ${maxTabs} Tab presses`);
}

async function tabUntilSaveSpellButton(page: Page, maxTabs = 100) {
  for (let i = 0; i < maxTabs; i++) {
    const ok = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("data-testid") === "btn-save-spell";
    });
    if (ok) return;
    await page.keyboard.press("Tab");
  }
  throw new Error('Could not focus btn-save-spell via keyboard');
}

test.describe("Spell editor save workflow and first-failed-submit UX", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test.afterEach(async ({ appContext }) => {
    const { page } = appContext;
    if (page.isClosed()) return;
    await clearPlaywrightEditorHooks(page).catch(() => {});
  });

  test("new spell save returns to Library with success toast in notification viewport", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Save Workflow New ${runId}`;

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("spell-name-input").fill(name);
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Description.");
    await page.getByTestId("spell-classes-input").fill("Wizard");
    await page.getByTestId("spell-school-input").fill("Evocation");

    await page.getByTestId("btn-save-spell").click();
    await app.waitForLibrary();
    await expect(page).toHaveURL(/\//);

    await app.expectToastSuccessInViewport("Spell saved.");
    const saveToast = page
      .getByTestId("notification-viewport")
      .getByTestId("toast-notification-success")
      .filter({ hasText: "Spell saved." })
      .last();
    await expect(saveToast.getByTestId("toast-dismiss-button")).not.toBeFocused();
    await app.expectNoBlockingDialog();
  });

  test("existing spell update returns to Library with success toast", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Save Workflow Edit ${runId}`;

    await app.createSpell({
      name,
      level: "2",
      description: "Original body.",
      school: "Abjuration",
      classes: "Wizard",
    });

    await app.openSpell(name);
    await page.getByTestId("spell-description-textarea").fill("Updated body for save workflow.");
    await page.getByTestId("btn-save-spell").click();

    await app.waitForLibrary();
    await app.expectToastSuccessInViewport("Spell saved.");
    await app.expectNoBlockingDialog();
  });

  test("legacy import: basic-field edit saves and updates Library name", async ({
    appContext,
    fileTracker,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const importedName = `Legacy Basic ${runId}`;
    const renamed = `${importedName} Renamed`;
    const samplePath = fileTracker.track(path.resolve(__dirname, `tmp/legacy-basic-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${importedName}\nlevel: 1\nschool: Evocation\nclasses: Mage\n---\nTouch range spell body.`,
    );

    await app.importFile(samplePath);
    await app.navigate("Library");
    await app.openSpell(importedName);

    await page.getByTestId("spell-name-input").fill(renamed);
    await page.getByTestId("btn-save-spell").click();
    await app.waitForLibrary();
    await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await app.expectToastSuccessInViewport("Spell saved.");
  });

  test("legacy import: upgrading structured range persists after save and reopen", async ({
    appContext,
    fileTracker,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const importedName = `Legacy Range ${runId}`;
    const samplePath = fileTracker.track(path.resolve(__dirname, `tmp/legacy-range-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${importedName}\nlevel: 1\nschool: Evocation\nclasses: Mage\n---\n120 yards`,
    );

    await app.importFile(samplePath);
    await app.navigate("Library");
    await app.openSpell(importedName);
    await page.waitForTimeout(500);

    await page.getByTestId("detail-range-expand").click();
    await page.waitForTimeout(500);
    await page.getByTestId("range-kind-select").selectOption("distance");
    await page.waitForTimeout(200);
    await page.getByTestId("range-base-value").fill("30");
    await page.getByTestId("range-unit").selectOption("ft");

    await page.getByTestId("btn-save-spell").click();
    await app.waitForLibrary();
    await app.openSpell(importedName);
    await page.getByTestId("detail-range-expand").click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId("range-base-value")).toHaveValue("30");
  });

  test("saved spell remains discoverable in Library table after navigation", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Library Discoverable ${runId}`;

    await app.createSpell({
      name,
      level: "1",
      description: "Row visibility check.",
      school: "Necromancy",
      classes: "Wizard",
    });

    await expect(page.getByTestId("spell-library-table")).toBeVisible();
    const rowTestId = `spell-row-${name.replace(/\s+/g, "-").toLowerCase()}`;
    await expect(page.getByTestId(rowTestId)).toBeVisible();

    await app.navigate("Characters");
    await app.navigate("Library");
    await expect(page.getByTestId(rowTestId)).toBeVisible();
  });

  test("keyboard path: Tab navigation reaches fields with visible focus, then saves", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Keyboard Save ${runId}`;

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);

    await tabUntilTestId(page, "spell-name-input");
    await expect(page.getByTestId("spell-name-input")).toBeFocused();
    const nameOutline = await page.getByTestId("spell-name-input").evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });
    expect(nameOutline.outlineWidth !== "0px" || nameOutline.boxShadow !== "none").toBeTruthy();

    await page.keyboard.type(name);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("spell-level-input")).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("1");
    await tabUntilTestId(page, "spell-tradition-select", 20);
    await expect(page.getByTestId("spell-tradition-select")).toBeFocused();
    await tabUntilTestId(page, "spell-school-input", 15);
    await expect(page.getByTestId("spell-school-input")).toBeFocused();
    await page.keyboard.type("Illusion");
    await tabUntilTestId(page, "spell-classes-input", 15);
    await expect(page.getByTestId("spell-classes-input")).toBeFocused();
    await page.keyboard.type("Wizard");
    await tabUntilTestId(page, "spell-description-textarea", 200);
    await page.keyboard.type("Keyboard-created description.");

    await tabUntilSaveSpellButton(page);
    await expect(page.getByTestId("btn-save-spell")).toBeFocused();
    await page.keyboard.press("Enter");

    await app.waitForLibrary();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await app.expectToastSuccessInViewport("Spell saved.");
  });

  test("first failed submit shows save hint and focuses first invalid field; no validation dialog", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("btn-save-spell").click();

    await app.expectSpellSaveValidationHint();
    await expect(page.locator("#spell-name")).toBeFocused();
    await app.expectFieldError("spell-name-error");
    await app.expectNoBlockingDialog();
  });

  test("blur shows and clears name error without modal", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("spell-name-input").click();
    await page.getByTestId("spell-description-textarea").click();

    await app.expectFieldError("spell-name-error");
    await app.expectNoBlockingDialog();

    await page.getByTestId("spell-name-input").fill("Named after blur");
    await expect(page.getByTestId("spell-name-error")).not.toBeVisible();
    await app.expectNoBlockingDialog();
  });

  test("tradition change immediately revalidates school vs sphere requirements", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("spell-name-input").fill("Tradition Reval");
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Desc.");
    await page.getByTestId("spell-classes-input").fill("Wizard");

    await page.getByTestId("btn-save-spell").click();
    await app.expectFieldError("error-school-required-arcane-tradition");

    await page.getByTestId("spell-tradition-select").selectOption("DIVINE");
    await expect(page.getByTestId("spell-school-input")).toHaveCount(0);
    await expect(page.getByTestId("spell-school-field")).toHaveCount(0);
    await app.expectFieldError("error-sphere-required-divine-tradition");
    await app.expectNoBlockingDialog();
  });

  test("tradition switch mounts animated field wrapper and removes the other branch", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);

    const schoolField = page.getByTestId("spell-school-field");
    await expect(schoolField).toHaveClass(/animate-in/);
    await expect(schoolField).toHaveClass(/fade-in/);
    await expect(page.getByTestId("spell-sphere-input")).toHaveCount(0);

    await page.getByTestId("spell-tradition-select").selectOption("DIVINE");
    await expect(page.getByTestId("spell-school-input")).toHaveCount(0);
    await expect(page.getByTestId("spell-school-field")).toHaveCount(0);

    const sphereField = page.getByTestId("spell-sphere-field");
    await expect(sphereField).toHaveClass(/animate-in/);
    await expect(sphereField).toHaveClass(/fade-in/);
    await expect(page.getByTestId("spell-sphere-input")).toBeVisible();
    await app.expectNoBlockingDialog();
  });

  test("structured range scalar: blur surfaces non-negative copy (Playwright probe)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await page.evaluate(() => {
      window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE = { value: -1 };
    });

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("spell-name-input").fill("Scalar blur spell");
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Desc.");
    await page.getByTestId("spell-classes-input").fill("Wizard");
    await page.getByTestId("spell-school-input").fill("Evocation");

    await page.getByTestId("detail-range-expand").click();
    await page.waitForTimeout(500);
    await page.getByTestId("range-kind-select").selectOption("distance");
    await page.waitForTimeout(200);

    await page.getByTestId("range-base-value").blur();
    await expect(page.getByTestId("error-range-base-value")).toBeVisible({ timeout: TIMEOUTS.short });
    await expect(page.getByTestId("error-range-base-value")).toHaveText("Base value must be 0 or greater");
    await app.expectNoBlockingDialog();

    await page.getByTestId("range-base-value").fill("10");
    await expect(page.getByTestId("error-range-base-value")).not.toBeVisible();
  });

  test("slow save keeps editor mounted until invoke completes, then navigates to Library", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Slow Save ${runId}`;

    await page.evaluate(() => {
      window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 2500;
    });

    await app.navigate("Add Spell");
    await page.waitForTimeout(500);
    await page.getByTestId("spell-name-input").fill(name);
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Slow save body.");
    await page.getByTestId("spell-classes-input").fill("Wizard");
    await page.getByTestId("spell-school-input").fill("Enchantment");

    await page.getByTestId("btn-save-spell").click();

    await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page).toHaveURL(/\/edit\/new/);

    await app.waitForLibrary();
    await expect(page).toHaveURL(/\//);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });

  test("modal boundaries: delete confirmation opens dialog; validation does not", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Delete Modal ${runId}`;

    await app.createSpell({
      name,
      level: "1",
      description: "For delete modal check.",
      school: "Evocation",
      classes: "Wizard",
    });

    await app.openSpell(name);
    await page.getByTestId("btn-delete-spell").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("modal-button-cancel").click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await page.getByTestId("spell-name-input").fill("");
    await page.getByTestId("btn-save-spell").click();
    await app.expectFieldError("spell-name-error");
    await app.expectNoBlockingDialog();
  });

  test("Library add-to-character success uses toast in global viewport (not alert)", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Lib Toast Spell ${runId}`;
    const charName = `Lib Toast Char ${runId}`;

    await app.createCharacter(charName);
    await app.createSpell({
      name: spellName,
      level: "1",
      description: "For library add-to-character.",
      school: "Evocation",
      classes: "Wizard",
    });

    await app.navigate("Library");
    await page.waitForTimeout(400);

    const slug = spellName.replace(/\s+/g, "-").toLowerCase();
    await page.getByTestId(`add-to-char-select-${slug}`).selectOption({ label: charName });

    await app.expectToastSuccessInViewport("Spell added to character!");
    const addToast = page
      .getByTestId("notification-viewport")
      .getByTestId("toast-notification-success")
      .filter({ hasText: "Spell added to character!" })
      .last();
    await expect(addToast.getByTestId("toast-dismiss-button")).not.toBeFocused();
    await app.expectNoBlockingDialog();
  });

  test("inline validation stays visible under explicit light and dark themes", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => {
        localStorage.setItem("spellbook-theme", t);
      }, theme);
      await page.reload();
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
        { timeout: TIMEOUTS.medium },
      );

      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await page.getByTestId("btn-save-spell").click();
      await expect(page.getByTestId("spell-name-error")).toBeVisible();
      await app.expectSpellSaveValidationHint();
      await expect(page.getByTestId("btn-save-spell")).toBeDisabled();
      await expect(page.getByTestId("spell-name-input")).toHaveAttribute("aria-invalid", "true");
      await app.expectNoBlockingDialog();
    }
  });

  test("delayed save progress styling is explicit in both light and dark themes", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const pendingStates: Array<{
      theme: "light" | "dark";
      enabledBackground: string;
      pendingBackground: string;
      pendingColor: string;
    }> = [];

    for (const theme of ["light", "dark"] as const) {
      const runId = generateRunId();
      const spellName = `Theme Save ${theme} ${runId}`;

      await page.evaluate((t) => {
        localStorage.setItem("spellbook-theme", t);
      }, theme);
      await page.reload();
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
        { timeout: TIMEOUTS.medium },
      );

      await page.evaluate(() => {
        window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 1200;
      });

      await app.navigate("Add Spell");
      await page.waitForTimeout(500);
      await fillValidSpellForSave(page, spellName);

      const enabledState = await getButtonVisualState(page);
      await page.getByTestId("btn-save-spell").click();

      await expect(page.getByTestId("btn-save-spell")).toBeDisabled();
      await expect(page.getByTestId("btn-save-spell")).toHaveText("Saving…", {
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("btn-save-spell")).toHaveAttribute("aria-busy", "true");

      const pendingState = await getButtonVisualState(page);
      expect(pendingState.backgroundColor).not.toBe(enabledState.backgroundColor);
      expect(pendingState.cursor).toBe("not-allowed");

      pendingStates.push({
        theme,
        enabledBackground: enabledState.backgroundColor,
        pendingBackground: pendingState.backgroundColor,
        pendingColor: pendingState.color,
      });

      await app.waitForLibrary();
      await app.expectToastSuccessInViewport("Spell saved.");
      await app.expectNoBlockingDialog();
    }

    const lightPending = pendingStates.find((state) => state.theme === "light");
    const darkPending = pendingStates.find((state) => state.theme === "dark");

    expect(lightPending).toBeDefined();
    expect(darkPending).toBeDefined();
    expect(lightPending?.pendingBackground).not.toBe(darkPending?.pendingBackground);
    expect(lightPending?.pendingColor).not.toBe(darkPending?.pendingColor);
  });
});
