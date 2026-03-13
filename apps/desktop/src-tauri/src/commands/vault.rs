use crate::error::AppError;
use crate::models::canonical_spell::CanonicalSpell;
use dirs::data_dir as system_data_dir;
use rusqlite::OptionalExtension;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;
use tracing::warn;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

#[cfg(test)]
use std::ffi::OsString;
#[cfg(test)]
use std::sync::MutexGuard;

const WINDOWS_PATH_WARNING_THRESHOLD: usize = 240;
const WINDOWS_PATH_HARD_LIMIT: usize = 260;

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

fn vault_settings_path_in_root(root: &Path) -> PathBuf {
    root.join("vault-settings.json")
}

fn persist_tempfile_replace(
    temp_file: tempfile::NamedTempFile,
    target_path: &Path,
    context: &str,
) -> Result<(), AppError> {
    #[cfg(windows)]
    if target_path.exists() {
        fs::remove_file(target_path).map_err(|e| {
            AppError::Unknown(format!("Failed to replace existing {context} file: {e}"))
        })?;
    }

    temp_file
        .persist(target_path)
        .map_err(|e| AppError::Unknown(format!("Failed to persist {context} file: {}", e.error)))?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    pub integrity_check_on_open: bool,
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            integrity_check_on_open: true,
        }
    }
}

fn load_vault_settings_from_root(root: &Path) -> Result<VaultSettings, AppError> {
    let path = vault_settings_path_in_root(root);
    if !path.exists() {
        return Ok(VaultSettings::default());
    }

    let raw = fs::read_to_string(&path)?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::Validation(format!("Invalid vault settings JSON: {e}")))
}

fn write_vault_settings_in_root(root: &Path, settings: &VaultSettings) -> Result<(), AppError> {
    let target_path = vault_settings_path_in_root(root);
    validate_windows_path_length(&target_path)?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::Unknown(format!("Failed to serialize vault settings: {e}")))?;

    let mut temp_file = tempfile::NamedTempFile::new_in(root).map_err(|e| {
        AppError::Unknown(format!("Failed to create vault settings temp file: {e}"))
    })?;
    temp_file.write_all(json.as_bytes())?;
    temp_file.flush()?;
    temp_file.as_file().sync_all()?;
    persist_tempfile_replace(temp_file, &target_path, "vault settings")?;

    Ok(())
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

fn validate_windows_path_length(path: &Path) -> Result<(), AppError> {
    let length = path.to_string_lossy().chars().count();
    if length >= WINDOWS_PATH_HARD_LIMIT {
        return Err(AppError::Validation(format!(
            "Windows path length {} exceeds the supported limit for vault writes; choose a shorter vault root",
            length
        )));
    }

    if should_warn_for_windows_path_length(path) {
        warn!(
            path = %path.display(),
            "Vault spell file path is near or beyond the Windows path-length safety threshold; use a shorter vault root if writes fail"
        );
    }

    Ok(())
}

#[allow(dead_code)]
pub(crate) fn spell_file_path(content_hash: &str) -> Result<PathBuf, AppError> {
    let root = app_data_dir()?;
    let path = spell_file_path_in_root(&root, content_hash);
    validate_windows_path_length(&path)?;
    Ok(path)
}

pub(crate) fn verify_vault_spell_json(
    expected_hash: &str,
    json: &str,
) -> Result<CanonicalSpell, AppError> {
    let mut canonical: CanonicalSpell = serde_json::from_str(json)
        .map_err(|e| AppError::Validation(format!("Invalid vault spell JSON: {e}")))?;
    let computed_hash = canonical
        .compute_hash()
        .map_err(|e| AppError::Validation(format!("Vault spell hash verification failed: {e}")))?;
    if computed_hash != expected_hash {
        return Err(AppError::Validation(format!(
            "Vault spell hash {computed_hash} does not match target filename hash {expected_hash}"
        )));
    }
    canonical.id = Some(expected_hash.to_string());
    Ok(canonical)
}

pub(crate) fn write_spell_json_atomically(
    root: &Path,
    content_hash: &str,
    json: &str,
) -> Result<PathBuf, AppError> {
    let canonical = verify_vault_spell_json(content_hash, json)?;
    let canonical_json = serde_json::to_string(&canonical)
        .map_err(|e| AppError::Unknown(format!("Failed to serialize vault spell JSON: {e}")))?;

    let target_path = spell_file_path_in_root(root, content_hash);
    validate_windows_path_length(&target_path)?;
    let spells_dir = spell_storage_dir_in_root(root)?;

    let mut temp_file = tempfile::NamedTempFile::new_in(&spells_dir)
        .map_err(|e| AppError::Unknown(format!("Failed to create vault temp file: {e}")))?;
    temp_file.write_all(canonical_json.as_bytes())?;
    temp_file.flush()?;
    temp_file.as_file().sync_all()?;

    persist_tempfile_replace(temp_file, &target_path, "vault spell")?;

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

fn archive_entry_name(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy().replace('\\', "/"))
        .collect::<Vec<_>>()
        .join("/")
}

