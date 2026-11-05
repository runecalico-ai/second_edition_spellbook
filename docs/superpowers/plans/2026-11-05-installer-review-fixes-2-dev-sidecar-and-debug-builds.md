# Installer Review Fixes, Part 2: Dev Sidecar Resolution and Debug Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debug builds always run the live `services/ml/spellbook_sidecar.py`, and `pnpm tauri:build --debug` works on a fresh clone without the release staging step.

**Architecture:** Task 1 gives `resolve_sidecar_command` a `prefer_bundled` flag. `call_sidecar` passes `!cfg!(debug_assertions)`: release builds prefer the frozen `spellbook-sidecar` next to the exe, and debug builds prefer the repo script. Task 2 replaces the `tauri:build` npm script with a small Node wrapper, `scripts/tauri_build.mjs`. The wrapper adds `--config src-tauri/tauri.release.conf.json` (the sidecar `externalBin`) only when `--debug` or `-d` is absent. Debug builds therefore no longer need a frozen sidecar to exist, and every doc that says `pnpm tauri:build --debug` stays correct.

**Tech Stack:** Rust (Tauri 2), Node 24 (`node:test`, `node:child_process`), pnpm 10, GitHub Actions.

**Series:** Code review of `add-cross-platform-installers` on 2026-11-04. This plan fixes findings 2 and 5. Part 1 fixes 1, Part 3 fixes 3, Part 4 fixes 4, Part 5 fixes 6 and 7. The parts are independent. Parts 1 and 2 both edit `call_sidecar` in `apps/desktop/src-tauri/src/sidecar/client.rs`. If Part 1 landed first, `call_sidecar` spawns through `sidecar_process(&command)`; change only the `resolve_sidecar_command(...)` call there.

## Global Constraints

- Base: branch `add-cross-platform-installers` at `aaeea8b` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`). The wrapper uses only Node built-ins and the installed `@tauri-apps/cli`.
- Do not rename `pnpm tauri:build`. Many docs and agent skills say `pnpm tauri:build --debug`; it must keep working.
- `pnpm tauri:build` without `--debug`, `pnpm tauri:build:win`, and `pnpm tauri:build:linux` must still pass `--config src-tauri/tauri.release.conf.json`.
- Rust gate, from `apps/desktop/src-tauri`, before each Rust commit: `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --no-default-features -- -D warnings`, `cargo test`.
- Scratch files go under `.tmp\` at the repository root. `.tmp/` is not gitignored: stage files only by the explicit paths in each commit step, and delete scratch files where the steps say.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files.
- Write a code comment only for a constraint the code cannot show.
- Out of scope: E2E coverage of the frozen sidecar. After this plan, Playwright (debug build) exercises the Python script. The frozen binary is covered by the installer checks in `docs/RELEASE.md`.

## Root causes (verified 2026-11-05 on `aaeea8b`)

- `apps/desktop/package.json`: `"tauri:build": "tauri build --config src-tauri/tauri.release.conf.json"`. `pnpm tauri:build --debug` therefore includes the sidecar `externalBin`. `tauri-build` fails unless `apps/desktop/src-tauri/binaries/spellbook-sidecar-<target-triple>[.exe]` exists, and that file only exists after `scripts/prepare_release_bundle.py` (Python 3.14 plus a PyInstaller freeze). The root `AGENTS.md` still lists `pnpm tauri:build --debug` as a single step.
- When `tauri build --debug` succeeds, it copies the frozen sidecar to `target/debug/spellbook-sidecar.exe`. `pnpm tauri:dev` runs from the same `target/debug/` folder. `resolve_sidecar_command` prefers a sidecar next to the exe, so dev mode then runs the stale frozen copy, and edits to `spellbook_sidecar.py` have no effect. On 2026-11-05 this machine had `target\debug\spellbook-sidecar.exe` dated 2026-11-04 16:17.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/desktop/src-tauri/src/sidecar/client.rs` | `resolve_sidecar_command(exe_dir, prefer_bundled)`; debug builds prefer the script | 1 |
| `apps/desktop/src-tauri/AGENTS.md` | "Sidecar Calls": which program each build runs | 1 |
| `docs/DEVELOPMENT.md` | Release-builds section: sidecar choice and which builds need staging | 1, 2 |
| `scripts/tauri_build.mjs` | `pnpm tauri:build` entry point; adds the release config except for `--debug` | 2 |
| `scripts/tauri_build.test.mjs` | `node:test` tests for the argument rule | 2 |
| `apps/desktop/package.json` | `tauri:build` runs the wrapper | 2 |
| `.github/workflows/ci.yml` | Runs the wrapper tests | 2 |
| `AGENTS.md`, `README.md`, `scripts/README.md` | Debug build vs. installer build commands | 2 |

