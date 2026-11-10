import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RELEASE_CONFIG, isMainModule, tauriBuildArgs } from "./tauri_build.mjs";

const wrapperPath = fileURLToPath(new URL("./tauri_build.mjs", import.meta.url));
const wrapperUrl = pathToFileURL(wrapperPath).href;
const desktopDir = fileURLToPath(new URL("../apps/desktop/", import.meta.url));

test("pnpm tauri:build runs the wrapper from apps/desktop", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  assert.equal(pkg.scripts["tauri:build"], "node ../../scripts/tauri_build.mjs");
  assert.equal(path.resolve(desktopDir, "../../scripts/tauri_build.mjs"), wrapperPath);
});

test("the release config exists relative to apps/desktop", () => {
  assert.equal(fs.existsSync(path.join(desktopDir, RELEASE_CONFIG)), true);
});

test("release builds add the release config", () => {
  assert.deepEqual(tauriBuildArgs([]), ["build", "--config", RELEASE_CONFIG]);
});

test("--debug builds skip the release config", () => {
  assert.deepEqual(tauriBuildArgs(["--debug"]), ["build", "--debug"]);
});

test("-d is treated as --debug", () => {
  assert.deepEqual(tauriBuildArgs(["-d"]), ["build", "-d"]);
});

test("other arguments pass through after the release config", () => {
  assert.deepEqual(tauriBuildArgs(["--bundles", "nsis"]), [
    "build",
    "--config",
    RELEASE_CONFIG,
    "--bundles",
    "nsis",
  ]);
});

test("the wrapper is the main module when run by its own path", () => {
  assert.equal(isMainModule(wrapperUrl, wrapperPath), true);
});

test("the wrapper is not the main module for another script or no script", () => {
  assert.equal(isMainModule(wrapperUrl, fileURLToPath(import.meta.url)), false);
  assert.equal(isMainModule(wrapperUrl, undefined), false);
});

test("the wrapper is the main module when run through a linked checkout", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tauri-build-link-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const linkedScripts = path.join(tempDir, "scripts");
  fs.symlinkSync(path.dirname(wrapperPath), linkedScripts, "junction");
  assert.equal(isMainModule(wrapperUrl, path.join(linkedScripts, "tauri_build.mjs")), true);
});

function runWrapperWithFakeCli(t, cliArgs) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tauri-build-cli-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cliDir = path.join(tempDir, "node_modules", "@tauri-apps", "cli");
  fs.mkdirSync(cliDir, { recursive: true });
  fs.writeFileSync(
    path.join(cliDir, "tauri.js"),
    "console.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(7);\n",
  );
  const result = spawnSync(process.execPath, [wrapperPath, ...cliArgs], {
    cwd: tempDir,
    encoding: "utf8",
  });
  return { args: JSON.parse(result.stdout), status: result.status };
}

test("the wrapper runs the working directory's Tauri CLI for a debug build", (t) => {
  assert.deepEqual(runWrapperWithFakeCli(t, ["--debug"]), {
    args: ["build", "--debug"],
    status: 7,
  });
});

test("the wrapper runs the working directory's Tauri CLI for a release build", (t) => {
  assert.deepEqual(runWrapperWithFakeCli(t, []), {
    args: ["build", "--config", RELEASE_CONFIG],
    status: 7,
  });
});
