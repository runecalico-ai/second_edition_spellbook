#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
}

#[derive(Serialize, Deserialize)]
struct Facets {
    schools: Vec<String>,
    sources: Vec<String>,
    levels: Vec<i64>,
}

#[derive(Serialize, Deserialize)]
struct ImportFile {
    name: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct ImportResult {
    spells: Vec<SpellDetail>,
    artifacts: Vec<serde_json::Value>,
    conflicts: Vec<serde_json::Value>,
    warnings: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ChatResponse {
    answer: String,
    citations: Vec<String>,
    meta: serde_json::Value,
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
                let fallback = sql.replace(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS spell_vec USING vec0(\n  rowid INTEGER PRIMARY KEY,\n  v float[384]\n);\n",
                    "CREATE TABLE IF NOT EXISTS spell_vec (rowid INTEGER PRIMARY KEY, v BLOB);\n",
                );
                eprintln!(
                    "sqlite-vec: vec0 module unavailable; falling back to blob-backed spell_vec table."
                );
                conn.execute_batch(&fallback).map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err(message)
            }
        }
    }
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
    let mut child = Command::new("python3")
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
) -> Result<Vec<SpellSummary>, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let trimmed = query.trim();
    let mut results = vec![];
    if trimmed.is_empty() {
        let mut stmt = conn
            .prepare("SELECT id, name, school, level, class_list, components, duration, source FROM spell ORDER BY name LIMIT 50")
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
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        return Ok(results);
    }

    let mut stmt = conn
        .prepare("SELECT id, name, school, level, class_list, components, duration, source FROM spell_fts f JOIN spell s ON s.id=f.rowid WHERE f MATCH ? ORDER BY bm25(f) LIMIT 50")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([trimmed], |row| {
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
    for r in rows {
        results.push(r.map_err(|e| e.to_string())?)
    }
    Ok(results)
}

#[tauri::command]
fn search_semantic(
    state: tauri::State<'_, Arc<Pool>>,
    query: String,
) -> Result<Vec<SpellSummary>, String> {
    search_keyword(state, query)
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
    Ok(Facets {
        schools,
        sources,
        levels,
    })
}

fn get_spell_from_conn(conn: &Connection, id: i64) -> Result<Option<SpellDetail>, String> {
    conn.query_row(
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
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
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
    validate_spell_fields(&spell.name, spell.level, &spell.description)?;
    let conn = state.inner().get().map_err(|e| e.to_string())?;
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

#[tauri::command]
fn import_files(
    state: tauri::State<'_, Arc<Pool>>,
    files: Vec<ImportFile>,
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
    let result = call_sidecar("import", json!({"files": paths}))?;
    let spells: Vec<SpellDetail> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| e.to_string())?;
    let artifacts = result.get("artifacts").cloned().unwrap_or(json!([]));
    let conflicts = result.get("conflicts").cloned().unwrap_or(json!([]));

    let conn = state.inner().get().map_err(|e| e.to_string())?;
    for spell in &spells {
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
    }

    Ok(ImportResult {
        spells,
        artifacts: artifacts.as_array().cloned().unwrap_or_default(),
        conflicts: conflicts.as_array().cloned().unwrap_or_default(),
        warnings,
    })
}

#[tauri::command]
fn backup_vault(destination_path: String) -> Result<String, String> {
    let vault_dir = app_data_dir()?;
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

    for entry in WalkDir::new(&vault_dir) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        if path == destination_abs {
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

    zip.finish().map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn restore_vault(backup_path: String, allow_overwrite: bool) -> Result<(), String> {
    let vault_dir = app_data_dir()?;
    if vault_dir.exists() {
        let has_contents = fs::read_dir(&vault_dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_some();
        if has_contents {
            if !allow_overwrite {
                return Err("vault directory is not empty".into());
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
fn chat_answer(prompt: String) -> Result<ChatResponse, String> {
    let result = call_sidecar("llm_answer", json!({"query": prompt, "contexts": []}))?;
    serde_json::from_value(result).map_err(|e| e.to_string())
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
            backup_vault,
            restore_vault,
            export_spells,
            chat_answer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::env;
    use tempfile::TempDir;

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
        let temp_dir = TempDir::new().expect("temp dir");
        let vault_dir = temp_dir.path().join("SpellbookVault");
        env::set_var("SPELLBOOK_DATA_DIR", &vault_dir);

        fs::create_dir_all(vault_dir.join("nested")).expect("create vault dirs");
        fs::write(vault_dir.join("nested/spell.txt"), "magic").expect("write spell");

        let backup_path = temp_dir.path().join("backup.zip");
        backup_vault(backup_path.to_string_lossy().to_string()).expect("backup vault");

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
        fs::write(&library_path, b"sqlite-vec").expect("write fake sqlite-vec");

        install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir)).expect("install sqlite-vec");

        assert!(data_dir.join(sqlite_vec_library_name()).exists());
    }
}
