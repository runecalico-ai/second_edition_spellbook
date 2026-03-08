use crate::error::AppError;
use crate::models::canonical_spell::CanonicalSpell;
use dirs::data_dir as system_data_dir;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;
use tracing::warn;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const WINDOWS_PATH_WARNING_THRESHOLD: usize = 240;

pub(crate) fn app_data_dir() -> Result<PathBuf, AppError> {
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

fn spell_storage_dir_in_root(root: &Path) -> Result<PathBuf, AppError> {
    let dir = root.join("spells");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) fn spell_file_path_in_root(root: &Path, content_hash: &str) -> PathBuf {
    root.join("spells").join(format!("{content_hash}.json"))
}

pub(crate) fn should_warn_for_windows_path_length(path: &Path) -> bool {
    path.to_string_lossy().chars().count() >= WINDOWS_PATH_WARNING_THRESHOLD
}

fn warn_for_windows_path_length(path: &Path) {
    if should_warn_for_windows_path_length(path) {
        warn!(
            path = %path.display(),
            "Vault spell file path is near or beyond the Windows path-length safety threshold; use a shorter vault root if writes fail"
        );
    }
}

#[allow(dead_code)]
pub(crate) fn spell_file_path(content_hash: &str) -> Result<PathBuf, AppError> {
    let root = app_data_dir()?;
    let path = spell_file_path_in_root(&root, content_hash);
    warn_for_windows_path_length(&path);
    Ok(path)
}

pub(crate) fn verify_vault_spell_json(
    expected_hash: &str,
    json: &str,
) -> Result<CanonicalSpell, AppError> {
    let canonical: CanonicalSpell =
        serde_json::from_str(json).map_err(|e| AppError::Validation(format!("Invalid vault spell JSON: {e}")))?;
    let computed_hash = canonical
        .compute_hash()
        .map_err(|e| AppError::Validation(format!("Vault spell hash verification failed: {e}")))?;
    if computed_hash != expected_hash {
        return Err(AppError::Validation(format!(
            "Vault spell hash {computed_hash} does not match target filename hash {expected_hash}"
        )));
    }
    Ok(canonical)
}

pub(crate) fn write_spell_json_atomically(
    root: &Path,
    content_hash: &str,
    json: &str,
) -> Result<PathBuf, AppError> {
    verify_vault_spell_json(content_hash, json)?;

    let spells_dir = spell_storage_dir_in_root(root)?;
    let target_path = spell_file_path_in_root(root, content_hash);
    warn_for_windows_path_length(&target_path);

    let mut temp_file = tempfile::NamedTempFile::new_in(&spells_dir)
        .map_err(|e| AppError::Unknown(format!("Failed to create vault temp file: {e}")))?;
    temp_file.write_all(json.as_bytes())?;
    temp_file.flush()?;
    temp_file.as_file().sync_all()?;

    if target_path.exists() {
        fs::remove_file(&target_path)?;
    }

    temp_file
        .persist(&target_path)
        .map_err(|e| AppError::Unknown(format!("Failed to persist vault spell file: {}", e.error)))?;

    Ok(target_path)
}

pub(crate) fn export_spell_to_vault_by_hash(
    conn: &rusqlite::Connection,
    content_hash: &str,
) -> Result<PathBuf, AppError> {
    let canonical_json: String = conn.query_row(
        "SELECT canonical_data FROM spell WHERE content_hash = ? AND canonical_data IS NOT NULL",
        [content_hash],
        |row| row.get(0),
    )?;
    let root = app_data_dir()?;
    write_spell_json_atomically(&root, content_hash, &canonical_json)
}

#[derive(Default)]
pub struct VaultMaintenanceState {
    import_in_progress: Mutex<bool>,
}

pub struct VaultImportGuard<'a> {
    state: &'a VaultMaintenanceState,
}

impl VaultMaintenanceState {
    pub fn start_import(&self) -> Result<VaultImportGuard<'_>, AppError> {
        let mut import_in_progress = self
            .import_in_progress
            .lock()
            .map_err(|_| AppError::Unknown("Vault maintenance state is poisoned".to_string()))?;
        if *import_in_progress {
            return Err(AppError::Import(
                "Another import is already in progress.".to_string(),
            ));
        }
        *import_in_progress = true;
        drop(import_in_progress);
        Ok(VaultImportGuard { state: self })
    }

    pub fn ensure_gc_allowed(&self) -> Result<(), AppError> {
        let import_in_progress = self
            .import_in_progress
            .lock()
            .map_err(|_| AppError::Unknown("Vault maintenance state is poisoned".to_string()))?;
        if *import_in_progress {
            return Err(AppError::Validation(
                "Vault optimization is unavailable while an import is in progress.".to_string(),
            ));
        }
        Ok(())
    }
}

