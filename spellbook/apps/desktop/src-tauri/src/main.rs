#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;

use chrono::Utc;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;

use rusqlite::LoadExtension;

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
}

#[derive(Serialize, Deserialize)]
struct ChatResponse {
    answer: String,
    citations: Vec<String>,
    meta: serde_json::Value,
}

fn data_dir() -> Result<PathBuf, String> {
    let dir = tauri::api::path::data_dir().ok_or("no data dir")?.join("SpellbookVault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn load_migrations(conn: &Connection) -> Result<(), String> {
    let sql = include_str!("../../../db/migrations/0001_init.sql");
    match conn.execute_batch(sql) {
        Ok(()) => Ok(()),
        Err(err) => {
            let message = err.to_string();
            if message.contains("no such module: vec0") {
                conn.execute_batch("CREATE TABLE IF NOT EXISTS spell_vec (rowid INTEGER PRIMARY KEY, v BLOB);")
                    .map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err(message)
            }
        }
    }
}

fn try_load_sqlite_vec(conn: &Connection) {
    let _ = conn.load_extension_enable();
    if let Ok(dir) = data_dir() {
        let candidates = [
            dir.join("sqlite-vec"),
            dir.join("sqlite-vec.dll"),
            dir.join("libsqlite-vec.dylib"),
            dir.join("libsqlite-vec.so"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                let _ = conn.load_extension(candidate, None);
                break;
            }
        }
    }
    let _ = conn.load_extension_disable();
}

fn init_db() -> Result<Pool, String> {
    let db_path = data_dir()?.join("spellbook.sqlite3");
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
    let script = sidecar_path()?;
    let mut child = Command::new("python3")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    });
    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        stdin.write_all(request.to_string().as_bytes()).map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("sidecar failed".into());
    }
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    if let Some(err) = response.get("error") {
        return Err(err.to_string());
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "missing result".to_string())
}

#[tauri::command]
async fn ping() -> String {
    "pong".into()
}

#[tauri::command]
async fn search_keyword(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<SpellSummary>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
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
async fn search_semantic(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<SpellSummary>, String> {
    search_keyword(state, query).await
}

#[tauri::command]
async fn list_facets(state: tauri::State<'_, Arc<Pool>>) -> Result<Facets, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut schools = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT school FROM spell WHERE school IS NOT NULL ORDER BY school").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok(value) = row {
            schools.push(value);
        }
    }
    let mut sources = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT source FROM spell WHERE source IS NOT NULL ORDER BY source").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok(value) = row {
            sources.push(value);
        }
    }
    let mut levels = vec![];
    let mut stmt = conn.prepare("SELECT DISTINCT level FROM spell ORDER BY level").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok(value) = row {
            levels.push(value);
        }
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
async fn get_spell(state: tauri::State<'_, Arc<Pool>>, id: i64) -> Result<Option<SpellDetail>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    get_spell_from_conn(&conn, id)
}

#[tauri::command]
async fn upsert_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellDetail) -> Result<i64, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
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
async fn import_files(state: tauri::State<'_, Arc<Pool>>, files: Vec<ImportFile>) -> Result<ImportResult, String> {
    let dir = data_dir()?.join("imports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut paths = vec![];
    for file in files {
        let path = dir.join(&file.name);
        fs::write(&path, file.content).map_err(|e| e.to_string())?;
        paths.push(path);
    }
    let result = call_sidecar("import", json!({"files": paths}))?;
    let spells: Vec<SpellDetail> = serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
        .map_err(|e| e.to_string())?;
    let artifacts = result.get("artifacts").cloned().unwrap_or(json!([]));
    let conflicts = result.get("conflicts").cloned().unwrap_or(json!([]));

    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
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
    })
}

#[tauri::command]
async fn export_spells(state: tauri::State<'_, Arc<Pool>>, ids: Vec<i64>, format: String) -> Result<String, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut spells = vec![];
    for id in ids {
        if let Some(spell) = get_spell_from_conn(&conn, id)? {
            spells.push(spell);
        }
    }
    let output_dir = data_dir()?.join("exports");
    let result = call_sidecar("export", json!({"spells": spells, "format": format, "output_dir": output_dir}))?;
    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
async fn chat_answer(prompt: String) -> Result<ChatResponse, String> {
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
            import_files,
            export_spells,
            chat_answer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
