use crate::commands::spells::get_spell_from_conn;
use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    canonical_spell::{CanonicalSpell, BUNDLE_FORMAT_VERSION, CURRENT_SCHEMA_VERSION},
    CharacterAbilities, CharacterClass, PrintableCharacter, PrintableSpellbookEntry,
};
use crate::sidecar::call_sidecar;
use dirs::data_dir as system_data_dir;
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

/// Envelope for bundle export. Keys are snake_case per canonical contract.
#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct SpellBundleExport {
    schema_version: i64,
    bundle_format_version: i64,
    spells: Vec<CanonicalSpell>,
}

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

#[tauri::command]
pub async fn export_spells(
    state: State<'_, Arc<Pool>>,
    ids: Vec<i64>,
    format: String,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    let spells = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut spells = vec![];
        for id in ids {
            if let Some(spell) = get_spell_from_conn(&conn, id)? {
                spells.push(spell);
            }
        }
        Ok::<_, AppError>(spells)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let output_dir = app_data_dir()?.join("exports");
    let result = call_sidecar(
        "export",
        json!({"spells": spells, "format": format, "output_dir": output_dir}),
    )
    .await?;

    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
pub async fn export_spell_as_json(
    state: State<'_, Arc<Pool>>,
    spell_id: i64,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        export_spell_as_json_impl(&conn, spell_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

fn export_spell_as_json_impl(
    conn: &rusqlite::Connection,
    spell_id: i64,
) -> Result<String, AppError> {
    let spell = get_spell_from_conn(conn, spell_id)?
        .ok_or_else(|| AppError::NotFound(format!("Spell id {} not found", spell_id)))?;
    let content_hash = spell.content_hash.as_ref().ok_or_else(|| {
        AppError::Export(
            "Spell has no content hash. Run the migration to backfill hashes (e.g. restart the app or use the CLI).".to_string(),
        )
    })?;
    let canonical_json = spell.canonical_data.as_ref().ok_or_else(|| {
        AppError::Export(
            "Spell has no canonical data; cannot export as CanonicalSpell JSON.".to_string(),
        )
    })?;
    let mut canonical: CanonicalSpell = serde_json::from_str(canonical_json)
        .map_err(|e| AppError::Export(format!("Invalid canonical_data for spell: {}", e)))?;
    canonical.id = Some(content_hash.clone());
    canonical.schema_version = CURRENT_SCHEMA_VERSION;
    serde_json::to_string(&canonical).map_err(|e| AppError::Export(e.to_string()))
}

#[tauri::command]
pub async fn export_spell_bundle_json(
    state: State<'_, Arc<Pool>>,
    ids: Vec<i64>,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        export_spell_bundle_json_impl(&conn, ids)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

fn export_spell_bundle_json_impl(
    conn: &rusqlite::Connection,
    ids: Vec<i64>,
) -> Result<String, AppError> {
    let mut spells: Vec<CanonicalSpell> = Vec::with_capacity(ids.len());
    let mut missing_hashes: Vec<String> = vec![];
    for id in ids {
        let spell = match get_spell_from_conn(conn, id)? {
            Some(s) => s,
            None => return Err(AppError::NotFound(format!("Spell id {} not found", id))),
        };
        let Some(content_hash) = &spell.content_hash else {
            missing_hashes.push(format!("{} (id {})", spell.name, spell.id.unwrap_or(id)));
            continue;
        };
        let canonical_json = spell.canonical_data.as_ref().ok_or_else(|| {
            AppError::Export(format!(
                "Spell '{}' has no canonical data; cannot export.",
                spell.name
            ))
        })?;
        let mut canonical: CanonicalSpell = serde_json::from_str(canonical_json).map_err(|e| {
            AppError::Export(format!(
                "Invalid canonical_data for spell '{}': {}",
                spell.name, e
            ))
        })?;
        canonical.id = Some(content_hash.clone());
        canonical.schema_version = CURRENT_SCHEMA_VERSION;
        spells.push(canonical);
    }
    if !missing_hashes.is_empty() {
        return Err(AppError::Export(format!(
            "Spell(s) with no content hash (run migration to backfill): {}",
            missing_hashes.join(", ")
        )));
    }
    let envelope = SpellBundleExport {
        schema_version: CURRENT_SCHEMA_VERSION,
        bundle_format_version: BUNDLE_FORMAT_VERSION,
        spells,
    };
    serde_json::to_string(&envelope).map_err(|e| AppError::Export(e.to_string()))
}

#[tauri::command]
pub async fn print_spell(
    state: State<'_, Arc<Pool>>,
    spell_id: i64,
    layout: String,
    page_size: Option<String>,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    let spell = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        get_spell_from_conn(&conn, spell_id)
            .and_then(|opt| opt.ok_or_else(|| AppError::Unknown("spell not found".to_string())))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

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
    )
    .await?;

    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
pub async fn print_spellbook(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    layout: String,
    page_size: Option<String>,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    let (character, spells) = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT name, type, race, alignment, notes FROM \"character\" WHERE id = ?",
        )?;

        // Fetch core character data
        let (name, char_type, race, alignment, notes) = stmt.query_row(
            [character_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )?;

        // Fetch abilities
        let abilities: Option<CharacterAbilities> = conn.query_row(
            "SELECT id, character_id, str, dex, con, int, wis, cha, com FROM character_ability WHERE character_id = ?",
            [character_id],
            |row| {
                Ok(CharacterAbilities {
                    id: row.get(0)?,
                    character_id: row.get(1)?,
                    str: row.get(2)?,
                    dex: row.get(3)?,
                    con: row.get(4)?,
                    int: row.get(5)?,
                    wis: row.get(6)?,
                    cha: row.get(7)?,
                    com: row.get(8)?,
                })
            }
        ).optional()?;

        // Fetch classes
        let mut stmt = conn.prepare("SELECT id, character_id, class_name, class_label, level FROM character_class WHERE character_id = ?")?;
        let class_rows = stmt.query_map([character_id], |row| {
            Ok(CharacterClass {
                id: row.get(0)?,
                character_id: row.get(1)?,
                class_name: row.get(2)?,
                class_label: row.get(3)?,
                level: row.get(4)?,
            })
        })?;
        let mut classes = vec![];
        for r in class_rows {
            classes.push(r?);
        }

        let character = PrintableCharacter {
            name,
            character_type: char_type,
            race,
            alignment,
            notes,
            character_spells: vec![],
            abilities,
            classes,
            include_com: true,
            include_notes: true,
        };

        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, s.class_list, s.range, s.components,
                    s.duration, s.saving_throw, s.description, sb.prepared, sb.known, sb.notes
             FROM spellbook sb
             JOIN spell s ON s.id = sb.spell_id
             WHERE sb.character_id = ?
             ORDER BY s.level, s.name",
        )?;

        let rows = stmt.query_map([character_id], |row| {
            Ok(PrintableSpellbookEntry {
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
                class_name: None,
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<_, AppError>((character, out))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

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
    )
    .await?;

    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
pub async fn export_character_sheet(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    format: String, // "html" or "md"
    include_com: bool,
    include_notes: bool,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    let character = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT name, type, race, alignment, notes FROM \"character\" WHERE id = ?",
        )?;

        // Fetch core character data
        let (name, char_type, race, alignment, notes) = stmt.query_row(
            [character_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )?;

        // Fetch abilities
        let abilities: Option<CharacterAbilities> = conn.query_row(
            "SELECT id, character_id, str, dex, con, int, wis, cha, com FROM character_ability WHERE character_id = ?",
            [character_id],
            |row| {
                Ok(CharacterAbilities {
                    id: row.get(0)?,
                    character_id: row.get(1)?,
                    str: row.get(2)?,
                    dex: row.get(3)?,
                    con: row.get(4)?,
                    int: row.get(5)?,
                    wis: row.get(6)?,
                    cha: row.get(7)?,
                    com: row.get(8)?,
                })
            }
        ).optional()?;

        // Fetch classes
        let mut stmt = conn.prepare("SELECT id, character_id, class_name, class_label, level FROM character_class WHERE character_id = ?")?;
        let class_rows = stmt.query_map([character_id], |row| {
            Ok(CharacterClass {
                id: row.get(0)?,
                character_id: row.get(1)?,
                class_name: row.get(2)?,
                class_label: row.get(3)?,
                level: row.get(4)?,
            })
        })?;
        let mut classes = vec![];
        for r in class_rows {
            classes.push(r?);
        }

        // Fetch ALL spells for ALL classes
        let mut character_spells = vec![];
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, s.class_list, s.range, s.components,
                    s.duration, s.saving_throw, s.description,
                    (ccs.list_type = 'PREPARED') as prepared,
                    (ccs.list_type = 'KNOWN') as known,
                    ccs.notes, cc.class_name
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             JOIN character_class cc ON cc.id = ccs.character_class_id
             WHERE cc.character_id = ?
             ORDER BY cc.class_name, s.level, s.name",
        )?;

        let rows = stmt.query_map([character_id], |row| {
            Ok(PrintableSpellbookEntry {
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
                class_name: Some(row.get(13)?),
            })
        })?;

        for r in rows {
            character_spells.push(r?);
        }

        Ok::<_, AppError>(PrintableCharacter {
            name,
            character_type: char_type,
            race,
            alignment,
            notes,
            character_spells,
            abilities,
            classes,
            include_com,
            include_notes,
        })
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let output_dir = app_data_dir()?.join("prints");

    // Map internal "pdf" to "html" if it comes from legacy UI or stays for compat
    let effective_format = if format == "pdf" { "html" } else { &format };

    let result = call_sidecar(
        "export",
        json!({
            "mode": "character_sheet",
            "character": character,
            "format": effective_format,
            "output_dir": output_dir,
            "page_size": "letter"
        }),
    )
    .await?;

    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
pub async fn export_character_spellbook_pack(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    class_name: String, // e.g. "Mage"
    layout: String,     // "compact" or "full"
    format: String,     // "html" or "md"
    include_notes: bool,
) -> Result<String, AppError> {
    let pool = state.inner().clone();
    let class_name_query = class_name.clone();
    let (character, spells) = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;

        // Fetch character basic info
        let character = conn.query_row(
            "SELECT name, type, race, alignment, notes FROM \"character\" WHERE id = ?",
            [character_id],
            |row| {
                Ok(PrintableCharacter {
                    name: row.get(0)?,
                    character_type: row.get(1)?,
                    race: row.get(2)?,
                    alignment: row.get(3)?,
                    notes: row.get(4)?,
                    character_spells: vec![],
                    abilities: None,
                    classes: vec![],
                    include_com: false,
                    include_notes,
                })
            },
        )?;

        // Fetch spells for this specific class
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, s.class_list, s.range, s.components,
                    s.duration, s.saving_throw, s.description,
                    (ccs.list_type = 'PREPARED') as prepared,
                    (ccs.list_type = 'KNOWN') as known,
                    ccs.notes
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             JOIN character_class cc ON cc.id = ccs.character_class_id
             WHERE cc.character_id = ? AND cc.class_name = ?
             ORDER BY s.level, s.name",
        )?;

        let rows = stmt.query_map(rusqlite::params![character_id, class_name_query], |row| {
            Ok(PrintableSpellbookEntry {
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
                class_name: Some(class_name_query.clone()),
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<_, AppError>((character, out))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let output_dir = app_data_dir()?.join("prints");
    let effective_format = if format == "pdf" { "html" } else { &format };

    let result = call_sidecar(
        "export",
        json!({
            "mode": "spellbook_pack",
            "character": character,
            "class_name": class_name,
            "spells": spells,
            "format": effective_format,
            "layout": layout,
            "output_dir": output_dir,
            "page_size": "letter"
        }),
    )
    .await?;

    Ok(result
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn setup_test_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                school TEXT,
                sphere TEXT,
                class_list TEXT,
                level INTEGER NOT NULL,
                range TEXT,
                components TEXT,
                material_components TEXT,
                casting_time TEXT,
                duration TEXT,
                area TEXT,
                saving_throw TEXT,
                damage TEXT,
                magic_resistance TEXT,
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER,
                is_cantrip INTEGER,
                updated_at TEXT,
                canonical_data TEXT,
                content_hash TEXT,
                schema_version INTEGER
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE artifact (
                id INTEGER PRIMARY KEY,
                spell_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_export_spell_as_json() {
        let conn = setup_test_db();
        let hash = "a".repeat(64);
        let spell = CanonicalSpell {
            name: "N1".into(),
            tradition: "ARCANE".into(),
            level: 1,
            description: "D1".into(),
            school: Some("Abjuration".into()),
            version: "2.0.0".into(),
            ..Default::default()
        };
        let canonical_data = serde_json::to_string(&spell).unwrap();

        conn.execute(
            "INSERT INTO spell (id, name, level, description, school, canonical_data, content_hash, schema_version, is_quest_spell, is_cantrip, reversible)
             VALUES (1, 'N1', 1, 'D1', 'Abjuration', ?, ?, 2, 0, 0, 0)",
            params![canonical_data, hash],
        )
        .unwrap();

        let json = export_spell_as_json_impl(&conn, 1).unwrap();
        let exported: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(exported["id"], hash);
        assert_eq!(exported["name"], "N1");
        assert_eq!(exported["schema_version"], CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_export_spell_bundle_json() {
        let conn = setup_test_db();
        let hash1 = "a".repeat(64);
        let hash2 = "b".repeat(64);

        let s1 = CanonicalSpell {
            name: "S1".into(),
            tradition: "ARCANE".into(),
            level: 1,
            description: "D1".into(),
            school: Some("Evocation".into()),
            version: "2.0.0".into(),
            ..Default::default()
        };
        let s2 = CanonicalSpell {
            name: "S2".into(),
            tradition: "DIVINE".into(),
            level: 2,
            description: "D2".into(),
            sphere: Some("Combat".into()),
            version: "2.0.0".into(),
            ..Default::default()
        };

        conn.execute(
            "INSERT INTO spell (id, name, level, description, school, canonical_data, content_hash, schema_version, is_quest_spell, is_cantrip, reversible)
             VALUES (1, 'S1', 1, 'D1', 'Evocation', ?, ?, 2, 0, 0, 0)",
            params![serde_json::to_string(&s1).unwrap(), hash1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, level, description, sphere, canonical_data, content_hash, schema_version, is_quest_spell, is_cantrip, reversible)
             VALUES (2, 'S2', 2, 'D2', 'Combat', ?, ?, 2, 0, 0, 0)",
            params![serde_json::to_string(&s2).unwrap(), hash2],
        )
        .unwrap();

        let json = export_spell_bundle_json_impl(&conn, vec![1, 2]).unwrap();
        let exported: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(exported["bundle_format_version"], BUNDLE_FORMAT_VERSION);
        assert_eq!(exported["spells"].as_array().unwrap().len(), 2);
        assert_eq!(exported["spells"][0]["id"], hash1);
        assert_eq!(exported["spells"][1]["id"], hash2);
    }
}
