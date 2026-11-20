# Installer Review Fixes, Part 1: No Console Windows on Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The installed Windows app opens without a console window, sidecar imports and exports do not flash a console, and the maintenance flags (`--check-integrity`, `--list-backups`, …) still print to the terminal that started them.

**Architecture:** Task 1 starts the sidecar with the Windows `CREATE_NO_WINDOW` process flag. Task 2 builds release binaries with the Windows GUI subsystem (`windows_subsystem = "windows"`). When a maintenance flag is present, it attaches the process to the parent console. Task 1 comes first: as long as the main exe is a console program, the sidecar inherits its console. After Task 2 the sidecar would open a new console window every time it runs.

**Tech Stack:** Rust (Tauri 2, tokio `process`), Win32 `kernel32` (`AttachConsole`, `GetStdHandle`, `SetStdHandle`) through `extern "system"` declarations, Python 3.14 (only for the console probe test).

**Series:** Code review of `add-cross-platform-installers` on 2026-11-04. This plan fixes finding 1. Part 2 fixes 2 and 5, Part 3 fixes 3, Part 4 fixes 4, Part 5 fixes 6 and 7. The parts are independent. Parts 1 and 2 both edit `call_sidecar` in `apps/desktop/src-tauri/src/sidecar/client.rs`. If Part 2 lands first, `resolve_sidecar_command` takes a second argument there; keep that argument when you apply Task 1.

## Global Constraints

- Base: branch `add-cross-platform-installers` at `aaeea8b` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`). Declare the three Win32 functions in an `extern "system"` block; do not add `windows-sys` or `winapi`.
- Debug builds (`pnpm tauri:dev`, `pnpm tauri:build --debug`, which Playwright uses) keep the console subsystem. Only `not(debug_assertions)` builds change.
- Rust gate, from `apps/desktop/src-tauri`, before each commit: `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --no-default-features -- -D warnings`, `cargo test`.
- The console probe test in Task 1 needs the repository-root `.venv` (Python 3.14). `python_command()` in `client.rs` finds `.venv/Scripts/python.exe`.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files.
- Write a code comment only for a constraint the code cannot show.

## Root cause (verified 2026-11-05 on `aaeea8b`)

- `apps/desktop/src-tauri/src/main.rs` has no `windows_subsystem` attribute, so the release exe uses the console subsystem. Windows opens a console window for it next to the Tauri window.
- `services/ml/spellbook_sidecar.spec` builds the sidecar with `console=True`. `call_sidecar` in `src/sidecar/client.rs` spawns it without `CREATE_NO_WINDOW`. Today the sidecar shares the main exe's console. When the main exe has no console, Windows opens a new console for each sidecar call.
- The maintenance flags in `main.rs` print through `tracing` to stdout. A GUI-subsystem process starts with no stdout, so after the subsystem change the output is lost unless the process attaches to a console.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/desktop/src-tauri/src/sidecar/client.rs` | `sidecar_process` builds the child command with `CREATE_NO_WINDOW` on Windows | 1 |
| `apps/desktop/src-tauri/src/main.rs` | GUI subsystem in release; `MAINTENANCE_FLAGS`, `is_maintenance_invocation`, `attach_parent_console` | 2 |
| `apps/desktop/src-tauri/AGENTS.md` | CLI Recovery Tools: console note and the `MAINTENANCE_FLAGS` rule | 2 |
| `docs/TROUBLESHOOTING.md` | CLI Recovery Tools: how to run the flags against an installed build | 2 |

---

### Task 1: Start the sidecar without a console window

**Files:**
- Modify: `apps/desktop/src-tauri/src/sidecar/client.rs` (`call_sidecar` lines 98–111; test module at the end)

**Interfaces:**
- Consumes: `SidecarCommand { program: PathBuf, args: Vec<PathBuf> }`, `resolve_sidecar_command`, `python_command()` (all in `client.rs`).
- Produces: `fn sidecar_process(command: &SidecarCommand) -> tokio::process::Command` (private). It sets the args, pipes stdin/stdout/stderr, and on Windows sets `CREATE_NO_WINDOW`. `call_sidecar` spawns through it.

- [x] **Step 1: Write the failing test**

