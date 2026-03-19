import type { Page } from "@playwright/test";
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

    await expect(followSystemCheckbox).toBeChecked();
    await followSystemCheckbox.uncheck();
    await expect(followSystemCheckbox).not.toBeChecked();
    await expect(themeSelect).toBeEnabled();
    await themeSelect.selectOption("dark");

    await waitForResolvedTheme(page, "dark");
    await expect(themeLiveRegion).toHaveText("Dark mode");
    await expect(page.getByTestId("toast-notification-success")).toHaveCount(0);
    await expect(page.getByTestId("toast-notification-warning")).toHaveCount(0);
    await expect(page.getByTestId("toast-notification-error")).toHaveCount(0);

    await page.reload();
    await openSettings(page);

    await expect(page.getByTestId("settings-theme-select")).toHaveValue("dark");
    await waitForResolvedTheme(page, "dark");
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
    await expect(themeLiveRegion).toHaveText("System mode");

    await page.emulateMedia({ colorScheme: "light" });
    await waitForResolvedTheme(page, "light");
    await expect(themeSelect).toHaveValue("light");
    await expect(themeLiveRegion).toHaveText("Light mode");

    await page.emulateMedia({ colorScheme: "dark" });
    await waitForResolvedTheme(page, "dark");
    await expect(themeSelect).toHaveValue("dark");
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
    const successToast = page.getByTestId("toast-notification-success");

    await expect(
      viewport.evaluate((element) => element.tagName),
    ).resolves.toBe("OUTPUT");
    await expect(viewport).toHaveAttribute("aria-live", "polite");
    await expect(successToast).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(successToast).toContainText("Hash copied to clipboard.");
  });
});