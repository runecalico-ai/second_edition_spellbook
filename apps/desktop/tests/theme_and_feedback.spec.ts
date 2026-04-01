import type { Locator, Page } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

async function waitForResolvedTheme(page: Page, expectedTheme: "light" | "dark") {
  await page.waitForFunction(
    (theme) => document.documentElement.dataset.theme === theme,
    expectedTheme,
    { timeout: TIMEOUTS.medium },
  );

  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
}

async function openSettings(page: Page) {
  await page.getByTestId("settings-gear-button").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });
}

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function parseRgbColor(color: string): RgbColor {
  const match = color.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) {
    throw new Error(`Unable to parse RGB color: ${color}`);
  }

  return {
    r: Number(match[0]),
    g: Number(match[1]),
    b: Number(match[2]),
  };
}

function toLinearRgb(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = parseRgbColor(foreground);
  const bg = parseRgbColor(background);

  const fgLuminance =
    0.2126 * toLinearRgb(fg.r) + 0.7152 * toLinearRgb(fg.g) + 0.0722 * toLinearRgb(fg.b);
  const bgLuminance =
    0.2126 * toLinearRgb(bg.r) + 0.7152 * toLinearRgb(bg.g) + 0.0722 * toLinearRgb(bg.b);

  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function getTextColor(locator: Locator) {
  return locator.evaluate((el) => {
    const styles = getComputedStyle(el);
    return styles.color;
  });
}

async function getSurfaceBackground(locator: Locator) {
  return locator.evaluate((el) => {
    let backgroundNode: HTMLElement | null = el as HTMLElement;

    while (backgroundNode) {
      const styles = getComputedStyle(backgroundNode);
      if (styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)") {
        return styles.backgroundColor;
      }

      backgroundNode = backgroundNode.parentElement;
    }

    return "";
  });
}

async function expectReadableContrast(
  foregroundLocator: Locator,
  surfaceLocator: Locator,
  minimumContrast = 4.5,
) {
  await expect(foregroundLocator).toBeVisible({ timeout: TIMEOUTS.medium });
  await expect(surfaceLocator).toBeVisible({ timeout: TIMEOUTS.medium });

  const color = await getTextColor(foregroundLocator);
  const backgroundColor = await getSurfaceBackground(surfaceLocator);
  expect(backgroundColor).not.toBe("");
  expect(color).not.toBe(backgroundColor);
  expect(contrastRatio(color, backgroundColor)).toBeGreaterThanOrEqual(minimumContrast);
}

async function expandStructuredEditorField(
  page: Page,
  field: "range" | "components",
  visibleTestId: string,
) {
  await page.getByTestId(`detail-${field}-expand`).click();

  const loading = page.getByTestId(`detail-${field}-loading`);
  if (await loading.count()) {
    await expect(loading).not.toBeVisible({ timeout: TIMEOUTS.medium });
  }

  await expect(page.getByTestId(visibleTestId)).toBeVisible({ timeout: TIMEOUTS.medium });
}

