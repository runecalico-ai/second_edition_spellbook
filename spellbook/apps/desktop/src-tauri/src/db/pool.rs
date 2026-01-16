use crate::error::AppError;
use dirs::data_dir as system_data_dir;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

pub type Pool = r2d2::Pool<SqliteConnectionManager>;

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

fn sqlite_vec_library_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "vec0.dll"
    } else if cfg!(target_os = "macos") {
        "vec0.dylib"
    } else {
        "vec0.so"
    }
}

fn sqlite_vec_candidate_paths(data_dir: &Path) -> Vec<PathBuf> {
    let names = if cfg!(target_os = "windows") {
        vec!["vec0.dll", "sqlite-vec.dll", "sqlite-vec"]
    } else if cfg!(target_os = "macos") {
        vec!["vec0.dylib", "libsqlite-vec.dylib", "sqlite-vec"]
    } else {
        vec!["vec0.so", "libsqlite-vec.so", "sqlite-vec"]
    };
    names.into_iter().map(|name| data_dir.join(name)).collect()
}

fn install_sqlite_vec_if_needed(
    data_dir: &Path,
    resource_dir: Option<&Path>,
) -> Result<Option<PathBuf>, AppError> {
    let destination = data_dir.join(sqlite_vec_library_name());
    if destination.exists() {
        return Ok(Some(destination));
    }

    let resource_dir = match resource_dir {
        Some(dir) => dir,
        None => return Ok(None),
    };
    let candidate = resource_dir
        .join("sqlite-vec")
        .join(sqlite_vec_library_name());
    if !candidate.exists() {
        return Ok(None);
    }

    fs::create_dir_all(data_dir)?;
    fs::copy(&candidate, &destination).map_err(|e| {
        AppError::Io(std::io::Error::other(format!(
            "sqlite-vec: failed to copy {} to {}: {}",
            candidate.display(),
            destination.display(),
            e
        )))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&destination, perms)?;
    }
    Ok(Some(destination))
}

fn try_load_sqlite_vec(conn: &Connection, data_dir: &Path) {
    if unsafe { conn.load_extension_enable() }.is_err() {
        eprintln!("sqlite-vec: unable to enable SQLite extension loading.");
        return;
    }

    let mut loaded = false;
    for candidate in sqlite_vec_candidate_paths(data_dir) {
        if !candidate.exists() {
            continue;
        }
        match unsafe { conn.load_extension(&candidate, None) } {
            Ok(()) => {
                eprintln!("sqlite-vec: loaded extension from {}", candidate.display());
                loaded = true;
                break;
            }
            Err(err) => {
                eprintln!(
                    "sqlite-vec: failed to load extension from {}: {}",
                    candidate.display(),
                    err
                );
            }
        }
    }

    if !loaded {
        eprintln!(
            "sqlite-vec: extension not loaded. Ensure vec0 is bundled into {}.",
            data_dir.display()
        );
    }

    let _ = conn.load_extension_disable();
}

pub fn init_db(resource_dir: Option<&Path>) -> Result<Pool, AppError> {
    let data_dir = app_data_dir()?;
    let _ = install_sqlite_vec_if_needed(&data_dir, resource_dir)?;
    let db_path = data_dir.join("spellbook.sqlite3");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::new(manager)?;
    {
        let conn = pool.get()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        try_load_sqlite_vec(&conn, &data_dir);
        super::migrations::load_migrations(&conn)?;
    }
    Ok(pool)
}
