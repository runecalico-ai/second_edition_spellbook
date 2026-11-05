import assert from "node:assert/strict";
import test from "node:test";
import { RELEASE_CONFIG, tauriBuildArgs } from "./tauri_build.mjs";

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
