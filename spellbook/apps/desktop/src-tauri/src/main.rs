#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use wait_timeout::ChildExt;

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
    let dir = system_data_dir().ok_or("no data dir")?.join("SpellbookVault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
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
    let sql = include_str!("../../../../db/0001_init.sql");
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
                conn.execute_batch(&fallback)
                    .map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err(message)
            }
        }
    }
}

fn try_load_sqlite_vec(conn: &Connection) {
    let _ = unsafe { conn.load_extension_enable() };
    if let Ok(dir) = app_data_dir() {
        let candidates = [
            dir.join("sqlite-vec"),
            dir.join("sqlite-vec.dll"),
            dir.join("libsqlite-vec.dylib"),
            dir.join("libsqlite-vec.so"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                let _ = unsafe { conn.load_extension(candidate, None) };
                break;
    if conn.load_extension_enable().is_err() {
        eprintln!("sqlite-vec: unable to enable SQLite extension loading.");
        return;
    }

    let mut loaded = false;
    match data_dir() {
        Ok(dir) => {
            for candidate in sqlite_vec_candidate_paths(&dir) {
                if !candidate.exists() {
                    continue;
                }
                match conn.load_extension(&candidate, None) {
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
                    "sqlite-vec: extension not loaded. Install vec0 into {} (e.g. run scripts/install_sqlite_vec.sh).",
                    dir.display()
                );
            }
        }
        Err(err) => {
            eprintln!("sqlite-vec: unable to resolve data directory: {err}");
        }
    }

    let _ = conn.load_extension_disable();
}

fn init_db() -> Result<Pool, String> {
    let db_path = app_data_dir()?.join("spellbook.sqlite3");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::new(manager).map_err(|e| e.to_string())?;
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
        try_load_sqlite_vec(&conn);
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
fn search_keyword(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<SpellSummary>, String> {
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
fn search_semantic(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<SpellSummary>, String> {
    search_keyword(state, query)
}

#[tauri::command]
fn list_facets(state: tauri::State<'_, Arc<Pool>>) -> Result<Facets, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut schools = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT school FROM spell WHERE school IS NOT NULL ORDER BY school").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        schools.push(value);
    }
    let mut sources = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT source FROM spell WHERE source IS NOT NULL ORDER BY source").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        sources.push(value);
    }
    let mut levels = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT level FROM spell ORDER BY level").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for value in rows.flatten() {
        levels.push(value);
    }
    Ok(Facets { schools, sources, levels })
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
    for segment in name.split(|c| c == '/' || c == '\\') {
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
fn import_files(state: tauri::State<'_, Arc<Pool>>, files: Vec<ImportFile>) -> Result<ImportResult, String> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut paths = vec![];
    let mut warnings = vec![];
    for file in files {
        let (safe_name, changed) = sanitize_import_filename(&file.name);
        if changed {
            warnings.push(format!("Sanitized import file name '{}' to '{}'.", file.name, safe_name));
        }
        let path = dir.join(&safe_name);
        fs::write(&path, file.content).map_err(|e| e.to_string())?;
        paths.push(path);
    }
    let result = call_sidecar("import", json!({"files": paths}))?;
    let spells: Vec<SpellDetail> = serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
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
fn export_spells(state: tauri::State<'_, Arc<Pool>>, ids: Vec<i64>, format: String) -> Result<String, String> {
    let conn = state.inner().get().map_err(|e| e.to_string())?;
    let mut spells = vec![];
    for id in ids {
        if let Some(spell) = get_spell_from_conn(&conn, id)? {
            spells.push(spell);
        }
    }
    let output_dir = app_data_dir()?.join("exports");
    let result = call_sidecar("export", json!({"spells": spells, "format": format, "output_dir": output_dir}))?;
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
    let pool = init_db().expect("db");
    let shared = Arc::new(pool);

    tauri::Builder::default()
        .manage(shared)
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
            export_spells,
            chat_answer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