fn add_file_to_backup_archive(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    archive_name: &str,
    source_path: &Path,
) -> Result<(), AppError> {
    zip.start_file(archive_name, options)
        .map_err(|e| AppError::Unknown(format!("Failed to start zip entry: {}", e)))?;
    let mut source = File::open(source_path)
        .map_err(|e| AppError::Unknown(format!("Failed to open backup source file: {}", e)))?;
    std::io::copy(&mut source, zip)
        .map_err(|e| AppError::Unknown(format!("Failed to write file to zip: {}", e)))?;
    Ok(())
}

fn add_directory_to_backup_archive(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    root: &Path,
    directory: &Path,
) -> Result<(), AppError> {
    if !directory.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            add_directory_to_backup_archive(zip, options, root, &path)?;
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .map_err(|e| AppError::Unknown(format!("Failed to derive backup path: {e}")))?;
        add_file_to_backup_archive(zip, options, &archive_entry_name(relative), &path)?;
    }

    Ok(())
}

fn restore_supporting_files_from_archive(
    archive: &mut ZipArchive<File>,
    staging_dir: &Path,
) -> Result<(), AppError> {
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| AppError::Unknown(format!("Failed to read zip entry: {}", e)))?;
        let entry_name = entry.name().to_string();
        if entry_name == "spellbook.sqlite3" {
            continue;
        }
        if entry_name != "vault-settings.json" && !entry_name.starts_with("spells/") {
            continue;
        }

        // Validate to prevent zip slip
        let entry_path = Path::new(&entry_name);
        for component in entry_path.components() {
            match component {
                std::path::Component::ParentDir
                | std::path::Component::RootDir
                | std::path::Component::Prefix(_) => {
                    return Err(AppError::Validation(format!(
                        "Invalid zip entry path: {}",
                        entry_name
                    )));
                }
                _ => {}
            }
        }

        let output_path = staging_dir.join(entry_path);
        // Ensure path is rooted in staging_dir
        if !output_path.starts_with(staging_dir) {
            return Err(AppError::Validation(format!(
                "Zip entry escapes destination: {}",
                entry_name
            )));
        }

        if (*entry.name()).ends_with('/') || entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|e| {
                AppError::Unknown(format!("Failed to create restored directory: {}", e))
            })?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(&output_path)
                .map_err(|e| AppError::Unknown(format!("Failed to create restored file: {}", e)))?;
            std::io::copy(&mut entry, &mut output).map_err(|e| {
                AppError::Unknown(format!("Failed to extract restored file: {}", e))
            })?;
        }
    }

    Ok(())
}

#[derive(Debug, Default)]
pub struct VaultMaintenanceState {
    phase: Mutex<VaultMaintenancePhase>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum VaultMaintenancePhase {
    #[default]
    Idle,
    Import,
    Gc,
}

#[derive(Debug)]
pub struct VaultImportGuard<'a> {
    state: &'a VaultMaintenanceState,
}

#[derive(Debug)]
pub struct VaultGcGuard<'a> {
    state: &'a VaultMaintenanceState,
}

#[cfg(test)]
pub(crate) fn vault_env_lock() -> &'static Mutex<()> {
    use std::sync::OnceLock;

    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
pub(crate) fn lock_vault_env_for_test() -> MutexGuard<'static, ()> {
    vault_env_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct VaultTestEnvGuard {
    _lock: MutexGuard<'static, ()>,
    root: PathBuf,
    _temp_dir: Option<tempfile::TempDir>,
    previous_data_dir: Option<OsString>,
}

#[cfg(test)]
impl VaultTestEnvGuard {
    pub(crate) fn new_temp() -> Result<Self, AppError> {
        let lock = lock_vault_env_for_test();
        Self::new_temp_with_lock(lock)
    }

    fn new_temp_with_lock(lock: MutexGuard<'static, ()>) -> Result<Self, AppError> {
        let temp_dir = tempfile::tempdir()
            .map_err(|e| AppError::Unknown(format!("Failed to create temp vault dir: {e}")))?;
        Self::with_root_and_tempdir(lock, temp_dir.path().to_path_buf(), Some(temp_dir))
    }

    pub(crate) fn with_root(root: PathBuf) -> Result<Self, AppError> {
        let lock = lock_vault_env_for_test();
        Self::with_root_and_tempdir(lock, root, None)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.root
    }

    fn restore_env(&mut self) {
        match &self.previous_data_dir {
            Some(previous) => std::env::set_var("SPELLBOOK_DATA_DIR", previous),
            None => std::env::remove_var("SPELLBOOK_DATA_DIR"),
        }
    }

    fn with_root_and_tempdir(
        lock: MutexGuard<'static, ()>,
        root: PathBuf,
        temp_dir: Option<tempfile::TempDir>,
    ) -> Result<Self, AppError> {
        let previous_data_dir = std::env::var_os("SPELLBOOK_DATA_DIR");
        std::env::set_var("SPELLBOOK_DATA_DIR", &root);

        Ok(Self {
            _lock: lock,
            root,
            _temp_dir: temp_dir,
            previous_data_dir,
        })
    }
}

