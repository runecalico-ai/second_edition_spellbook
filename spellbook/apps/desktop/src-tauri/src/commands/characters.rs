use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    Character, CharacterAbilities, CharacterClass, CharacterSpellbookEntry, UpdateAbilitiesInput,
    UpdateCharacterDetailsInput,
};
use rusqlite::{params, OptionalExtension};
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
pub async fn update_character_details(
    state: State<'_, Arc<Pool>>,
    input: UpdateCharacterDetailsInput,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE \"character\" SET name=?, type=?, race=?, alignment=?, com_enabled=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            params![input.name, input.character_type, input.race, input.alignment, input.com_enabled, input.notes, input.id],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn delete_character(state: State<'_, Arc<Pool>>, id: i64) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM \"character\" WHERE id=?", params![id])?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn get_character(state: State<'_, Arc<Pool>>, id: i64) -> Result<Character, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare("SELECT id, name, type, race, alignment, com_enabled, notes, created_at, updated_at FROM \"character\" WHERE id=?")?;
        let character = stmt.query_row(params![id], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                character_type: row.get(2)?,
                race: row.get(3)?,
                alignment: row.get(4)?,
                com_enabled: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        Ok::<Character, AppError>(character)
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
        let mut stmt =
            conn.prepare("SELECT id, name, type, race, alignment, com_enabled, notes, created_at, updated_at FROM \"character\" ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                character_type: row.get(2)?,
                race: row.get(3)?,
                alignment: row.get(4)?,
                com_enabled: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
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
pub async fn get_character_abilities(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Option<CharacterAbilities>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, character_id, str, dex, con, int, wis, cha, com
             FROM character_ability WHERE character_id = ?",
        )?;
        let abilities = stmt
            .query_row(params![character_id], |row| {
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
            })
            .optional()?;
        Ok::<Option<CharacterAbilities>, AppError>(abilities)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn update_character_abilities(
    state: State<'_, Arc<Pool>>,
    input: UpdateAbilitiesInput,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO character_ability (character_id, str, dex, con, int, wis, cha, com)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(character_id) DO UPDATE SET
                str=excluded.str, dex=excluded.dex, con=excluded.con,
                int=excluded.int, wis=excluded.wis, cha=excluded.cha, com=excluded.com",
            params![
                input.character_id,
                input.str,
                input.dex,
                input.con,
                input.int,
                input.wis,
                input.cha,
                input.com
            ],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn get_character_classes(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Vec<CharacterClass>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, character_id, class_name, level FROM character_class WHERE character_id = ?"
        )?;
        let rows = stmt.query_map(params![character_id], |row| {
            Ok(CharacterClass {
                id: row.get(0)?,
                character_id: row.get(1)?,
                class_name: row.get(2)?,
                level: row.get(3)?,
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<Vec<CharacterClass>, AppError>(out)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn add_character_class(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
    class_name: String,
    level: i32,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO character_class (character_id, class_name, level) VALUES (?, ?, ?)",
            params![character_id, class_name, level],
        )?;
        Ok::<i64, AppError>(conn.last_insert_rowid())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn update_character_class_level(
    state: State<'_, Arc<Pool>>,
    class_id: i64,
    level: i32,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE character_class SET level=? WHERE id=?",
            params![level, class_id],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn remove_character_class(
    state: State<'_, Arc<Pool>>,
    class_id: i64,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM character_class WHERE id=?", params![class_id])?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn get_character_class_spells(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    list_type: Option<String>,
) -> Result<Vec<CharacterSpellbookEntry>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let query = if list_type.is_some() {
            "SELECT s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
                    CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
                    CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
                    ccs.notes,
                    s.tags
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             WHERE ccs.character_class_id = ? AND ccs.list_type = ?
             ORDER BY s.level, s.name"
        } else {
            "SELECT s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
                    MAX(CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END),
                    MAX(CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END),
                    ccs.notes,
                    s.tags
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             WHERE ccs.character_class_id = ?
             GROUP BY s.id
             ORDER BY s.level, s.name"
        };

        let mut stmt = conn.prepare(query)?;
        if let Some(lt) = list_type {
            let rows = stmt.query_map(params![character_class_id, lt], |row| {
                Ok(CharacterSpellbookEntry {
                    character_id: 0,
                    spell_id: row.get(0)?,
                    spell_name: row.get(1)?,
                    spell_level: row.get(2)?,
                    spell_school: row.get(3)?,
                    spell_sphere: row.get(4)?,
                    is_quest_spell: row.get(5)?,
                    is_cantrip: row.get(6)?,
                    prepared: row.get(7)?,
                    known: row.get(8)?,
                    notes: row.get(9)?,
                    tags: row.get(10)?,
                })
            })?;
            let mut out = vec![];
            for row in rows {
                out.push(row?);
            }
            Ok::<Vec<CharacterSpellbookEntry>, AppError>(out)
        } else {
            let rows = stmt.query_map(params![character_class_id], |row| {
                Ok(CharacterSpellbookEntry {
                    character_id: 0,
                    spell_id: row.get(0)?,
                    spell_name: row.get(1)?,
                    spell_level: row.get(2)?,
                    spell_school: row.get(3)?,
                    spell_sphere: row.get(4)?,
                    is_quest_spell: row.get(5)?,
                    is_cantrip: row.get(6)?,
                    prepared: row.get(7)?,
                    known: row.get(8)?,
                    notes: row.get(9)?,
                    tags: row.get(10)?,
                })
            })?;
            let mut out = vec![];
            for row in rows {
                out.push(row?);
            }
            Ok::<Vec<CharacterSpellbookEntry>, AppError>(out)
        }
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn add_character_spell(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;

        // C1.1.6 Ensure integrity: Validate Prepared spells must be Known
        if list_type == "PREPARED" {
            let known_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                params![character_class_id, spell_id],
                |row| row.get(0),
            )?;

            if !known_exists {
                return Err(AppError::Unknown("Cannot prepare a spell that is not in the Known list.".to_string()));
            }
        }

        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(character_class_id, spell_id, list_type) DO UPDATE SET
                notes=excluded.notes",
            params![character_class_id, spell_id, list_type, notes],
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
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = ?",
            params![character_class_id, spell_id, list_type],
        )?;

        // C1.1.5 Ensure integrity: Removing from Known removes from Prepared
        if list_type == "KNOWN" {
             conn.execute(
                "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'PREPARED'",
                params![character_class_id, spell_id],
            )?;
        }

        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn update_character_spell_notes(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE character_class_spell SET notes=? WHERE character_class_id = ? AND spell_id = ? AND list_type = ?",
            params![notes, character_class_id, spell_id, list_type],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

// Deprecated: legacy spellbook commands for backward compatibility during transition.
// They still work on the old 'spellbook' table.

/// Deprecated: legacy spellbook command. Use the per-class system instead.
#[tauri::command]
pub async fn get_character_spellbook(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Vec<CharacterSpellbookEntry>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip, sb.prepared, sb.known, sb.notes, s.tags
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
                spell_sphere: row.get(4)?,
                is_quest_spell: row.get(5)?,
                is_cantrip: row.get(6)?,
                prepared: row.get(7)?,
                known: row.get(8)?,
                notes: row.get(9)?,
                tags: row.get(10)?,
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

/// Deprecated: legacy spellbook command. Use the per-class system instead.
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
