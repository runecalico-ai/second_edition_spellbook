use crate::commands::spells::get_spell_from_conn;
use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    CharacterAbilities, CharacterClass, PrintableCharacter, PrintableSpellbookEntry,
};
use crate::sidecar::call_sidecar;
use dirs::data_dir as system_data_dir;
use rusqlite::OptionalExtension;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

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
