/**
 * Tauri application lifecycle management for E2E tests.
 * Provides app launch, CDP connection, and cleanup utilities.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, type Page, chromium } from "@playwright/test";
import { BASE_CDP_PORT, TIMEOUTS } from "./constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolves the Tauri binary path based on platform */
export function getTauriBinaryPath(): string {
  const baseDir = path.resolve(__dirname, "../../src-tauri/target");

  if (process.platform === "win32") {
    // Check for target-specific build first
    const targetPath = path.join(baseDir, "x86_64-pc-windows-msvc/debug/spellbook-desktop.exe");
    if (fs.existsSync(targetPath)) return targetPath;
    return path.join(baseDir, "debug/spellbook-desktop.exe");
  }

  if (process.platform === "darwin") {
    return path.join(baseDir, "debug/spellbook-desktop.app/Contents/MacOS/spellbook-desktop");
  }

  return path.join(baseDir, "debug/spellbook-desktop");
}

/** Default binary path */
export const TAURI_BIN = getTauriBinaryPath();

/** Kills any existing Tauri processes (Windows only) */
export async function killExistingProcesses(): Promise<void> {
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/IM", "spellbook-desktop.exe"], { stdio: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Waits for CDP endpoint to become available */
async function waitForCdpReady(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      await browser.close();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`CDP endpoint not ready after ${timeout}ms`);
}

export interface LaunchOptions {
  /** CDP port to use. Defaults to BASE_CDP_PORT */
  cdpPort?: number;
  /** Kill existing processes before launch. Defaults to true */
  killExisting?: boolean;
  /** Timeout for app readiness. Defaults to TIMEOUTS.long */
  timeout?: number;
  /** Pipe stdout/stderr for debugging. Defaults to false */
  debug?: boolean;
}

export interface TauriAppContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  process: ChildProcess;
  cdpPort: number;
}

/**
 * Launches the Tauri app and connects via CDP.
 * Returns browser, context, page, and process for cleanup.
 */
export async function launchTauriApp(options: LaunchOptions = {}): Promise<TauriAppContext> {
  const {
    cdpPort = BASE_CDP_PORT,
    killExisting = true,
    timeout = TIMEOUTS.long,
    debug = false,
  } = options;

  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(`Tauri executable not found at ${TAURI_BIN}. Run 'cargo build' first.`);
  }

  if (killExisting) {
    await killExistingProcesses();
  }

  const appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: debug ? "pipe" : "ignore",
    detached: false,
    shell: false,
  });

  if (debug) {
    appProcess.stdout?.on("data", (data) => console.log(`APP STDOUT: ${data}`));
    appProcess.stderr?.on("data", (data) => console.log(`APP STDERR: ${data}`));
  }

  // Wait for CDP to be ready with polling instead of fixed delay
  await waitForCdpReady(cdpPort, timeout);

  const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  return { browser, context, page, process: appProcess, cdpPort };
}

/** Cleanup function for afterAll hooks */
export function cleanupTauriApp(ctx: TauriAppContext | null): void {
  if (ctx?.process) {
    ctx.process.kill();
  }
}

/** Helper to track files for cleanup */
export function createFileTracker(): {
  track: (path: string) => string;
  cleanup: () => void;
} {
  const files: string[] = [];
  return {
    track: (filePath: string) => {
      files.push(filePath);
      return filePath;
    },
    cleanup: () => {
      for (const filePath of files) {
        try {
          fs.rmSync(filePath, { force: true, recursive: true });
        } catch (error) {
          console.warn(`Failed to remove test artifact ${filePath}:`, error);
        }
      }
    },
  };
}