Add to the `tests` module in `client.rs`. Below its `use super::{bundled_sidecar_path, resolve_sidecar_command};` line, add `#[cfg(windows)] use super::{python_command, sidecar_process, SidecarCommand};`. Only the Windows test uses them; ungated, they fail `clippy -D warnings` on the Ubuntu CI job.

```rust
    #[cfg(windows)]
    #[tokio::test]
    async fn sidecar_process_does_not_share_the_app_console() {
        let probe = SidecarCommand {
            program: python_command(),
            args: vec![
                PathBuf::from("-c"),
                PathBuf::from(
                    "import ctypes; ids = (ctypes.c_uint32 * 64)(); \
                     n = ctypes.windll.kernel32.GetConsoleProcessList(ids, 64); \
                     print(' '.join(str(ids[i]) for i in range(n)))",
                ),
            ],
        };

        let output = sidecar_process(&probe)
            .output()
            .await
            .expect("run python console probe");

        assert!(
            output.status.success(),
            "probe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let console_pids: Vec<u32> = String::from_utf8_lossy(&output.stdout)
            .split_whitespace()
            .map(|pid| pid.parse().expect("console process id"))
            .collect();
        assert!(
            !console_pids.is_empty(),
            "probe must run attached to a console"
        );
        assert!(
            !console_pids.contains(&std::process::id()),
            "sidecar child must get its own hidden console, not the app's: {console_pids:?}"
        );
    }
```

The probe lists the processes attached to the child's console. Without `CREATE_NO_WINDOW`, the child shares the test process's console, so the test's own process ID is in the list. With the flag, the child gets a new console that has no window, so the list holds only the probe's own processes. `GetConsoleWindow` cannot tell the two apart: it returns `0` in both cases whenever the parent console has no window (agent shells, CI). Verified on 2026-11-05 with the same probe from Python `subprocess`. Without the flag the parent's ID was listed; with `0x08000000` it was not. If the test process has no console at all, the test passes even without the flag. That cannot happen under `cargo test` started from a terminal or a CI shell step.

- [x] **Step 2: Extract `sidecar_process` without the flag and watch the test fail**

Add above `call_sidecar`:

```rust
fn sidecar_process(command: &SidecarCommand) -> Command {
    let mut process = Command::new(&command.program);
    process
        .args(&command.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    process
}
```

In `call_sidecar`, replace the lines from `let command = resolve_sidecar_command(exe_dir.as_deref())?;` through `.map_err(AppError::Io)?;` (the `spawn()` call) with:

```rust
    let command = resolve_sidecar_command(exe_dir.as_deref())?;
    let mut child = sidecar_process(&command).spawn().map_err(AppError::Io)?;
```

Run (from `apps/desktop/src-tauri`): `cargo test sidecar::client`
Expected: `sidecar_process_does_not_share_the_app_console` FAILS with `sidecar child must get its own hidden console, not the app's`. The printed list includes the test process's ID. The other four `sidecar::client` tests pass.

- [x] **Step 3: Set `CREATE_NO_WINDOW`**

Add above `sidecar_process`:

```rust
/// Release builds use the GUI subsystem, so a console child would get its own window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
```

In `sidecar_process`, insert before the final `process`:

```rust
    #[cfg(windows)]
    process.creation_flags(CREATE_NO_WINDOW);
```

`creation_flags` is a Windows-only method on `tokio::process::Command`. No import is needed.

- [x] **Step 4: Run the tests and the Rust gate**

Run: `cargo test sidecar::client`
Expected: 5 passed.

Run the Rust gate from Global Constraints. Expected: all exit 0.

- [x] **Step 5: Commit**

```powershell
git add apps/desktop/src-tauri/src/sidecar/client.rs
git commit -m "fix(sidecar): spawn without a console window on Windows" -m "Release builds will use the GUI subsystem; a console sidecar would open its own window on every import and export."
```

---

### Task 2: Release builds use the GUI subsystem; maintenance flags attach to the parent console

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs` (top of file and start of `main`; new test module at the end)
- Modify: `apps/desktop/src-tauri/AGENTS.md` (the `**CLI Recovery Tools**:` list)
- Modify: `docs/TROUBLESHOOTING.md` (the `## CLI Recovery Tools` section)

