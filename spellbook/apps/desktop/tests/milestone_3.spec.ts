import { type Browser, chromium, expect, test } from "@playwright/test";
import { BASE_CDP_PORT, TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SELECTORS, SpellbookApp } from "./page-objects/SpellbookApp";
import { setupAcceptAllDialogs } from "./utils/dialog-handler";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;

test.beforeAll(async () => {
  appContext = await launchTauriApp({ timeout: TIMEOUTS.long, debug: true });
});

test.afterAll(() => {
  cleanupTauriApp(appContext);
});

test.slow();

test("Milestone 3: Robust Search & Saved Searches", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);

  const cleanupDialog = setupAcceptAllDialogs(page);

  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  try {
    await page
      .getByRole("link", { name: "Library" })
      .waitFor({ state: "visible", timeout: TIMEOUTS.long });
  } catch (e) {
    const bodyContent = await page.content();
    console.log("PAGE CONTENT PREVIEW:", bodyContent.substring(0, 1000));
    throw e;
  }

  const runId = Date.now();
  const authorName = `Author ${runId}`;
  const spellName = `M3 Search Spell ${runId}`;

  // Create spell with author
  await app.navigate("Add Spell");
  await expect(page).toHaveURL(/\/edit\/new/);
  await page.getByPlaceholder("Spell Name").fill(spellName);
  await page.getByPlaceholder("Level").fill("1");
  await page.getByLabel("Author").fill(authorName);
  await page.locator(SELECTORS.description).fill("Testing author search");
  await page.getByRole("button", { name: "Save Spell" }).click();
  await app.waitForLibrary();

  // Verify author search
  await app.navigate("Library");
  await page.getByPlaceholder("Search spells…").fill(authorName);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getSpellRow(spellName)).toBeVisible();

  // Verify level slider
  const level5Spell = `Level 5 Spell ${runId}`;
  await app.navigate("Add Spell");
  await page.getByPlaceholder("Spell Name").fill(level5Spell);
  await page.getByPlaceholder("Level").fill("5");
  await page.locator(SELECTORS.description).fill("Level 5 test");
  await page.getByRole("button", { name: "Save Spell" }).click();

  await app.navigate("Library");
  await page.getByPlaceholder("Search spells…").fill("");

  const thumbs = page.locator('[role="slider"]');
  await thumbs.nth(0).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await thumbs.nth(1).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getSpellRow(level5Spell)).toBeVisible();
  await expect(app.getSpellRow(spellName)).not.toBeVisible();

  // Verify saved searches
  await page.getByRole("button", { name: "Save Current Search" }).click();
  const saveName = `Search ${runId}`;
  await page.getByPlaceholder("Name...").fill(saveName);
  await page.keyboard.press("Enter");

  await page.reload();
  await expect(app.getSpellRow(spellName)).toBeVisible();

  // Load saved search
  await page
    .getByRole("combobox")
    .filter({ hasText: "Saved Searches" })
    .selectOption({ label: saveName });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getSpellRow(level5Spell)).toBeVisible();
  await expect(app.getSpellRow(spellName)).not.toBeVisible();

  // Delete saved search
  await page.getByRole("button", { name: "Delete Selected" }).click();

  cleanupDialog();
});
