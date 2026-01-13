#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Manager;
use wait_timeout::ChildExt;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipArchive;
use zip::ZipWriter;

use dirs::data_dir as system_data_dir;

type Pool = r2d2::Pool<SqliteConnectionManager>;

#[derive(Serialize, Deserialize, Debug)]
struct SpellSummary {
    id: i64,
    name: String,
    school: Option<String>,
    level: i64,
    class_list: Option<String>,
    components: Option<String>,
    duration: Option<String>,
    source: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct SpellCreate {
    name: String,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    level: i64,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    reversible: Option<i64>,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct SpellUpdate {
    id: i64,
    name: String,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    level: i64,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    reversible: Option<i64>,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SpellDetail {
    id: Option<i64>,
    name: String,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    level: i64,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    reversible: Option<i64>,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
    artifacts: Option<Vec<SpellArtifact>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ImportSpell {
    name: String,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    level: i64,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    reversible: Option<i64>,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
    #[serde(rename = "_source_file")]
    source_file: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ImportArtifact {
    #[serde(rename = "type")]
    r#type: String,
    path: String,
    hash: String,
    imported_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ImportConflictField {
    field: String,
    existing: Option<String>,
    incoming: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ImportConflict {
    Parse {
        path: String,
        reason: String,
    },
    Spell {
        existing: Box<SpellDetail>,
        incoming: Box<SpellDetail>,
        fields: Vec<ImportConflictField>,
        artifact: Option<ImportArtifact>,
    },
}

#[derive(Deserialize)]
struct ParseConflict {
    path: String,
    reason: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SpellArtifact {
    id: i64,
    spell_id: i64,
    r#type: String,
    path: String,
    hash: String,
    imported_at: String,
}

#[derive(Serialize, Deserialize)]
struct Facets {
    schools: Vec<String>,
    sources: Vec<String>,
    levels: Vec<i64>,
    class_list: Vec<String>,
    components: Vec<String>,
    tags: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ImportFile {
    name: String,
    content: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
struct ImportResult {
    spells: Vec<SpellDetail>,
    artifacts: Vec<serde_json::Value>,
    conflicts: Vec<ImportConflict>,
    warnings: Vec<String>,
    skipped: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ImportConflictResolution {
    action: String,
    existing_id: i64,
    spell: Option<SpellUpdate>,
    artifact: Option<ImportArtifact>,
}

#[derive(Serialize, Deserialize)]
struct ResolveImportResult {
    resolved: Vec<String>,
    skipped: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct PreviewSpell {
    name: String,
    level: i64,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    reversible: Option<i64>,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
    #[serde(rename = "_confidence")]
    confidence: std::collections::HashMap<String, f32>,
    #[serde(rename = "_raw_text")]
    raw_text: Option<String>,
    #[serde(rename = "_source_file")]
    source_file: String,
}

#[derive(Serialize, Deserialize)]
struct PreviewResult {
    spells: Vec<PreviewSpell>,
    artifacts: Vec<ImportArtifact>,
    conflicts: Vec<ImportConflict>,
}

/// Preview import without saving to database - returns parsed spells with confidence scores
#[tauri::command]
fn preview_import(files: Vec<ImportFile>) -> Result<PreviewResult, String> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut paths = vec![];
    for file in files {
        let (safe_name, _) = sanitize_import_filename(&file.name);
        let path = dir.join(&safe_name);
        fs::write(&path, &file.content).map_err(|e| e.to_string())?;
        paths.push(path);
    }

    let result = call_sidecar("import", json!({"files": paths}))?;
    let spells: Vec<PreviewSpell> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| format!("Failed to parse preview spells: {}", e))?;
    let artifacts: Vec<ImportArtifact> =
        serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
            .map_err(|e| format!("Failed to parse preview artifacts: {}", e))?;
    let parse_conflicts: Vec<ParseConflict> =
        serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
            .map_err(|e| format!("Failed to parse preview conflicts: {}", e))?;
    let conflicts = parse_conflicts
        .into_iter()
        .map(|conflict| ImportConflict::Parse {
            path: conflict.path,
            reason: conflict.reason,
        })
        .collect();

    Ok(PreviewResult {
        spells,
        artifacts,
        conflicts,
    })
}

#[tauri::command]
fn import_files(
    state: tauri::State<'_, Arc<Pool>>,
    files: Vec<ImportFile>,
    allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
) -> Result<ImportResult, String> {
    import_files_with_pool(
        state.inner(),
        files,
        allow_overwrite,
        spells,
        artifacts,
        conflicts,
    )
}

fn import_files_with_pool(
    pool: &Pool,
    files: Vec<ImportFile>,
    allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
) -> Result<ImportResult, String> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut paths = vec![];
    let mut warnings = vec![];
    for file in files {
        let (safe_name, changed) = sanitize_import_filename(&file.name);
        if changed {
            warnings.push(format!(
                "Sanitized import file name '{}' to '{}'.",
                file.name, safe_name
            ));
        }
        let path = dir.join(&safe_name);
        fs::write(&path, file.content).map_err(|e| e.to_string())?;
        paths.push(path);
    }
    let needs_spells = spells.is_none();
    let needs_artifacts = artifacts
        .as_ref()
        .map(|items| items.is_empty())
        .unwrap_or(true);
    let needs_conflicts = conflicts.is_none();
    let needs_sidecar = needs_spells || needs_artifacts || needs_conflicts;

    let mut parsed_spells: Vec<SpellDetail> = vec![];
    let mut artifacts_vec: Vec<ImportArtifact> = vec![];
    let mut conflicts_vec: Vec<ImportConflict> = vec![];

    if needs_sidecar {
        let result = call_sidecar("import", json!({"files": paths}))?;
        if needs_spells {
            parsed_spells =
                serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
                    .map_err(|e| e.to_string())?;
        }
        if needs_artifacts {
            artifacts_vec =
                serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
                    .map_err(|e| format!("Failed to parse artifacts: {}", e))?;
        }
        if needs_conflicts {
            let parse_conflicts: Vec<ParseConflict> =
                serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
                    .map_err(|e| format!("Failed to parse conflicts: {}", e))?;
            conflicts_vec = parse_conflicts
                .into_iter()
                .map(|conflict| ImportConflict::Parse {
                    path: conflict.path,
                    reason: conflict.reason,
                })
                .collect();
        }
    }

    if let Some(override_artifacts) = artifacts {
        if !override_artifacts.is_empty() {
            artifacts_vec = override_artifacts;
        }
    }

    if let Some(override_conflicts) = conflicts {
        conflicts_vec = override_conflicts;
    }

    let mut artifacts_by_path = HashMap::new();
    for artifact in &artifacts_vec {
        artifacts_by_path.insert(artifact.path.clone(), artifact.clone());
    }

    let (spells_to_import, spell_sources, using_override) = match spells {
        Some(override_spells) => {
            let sources: Vec<Option<String>> = override_spells
                .iter()
                .map(|spell| spell.source_file.clone())
                .collect();
            let mapped_spells = override_spells
                .into_iter()
                .map(|spell| SpellDetail {
                    id: None,
                    name: spell.name,
                    school: spell.school,
                    sphere: spell.sphere,
                    class_list: spell.class_list,
                    level: spell.level,
                    range: spell.range,
                    components: spell.components,
                    material_components: spell.material_components,
                    casting_time: spell.casting_time,
                    duration: spell.duration,
                    area: spell.area,
                    saving_throw: spell.saving_throw,
                    reversible: spell.reversible,
                    description: spell.description,
                    tags: spell.tags,
                    source: spell.source,
                    edition: spell.edition,
                    author: spell.author,
                    license: spell.license,
                    artifacts: None,
                })
                .collect();
            (mapped_spells, sources, true)
        }
        None => {
            let sources: Vec<Option<String>> = artifacts_vec
                .iter()
                .map(|artifact| Some(artifact.path.clone()))
                .collect();
            (parsed_spells, sources, false)
        }
    };

    let conn = pool.get().map_err(|e| e.to_string())?;
    let skipped = vec![];
    let mut imported_spells = vec![];

    for (i, spell) in spells_to_import.iter().enumerate() {
        // Deduplication check
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM spell WHERE name = ? AND level = ? AND source = ?",
                params![spell.name, spell.level, spell.source],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);

        let spell_id = if let Some(id) = existing_id {
            if !allow_overwrite {
                let existing_spell = get_spell_from_conn(&conn, id)?
                    .ok_or_else(|| "Failed to fetch existing spell".to_string())?;
                let artifact = if using_override {
                    spell_sources
                        .get(i)
                        .and_then(|source| source.as_ref())
                        .and_then(|source| artifacts_by_path.get(source))
                        .cloned()
                } else {
                    spell_sources
                        .get(i)
                        .and_then(|source| source.as_ref())
                        .and_then(|source| artifacts_by_path.get(source))
                        .cloned()
                        .or_else(|| artifacts_vec.get(i).cloned())
                };
                let fields = build_conflict_fields(&existing_spell, spell);
                conflicts_vec.push(ImportConflict::Spell {
                    existing: Box::new(existing_spell),
                    incoming: Box::new(spell.clone()),
                    fields,
                    artifact,
                });
                continue;
            }
            // Update existing spell
            conn.execute(
                "UPDATE spell SET school=?, sphere=?, class_list=?, range=?, components=?, material_components=?, casting_time=?, duration=?, area=?, saving_throw=?, reversible=?, description=?, tags=?, edition=?, author=?, license=?, updated_at=? WHERE id=?",
                params![
                    spell.school,
                    spell.sphere,
                    spell.class_list,
                    spell.range,
                    spell.components,
                    spell.material_components,
                    spell.casting_time,
                    spell.duration,
                    spell.area,
                    spell.saving_throw,
                    spell.reversible.unwrap_or(0),
                    spell.description,
                    spell.tags,
                    spell.edition,
                    spell.author,
                    spell.license,
                    Utc::now().to_rfc3339(),
                    id,
                ],
            ).map_err(|e| e.to_string())?;
            id
        } else {
            // Insert new spell
            conn.execute(
                "INSERT INTO spell (name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    spell.name,
                    spell.school,
                    spell.sphere,
                    spell.class_list,
                    spell.level,
                    spell.range,
                    spell.components,
                    spell.material_components,
                    spell.casting_time,
                    spell.duration,
                    spell.area,
                    spell.saving_throw,
                    spell.reversible.unwrap_or(0),
                    spell.description,
                    spell.tags,
                    spell.source,
                    spell.edition,
                    spell.author,
                    spell.license,
                ],
            ).map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        };

        imported_spells.push(spell.clone());

        // Persist or Update Artifact
        let artifact_val = if using_override {
            spell_sources
                .get(i)
                .and_then(|source| source.as_ref())
                .and_then(|source| artifacts_by_path.get(source))
        } else {
            spell_sources
                .get(i)
                .and_then(|source| source.as_ref())
                .and_then(|source| artifacts_by_path.get(source))
                .or_else(|| artifacts_vec.get(i))
        };
        if let Some(artifact_val) = artifact_val {
            if let Err(e) = conn.execute(
                "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(spell_id, path) DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                params![
                    spell_id,
                    artifact_val.r#type,
                    artifact_val.path,
                    artifact_val.hash,
                    artifact_val.imported_at
                ]
            ) {
                warnings.push(format!("Artifact error for {}: {}", spell.name, e));
            }
        }
    }

    let artifacts_value =
        serde_json::to_value(&artifacts_vec).map_err(|e| format!("Bad artifacts: {}", e))?;

    Ok(ImportResult {
        spells: imported_spells,
        artifacts: artifacts_value.as_array().cloned().unwrap_or_default(),
        conflicts: conflicts_vec,
        warnings,
        skipped,
    })
}

#[tauri::command]
fn resolve_import_conflicts(
    state: tauri::State<'_, Arc<Pool>>,
    resolutions: Vec<ImportConflictResolution>,
) -> Result<ResolveImportResult, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut resolved = Vec::new();
    let mut skipped = Vec::new();
    let mut warnings = Vec::new();

    for resolution in resolutions {
        match resolution.action.as_str() {
            "skip" => {
                if let Some(existing_spell) = get_spell_from_conn(&conn, resolution.existing_id)? {
                    skipped.push(existing_spell.name);
                }
            }
            "overwrite" | "merge" => {
                let spell = resolution
                    .spell
                    .ok_or_else(|| "missing spell for conflict resolution".to_string())?;
                if spell.id != resolution.existing_id {
                    return Err("conflict resolution id mismatch".into());
                }
                apply_spell_update_with_conn(&conn, &spell)?;
                resolved.push(spell.name.clone());

                if let Some(artifact) = resolution.artifact {
                    if let Err(e) = conn.execute(
                        "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(spell_id, path) DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                        params![
                            spell.id,
                            artifact.r#type,
                            artifact.path,
                            artifact.hash,
                            artifact.imported_at
                        ],
                    ) {
                        warnings.push(format!("Artifact error for {}: {}", spell.name, e));
                    }
                }
            }
            _ => {
                return Err(format!(
                    "Unknown conflict resolution action: {}",
                    resolution.action
                ))
            }
        }
    }

    Ok(ResolveImportResult {
        resolved,
        skipped,
        warnings,
    })
}

#[derive(Serialize, Deserialize)]
struct ChatResponse {
    answer: String,
    citations: Vec<String>,
    meta: serde_json::Value,
}

#[derive(Deserialize, Debug)]
struct SearchFilters {
    #[serde(rename = "schools")]
    schools: Option<Vec<String>>,
    #[serde(rename = "levelMin")]
    level_min: Option<i64>,
    #[serde(rename = "levelMax")]
    level_max: Option<i64>,
    class_list: Option<String>,
    source: Option<String>,
    components: Option<String>,
    tags: Option<String>,
}

fn validate_spell_fields(name: &str, level: i64, description: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("name is required".into());
    }
    if level < 0 {
        return Err("level must be 0 or greater".into());
    }
    if description.trim().is_empty() {
        return Err("description is required".into());
    }
    Ok(())
}

fn app_data_dir() -> Result<PathBuf, String> {
    if let Ok(override_dir) = std::env::var("SPELLBOOK_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(dir);
    }
    let dir = system_data_dir()
        .ok_or("no data dir")?
        .join("SpellbookVault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
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

fn load_migrations(conn: &Connection) -> Result<(), String> {
    let sql = include_str!("../../../../db/migrations/0001_init.sql");
    match conn.execute_batch(sql) {
        Ok(()) => Ok(()),
        Err(err) => {
            let message = err.to_string();
            if message.contains("no such module: vec0") {
                let fallback = sql
                    .replace(
                        "VIRTUAL TABLE IF NOT EXISTS spell_vec USING vec0",
                        "TABLE IF NOT EXISTS spell_vec",
                    )
                    .replace("v float[384]", "v BLOB");
                eprintln!(
                    "sqlite-vec: vec0 module unavailable; falling back to blob-backed spell_vec table."
                );
                conn.execute_batch(&fallback).map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err(message)
            }
        }
    }?;
    let sql = include_str!("../../../../db/migrations/0002_add_character_type.sql");
    conn.execute_batch(sql).map_err(|e| e.to_string())?;
    Ok(())
}

fn install_sqlite_vec_if_needed(
    data_dir: &Path,
    resource_dir: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
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

    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    fs::copy(&candidate, &destination).map_err(|e| {
        format!(
            "sqlite-vec: failed to copy {} to {}: {}",
            candidate.display(),
            destination.display(),
            e
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&destination, perms).map_err(|e| e.to_string())?;
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

fn init_db(resource_dir: Option<&Path>) -> Result<Pool, String> {
    let data_dir = app_data_dir()?;
    let _ = install_sqlite_vec_if_needed(&data_dir, resource_dir)?;
    let db_path = data_dir.join("spellbook.sqlite3");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::new(manager).map_err(|e| e.to_string())?;
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        try_load_sqlite_vec(&conn, &data_dir);
        load_migrations(&conn)?;
    }
    Ok(pool)
}

fn sidecar_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.join("../../..");
    let candidate = repo_root.join("services/ml/spellbook_sidecar.py");
    if candidate.exists() {
        return Ok(candidate);
    }
    let fallback = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("spellbook/services/ml/spellbook_sidecar.py");
    if fallback.exists() {
        return Ok(fallback);
    }
    Err("spellbook_sidecar.py not found".into())
}

fn python_command() -> &'static str {
    if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    }
}

fn call_sidecar(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    fn read_pipe<R: Read>(mut pipe: Option<R>) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        if let Some(ref mut stream) = pipe {
            stream.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        }
        Ok(buffer)
    }

    fn spawn_reader<R: Read + Send + 'static>(
        pipe: Option<R>,
    ) -> std::thread::JoinHandle<Result<Vec<u8>, String>> {
        std::thread::spawn(move || read_pipe(pipe))
    }

    fn stderr_snippet(stderr: &[u8]) -> String {
        let text = String::from_utf8_lossy(stderr);
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return "<empty>".to_string();
        }
        let snippet: String = trimmed.chars().take(400).collect();
        if trimmed.chars().count() > 400 {
            format!("{snippet}…")
        } else {
            snippet
        }
    }

    let script = sidecar_path()?;
    let mut child = Command::new(python_command())
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(request.to_string().as_bytes())
            .map_err(|e| format!("sidecar {method} failed to write request: {e}"))?;
        stdin
            .write_all(b"\n")
            .map_err(|e| format!("sidecar {method} failed to write request: {e}"))?;
    }