**Interfaces:**
- Consumes: nothing from Task 1. Task 1 must be merged before you ship a release build from this task (see Architecture).
- Produces (all private to the `spellbook-desktop` bin):
  - `const MAINTENANCE_FLAGS: &[&str]`. Every `--flag` that `main()` handles.
  - `fn is_maintenance_invocation(args: &[String]) -> bool`. True when any argument after `args[0]` is in `MAINTENANCE_FLAGS`.
  - `fn attach_parent_console()`. On Windows release builds, attaches to the parent console and points stdout/stderr at it when they are not redirected. No-op elsewhere.

- [x] **Step 1: Write the failing tests**

Append to `apps/desktop/src-tauri/src/main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{is_maintenance_invocation, MAINTENANCE_FLAGS};

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|arg| arg.to_string()).collect()
    }

    #[test]
    fn maintenance_flags_request_a_console() {
        for flag in MAINTENANCE_FLAGS {
            assert!(
                is_maintenance_invocation(&args(&["spellbook-desktop.exe", flag])),
                "{flag} must attach to the parent console"
            );
        }
    }

    #[test]
    fn normal_launch_does_not_request_a_console() {
        assert!(!is_maintenance_invocation(&args(&[
            "spellbook-desktop.exe"
        ])));
        assert!(!is_maintenance_invocation(&args(&[
            "spellbook-desktop.exe",
            "--unknown"
        ])));
    }

    #[test]
    fn program_path_is_not_treated_as_a_flag() {
        assert!(!is_maintenance_invocation(&args(&["--list-backups"])));
    }

    #[test]
    fn every_flag_main_handles_is_a_maintenance_flag() {
        let source = include_str!("main.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("main.rs source");
        for (index, _) in source.match_indices("\"--") {
            let flag: String = source[index + 1..]
                .chars()
                .take_while(|c| *c != '"' && !c.is_whitespace())
                .collect();
            assert!(
                MAINTENANCE_FLAGS.contains(&flag.as_str()),
                "{flag} is handled in main() but missing from MAINTENANCE_FLAGS"
            );
        }
    }
}
```

The scan in `every_flag_main_handles_is_a_maintenance_flag` stops at whitespace because `main.rs` line 80 logs `"--restore-backup requires a file path argument"`. Without that stop, the scan would read the whole message as a flag.

- [x] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/src-tauri`): `cargo test --bin spellbook-desktop`
Expected: compile error, `unresolved imports super::is_maintenance_invocation, super::MAINTENANCE_FLAGS`.

- [x] **Step 3: Implement**

> Landed as below in `ca5b60e`, then changed by review fix `cd8306d`: `attach_parent_console` saves the std handles before `AttachConsole` and restores the usable ones (checked with `GetFileType`), because `AttachConsole` replaces handles inherited without `STARTF_USESTDHANDLES` and `cmd /c "… > report.txt"` produced empty files. The `CONOUT$` fallback opens read/write so Rust's `GetConsoleMode` check sees a console. `main.rs` is the source of truth.

At the very top of `main.rs`, before the `use` lines:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

Below `init_logging`, add:

```rust
const MAINTENANCE_FLAGS: &[&str] = &[
    "--check-integrity",
    "--detect-collisions",
    "--recompute-hashes",
    "--export-migration-report",
    "--list-backups",
    "--rollback-migration",
    "--restore-backup",
];

fn is_maintenance_invocation(args: &[String]) -> bool {
    args.iter()
        .skip(1)
        .any(|arg| MAINTENANCE_FLAGS.contains(&arg.as_str()))
}

/// Windows release builds use the GUI subsystem and start without a console, so
/// maintenance flags attach to the console of the terminal that launched them.
#[cfg(all(windows, not(debug_assertions)))]
fn attach_parent_console() {
    use std::ffi::c_void;
    use std::os::windows::io::IntoRawHandle;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
        fn GetStdHandle(std_handle: u32) -> *mut c_void;
        fn SetStdHandle(std_handle: u32, handle: *mut c_void) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    const STD_OUTPUT_HANDLE: u32 = 0xFFFF_FFF5;
    const STD_ERROR_HANDLE: u32 = 0xFFFF_FFF4;

    // SAFETY: plain Win32 calls; the CONOUT$ handle is intentionally kept for the
    // life of the process because it becomes the process's stdout/stderr.
    unsafe {
        if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
            return;
        }
        for std_handle in [STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
            let current = GetStdHandle(std_handle);
            if !current.is_null() && current as isize != -1 {
                continue;
            }
            if let Ok(console) = std::fs::OpenOptions::new().write(true).open("CONOUT$") {
                SetStdHandle(std_handle, console.into_raw_handle());
            }
        }
    }
}