#[cfg(test)]
impl Drop for VaultTestEnvGuard {
    fn drop(&mut self) {
        self.restore_env();
    }
}

impl VaultMaintenanceState {
    pub fn start_import(&self) -> Result<VaultImportGuard<'_>, AppError> {
        let mut phase = self
            .phase
            .lock()
            .map_err(|_| AppError::Unknown("Vault maintenance state is poisoned".to_string()))?;
        match *phase {
            VaultMaintenancePhase::Idle => {
                *phase = VaultMaintenancePhase::Import;
            }
            VaultMaintenancePhase::Import => {
                return Err(AppError::Import(
                    "Another import is already in progress.".to_string(),
                ));
            }
            VaultMaintenancePhase::Gc => {
                return Err(AppError::Import(
                    "Vault optimization is currently in progress.".to_string(),
                ));
            }
        }
        drop(phase);
        Ok(VaultImportGuard { state: self })
    }

    pub fn start_gc(&self) -> Result<VaultGcGuard<'_>, AppError> {
        let mut phase = self
            .phase
            .lock()
            .map_err(|_| AppError::Unknown("Vault maintenance state is poisoned".to_string()))?;
        match *phase {
            VaultMaintenancePhase::Idle => {
                *phase = VaultMaintenancePhase::Gc;
            }
            VaultMaintenancePhase::Import => {
                return Err(AppError::Validation(
                    "Vault optimization is unavailable while an import is in progress.".to_string(),
                ));
            }
            VaultMaintenancePhase::Gc => {
                return Err(AppError::Validation(
                    "Vault optimization is already in progress.".to_string(),
                ));
            }
        }
        drop(phase);
        Ok(VaultGcGuard { state: self })
    }
}

impl Drop for VaultImportGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut phase) = self.state.phase.lock() {
            if *phase == VaultMaintenancePhase::Import {
                *phase = VaultMaintenancePhase::Idle;
            }
        }
    }
}

impl<'a> VaultImportGuard<'a> {
    pub fn into_gc_guard(self) -> Result<VaultGcGuard<'a>, AppError> {
        {
            let mut phase = self.state.phase.lock().map_err(|_| {
                AppError::Unknown("Vault maintenance state is poisoned".to_string())
            })?;
            if *phase != VaultMaintenancePhase::Import {
                return Err(AppError::Unknown(
                    "Vault maintenance state lost the active import guard".to_string(),
                ));
            }
            *phase = VaultMaintenancePhase::Gc;
        }

        let state = self.state;
        std::mem::forget(self);
        Ok(VaultGcGuard { state })
    }
}

