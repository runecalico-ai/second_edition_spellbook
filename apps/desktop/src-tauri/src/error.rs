use serde::Serialize;
use thiserror::Error;
use tracing::error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Connection pool error: {0}")]
    Pool(#[from] r2d2::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Sidecar error: {0}")]
    Sidecar(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Search error: {0}")]
    Search(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Import error: {0}")]
    Import(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

// Safe serialization - never expose internal details to frontend
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        error!(error = ?self, "AppError");
        // Return sanitized message to frontend
        serializer.serialize_str(&self.to_string())
    }
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

// Allow simple strings to be converted to AppError::Unknown for easier migration
impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Unknown(s)
    }
}
