use crate::error::AppError;
use serde_json::json;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

fn sidecar_path() -> Result<PathBuf, AppError> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.join("../../..");
    let candidate = repo_root.join("services/ml/spellbook_sidecar.py");
    if candidate.exists() {
        return Ok(candidate);
    }
    let fallback = std::env::current_dir()
        .map_err(AppError::Io)?
        .join("spellbook/services/ml/spellbook_sidecar.py");
    if fallback.exists() {
        return Ok(fallback);
    }
    Err(AppError::NotFound("spellbook_sidecar.py not found".into()))
}

fn python_command() -> &'static str {
    if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    }
}

pub async fn call_sidecar(
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    let script = sidecar_path()?;
    let mut child = Command::new(python_command())
        .arg(script)
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
