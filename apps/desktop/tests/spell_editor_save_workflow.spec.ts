import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId, getTestDirname } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __dirname = getTestDirname(import.meta.url);

type SaveButtonSnapshot = {
  elapsedMs: number;
  text: string;
  ariaBusy: string | null;
  disabled: boolean;
};

async function captureSaveButtonDelayTimeline(page: Page, testId = "btn-save-spell") {
  return page.evaluate((saveButtonTestId: string) => {
    return new Promise<{
      immediate: SaveButtonSnapshot;
      firstSaving: SaveButtonSnapshot;
    }>((resolve, reject) => {
      const selector = `[data-testid="${saveButtonTestId}"]`;
      const startTimeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for click on ${selector}`));
      }, 5_000);

      let observer: MutationObserver | null = null;

      const getButton = () => document.querySelector<HTMLButtonElement>(selector);
      const sample = (startedAt: number): SaveButtonSnapshot => {
        const button = getButton();
        if (!button) {
          throw new Error(`Could not find ${selector} while sampling delayed save feedback`);
        }
        return {
          elapsedMs: Math.round(performance.now() - startedAt),
          text: button.textContent?.trim() ?? "",
          ariaBusy: button.getAttribute("aria-busy"),
          disabled: button.disabled,
        };
      };

      const cleanup = () => {
        window.clearTimeout(startTimeout);
        observer?.disconnect();
        getButton()?.removeEventListener("click", handleClick, true);
      };

      const resolveWhenSavingAppears = (startedAt: number, immediate: SaveButtonSnapshot) => {
        const captureSavingSnapshot = () => {
          try {
            const snapshot = sample(startedAt);
            if (snapshot.text !== "Saving…") {
              return;
            }

            cleanup();
            resolve({ immediate, firstSaving: snapshot });
          } catch (error) {
            cleanup();
            reject(error);
          }
        };

        observer = new MutationObserver(() => {
          captureSavingSnapshot();
        });

        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["aria-busy", "disabled"],
        });

        captureSavingSnapshot();
      };

      const handleClick = () => {
        try {
          const startedAt = performance.now();
          const immediate = sample(startedAt);
          resolveWhenSavingAppears(startedAt, immediate);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      const button = getButton();
      if (!button) {
        cleanup();
        reject(new Error(`Could not find ${selector} before starting delayed save capture`));
        return;
      }

      button.addEventListener("click", handleClick, { once: true, capture: true });
    });
  }, testId);
}

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

async function waitForNewSpellEditor(page: Page) {
  await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });
  await expect(page.getByTestId("spell-name-input")).toBeVisible({ timeout: TIMEOUTS.medium });
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
  throw new Error("Could not focus btn-save-spell via keyboard");
}

test.describe("Spell editor save workflow and first-failed-submit UX", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test.afterEach(async ({ appContext }) => {
    const { page } = appContext;
    if (page.isClosed()) return;
    await clearPlaywrightEditorHooks(page).catch(() => {});
  });

  test("first-spell workflow starts from empty library, saves, and returns to the library list", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `First Spell ${runId}`;

    await test.step("Start from an empty library and enter the editor through the empty-state path", async () => {
      await app.navigate("Library");
      await app.waitForLibrary();

      const emptyLibraryState = page.getByTestId("empty-library-state");
      await expect(emptyLibraryState).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(emptyLibraryState.getByRole("heading", { name: "No Spells Yet" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(emptyLibraryState).toContainText(
        "Your spell library is empty. Create your first spell or import spells from a file.",
      );
      const emptyLibraryCreateButton = page.getByTestId("empty-library-create-button");
      await expect(emptyLibraryCreateButton).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(page.getByTestId("empty-library-import-button")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await emptyLibraryCreateButton.click();

      await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Create the first spell and save it", async () => {
      await page.getByTestId("spell-name-input").fill(name);
      await page.getByTestId("spell-level-input").fill("1");
      await page.getByTestId("spell-description-textarea").fill("This is the first spell in the library.");
      await page.getByTestId("spell-classes-input").fill("Wizard");
      await page.getByTestId("spell-school-input").fill("Evocation");

      await page.getByTestId("btn-save-spell").click();
    });

    await test.step("Verify save success and that the new spell is listed in the library", async () => {
      await app.waitForLibrary();
      await expect(page).toHaveURL(/\//);
      await app.expectToastSuccessInViewport("Spell saved.");

      const saveToast = page
        .getByTestId("notification-viewport")
        .getByTestId("toast-notification-success")
        .filter({ hasText: "Spell saved." })
        .last();
      await expect(saveToast.getByText("Spell saved.", { exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(saveToast.getByTestId("toast-dismiss-button")).not.toBeFocused();
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.expectNoBlockingDialog();
    });
  });

  test("empty search workflow shows reset CTA and restores the seeded spell after reset", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Empty Search Seed ${runId}`;
    const guaranteedMiss = `no-match-${runId}`;

    await test.step("Seed the library with one spell", async () => {
      await app.createSpell({
        name,
        level: "1",
        description: "Search reset coverage.",
        school: "Illusion",
        classes: "Wizard",
      });
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Search for a guaranteed miss and verify the empty-search copy", async () => {
      await page.getByTestId("search-input").fill(guaranteedMiss);
      await page.getByRole("button", { name: "Search", exact: true }).click();

      const emptySearchState = page.getByTestId("empty-search-state");
      await expect(emptySearchState).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(emptySearchState.getByRole("heading", { name: "No Results" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(emptySearchState).toContainText("No spells match your current search or filters.");
      await expect(page.getByTestId("empty-search-reset-button")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
    });

    await test.step("Reset the empty search and verify the seeded result returns", async () => {
      await page.getByTestId("empty-search-reset-button").click();

      await expect(page.getByTestId("search-input")).toHaveValue("");
      await expect(page.getByTestId("empty-search-state")).toHaveCount(0);
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.expectNoBlockingDialog();
    });
  });

  test("empty character spellbook workflow shows explanatory copy and add-spell CTA", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const characterName = `Empty Spellbook ${runId}`;

    await test.step("Create a character with no spells and open the spellbook builder", async () => {
      await app.createCharacter(characterName);
      await app.openSpellbookBuilder(characterName);
    });

    await test.step("Verify the empty spellbook state copy and CTA", async () => {
      const emptyCharacterState = page.getByTestId("empty-character-spellbook-state");
      await expect(emptyCharacterState).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(
        emptyCharacterState.getByRole("heading", { name: "No Spells Added" }),
      ).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(emptyCharacterState).toContainText("This character's spellbook is empty.");
      await app.expectNoBlockingDialog();

      const addSpellButton = page.getByTestId("empty-character-add-spell-button");
      await expect(addSpellButton).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await addSpellButton.click();

      const pickerDialog = page.getByRole("dialog", { name: "Add spells" });
      await expect(pickerDialog).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(page.getByTestId("spellbook-picker-dialog")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("spellbook-picker-search-input")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });
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

  test("legacy import: basic-field edit workflow saves, updates the library, and persists after reopen", async ({
    appContext,
    fileTracker,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const importedName = `Legacy Basic ${runId}`;
    const renamed = `${importedName} Edited`;
    const samplePath = fileTracker.track(path.resolve(__dirname, `tmp/legacy-basic-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      [
        "---",
        `name: ${importedName}`,
        "level: 2",
        "school: Abjuration",
        "classes: Mage",
        "source: Legacy Tome",
        "---",
        "Legacy basic spell body.",
      ].join("\n"),
    );

    await test.step("Import legacy data before editing begins", async () => {
      await app.importFile(samplePath);
      await app.navigate("Library");
      await expect(page.getByRole("link", { name: importedName, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Edit only basic plain-text fields and save", async () => {
      await app.openSpell(importedName);

      await page.getByTestId("spell-name-input").fill(renamed);
      await page.getByTestId("spell-level-input").fill("3");
      await page.getByTestId("spell-school-input").fill("Conjuration");
      await page.getByTestId("spell-classes-input").fill("Mage, Bard");
      await page.getByTestId("spell-description-textarea").fill("Edited legacy basic spell body.");

      await page.getByTestId("btn-save-spell").click();
    });

    await test.step("Verify library state and save-success behavior", async () => {
      await app.waitForLibrary();
      await app.expectToastSuccessInViewport("Spell saved.");
      await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByRole("link", { name: importedName, exact: true })).not.toBeVisible();
      await app.expectNoBlockingDialog();
    });

    await test.step("Reopen the imported spell and confirm the edited values persisted", async () => {
      await app.openSpell(renamed);
      await expect(page.getByTestId("spell-name-input")).toHaveValue(renamed);
      await expect(page.getByTestId("spell-level-input")).toHaveValue("3");
      await expect(page.getByTestId("spell-school-input")).toHaveValue("Conjuration");
      await expect(page.getByTestId("spell-classes-input")).toHaveValue("Mage, Bard");
      await expect(page.getByTestId("spell-description-textarea")).toHaveValue(
        "Edited legacy basic spell body.",
      );
    });
  });

  test("legacy import: structured range upgrade updates observable state and persists after reopen", async ({
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
      [
        "---",
        `name: ${importedName}`,
        "level: 1",
        "school: Evocation",
        "classes: Mage",
        "range: 120 yards",
        "---",
        "Legacy structured range body.",
      ].join("\n"),
    );

    await test.step("Import legacy raw structured data and confirm the raw range is loaded", async () => {
      await app.importFile(samplePath);
      await app.openSpell(importedName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("120 yards", {
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Upgrade the structured range field and verify the observable state updates before save", async () => {
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("range-kind-select").selectOption("distance");
      await page.getByTestId("range-base-value").fill("150");
      await page.getByTestId("range-unit").selectOption("ft");

      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("detail-range-input")).toHaveValue("150 ft", {
        timeout: TIMEOUTS.medium,
      });

      await page.getByTestId("btn-save-spell").click();
    });

    await test.step("Verify save success, reopen, and confirm the structured upgrade persisted", async () => {
      await app.waitForLibrary();
      await app.expectToastSuccessInViewport("Spell saved.");
      await app.expectNoBlockingDialog();

      await app.openSpell(importedName);
      await expect(page.getByTestId("detail-range-input")).toHaveValue("150 ft", {
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("detail-range-expand").click();
      await expect(page.getByTestId("range-kind-select")).toHaveValue("distance");
      await expect(page.getByTestId("range-base-value")).toHaveValue("150");
      await expect(page.getByTestId("range-unit")).toHaveValue("ft");
    });
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
    await waitForNewSpellEditor(page);

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

  test("first failed submit keeps pristine fields quiet until submit, then focuses the first invalid field; no validation dialog", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);

    await expect(page.getByTestId("spell-name-error")).toHaveCount(0);
    await expect(page.getByTestId("spell-save-validation-hint")).toHaveCount(0);

    await page.getByTestId("btn-save-spell").click();

    await app.expectSpellSaveValidationHint();
    await expect(page.getByTestId("spell-name-input")).toBeFocused();
    await app.expectFieldError("spell-name-error");
    await app.expectNoBlockingDialog();
  });

  test("pristine required fields stay quiet until blur, then the relevant error clears when fixed; no validation dialog", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);

    await expect(page.getByTestId("spell-name-error")).toHaveCount(0);
    await expect(page.getByTestId("spell-save-validation-hint")).toHaveCount(0);
    await expect(page.getByTestId("error-school-required-arcane-tradition")).toHaveCount(0);
    await expect(page.getByTestId("error-sphere-required-divine-tradition")).toHaveCount(0);

    await page.getByTestId("spell-name-input").click();
    await page.getByTestId("spell-description-textarea").click();

    await app.expectFieldError("spell-name-error");
    await expect(page.getByTestId("spell-save-validation-hint")).toHaveCount(0);
    await app.expectNoBlockingDialog();

    await page.getByTestId("spell-name-input").fill("Named after blur");
    await expect(page.getByTestId("spell-name-error")).toHaveCount(0);
    await app.expectNoBlockingDialog();
  });

  test("tradition change immediately revalidates school vs sphere requirements and removes obsolete branch errors", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);
    await page.getByTestId("spell-name-input").fill("Tradition Reval");
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Desc.");
    await page.getByTestId("spell-classes-input").fill("Wizard");

    await app.expectActiveTraditionField("ARCANE");

    await page.getByTestId("btn-save-spell").click();
    await app.expectFieldError("error-school-required-arcane-tradition");
    await expect(page.getByTestId("error-sphere-required-divine-tradition")).toHaveCount(0);
    await expect(page.getByTestId("error-tradition-conflict")).toHaveCount(0);

    await page.getByTestId("spell-tradition-select").selectOption("DIVINE");
    await app.expectActiveTraditionField("DIVINE");
    await expect(page.getByTestId("error-school-required-arcane-tradition")).toHaveCount(0);
    await app.expectFieldError("error-sphere-required-divine-tradition");
    await expect(page.getByTestId("error-tradition-conflict")).toHaveCount(0);
    await app.expectNoBlockingDialog();
  });

  test("tradition switch removes stale conflict state and leaves only the active tradition field wrapper", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `Workflow Tradition Conflict ${runId}`;

    await app.seedConflictedSpell(spellName);

    await app.openSpell(spellName);
    await app.expectFieldError("error-tradition-conflict");
    await app.expectActiveTraditionField("ARCANE");

    await page.getByTestId("spell-tradition-select").selectOption("DIVINE");
    await app.expectActiveTraditionField("DIVINE");
    await expect(page.getByTestId("error-tradition-conflict")).toHaveCount(0);
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
  await waitForNewSpellEditor(page);
    await page.getByTestId("spell-name-input").fill("Scalar blur spell");
    await page.getByTestId("spell-level-input").fill("1");
    await page.getByTestId("spell-description-textarea").fill("Desc.");
    await page.getByTestId("spell-classes-input").fill("Wizard");
    await page.getByTestId("spell-school-input").fill("Evocation");

    await page.getByTestId("detail-range-expand").click();
  await expect(page.getByTestId("range-kind-select")).toBeVisible({ timeout: TIMEOUTS.medium });
    await page.getByTestId("range-kind-select").selectOption("distance");
  await expect(page.getByTestId("range-base-value")).toBeVisible({ timeout: TIMEOUTS.medium });

    await page.getByTestId("range-base-value").blur();
    await expect(page.getByTestId("error-range-base-value")).toBeVisible({
      timeout: TIMEOUTS.short,
    });
    await expect(page.getByTestId("error-range-base-value")).toHaveText(
      "Base value must be 0 or greater",
    );
    await app.expectNoBlockingDialog();

    await page.getByTestId("range-base-value").fill("10");
    await expect(page.getByTestId("error-range-base-value")).not.toBeVisible();
  });

  test("delayed save feedback waits 300 ms before showing Saving…, then navigates to Library with a toast", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const name = `Slow Save ${runId}`;

    await page.evaluate(() => {
      window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 1200;
    });

    await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);
    await fillValidSpellForSave(page, name);

    const saveButton = page.getByTestId("btn-save-spell");
    const saveFeedbackTimelinePromise = captureSaveButtonDelayTimeline(page);
    await saveButton.click();
    const saveFeedbackTimeline = await saveFeedbackTimelinePromise;

    await expect(page.getByRole("heading", { name: "New Spell" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page).toHaveURL(/\/edit\/new/);
    expect(saveFeedbackTimeline.immediate.text).not.toBe("Saving…");
    expect(saveFeedbackTimeline.firstSaving.elapsedMs).toBeGreaterThanOrEqual(300);
    expect(saveFeedbackTimeline.firstSaving.text).toBe("Saving…");
    expect(saveFeedbackTimeline.firstSaving.ariaBusy).toBe("true");
    expect(saveFeedbackTimeline.firstSaving.disabled).toBe(true);

    await app.waitForLibrary();
    await expect(page).toHaveURL(/\//);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await app.expectToastSuccessInViewport("Spell saved.");
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
  await app.waitForLibrary();

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
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme, {
        timeout: TIMEOUTS.medium,
      });

      await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);
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
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme, {
        timeout: TIMEOUTS.medium,
      });

      await page.evaluate(() => {
        window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 1200;
      });

      await app.navigate("Add Spell");
  await waitForNewSpellEditor(page);
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
