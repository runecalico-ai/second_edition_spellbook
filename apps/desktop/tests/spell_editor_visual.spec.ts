import { spawn, type ChildProcess } from "node:child_process";
import * as net from "node:net";
import {
  expect as browserExpect,
  test as browserTest,
  type Page,
} from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { expect as appExpect, test as appTest } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

type HtmlTheme = "light" | "dark";

const STORYBOOK_READY_STORY_ID = "spelleditor-structuredfieldinput--visual-gallery";
let storybookProcess: ChildProcess | null = null;
let storybookPort: number | null = null;

function getStorybookBaseUrl(): string {
  if (storybookPort === null) {
    throw new Error("Storybook server not initialized.");
  }

  return `http://127.0.0.1:${storybookPort}`;
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to determine an available port for Storybook."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", () => resolve(false));
    });

    if (isOpen) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Storybook on port ${port}`);
}

async function waitForStorybookReady(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const storyUrl =
    `http://127.0.0.1:${port}/iframe.html?id=${STORYBOOK_READY_STORY_ID}&viewMode=story`;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(storyUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling while Storybook finishes booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for Storybook iframe readiness on port ${port}`);
}

async function ensureStorybookServer(): Promise<void> {
  if (storybookProcess && !storybookProcess.killed) {
    return;
  }

  storybookPort = await findAvailablePort();

  storybookProcess =
    process.platform === "win32"
      ? spawn(
          process.env.ComSpec ?? "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            `pnpm storybook --ci --port ${storybookPort} --host 127.0.0.1`,
          ],
          {
            cwd: process.cwd(),
            stdio: "ignore",
            windowsHide: true,
          },
        )
      : spawn(
          "pnpm",
          ["storybook", "--ci", "--port", String(storybookPort), "--host", "127.0.0.1"],
          {
            cwd: process.cwd(),
            stdio: "ignore",
          },
        );

  await waitForPort(storybookPort, TIMEOUTS.long);
  await waitForStorybookReady(storybookPort, TIMEOUTS.long);
}

async function stopStorybookServer(): Promise<void> {
  if (!storybookProcess || storybookProcess.killed) {
    return;
  }

  if (process.platform === "win32") {
    const pid = storybookProcess.pid;
    await new Promise<void>((resolve) => {
      const killer = spawn(process.env.ComSpec ?? "cmd.exe", [
        "/d",
        "/s",
        "/c",
        `taskkill /pid ${pid} /t /f`,
      ], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", () => resolve());
    });
    storybookProcess = null;
    storybookPort = null;
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      storybookProcess?.kill("SIGKILL");
    }, 5000);

    storybookProcess?.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    storybookProcess?.kill("SIGTERM");
  });
  storybookProcess = null;
  storybookPort = null;
}

async function setHtmlTheme(page: Page, theme: HtmlTheme): Promise<void> {
  await page.evaluate((nextTheme) => {
    const root = document.documentElement;
    root.dataset.theme = nextTheme;
    root.classList.toggle("dark", nextTheme === "dark");
  }, theme);

  await appExpect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function hideScrollbars(page: Page): Promise<void> {
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
    area: "20-ft radius",
    savingThrow: "Negates",
    components: "V, S, M",
    materialComponents: "a pinch of sulfur",
  });

  await app.openSpell(spellName);
  await appExpect(app.page.getByRole("heading", { name: "Edit Spell" })).toBeVisible({
    timeout: TIMEOUTS.medium,
  });

  return spellName;
}

async function waitForStoryTheme(page: Page, theme: HtmlTheme): Promise<void> {
  const html = page.locator("html");
  await browserExpect(html).toHaveAttribute("data-theme", theme, {
    timeout: TIMEOUTS.long,
  });
  await browserExpect.poll(async () => {
    return await page.evaluate(() => {
      const root = document.documentElement;
      return JSON.stringify({
        hasDarkClass: root.classList.contains("dark"),
        colorScheme: root.style.colorScheme,
      });
    });
  }).toBe(
    JSON.stringify({
      hasDarkClass: theme === "dark",
      colorScheme: theme,
    }),
  );
}

async function openStructuredFieldStory(page: Page, storyId: string, theme: HtmlTheme) {
  await page.setViewportSize({ width: 1100, height: 1600 });
  await page.goto(`${getStorybookBaseUrl()}/iframe.html?id=${storyId}`);
  await hideScrollbars(page);
  const gallery = page.getByTestId("structured-field-input-visual-gallery");
  await browserExpect(gallery).toBeVisible({ timeout: TIMEOUTS.long });
  await waitForStoryTheme(page, theme);
  return gallery;
}

