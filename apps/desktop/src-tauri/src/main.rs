#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, params_from_iter};
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

type Pool = r2d2::Pool<SqliteConnectionManager>;

#[derive(Serialize, Deserialize)]
struct Spell {
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
    reversible: bool,
    description: Option<String>,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct SpellInput {
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
    reversible: bool,
    description: String,
    tags: Option<String>,
    source: Option<String>,
    edition: Option<String>,
    author: Option<String>,
    license: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct SpellHistoryEntry {
    changed_at: String,
    field: String,
    old_value: Option<String>,
    new_value: Option<String>,
    actor: String,
}

#[derive(Serialize, Deserialize)]
struct FilterInput {
    search_keyword: Option<String>,
    level: Option<i64>,
    school: Option<String>,
    class_list: Option<String>,
    components: Option<String>,
    tags: Option<String>,
    source: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Character {
    id: Option<i64>,
    name: String,
    notes: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct SpellbookEntry {
    character_id: i64,
    spell_id: i64,
    prepared: bool,
    known: bool,
    notes: Option<String>,
    name: String,
    school: Option<String>,
    level: i64,
}

#[tauri::command]
async fn ping() -> String {
    "pong".into()
}

#[tauri::command]
async fn search_keyword(state: tauri::State<'_, Arc<Pool>>, query: String) -> Result<Vec<Spell>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license, created_at, updated_at FROM spell_fts f JOIN spell s ON s.id=f.rowid WHERE f MATCH ? ORDER BY bm25(f) LIMIT 50")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([query], |row| {
        Ok(Spell {
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
            reversible: row.get::<_, i64>(13)? == 1,
            description: row.get(14)?,
            tags: row.get(15)?,
            source: row.get(16)?,
            edition: row.get(17)?,
            author: row.get(18)?,
            license: row.get(19)?,
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn list_spells_filtered(state: tauri::State<'_, Arc<Pool>>, filters: FilterInput) -> Result<Vec<Spell>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    let mut uses_fts = false;

    if let Some(search_keyword) = filters.search_keyword.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        uses_fts = true;
        conditions.push("f MATCH ?".to_string());
        params.push(Value::from(search_keyword.to_string()));
    }

    if let Some(level) = filters.level {
        conditions.push("s.level = ?".to_string());
        params.push(Value::from(level));
    }

    if let Some(school) = filters.school.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        conditions.push("LOWER(s.school) = LOWER(?)".to_string());
        params.push(Value::from(school.to_string()));
    }

    if let Some(class_list) = filters.class_list.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        conditions.push("LOWER(s.class_list) LIKE LOWER(?)".to_string());
        params.push(Value::from(format!("%{}%", class_list)));
    }

    if let Some(components) = filters.components.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        conditions.push("LOWER(s.components) LIKE LOWER(?)".to_string());
        params.push(Value::from(format!("%{}%", components)));
    }

    if let Some(tags) = filters.tags.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        conditions.push("LOWER(s.tags) LIKE LOWER(?)".to_string());
        params.push(Value::from(format!("%{}%", tags)));
    }

    if let Some(source) = filters.source.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        conditions.push("LOWER(s.source) = LOWER(?)".to_string());
        params.push(Value::from(source.to_string()));
    }

    let mut sql = String::from("SELECT s.id, s.name, s.school, s.sphere, s.class_list, s.level, s.range, s.components, s.material_components, s.casting_time, s.duration, s.area, s.saving_throw, s.reversible, s.description, s.tags, s.source, s.edition, s.author, s.license, s.created_at, s.updated_at FROM spell s");
    if uses_fts {
        sql.push_str(" JOIN spell_fts f ON s.id = f.rowid");
    }
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    if uses_fts {
        sql.push_str(" ORDER BY bm25(f) LIMIT 50");
    } else {
        sql.push_str(" ORDER BY s.name");
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_from_iter(params), |row| {
        Ok(Spell {
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
            reversible: row.get::<_, i64>(13)? == 1,
            description: row.get(14)?,
            tags: row.get(15)?,
            source: row.get(16)?,
            edition: row.get(17)?,
            author: row.get(18)?,
            license: row.get(19)?,
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn list_spells(state: tauri::State<'_, Arc<Pool>>) -> Result<Vec<Spell>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license, created_at, updated_at FROM spell ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Spell {
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
            reversible: row.get::<_, i64>(13)? == 1,
            description: row.get(14)?,
            tags: row.get(15)?,
            source: row.get(16)?,
            edition: row.get(17)?,
            author: row.get(18)?,
            license: row.get(19)?,
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn get_spell(state: tauri::State<'_, Arc<Pool>>, id: i64) -> Result<Spell, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license, created_at, updated_at FROM spell WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let spell = stmt.query_row([id], |row| {
        Ok(Spell {
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
            reversible: row.get::<_, i64>(13)? == 1,
            description: row.get(14)?,
            tags: row.get(15)?,
            source: row.get(16)?,
            edition: row.get(17)?,
            author: row.get(18)?,
            license: row.get(19)?,
            created_at: row.get(20)?,
            updated_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(spell)
}

#[tauri::command]
async fn create_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellInput) -> Result<i64, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO spell (name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
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
            if spell.reversible { 1 } else { 0 },
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn maybe_push(changes: &mut Vec<(String, Option<String>, Option<String>)>, field: &str, old: Option<String>, new: Option<String>) {
    if old != new {
        changes.push((field.to_string(), old, new));
    }
}

#[tauri::command]
async fn update_spell(state: tauri::State<'_, Arc<Pool>>, spell: SpellInput) -> Result<(), String> {
    let id = spell.id.ok_or("missing id")?;
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let existing: Spell = {
        let mut stmt = conn.prepare("SELECT id, name, school, sphere, class_list, level, range, components, material_components, casting_time, duration, area, saving_throw, reversible, description, tags, source, edition, author, license, created_at, updated_at FROM spell WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([id], |row| {
            Ok(Spell {
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
                reversible: row.get::<_, i64>(13)? == 1,
                description: row.get(14)?,
                tags: row.get(15)?,
                source: row.get(16)?,
                edition: row.get(17)?,
                author: row.get(18)?,
                license: row.get(19)?,
                created_at: row.get(20)?,
                updated_at: row.get(21)?,
            })
        }).map_err(|e| e.to_string())?
    };

    let mut changes = Vec::new();
    maybe_push(&mut changes, "name", Some(existing.name.clone()), Some(spell.name.clone()));
    maybe_push(&mut changes, "school", existing.school.clone(), spell.school.clone());
    maybe_push(&mut changes, "sphere", existing.sphere.clone(), spell.sphere.clone());
    maybe_push(&mut changes, "class_list", existing.class_list.clone(), spell.class_list.clone());
    maybe_push(&mut changes, "level", Some(existing.level.to_string()), Some(spell.level.to_string()));
    maybe_push(&mut changes, "range", existing.range.clone(), spell.range.clone());
    maybe_push(&mut changes, "components", existing.components.clone(), spell.components.clone());
    maybe_push(&mut changes, "material_components", existing.material_components.clone(), spell.material_components.clone());
    maybe_push(&mut changes, "casting_time", existing.casting_time.clone(), spell.casting_time.clone());
    maybe_push(&mut changes, "duration", existing.duration.clone(), spell.duration.clone());
    maybe_push(&mut changes, "area", existing.area.clone(), spell.area.clone());
    maybe_push(&mut changes, "saving_throw", existing.saving_throw.clone(), spell.saving_throw.clone());
    maybe_push(&mut changes, "reversible", Some(existing.reversible.to_string()), Some(spell.reversible.to_string()));
    maybe_push(&mut changes, "description", existing.description.clone(), Some(spell.description.clone()));
    maybe_push(&mut changes, "tags", existing.tags.clone(), spell.tags.clone());
    maybe_push(&mut changes, "source", existing.source.clone(), spell.source.clone());
    maybe_push(&mut changes, "edition", existing.edition.clone(), spell.edition.clone());
    maybe_push(&mut changes, "author", existing.author.clone(), spell.author.clone());
    maybe_push(&mut changes, "license", existing.license.clone(), spell.license.clone());

    conn.execute(
        "UPDATE spell SET name = ?1, school = ?2, sphere = ?3, class_list = ?4, level = ?5, range = ?6, components = ?7, material_components = ?8, casting_time = ?9, duration = ?10, area = ?11, saving_throw = ?12, reversible = ?13, description = ?14, tags = ?15, source = ?16, edition = ?17, author = ?18, license = ?19, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?20",
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
            if spell.reversible { 1 } else { 0 },
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
            id,
        ],
    ).map_err(|e| e.to_string())?;

    for (field, old_value, new_value) in changes {
        conn.execute(
            "INSERT INTO change_log (spell_id, field, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![id, field, old_value, new_value],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn get_spell_history(state: tauri::State<'_, Arc<Pool>>, spell_id: i64) -> Result<Vec<SpellHistoryEntry>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT changed_at, field, old_value, new_value, actor FROM change_log WHERE spell_id = ?1 ORDER BY changed_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([spell_id], |row| {
        Ok(SpellHistoryEntry {
            changed_at: row.get(0)?,
            field: row.get(1)?,
            old_value: row.get(2)?,
            new_value: row.get(3)?,
            actor: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn list_characters(state: tauri::State<'_, Arc<Pool>>) -> Result<Vec<Character>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, notes FROM character ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Character {
            id: row.get(0)?,
            name: row.get(1)?,
            notes: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn create_character(state: tauri::State<'_, Arc<Pool>>, character: Character) -> Result<i64, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO character (name, notes) VALUES (?1, ?2)", params![character.name, character.notes])
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
async fn update_character(state: tauri::State<'_, Arc<Pool>>, character: Character) -> Result<(), String> {
    let id = character.id.ok_or("missing id")?;
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE character SET name = ?1, notes = ?2 WHERE id = ?3", params![character.name, character.notes, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_character(state: tauri::State<'_, Arc<Pool>>, id: i64) -> Result<(), String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM character WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn list_spellbook_entries(state: tauri::State<'_, Arc<Pool>>, character_id: i64) -> Result<Vec<SpellbookEntry>, String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT sb.character_id, sb.spell_id, sb.prepared, sb.known, sb.notes, s.name, s.school, s.level FROM spellbook sb JOIN spell s ON s.id = sb.spell_id WHERE sb.character_id = ?1 ORDER BY s.name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([character_id], |row| {
        Ok(SpellbookEntry {
            character_id: row.get(0)?,
            spell_id: row.get(1)?,
            prepared: row.get::<_, i64>(2)? == 1,
            known: row.get::<_, i64>(3)? == 1,
            notes: row.get(4)?,
            name: row.get(5)?,
            school: row.get(6)?,
            level: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for r in rows { out.push(r.map_err(|e| e.to_string())?) }
    Ok(out)
}

#[tauri::command]
async fn upsert_spellbook_entry(state: tauri::State<'_, Arc<Pool>>, character_id: i64, spell_id: i64, prepared: bool, known: bool, notes: Option<String>) -> Result<(), String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO spellbook (character_id, spell_id, prepared, known, notes) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(character_id, spell_id) DO UPDATE SET prepared = excluded.prepared, known = excluded.known, notes = excluded.notes",
        params![character_id, spell_id, if prepared { 1 } else { 0 }, if known { 1 } else { 0 }, notes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_spellbook_entry(state: tauri::State<'_, Arc<Pool>>, character_id: i64, spell_id: i64) -> Result<(), String> {
    let conn = state.get().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM spellbook WHERE character_id = ?1 AND spell_id = ?2", params![character_id, spell_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn chat_answer(prompt: String) -> Result<String, String> {
    // TODO: call python sidecar (ctranslate2 + RAG). For now, return a stub.
    Ok(format!("(stub) You asked: {}", prompt))
}

fn vault_dir() -> Result<PathBuf, String> {
    let data_dir = tauri::api::path::data_dir().ok_or("no data dir")?;
    let vault_dir = data_dir.join("SpellbookVault");
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
    Ok(vault_dir)
}

fn add_directory_to_zip(
    writer: &mut ZipWriter<File>,
    root: &Path,
    current: &Path,
    options: FileOptions,
) -> Result<(), String> {
    for entry in std::fs::read_dir(current).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
        let mut name = relative.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            if !name.is_empty() {
                if !name.ends_with('/') {
                    name.push('/');
                }
                writer.add_directory(name, options).map_err(|e| e.to_string())?;
            }
            add_directory_to_zip(writer, root, &path, options)?;
        } else {
            let mut file = File::open(&path).map_err(|e| e.to_string())?;
            writer.start_file(name, options).map_err(|e| e.to_string())?;
            io::copy(&mut file, writer).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn backup_vault(destination_path: String) -> Result<(), String> {
    let vault_dir = vault_dir()?;
    let destination = PathBuf::from(destination_path);
    if destination.is_dir() {
        return Err("destination path must be a file path".into());
    }
    if let Some(parent) = destination.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let file = File::create(&destination).map_err(|e| e.to_string())?;
    let mut writer = ZipWriter::new(file);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
    add_directory_to_zip(&mut writer, &vault_dir, &vault_dir, options)?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn restore_vault(backup_path: String, allow_overwrite: bool) -> Result<(), String> {
    let vault_dir = vault_dir()?;
    if vault_dir.exists() {
        let mut entries = std::fs::read_dir(&vault_dir).map_err(|e| e.to_string())?;
        let is_empty = entries.next().is_none();
        if !is_empty && !allow_overwrite {
            return Err("vault directory is not empty; set allow_overwrite to true to restore".into());
        }
        if allow_overwrite {
            std::fs::remove_dir_all(&vault_dir).map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
        }
    }
    let file = File::open(backup_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut zipped = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_path = zipped
            .enclosed_name()
            .ok_or("invalid zip entry path")?
            .to_owned();
        let out_path = vault_dir.join(entry_path);
        if zipped.name().ends_with('/') {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&out_path).map_err(|e| e.to_string())?;
            io::copy(&mut zipped, &mut outfile).map_err(|e| e.to_string())?;
            outfile.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn init_db() -> Result<Pool, String> {
    let vault_dir = vault_dir()?;
    let db_path = vault_dir.join("spellbook.sqlite3");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::new(manager).map_err(|e| e.to_string())?;
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
        conn.execute_batch(include_str!("schema.sql")).map_err(|e| e.to_string())?;
    }
    Ok(pool)
}

fn main() {
    let pool = init_db().expect("db");
    let shared = Arc::new(pool);

    tauri::Builder::default()
        .manage(shared)
        .invoke_handler(tauri::generate_handler![
            ping,
            search_keyword,
            list_spells_filtered,
            list_spells,
            get_spell,
            create_spell,
            update_spell,
            get_spell_history,
            list_characters,
            create_character,
            update_character,
            delete_character,
            list_spellbook_entries,
            upsert_spellbook_entry,
            delete_spellbook_entry,
            chat_answer,
            backup_vault,
            restore_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
