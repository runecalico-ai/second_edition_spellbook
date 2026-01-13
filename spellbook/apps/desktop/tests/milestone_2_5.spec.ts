import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAURI_BIN = (() => {
    if (process.platform === "win32") {
        return path.resolve(__dirname, "../src-tauri/target/debug/spellbook-desktop.exe");
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
    if (!fs.existsSync(TAURI_BIN)) {
        throw new Error(`Tauri executable not found at ${TAURI_BIN}.`);
    }
    // Launch with remote debugging
    appProcess = spawn(TAURI_BIN, [], {
        env: {
            ...process.env,
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
        },
        stdio: "ignore",
        detached: false,
        shell: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 15000));
});

test.afterAll(() => {
    if (appProcess) appProcess.kill();
});

test("Milestone 2.5: Advanced Picker & Printing", async () => {
    const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    const runId = Date.now();
    const charName = `M2.5 Char ${runId}`;
    const spell1 = `M2.5 Spell A ${runId}`;
    const spell2 = `M2.5 Spell B ${runId}`;

    // 1. Setup: Create test spells and character
    // Add Spell A (Evocation, Level 2)
    await page.getByRole("link", { name: "Add Spell" }).click();
    await page.getByPlaceholder("Spell Name").fill(spell1);
    await page.getByPlaceholder("Level").fill("2");
    await page.getByLabel("School").fill("Evocation");
    await page.locator("textarea#spell-description").fill("Description A");
    await page.getByRole("button", { name: "Save Spell" }).click();

    // Add Spell B (Abjuration, Level 3)
    await page.getByRole("link", { name: "Add Spell" }).click();
    await page.getByPlaceholder("Spell Name").fill(spell2);
    await page.getByPlaceholder("Level").fill("3");
    await page.getByLabel("School").fill("Abjuration");
    await page.locator("textarea#spell-description").fill("Description B");
    await page.getByRole("button", { name: "Save Spell" }).click();

    // Create Character
    await page.getByRole("link", { name: "Characters" }).click();
    await page.getByPlaceholder("New Name").fill(charName);
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: charName }).click();

    // 2. Advanced Picker Filtering
    await page.getByRole("button", { name: "Add Spells" }).click();

    // Filter by School: Evocation
    const schoolSelect = page.locator("select").first();
    await schoolSelect.selectOption("Evocation");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("row", { name: spell1 })).toBeVisible();
    await expect(page.getByRole("row", { name: spell2 })).not.toBeVisible();

    // Filter by Level: 3
    await schoolSelect.selectOption([]); // Clear school
    const levelMin = page.locator("select").nth(1);
    await levelMin.selectOption("3");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("row", { name: spell2 })).toBeVisible();
    await expect(page.getByRole("row", { name: spell1 })).not.toBeVisible();

    // Add Spell B to spellbook
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    // 3. Printing Spellbook
    // Select Page Size: A4
    const pageSizeSelect = page.locator("select").first();
    await pageSizeSelect.selectOption("a4");

    await page.getByRole("button", { name: "Print Compact" }).click();
    await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Print Stat-block" }).click();
    await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: 15000 });

    // 4. Printing Single Spell
    await page.getByRole("link", { name: "Spellbook Builder" }).click(); // back to characters
    await page.getByRole("link", { name: "Library" }).click();
    await page.getByText(spell1).click();

    const editorPageSize = page.locator("select").first();
    await editorPageSize.selectOption("letter");
    await page.getByRole("button", { name: "Print Stat-block" }).click();
    await expect(page.getByText(/Print ready:/)).toBeVisible({ timeout: 15000 });

    await browser.close();
});
