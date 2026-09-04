# Cross-Platform Installers Task 2b Sidecar Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec items 2.4–2.5 for `add-cross-platform-installers` by spawning a bundled `spellbook-sidecar` from `current_exe().parent()` when present, falling back to script+Python when absent, and invoking freeze from `scripts/prepare_release_bundle.py`.

**Architecture:** Release detection is a **filesystem probe**, not `cfg!(not(debug_assertions))`. `call_sidecar` stays the only public API (`import.rs` / `export.rs` unchanged). JSON-RPC stdin/stdout protocol is unchanged.

**Tech Stack:** Rust (`tokio::process::Command`), existing `AppError`, Python freeze script from Task 2a.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 2.4–2.5  
**Depends on:** Task 2a (`tauri.release.conf.json` overlay; `services/ml/build_sidecar.py` exists)  
**Unblocks:** Task groups 3–6  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-2a-sidecar-freeze.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-3-tauri-bundle-config.md`

---

## Global Constraints

- Probe `std::env::current_exe()?.parent()` for `spellbook-sidecar` / `spellbook-sidecar.exe`. Also accept the target-triple-suffixed names used in `src-tauri/binaries/` so a developer copying that file next to a test exe still works.
- Dev fallback: existing `sidecar_path()` + `python_command()` when no bundled file exists.
- Do not use deprecated Tauri v1 `tauri::api::path`. Do not add the shell plugin.
- Expand venv lookup to also try repo-root `.venv` and `services/ml/.venv` (CI) in addition to `services/ml/venv`, without changing the bundled-binary probe.
- Do not rewrite delta specs. Flip only 2.4 and 2.5.
- Windows CRT stays dynamic (`STATIC_VCRUNTIME=false`). Sidecar freeze does not change that.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 2.4 Update `sidecar/client.rs`: probe bundled binary via `current_exe().parent()`; dev fallback when absent | Task 1 | `cargo test` sidecar tests pass; checkbox `[x]` |
| 2.5 Wire sidecar freeze into pre-build script for release workflow and local release docs | Task 2 | `prepare_release_bundle.py` calls freeze unless `--skip-sidecar`; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `apps/desktop/src-tauri/src/sidecar/client.rs` | Modify: resolution + tests |
| `scripts/prepare_release_bundle.py` | Modify: call `services/ml/build_sidecar.py` |
| `scripts/build_windows_installer.ps1` | Already calls orchestrator from group 1; no extra step unless freeze flag needed |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 2.4–2.5 |

---

### Task 1: Bundled binary probe + Python fallback (OpenSpec 2.4)

**Files:**
- Modify: `apps/desktop/src-tauri/src/sidecar/client.rs`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (2.4 only)

**Interfaces:**
- Consumes: installed name `spellbook-sidecar` / `spellbook-sidecar.exe` beside the main exe (Tauri strips the triple at bundle time)
- Produces:
  - `pub(crate) struct SidecarCommand { program: PathBuf, args: Vec<PathBuf> }`
  - `pub(crate) fn bundled_sidecar_path(exe_dir: &Path) -> Option<PathBuf>`
  - `pub(crate) fn resolve_sidecar_command(exe_dir: Option<&Path>) -> Result<SidecarCommand, AppError>`
  - `call_sidecar` still `pub async fn call_sidecar(method: &str, params: serde_json::Value) -> Result<serde_json::Value, AppError>`

- [ ] **Step 1: Write failing unit tests in `client.rs`**

Append to `apps/desktop/src-tauri/src/sidecar/client.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{bundled_sidecar_path, resolve_sidecar_command};
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("spellbook-sidecar-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn bundled_path_finds_unsuffixed_exe() {
        let dir = temp_dir();
        let name = if cfg!(windows) {
            "spellbook-sidecar.exe"
        } else {
            "spellbook-sidecar"
        };
        let file = dir.join(name);
        fs::write(&file, b"not-a-real-binary").unwrap();
        assert_eq!(bundled_sidecar_path(&dir).as_deref(), Some(file.as_path()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bundled_path_finds_target_triple_name() {
        let dir = temp_dir();
        let name = if cfg!(windows) {
            "spellbook-sidecar-x86_64-pc-windows-msvc.exe"
        } else {
            "spellbook-sidecar-x86_64-unknown-linux-gnu"
        };
        let file = dir.join(name);
        fs::write(&file, b"not-a-real-binary").unwrap();
        assert_eq!(bundled_sidecar_path(&dir).as_deref(), Some(file.as_path()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_prefers_bundled_binary() {
        let dir = temp_dir();
        let name = if cfg!(windows) {
            "spellbook-sidecar.exe"
        } else {
            "spellbook-sidecar"
        };
        let file = dir.join(name);
        fs::write(&file, b"not-a-real-binary").unwrap();
        let command = resolve_sidecar_command(Some(&dir)).unwrap();
        assert_eq!(command.program, file);
        assert!(command.args.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_falls_back_when_bundle_missing() {
        let dir = temp_dir();
        let command = resolve_sidecar_command(Some(&dir));
        let _ = fs::remove_dir_all(&dir);
        let command = command.unwrap();
        assert!(!command.args.is_empty());
        assert!(command.args[0].ends_with("spellbook_sidecar.py"));
    }
}
```

The last test requires a checkout of `services/ml/spellbook_sidecar.py` (true in this repo). If `CARGO_MANIFEST_DIR` layout changes, it should still resolve via `sidecar_path()`.

- [ ] **Step 2: Run the new tests and confirm they fail**

```powershell
cd apps\desktop\src-tauri
cargo test --lib sidecar::client::tests -- --nocapture
```

Expected: FAIL with unresolved names `bundled_sidecar_path` / `resolve_sidecar_command` / `SidecarCommand`.

- [ ] **Step 3: Implement resolution**

Replace the top of `client.rs` so `call_sidecar` uses `resolve_sidecar_command`. Keep `sidecar_path` and `python_command`, and extend `python_command` venv candidates.

Full replacement of helpers (keep the JSON-RPC body of `call_sidecar`):

```rust
use crate::error::AppError;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

pub(crate) struct SidecarCommand {
    pub program: PathBuf,
    pub args: Vec<PathBuf>,
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn bundled_candidate_names() -> Vec<String> {
    let exe_suffix = if cfg!(windows) { ".exe" } else { "" };
    vec![
        format!("spellbook-sidecar{exe_suffix}"),
        format!("spellbook-sidecar-x86_64-pc-windows-msvc{exe_suffix}"),
        format!("spellbook-sidecar-x86_64-unknown-linux-gnu{exe_suffix}"),
    ]
}

pub(crate) fn bundled_sidecar_path(exe_dir: &Path) -> Option<PathBuf> {
    for name in bundled_candidate_names() {
        let candidate = exe_dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn sidecar_path() -> Result<PathBuf, AppError> {
    let candidate = repo_root().join("services/ml/spellbook_sidecar.py");
    if candidate.exists() {
        return Ok(candidate);
    }
    let fallback = std::env::current_dir()
        .map_err(AppError::Io)?
        .join("services/ml/spellbook_sidecar.py");
    if fallback.exists() {
        return Ok(fallback);
    }
    Err(AppError::NotFound("spellbook_sidecar.py not found".into()))
}

fn python_command() -> PathBuf {
    let root = repo_root();
    let windows_candidates = [
        root.join("services/ml/venv/Scripts/python.exe"),
        root.join("services/ml/.venv/Scripts/python.exe"),
        root.join(".venv/Scripts/python.exe"),
    ];
    let unix_candidates = [
        root.join("services/ml/venv/bin/python"),
        root.join("services/ml/.venv/bin/python"),
        root.join(".venv/bin/python"),
    ];
    let candidates: &[PathBuf] = if cfg!(windows) {
        &windows_candidates
    } else {
        &unix_candidates
    };
    for candidate in candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }
    if cfg!(windows) {
        PathBuf::from("python")
    } else {
        PathBuf::from("python3")
    }
}

pub(crate) fn resolve_sidecar_command(exe_dir: Option<&Path>) -> Result<SidecarCommand, AppError> {
    if let Some(dir) = exe_dir {
        if let Some(program) = bundled_sidecar_path(dir) {
            return Ok(SidecarCommand {
                program,
                args: Vec::new(),
            });
        }
    }
    Ok(SidecarCommand {
        program: python_command(),
        args: vec![sidecar_path()?],
    })
}

pub async fn call_sidecar(
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    let command = resolve_sidecar_command(exe_dir.as_deref())?;
    let mut child = Command::new(&command.program);
    for arg in &command.args {
        child.arg(arg);
    }
    let mut child = child
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(AppError::Io)?;

    // ... existing request write + wait_with_output + JSON parse unchanged ...
```

Paste the existing request/response handling from the current `call_sidecar` (lines 61–109 of today's `client.rs`) after spawn. Do not change JSON-RPC `id: 1` or error mapping.

- [ ] **Step 4: Run tests and clippy**

```powershell
cd apps\desktop\src-tauri
cargo test --lib sidecar::client::tests
cargo clippy -- -D warnings
```

Expected: PASS / no clippy warnings. `resolve_falls_back_when_bundle_missing` must pass from a developer checkout.

- [ ] **Step 5: Mark OpenSpec 2.4 complete**

From:

```markdown
- [ ] 2.4 Update `sidecar/client.rs`: probe for bundled binary via `current_exe().parent()`; dev fallback to script+venv when absent
```

To:

```markdown
- [x] 2.4 Update `sidecar/client.rs`: probe for bundled binary via `current_exe().parent()`; dev fallback to script+venv when absent
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/sidecar/client.rs openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
feat(sidecar): spawn bundled spellbook-sidecar when present

Use a filesystem probe so packaged installs work without a repo checkout, while tauri dev keeps the Python script fallback.
EOF
)"
```

---

### Task 2: Wire freeze into the pre-build orchestrator (OpenSpec 2.5)

**Files:**
- Modify: `scripts/prepare_release_bundle.py`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (2.5 only)

**Interfaces:**
- Consumes: `services/ml/build_sidecar.py` (Task 2a), `scripts/provision_sqlite_vec.py` (Task 1)
- Produces: `prepare_release_bundle.py --skip-sidecar` skips freeze; default path runs sqlite-vec **then** `services/ml/build_sidecar.py`. Local NSIS helper already invokes this orchestrator.

- [ ] **Step 1: Extend `scripts/prepare_release_bundle.py`**

Replace `main` / add `run_freeze_sidecar`:

```python
def run_freeze_sidecar() -> None:
    script = REPO_ROOT / "services" / "ml" / "build_sidecar.py"
    completed = subprocess.run([sys.executable, str(script)], check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-sidecar", action="store_true")
    args = parser.parse_args()
    run_provision_sqlite_vec()
    if not args.skip_sidecar:
        run_freeze_sidecar()
    return 0
```

- [ ] **Step 2: Verify CLI**

```powershell
.\.venv\Scripts\python scripts\prepare_release_bundle.py --skip-sidecar
```

Expected: sqlite-vec staging only; exit 0.

Full freeze (slow):

```powershell
.\.venv\Scripts\python scripts\prepare_release_bundle.py
```

Expected: `vec0.*` present and `apps/desktop/src-tauri/binaries/spellbook-sidecar-<tuple>.exe` present; exit 0.

- [ ] **Step 3: Mark OpenSpec 2.5 complete**

From:

```markdown
- [ ] 2.5 Wire sidecar freeze step into pre-build script invoked by release workflow and local release docs
```

To:

```markdown
- [x] 2.5 Wire sidecar freeze step into pre-build script invoked by release workflow and local release docs
```

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare_release_bundle.py openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
build(packaging): freeze sidecar during release resource prep

Keep sqlite-vec staging and sidecar freeze on one pre-build entry point for CI and local NSIS.
EOF
)"
```