    let stdout_handle = spawn_reader(child.stdout.take());
    let stderr_handle = spawn_reader(child.stderr.take());
    let timeout = Duration::from_secs(30);
    let status = child
        .wait_timeout(timeout)
        .map_err(|e| format!("sidecar {method} wait failed: {e}"))?;
    let status = match status {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            let _stdout = stdout_handle
                .join()
                .map_err(|_| format!("sidecar {method} failed to join stdout reader"))??;
            let stderr = stderr_handle
                .join()
                .map_err(|_| format!("sidecar {method} failed to join stderr reader"))??;
            return Err(format!(
                "sidecar {method} timed out after {}s. stderr: {}",
                timeout.as_secs(),
                stderr_snippet(&stderr)
            ));
        }
    };
    let stdout = stdout_handle
        .join()
        .map_err(|_| format!("sidecar {method} failed to join stdout reader"))??;
    let stderr = stderr_handle
        .join()
        .map_err(|_| format!("sidecar {method} failed to join stderr reader"))??;
    if !status.success() {
        return Err(format!(
            "sidecar {method} failed with status {status}. stderr: {}",
            stderr_snippet(&stderr)
        ));
    }
    let response: serde_json::Value = serde_json::from_slice(&stdout).map_err(|e| {
        format!(
            "sidecar {method} failed to parse response: {e}. stderr: {}",
            stderr_snippet(&stderr)
        )
    })?;
    if let Some(err) = response.get("error") {
        return Err(format!(
            "sidecar {method} returned error: {err}. stderr: {}",
            stderr_snippet(&stderr)
        ));
    }
    response.get("result").cloned().ok_or_else(|| {
        format!(
            "sidecar {method} missing result. stderr: {}",
            stderr_snippet(&stderr)
        )
    })
}