impl Drop for VaultImportGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut import_in_progress) = self.state.import_in_progress.lock() {
            *import_in_progress = false;
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct VaultUnrecoverableEntry {
    pub content_hash: String,
    pub reason: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct VaultIntegritySummary {
    pub checked_count: usize,
    pub missing_count: usize,
    pub reexported_count: usize,
    pub repaired_count: usize,
    pub unrecoverable: Vec<VaultUnrecoverableEntry>,
    pub warning_count: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct VaultGcSummary {
    pub deleted_count: usize,
    pub retained_count: usize,
    pub warning_count: usize,
    pub integrity: VaultIntegritySummary,
}

fn table_has_column(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => return false,
    };
    stmt.query_row([column], |_| Ok(())).is_ok()
}

fn record_unrecoverable(
    summary: &mut VaultIntegritySummary,
    content_hash: &str,
    reason: impl Into<String>,
) {
    summary.unrecoverable.push(VaultUnrecoverableEntry {
        content_hash: content_hash.to_string(),
        reason: reason.into(),
    });
    summary.warning_count = summary.unrecoverable.len();
}

fn recover_spell_file_from_canonical_data(
    root: &Path,
    content_hash: &str,
    canonical_data: Option<&str>,
) -> Result<bool, String> {
    let Some(canonical_data) = canonical_data else {
        return Ok(false);
    };
    write_spell_json_atomically(root, content_hash, canonical_data)
        .map(|_| true)
        .map_err(|err| err.to_string())
}

pub(crate) fn run_vault_integrity_check_with_root(
    conn: &rusqlite::Connection,
    root: &Path,
) -> Result<VaultIntegritySummary, AppError> {
    let mut summary = VaultIntegritySummary::default();
    let mut stmt = conn.prepare(
        "SELECT content_hash, canonical_data FROM spell WHERE content_hash IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
        ))
    })?;

    for row in rows {
        let (content_hash, canonical_data) = row?;
        summary.checked_count += 1;
        let path = spell_file_path_in_root(root, &content_hash);

        if !path.exists() {
            summary.missing_count += 1;
            match recover_spell_file_from_canonical_data(root, &content_hash, canonical_data.as_deref()) {
                Ok(true) => summary.reexported_count += 1,
                Ok(false) => record_unrecoverable(
                    &mut summary,
                    &content_hash,
                    "Missing vault file and canonical_data is NULL",
                ),
                Err(reason) => record_unrecoverable(&mut summary, &content_hash, reason),
            }
            continue;
        }

        let file_json = match fs::read_to_string(&path) {
            Ok(json) => json,
            Err(err) => {
                record_unrecoverable(
                    &mut summary,
                    &content_hash,
                    format!("Failed to read vault spell file: {err}"),
                );
                continue;
            }
        };

        if verify_vault_spell_json(&content_hash, &file_json).is_ok() {
            continue;
        }

        match recover_spell_file_from_canonical_data(root, &content_hash, canonical_data.as_deref()) {
            Ok(true) => summary.repaired_count += 1,
            Ok(false) => record_unrecoverable(
                &mut summary,
                &content_hash,
                "Invalid vault file and canonical_data is NULL",
            ),
            Err(reason) => record_unrecoverable(&mut summary, &content_hash, reason),
        }
    }

    Ok(summary)
}

fn collect_live_content_hashes(conn: &rusqlite::Connection) -> Result<HashSet<String>, AppError> {
    let mut live_hashes = HashSet::new();

    let mut spell_stmt =
        conn.prepare("SELECT content_hash FROM spell WHERE content_hash IS NOT NULL")?;
    let spell_rows = spell_stmt.query_map([], |row| row.get::<_, String>(0))?;
    for row in spell_rows {
        live_hashes.insert(row?);
    }

    if table_has_column(conn, "artifact", "spell_content_hash") {
        let mut artifact_stmt = conn.prepare(
            "SELECT spell_content_hash FROM artifact WHERE spell_content_hash IS NOT NULL",
        )?;
        let artifact_rows = artifact_stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in artifact_rows {
            live_hashes.insert(row?);
        }
    }

    Ok(live_hashes)
}