#[cfg(not(all(windows, not(debug_assertions))))]
fn attach_parent_console() {}
```

Replace the first two lines of `fn main()`:

```rust
fn main() {
    init_logging();
    let args: Vec<String> = env::args().collect();
```

with:

```rust
fn main() {
    let args: Vec<String> = env::args().collect();
    if is_maintenance_invocation(&args) {
        attach_parent_console();
    }
    init_logging();
```

Rust's stdout on Windows looks up the standard handle on every write, so `tracing` output reaches the console after `SetStdHandle`. Redirected handles (pipes, files) are already valid and stay as they are.

- [x] **Step 4: Run the tests and the Rust gate**

Run: `cargo test --bin spellbook-desktop`
Expected: 4 passed.

Run the Rust gate from Global Constraints. Also run `cargo clippy --release -- -D warnings` so the `cfg(not(debug_assertions))` code is linted. Expected: all exit 0.

- [x] **Step 5: Document the console behavior**

> Landed as below in `ca5b60e`. Review fixes `f77d3cd` and `f2ae414` replaced the `| Write-Output` advice: piping garbles non-ASCII and splits stderr from stdout. The docs now use `Start-Process … -NoNewWindow -Wait -PassThru` (plus `-RedirectStandardOutput`/`-RedirectStandardError` to capture), the cmd.exe forms, and startup-output capture for installed builds, in `docs/TROUBLESHOOTING.md`, `docs/MIGRATION.md` and `docs/TESTING.md`.

In `apps/desktop/src-tauri/AGENTS.md`, directly under the line `**CLI Recovery Tools**:`, insert:

```markdown
Windows release builds use the GUI subsystem (`main.rs`). The flags below attach to the console of the terminal that started the exe. A new flag must also be added to `MAINTENANCE_FLAGS` in `main.rs`; `every_flag_main_handles_is_a_maintenance_flag` fails otherwise.
```

In `docs/TROUBLESHOOTING.md`, directly under `The application includes built-in tools to help you recover.`, insert:

```markdown
On an installed Windows build, run the tools from the install folder (default `%LOCALAPPDATA%\Spellbook`). The installed exe is a windowed program, so PowerShell shows its prompt again before the output arrives. Pipe the command into `Write-Output` to make PowerShell wait for it, for example `.\spellbook-desktop.exe --list-backups | Write-Output`.
```

- [x] **Step 6: Verify on an installed Windows build (manual)**

> Done 2026-11-05 on the `ca5b60e` working tree; results are in that commit's body. The app ran on a throwaway `SPELLBOOK_DATA_DIR`, because the existing `%APPDATA%\SpellbookVault` (`user_version` 4, `spell` table without `description`) fails migration 5 at startup, which is unrelated to this plan. The import check used a background window poller with a `conhost` positive control. It saw two sidecar processes and no new console window.

This needs Task 1 and a working installer setup (`docs/DEVELOPMENT.md`, "Release builds").

1. From the repository root: `.\scripts\build_windows_installer.ps1`.
2. Run the new `target\release\bundle\nsis\*-setup.exe` and finish the installer.
3. Start Spellbook from the Start menu. Expected: only the Spellbook window opens; no console window.
4. Import a Markdown spell (Import → pick a `.md` file). Expected: no console window flashes.
5. In PowerShell: `& "$env:LOCALAPPDATA\Spellbook\spellbook-desktop.exe" --list-backups | Write-Output`. Expected: the `Available Backups` log line and one `backup` line per backup.

Record the results in the commit body.

- [x] **Step 7: Commit**

```powershell
git add apps/desktop/src-tauri/src/main.rs apps/desktop/src-tauri/AGENTS.md docs/TROUBLESHOOTING.md
git commit -m "fix(desktop): no console window in Windows release builds" -m "Release builds use the GUI subsystem. Maintenance flags attach to the parent console so their output still reaches the terminal. Manual check: <results from Step 6>."
```
