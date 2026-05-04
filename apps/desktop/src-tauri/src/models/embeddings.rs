use crate::models::SpellSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum EmbeddingsStatus {
    NotProvisioned,
    Downloading,
    Initializing,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct EmbeddingsStatusResponse {
    pub state: EmbeddingsStatus,
    pub download_progress: Option<f64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct EmbeddingsDownloadProgressEvent {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ReindexProgressEvent {
    pub current: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct SemanticSearchResult {
    #[serde(flatten)]
    pub spell: SpellSummary,
    pub cosine_distance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ReindexResult {
    pub total: u32,
    pub indexed: u32,
    pub skipped: u32,
    pub failed: u32,
}
