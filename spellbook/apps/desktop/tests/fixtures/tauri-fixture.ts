/**
 * Tauri application lifecycle management for E2E tests.
 * Provides app launch, CDP connection, and cleanup utilities.
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
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

/** Kills any existing Tauri and WebView2 processes (Windows only) */
export async function killExistingProcesses(): Promise<void> {
  if (process.platform === "win32") {
    // Kill any existing spellbook processes
    try {
      execSync("taskkill /F /IM spellbook-desktop.exe 2>nul", { stdio: "ignore" });
    } catch {
      // Process may not exist, that's OK
    }

    // Kill any msedgewebview2 processes that might be holding CDP ports
    try {
      execSync("taskkill /F /IM msedgewebview2.exe 2>nul", { stdio: "ignore" });
    } catch {
      // Process may not exist, that's OK
    }

    // Kill whatever is on port 5173 (likely orphaned Vite)
    try {
      const output = execSync("netstat -ano | findstr :5173").toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.includes("LISTENING")) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid) {
            execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: "ignore" });
          }
        }
      }
    } catch {
      // Process may not exist, that's OK
    }

    // Wait for processes to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

/** Waits for a server to be ready on a given port */
async function waitForServer(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  console.log(`Waiting for server on port ${port}...`);

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok || response.status === 200 || response.status === 304) {
        console.log(`Server ready on port ${port}`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server not ready on port ${port} after ${timeout}ms`);
}

/** Waits for CDP endpoint to become available */
async function waitForCdpReady(port: number, timeout: number): Promise<void> {
  const start = Date.now();
  let lastError: Error | null = null;

  console.log(`Waiting for CDP endpoint on port ${port}...`);

  while (Date.now() - start < timeout) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 5000,
      });
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        const pages = contexts[0].pages();
        console.log(`CDP connected! Found ${contexts.length} context(s), ${pages.length} page(s)`);
        await browser.close();
        return;
      }
      await browser.close();
      console.log("CDP connected but no contexts yet, retrying...");
    } catch (e) {
      lastError = e as Error;
      // Only log every 5 seconds to avoid spam
      if ((Date.now() - start) % 5000 < 500) {
        console.log(`CDP not ready yet (${Math.round((Date.now() - start) / 1000)}s)`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`CDP endpoint not ready after ${timeout}ms. Last error: ${lastError?.message}`);
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
  viteProcess?: ChildProcess;
  dataDir: string;
}

/**
 * Launches the Tauri app and connects via CDP.
 * Returns browser, context, page, and process for cleanup.
 */
export async function launchTauriApp(options: LaunchOptions = {}): Promise<TauriAppContext> {
  const {
    cdpPort = BASE_CDP_PORT,
    killExisting = true,
    timeout = TIMEOUTS.long * 2, // Double the timeout for CDP connection
    debug = true, // Enable debug by default for troubleshooting
  } = options;

  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(`Tauri executable not found at ${TAURI_BIN}. Run 'cargo build' first.`);
  }

  // Create a temporary data directory for isolation
  const runId = Date.now();
  const dataDir = path.resolve(__dirname, `../tmp/data-${runId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  console.log(`Tauri binary: ${TAURI_BIN}`);
  console.log(`CDP port: ${cdpPort}`);
  console.log(`Data directory: ${dataDir}`);

  if (killExisting) {
    console.log("Killing existing processes...");
    await killExistingProcesses();
  }

  // Start Vite dev server first (Tauri debug build needs this)
  console.log("Starting Vite dev server...");
  const viteProcess = spawn("npm", ["run", "dev"], {
    cwd: path.resolve(__dirname, "../.."),
    stdio: debug ? "pipe" : "ignore",
    shell: true,
    detached: false,
  });

  if (debug) {
    viteProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes("hmr update")) {
        console.log(`VITE: ${msg}`);
      }
    });
    viteProcess.stderr?.on("data", (data: Buffer) =>
      console.log(`VITE ERR: ${data.toString().trim()}`),
    );
  }

  // Wait for Vite to be ready
  try {
    await waitForServer(5173, 30000);
  } catch (e) {
    viteProcess.kill();
    throw new Error(`Vite dev server failed to start: ${e}`);
  }

  console.log("Launching Tauri app...");
  const appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      SPELLBOOK_DATA_DIR: dataDir, // Force fresh database
    },
    stdio: debug ? "pipe" : "ignore",
    detached: false,
    shell: false,
  });

  if (debug) {
    appProcess.stdout?.on("data", (data: Buffer) => console.log(`APP: ${data.toString().trim()}`));
    appProcess.stderr?.on("data", (data: Buffer) =>
      console.log(`APP ERR: ${data.toString().trim()}`),
    );
  }

  appProcess.on("error", (err: Error) => {
    console.error("Failed to spawn Tauri app:", err);
  });

  appProcess.on("exit", (code: number | null) => {
    if (code !== 0 && code !== null) {
      console.log(`Tauri app exited with code ${code}`);
    }
  });

  // Wait for CDP to be ready with polling
  await waitForCdpReady(cdpPort, timeout);

  console.log("Connecting to CDP...");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error("No browser contexts available after CDP connection");
  }

  const context = contexts[0];
  const pages = context.pages();

  if (pages.length === 0) {
    throw new Error("No pages available in browser context");
  }

  const page = pages[0];

  // Wait for the page to load the actual app (not about:blank)
  console.log("Waiting for app to load...");
  const maxWaitTime = 30000;
  const startWait = Date.now();

  while (Date.now() - startWait < maxWaitTime) {
    const url = page.url();
    if (url.includes("localhost") || url.includes("tauri://")) {
      console.log(`App loaded at: ${url}`);
      break;
    }
    if (url !== "about:blank") {
      console.log(`Page navigated to: ${url}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Additional wait for UI to be ready
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  } catch {
    console.log("DOMContentLoaded timeout - continuing anyway");
  }

  // Wait for the page to be in a ready state
  const finalUrl = page.url();
  const title = await page.title();
  console.log(`Connected to page: "${title}" at ${finalUrl}`);

  // Verify we're on the app page
  if (finalUrl === "about:blank") {
    console.warn("Warning: Page is still about:blank - app may not have loaded properly");
  }

  return { browser, context, page, process: appProcess, cdpPort, viteProcess, dataDir };
}

/** Cleanup function for afterAll hooks */
export function cleanupTauriApp(ctx: TauriAppContext | null): void {
  if (ctx?.process) {
    console.log("Cleaning up Tauri app...");
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /T /F /PID ${ctx.process.pid} 2>nul`, { stdio: "ignore" });
      } catch (e) {}
    } else {
      ctx.process.kill();
    }
  }
  if (ctx?.viteProcess) {
    console.log("Cleaning up Vite dev server...");
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /T /F /PID ${ctx.viteProcess.pid} 2>nul`, { stdio: "ignore" });
      } catch (e) {}
    } else {
      ctx.viteProcess.kill();
    }
  }
  if (ctx?.dataDir) {
    console.log(`Cleaning up data directory: ${ctx.dataDir}`);
    try {
      fs.rmSync(ctx.dataDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Failed to cleanup data directory: ${e}`);
    }
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
