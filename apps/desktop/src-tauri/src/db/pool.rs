use crate::error::AppError;
use dirs::data_dir as system_data_dir;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

pub type Pool = r2d2::Pool<SqliteConnectionManager>;

pub fn app_data_dir() -> Result<PathBuf, AppError> {
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

fn sqlite_vec_paths_under_root(root: &Path) -> [PathBuf; 2] {
    let lib = sqlite_vec_library_name();
    [
        root.join("sqlite-vec").join(lib),
        root.join("resources").join("sqlite-vec").join(lib),
    ]
}

fn sqlite_vec_bundled_source_candidates(
    resource_dir: Option<&Path>,
    exe_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.extend(sqlite_vec_paths_under_root(dir));
    }
    if let Some(dir) = exe_dir {
        candidates.extend(sqlite_vec_paths_under_root(dir));
    }
    candidates
}

fn current_exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
}

fn install_sqlite_vec_if_needed(
    data_dir: &Path,
    resource_dir: Option<&Path>,
    exe_dir: Option<&Path>,
) -> Result<Option<PathBuf>, AppError> {
    let destination = data_dir.join(sqlite_vec_library_name());
    if destination.exists() {
        return Ok(Some(destination));
    }

    let Some(candidate) = sqlite_vec_bundled_source_candidates(resource_dir, exe_dir)
        .into_iter()
        .find(|path| path.exists())
    else {
        warn!(
            resource_dir = ?resource_dir,
            exe_dir = ?exe_dir,
            "sqlite-vec: no bundled library found in candidate paths"
        );
        return Ok(None);
    };

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
        warn!("sqlite-vec: unable to enable SQLite extension loading");
        return;
    }

    let mut loaded = false;
    for candidate in sqlite_vec_candidate_paths(data_dir) {
        if !candidate.exists() {
            continue;
        }
        match unsafe { conn.load_extension(&candidate, None) } {
            Ok(()) => {
                info!(path = %candidate.display(), "sqlite-vec: loaded extension");
                loaded = true;
                break;
            }
            Err(err) => {
                warn!(path = %candidate.display(), error = %err, "sqlite-vec: failed to load extension");
            }
        }
    }

    if !loaded {
        warn!(data_dir = %data_dir.display(), "sqlite-vec: extension not loaded; ensure vec0 is bundled");
    }

    let _ = conn.load_extension_disable();
}

pub fn init_db(resource_dir: Option<&Path>, run_backfill: bool) -> Result<Pool, AppError> {
    let data_dir = app_data_dir()?;
    let exe_dir = current_exe_dir();
    let _ = install_sqlite_vec_if_needed(&data_dir, resource_dir, exe_dir.as_deref())?;
    let db_path = data_dir.join("spellbook.sqlite3");
    let data_dir_for_conn = data_dir.clone();
    let manager = SqliteConnectionManager::file(&db_path).with_init(move |conn| {
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        try_load_sqlite_vec(conn, &data_dir_for_conn);
        Ok(())
    });
    let pool = r2d2::Pool::new(manager)?;
    {
        let conn = pool.get()?;
        super::migrations::load_migrations(&conn)?;
        if run_backfill {
            if let Err(e) = crate::utils::migration_manager::run_hash_backfill(&conn, &data_dir) {
                error!(error = %e, "Hash backfill failed");
            }
        }
    }
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn write_dummy_library(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create dummy library parent");
        }
        fs::write(path, b"fake-sqlite-vec").expect("write dummy library");
    }

    #[test]
    fn install_sqlite_vec_copies_from_nsis_resources_layout() {
        let tmp = tempdir().expect("temp dir");
        let install_root = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");

        let bundled = install_root
            .join("resources")
            .join("sqlite-vec")
            .join(sqlite_vec_library_name());
        write_dummy_library(&bundled);

        let copied = install_sqlite_vec_if_needed(&data_dir, Some(&install_root), None)
            .expect("install should not error")
            .expect("NSIS resources/sqlite-vec layout should copy into the vault");

        let destination = data_dir.join(sqlite_vec_library_name());
        assert_eq!(copied, destination);
        assert_eq!(
            fs::read(&destination).expect("read copied library"),
            b"fake-sqlite-vec"
        );
    }

    #[test]
    fn install_sqlite_vec_leaves_existing_destination_in_place() {
        let tmp = tempdir().expect("temp dir");
        let resource_dir = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");

        let destination = data_dir.join(sqlite_vec_library_name());
        fs::write(&destination, b"already-installed").expect("seed destination");

        let bundled = resource_dir
            .join("sqlite-vec")
            .join(sqlite_vec_library_name());
        write_dummy_library(&bundled);

        let result = install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir), None)
            .expect("install should not error")
            .expect("existing destination should be returned");

        assert_eq!(result, destination);
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"already-installed"
        );
    }

    #[test]
    fn install_sqlite_vec_returns_none_when_candidates_missing() {
        let tmp = tempdir().expect("temp dir");
        let resource_dir = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&resource_dir).expect("create install root");
        fs::create_dir_all(&data_dir).expect("create vault");

        let result = install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir), None)
            .expect("missing candidates should not panic");
        assert_eq!(result, None);
        assert!(
            !data_dir.join(sqlite_vec_library_name()).exists(),
            "vault should not gain a library when no bundled candidate exists"
        );
    }

    #[test]
    fn install_sqlite_vec_copies_from_exe_dir_resources_layout() {
        let tmp = tempdir().expect("temp dir");
        let exe_dir = tmp.path().join("install");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");

        let bundled = exe_dir
            .join("resources")
            .join("sqlite-vec")
            .join(sqlite_vec_library_name());
        write_dummy_library(&bundled);

        let copied = install_sqlite_vec_if_needed(&data_dir, None, Some(&exe_dir))
            .expect("install should not error")
            .expect("exe-dir resources/sqlite-vec layout should copy into the vault");

        let destination = data_dir.join(sqlite_vec_library_name());
        assert_eq!(copied, destination);
        assert_eq!(
            fs::read(&destination).expect("read copied library"),
            b"fake-sqlite-vec"
        );
    }

    #[test]
    fn sqlite_vec_bundled_source_candidates_include_nsis_and_exe_layouts() {
        let resource_dir = Path::new("Spellbook");
        let exe_dir = Path::new("install");
        let lib = sqlite_vec_library_name();
        let candidates = sqlite_vec_bundled_source_candidates(Some(resource_dir), Some(exe_dir));

        assert!(candidates.contains(&resource_dir.join("sqlite-vec").join(lib)));
        assert!(candidates.contains(&resource_dir.join("resources").join("sqlite-vec").join(lib)));
        assert!(candidates.contains(&exe_dir.join("sqlite-vec").join(lib)));
        assert!(candidates.contains(&exe_dir.join("resources").join("sqlite-vec").join(lib)));
    }
}
