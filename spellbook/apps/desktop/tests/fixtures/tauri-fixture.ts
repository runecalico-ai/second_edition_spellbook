/**
 * Tauri application lifecycle management for E2E tests.
 * Provides app launch, CDP connection, and cleanup utilities.
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, type Page, chromium, test } from "@playwright/test";
import { BASE_CDP_PORT, BASE_VITE_PORT, TIMEOUTS } from "./constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLITE_VEC_VERSION = "0.1.6";
const SQLITE_VEC_BASE_URL = `https://github.com/asg017/sqlite-vec/releases/download/v${SQLITE_VEC_VERSION}`;

let globalLaunchCounter = 0;

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

/** Kills processes holding specific ports */
export async function killProcessesOnPorts(ports: number[]): Promise<void> {
  if (process.platform === "win32") {
    for (const port of ports) {
      try {
        const output = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.includes("LISTENING")) {
            const pid = line.trim().split(/\s+/).pop();
            if (pid && pid !== "0") {
              console.log(`Killing process ${pid} holding port ${port}...`);
              execSync(`taskkill /F /T /PID ${pid} 2>nul`, { stdio: "ignore" });
            }
          }
        }
      } catch {
        // Port not in use
      }
    }
  }
}

/** Kills any existing Tauri and WebView2 processes (legacy, use killProcessesOnPorts instead) */
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

    // Kill what is on our specific ports if they were orphaned
    const ports = [BASE_VITE_PORT, BASE_CDP_PORT];
    for (const port of ports) {
      try {
        const output = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.includes("LISTENING")) {
            const pid = line.trim().split(/\s+/).pop();
            if (pid) {
              execSync(`taskkill /F /T /PID ${pid} 2>nul`, { stdio: "ignore" });
            }
          }
        }
      } catch {
        // Port not in use, that's OK
      }
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
      execSync(`curl -s http://127.0.0.1:${port}/`, { stdio: "ignore" });
      console.log(`Server ready on port ${port}`);
      return;
    } catch {
      // Not ready
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
  /** Vite port to use. Defaults to BASE_VITE_PORT */
  vitePort?: number;
  /** Kill existing processes before launch. Defaults to true */
  killExisting?: boolean;
  /** Timeout for app readiness. Defaults to TIMEOUTS.long */
  timeout?: number;
  /** Pipe stdout/stderr for debugging. Defaults to false */
  debug?: boolean;
  /** Playwright worker index for port isolation */
  workerIndex?: number;
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
  const workerIndex = options.workerIndex ?? test.info().workerIndex ?? 0;
  const vitePort = BASE_VITE_PORT;
  const {
    cdpPort = BASE_CDP_PORT,
    killExisting = true,
    timeout = TIMEOUTS.long * 2,
    debug = true,
  } = options;

  if (!fs.existsSync(TAURI_BIN)) {
    throw new Error(`Tauri executable not found at ${TAURI_BIN}. Run 'cargo build' first.`);
  }

  // Ensure sqlite-vec extension is available
  await ensureSqliteVec();

  // Create a temporary data directory for isolation
  const runId = Date.now();
  const dataDir = path.resolve(__dirname, `../tmp/data-w${workerIndex}-${runId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  // Copy sqlite-vec extension to data directory
  copySqliteVecToDataDir(dataDir);

  console.log(`Tauri binary: ${TAURI_BIN}`);
  console.log(`CDP port: ${cdpPort}`);
  console.log(`Data directory: ${dataDir}`);

  if (killExisting) {
    console.log(`Ensuring ports ${vitePort} and ${cdpPort} are free...`);
    await killProcessesOnPorts([vitePort, cdpPort]);
  }

  // Start Vite dev server first (Tauri debug build needs this)
  console.log(`Starting Vite dev server on port ${vitePort}...`);
  const viteProcess = spawn(
    "npx",
    ["vite", "--port", vitePort.toString(), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: path.resolve(__dirname, "../.."),
      stdio: debug ? "pipe" : "ignore",
      shell: true,
      detached: false,
    },
  );

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
    await waitForServer(vitePort, 30000);
    // Add a conservative buffer for the server to settle and the OS to bind
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (e) {
    viteProcess.kill();
    throw new Error(`Vite dev server failed to start on port ${vitePort}: ${e}`);
  }

  console.log("Launching Tauri app...");
  const appProcess = spawn(TAURI_BIN, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      WEBVIEW2_USER_DATA_FOLDER: path.join(dataDir, "webview2"),
      SPELLBOOK_DATA_DIR: dataDir, // Force fresh database
      TAURI_URL: `http://127.0.0.1:${vitePort}`, // Override dev server URL
      TAURI_CONFIG: JSON.stringify({
        build: {
          devUrl: `http://127.0.0.1:${vitePort}`,
        },
      }),
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

  appProcess.on("exit", (code: number | null, signal: string | null) => {
    console.log(`Tauri app (PID: ${appProcess.pid}) exited with code ${code} and signal ${signal}`);
    if (code !== 0 && code !== null) {
      console.log(`Tauri app exited with error code ${code}`);
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
    if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("tauri://")) {
      if (url.includes("chrome-error")) {
        console.log("Detected chrome-error navigation, reloading...");
        await page.reload().catch(() => { });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      console.log(`App loaded at: ${url}`);
      break;
    }
    if (url !== "about:blank") {
      if (url.includes("chrome-error")) {
        console.log("Detected chrome-error navigation, reloading...");
        await page.reload().catch(() => { });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
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
export async function cleanupTauriApp(ctx: TauriAppContext | null): Promise<void> {
  if (ctx?.browser) {
    console.log("Closing Playwright browser...");
    await ctx.browser.close().catch((e) => console.warn(`Error closing browser: ${e}`));
  }

  if (ctx?.process) {
    console.log(`Cleaning up Tauri app (PID: ${ctx.process.pid})...`);
    if (process.platform === "win32") {
      try {
        // Use /T to kill the entire process tree
        execSync(`taskkill /T /F /PID ${ctx.process.pid} 2>nul`, { stdio: "ignore" });
      } catch (e) { }
    } else {
      ctx.process.kill();
    }
  }

  if (ctx?.viteProcess) {
    console.log(`Cleaning up Vite dev server (PID: ${ctx.viteProcess.pid})...`);
    if (process.platform === "win32") {
      try {
        // Use /T to kill the entire process tree (important for npm/vite/esbuild)
        execSync(`taskkill /T /F /PID ${ctx.viteProcess.pid} 2>nul`, { stdio: "ignore" });
      } catch (e) { }
    } else {
      ctx.viteProcess.kill();
    }
  }

  if (ctx?.dataDir) {
    console.log(`Cleaning up data directory: ${ctx.dataDir}`);
    // Wait a bit for file handles to be released by the OS and WebView2
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      if (fs.existsSync(ctx.dataDir)) {
        fs.rmSync(ctx.dataDir, { recursive: true, force: true });
        console.log(`Successfully removed data directory: ${ctx.dataDir}`);
      }
    } catch (e) {
      console.warn(`Failed to cleanup data directory ${ctx.dataDir}: ${e}`);
      // Fallback: try one more time after a longer delay if it's a busy error
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        if (fs.existsSync(ctx.dataDir)) {
          fs.rmSync(ctx.dataDir, { recursive: true, force: true });
          console.log(`Successfully removed data directory on second attempt: ${ctx.dataDir}`);
        }
      } catch (e2) {
        console.warn(`Final attempt to cleanup data directory failed: ${e2}`);
      }
    }
  }
}

/** Ensures sqlite-vec extension is available locally */
async function ensureSqliteVec(): Promise<void> {
  const binDir = path.resolve(__dirname, "../tmp/bin");
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const libName =
    process.platform === "win32"
      ? "vec0.dll"
      : process.platform === "darwin"
        ? "vec0.dylib"
        : "vec0.so";
  const libPath = path.join(binDir, libName);

  if (fs.existsSync(libPath)) return;

  console.log(`sqlite-vec extension missing. Downloading to ${libPath}...`);

  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const arch =
    process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;

  const assetName = `sqlite-vec-${SQLITE_VEC_VERSION}-loadable-${platform}-${arch}.tar.gz`;
  const url = `${SQLITE_VEC_BASE_URL}/${assetName}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tarGzPath = path.join(binDir, assetName);
    fs.writeFileSync(tarGzPath, buffer);

    console.log(`Extracting ${tarGzPath}...`);
    // Use tar command which is available on modern Windows and Unix
    execSync(`tar -xzf "${tarGzPath}" -C "${binDir}"`, { stdio: "ignore" });
    fs.unlinkSync(tarGzPath);
    console.log("sqlite-vec extension ready.");
  } catch (e) {
    console.error(`Failed to ensure sqlite-vec: ${e}`);
    console.warn("Tests will proceed with fallback (blob-backed tables).");
  }
}

/** Copies sqlite-vec extension to the data directory */
function copySqliteVecToDataDir(dataDir: string): void {
  const binDir = path.resolve(__dirname, "../tmp/bin");
  const libName =
    process.platform === "win32"
      ? "vec0.dll"
      : process.platform === "darwin"
        ? "vec0.dylib"
        : "vec0.so";
  const src = path.join(binDir, libName);
  const dest = path.join(dataDir, libName);

  if (fs.existsSync(src)) {
    try {
      fs.copyFileSync(src, dest);
    } catch (e) {
      console.warn(`Failed to copy sqlite-vec to data dir: ${e}`);
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