test.describe("theme and feedback foundations", () => {
  test("opens settings, applies explicit themes immediately, and preserves them after reload", async ({
    appContext,
  }) => {
    const { page } = appContext;

    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      window.localStorage.removeItem("spellbook-theme");
    });
    await page.reload();

    await openSettings(page);

    const themeSelect = page.getByTestId("settings-theme-select");
    const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
    const themeLiveRegion = page.getByTestId("theme-announcement-live-region");

    // Step 4.5: Verify the live region has the correct aria-live contract
    await expect(themeLiveRegion).toHaveAttribute("aria-live", "polite");

    await expect(followSystemCheckbox).toBeChecked();
    await followSystemCheckbox.uncheck();
    await expect(followSystemCheckbox).not.toBeChecked();
    await expect(themeSelect).toBeEnabled();
    await themeSelect.selectOption("dark");

    await waitForResolvedTheme(page, "dark");
    // Note: sr-only elements have a 1×1 px layout box (not display:none/visibility:hidden),
    // so Playwright's toBeHidden() is unreliable here. Visual hiding is verified in App.test.tsx
    // (checks for the "sr-only" CSS class). The assertion below verifies AT content only.
    await expect(themeLiveRegion).toHaveText("Dark mode");
    await expect(page.getByTestId("toast-notification-success")).toHaveCount(0);
    await expect(page.getByTestId("toast-notification-warning")).toHaveCount(0);
    await expect(page.getByTestId("toast-notification-error")).toHaveCount(0);

    await page.reload();
    await openSettings(page);

    await expect(page.getByTestId("settings-theme-select")).toHaveValue("dark");
    await waitForResolvedTheme(page, "dark");
  });

  test("structured spell editor surfaces stay legible when switching from light to dark mode", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const spellName = `Structured Theme Spell ${Date.now()}`;

    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      window.localStorage.removeItem("spellbook-theme");
    });
    await page.reload();
    await waitForResolvedTheme(page, "light");

    await app.createSpell({
      name: spellName,
      level: "1",
      description: "Theme coverage spell.",
      school: "Evocation",
      classes: "Wizard",
      range: "30 ft",
      components: "V, S, M",
      materialComponents: "bat fur",
    });

    await app.openSpell(spellName);

    await test.step("Light mode surfaces stay readable while expanded", async () => {
      await expandStructuredEditorField(page, "range", "range-kind-select");

      const structuredField = page.getByTestId("structured-field-input");
      const rangePreview = structuredField.getByTestId("range-text-preview");
      const rangeKindSelect = structuredField.getByTestId("range-kind-select");
      await expect(rangePreview).toHaveText(/30 ft/i);

      await expectReadableContrast(rangePreview, structuredField);
      await expectReadableContrast(rangeKindSelect, structuredField, 3);

      await expandStructuredEditorField(page, "components", "component-checkboxes");

      const componentSurface = page.getByTestId("component-checkboxes");
      const componentPreview = componentSurface.getByTestId("component-text-preview");
      const materialSubform = componentSurface.getByTestId("material-subform");
      const materialNameInput = componentSurface.getByTestId("material-component-name").first();
      await expect(materialSubform).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(componentPreview).toHaveText(/V,\s*S,\s*M/i);

      await expectReadableContrast(componentPreview, componentSurface);
      await expectReadableContrast(materialNameInput, materialSubform, 3);
    });

    await test.step("Switch to dark mode through settings", async () => {
      await openSettings(page);
      const themeSelect = page.getByTestId("settings-theme-select");
      const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
      await followSystemCheckbox.uncheck();
      await themeSelect.selectOption("dark");
      await waitForResolvedTheme(page, "dark");
    });

    await test.step("Dark mode surfaces remain readable after reopening the editor", async () => {
      await app.openSpell(spellName);
      await expandStructuredEditorField(page, "range", "range-kind-select");

      const darkStructuredField = page.getByTestId("structured-field-input");
      const darkRangePreview = darkStructuredField.getByTestId("range-text-preview");
      const darkRangeKindSelect = darkStructuredField.getByTestId("range-kind-select");
      await expect(darkRangePreview).toHaveText(/30 ft/i);

      await expectReadableContrast(darkRangePreview, darkStructuredField);
      await expectReadableContrast(darkRangeKindSelect, darkStructuredField, 3);

      await expandStructuredEditorField(page, "components", "component-checkboxes");

      const darkComponentSurface = page.getByTestId("component-checkboxes");
      const darkComponentPreview = darkComponentSurface.getByTestId("component-text-preview");
      const darkMaterialSubform = darkComponentSurface.getByTestId("material-subform");
      const darkMaterialInput = darkComponentSurface.getByTestId("material-component-name").first();
      await expect(darkMaterialSubform).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(darkComponentPreview).toHaveText(/V,\s*S,\s*M/i);

      await expectReadableContrast(darkComponentPreview, darkComponentSurface);
      await expectReadableContrast(darkMaterialInput, darkMaterialSubform, 3);
    });
  });

  test("announces System mode when re-enabling follow-system after an explicit theme", async ({
    appContext,
  }) => {
    const { page } = appContext;

    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      window.localStorage.removeItem("spellbook-theme");
    });
    await page.reload();

    await openSettings(page);

    const themeSelect = page.getByTestId("settings-theme-select");
    const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
    const themeLiveRegion = page.getByTestId("theme-announcement-live-region");

    await followSystemCheckbox.uncheck();
    await themeSelect.selectOption("dark");
    await waitForResolvedTheme(page, "dark");

    await followSystemCheckbox.check();
    await expect(followSystemCheckbox).toBeChecked();
    await expect(themeSelect).toBeDisabled();
    // Note: sr-only elements have a 1×1 px layout box (not display:none/visibility:hidden),
    // so Playwright's toBeHidden() is unreliable here. Visual hiding is verified in App.test.tsx.
    await expect(themeLiveRegion).toHaveText("System mode");
  });

  test("follows the current system preference on first load and reacts to in-session changes", async ({
    appContext,
  }) => {
    const { page } = appContext;

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      window.localStorage.removeItem("spellbook-theme");
    });
    await page.reload();

    await waitForResolvedTheme(page, "dark");
    await openSettings(page);

    const themeSelect = page.getByTestId("settings-theme-select");
    const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
    const themeLiveRegion = page.getByTestId("theme-announcement-live-region");

    await expect(followSystemCheckbox).toBeChecked();
    await expect(themeSelect).toBeDisabled();
    await expect(themeSelect).toHaveValue("dark");
    // On a cold start in system mode the M-001 guard in App.tsx prevents an announcement
    // because themeMode never transitioned — previousThemeMode.current is initialised to
    // the current themeMode ("system"), so priorMode === themeMode → skip.
    // No live-region text is produced until the user (or OS) triggers a real transition.
    await expect(themeLiveRegion).toHaveText("");

    await page.emulateMedia({ colorScheme: "light" });
    await waitForResolvedTheme(page, "light");
    await expect(themeSelect).toHaveValue("light");
    await expect(themeLiveRegion).toHaveText("Light mode");

    await page.emulateMedia({ colorScheme: "dark" });
    await waitForResolvedTheme(page, "dark");
    await expect(themeSelect).toHaveValue("dark");
    // Note: sr-only elements have a 1×1 px layout box (not display:none/visibility:hidden),
    // so Playwright's toBeHidden() is unreliable here. Visual hiding is verified in App.test.tsx
    // (checks for the "sr-only" CSS class). The assertion below verifies AT content only.
    await expect(themeLiveRegion).toHaveText("Dark mode");
  });

  test("exposes the shared notification live region when a notification-producing flow is triggered", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const spellName = `Theme Toast Spell ${Date.now()}`;

    await app.createSpell({
      name: spellName,
      level: "1",
      description: "Description for notification viewport coverage.",
      school: "Evocation",
      classes: "Wizard",
    });
    await app.openSpell(spellName);
    await page.getByTestId("spell-detail-hash-copy").click();

    const viewport = page.getByTestId("notification-viewport");
    const matchingSuccessToasts = viewport
      .getByTestId("toast-notification-success")
      .filter({ hasText: "Hash copied to clipboard." });
    const successToast = matchingSuccessToasts.last();

    await expect(viewport.evaluate((element) => element.tagName)).resolves.toBe("OUTPUT");
    await expect(viewport).toHaveAttribute("aria-live", "polite");
    await expect(matchingSuccessToasts).toHaveCount(1);
    await expect(successToast).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(successToast).toContainText("Hash copied to clipboard.");
    // Wait for the toast to auto-dismiss (default 3000ms + buffer)
    await expect(successToast).toBeHidden({ timeout: 6000 });

    // Step 4.10: Hash copy success uses toast/live-region path — no dialog should open for this routine flow
    await app.expectNoBlockingDialog();
  });

  test("explicit persisted theme preference is applied to the document root before first user interaction on a warm reload", async ({
    appContext,
  }) => {
    const { page } = appContext;

    await test.step("Seed explicit dark preference and reload", async () => {
      await page.evaluate(() => {
        window.localStorage.setItem("spellbook-theme", "dark");
      });
      await page.reload();
    });

    await test.step("Dark preference is applied before any user interaction", async () => {
      // preHydrationTheme.ts applies the theme class before React mounts,
      // so document.documentElement.dataset.theme should equal "dark" immediately.
      await waitForResolvedTheme(page, "dark");
    });

    await test.step("Seed explicit light preference and reload", async () => {
      await page.evaluate(() => {
        window.localStorage.setItem("spellbook-theme", "light");
      });
      await page.reload();
    });

    await test.step("Light preference is applied before any user interaction", async () => {
      await waitForResolvedTheme(page, "light");
    });
  });
});