Tasks 1 and 2 are independent.

---

### Task 1: Debug builds prefer the repo sidecar script

**Files:**
- Modify: `apps/desktop/src-tauri/src/sidecar/client.rs` (`resolve_sidecar_command` lines 79–92; the `resolve_sidecar_command(...)` call in `call_sidecar`; tests `resolve_prefers_bundled_binary` and `resolve_falls_back_when_bundle_missing`)
- Modify: `apps/desktop/src-tauri/AGENTS.md` (`### Sidecar Calls`)
- Modify: `docs/DEVELOPMENT.md` (line 50, `Installer builds use …`)

**Interfaces:**
- Consumes: `bundled_sidecar_path(exe_dir: &Path) -> Option<PathBuf>`, `python_command() -> PathBuf`, `sidecar_path() -> Result<PathBuf, AppError>` (all in `client.rs`, unchanged).
- Produces: `pub(crate) fn resolve_sidecar_command(exe_dir: Option<&Path>, prefer_bundled: bool) -> Result<SidecarCommand, AppError>`, plus a private `fn script_command() -> Result<SidecarCommand, AppError>`.

- [ ] **Step 1: Write the failing tests**

In the `tests` module of `client.rs`, replace `resolve_prefers_bundled_binary` and `resolve_falls_back_when_bundle_missing` with:

```rust
    fn bundled_name() -> &'static str {
        if cfg!(windows) {
            "spellbook-sidecar.exe"
        } else {
            "spellbook-sidecar"
        }
    }

    #[test]
    fn release_resolution_prefers_bundled_binary() {
        let dir = temp_dir();
        let file = dir.join(bundled_name());
        fs::write(&file, b"not-a-real-binary").unwrap();
        let command = resolve_sidecar_command(Some(&dir), true).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(command.program, file);
        assert!(command.args.is_empty());
    }

    #[test]
    fn debug_resolution_prefers_repo_script_over_bundled_binary() {
        let dir = temp_dir();
        let file = dir.join(bundled_name());
        fs::write(&file, b"stale-frozen-sidecar").unwrap();
        let command = resolve_sidecar_command(Some(&dir), false).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_ne!(command.program, file);
        assert!(command.args[0].ends_with("spellbook_sidecar.py"));
    }

    #[test]
    fn release_resolution_falls_back_to_script_when_bundle_missing() {
        let dir = temp_dir();
        let command = resolve_sidecar_command(Some(&dir), true);
        let _ = fs::remove_dir_all(&dir);
        let command = command.unwrap();
        assert!(command.args[0].ends_with("spellbook_sidecar.py"));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/src-tauri`): `cargo test sidecar::client`
Expected: compile error, `this function takes 1 argument but 2 arguments were supplied` for `resolve_sidecar_command`.

- [ ] **Step 3: Implement**

Replace `resolve_sidecar_command` with:

```rust
fn script_command() -> Result<SidecarCommand, AppError> {
    Ok(SidecarCommand {
        program: python_command(),
        args: vec![sidecar_path()?],
    })
}

/// Release builds run the frozen sidecar installed next to the exe. Debug builds run
/// `services/ml/spellbook_sidecar.py` so Python edits apply without re-freezing; a
/// frozen copy next to a debug exe is used only when the script is missing.
pub(crate) fn resolve_sidecar_command(
    exe_dir: Option<&Path>,
    prefer_bundled: bool,
) -> Result<SidecarCommand, AppError> {
    let bundled = exe_dir.and_then(bundled_sidecar_path);
    let bundled_command = |program| SidecarCommand {
        program,
        args: Vec::new(),
    };
    if prefer_bundled {
        return match bundled {
            Some(program) => Ok(bundled_command(program)),
            None => script_command(),
        };
    }
    script_command().or_else(|error| bundled.map(bundled_command).ok_or(error))
}
```

