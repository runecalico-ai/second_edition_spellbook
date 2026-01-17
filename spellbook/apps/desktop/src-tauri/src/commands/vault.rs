use crate::error::AppError;
use dirs::data_dir as system_data_dir;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use walkdir::WalkDir;
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
pub async fn backup_vault(destination_path: String) -> Result<String, AppError> {
    let data_dir = app_data_dir()?;
    let dest_path = PathBuf::from(&destination_path);

    // Ensure parent directory exists
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let file = File::create(&dest_path)
        .map_err(|e| AppError::Unknown(format!("Failed to create backup file: {}", e)))?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for entry in WalkDir::new(&data_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = path
            .strip_prefix(&data_dir)
            .map_err(|e| AppError::Unknown(format!("Path strip failed: {}", e)))?;

        if path.is_file() {
            zip.start_file(name.to_string_lossy(), options)
                .map_err(|e| AppError::Unknown(format!("Failed to start zip entry: {}", e)))?;

            let mut f = File::open(path)
                .map_err(|e| AppError::Unknown(format!("Failed to open file for backup: {}", e)))?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer)
                .map_err(|e| AppError::Unknown(format!("Failed to read file: {}", e)))?;
            zip.write_all(&buffer)
                .map_err(|e| AppError::Unknown(format!("Failed to write to zip: {}", e)))?;
        } else if !name.as_os_str().is_empty() {
            zip.add_directory(name.to_string_lossy(), options)
                .map_err(|e| AppError::Unknown(format!("Failed to add directory: {}", e)))?;
        }
    }

    zip.finish()
        .map_err(|e| AppError::Unknown(format!("Failed to finalize zip: {}", e)))?;

    Ok(destination_path)
}

#[tauri::command]
pub async fn restore_vault(backup_path: String, allow_overwrite: bool) -> Result<(), AppError> {
    let backup_file = PathBuf::from(&backup_path);

    if !backup_file.exists() {
        return Err(AppError::NotFound(format!(
            "Backup file not found: {}",
            backup_path
        )));
    }

    let data_dir = app_data_dir()?;

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

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AppError::Unknown(format!("Failed to read zip entry: {}", e)))?;

        let outpath = match file.enclosed_name() {
            Some(path) => data_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| AppError::Unknown(format!("Failed to create file: {}", e)))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| AppError::Unknown(format!("Failed to extract file: {}", e)))?;
        }

        // Set permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                fs::set_permissions(&outpath, fs::Permissions::from_mode(mode)).ok();
            }
        }
    }

    Ok(())
}
