import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { TauriAppContext } from "./fixtures/tauri-fixture";
import { cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal, setupDialogHandler } from "./utils/dialog-handler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TIMEOUTS = {
  short: 5000,
  medium: 15000,
  long: 30000,
};

let appContext: TauriAppContext | null = null;

test.describe("Vault Backup and Restore", () => {
  test.beforeAll(async () => {
    appContext = await launchTauriApp();
  });

  test.afterAll(async () => {
    if (appContext) {
      await cleanupTauriApp(appContext);
    }
  });

  test("Backup and Restore Flow", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = Date.now();

    const backupSpellName = `Backup Test Spell ${runId}`;
    const backupPath = path.resolve(__dirname, `tmp/backup-${runId}.zip`);

    // Ensure tmp directory exists
    const tmpDir = path.resolve(__dirname, "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Setup dialog handler
    const cleanupDialogs = setupDialogHandler(page, {
      acceptDelete: true,
    });

    try {
      await test.step("Create a spell to backup", async () => {
        await app.createSpell({
          name: backupSpellName,
          level: "5",
          description: "A spell created for backup testing.",
        });
        await expect(page.getByText(backupSpellName)).toBeVisible();
      });

      await test.step("Perform backup via UI", async () => {
        // Mock window.prompt to return the backup path
        await page.evaluate((backupFilePath: string) => {
          window.prompt = () => backupFilePath;
        }, backupPath);

        await page.getByRole("button", { name: "Backup" }).click();

        // Handle custom modal success alert
        await handleCustomModal(page, "OK");

        expect(fs.existsSync(backupPath)).toBe(true);
      });

      await test.step("Delete the spell", async () => {
        await app.navigate("Library");
        await page.getByText(backupSpellName).click();
        await page.getByRole("button", { name: "Delete" }).click();
        await handleCustomModal(page, "Confirm");
        await app.waitForLibrary();
        await expect(page.getByText(backupSpellName)).not.toBeVisible({ timeout: TIMEOUTS.short });
      });

      await test.step("Restore from backup via UI", async () => {
        // Mock window.prompt
        await page.evaluate((backupFilePath: string) => {
          window.prompt = () => backupFilePath;
        }, backupPath);

        await page.getByRole("button", { name: "Restore" }).click();

        // Handle custom modal confirmation
        await handleCustomModal(page, "Confirm");

        // Handle custom modal success alert
        await handleCustomModal(page, "OK");

        // Wait for reload
        await page.waitForTimeout(2000);
        await page.waitForURL(/\//);
      });

      await test.step("Verify spell is restored", async () => {
        await app.navigate("Library");
        await expect(page.getByText(backupSpellName)).toBeVisible({ timeout: TIMEOUTS.medium });
      });
    } finally {
      cleanupDialogs();
      // Cleanup backup file
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    }
  });
});