In `call_sidecar`, change `resolve_sidecar_command(exe_dir.as_deref())?` to:

```rust
resolve_sidecar_command(exe_dir.as_deref(), !cfg!(debug_assertions))?
```

- [ ] **Step 4: Run the tests and the Rust gate**

Run: `cargo test sidecar::client`
Expected: all `sidecar::client` tests pass: 5, or 6 if Part 1 Task 1 is already merged.

Run the Rust gate from Global Constraints. Expected: all exit 0.

- [ ] **Step 5: Document which sidecar each build runs**

In `apps/desktop/src-tauri/AGENTS.md`, under `### Sidecar Calls`, after the code block that ends with `let result = call_sidecar("action_name", json!({"key": value})).await?;`, insert:

```markdown
`resolve_sidecar_command` picks the program. Release builds prefer the frozen `spellbook-sidecar` next to the exe. Debug builds (`pnpm tauri:dev`, `pnpm tauri:build --debug`) prefer `services/ml/spellbook_sidecar.py` with the repository venv, so Python edits apply without re-freezing.
```

In `docs/DEVELOPMENT.md`, replace line 50:

```markdown
Installer builds use `tauri.release.conf.json` (sidecar `externalBin`). `pnpm tauri:dev` does not.
```

with:

```markdown
Installer builds use `tauri.release.conf.json` (sidecar `externalBin`). `pnpm tauri:dev` does not. Release builds run the frozen `spellbook-sidecar` installed next to the app. Debug builds run `services/ml/spellbook_sidecar.py` with the repository venv and use a frozen copy next to the exe only when the script is missing.
```

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/src-tauri/src/sidecar/client.rs apps/desktop/src-tauri/AGENTS.md docs/DEVELOPMENT.md
git commit -m "fix(sidecar): debug builds run the repo sidecar script" -m "A frozen sidecar left in target/debug by an installer-config build shadowed spellbook_sidecar.py during tauri dev."
```

---

### Task 2: `pnpm tauri:build --debug` needs no release staging

**Files:**
- Create: `scripts/tauri_build.mjs`
- Create: `scripts/tauri_build.test.mjs`
- Modify: `apps/desktop/package.json` (`tauri:build` script)
- Modify: `.github/workflows/ci.yml` (new step after `Type check (JS)`)
- Modify: `AGENTS.md` (lines 9–10), `README.md` (line 31), `scripts/README.md` (new section), `docs/DEVELOPMENT.md` (line 50, as edited by Task 1 if it landed)

**Interfaces:**
- Consumes: `apps/desktop/node_modules/@tauri-apps/cli/tauri.js` (installed by `pnpm install`). pnpm runs package scripts with `apps/desktop` as the working directory.
- Produces: `export const RELEASE_CONFIG = "src-tauri/tauri.release.conf.json"` and `export function tauriBuildArgs(cliArgs: string[]): string[]` in `scripts/tauri_build.mjs`.

- [ ] **Step 1: Confirm the current failure**

Move the staged sidecar aside, then build:

```powershell
New-Item -ItemType Directory -Force .tmp\sidecar-aside | Out-Null
Get-ChildItem apps\desktop\src-tauri\binaries -Filter 'spellbook-sidecar-*' | Move-Item -Destination .tmp\sidecar-aside
pnpm --dir apps/desktop tauri:build --debug
```

Expected: the build fails in the `tauri-build` build script with an error that names `binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe`. Leave the sidecar moved aside until Step 7.

- [ ] **Step 2: Write the failing tests**

Create `scripts/tauri_build.test.mjs`:

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from the repository root): `node --test scripts/tauri_build.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/tauri_build.mjs`.

- [ ] **Step 4: Implement the wrapper**

Create `scripts/tauri_build.mjs`:

```js
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
  const result = spawnSync(
    process.execPath,
    [tauriCli, ...tauriBuildArgs(process.argv.slice(2))],
    { stdio: "inherit" },
  );
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
```

In `apps/desktop/package.json`, replace:

```json
    "tauri:build": "tauri build --config src-tauri/tauri.release.conf.json",