#[tauri::command]
fn ping() -> String {
    "pong".into()
}

#[tauri::command]
fn search_keyword(
    state: tauri::State<'_, Arc<Pool>>,
    query: String,
    filters: Option<SearchFilters>,
) -> Result<Vec<SpellSummary>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    search_keyword_with_conn(&conn, &query, filters)
}

fn search_keyword_with_conn(
    conn: &Connection,
    query: &str,
    filters: Option<SearchFilters>,
) -> Result<Vec<SpellSummary>, String> {
    let trimmed = query.trim();
    let mut results = vec![];

    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !trimmed.is_empty() {
        where_clauses.push("f MATCH ?".to_string());
        params.push(Box::new(trimmed.to_string()));
    }

    if let Some(f) = filters {
        if let Some(schools) = f.schools {
            let schools: Vec<String> = schools
                .into_iter()
                .map(|school| school.trim().to_string())
                .filter(|school| !school.is_empty())
                .collect();
            if !schools.is_empty() {
                let placeholders = vec!["?"; schools.len()].join(", ");
                where_clauses.push(format!("s.school IN ({placeholders})"));
                for school in schools {
                    params.push(Box::new(school));
                }
            }
        }
        if let Some(level_min) = f.level_min {
            where_clauses.push("s.level >= ?".to_string());
            params.push(Box::new(level_min));
        }
        if let Some(level_max) = f.level_max {
            where_clauses.push("s.level <= ?".to_string());
            params.push(Box::new(level_max));
        }
        if let Some(source) = f.source {
            if !source.is_empty() {
                where_clauses.push("s.source = ?".to_string());
                params.push(Box::new(source));
            }
        }
        if let Some(class) = f.class_list {
            if !class.is_empty() {
                // simple LIKE for MVP; ideally exact match on JSON array or normalized table
                where_clauses.push("s.class_list LIKE ?".to_string());
                params.push(Box::new(format!("%{}%", class)));
            }
        }
        if let Some(components) = f.components {
            if !components.is_empty() {
                where_clauses.push("s.components LIKE ?".to_string());
                params.push(Box::new(format!("%{}%", components)));
            }
        }
        if let Some(tags) = f.tags {
            if !tags.is_empty() {
                where_clauses.push("s.tags LIKE ?".to_string());
                params.push(Box::new(format!("%{}%", tags)));
            }
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sql = if !trimmed.is_empty() {
        // use FTS join
        format!("SELECT id, name, school, level, class_list, components, duration, source FROM spell_fts f JOIN spell s ON s.id=f.rowid {} ORDER BY bm25(f) LIMIT 50", where_sql)
    } else {
        // normal table select
        // Note: if filters exist but no query, we query `spell` directly.
        // But `where_clauses` uses `s.` prefix which works for both IF we alias `spell` as `s` in the second case.
        // Or we just handle prefixing carefully.
        // In 'spell_fts f JOIN spell s', 's.school' is valid.
        // In 'spell', 'school' is valid.
        // Let's aliasing spell as s in the standard query too.
        format!("SELECT id, name, school, level, class_list, components, duration, source FROM spell s {} ORDER BY name LIMIT 50", where_sql)
    };

    // We need to construct params ref slice
    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(SpellSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                school: row.get(2)?,
                level: row.get(3)?,
                class_list: row.get(4)?,
                components: row.get(5)?,
                duration: row.get(6)?,
                source: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
fn search_semantic(
    state: tauri::State<'_, Arc<Pool>>,
    query: String,
) -> Result<Vec<SpellSummary>, String> {
    search_keyword(state, query, None)
}

#[tauri::command]
fn list_facets(state: tauri::State<'_, Arc<Pool>>) -> Result<Facets, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut schools = vec![];
    let mut stmt = conn
        .prepare("SELECT DISTINCT school FROM spell WHERE school IS NOT NULL ORDER BY school")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        schools.push(value);
    }
    let mut sources = vec![];
    let mut stmt = conn
        .prepare("SELECT DISTINCT source FROM spell WHERE source IS NOT NULL ORDER BY source")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        sources.push(value);
    }
    let mut levels = vec![];
    let mut stmt = conn
        .prepare("SELECT DISTINCT level FROM spell ORDER BY level")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        levels.push(value);
    }
    let class_list = collect_facet_entries(
        &conn,
        "SELECT class_list FROM spell WHERE class_list IS NOT NULL",
    )?;
    let components = collect_facet_entries(
        &conn,
        "SELECT components FROM spell WHERE components IS NOT NULL",
    )?;
    let tags = collect_facet_entries(&conn, "SELECT tags FROM spell WHERE tags IS NOT NULL")?;
    Ok(Facets {
        schools,
        sources,
        levels,
        class_list,
        components,
        tags,
    })
}

fn collect_facet_entries(conn: &Connection, sql: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut entries = std::collections::HashSet::new();
    for value in rows.flatten() {
        for entry in parse_facet_entries(&value) {
            entries.insert(entry);
        }
    }
    let mut entries: Vec<String> = entries.into_iter().collect();
    entries.sort();
    Ok(entries)
}

fn parse_facet_entries(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return vec![];
    }
    if trimmed.starts_with('[') {
        if let Ok(values) = serde_json::from_str::<Vec<String>>(trimmed) {
            return values
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect();
        }
    }
    trimmed
        .split(',')
        .map(|value| value.trim().trim_matches('"').to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn get_spell_from_conn(conn: &Connection, id: i64) -> Result<Option<SpellDetail>, String> {
    let mut spell: SpellDetail = conn.query_row(
        "SELECT id, name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license FROM spell WHERE id = ?",
        [id],
        |row| {
            Ok(SpellDetail {
                id: row.get(0)?,
                name: row.get(1)?,
                school: row.get(2)?,
                sphere: row.get(3)?,
                class_list: row.get(4)?,
                level: row.get(5)?,
                range: row.get(6)?,
                components: row.get(7)?,
                material_components: row.get(8)?,
                casting_time: row.get(9)?,
                duration: row.get(10)?,
                area: row.get(11)?,
                saving_throw: row.get(12)?,
                reversible: row.get(13)?,
                description: row.get(14)?,
                tags: row.get(15)?,
                source: row.get(16)?,
                edition: row.get(17)?,
                author: row.get(18)?,
                license: row.get(19)?,
                artifacts: None,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Spell not found".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
        )
        .map_err(|e| e.to_string())?;
    let artifact_rows = stmt
        .query_map([id], |row| {
            Ok(SpellArtifact {
                id: row.get(0)?,
                spell_id: row.get(1)?,
                r#type: row.get(2)?,
                path: row.get(3)?,
                hash: row.get(4)?,
                imported_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut artifacts = vec![];
    for artifact in artifact_rows {
        artifacts.push(artifact.map_err(|e| e.to_string())?);
    }
    spell.artifacts = Some(artifacts);

    Ok(Some(spell))
}

#[tauri::command]
fn get_spell(state: tauri::State<'_, Arc<Pool>>, id: i64) -> Result<Option<SpellDetail>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    get_spell_from_conn(&conn, id)
}

#[tauri::command]
fn upsert_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellDetail) -> Result<i64, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    if let Some(id) = spell.id {
        conn.execute(
            "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?, components=?, material_components=?, casting_time=?, duration=?, area=?, saving_throw=?, reversible=?, description=?, tags=?, source=?, edition=?, author=?, license=?, updated_at=? WHERE id=?",
            params![
                spell.name,
                spell.school,
                spell.sphere,
                spell.class_list,
                spell.level,
                spell.range,
                spell.components,
                spell.material_components,
                spell.casting_time,
                spell.duration,
                spell.area,
                spell.saving_throw,
                spell.reversible.unwrap_or(0),
                spell.description,
                spell.tags,
                spell.source,
                spell.edition,
                spell.author,
                spell.license,
                Utc::now().to_rfc3339(),
                id,
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO spell (name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            spell.name,
            spell.school,
            spell.sphere,
            spell.class_list,
            spell.level,
            spell.range,
            spell.components,
            spell.material_components,
            spell.casting_time,
            spell.duration,
            spell.area,
            spell.saving_throw,
            spell.reversible.unwrap_or(0),
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn create_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellCreate) -> Result<i64, String> {
    validate_spell_fields(&spell.name, spell.level, &spell.description)?;
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO spell (name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            spell.name,
            spell.school,
            spell.sphere,
            spell.class_list,
            spell.level,
            spell.range,
            spell.components,
            spell.material_components,
            spell.casting_time,
            spell.duration,
            spell.area,
            spell.saving_throw,
            spell.reversible.unwrap_or(0),
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn update_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellUpdate) -> Result<i64, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    apply_spell_update_with_conn(&conn, &spell)
}

fn apply_spell_update_with_conn(conn: &Connection, spell: &SpellUpdate) -> Result<i64, String> {
    validate_spell_fields(&spell.name, spell.level, &spell.description)?;

    if let Some(old_spell) = get_spell_from_conn(conn, spell.id)? {
        let changes = diff_spells(&old_spell, spell);
        log_changes(conn, spell.id, changes)?;
    }

    conn.execute(
        "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?, components=?, material_components=?, casting_time=?, duration=?, area=?, saving_throw=?, reversible=?, description=?, tags=?, source=?, edition=?, author=?, license=?, updated_at=? WHERE id=?",
        params![
            spell.name,
            spell.school,
            spell.sphere,
            spell.class_list,
            spell.level,
            spell.range,
            spell.components,
            spell.material_components,
            spell.casting_time,
            spell.duration,
            spell.area,
            spell.saving_throw,
            spell.reversible.unwrap_or(0),
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
            Utc::now().to_rfc3339(),
            spell.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(spell.id)
}

#[tauri::command]
fn delete_spell(state: tauri::State<'_, Arc<Pool>>, id: i64) -> Result<(), String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM spell WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_spells(state: tauri::State<'_, Arc<Pool>>) -> Result<Vec<SpellSummary>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, school, level, class_list, components, duration, source FROM spell ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SpellSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                school: row.get(2)?,
                level: row.get(3)?,
                class_list: row.get(4)?,
                components: row.get(5)?,
                duration: row.get(6)?,
                source: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn sanitize_import_filename(name: &str) -> (String, bool) {
    let mut changed = false;
    let mut segments = Vec::new();
    for segment in name.split(|c| ['/', '\\'].contains(&c)) {
        if segment.is_empty() || segment == "." {
            if !segment.is_empty() {
                changed = true;
            }
            continue;
        }
        if segment == ".." {
            changed = true;
            continue;
        }
        segments.push(segment);
    }
    if name.contains('/') || name.contains('\\') {
        changed = true;
    }
    let basename = segments.last().copied().unwrap_or("");
    if basename != name {
        changed = true;
    }
    let mut sanitized = String::new();
    for ch in basename.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
            sanitized.push(ch);
        } else if ch.is_whitespace() {
            sanitized.push('_');
            changed = true;
        } else {
            changed = true;
        }
    }
    if sanitized.is_empty() {
        sanitized = "import".to_string();
        changed = true;
    }
    if sanitized != basename {
        changed = true;
    }
    (sanitized, changed)
}

fn backup_vault_with_pool(pool: &Pool, destination_path: String) -> Result<String, String> {
    let vault_dir = app_data_dir()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let destination = PathBuf::from(destination_path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = fs::File::create(&destination).map_err(|e| e.to_string())?;
    let destination_abs = if destination.is_absolute() {
        destination.clone()
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(&destination)
    };
    let destination_abs = destination_abs
        .canonicalize()
        .unwrap_or_else(|_| destination_abs.clone());
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let db_path = vault_dir.join("spellbook.sqlite3");
    let snapshot_path = vault_dir.join("spellbook.sqlite3.backup");
    let mut snapshot_exists = false;
    if db_path.exists() {
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        conn.execute(
            "VACUUM INTO ?",
            [snapshot_path.to_str().ok_or("non-utf8 backup path")?],
        )
        .map_err(|e| e.to_string())?;
        snapshot_exists = true;
    }

    for entry in WalkDir::new(&vault_dir) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        if path == db_path
            || path == snapshot_path
            || path == destination_abs
            || path == db_path.with_extension("sqlite3-wal")
            || path == db_path.with_extension("sqlite3-shm")
        {
            continue;
        }
        let relative = path.strip_prefix(&vault_dir).map_err(|e| e.to_string())?;
        let archive_path = relative.to_str().ok_or("non-utf8 path in vault")?;
        zip.start_file(archive_path, options)
            .map_err(|e| e.to_string())?;
        let mut source = fs::File::open(path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        source.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
    }

    if snapshot_exists {
        zip.start_file("spellbook.sqlite3", options)
            .map_err(|e| e.to_string())?;
        let mut source = fs::File::open(&snapshot_path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        source.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&snapshot_path);
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn backup_vault(
    state: tauri::State<'_, Arc<Pool>>,
    destination_path: String,
) -> Result<String, String> {
    backup_vault_with_pool(state.inner(), destination_path)
}

#[tauri::command]
fn restore_vault(backup_path: String, allow_overwrite: bool) -> Result<(), String> {
    let vault_dir = app_data_dir()?;
    let mut backup_path = PathBuf::from(backup_path);
    let mut using_temp_backup = false;
    if vault_dir.exists() {
        let has_contents = fs::read_dir(&vault_dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_some();
        if has_contents {
            if !allow_overwrite {
                return Err("vault directory is not empty".into());
            }
            let backup_abs = if backup_path.is_absolute() {
                backup_path.clone()
            } else {
                std::env::current_dir()
                    .map_err(|e| e.to_string())?
                    .join(&backup_path)
            };
            let backup_abs = backup_abs
                .canonicalize()
                .unwrap_or_else(|_| backup_abs.clone());
            if backup_abs.starts_with(&vault_dir) {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos();
                let temp_path =
                    std::env::temp_dir().join(format!("spellbook_vault_restore_{timestamp}.zip"));
                fs::copy(&backup_abs, &temp_path).map_err(|e| e.to_string())?;
                backup_path = temp_path;
                using_temp_backup = true;
            }
            fs::remove_dir_all(&vault_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
        }
    }

    let file = fs::File::open(&backup_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let mut entry_path = match entry.enclosed_name() {
            Some(path) => path.to_path_buf(),
            None => continue,
        };
        if entry_path
            .components()
            .next()
            .is_some_and(|component| component.as_os_str() == "SpellbookVault")
        {
            entry_path = entry_path.components().skip(1).collect::<PathBuf>();
        }
        if entry_path.as_os_str().is_empty() {
            continue;
        }
        let out_path = vault_dir.join(entry_path);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    if using_temp_backup {
        let _ = fs::remove_file(&backup_path);
    }
    Ok(())
}

#[tauri::command]
fn export_spells(
    state: tauri::State<'_, Arc<Pool>>,
    ids: Vec<i64>,
    format: String,
) -> Result<String, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut spells = vec![];
    for id in ids {
        if let Some(spell) = get_spell_from_conn(&conn, id)? {
            spells.push(spell);
        }
    }
    let output_dir = app_data_dir()?.join("exports");
    let result = call_sidecar(
        "export",
        json!({"spells": spells, "format": format, "output_dir": output_dir}),
    )?;
    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
fn print_spell(
    state: tauri::State<'_, Arc<Pool>>,
    spell_id: i64,
    layout: String,
    page_size: Option<String>,
) -> Result<String, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let spell =
        get_spell_from_conn(&conn, spell_id)?.ok_or_else(|| "spell not found".to_string())?;
    let output_dir = app_data_dir()?.join("prints");
    let result = call_sidecar(
        "export",
        json!({
            "mode": "single",
            "spells": [spell],
            "format": "pdf",
            "layout": layout,
            "page_size": page_size.unwrap_or_else(|| "letter".to_string()),
            "output_dir": output_dir
        }),
    )?;
    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
fn print_spellbook(
    state: tauri::State<'_, Arc<Pool>>,
    character_id: i64,
    layout: String,
    page_size: Option<String>,
) -> Result<String, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let character = conn
        .query_row(
            "SELECT name, type, notes FROM \"character\" WHERE id = ?",
            [character_id],
            |row| {
                Ok(PrintableCharacter {
                    name: row.get(0)?,
                    character_type: row.get(1)?,
                    notes: row.get(2)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.level, s.school, s.class_list, s.range, s.components, s.duration, s.saving_throw, s.description, sb.prepared, sb.known, sb.notes
             FROM spellbook sb
             JOIN spell s ON s.id = sb.spell_id
             WHERE sb.character_id = ?
             ORDER BY s.level, s.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([character_id], |row| {
            Ok(PrintableSpell {
                id: row.get(0)?,
                name: row.get(1)?,
                level: row.get(2)?,
                school: row.get(3)?,
                class_list: row.get(4)?,
                range: row.get(5)?,
                components: row.get(6)?,
                duration: row.get(7)?,
                saving_throw: row.get(8)?,
                description: row.get(9)?,
                prepared: row.get(10)?,
                known: row.get(11)?,
                notes: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut spells = vec![];
    for row in rows {
        spells.push(row.map_err(|e| e.to_string())?);
    }
    let output_dir = app_data_dir()?.join("prints");
    let result = call_sidecar(
        "export",
        json!({
            "mode": "spellbook",
            "character": character,
            "spells": spells,
            "format": "pdf",
            "layout": layout,
            "page_size": page_size.unwrap_or_else(|| "letter".to_string()),
            "output_dir": output_dir
        }),
    )?;
    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
fn chat_answer(prompt: String) -> Result<ChatResponse, String> {
    let result = call_sidecar("llm_answer", json!({"query": prompt, "contexts": []}))?;
    serde_json::from_value(result).map_err(|e| e.to_string())
}

fn diff_spells(old: &SpellDetail, new: &SpellUpdate) -> Vec<(String, String, String)> {
    let mut changes = vec![];
    if old.name != new.name {
        changes.push(("name".into(), old.name.clone(), new.name.clone()));
    }
    if old.school != new.school {
        changes.push((
            "school".into(),
            old.school.clone().unwrap_or_default(),
            new.school.clone().unwrap_or_default(),
        ));
    }
    if old.sphere != new.sphere {
        changes.push((
            "sphere".into(),
            old.sphere.clone().unwrap_or_default(),
            new.sphere.clone().unwrap_or_default(),
        ));
    }
    if old.class_list != new.class_list {
        changes.push((
            "class_list".into(),
            old.class_list.clone().unwrap_or_default(),
            new.class_list.clone().unwrap_or_default(),
        ));
    }
    if old.level != new.level {
        changes.push(("level".into(), old.level.to_string(), new.level.to_string()));
    }
    if old.range != new.range {
        changes.push((
            "range".into(),
            old.range.clone().unwrap_or_default(),
            new.range.clone().unwrap_or_default(),
        ));
    }
    if old.components != new.components {
        changes.push((
            "components".into(),
            old.components.clone().unwrap_or_default(),
            new.components.clone().unwrap_or_default(),
        ));
    }
    if old.material_components != new.material_components {
        changes.push((
            "material_components".into(),
            old.material_components.clone().unwrap_or_default(),
            new.material_components.clone().unwrap_or_default(),
        ));
    }
    if old.casting_time != new.casting_time {
        changes.push((
            "casting_time".into(),
            old.casting_time.clone().unwrap_or_default(),
            new.casting_time.clone().unwrap_or_default(),
        ));
    }
    if old.duration != new.duration {
        changes.push((
            "duration".into(),
            old.duration.clone().unwrap_or_default(),
            new.duration.clone().unwrap_or_default(),
        ));
    }
    if old.area != new.area {
        changes.push((
            "area".into(),
            old.area.clone().unwrap_or_default(),
            new.area.clone().unwrap_or_default(),
        ));
    }
    if old.saving_throw != new.saving_throw {
        changes.push((
            "saving_throw".into(),
            old.saving_throw.clone().unwrap_or_default(),
            new.saving_throw.clone().unwrap_or_default(),
        ));
    }
    match (old.reversible, new.reversible) {
        (Some(o), Some(n)) if o != n => {
            changes.push(("reversible".into(), o.to_string(), n.to_string()))
        }
        (Some(o), None) => changes.push(("reversible".into(), o.to_string(), "0".to_string())), // assuming default 0
        (None, Some(n)) if n != 0 => {
            changes.push(("reversible".into(), "0".to_string(), n.to_string()))
        }
        _ => {}
    }
    if old.description != new.description {
        changes.push((
            "description".into(),
            old.description.clone(),
            new.description.clone(),
        ));
    }
    if old.tags != new.tags {
        changes.push((
            "tags".into(),
            old.tags.clone().unwrap_or_default(),
            new.tags.clone().unwrap_or_default(),
        ));
    }
    if old.source != new.source {
        changes.push((
            "source".into(),
            old.source.clone().unwrap_or_default(),
            new.source.clone().unwrap_or_default(),
        ));
    }
    if old.edition != new.edition {
        changes.push((
            "edition".into(),
            old.edition.clone().unwrap_or_default(),
            new.edition.clone().unwrap_or_default(),
        ));
    }
    if old.author != new.author {
        changes.push((
            "author".into(),
            old.author.clone().unwrap_or_default(),
            new.author.clone().unwrap_or_default(),
        ));
    }
    if old.license != new.license {
        changes.push((
            "license".into(),
            old.license.clone().unwrap_or_default(),
            new.license.clone().unwrap_or_default(),
        ));
    }
    changes
}

fn build_conflict_fields(
    existing: &SpellDetail,
    incoming: &SpellDetail,
) -> Vec<ImportConflictField> {
    fn push_conflict(
        fields: &mut Vec<ImportConflictField>,
        field: &str,
        existing: Option<String>,
        incoming: Option<String>,
    ) {
        if existing != incoming {
            fields.push(ImportConflictField {
                field: field.to_string(),
                existing,
                incoming,
            });
        }
    }

    let mut fields = Vec::new();
    push_conflict(
        &mut fields,
        "name",
        Some(existing.name.clone()),
        Some(incoming.name.clone()),
    );
    push_conflict(
        &mut fields,
        "school",
        existing.school.clone(),
        incoming.school.clone(),
    );
    push_conflict(
        &mut fields,
        "sphere",
        existing.sphere.clone(),
        incoming.sphere.clone(),
    );
    push_conflict(
        &mut fields,
        "class_list",
        existing.class_list.clone(),
        incoming.class_list.clone(),
    );
    push_conflict(
        &mut fields,
        "level",
        Some(existing.level.to_string()),
        Some(incoming.level.to_string()),
    );
    push_conflict(
        &mut fields,
        "range",
        existing.range.clone(),
        incoming.range.clone(),
    );
    push_conflict(
        &mut fields,
        "components",
        existing.components.clone(),
        incoming.components.clone(),
    );
    push_conflict(
        &mut fields,
        "material_components",
        existing.material_components.clone(),
        incoming.material_components.clone(),
    );
    push_conflict(
        &mut fields,
        "casting_time",
        existing.casting_time.clone(),
        incoming.casting_time.clone(),
    );
    push_conflict(
        &mut fields,
        "duration",
        existing.duration.clone(),
        incoming.duration.clone(),
    );
    push_conflict(
        &mut fields,
        "area",
        existing.area.clone(),
        incoming.area.clone(),
    );
    push_conflict(
        &mut fields,
        "saving_throw",
        existing.saving_throw.clone(),
        incoming.saving_throw.clone(),
    );
    push_conflict(
        &mut fields,
        "reversible",
        existing.reversible.map(|value| value.to_string()),
        incoming.reversible.map(|value| value.to_string()),
    );
    push_conflict(
        &mut fields,
        "description",
        Some(existing.description.clone()),
        Some(incoming.description.clone()),
    );
    push_conflict(
        &mut fields,
        "tags",
        existing.tags.clone(),
        incoming.tags.clone(),
    );
    push_conflict(
        &mut fields,
        "source",
        existing.source.clone(),
        incoming.source.clone(),
    );
    push_conflict(
        &mut fields,
        "edition",
        existing.edition.clone(),
        incoming.edition.clone(),
    );
    push_conflict(
        &mut fields,
        "author",
        existing.author.clone(),
        incoming.author.clone(),
    );
    push_conflict(
        &mut fields,
        "license",
        existing.license.clone(),
        incoming.license.clone(),
    );
    fields
}

fn log_changes(
    conn: &Connection,
    spell_id: i64,
    changes: Vec<(String, String, String)>,
) -> Result<(), String> {
    for (field, old_val, new_val) in changes {
        conn.execute(
            "INSERT INTO change_log (spell_id, field, old_value, new_value) VALUES (?, ?, ?, ?)",
            params![spell_id, field, old_val, new_val],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct Character {
    id: i64,
    name: String,
    #[serde(rename = "type")]
    character_type: String,
    notes: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct CharacterSpellbookEntry {
    spell_id: i64,
    name: String,
    level: i64,
    school: Option<String>,
    prepared: i64,
    known: i64,
    notes: Option<String>,
}

#[derive(Serialize)]
struct PrintableCharacter {
    name: String,
    #[serde(rename = "type")]
    character_type: String,
    notes: Option<String>,
}

#[derive(Serialize)]
struct PrintableSpell {
    id: i64,
    name: String,
    level: i64,
    school: Option<String>,
    class_list: Option<String>,
    range: Option<String>,
    components: Option<String>,
    duration: Option<String>,
    saving_throw: Option<String>,
    description: String,
    prepared: i64,
    known: i64,
    notes: Option<String>,
}

#[tauri::command]
fn create_character(
    state: tauri::State<'_, Arc<Pool>>,
    name: String,
    character_type: String,
    notes: Option<String>,
) -> Result<i64, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let character_type = if character_type.trim().is_empty() {
        "PC".to_string()
    } else {
        character_type
    };
    conn.execute(
        "INSERT INTO \"character\" (name, type, notes) VALUES (?, ?, ?)",
        params![name, character_type, notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn list_characters(state: tauri::State<'_, Arc<Pool>>) -> Result<Vec<Character>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, type, notes FROM \"character\" ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                character_type: row.get(2)?,
                notes: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
fn get_character_spellbook(
    state: tauri::State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Vec<CharacterSpellbookEntry>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    get_character_spellbook_with_conn(&conn, character_id)
}

#[tauri::command]
fn update_character_spell(
    state: tauri::State<'_, Arc<Pool>>,
    character_id: i64,
    spell_id: i64,
    prepared: i64,
    known: i64,
    notes: Option<String>,
) -> Result<(), String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    update_character_spell_with_conn(&conn, character_id, spell_id, prepared, known, notes)
}

#[tauri::command]
fn remove_character_spell(
    state: tauri::State<'_, Arc<Pool>>,
    character_id: i64,
    spell_id: i64,
) -> Result<(), String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM spellbook WHERE character_id = ? AND spell_id = ?",
        params![character_id, spell_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_character_spellbook_with_conn(
    conn: &Connection,
    character_id: i64,
) -> Result<Vec<CharacterSpellbookEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.level, s.school, sb.prepared, sb.known, sb.notes 
             FROM spellbook sb 
             JOIN spell s ON s.id = sb.spell_id 
             WHERE sb.character_id = ? 
             ORDER BY s.level, s.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([character_id], |row| {
            Ok(CharacterSpellbookEntry {
                spell_id: row.get(0)?,
                name: row.get(1)?,
                level: row.get(2)?,
                school: row.get(3)?,
                prepared: row.get(4)?,
                known: row.get(5)?,
                notes: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn update_character_spell_with_conn(
    conn: &Connection,
    character_id: i64,
    spell_id: i64,
    prepared: i64,
    known: i64,
    notes: Option<String>,
) -> Result<(), String> {
    // upsert
    conn.execute(
        "INSERT INTO spellbook (character_id, spell_id, prepared, known, notes) 
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(character_id, spell_id) DO UPDATE SET 
            prepared=excluded.prepared, 
            known=excluded.known, 
            notes=excluded.notes",
        params![character_id, spell_id, prepared, known, notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reparse_artifact(
    state: tauri::State<'_, Arc<Pool>>,
    artifact_id: i64,
) -> Result<SpellDetail, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;

    // 1. Query artifact table for path and spell_id
    let (spell_id, artifact_path): (i64, String) = conn
        .query_row(
            "SELECT spell_id, path FROM artifact WHERE id = ?",
            [artifact_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Artifact not found: {}", e))?;

    // Verify the file still exists
    let path = std::path::Path::new(&artifact_path);
    if !path.exists() {
        return Err(format!(
            "Artifact file no longer exists at: {}",
            artifact_path
        ));
    }

    // 2. Fetch original spell for diff comparison
    let original_spell = get_spell_from_conn(&conn, spell_id)?
        .ok_or_else(|| "Original spell not found".to_string())?;

    // 3. Call Python sidecar to re-parse the file
    let result = call_sidecar("import", json!({"files": [artifact_path]}))?;
    let spells: Vec<SpellDetail> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| format!("Failed to parse sidecar response: {}", e))?;

    let parsed_spell = spells
        .into_iter()
        .next()
        .ok_or_else(|| "Sidecar did not return any parsed spells".to_string())?;

    // 4. Update spell record with new data
    conn.execute(
        "UPDATE spell SET 
            name=?, level=?, source=?, school=?, sphere=?, class_list=?, range=?, components=?, 
            material_components=?, casting_time=?, duration=?, area=?, 
            saving_throw=?, reversible=?, description=?, tags=?, 
            edition=?, author=?, license=?, updated_at=? 
         WHERE id=?",
        params![
            parsed_spell.name,
            parsed_spell.level,
            parsed_spell.source,
            parsed_spell.school,
            parsed_spell.sphere,
            parsed_spell.class_list,
            parsed_spell.range,
            parsed_spell.components,
            parsed_spell.material_components,
            parsed_spell.casting_time,
            parsed_spell.duration,
            parsed_spell.area,
            parsed_spell.saving_throw,
            parsed_spell.reversible.unwrap_or(0),
            parsed_spell.description,
            parsed_spell.tags,
            parsed_spell.edition,
            parsed_spell.author,
            parsed_spell.license,
            Utc::now().to_rfc3339(),
            spell_id,
        ],
    )
    .map_err(|e| format!("Failed to update spell: {}", e))?;

    // 5. Log changes to change_log
    let update_for_diff = SpellUpdate {
        id: spell_id,
        name: parsed_spell.name.clone(),
        school: parsed_spell.school.clone(),
        sphere: parsed_spell.sphere.clone(),
        class_list: parsed_spell.class_list.clone(),
        level: parsed_spell.level,
        range: parsed_spell.range.clone(),
        components: parsed_spell.components.clone(),
        material_components: parsed_spell.material_components.clone(),
        casting_time: parsed_spell.casting_time.clone(),
        duration: parsed_spell.duration.clone(),
        area: parsed_spell.area.clone(),
        saving_throw: parsed_spell.saving_throw.clone(),
        reversible: parsed_spell.reversible,
        description: parsed_spell.description.clone(),
        tags: parsed_spell.tags.clone(),
        source: parsed_spell.source.clone(),
        edition: parsed_spell.edition.clone(),
        author: parsed_spell.author.clone(),
        license: parsed_spell.license.clone(),
    };
    let changes = diff_spells(&original_spell, &update_for_diff);
    if !changes.is_empty() {
        log_changes(&conn, spell_id, changes)?;
    }

    // 6. Update artifact's imported_at timestamp
    conn.execute(
        "UPDATE artifact SET imported_at = ? WHERE id = ?",
        params![Utc::now().to_rfc3339(), artifact_id],
    )
    .map_err(|e| format!("Failed to update artifact timestamp: {}", e))?;

    // 7. Return updated spell
    get_spell_from_conn(&conn, spell_id)?.ok_or_else(|| "Failed to fetch updated spell".to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir_override = std::env::var("SPELLBOOK_SQLITE_VEC_RESOURCE_DIR").ok();
            let resource_dir = resource_dir_override
                .as_deref()
                .map(PathBuf::from)
                .or_else(|| app.path().resource_dir().ok());
            let pool = init_db(resource_dir.as_deref())?;
            app.manage(Arc::new(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            search_keyword,
            search_semantic,
            list_facets,
            get_spell,
            upsert_spell,
            create_spell,
            update_spell,
            delete_spell,
            list_spells,
            import_files,
            resolve_import_conflicts,
            backup_vault,
            restore_vault,
            export_spells,
            print_spell,
            print_spellbook,
            chat_answer,
            create_character,
            list_characters,
            get_character_spellbook,
            update_character_spell,
            remove_character_spell,
            reparse_artifact,
            preview_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::env;
    use std::sync::{Mutex, OnceLock};
    use tauri::test::{mock_builder, mock_context, noop_assets};
    use tempfile::TempDir;

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env lock")
    }

    #[test]
    fn load_migrations_creates_core_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        load_migrations(&conn).expect("load migrations");

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
            .expect("prepare table lookup");
        let names: HashSet<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query table names")
            .filter_map(Result::ok)
            .collect();

        assert!(names.contains("spell"));
        assert!(names.contains("spell_fts"));
    }

    #[test]
    fn backup_restore_roundtrip() {
        let _guard = env_lock();
        let temp_dir = TempDir::new().expect("temp dir");
        let vault_dir = temp_dir.path().join("SpellbookVault");
        env::set_var("SPELLBOOK_DATA_DIR", &vault_dir);
        let backup_path = temp_dir.path().join("backup.zip");
        {
            let pool = init_db(None).expect("init db");
            fs::create_dir_all(vault_dir.join("nested")).expect("create vault dirs");
            fs::write(vault_dir.join("nested/spell.txt"), "magic").expect("write spell");

            backup_vault_with_pool(&pool, backup_path.to_string_lossy().to_string())
                .expect("backup vault");
        }

        fs::remove_dir_all(&vault_dir).expect("remove vault");
        restore_vault(backup_path.to_string_lossy().to_string(), true).expect("restore vault");

        let restored =
            fs::read_to_string(vault_dir.join("nested/spell.txt")).expect("read restored");
        assert_eq!(restored, "magic");

        env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn installs_sqlite_vec_from_resource_dir() {
        let temp_dir = TempDir::new().expect("temp dir");
        let data_dir = temp_dir.path().join("SpellbookVault");
        let resource_dir = temp_dir.path().join("resources");
        let sqlite_vec_dir = resource_dir.join("sqlite-vec");
        fs::create_dir_all(&sqlite_vec_dir).expect("create sqlite-vec dir");

        let library_path = sqlite_vec_dir.join(sqlite_vec_library_name());
        // To exercise the real sqlite-vec extension, set SPELLBOOK_SQLITE_VEC_LIBRARY to a
        // built vec0.* path before running this test.
        if let Ok(real_library) = env::var("SPELLBOOK_SQLITE_VEC_LIBRARY") {
            fs::copy(&real_library, &library_path).expect("copy real sqlite-vec");
        } else {
            fs::write(&library_path, b"sqlite-vec").expect("write fake sqlite-vec");
        }

        install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir)).expect("install sqlite-vec");

        assert!(data_dir.join(sqlite_vec_library_name()).exists());

        let conn = Connection::open_in_memory().expect("open in-memory db");
        if unsafe { conn.load_extension_enable() }.is_err() {
            eprintln!("sqlite-vec test skipped: extension loading not supported.");
            return;
        }

        let installed_path = data_dir.join(sqlite_vec_library_name());
        if let Err(err) = unsafe { conn.load_extension(&installed_path, None) } {
            eprintln!("sqlite-vec test skipped: failed to load extension: {err}");
            return;
        }

        if let Err(err) =
            conn.execute_batch("CREATE VIRTUAL TABLE spell_vec USING vec0(v float[3])")
        {
            eprintln!("sqlite-vec test skipped: failed to create virtual table: {err}");
            return;
        }

        let vector = vec![0u8; 12];
        if let Err(err) = conn.execute(
            "INSERT INTO spell_vec(rowid, v) VALUES (?1, ?2)",
            params![1i64, vector],
        ) {
            eprintln!("sqlite-vec test skipped: failed to insert vector: {err}");
            return;
        }

        let row_id: Option<i64> = conn
            .query_row("SELECT rowid FROM spell_vec WHERE rowid = 1", [], |row| {
                row.get(0)
            })
            .optional()
            .expect("query inserted row");
        assert_eq!(row_id, Some(1));
    }

    #[test]
    fn import_files_returns_spell_conflicts() {
        let _guard = env_lock();
        let temp_dir = TempDir::new().expect("temp dir");
        let data_dir = temp_dir.path().join("SpellbookVault");
        env::set_var("SPELLBOOK_DATA_DIR", &data_dir);
        let pool = init_db(None).expect("init db");
        let conn = pool.get().expect("db connection");

        conn.execute(
            "INSERT INTO spell (name, level, description, source) VALUES (?1, ?2, ?3, ?4)",
            params![
                "Conflict Spell",
                1,
                "Original description",
                "Conflict Source"
            ],
        )
        .expect("insert existing spell");

        let incoming_spell = ImportSpell {
            name: "Conflict Spell".to_string(),
            school: Some("Evocation".to_string()),
            sphere: None,
            class_list: None,
            level: 1,
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            reversible: None,
            description: "Incoming description".to_string(),
            tags: None,
            source: Some("Conflict Source".to_string()),
            edition: None,
            author: None,
            license: None,
            source_file: Some("conflict.md".to_string()),
        };

        let artifact = ImportArtifact {
            r#type: "md".to_string(),
            path: "conflict.md".to_string(),
            hash: "hash".to_string(),
            imported_at: Utc::now().to_rfc3339(),
        };

        let result = import_files_with_pool(
            &pool,
            vec![],
            false,
            Some(vec![incoming_spell]),
            Some(vec![artifact]),
            Some(vec![]),
        )
        .expect("import files");

        let conflict = result.conflicts.into_iter().find_map(|conflict| {
            if let ImportConflict::Spell {
                existing,
                incoming,
                fields,
                ..
            } = conflict
            {
                Some((existing, incoming, fields))
            } else {
                None
            }
        });

        assert!(conflict.is_some());
        let (existing, incoming, fields) = conflict.unwrap();
        assert_eq!(existing.name, "Conflict Spell");
        assert_eq!(incoming.description, "Incoming description");
        assert!(fields.iter().any(|field| field.field == "description"));

        env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn test_diff_spells_logic() {
        let old = SpellDetail {
            id: Some(1),
            name: "Fireball".to_string(),
            level: 3,
            school: Some("Evocation".to_string()),
            description: "Boom".to_string(),
            sphere: None,
            class_list: None,
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            reversible: None,
            tags: None,
            source: None,
            edition: None,
            author: None,
            license: None,
            artifacts: None,
        };
        let new = SpellUpdate {
            id: 1,
            name: "Fireball II".to_string(),
            level: 3,
            school: Some("Evocation".to_string()),
            description: "Boom".to_string(),
            sphere: None,
            class_list: None,
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            reversible: None,
            tags: None,
            source: None,
            edition: None,
            author: None,
            license: None,
        };
        let changes = diff_spells(&old, &new);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].0, "name");
        assert_eq!(changes[0].1, "Fireball");
        assert_eq!(changes[0].2, "Fireball II");
    }

    #[test]
    fn search_keyword_filters_components_and_tags() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        load_migrations(&conn).expect("load migrations");

        conn.execute(
            "INSERT INTO spell (name, level, description, components, tags, class_list) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                "Mage Armor",
                1,
                "Protective ward",
                "V,S,M",
                "[\"abjuration\",\"armor\"]",
                "[\"Wizard\"]"
            ],
        )
        .expect("insert mage armor");
        conn.execute(
            "INSERT INTO spell (name, level, description, components, tags, class_list) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                "Cure Light Wounds",
                1,
                "Heal a target",
                "V,S",
                "[\"healing\"]",
                "[\"Cleric\"]"
            ],
        )
        .expect("insert cure light wounds");

        let component_results = search_keyword_with_conn(
            &conn,
            "",
            Some(SearchFilters {
                school: None,
                level: None,
                class_list: None,
                source: None,
                components: Some("M".to_string()),
                tags: None,
            }),
        )
        .expect("search by components");
        assert_eq!(component_results.len(), 1);
        assert_eq!(component_results[0].name, "Mage Armor");

        let tag_results = search_keyword_with_conn(
            &conn,
            "",
            Some(SearchFilters {
                school: None,
                level: None,
                class_list: None,
                source: None,
                components: None,
                tags: Some("healing".to_string()),
            }),
        )
        .expect("search by tags");
        assert_eq!(tag_results.len(), 1);
        assert_eq!(tag_results[0].name, "Cure Light Wounds");
    }

    #[test]
    fn search_keyword_filters_components_and_tags_with_query() {
        let temp_dir = TempDir::new().expect("temp dir");
        let db_path = temp_dir.path().join("spellbook.db");
        let conn = Connection::open(db_path).expect("open db");
        load_migrations(&conn).expect("load migrations");

        conn.execute(
            "INSERT INTO spell (name, level, description, components, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "Arcane Ward",
                2,
                "A shimmering ward protects the caster.",
                "V,S,M",
                "alpha, beta"
            ],
        )
        .expect("insert arcane ward");
        conn.execute(
            "INSERT INTO spell (name, level, description, components, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "Ward Off",
                2,
                "A warding pulse repels foes.",
                "V,S",
                "delta"
            ],
        )
        .expect("insert ward off");

        let results = search_keyword_with_conn(
            &conn,
            "ward",
            Some(SearchFilters {
                school: None,
                level: None,
                class_list: None,
                source: None,
                components: Some("M".to_string()),
                tags: Some("alpha".to_string()),
            }),
        )
        .expect("search with query and filters");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Arcane Ward");
    }

    #[test]
    fn search_keyword_populates_fts_and_returns_results() {
        let temp_dir = TempDir::new().expect("temp dir");
        let db_path = temp_dir.path().join("spellbook.db");
        let manager = SqliteConnectionManager::file(&db_path);
        let pool = Arc::new(Pool::new(manager).expect("create pool"));
        let conn = pool.get().expect("db connection");
        load_migrations(&conn).expect("load migrations");

        conn.execute(
            "INSERT INTO spell (name, level, description, source) VALUES (?1, ?2, ?3, ?4)",
            params!["Fireball", 3, "A roaring blast of fire.", "Core"],
        )
        .expect("insert fireball");
        conn.execute(
            "INSERT INTO spell (name, level, description, source) VALUES (?1, ?2, ?3, ?4)",
            params!["Ice Storm", 4, "Shards of ice rain down.", "Core"],
        )
        .expect("insert ice storm");

        let fts_rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell_fts", [], |row| row.get(0))
            .expect("count fts rows");
        assert_eq!(fts_rows, 2);

        let app = mock_builder()
            .manage(Arc::clone(&pool))
            .build(mock_context(noop_assets()))
            .expect("build app");
        let results = search_keyword(app.state::<Arc<Pool>>(), "fireball".to_string(), None)
            .expect("fts search");
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "Fireball");
    }

    #[test]
    fn search_keyword_orders_by_bm25_score() {
        let temp_dir = TempDir::new().expect("temp dir");
        let db_path = temp_dir.path().join("spellbook.db");
        let manager = SqliteConnectionManager::file(&db_path);
        let pool = Arc::new(Pool::new(manager).expect("create pool"));
        let conn = pool.get().expect("db connection");
        load_migrations(&conn).expect("load migrations");

        conn.execute(
            "INSERT INTO spell (name, level, description) VALUES (?1, ?2, ?3)",
            params!["Fire Bolt", 1, "fire fire fire bolt"],
        )
        .expect("insert fire bolt");
        conn.execute(
            "INSERT INTO spell (name, level, description) VALUES (?1, ?2, ?3)",
            params!["Chill Touch", 1, "fire"],
        )
        .expect("insert chill touch");

        let app = mock_builder()
            .manage(Arc::clone(&pool))
            .build(mock_context(noop_assets()))
            .expect("build app");
        let results = search_keyword(app.state::<Arc<Pool>>(), "fire".to_string(), None)
            .expect("bm25 search");
        assert!(results.len() >= 2);
        assert_eq!(results[0].name, "Fire Bolt");
    }

    #[test]
    fn update_character_spell_updates_known_flag() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        load_migrations(&conn).expect("load migrations");

        conn.execute(
            "INSERT INTO \"character\" (name, notes) VALUES (?1, ?2)",
            params!["Known Test", Option::<String>::None],
        )
        .expect("insert character");
        let character_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO spell (name, level, description) VALUES (?1, ?2, ?3)",
            params!["Known Spell", 1, "Testing known"],
        )
        .expect("insert spell");
        let spell_id = conn.last_insert_rowid();

        update_character_spell_with_conn(&conn, character_id, spell_id, 0, 0, None)
            .expect("set known false");
        let entries =
            get_character_spellbook_with_conn(&conn, character_id).expect("load spellbook");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].known, 0);

        update_character_spell_with_conn(&conn, character_id, spell_id, 0, 1, None)
            .expect("set known true");
        let updated_entries =
            get_character_spellbook_with_conn(&conn, character_id).expect("reload spellbook");
        assert_eq!(updated_entries.len(), 1);
        assert_eq!(updated_entries[0].known, 1);
    }
}
