import type { Page } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

type HtmlTheme = "light" | "dark";

async function setHtmlTheme(page: Page, theme: HtmlTheme): Promise<void> {
  await page.evaluate((nextTheme) => {
    const root = document.documentElement;
    root.dataset.theme = nextTheme;
    root.classList.toggle("dark", nextTheme === "dark");
  }, theme);

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function seedVisualSpell(app: SpellbookApp): Promise<string> {
  const spellName = "Visual Spec Spell";

  await app.createSpell({
    name: spellName,
    level: "3",
    description: "Visual regression spell for structured editor screenshots.",
    school: "Evocation",
    classes: "Wizard",
    range: "30 ft",
    duration: "1 round/level",
    castingTime: "1 segment",
    components: "V, S, M",
    materialComponents: "a pinch of sulfur",
  });

  await app.openSpell(spellName);
  await expect(app.page.getByRole("heading", { name: "Edit Spell" })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });

  return spellName;
}

async function expandStructuredField(
  page: Page,
  field: "range" | "duration" | "casting-time",
) {
  await page.getByTestId(`detail-${field}-expand`).click();

  const loading = page.getByTestId(`detail-${field}-loading`);
  if (await loading.count()) {
    await expect(loading).not.toBeVisible({ timeout: TIMEOUTS.medium });
  }

  const childByField = {
    range: "range-text-preview",
    duration: "duration-text-preview",
    "casting-time": "casting-time-text-preview",
  } as const;

  await expect(page.getByTestId(childByField[field])).toBeVisible({ timeout: TIMEOUTS.medium });
}

async function expandComponents(page: Page) {
  await page.getByTestId("detail-components-expand").click();
  await expect(page.getByTestId("component-checkboxes")).toBeVisible({ timeout: TIMEOUTS.medium });
}

async function openExpandedVisualSpell(page: Page, app: SpellbookApp): Promise<void> {
  await seedVisualSpell(app);
}

async function prepareFullEditorScreenshot(page: Page, app: SpellbookApp, theme: HtmlTheme) {
  await page.setViewportSize({ width: 1440, height: 2200 });
  await openExpandedVisualSpell(page, app);
  await expandStructuredField(page, "range");
  await expandStructuredField(page, "duration");
  await expandStructuredField(page, "casting-time");
  await expandComponents(page);
  await setHtmlTheme(page, theme);
  await page.addStyleTag({
    content: `
      html, body {
        scrollbar-width: none !important;
      }

      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        display: none !important;
      }
    `,
  });
  await expect(page.getByRole("heading", { name: "Edit Spell" })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });
  await expect(page.getByTestId("component-text-preview")).toHaveText(/V,\s*S,\s*M/i);
}

test.describe("Spell editor visual contract", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test("StructuredFieldInput range state matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await openExpandedVisualSpell(page, app);
    await expandStructuredField(page, "range");

    const rangeSection = page.locator('section[aria-label="Structured Range"]');
    await expect(rangeSection).toBeVisible({ timeout: TIMEOUTS.medium });
    await rangeSection.scrollIntoViewIfNeeded();

    await expect(rangeSection).toHaveScreenshot("spell-editor-structured-range.png", {
      animations: "disabled",
    });
  });

  test("StructuredFieldInput duration state matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await openExpandedVisualSpell(page, app);
    await expandStructuredField(page, "duration");

    const durationSection = page.locator('section[aria-label="Structured Duration"]');
    await expect(durationSection).toBeVisible({ timeout: TIMEOUTS.medium });
    await durationSection.scrollIntoViewIfNeeded();

    await expect(durationSection).toHaveScreenshot("spell-editor-structured-duration.png", {
      animations: "disabled",
    });
  });

  test("StructuredFieldInput casting time state matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await openExpandedVisualSpell(page, app);
    await expandStructuredField(page, "casting-time");

    const castingTimeSection = page.locator('section[aria-label="Structured Casting Time"]');
    await expect(castingTimeSection).toBeVisible({ timeout: TIMEOUTS.medium });
    await castingTimeSection.scrollIntoViewIfNeeded();

    await expect(castingTimeSection).toHaveScreenshot("spell-editor-structured-casting-time.png", {
      animations: "disabled",
    });
  });

  test("full spell editor in light mode matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    await prepareFullEditorScreenshot(page, app, "light");

    await expect(page).toHaveScreenshot("spell-editor-light.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("full spell editor in dark mode matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    await prepareFullEditorScreenshot(page, app, "dark");

    await expect(page).toHaveScreenshot("spell-editor-dark.png", {
      animations: "disabled",
      fullPage: true,
    });
  });
});