pub(crate) fn run_vault_gc_with_root(
    conn: &rusqlite::Connection,
    root: &Path,
) -> Result<VaultGcSummary, AppError> {
    let integrity = run_vault_integrity_check_with_root(conn, root)?;
    let live_hashes = collect_live_content_hashes(conn)?;
    let spells_dir = spell_storage_dir_in_root(root)?;
    let mut summary = VaultGcSummary {
        integrity,
        ..VaultGcSummary::default()
    };

    for entry in fs::read_dir(spells_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };

        if live_hashes.contains(stem) {
            summary.retained_count += 1;
            continue;
        }

        fs::remove_file(&path)?;
        summary.deleted_count += 1;
    }

    summary.warning_count = summary.integrity.warning_count;
    Ok(summary)
}

pub(crate) fn optimize_vault_with_root(
    conn: &rusqlite::Connection,
    root: &Path,
    maintenance_state: Option<&VaultMaintenanceState>,
) -> Result<VaultGcSummary, AppError> {
    if let Some(maintenance_state) = maintenance_state {
        maintenance_state.ensure_gc_allowed()?;
    }
    run_vault_gc_with_root(conn, root)
}

#[tauri::command]
pub async fn run_vault_integrity_check(
    state: State<'_, Arc<crate::db::pool::Pool>>,
) -> Result<VaultIntegritySummary, AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        run_vault_integrity_check_with_root(&conn, &root)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

