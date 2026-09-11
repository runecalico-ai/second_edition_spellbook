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

    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });

    if let Some(mut stdin) = child.stdin.take() {
        let request_bytes = request.to_string();
        stdin
            .write_all(request_bytes.as_bytes())
            .await
            .map_err(AppError::Io)?;
        stdin.write_all(b"\n").await.map_err(AppError::Io)?;
    }

    // Wait for the child to finish and collect output
    let output = child.wait_with_output().await.map_err(AppError::Io)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let trimmed = stderr.trim();
        let snippet = if trimmed.len() > 400 {
            format!("{}…", &trimmed[..400])
        } else if trimmed.is_empty() {
            "<empty>".to_string()
        } else {
            trimmed.to_string()
        };
        return Err(AppError::Sidecar(format!(
            "Sidecar process exited with status {}: {}",
            output.status, snippet
        )));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    for line in stdout_str.lines() {
        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(error) = entry.get("error") {
                return Err(AppError::Sidecar(error.to_string()));
            }
            if let Some(result) = entry.get("result") {
                return Ok(result.clone());
            }
        }
    }

    Err(AppError::Sidecar("No valid JSON-RPC response found".into()))
}

#[cfg(test)]
mod tests {
    use super::{bundled_sidecar_path, resolve_sidecar_command};
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "spellbook-sidecar-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
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