async function prepareEmptyLibrary(page: Page, app: SpellbookApp, theme: HtmlTheme) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await app.navigate("Library");
  await app.waitForLibrary();
  await setHtmlTheme(page, theme);
  await hideScrollbars(page);

  const emptyState = page.getByTestId("empty-library-state");
  await appExpect(emptyState).toBeVisible({ timeout: TIMEOUTS.medium });
  await appExpect(page.getByTestId("empty-library-create-button")).toBeVisible();
  await appExpect(page.getByTestId("empty-library-import-button")).toBeVisible();
  return emptyState;
}

async function prepareHashCard(page: Page, app: SpellbookApp) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedVisualSpell(app);
  await setHtmlTheme(page, "light");
  await hideScrollbars(page);

  const hashCard = page.getByTestId("spell-detail-hash-card");
  await appExpect(hashCard).toBeVisible({ timeout: TIMEOUTS.medium });
  await hashCard.scrollIntoViewIfNeeded();
  return hashCard;
}

async function prepareSpellEditor(page: Page, app: SpellbookApp, theme: HtmlTheme) {
  await page.setViewportSize({ width: 1440, height: 2200 });
  await page.evaluate(() => {
    window.__SPELLBOOK_E2E_VISUAL_CONTRACT__ = "all-structured";
  });
  await seedVisualSpell(app);
  await setHtmlTheme(page, theme);
  await hideScrollbars(page);

  const editor = page.getByTestId("spell-editor-visual-contract");
  await appExpect(editor).toBeVisible({ timeout: TIMEOUTS.medium });
  await editor.scrollIntoViewIfNeeded();
  return editor;
}

browserTest.describe("StructuredFieldInput visual stories", () => {
  browserTest.beforeAll(async () => {
    await ensureStorybookServer();
  });
  browserTest.afterAll(async () => {
    await stopStorybookServer();
  });

  browserTest("StructuredFieldInput states match light-theme screenshot", async ({ page }) => {
    const gallery = await openStructuredFieldStory(
      page,
      "spelleditor-structuredfieldinput--visual-gallery",
      "light",
    );

    await browserExpect(gallery).toHaveScreenshot("structured-field-input-states-light.png", {
      animations: "disabled",
    });
  });

  browserTest("StructuredFieldInput states match dark-theme screenshot", async ({ page }) => {
    const gallery = await openStructuredFieldStory(
      page,
      "spelleditor-structuredfieldinput--visual-gallery-dark",
      "dark",
    );

    await browserExpect(gallery).toHaveScreenshot("structured-field-input-states-dark.png", {
      animations: "disabled",
    });
  });

});

appTest.describe("Spell editor visual contract", () => {
  appTest.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  appTest.slow();

  appTest("Empty library matches light-theme screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const emptyState = await prepareEmptyLibrary(page, app, "light");

    await appExpect(emptyState).toHaveScreenshot("empty-library-light.png", {
      animations: "disabled",
    });
  });

  appTest("Empty library matches dark-theme screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const emptyState = await prepareEmptyLibrary(page, app, "dark");

    await appExpect(emptyState).toHaveScreenshot("empty-library-dark.png", {
      animations: "disabled",
    });
  });

  appTest("Spell editor structured view matches light-theme screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const editor = await prepareSpellEditor(page, app, "light");

    await appExpect(editor).toHaveScreenshot("spell-editor-structured-light.png", {
      animations: "disabled",
    });
  });

  appTest("Spell editor structured view matches dark-theme screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const editor = await prepareSpellEditor(page, app, "dark");

    await appExpect(editor).toHaveScreenshot("spell-editor-structured-dark.png", {
      animations: "disabled",
    });
  });

  appTest("Collapsed hash display matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const hashCard = await prepareHashCard(page, app);

    await appExpect(page.getByTestId("spell-detail-hash-display")).toContainText("...");
    await appExpect(page.getByTestId("spell-detail-hash-expand")).toHaveText("Expand");
    await appExpect(hashCard).toHaveScreenshot("hash-display-collapsed.png", {
      animations: "disabled",
    });
  });

  appTest("Expanded hash display matches screenshot", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const hashCard = await prepareHashCard(page, app);

    await page.getByTestId("spell-detail-hash-expand").click();
    await appExpect(page.getByTestId("spell-detail-hash-display")).not.toContainText("...");
    await appExpect(page.getByTestId("spell-detail-hash-expand")).toHaveText("Collapse");

    await appExpect(hashCard).toHaveScreenshot("hash-display-expanded.png", {
      animations: "disabled",
    });
  });
});