```

with:

```json
    "tauri:build": "node ../../scripts/tauri_build.mjs",
```

Leave `tauri:build:win` and `tauri:build:linux` unchanged.

- [ ] **Step 5: Run the unit tests**

Run: `node --test scripts/tauri_build.test.mjs`
Expected: 4 passed.

- [ ] **Step 6: Verify the debug build without a staged sidecar**

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: the build succeeds while the sidecar is still moved aside (Step 1). `target\debug\spellbook-desktop.exe` has a fresh timestamp.

Then confirm that release builds still require the sidecar: `pnpm --dir apps/desktop tauri:build`
Expected: fails with the same `binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe` error as Step 1. You can stop it as soon as that error appears.

- [ ] **Step 7: Restore the staged sidecar and remove the stale debug copy**

```powershell
Get-ChildItem .tmp\sidecar-aside -Filter 'spellbook-sidecar-*' | Move-Item -Destination apps\desktop\src-tauri\binaries
Remove-Item -Force -ErrorAction SilentlyContinue target\debug\spellbook-sidecar.exe
Remove-Item -Recurse -Force .tmp\sidecar-aside
```

- [ ] **Step 8: Run the wrapper tests in CI**

In `.github/workflows/ci.yml`, directly after the `Type check (JS)` step, insert:

```yaml
      - name: Unit tests (build scripts)
        run: node --test scripts/tauri_build.test.mjs
```

- [ ] **Step 9: Update the build-command docs**

In `AGENTS.md`, replace:

```markdown
- **Run Locally:** `pnpm tauri:dev`
- **Build Release:** `pnpm tauri:build --debug`
```

with:

```markdown
- **Run Locally:** `pnpm tauri:dev`
- **Debug Build (Playwright):** `pnpm tauri:build --debug` (no release staging needed)
- **Installers:** see [Release builds](./docs/DEVELOPMENT.md#release-builds-windows-nsis-linux-appimage-and-deb) (`scripts/prepare_release_bundle.py`, then `pnpm tauri:build:win` or `pnpm tauri:build:linux`)
```

In `README.md`, replace:

```markdown
> For a standalone executable, you must use `pnpm tauri:build` to bundle the frontend assets into the binary.
```

with:

```markdown
> For a standalone executable, use `pnpm tauri:build --debug` to bundle the frontend assets into the binary. Installers need the release staging step; see [Release builds](docs/DEVELOPMENT.md#release-builds-windows-nsis-linux-appimage-and-deb).
```

In `docs/DEVELOPMENT.md`, in the paragraph that starts `Installer builds use \`tauri.release.conf.json\``, replace the sentence `` `pnpm tauri:dev` does not. `` with:

```markdown
`pnpm tauri:dev` and `pnpm tauri:build --debug` do not: `scripts/tauri_build.mjs` adds that config only to release builds, so debug builds need no staging.
```

At the end of `scripts/README.md`, append:

```markdown
## `pnpm tauri:build`

`apps/desktop` runs `tauri_build.mjs` for `pnpm tauri:build`. Release builds get `--config src-tauri/tauri.release.conf.json`, which bundles the frozen sidecar, so run `prepare_release_bundle.py` first. `--debug` (or `-d`) builds skip that config and need no staging. Tests: `node --test scripts/tauri_build.test.mjs`.
```

- [ ] **Step 10: Commit**

```powershell
git add scripts/tauri_build.mjs scripts/tauri_build.test.mjs apps/desktop/package.json .github/workflows/ci.yml AGENTS.md README.md scripts/README.md docs/DEVELOPMENT.md
git commit -m "build(desktop): debug builds skip the release sidecar config" -m "pnpm tauri:build --debug failed on a fresh clone because the release config requires a frozen sidecar that only prepare_release_bundle.py produces."
```