#[tauri::command]
pub async fn optimize_vault(
    state: State<'_, Arc<crate::db::pool::Pool>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
) -> Result<VaultGcSummary, AppError> {
    let pool = state.inner().clone();
    let maintenance_state = maintenance_state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        optimize_vault_with_root(&conn, &root, Some(maintenance_state.as_ref()))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

#[tauri::command]
pub async fn backup_vault(
    pool: tauri::State<'_, std::sync::Arc<crate::db::pool::Pool>>,
    destination_path: String,
) -> Result<String, AppError> {
    use rusqlite::backup::Backup;
    use std::time::Duration;

    let _ = app_data_dir()?;
    let dest_path = PathBuf::from(&destination_path);

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::canonical_spell::CanonicalSpell;
    use rusqlite::{params, Connection};
    use sha2::{Digest, Sha256};
    use std::path::{Path, PathBuf};

    fn sample_spell() -> CanonicalSpell {
        let mut spell = CanonicalSpell::new(
            "Vault Test".to_string(),
            3,
            "ARCANE".to_string(),
            "A carefully normalized spell for vault testing.".to_string(),
        );
        spell.tags = vec!["alpha".to_string(), "beta".to_string()];
        spell
    }

    fn setup_vault_test_db(with_artifact_hash_column: bool) -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                canonical_data TEXT,
                content_hash TEXT
            );
            "#,
        )
        .expect("create spell table");

        if with_artifact_hash_column {
            conn.execute_batch(
                r#"
                CREATE TABLE artifact (
                    id INTEGER PRIMARY KEY,
                    spell_id INTEGER,
                    spell_content_hash TEXT
                );
                "#,
            )
            .expect("create artifact table with spell_content_hash");
        } else {
            conn.execute_batch(
                r#"
                CREATE TABLE artifact (
                    id INTEGER PRIMARY KEY,
                    spell_id INTEGER
                );
                "#,
            )
            .expect("create artifact table without spell_content_hash");
        }

        conn
    }

    fn insert_spell_row(
        conn: &Connection,
        id: i64,
        spell: &CanonicalSpell,
        content_hash: &str,
        canonical_data: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO spell (id, name, canonical_data, content_hash) VALUES (?, ?, ?, ?)",
            params![id, spell.name, canonical_data, content_hash],
        )
        .expect("insert spell row");
    }

    #[test]
    fn test_spell_file_path_generation_uses_spells_subdirectory() {
        let root = Path::new("C:\\SpellbookVault");
        let path = spell_file_path_in_root(root, &"a".repeat(64));

        assert_eq!(
            path,
            root.join("spells").join(format!("{}.json", "a".repeat(64)))
        );
    }

    #[test]
    fn test_windows_path_warning_threshold_behavior() {
        let below = PathBuf::from(format!("C:\\{}", "a".repeat(236)));
        let at_limit = PathBuf::from(format!("C:\\{}", "a".repeat(237)));

        assert!(!should_warn_for_windows_path_length(&below));
        assert!(should_warn_for_windows_path_length(&at_limit));
    }

    #[test]
    fn test_verify_vault_spell_json_recomputes_canonical_hash_not_raw_bytes() {
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());

        let pretty_json = serde_json::to_string_pretty(&spell).expect("serialize pretty json");
        let raw_bytes_hash = format!("{:x}", Sha256::digest(pretty_json.as_bytes()));
        assert_ne!(
            raw_bytes_hash, hash,
            "test setup must prove raw file byte hashing is not equivalent"
        );

        let verified = verify_vault_spell_json(&hash, &pretty_json).expect("verify json");
        assert_eq!(verified.name, spell.name);
    }

    #[test]
    fn test_write_rejects_target_filename_hash_mismatch() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let mut spell = sample_spell();
        let actual_hash = spell.compute_hash().expect("hash");
        spell.id = Some(actual_hash);
        let json = serde_json::to_string(&spell).expect("serialize json");

        let err = write_spell_json_atomically(
            temp_dir.path(),
            &"b".repeat(64),
            &json,
        )
        .expect_err("mismatched hash should be rejected");

        assert!(
            err.to_string().contains("does not match"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_integrity_reexports_missing_file_from_db_canonical_data() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");
        insert_spell_row(&conn, 1, &spell, &hash, Some(&json));

        let summary = run_vault_integrity_check_with_root(&conn, temp_dir.path())
            .expect("integrity check should succeed");

        assert_eq!(summary.reexported_count, 1);
        assert!(
            temp_dir.path().join("spells").join(format!("{hash}.json")).exists(),
            "integrity check should re-export the missing spell file"
        );
    }

    #[test]
    fn test_integrity_reports_missing_file_as_unrecoverable_when_canonical_data_missing() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        insert_spell_row(&conn, 1, &spell, &hash, None);

        let summary = run_vault_integrity_check_with_root(&conn, temp_dir.path())
            .expect("integrity check should succeed");

        assert_eq!(summary.unrecoverable.len(), 1);
        assert_eq!(summary.unrecoverable[0].content_hash, hash);
    }

    #[test]
    fn test_integrity_repairs_hash_mismatched_file_from_db_canonical_data() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");
        insert_spell_row(&conn, 1, &spell, &hash, Some(&json));

        let spell_path = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spell_path).expect("create spells dir");
        std::fs::write(
            spell_path.join(format!("{hash}.json")),
            r#"{"name":"Corrupt","tradition":"ARCANE","level":1,"description":"Bad","school":"Abjuration"}"#,
        )
        .expect("write corrupt spell file");

        let summary = run_vault_integrity_check_with_root(&conn, temp_dir.path())
            .expect("integrity check should succeed");

        assert_eq!(summary.repaired_count, 1);
    }

    #[test]
    fn test_gc_removes_orphaned_spell_files_and_preserves_referenced_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut live_spell = sample_spell();
        let live_hash = live_spell.compute_hash().expect("live hash");
        live_spell.id = Some(live_hash.clone());
        let live_json = serde_json::to_string(&live_spell).expect("live json");
        insert_spell_row(&conn, 1, &live_spell, &live_hash, Some(&live_json));
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash) VALUES (1, NULL, ?)",
            params![live_hash],
        )
        .expect("insert artifact reference");

        let orphan_hash = "o".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(spells_dir.join(format!("{live_hash}.json")), live_json).expect("write live file");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");

        let summary = run_vault_gc_with_root(&conn, temp_dir.path()).expect("gc should succeed");

        assert_eq!(summary.deleted_count, 1);
        assert!(spells_dir.join(format!("{live_hash}.json")).exists());
        assert!(!spells_dir.join(format!("{orphan_hash}.json")).exists());
    }

    #[test]
    fn test_gc_runs_integrity_check_first_and_recovers_missing_live_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut live_spell = sample_spell();
        let live_hash = live_spell.compute_hash().expect("hash");
        live_spell.id = Some(live_hash.clone());
        let live_json = serde_json::to_string(&live_spell).expect("json");
        insert_spell_row(&conn, 1, &live_spell, &live_hash, Some(&live_json));

        let summary = run_vault_gc_with_root(&conn, temp_dir.path()).expect("gc should succeed");

        assert_eq!(summary.integrity.reexported_count, 1);
        assert!(
            temp_dir.path().join("spells").join(format!("{live_hash}.json")).exists(),
            "gc should restore missing live file during the integrity phase"
        );
    }

    #[test]
    fn test_gc_handles_missing_artifact_spell_content_hash_column() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(false);
        let summary = run_vault_gc_with_root(&conn, temp_dir.path()).expect("gc should succeed");

        assert_eq!(summary.warning_count, 0);
    }
}
