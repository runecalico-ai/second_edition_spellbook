use crate::db::Pool;
use crate::error::AppError;
use crate::models::{Character, CharacterSpellbookEntry};
use rusqlite::params;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn create_character(
    state: State<'_, Arc<Pool>>,
    name: String,
    character_type: String,
    notes: Option<String>,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let character_type = if character_type.trim().is_empty() {
            "PC".to_string()
        } else {
            character_type
        };
        conn.execute(
            "INSERT INTO \"character\" (name, type, notes) VALUES (?, ?, ?)",
            params![name, character_type, notes],
        )?;
        Ok::<i64, AppError>(conn.last_insert_rowid())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn list_characters(state: State<'_, Arc<Pool>>) -> Result<Vec<Character>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, type, notes FROM \"character\" ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                character_type: row.get(2)?,
                notes: row.get(3)?,
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<Vec<Character>, AppError>(out)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn get_character_spellbook(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Vec<CharacterSpellbookEntry>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, sb.prepared, sb.known, sb.notes
             FROM spellbook sb
             JOIN spell s ON s.id = sb.spell_id
             WHERE sb.character_id = ?
             ORDER BY s.level, s.name",
        )?;
        let rows = stmt.query_map([character_id], |row| {
            Ok(CharacterSpellbookEntry {
                character_id,
                spell_id: row.get(0)?,
                spell_name: row.get(1)?,
                spell_level: row.get(2)?,
                spell_school: row.get(3)?,
                prepared: row.get(4)?,
                known: row.get(5)?,
                notes: row.get(6)?,
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<Vec<CharacterSpellbookEntry>, AppError>(out)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn update_character_spell(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    spell_id: i64,
    prepared: i64,
    known: i64,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO spellbook (character_id, spell_id, prepared, known, notes)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(character_id, spell_id) DO UPDATE SET
                prepared=excluded.prepared,
                known=excluded.known,
                notes=excluded.notes",
            params![character_id, spell_id, prepared, known, notes],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn remove_character_spell(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    spell_id: i64,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "DELETE FROM spellbook WHERE character_id = ? AND spell_id = ?",
            params![character_id, spell_id],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}
