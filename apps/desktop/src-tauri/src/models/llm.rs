use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum LlmStatus {
    NotProvisioned,
    Downloading,
    Ready,
    Loaded,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct LlmStatusResponse {
    pub status: LlmStatus,
    pub model_path: String,
    pub bytes_downloaded: Option<u64>,
    pub total_bytes: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct TokenEvent {
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DoneEvent {
    pub full_response: String,
    pub cancelled: bool,
}
