use crate::error::AppError;
use std::sync::Arc;

/// No-op embedding state used when the `llm` Cargo feature is disabled.
#[derive(Default)]
pub struct EmbeddingState {
    _private: (),
}

pub(crate) fn cancel_spell_embedding_for_delete(_state: &EmbeddingState, _spell_id: i64) {}

pub async fn enqueue_spell_embedding_if_ready(
    _state: Arc<EmbeddingState>,
    _pool: Arc<crate::db::Pool>,
    _spell_id: i64,
    _name: String,
    _description: String,
) -> Result<(), AppError> {
    Ok(())
}

pub async fn enqueue_import_embeddings_if_ready(
    _state: Arc<EmbeddingState>,
    _pool: Arc<crate::db::Pool>,
    _rows: Vec<(i64, String, String)>,
) -> Result<(), AppError> {
    Ok(())
}

#[allow(dead_code)]
pub async fn initialize_embeddings_after_startup<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    _state: Arc<EmbeddingState>,
    _pool: Arc<crate::db::Pool>,
) -> Result<(), AppError> {
    Ok(())
}
