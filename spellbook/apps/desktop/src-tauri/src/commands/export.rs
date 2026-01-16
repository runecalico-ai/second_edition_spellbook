use crate::commands::spells::get_spell_from_conn;
use crate::db::Pool;
use crate::error::AppError;
use crate::models::{PrintableCharacter, PrintableSpellbookEntry};
use crate::sidecar::call_sidecar;
use dirs::data_dir as system_data_dir;
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
        let character = conn.query_row(
            "SELECT name, type, notes FROM \"character\" WHERE id = ?",
            [character_id],
            |row| {
                Ok(PrintableCharacter {
                    name: row.get(0)?,
                    character_type: row.get(1)?,
                    notes: row.get(2)?,
                    spells: vec![],
                })
            },
        )?;

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
