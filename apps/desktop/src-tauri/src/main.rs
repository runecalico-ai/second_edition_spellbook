#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use chrono::Utc;
use r2d2_sqlite::SqliteConnectionManager;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};


type Pool = r2d2::Pool<SqliteConnectionManager>;

#[derive(Serialize, Deserialize)]
struct Spell {
    id: Option<i64>,
    name: String,
    school: Option<String>,
    level: i64,
    description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SpellSummary {
    id: Option<i64>,
    name: String,
    level: Option<i64>,
    class_list: Option<String>,
    source: Option<String>,
    description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
struct CanonicalKey {
    name_normalized: String,
    class_key: String,
    level: i64,
    source: String,
}

#[derive(Serialize, Deserialize)]
struct ImportConflict {
    key: CanonicalKey,
    existing: SpellSummary,
    incoming: SpellSummary,
}

#[derive(Serialize, Deserialize)]
struct ImportResult {
    preview: Vec<SpellSummary>,
    imported: Vec<SpellSummary>,
    conflicts: Vec<ImportConflict>,
}

#[derive(Serialize, Deserialize, Default)]
struct ImportMapping {
    field_map: HashMap<String, String>,
    defaults: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
struct ImportResolution {
    key: CanonicalKey,
    action: String,
}

#[derive(Serialize, Deserialize)]
struct ImportRequest {
    files: Vec<String>,
    mapping: ImportMapping,
    resolutions: Vec<ImportResolution>,
    dry_run: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct ParsedSpell {
    name: String,
    description: String,
    school: Option<String>,
    sphere: Option<String>,
    class_list: Option<String>,
    level: Option<i64>,
    range: Option<String>,
    components: Option<String>,
    material_components: Option<String>,
    casting_time: Option<String>,
    duration: Option<String>,
    area: Option<String>,
    saving_throw: Option<String>,
    source: Option<String>,
    tags: Option<Vec<String>>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
    reversible: Option<bool>,
    raw_fields: Option<HashMap<String, serde_json::Value>>,
    source_path: String,
}

#[derive(Serialize, Deserialize)]
struct ReparseResult {
    spell: SpellSummary,
}

#[tauri::command]
async fn ping() -> String {
    "pong".into()
}

#[tauri::command]
async fn search_keyword(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<Spell>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, school, level, description FROM spell_fts f JOIN spell s ON s.id=f.rowid WHERE f MATCH ? ORDER BY bm25(f) LIMIT 50")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([query], |row| {
        Ok(Spell {
            id: row.get(0)?,
            name: row.get(1)?,
            school: row.get(2)?,
            level: row.get(3)?,
            description: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn chat_answer(prompt: String) -> Result<String, String> {
    // TODO: call python sidecar (ctranslate2 + RAG). For now, return a stub.
    Ok(format!("(stub) You asked: {}", prompt))
}

#[tauri::command]
async fn import_files(state: tauri::State<'_, Arc<Pool>>, request: ImportRequest) -> Result<ImportResult, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut preview = vec![];
    let mut imported = vec![];
    let mut conflicts = vec![];

    let parsed = parse_with_sidecar(&request.files)?;
    let resolutions = request
        .resolutions
        .iter()
        .map(|r| (r.key.clone(), r.action.clone()))
        .collect::<HashMap<_, _>>();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for mut spell in parsed {
        spell = apply_mapping(spell, &request.mapping);
        let summary = summary_from_parsed(&spell, None);
        preview.push(summary.clone());

        let key = canonical_key(&spell);
        if let Some(existing) = find_existing(&tx, &key)? {
            let resolution = resolutions.get(&key).map(String::as_str);
            match resolution {
                Some("keep_new") => {
                    if !request.dry_run {
                        let new_id = insert_spell(&tx, &spell)?;
                        attach_artifact(&tx, new_id, &spell.source_path)?;
                        imported.push(summary_from_parsed(&spell, Some(new_id)));
                    }
                }
                Some("keep_existing") => {
                    if !request.dry_run {
                        if let Some(existing_id) = existing.id {
                            attach_artifact(&tx, existing_id, &spell.source_path)?;
                        }
                    }
                    continue;
                }
                Some("merge") => {
                    if !request.dry_run {
                        let existing_id = existing.id.ok_or("Missing existing spell id")?;
                        merge_spell(&tx, existing_id, &spell)?;
                        attach_artifact(&tx, existing_id, &spell.source_path)?;
                        imported.push(summary_from_parsed(&spell, Some(existing_id)));
                    }
                }
                _ => {
                    conflicts.push(ImportConflict {
                        key,
                        existing,
                        incoming: summary,
                    });
                }
            }
            continue;
        }

        if request.dry_run {
            continue;
        }

        let new_id = insert_spell(&tx, &spell)?;
        attach_artifact(&tx, new_id, &spell.source_path)?;
        imported.push(summary_from_parsed(&spell, Some(new_id)));
    }

    if request.dry_run {
        tx.rollback().map_err(|e| e.to_string())?;
    } else {
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(ImportResult { preview, imported, conflicts })
}

#[tauri::command]
async fn reparse_artifact(state: tauri::State<'_, Arc<Pool>>, spell_id: i64) -> Result<ReparseResult, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT path FROM artifact WHERE spell_id = ? ORDER BY imported_at DESC LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([spell_id]).map_err(|e| e.to_string())?;
    let path: String = match rows.next().map_err(|e| e.to_string())? {
        Some(row) => row.get(0).map_err(|e| e.to_string())?,
        None => return Err("No artifact found for spell".to_string()),
    };

    let parsed = parse_with_sidecar(&vec![path.clone()])?;
    let spell = parsed.into_iter().next().ok_or("No parsed data")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    merge_spell(&tx, spell_id, &spell)?;
    attach_artifact(&tx, spell_id, &path)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ReparseResult {
        spell: summary_from_parsed(&spell, Some(spell_id)),
    })
}

fn parse_with_sidecar(files: &[String]) -> Result<Vec<ParsedSpell>, String> {
    if files.is_empty() {
        return Ok(vec![]);
    }
    let script_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..").join("..").join("..").join("spellbook").join("services")
        .join("ml").join("spellbook_sidecar.py");
    let output = Command::new("python")
        .arg(script_path)
        .arg("parse")
        .args(files)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let parsed: Vec<ParsedSpell> = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;
    Ok(parsed)
}

fn apply_mapping(mut spell: ParsedSpell, mapping: &ImportMapping) -> ParsedSpell {
    if let Some(raw_fields) = spell.raw_fields.clone() {
        for (source, target) in &mapping.field_map {
            if let Some(value) = raw_fields.get(source) {
                let str_value = value_to_string(value);
                if let Some(str_value) = str_value {
                    set_field_value(&mut spell, target, &str_value);
                }
            }
        }
    }

    for (field, value) in &mapping.defaults {
        if is_field_empty(&spell, field) {
            set_field_value(&mut spell, field, value);
        }
    }

    spell
}

fn value_to_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn is_field_empty(spell: &ParsedSpell, field: &str) -> bool {
    match field {
        "name" => spell.name.trim().is_empty(),
        "school" => spell.school.as_deref().unwrap_or("").is_empty(),
        "sphere" => spell.sphere.as_deref().unwrap_or("").is_empty(),
        "class_list" => spell.class_list.as_deref().unwrap_or("").is_empty(),
        "level" => spell.level.is_none(),
        "range" => spell.range.as_deref().unwrap_or("").is_empty(),
        "components" => spell.components.as_deref().unwrap_or("").is_empty(),
        "material_components" => spell.material_components.as_deref().unwrap_or("").is_empty(),
        "casting_time" => spell.casting_time.as_deref().unwrap_or("").is_empty(),
        "duration" => spell.duration.as_deref().unwrap_or("").is_empty(),
        "area" => spell.area.as_deref().unwrap_or("").is_empty(),
        "saving_throw" => spell.saving_throw.as_deref().unwrap_or("").is_empty(),
        "description" => spell.description.trim().is_empty(),
        "source" => spell.source.as_deref().unwrap_or("").is_empty(),
        "tags" => spell.tags.as_ref().map_or(true, |t| t.is_empty()),
        "edition" => spell.edition.as_deref().unwrap_or("").is_empty(),
        "author" => spell.author.as_deref().unwrap_or("").is_empty(),
        "license" => spell.license.as_deref().unwrap_or("").is_empty(),
        "reversible" => spell.reversible.is_none(),
        _ => true,
    }
}

fn set_field_value(spell: &mut ParsedSpell, field: &str, value: &str) {
    match field {
        "name" => spell.name = value.to_string(),
        "school" => spell.school = Some(value.to_string()),
        "sphere" => spell.sphere = Some(value.to_string()),
        "class_list" => spell.class_list = Some(value.to_string()),
        "level" => spell.level = value.parse::<i64>().ok(),
        "range" => spell.range = Some(value.to_string()),
        "components" => spell.components = Some(value.to_string()),
        "material_components" => spell.material_components = Some(value.to_string()),
        "casting_time" => spell.casting_time = Some(value.to_string()),
        "duration" => spell.duration = Some(value.to_string()),
        "area" => spell.area = Some(value.to_string()),
        "saving_throw" => spell.saving_throw = Some(value.to_string()),
        "description" => spell.description = value.to_string(),
        "source" => spell.source = Some(value.to_string()),
        "tags" => spell.tags = Some(value.split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect()),
        "edition" => spell.edition = Some(value.to_string()),
        "author" => spell.author = Some(value.to_string()),
        "license" => spell.license = Some(value.to_string()),
        "reversible" => spell.reversible = Some(matches!(value.to_lowercase().as_str(), "true" | "yes" | "1")),
        _ => {}
    }
}

fn canonical_key(spell: &ParsedSpell) -> CanonicalKey {
    let name_normalized = normalize_name(&spell.name);
    let class_key = spell
        .class_list
        .clone()
        .unwrap_or_default()
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let level = spell.level.unwrap_or(0);
    let source = spell.source.clone().unwrap_or_default().to_lowercase();
    CanonicalKey {
        name_normalized,
        class_key,
        level,
        source,
    }
}

fn normalize_name(name: &str) -> String {
    let filtered: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    filtered
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn find_existing(conn: &rusqlite::Connection, key: &CanonicalKey) -> Result<Option<SpellSummary>, String> {
    let mut stmt = conn.prepare("SELECT id, name, class_list, level, source, description FROM spell WHERE level = ?1 AND lower(ifnull(source,'')) = ?2 AND lower(ifnull(class_list,'')) LIKE ?3")
        .map_err(|e| e.to_string())?;
    let class_like = if key.class_key.is_empty() {
        "%".to_string()
    } else {
        format!("%{}%", key.class_key)
    };
    let mut rows = stmt.query([
        key.level,
        key.source.clone(),
        class_like,
    ]).map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let name: String = row.get(1).map_err(|e| e.to_string())?;
        let existing_key = CanonicalKey {
            name_normalized: normalize_name(&name),
            class_key: row.get::<_, Option<String>>(2).map_err(|e| e.to_string())?.unwrap_or_default().to_lowercase(),
            level: row.get(3).map_err(|e| e.to_string())?,
            source: row.get::<_, Option<String>>(4).map_err(|e| e.to_string())?.unwrap_or_default().to_lowercase(),
        };
        if existing_key.name_normalized == key.name_normalized {
            return Ok(Some(SpellSummary {
                id: row.get(0).map_err(|e| e.to_string())?,
                name,
                level: Some(existing_key.level),
                class_list: row.get(2).map_err(|e| e.to_string())?,
                source: row.get(4).map_err(|e| e.to_string())?,
                description: row.get(5).map_err(|e| e.to_string())?,
            }));
        }
    }

    Ok(None)
}

fn insert_spell(conn: &rusqlite::Connection, spell: &ParsedSpell) -> Result<i64, String> {
    let tags_json = spell.tags.clone().map(|tags| serde_json::to_string(&tags).unwrap_or_default());
    let class_list = spell.class_list.clone();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO spell (name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, description, tags, source, edition, author, license, reversible, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        (
            spell.name.clone(),
            spell.school.clone(),
            spell.sphere.clone(),
            class_list,
            spell.level.unwrap_or(0),
            spell.range.clone(),
            spell.components.clone(),
            spell.material_components.clone(),
            spell.casting_time.clone(),
            spell.duration.clone(),
            spell.area.clone(),
            spell.saving_throw.clone(),
            spell.description.clone(),
            tags_json,
            spell.source.clone(),
            spell.edition.clone(),
            spell.author.clone(),
            spell.license.clone(),
            spell.reversible.map(|v| if v { 1 } else { 0 }),
            now.clone(),
            now,
        ),
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

fn merge_spell(conn: &rusqlite::Connection, spell_id: i64, incoming: &ParsedSpell) -> Result<(), String> {
    let existing = conn.query_row(
        "SELECT name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, description, tags, source, edition, author, license, reversible FROM spell WHERE id = ?1",
        [spell_id],
        |row| {
            Ok(ParsedSpell {
                name: row.get(0)?,
                school: row.get(1)?,
                sphere: row.get(2)?,
                class_list: row.get(3)?,
                level: row.get(4)?,
                range: row.get(5)?,
                components: row.get(6)?,
                material_components: row.get(7)?,
                casting_time: row.get(8)?,
                duration: row.get(9)?,
                area: row.get(10)?,
                saving_throw: row.get(11)?,
                description: row.get(12)?,
                tags: row.get::<_, Option<String>>(13)?.and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok()),
                source: row.get(14)?,
                edition: row.get(15)?,
                author: row.get(16)?,
                license: row.get(17)?,
                reversible: row.get::<_, Option<i64>>(18)?.map(|v| v == 1),
                raw_fields: None,
                source_path: incoming.source_path.clone(),
            })
        },
    ).map_err(|e| e.to_string())?;

    let merged = ParsedSpell {
        name: if existing.name.trim().is_empty() { incoming.name.clone() } else { existing.name },
        school: existing.school.or_else(|| incoming.school.clone()),
        sphere: existing.sphere.or_else(|| incoming.sphere.clone()),
        class_list: existing.class_list.or_else(|| incoming.class_list.clone()),
        level: existing.level.or(incoming.level),
        range: existing.range.or_else(|| incoming.range.clone()),
        components: existing.components.or_else(|| incoming.components.clone()),
        material_components: existing.material_components.or_else(|| incoming.material_components.clone()),
        casting_time: existing.casting_time.or_else(|| incoming.casting_time.clone()),
        duration: existing.duration.or_else(|| incoming.duration.clone()),
        area: existing.area.or_else(|| incoming.area.clone()),
        saving_throw: existing.saving_throw.or_else(|| incoming.saving_throw.clone()),
        description: if existing.description.trim().is_empty() { incoming.description.clone() } else { existing.description },
        tags: if existing.tags.as_ref().map_or(true, |t| t.is_empty()) { incoming.tags.clone() } else { existing.tags },
        source: existing.source.or_else(|| incoming.source.clone()),
        edition: existing.edition.or_else(|| incoming.edition.clone()),
        author: existing.author.or_else(|| incoming.author.clone()),
        license: existing.license.or_else(|| incoming.license.clone()),
        reversible: existing.reversible.or(incoming.reversible),
        raw_fields: None,
        source_path: incoming.source_path.clone(),
    };

    let tags_json = merged.tags.clone().map(|tags| serde_json::to_string(&tags).unwrap_or_default());
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE spell SET name=?1, school=?2, sphere=?3, class_list=?4, level=?5, range=?6, components=?7, material_components=?8, casting_time=?9, duration=?10, area=?11, saving_throw=?12, description=?13, tags=?14, source=?15, edition=?16, author=?17, license=?18, reversible=?19, updated_at=?20 WHERE id=?21",
        (
            merged.name,
            merged.school,
            merged.sphere,
            merged.class_list,
            merged.level.unwrap_or(0),
            merged.range,
            merged.components,
            merged.material_components,
            merged.casting_time,
            merged.duration,
            merged.area,
            merged.saving_throw,
            merged.description,
            tags_json,
            merged.source,
            merged.edition,
            merged.author,
            merged.license,
            merged.reversible.map(|v| if v { 1 } else { 0 }),
            now,
            spell_id,
        ),
    ).map_err(|e| e.to_string())?;

    Ok(())
}

fn attach_artifact(conn: &rusqlite::Connection, spell_id: i64, path: &str) -> Result<(), String> {
    let file_hash = compute_hash(Path::new(path))?;
    let file_type = file_type(path).unwrap_or("md".to_string());
    conn.execute(
        "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(spell_id, path) DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
        (
            spell_id,
            file_type,
            path.to_string(),
            file_hash,
            Utc::now().to_rfc3339(),
        ),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn compute_hash(path: &Path) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(data);
    Ok(format!("{:x}", hasher.finalize()))
}

fn file_type(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
}

fn summary_from_parsed(spell: &ParsedSpell, id: Option<i64>) -> SpellSummary {
    SpellSummary {
        id,
        name: spell.name.clone(),
        level: spell.level,
        class_list: spell.class_list.clone(),
        source: spell.source.clone(),
        description: Some(spell.description.clone()),
    }
}

fn init_db() -> Result<Pool, String> {
    let data_dir = tauri::api::path::data_dir().ok_or("no data dir")?.join("SpellbookVault");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join("spellbook.sqlite3");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::new(manager).map_err(|e| e.to_string())?;
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
        let migrations = include_str!("../../../../db/0001_init.sql");
        conn.execute_batch(migrations).map_err(|e| e.to_string())?;
    }
    Ok(pool)
}

fn main() {
    let pool = init_db().expect("db");
    let shared = Arc::new(pool);

    tauri::Builder::default()
        .manage(shared)
        .invoke_handler(tauri::generate_handler![ping, search_keyword, chat_answer, import_files, reparse_artifact])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
