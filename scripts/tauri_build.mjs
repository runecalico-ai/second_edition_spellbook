#!/usr/bin/env node
// `pnpm tauri:build` entry point; pnpm runs it from apps/desktop.
// Release builds bundle the frozen sidecar through the release config, so they
// need scripts/prepare_release_bundle.py first. Debug builds run
// services/ml/spellbook_sidecar.py and must not depend on that staging step.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_CONFIG = "src-tauri/tauri.release.conf.json";

export function tauriBuildArgs(cliArgs) {
  const debug = cliArgs.includes("--debug") || cliArgs.includes("-d");
  const releaseConfig = debug ? [] : ["--config", RELEASE_CONFIG];
  return ["build", ...releaseConfig, ...cliArgs];
}

function main() {
  const tauriCli = path.resolve("node_modules", "@tauri-apps", "cli", "tauri.js");
  const result = spawnSync(process.execPath, [tauriCli, ...tauriBuildArgs(process.argv.slice(2))], {
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