impl Drop for VaultGcGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut phase) = self.state.phase.lock() {
            if *phase == VaultMaintenancePhase::Gc {
                *phase = VaultMaintenancePhase::Idle;
            }
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
    let reason = reason.into();
    warn!(
        content_hash,
        reason, "Vault integrity recovery could not repair spell file"
    );
    summary.unrecoverable.push(VaultUnrecoverableEntry {
        content_hash: content_hash.to_string(),
        reason,
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
    let live_hashes = collect_live_content_hashes(conn)?;

    for content_hash in live_hashes {
        let spell_exists: bool = conn
            .query_row(
                "SELECT 1 FROM spell WHERE content_hash = ?",
                [content_hash.as_str()],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        let canonical_data = if spell_exists {
            conn.query_row(
                "SELECT canonical_data FROM spell WHERE content_hash = ?",
                [content_hash.as_str()],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten()
        } else {
            None
        };

        summary.checked_count += 1;
        let path = spell_file_path_in_root(root, &content_hash);

        let missing_db_reason = if !spell_exists {
            "Hash referenced only by artifact/list; spell row deleted, cannot recover vault file".to_string()
        } else {
            "canonical_data is NULL in spell table".to_string()
        };

        if !path.exists() {
            summary.missing_count += 1;
            match recover_spell_file_from_canonical_data(
                root,
                &content_hash,
                canonical_data.as_deref(),
            ) {
                Ok(true) => summary.reexported_count += 1,
                Ok(false) => record_unrecoverable(
                    &mut summary,
                    &content_hash,
                    if !spell_exists { missing_db_reason } else { format!("Missing vault file and {missing_db_reason}") },
                ),
                Err(reason) => record_unrecoverable(&mut summary, &content_hash, reason),
            }
            continue;
        }

        let file_json = match fs::read_to_string(&path) {
            Ok(json) => json,
            Err(err) => {
                match recover_spell_file_from_canonical_data(
                    root,
                    &content_hash,
                    canonical_data.as_deref(),
                ) {
                    Ok(true) => summary.repaired_count += 1,
                    Ok(false) => record_unrecoverable(
                        &mut summary,
                        &content_hash,
                        if !spell_exists { missing_db_reason } else { format!("Failed to read vault spell file: {err}; {missing_db_reason}") },
                    ),
                    Err(reason) => record_unrecoverable(&mut summary, &content_hash, reason),
                }
                continue;
            }
        };

        if verify_vault_spell_json(&content_hash, &file_json).is_ok() {
            continue;
        }

        match recover_spell_file_from_canonical_data(root, &content_hash, canonical_data.as_deref())
        {
            Ok(true) => summary.repaired_count += 1,
            Ok(false) => record_unrecoverable(
                &mut summary,
                &content_hash,
                if !spell_exists { missing_db_reason } else { format!("Invalid vault file and {missing_db_reason}") },
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

    if table_has_column(conn, "character_class_spell", "spell_content_hash") {
        let mut ccs_stmt = conn.prepare(
            "SELECT spell_content_hash FROM character_class_spell WHERE spell_content_hash IS NOT NULL",
        )?;
        let ccs_rows = ccs_stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in ccs_rows {
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
    let _gc_guard = maintenance_state
        .map(VaultMaintenanceState::start_gc)
        .transpose()?;
    run_vault_gc_with_root(conn, root)
}

#[tauri::command]
pub async fn get_vault_settings() -> Result<VaultSettings, AppError> {
    tokio::task::spawn_blocking(move || {
        let root = app_data_dir()?;
        load_vault_settings_from_root(&root)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

#[tauri::command]
pub async fn set_vault_integrity_check_on_open(enabled: bool) -> Result<VaultSettings, AppError> {
    tokio::task::spawn_blocking(move || {
        let root = app_data_dir()?;
        let settings = VaultSettings {
            integrity_check_on_open: enabled,
        };
        write_vault_settings_in_root(&root, &settings)?;
        Ok::<VaultSettings, AppError>(settings)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
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
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        use rusqlite::backup::Backup;
        use std::time::Duration;

        let data_dir = app_data_dir()?;
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
            let src_conn = pool.get()?;
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

        let settings_path = vault_settings_path_in_root(&data_dir);
        if settings_path.exists() {
            add_file_to_backup_archive(&mut zip, options, "vault-settings.json", &settings_path)?;
        }
        add_directory_to_backup_archive(&mut zip, options, &data_dir, &data_dir.join("spells"))?;

        // Finalize the ZIP archive
        zip.finish()
            .map_err(|e| AppError::Unknown(format!("Failed to finalize zip: {}", e)))?;

        Ok::<String, AppError>(destination_path)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

#[tauri::command]
pub async fn restore_vault(
    pool: tauri::State<'_, std::sync::Arc<crate::db::pool::Pool>>,
    backup_path: String,
    allow_overwrite: bool,
) -> Result<(), AppError> {
    let pool = pool.inner().clone();
    tokio::task::spawn_blocking(move || {
        let backup_file = PathBuf::from(&backup_path);
        let data_dir = app_data_dir()?;
        restore_vault_impl(pool, &data_dir, &backup_file, allow_overwrite)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

pub(crate) fn restore_vault_impl(
    pool: std::sync::Arc<crate::db::pool::Pool>,
    data_dir: &Path,
    backup_file: &Path,
    allow_overwrite: bool,
) -> Result<(), AppError> {
    use rusqlite::backup::Backup;
    use std::time::Duration;

    if !backup_file.exists() {
        return Err(AppError::NotFound(format!(
            "Backup file not found: {}",
            backup_file.display()
        )));
    }

    // Check if data directory has content
    let has_content = fs::read_dir(data_dir)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);

    if has_content && !allow_overwrite {
        return Err(AppError::Validation(
            "Data directory is not empty. Set allow_overwrite to true to proceed.".to_string(),
        ));
    }

    let file = File::open(backup_file)
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

    // Extract supporting files to a staging directory
    let staging_dir = data_dir.join("restore-staging");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir)?;
    }
    fs::create_dir_all(&staging_dir)?;

    let restore_result = restore_supporting_files_from_archive(&mut archive, &staging_dir);
    if let Err(e) = restore_result {
        // Cleanup staging directory on extraction failure
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(e);
    }
    drop(archive);

    // Use SQLite's restore API to restore the database
    let restore_db_result = (|| -> Result<(), AppError> {
        let src_conn = rusqlite::Connection::open(temp_db_path)
            .map_err(|e| AppError::Unknown(format!("Failed to open temp db: {}", e)))?;
        let mut dst_conn = pool.get()?;

        let backup = Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| AppError::Unknown(format!("Failed to init restore: {}", e)))?;

        backup
            .run_to_completion(5, Duration::from_millis(250), None)
            .map_err(|e| AppError::Unknown(format!("Failed to restore database: {}", e)))?;
        drop(backup);

        let _ = run_vault_integrity_check_with_root(&dst_conn, data_dir)?;
        Ok(())
    })();

    if restore_db_result.is_err() {
        // Cleanup staging directory on database restore failure
        let _ = fs::remove_dir_all(&staging_dir);
        return restore_db_result;
    }

    // Database and staging were successful. Move staging into place as atomically as possible.
    // On Windows and macOS, we need to handle existing directories gracefully.
    let live_spells_dir = data_dir.join("spells");
    let live_settings_file = data_dir.join("vault-settings.json");
    let staged_spells_dir = staging_dir.join("spells");
    let staged_settings_file = staging_dir.join("vault-settings.json");

    let backup_spells_dir = data_dir.join("spells.old");
    let backup_settings_file = data_dir.join("vault-settings.json.old");

    // Clean up any stale backups from before
    let _ = fs::remove_dir_all(&backup_spells_dir);
    let _ = fs::remove_file(&backup_settings_file);

    // Move live files into backups
    let spells_backed_up = if live_spells_dir.exists() {
        fs::rename(&live_spells_dir, &backup_spells_dir).is_ok()
    } else {
        false
    };
    let settings_backed_up = if live_settings_file.exists() {
        fs::rename(&live_settings_file, &backup_settings_file).is_ok()
    } else {
        false
    };

    // Move staging to live
    let restore_spells_success =
        !staged_spells_dir.exists() || fs::rename(&staged_spells_dir, &live_spells_dir).is_ok();
    let restore_settings_success = !staged_settings_file.exists()
        || fs::rename(&staged_settings_file, &live_settings_file).is_ok();

    // If either failed, try to rollback
    if !restore_spells_success || !restore_settings_success {
        if restore_spells_success && staged_spells_dir.exists() {
            let _ = fs::rename(&live_spells_dir, &staged_spells_dir);
        }
        if restore_settings_success && staged_settings_file.exists() {
            let _ = fs::rename(&live_settings_file, &staged_settings_file);
        }

        if spells_backed_up {
            let _ = fs::rename(&backup_spells_dir, &live_spells_dir);
        }
        if settings_backed_up {
            let _ = fs::rename(&backup_settings_file, &live_settings_file);
        }

        let _ = fs::remove_dir_all(&staging_dir);
        return Err(AppError::Unknown(
            "Failed to atomically move restore artifacts into place".to_string(),
        ));
    }

    // Cleanup backups on success
    if spells_backed_up {
        let _ = fs::remove_dir_all(&backup_spells_dir);
    }
    if settings_backed_up {
        let _ = fs::remove_file(&backup_settings_file);
    }

    // Final cleanup of staging directory
    let _ = fs::remove_dir_all(&staging_dir);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::canonical_spell::CanonicalSpell;
    use rusqlite::{params, Connection};
    use sha2::{Digest, Sha256};
    use std::panic::{self, AssertUnwindSafe};
    use std::path::{Path, PathBuf};

    fn sample_spell() -> CanonicalSpell {
        let mut spell = CanonicalSpell::new(
            "Vault Test".to_string(),
            3,
            "ARCANE".to_string(),
            "A carefully normalized spell for vault testing.".to_string(),
        );
        spell.school = Some("Abjuration".to_string());
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
    fn test_load_vault_settings_defaults_to_integrity_check_on_open() {
        let temp_dir = tempfile::tempdir().expect("temp dir");

        let settings =
            load_vault_settings_from_root(temp_dir.path()).expect("load default settings");

        assert!(settings.integrity_check_on_open);
    }

    #[test]
    fn test_write_and_load_vault_settings_round_trip() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let expected = VaultSettings {
            integrity_check_on_open: false,
        };

        write_vault_settings_in_root(temp_dir.path(), &expected).expect("write settings");
        let actual = load_vault_settings_from_root(temp_dir.path()).expect("read settings");

        assert_eq!(actual, expected);
    }

    #[test]
    fn test_backup_helpers_include_spell_files_and_settings() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let data_dir = temp_dir.path().join("vault");
        std::fs::create_dir_all(data_dir.join("spells")).expect("create spells dir");
        std::fs::write(
            data_dir.join("vault-settings.json"),
            r#"{"integrityCheckOnOpen":false}"#,
        )
        .expect("write settings");
        std::fs::write(
            data_dir.join("spells").join("hash.json"),
            r#"{"id":"hash"}"#,
        )
        .expect("write spell file");

        let temp_db = temp_dir.path().join("spellbook.sqlite3");
        std::fs::write(&temp_db, "db").expect("write db");

        let backup_path = temp_dir.path().join("backup.zip");
        let file = File::create(&backup_path).expect("create backup archive");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);

        add_file_to_backup_archive(&mut zip, options, "spellbook.sqlite3", &temp_db)
            .expect("archive db");
        add_file_to_backup_archive(
            &mut zip,
            options,
            "vault-settings.json",
            &data_dir.join("vault-settings.json"),
        )
        .expect("archive settings");
        add_directory_to_backup_archive(&mut zip, options, &data_dir, &data_dir.join("spells"))
            .expect("archive spells");
        zip.finish().expect("finish archive");

        let file = File::open(&backup_path).expect("open backup archive");
        let mut archive = ZipArchive::new(file).expect("read backup archive");
        assert!(archive.by_name("spellbook.sqlite3").is_ok());
        assert!(archive.by_name("vault-settings.json").is_ok());
        assert!(archive.by_name("spells/hash.json").is_ok());
    }

    #[test]
    fn test_restore_supporting_files_from_archive_replaces_existing_spell_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let backup_path = temp_dir.path().join("backup.zip");
        let file = File::create(&backup_path).expect("create backup archive");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        let source_dir = temp_dir.path().join("source");
        std::fs::create_dir_all(source_dir.join("spells")).expect("create source spells dir");
        std::fs::write(source_dir.join("spellbook.sqlite3"), "db").expect("write db");
        std::fs::write(
            source_dir.join("vault-settings.json"),
            r#"{"integrityCheckOnOpen":true}"#,
        )
        .expect("write settings");
        std::fs::write(
            source_dir.join("spells").join("new.json"),
            r#"{"id":"new"}"#,
        )
        .expect("write spell file");
        add_file_to_backup_archive(
            &mut zip,
            options,
            "spellbook.sqlite3",
            &source_dir.join("spellbook.sqlite3"),
        )
        .expect("archive db");
        add_file_to_backup_archive(
            &mut zip,
            options,
            "vault-settings.json",
            &source_dir.join("vault-settings.json"),
        )
        .expect("archive settings");
        add_directory_to_backup_archive(&mut zip, options, &source_dir, &source_dir.join("spells"))
            .expect("archive spells");
        zip.finish().expect("finish archive");

        let data_dir = temp_dir.path().join("restore-target");
        std::fs::create_dir_all(data_dir.join("spells")).expect("create target spells dir");

        let file = File::open(&backup_path).expect("open backup archive");
        let mut archive = ZipArchive::new(file).expect("read backup archive");
        restore_supporting_files_from_archive(&mut archive, &data_dir)
            .expect("restore supporting files");

        assert!(data_dir.join("vault-settings.json").exists());
        assert!(data_dir.join("spells").join("new.json").exists());
    }

    #[test]
    fn test_write_vault_settings_overwrites_existing_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir");

        write_vault_settings_in_root(
            temp_dir.path(),
            &VaultSettings {
                integrity_check_on_open: true,
            },
        )
        .expect("write initial settings");
        write_vault_settings_in_root(
            temp_dir.path(),
            &VaultSettings {
                integrity_check_on_open: false,
            },
        )
        .expect("overwrite existing settings");

        let actual =
            load_vault_settings_from_root(temp_dir.path()).expect("read overwritten settings");
        assert!(!actual.integrity_check_on_open);
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
    fn test_write_rejects_windows_paths_at_or_above_hard_limit() {
        let long_root = PathBuf::from(format!("C:\\{}", "a".repeat(252)));
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize json");

        let err = write_spell_json_atomically(&long_root, &hash, &json)
            .expect_err("writes beyond the Windows hard limit should be rejected");

        assert!(
            err.to_string().contains("Windows path length"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_vault_test_env_guard_recovers_after_panic_and_cleans_env() {
        let panic_result = panic::catch_unwind(AssertUnwindSafe(|| {
            let env = VaultTestEnvGuard::new_temp().expect("acquire isolated vault env");
            let active_root = std::env::var_os("SPELLBOOK_DATA_DIR")
                .expect("isolated env should set SPELLBOOK_DATA_DIR");
            assert_eq!(PathBuf::from(active_root), env.path().to_path_buf());
            panic!("intentional panic while holding isolated vault env");
        }));

        assert!(panic_result.is_err(), "panic should be captured for regression coverage");
        assert!(
            vault_env_lock().is_poisoned(),
            "panic should poison the raw test env lock before helper recovery"
        );
        assert!(
            std::env::var_os("SPELLBOOK_DATA_DIR").is_none(),
            "isolated env guard must clean SPELLBOOK_DATA_DIR during unwind"
        );

        let recovered = VaultTestEnvGuard::new_temp()
            .expect("isolated env guard should recover from a poisoned lock");
        assert!(
            recovered.previous_data_dir.is_none(),
            "cleanup during unwind should leave no preexisting env for the next guard"
        );
        assert_eq!(
            std::env::var_os("SPELLBOOK_DATA_DIR"),
            Some(recovered.path().as_os_str().to_os_string())
        );
        drop(recovered);

        let recovered_again = VaultTestEnvGuard::new_temp()
            .expect("isolated env guard should keep recovering from the poisoned lock");
        assert_eq!(
            std::env::var_os("SPELLBOOK_DATA_DIR"),
            Some(recovered_again.path().as_os_str().to_os_string())
        );
    }

    #[test]
    fn test_vault_test_env_guard_restores_preexisting_env_value() {
        let lock = lock_vault_env_for_test();
        std::env::set_var("SPELLBOOK_DATA_DIR", "preexisting-vault-root");
        let mut env = VaultTestEnvGuard::new_temp_with_lock(lock)
            .expect("acquire isolated vault env with preexisting value captured");
        assert_eq!(
            std::env::var_os("SPELLBOOK_DATA_DIR"),
            Some(env.path().as_os_str().to_os_string())
        );
        env.restore_env();
        assert_eq!(
            std::env::var_os("SPELLBOOK_DATA_DIR"),
            Some(std::ffi::OsString::from("preexisting-vault-root")),
            "guard should restore the preexisting env value on drop"
        );
        env.previous_data_dir = None;
        drop(env);
        std::env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn test_maintenance_state_blocks_gc_while_import_active() {
        let maintenance_state = VaultMaintenanceState::default();
        let _import_guard = maintenance_state.start_import().expect("start import");

        let err = maintenance_state
            .start_gc()
            .expect_err("gc should not start while import is active");

        assert!(
            err.to_string().contains("import"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_maintenance_state_blocks_import_while_gc_active() {
        let maintenance_state = VaultMaintenanceState::default();
        let _gc_guard = maintenance_state.start_gc().expect("start gc");

        let err = maintenance_state
            .start_import()
            .expect_err("import should not start while gc is active");

        assert!(
            err.to_string().contains("Vault optimization"),
            "unexpected error: {err}"
        );
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
    fn test_verify_vault_spell_json_rejects_unknown_properties() {
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());

        let mut value = serde_json::to_value(&spell).expect("serialize spell");
        value
            .as_object_mut()
            .expect("spell object")
            .insert("unexpectedField".to_string(), serde_json::json!("tampered"));
        let json = serde_json::to_string(&value).expect("serialize tampered json");

        let err = verify_vault_spell_json(&hash, &json)
            .expect_err("unknown top-level properties should fail integrity verification");

        assert!(
            err.to_string().contains("Validation error"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_write_rejects_target_filename_hash_mismatch() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let mut spell = sample_spell();
        let actual_hash = spell.compute_hash().expect("hash");
        spell.id = Some(actual_hash);
        let json = serde_json::to_string(&spell).expect("serialize json");

        let err = write_spell_json_atomically(temp_dir.path(), &"b".repeat(64), &json)
            .expect_err("mismatched hash should be rejected");

        assert!(
            err.to_string().contains("does not match"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_write_spell_json_atomically_rewrites_stale_embedded_id() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let mut spell = sample_spell();
        let actual_hash = spell.compute_hash().expect("hash");
        spell.id = Some("a".repeat(64));
        let json = serde_json::to_string(&spell).expect("serialize json");

        let path =
            write_spell_json_atomically(temp_dir.path(), &actual_hash, &json).expect("write spell");
        let written_json = fs::read_to_string(path).expect("read written json");
        let written_spell: CanonicalSpell =
            serde_json::from_str(&written_json).expect("deserialize written spell");

        assert_eq!(
            written_spell.id.as_deref(),
            Some(actual_hash.as_str()),
            "vault writes should heal stale embedded ids to the filename hash"
        );
    }

    #[test]
    fn test_write_spell_json_atomically_overwrites_existing_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let mut spell = sample_spell();
        let actual_hash = spell.compute_hash().expect("hash");
        spell.id = Some(actual_hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize json");

        let path = write_spell_json_atomically(temp_dir.path(), &actual_hash, &json)
            .expect("write initial spell");
        fs::write(&path, "{\"stale\":true}").expect("replace with stale content");

        write_spell_json_atomically(temp_dir.path(), &actual_hash, &json)
            .expect("overwrite existing spell file");

        let written_json = fs::read_to_string(path).expect("read overwritten spell");
        let written_spell: CanonicalSpell =
            serde_json::from_str(&written_json).expect("deserialize overwritten spell");
        assert_eq!(written_spell.id.as_deref(), Some(actual_hash.as_str()));
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
            temp_dir
                .path()
                .join("spells")
                .join(format!("{hash}.json"))
                .exists(),
            "integrity check should re-export the missing spell file"
        );
    }

    #[test]
    fn test_integrity_repairs_unreadable_file_from_db_canonical_data() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");
        insert_spell_row(&conn, 1, &spell, &hash, Some(&json));

        let path = temp_dir.path().join("spells").join(format!("{hash}.json"));
        fs::create_dir_all(path.parent().expect("spell parent")).expect("create spells dir");
        fs::write(&path, [0xff_u8, 0xfe_u8, 0xfd_u8]).expect("write unreadable bytes");

        let summary = run_vault_integrity_check_with_root(&conn, temp_dir.path())
            .expect("integrity check should recover unreadable files");

        assert_eq!(summary.repaired_count, 1);
        assert!(summary.unrecoverable.is_empty());
        let repaired_json = fs::read_to_string(path).expect("read repaired spell");
        let repaired_spell: CanonicalSpell =
            serde_json::from_str(&repaired_json).expect("deserialize repaired spell");
        assert_eq!(repaired_spell.id.as_deref(), Some(hash.as_str()));
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
        assert_eq!(
            summary.unrecoverable[0].reason,
            "Missing vault file and canonical_data is NULL in spell table"
        );
    }

    #[test]
    fn test_integrity_reports_missing_artifact_only_hash_as_unrecoverable() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let artifact_only_hash = "f".repeat(64);
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash) VALUES (1, NULL, ?)",
            params![artifact_only_hash.clone()],
        )
        .expect("insert artifact-only hash reference");

        let summary = run_vault_integrity_check_with_root(&conn, temp_dir.path())
            .expect("integrity check should inspect artifact-only live hashes");

        assert_eq!(summary.checked_count, 1);
        assert_eq!(summary.missing_count, 1);
        assert_eq!(summary.unrecoverable.len(), 1);
        assert_eq!(summary.unrecoverable[0].content_hash, artifact_only_hash);
        assert_eq!(
            summary.unrecoverable[0].reason,
            "Hash referenced only by artifact/list; spell row deleted, cannot recover vault file"
        );
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
        std::fs::write(spells_dir.join(format!("{live_hash}.json")), live_json)
            .expect("write live file");
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
    fn test_gc_preserves_character_spell_hash_references() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        conn.execute(
            "CREATE TABLE character_class_spell (id INTEGER PRIMARY KEY, spell_id INTEGER, spell_content_hash TEXT)",
            [],
        )
        .expect("create character_class_spell table");

        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");

        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, NULL, ?)",
            params![hash.clone()],
        )
        .expect("insert character spell hash reference");

        let spells_dir = temp_dir.path().join("spells");
        fs::create_dir_all(&spells_dir).expect("create spells dir");
        fs::write(spells_dir.join(format!("{hash}.json")), json)
            .expect("write referenced spell file");

        let summary = run_vault_gc_with_root(&conn, temp_dir.path()).expect("gc should succeed");

        assert_eq!(summary.deleted_count, 0);
        assert_eq!(summary.retained_count, 1);
        assert!(spells_dir.join(format!("{hash}.json")).exists());
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
            temp_dir
                .path()
                .join("spells")
                .join(format!("{live_hash}.json"))
                .exists(),
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

    #[test]
    fn test_restore_supporting_files_from_archive_rejects_zip_slip() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;
        use zip::ZipWriter;

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let backup_path = temp_dir.path().join("backup.zip");

        let file = File::create(&backup_path).expect("create backup");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        zip.start_file("spells/../../somewhere.json", options)
            .expect("start malicious file");
        zip.write_all(b"bad").expect("write malicious file");

        zip.finish().expect("finish archive");

        let data_dir = temp_dir.path().join("restore-target");
        std::fs::create_dir_all(&data_dir).expect("create target dir");

        let file = File::open(&backup_path).expect("open backup archive");
        let mut archive = ZipArchive::new(file).expect("read backup archive");
        let err = restore_supporting_files_from_archive(&mut archive, &data_dir)
            .expect_err("should reject zip slip");

        assert!(err.to_string().contains("Invalid zip entry path"));
    }

    #[test]
    fn test_restore_vault_rolls_back_partial_restore_on_failure() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;
        use zip::ZipWriter;

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let data_dir = temp_dir.path().join("data");
        let _env = VaultTestEnvGuard::with_root(data_dir.clone())
            .expect("set isolated vault env");
        std::fs::create_dir_all(data_dir.join("spells")).expect("create data dir");

        // Setup LIVE vault with some files
        std::fs::write(data_dir.join("spells").join("live-spell.json"), "live")
            .expect("live spell");
        std::fs::write(data_dir.join("vault-settings.json"), "live settings")
            .expect("live settings");

        // We need a proper sqlite file to setup the initial DB pool
        let pool = crate::db::pool::init_db(None, false).expect("failed to init db pool");
        let pool_arc = std::sync::Arc::new(pool);

        let backup_path = temp_dir.path().join("backup.zip");

        let file = File::create(&backup_path).expect("create backup");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        // Corrupt SQLite database by just putting random text (SQLite Backup API will fail)
        zip.start_file("spellbook.sqlite3", options)
            .expect("start db");
        zip.write_all(b"I am not a database")
            .expect("write broken db");

        zip.start_file("spells/incoming.json", options)
            .expect("start spells");
        zip.write_all(b"incoming").expect("write incoming spell");

        zip.start_file("vault-settings.json", options)
            .expect("start incoming settings");
        zip.write_all(b"incoming settings")
            .expect("write incoming setings");

        zip.finish().expect("finish archive");

        let err = restore_vault_impl(pool_arc.clone(), &data_dir, &backup_path, true)
            .expect_err("restore should fail due to bad DB");

        assert!(
            err.to_string().contains("Failed to restore database")
                || err.to_string().contains("not an error"),
            "Error was: {}",
            err
        );

        // assert LIVE files are untouched
        assert!(data_dir.join("spells").join("live-spell.json").exists());
        assert_eq!(
            std::fs::read_to_string(data_dir.join("vault-settings.json")).unwrap(),
            "live settings"
        );

        // Incoming shouldn't exist
        assert!(!data_dir.join("spells").join("incoming.json").exists());

        // Staging and backups should be cleaned up
        assert!(!data_dir.join("restore-staging").exists());
        assert!(!data_dir.join("spells.old").exists());
        assert!(!data_dir.join("vault-settings.json.old").exists());
    }
}
