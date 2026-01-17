use crate::error::AppError;
use dirs::data_dir as system_data_dir;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

fn app_data_dir() -> Result<PathBuf, AppError> {
    if let Ok(override_dir) = std::env::var("SPELLBOOK_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    let dir = system_data_dir()
        .ok_or_else(|| AppError::Unknown("no data dir".to_string()))?
        .join("SpellbookVault");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub async fn backup_vault(
    pool: tauri::State<'_, std::sync::Arc<crate::db::pool::Pool>>,
    destination_path: String,
) -> Result<String, AppError> {
    use rusqlite::backup::Backup;
    use std::time::Duration;

    let data_dir = app_data_dir()?;
    let dest_path = PathBuf::from(&destination_path);
    let db_path = data_dir.join("spellbook.sqlite3");

    // Ensure parent directory exists
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Create a temporary file for the database backup
    let temp_db = tempfile::NamedTempFile::new()
        .map_err(|e| AppError::Unknown(format!("Failed to create temp file: {}", e)))?;
    let temp_db_path = temp_db.path();

    // Use SQLite's backup API to safely backup the database
    {
        let pool_arc = pool.inner().clone();
        let src_conn = pool_arc.get()?;
        let mut dst_conn = rusqlite::Connection::open(temp_db_path)
            .map_err(|e| AppError::Unknown(format!("Failed to open temp db: {}", e)))?;

        let backup = Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| AppError::Unknown(format!("Failed to init backup: {}", e)))?;

        backup
            .run_to_completion(5, Duration::from_millis(250), None)
            .map_err(|e| AppError::Unknown(format!("Failed to backup database: {}", e)))?;
    }

    // Create ZIP archive
    let file = File::create(&dest_path)
        .map_err(|e| AppError::Unknown(format!("Failed to create backup file: {}", e)))?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // Add the backed-up database to the ZIP
    zip.start_file("spellbook.sqlite3", options)
        .map_err(|e| AppError::Unknown(format!("Failed to start zip entry: {}", e)))?;

    let mut temp_db_file = File::open(temp_db_path)
        .map_err(|e| AppError::Unknown(format!("Failed to open temp db: {}", e)))?;
    std::io::copy(&mut temp_db_file, &mut zip)
        .map_err(|e| AppError::Unknown(format!("Failed to write db to zip: {}", e)))?;

    // Finalize the ZIP archive
    zip.finish()
        .map_err(|e| AppError::Unknown(format!("Failed to finalize zip: {}", e)))?;

    Ok(destination_path)
}

#[tauri::command]
pub async fn restore_vault(
    pool: tauri::State<'_, std::sync::Arc<crate::db::pool::Pool>>,
    backup_path: String,
    allow_overwrite: bool,
) -> Result<(), AppError> {
    use rusqlite::backup::Backup;
    use std::time::Duration;

    let backup_file = PathBuf::from(&backup_path);

    if !backup_file.exists() {
        return Err(AppError::NotFound(format!(
            "Backup file not found: {}",
            backup_path
        )));
    }

    let data_dir = app_data_dir()?;
    let db_path = data_dir.join("spellbook.sqlite3");

    // Check if data directory has content
    let has_content = fs::read_dir(&data_dir)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);

    if has_content && !allow_overwrite {
        return Err(AppError::Validation(
            "Data directory is not empty. Set allow_overwrite to true to proceed.".to_string(),
        ));
    }

    let file = File::open(&backup_file)
        .map_err(|e| AppError::Unknown(format!("Failed to open backup file: {}", e)))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::Unknown(format!("Failed to read zip archive: {}", e)))?;

    // Create temp file for database extraction
    let temp_db = tempfile::NamedTempFile::new()
        .map_err(|e| AppError::Unknown(format!("Failed to create temp file: {}", e)))?;
    let temp_db_path = temp_db.path();

    // Extract only the database file from the archive
    let mut db_file = archive
        .by_name("spellbook.sqlite3")
        .map_err(|e| AppError::Unknown(format!("Database not found in backup: {}", e)))?;

    let mut temp_file = File::create(temp_db_path)
        .map_err(|e| AppError::Unknown(format!("Failed to create temp db: {}", e)))?;
    std::io::copy(&mut db_file, &mut temp_file)
        .map_err(|e| AppError::Unknown(format!("Failed to extract db to temp: {}", e)))?;

    // Drop the file handle before using it
    drop(temp_file);
    drop(db_file);
    drop(archive);

    // Use SQLite's restore API to restore the database
    {
        let src_conn = rusqlite::Connection::open(temp_db_path)
            .map_err(|e| AppError::Unknown(format!("Failed to open temp db: {}", e)))?;
        let pool_arc = pool.inner().clone();
        let mut dst_conn = pool_arc.get()?;

        let backup = Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| AppError::Unknown(format!("Failed to init restore: {}", e)))?;

        backup
            .run_to_completion(5, Duration::from_millis(250), None)
            .map_err(|e| AppError::Unknown(format!("Failed to restore database: {}", e)))?;
    }

    Ok(())
}
