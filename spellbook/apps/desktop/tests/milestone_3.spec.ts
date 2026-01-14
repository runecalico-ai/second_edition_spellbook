import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type Page, chromium, expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAURI_BIN = (() => {
  const defaultPath = path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop.exe");
  const targetPath = path.resolve(
    __dirname,
    "../src-tauri/target/x86_64-pc-windows-msvc/debug/spellbook-desktop.exe",
  );

  if (process.platform === "win32") {
    if (fs.existsSync(targetPath)) return targetPath;
    return defaultPath;
  }
  if (process.platform === "darwin") {
    return path.resolve(
      __dirname,
      "../src-tauri/target/debug/spellbook-desktop.app/Contents/MacOS/spellbook-desktop",
    );
  }
  return path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop");
})();

let appProcess: ChildProcess | null = null;
const cdpPort = 9222;

test.beforeAll(async () => {
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/IM", "spellbook-desktop.exe"], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(`Tauri executable not found at ${TAURI_BIN}.`);
  }
  appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: "pipe",
    detached: false,
    shell: false,
  });

  appProcess.stdout?.on("data", (data) => console.log(`APP STDOUT: ${data}`));
  appProcess.stderr?.on("data", (data) => console.log(`APP STDERR: ${data}`));

  await new Promise((resolve) => setTimeout(resolve, 30000));
});

test.afterAll(() => {
  if (appProcess) appProcess.kill();
});

test.slow();

test("Milestone 3: Robust Search & Saved Searches", async () => {
  console.log("Connecting to browser...");
  let browser: Browser;
  for (let i = 0; i < 10; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      break;
    } catch (e) {
      console.log(`Connection attempt ${i + 1} failed, retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!browser) throw new Error("Could not connect to browser");

  const context = browser.contexts()[0];
  let page = context.pages()[0];

  if (!page || page.url().startsWith("chrome-error")) {
    console.log("Waiting for a valid page...");
    if (page) {
      await page.reload().catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (context.pages().length > 1) {
      page = context.pages().find((p) => !p.url().startsWith("chrome-error")) || page;
    }
  }

  console.log(`Using page: ${page.url()}`);

  page.on("console", (msg) => {
    console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`);
  });

  page.on("dialog", (dialog) => {
    console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });

  console.log("Reloading page to catch errors...");
  await page.reload();

  console.log("Waiting for app to be ready...");
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.getByRole("link", { name: "Library" }).waitFor({ state: "visible", timeout: 30000 });
  } catch (e) {
    console.log("ERROR: Library link not found within 30s");
    const bodyContent = await page.content();
    console.log("PAGE CONTENT PREVIEW:", bodyContent.substring(0, 1000));
    throw e;
  }

  const runId = Date.now();
  const authorName = `Author ${runId}`;
  const spellName = `M3 Search Spell ${runId}`;

  console.log(`Current URL: ${page.url()}`);
  const links = await page.getByRole("link").allTextContents();
  console.log(`Available links: ${links.join(", ")}`);

  console.log("Clicking Add Spell link...");
  const addSpellLink = page.getByRole("link", { name: "Add Spell" });
  await addSpellLink.click();

  console.log("Waiting for navigation to edit page...");
  await expect(page).toHaveURL(/\/edit\/new/);

  console.log("Filling Spell Name...");
  await page.getByPlaceholder("Spell Name").fill(spellName);

  console.log("Filling Level...");
  await page.getByPlaceholder("Level").fill("1");

  console.log("Filling Author...");
  await page.getByLabel("Author").fill(authorName);

  console.log("Filling Description...");
  await page.locator("textarea#spell-description").fill("Testing author search");

  console.log("Clicking Save Spell button...");
  await page.getByRole("button", { name: "Save Spell" }).click();

  console.log("Waiting for navigation back to library...");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible({ timeout: 10000 });

  console.log("Verifying author search...");
  await page.getByRole("link", { name: "Library" }).click();
  await page.getByPlaceholder("Search spells…").fill(authorName);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row", { name: spellName })).toBeVisible();

  console.log("Verifying level slider...");
  const level5Spell = `Level 5 Spell ${runId}`;
  await page.getByRole("link", { name: "Add Spell" }).click();
  await page.getByPlaceholder("Spell Name").fill(level5Spell);
  await page.getByPlaceholder("Level").fill("5");
  await page.locator("textarea#spell-description").fill("Level 5 test");
  await page.getByRole("button", { name: "Save Spell" }).click();

  await page.getByRole("link", { name: "Library" }).click();
  await page.getByPlaceholder("Search spells…").fill("");

  const thumbs = page.locator('[role="slider"]');
  await thumbs.nth(0).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await thumbs.nth(1).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row", { name: level5Spell })).toBeVisible();
  await expect(page.getByRole("row", { name: spellName })).not.toBeVisible();

  console.log("Verifying saved searches...");
  await page.getByRole("button", { name: "Save Current Search" }).click();
  const saveName = `Search ${runId}`;
  await page.getByPlaceholder("Name...").fill(saveName);
  await page.keyboard.press("Enter");

  await page.reload();
  await expect(page.getByRole("row", { name: spellName })).toBeVisible();

  console.log("Loading saved search...");
  await page
    .getByRole("combobox")
    .filter({ hasText: "Saved Searches" })
    .selectOption({ label: saveName });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("row", { name: level5Spell })).toBeVisible();
  await expect(page.getByRole("row", { name: spellName })).not.toBeVisible();

  console.log("Deleting saved search...");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Selected" }).click();

  console.log("Test finished.");
  await browser.close();
});
