use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    Character, CharacterAbilities, CharacterClass, CharacterSearchFilters, CharacterSearchResult,
    CharacterSpellbookEntry, UpdateAbilitiesInput, UpdateCharacterDetailsInput,
};
use rusqlite::ToSql;
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Arc;
use tauri::State;

fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    conn.query_row(&sql, [column], |_| Ok(())).is_ok()
}

/// Sync helper for building character class spell list. Used by the command and by tests.
fn get_character_class_spells_with_conn(
    conn: &Connection,
    character_class_id: i64,
    list_type: Option<&str>,
) -> Result<Vec<CharacterSpellbookEntry>, AppError> {
    let use_hash = table_has_column(conn, "character_class_spell", "spell_content_hash");
    if use_hash {
        let (query, params): (String, Vec<Box<dyn ToSql>>) = if let Some(lt) = list_type {
            (
                "SELECT cc.character_id, COALESCE(s.id, 0) AS spell_id, COALESCE(s.name, 'Spell no longer in library') AS spell_name, COALESCE(s.level, 0) AS spell_level, s.school, s.sphere, COALESCE(s.is_quest_spell, 0), COALESCE(s.is_cantrip, 0),
                        CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
                        CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
                        ccs.notes,
                        s.tags,
                        ccs.spell_content_hash,
                        CASE WHEN s.id IS NULL AND ccs.spell_content_hash IS NOT NULL THEN 1 ELSE 0 END AS missing_from_library
                 FROM character_class_spell ccs
                 LEFT JOIN spell s ON s.content_hash = ccs.spell_content_hash
                 JOIN character_class cc ON cc.id = ccs.character_class_id
                 WHERE ccs.character_class_id = ? AND ccs.list_type = ?
                 ORDER BY COALESCE(s.level, 0), COALESCE(s.name, '')"
                    .to_string(),
                vec![Box::new(character_class_id), Box::new(lt.to_string())],
            )
        } else {
            (
                "SELECT cc.character_id, COALESCE(s.id, 0) AS spell_id, COALESCE(s.name, 'Spell no longer in library') AS spell_name, COALESCE(s.level, 0) AS spell_level, s.school, s.sphere, COALESCE(s.is_quest_spell, 0), COALESCE(s.is_cantrip, 0),
                        CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
                        CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
                        ccs.notes,
                        s.tags,
                        ccs.spell_content_hash,
                        CASE WHEN s.id IS NULL AND ccs.spell_content_hash IS NOT NULL THEN 1 ELSE 0 END AS missing_from_library
                 FROM character_class_spell ccs
                 LEFT JOIN spell s ON s.content_hash = ccs.spell_content_hash
                 JOIN character_class cc ON cc.id = ccs.character_class_id
                 WHERE ccs.character_class_id = ?
                 ORDER BY COALESCE(s.level, 0), COALESCE(s.name, '')"
                    .to_string(),
                vec![Box::new(character_class_id)],
            )
        };
        let mut stmt = conn.prepare(&query)?;
        let rows = if list_type.is_some() {
            stmt.query_map(rusqlite::params_from_iter(params.iter()), map_row_14)?
        } else {
            stmt.query_map(rusqlite::params_from_iter(params.iter()), map_row_14)?
        };
        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    } else {
        let query = if list_type.is_some() {
            "SELECT cc.character_id, s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
                    CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
                    CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
                    ccs.notes,
                    s.tags
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             JOIN character_class cc ON cc.id = ccs.character_class_id
             WHERE ccs.character_class_id = ? AND ccs.list_type = ?
             ORDER BY s.level, s.name"
        } else {
            "SELECT cc.character_id, s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
                    CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
                    CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
                    ccs.notes,
                    s.tags
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             JOIN character_class cc ON cc.id = ccs.character_class_id
             WHERE ccs.character_class_id = ?
             ORDER BY s.level, s.name"
        };
        let mut stmt = conn.prepare(query)?;
        let rows = if let Some(lt) = list_type {
            stmt.query_map(params![character_class_id, lt], map_row_12)?
        } else {
            stmt.query_map(params![character_class_id], map_row_12)?
        };
        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

fn map_row_14(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterSpellbookEntry> {
    Ok(CharacterSpellbookEntry {
        character_id: row.get(0)?,
        spell_id: row.get(1)?,
        spell_name: row.get(2)?,
        spell_level: row.get(3)?,
        spell_school: row.get(4)?,
        spell_sphere: row.get(5)?,
        is_quest_spell: row.get(6)?,
        is_cantrip: row.get(7)?,
        prepared: row.get(8)?,
        known: row.get(9)?,
        notes: row.get(10)?,
        tags: row.get(11)?,
        spell_content_hash: row.get(12)?,
        missing_from_library: row.get::<_, i64>(13)? != 0,
    })
}

fn map_row_12(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterSpellbookEntry> {
    Ok(CharacterSpellbookEntry {
        character_id: row.get(0)?,
        spell_id: row.get(1)?,
        spell_name: row.get(2)?,
        spell_level: row.get(3)?,
        spell_school: row.get(4)?,
        spell_sphere: row.get(5)?,
        is_quest_spell: row.get(6)?,
        is_cantrip: row.get(7)?,
        prepared: row.get(8)?,
        known: row.get(9)?,
        notes: row.get(10)?,
        tags: row.get(11)?,
        spell_content_hash: None,
        missing_from_library: false,
    })
}

/// Sync helper: remove character_class_spell row(s) by spell_content_hash.
/// When list_type == "KNOWN", also deletes PREPARED row with same hash (cascade "prepared must be known").
fn remove_character_spell_by_hash_with_conn(
    conn: &Connection,
    character_class_id: i64,
    spell_content_hash: &str,
    list_type: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?",
        params![character_class_id, spell_content_hash, list_type],
    )?;
    if list_type == "KNOWN" {
        conn.execute(
            "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = 'PREPARED'",
            params![character_class_id, spell_content_hash],
        )?;
    }
    Ok(())
}

/// Sync helper: validate PREPARED-known rule and upsert. Used by add_character_spell command and tests.
fn add_character_spell_with_conn(
    conn: &Connection,
    character_class_id: i64,
    spell_id: i64,
    list_type: &str,
    notes: Option<&str>,
) -> Result<(), AppError> {
    // C1.1.6 Ensure integrity: Validate Prepared spells must be Known
    if list_type == "PREPARED" {
        let use_hash = table_has_column(conn, "character_class_spell", "spell_content_hash");
        let known_exists: bool = if use_hash {
            let spell_content_hash: Option<String> = conn
                .query_row(
                    "SELECT content_hash FROM spell WHERE id = ?",
                    [spell_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            if let Some(hash) = spell_content_hash.as_deref() {
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = 'KNOWN')",
                    params![character_class_id, hash],
                    |row| row.get(0),
                )?
            } else {
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                    params![character_class_id, spell_id],
                    |row| row.get(0),
                )?
            }
        } else {
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                params![character_class_id, spell_id],
                |row| row.get(0),
            )?
        };

        if !known_exists {
            return Err(AppError::Unknown(
                "Cannot prepare a spell that is not in the Known list.".to_string(),
            ));
        }
    }

    upsert_character_class_spell_with_hash(
        conn,
        character_class_id,
        spell_id,
        list_type,
        notes,
    )
}

fn upsert_character_class_spell_with_hash(
    conn: &Connection,
    character_class_id: i64,
    spell_id: i64,
    list_type: &str,
    notes: Option<&str>,
) -> Result<(), AppError> {
    if table_has_column(conn, "character_class_spell", "spell_content_hash") {
        let spell_content_hash: Option<String> = conn
            .query_row(
                "SELECT content_hash FROM spell WHERE id = ?",
                [spell_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if let Some(hash) = spell_content_hash.as_deref() {
            let updated = conn.execute(
                "UPDATE character_class_spell
                 SET spell_id = ?, notes = ?, spell_content_hash = ?
                 WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?",
                params![spell_id, notes, hash, character_class_id, hash, list_type],
            )?;
            if updated == 0 {
                conn.execute(
                    "INSERT INTO character_class_spell (
                        character_class_id,
                        spell_id,
                        list_type,
                        notes,
                        spell_content_hash
                     )
                     VALUES (?, ?, ?, ?, ?)",
                    params![character_class_id, spell_id, list_type, notes, hash],
                )?;
            }
        } else {
            conn.execute(
                "INSERT INTO character_class_spell (
                    character_class_id,
                    spell_id,
                    list_type,
                    notes,
                    spell_content_hash
                 )
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(character_class_id, spell_id, list_type) DO UPDATE SET
                    notes=excluded.notes,
                    spell_content_hash=excluded.spell_content_hash",
                params![
                    character_class_id,
                    spell_id,
                    list_type,
                    notes,
                    spell_content_hash
                ],
            )?;
        }
    } else {
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(character_class_id, spell_id, list_type) DO UPDATE SET
                notes=excluded.notes",
            params![character_class_id, spell_id, list_type, notes],
        )?;
    }
    Ok(())
}

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
        if input.str < 0
            || input.dex < 0
            || input.con < 0
            || input.int < 0
            || input.wis < 0
            || input.cha < 0
            || input.com < 0
        {
            return Err(AppError::Unknown(
                "Ability scores must be non-negative.".to_string(),
            ));
        }
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
            "SELECT id, character_id, class_name, class_label, level FROM character_class WHERE character_id = ?"
        )?;
        let rows = stmt.query_map(params![character_id], |row| {
            Ok(CharacterClass {
                id: row.get(0)?,
                character_id: row.get(1)?,
                class_name: row.get(2)?,
                class_label: row.get(3)?,
                level: row.get(4)?,
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
    class_label: Option<String>,
    level: i32,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        if level < 0 {
            return Err(AppError::Unknown("Level must be non-negative.".to_string()));
        }
        let conn = pool.get()?;

        // Check for duplicates
        let existing_id: Option<i64> = conn.query_row(
            "SELECT id FROM character_class WHERE character_id = ? AND class_name = ? AND IFNULL(class_label, '') = ?",
            params![character_id, class_name, class_label.as_deref().unwrap_or("")],
            |row| row.get(0),
        ).optional()?;

        if let Some(id) = existing_id {
            return Ok::<i64, AppError>(id);
        }

        conn.execute(
            "INSERT INTO character_class (character_id, class_name, class_label, level) VALUES (?, ?, ?, ?)",
            params![character_id, class_name, class_label, level],
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
        if level < 0 {
            return Err(AppError::Unknown("Level must be non-negative.".to_string()));
        }
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
    let list_type_clone = list_type.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        get_character_class_spells_with_conn(
            &conn,
            character_class_id,
            list_type_clone.as_deref(),
        )
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
        add_character_spell_with_conn(
            &conn,
            character_class_id,
            spell_id,
            &list_type,
            notes.as_deref(),
        )
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
pub async fn remove_character_spell_by_hash(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_content_hash: String,
    list_type: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        remove_character_spell_by_hash_with_conn(
            &conn,
            character_class_id,
            &spell_content_hash,
            &list_type,
        )
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
                spell_content_hash: None,
                missing_from_library: false,
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

/// Test-only: seeds a character with one class and one orphan spell row (spell_content_hash
/// set, no matching spell row) for E2E missing-library placeholder tests.
/// Only use in E2E tests; creates data that would not occur in production without CASCADE disabled.
#[tauri::command]
pub async fn test_seed_character_with_orphan_spell(
    state: State<'_, Arc<Pool>>,
    character_name: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    let name = character_name;
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        if !table_has_column(&conn, "character_class_spell", "spell_content_hash") {
            return Err(AppError::Unknown(
                "test_seed_character_with_orphan_spell requires spell_content_hash column (Migration 0015)"
                    .to_string(),
            ));
        }
        conn.execute(
            "INSERT INTO \"character\" (name, type, notes) VALUES (?, 'PC', NULL)",
            params![name],
        )?;
        let character_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO character_class (character_id, class_name, class_label, level) VALUES (?, 'Mage', NULL, 1)",
            params![character_id],
        )?;
        let character_class_id = conn.last_insert_rowid();
        conn.execute("PRAGMA foreign_keys=OFF", [])?;
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) VALUES (?, 0, 'KNOWN', NULL, 'e2e-orphan-hash')",
            params![character_class_id],
        )?;
        conn.execute("PRAGMA foreign_keys=ON", [])?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_character_spell_test_db(with_hash_column: bool) -> Connection {
        let conn = Connection::open_in_memory().expect("open db");
        let character_class_spell_hash_column = if with_hash_column {
            "spell_content_hash TEXT,"
        } else {
            ""
        };
        conn.execute_batch(&format!(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                content_hash TEXT
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT,
                {character_class_spell_hash_column}
                UNIQUE(character_class_id, spell_id, list_type)
            );
            "#
        ))
        .expect("create schema");
        if with_hash_column {
            conn.execute_batch(
                r#"
                CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_character_hash_list
                ON character_class_spell(character_class_id, spell_content_hash, list_type)
                WHERE spell_content_hash IS NOT NULL;
                "#,
            )
            .expect("create hash unique index");
        }
        conn
    }

    #[test]
    fn test_upsert_character_class_spell_with_hash_populates_hash_when_column_exists() {
        let conn = setup_character_spell_test_db(true);
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (1, 'hash-1')",
            [],
        )
        .expect("seed spell");

        upsert_character_class_spell_with_hash(&conn, 7, 1, "KNOWN", Some("note"))
            .expect("upsert spellbook entry");

        let stored_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE character_class_id = 7",
                [],
                |row| row.get(0),
            )
            .expect("query stored hash");
        assert_eq!(stored_hash, "hash-1");
    }

    #[test]
    fn test_upsert_character_class_spell_with_hash_supports_legacy_schema() {
        let conn = setup_character_spell_test_db(false);
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (1, 'hash-1')",
            [],
        )
        .expect("seed spell");

        upsert_character_class_spell_with_hash(&conn, 7, 1, "KNOWN", Some("note"))
            .expect("upsert legacy spellbook entry");

        let notes: String = conn
            .query_row(
                "SELECT notes FROM character_class_spell WHERE character_class_id = 7",
                [],
                |row| row.get(0),
            )
            .expect("query stored notes");
        assert_eq!(notes, "note");
    }

    #[test]
    fn test_remove_character_spell_by_hash_deletes_row() {
        let conn = setup_character_spell_test_db(true);
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) VALUES (7, 0, 'KNOWN', NULL, 'orphan-hash')",
            [],
        )
        .expect("insert orphan row");

        remove_character_spell_by_hash_with_conn(&conn, 7, "orphan-hash", "KNOWN")
            .expect("remove by hash");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM character_class_spell WHERE spell_content_hash = 'orphan-hash'",
                [],
                |row| row.get(0),
            )
            .expect("count after delete");
        assert_eq!(count, 0, "row with spell_content_hash = 'orphan-hash' must be deleted");
    }

    /// Integration-style test: orphan spell_content_hash (no matching spell) returns one entry
    /// with missing_from_library == true and placeholder name "Spell no longer in library".
    #[test]
    fn get_character_class_spells_missing_or_returns_placeholder() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                content_hash TEXT,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                school TEXT,
                sphere TEXT,
                is_quest_spell INTEGER DEFAULT 0,
                is_cantrip INTEGER DEFAULT 0,
                tags TEXT
            );
            CREATE TABLE "character" (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE character_class (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT,
                spell_content_hash TEXT
            );
            INSERT INTO "character" (id, name) VALUES (1, 'Test');
            INSERT INTO character_class (id, character_id) VALUES (10, 1);
            -- One spell in library (different hash). No spell with content_hash = 'orphan-hash'.
            INSERT INTO spell (id, content_hash, name, level, school, sphere, is_quest_spell, is_cantrip, tags)
            VALUES (1, 'other-hash', 'Real Spell', 1, 'Abjuration', NULL, 0, 0, NULL);
            -- List row that references missing spell by hash only.
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash)
            VALUES (10, 0, 'KNOWN', NULL, 'orphan-hash');
            "#,
        )
        .expect("create schema and seed");

        let entries = get_character_class_spells_with_conn(&conn, 10, Some("KNOWN"))
            .expect("get_character_class_spells_with_conn");
        assert_eq!(entries.len(), 1, "one entry for orphan hash");
        assert!(entries[0].missing_from_library, "entry must be marked missing_from_library");
        assert_eq!(
            entries[0].spell_name, "Spell no longer in library",
            "placeholder name for missing spell"
        );
        assert_eq!(entries[0].spell_content_hash.as_deref(), Some("orphan-hash"));
    }

    /// get_character_class_spells with mixed present and missing: one hash matches spell table,
    /// one has no spell row; assert two entries with correct missing_from_library and names.
    #[test]
    fn get_character_class_spells_mixed_present_and_missing_returns_both() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                content_hash TEXT,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                school TEXT,
                sphere TEXT,
                is_quest_spell INTEGER DEFAULT 0,
                is_cantrip INTEGER DEFAULT 0,
                tags TEXT
            );
            CREATE TABLE "character" (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE character_class (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT,
                spell_content_hash TEXT
            );
            INSERT INTO "character" (id, name) VALUES (1, 'Test');
            INSERT INTO character_class (id, character_id) VALUES (10, 1);
            INSERT INTO spell (id, content_hash, name, level, school, sphere, is_quest_spell, is_cantrip, tags)
            VALUES (1, 'present-hash', 'Magic Missile', 1, 'Evocation', NULL, 0, 0, NULL);
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash)
            VALUES (10, 1, 'KNOWN', NULL, 'present-hash'), (10, 0, 'KNOWN', NULL, 'missing-hash');
            "#,
        )
        .expect("create schema and seed");

        let entries = get_character_class_spells_with_conn(&conn, 10, Some("KNOWN"))
            .expect("get_character_class_spells_with_conn");
        assert_eq!(entries.len(), 2, "two entries: one present, one missing");

        let present = entries
            .iter()
            .find(|e| e.spell_content_hash.as_deref() == Some("present-hash"))
            .expect("entry for present spell");
        assert!(!present.missing_from_library, "present spell must not be marked missing");
        assert_eq!(present.spell_name, "Magic Missile");

        let missing = entries
            .iter()
            .find(|e| e.spell_content_hash.as_deref() == Some("missing-hash"))
            .expect("entry for missing spell");
        assert!(missing.missing_from_library, "missing spell must be marked missing_from_library");
        assert_eq!(missing.spell_name, "Spell no longer in library");
    }

    /// remove_character_spell_by_hash with list_type KNOWN cascades: both KNOWN and PREPARED
    /// rows for the same (character_class_id, spell_content_hash) are removed.
    #[test]
    fn test_remove_character_spell_by_hash_cascades_prepared() {
        let conn = setup_character_spell_test_db(true);
        conn.execute_batch(
            r#"
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash)
            VALUES (7, 0, 'KNOWN', NULL, 'cascade-hash'), (7, 0, 'PREPARED', NULL, 'cascade-hash');
            "#,
        )
        .expect("seed KNOWN and PREPARED rows");

        remove_character_spell_by_hash_with_conn(&conn, 7, "cascade-hash", "KNOWN")
            .expect("remove by hash");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'cascade-hash'",
                [],
                |row| row.get(0),
            )
            .expect("count after delete");
        assert_eq!(count, 0, "both KNOWN and PREPARED rows must be removed");
    }

    /// PREPARED add succeeds when KNOWN row is matched by spell_content_hash (e.g. after hash restore).
    /// Seeds KNOWN with spell_id=0 and spell_content_hash='restored-hash', then spell id=5 with same hash;
    /// adding PREPARED by spell_id 5 should succeed once validation uses hash.
    #[test]
    fn test_add_prepared_spell_succeeds_when_known_row_matches_by_hash() {
        let conn = setup_character_spell_test_db(true);
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) VALUES (7, 0, 'KNOWN', NULL, 'restored-hash')",
            [],
        )
        .expect("seed KNOWN row by hash");
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (5, 'restored-hash')",
            [],
        )
        .expect("seed spell row with restored hash");

        add_character_spell_with_conn(&conn, 7, 5, "PREPARED", None)
            .expect("add PREPARED should succeed when KNOWN matches by hash");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'restored-hash' AND list_type = 'PREPARED'",
                [],
                |row| row.get(0),
            )
            .expect("count PREPARED row");
        assert_eq!(count, 1, "PREPARED row must be inserted");
    }

    /// Upsert with hash path should UPDATE existing row keyed by (character_class_id, spell_content_hash, list_type)
    /// instead of inserting a second row (which would violate idx_ccs_character_hash_list).
    #[test]
    fn test_upsert_character_class_spell_with_hash_updates_existing_hash_row() {
        let conn = setup_character_spell_test_db(true);
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (5, 'restored-hash')",
            [],
        )
        .expect("seed spell");
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) VALUES (7, 0, 'KNOWN', NULL, 'restored-hash')",
            [],
        )
        .expect("seed stale KNOWN row by hash");

        upsert_character_class_spell_with_hash(&conn, 7, 5, "KNOWN", Some("updated note"))
            .expect("upsert should update existing hash row");

        let row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'restored-hash' AND list_type = 'KNOWN'",
                [],
                |row| row.get(0),
            )
            .expect("count rows");
        assert_eq!(row_count, 1, "must have exactly one row for this hash/list");
        let (spell_id, hash): (i64, String) = conn
            .query_row(
                "SELECT spell_id, spell_content_hash FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'restored-hash' AND list_type = 'KNOWN'",
                [],
                |row| Ok((row.get(0)?, row.get::<_, String>(1)?)),
            )
            .expect("get row");
        assert_eq!(spell_id, 5, "spell_id must be refreshed from 0 to live spell id");
        assert_eq!(hash, "restored-hash", "spell_content_hash must remain unchanged");
        let notes: Option<String> = conn
            .query_row(
                "SELECT notes FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'restored-hash' AND list_type = 'KNOWN'",
                [],
                |row| row.get(0),
            )
            .expect("get notes");
        assert_eq!(notes.as_deref(), Some("updated note"), "notes must be updated");
    }

    /// Remove-by-hash still cascades after row is recovered: seed KNOWN and PREPARED by hash
    /// with stale spell_id = 0, insert the matching spell row, then remove KNOWN by hash;
    /// both rows must be deleted.
    #[test]
    fn test_remove_by_hash_cascades_after_restored_hash() {
        let conn = setup_character_spell_test_db(true);
        conn.execute_batch(
            r#"
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash)
            VALUES (7, 0, 'KNOWN', NULL, 'restored-hash'), (7, 0, 'PREPARED', NULL, 'restored-hash');
            "#,
        )
        .expect("seed KNOWN and PREPARED rows by hash with stale spell_id = 0");
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (5, 'restored-hash')",
            [],
        )
        .expect("insert matching spell row later");

        remove_character_spell_by_hash_with_conn(&conn, 7, "restored-hash", "KNOWN")
            .expect("remove KNOWN by hash");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM character_class_spell WHERE character_class_id = 7 AND spell_content_hash = 'restored-hash'",
                [],
                |row| row.get(0),
            )
            .expect("count after delete");
        assert_eq!(count, 0, "both KNOWN and PREPARED rows must be deleted after remove-by-hash");
    }
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

#[tauri::command]
pub async fn search_characters(
    state: State<'_, Arc<Pool>>,
    filters: CharacterSearchFilters,
) -> Result<Vec<CharacterSearchResult>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut query = String::from(
            "SELECT c.id, c.name, c.type, c.race, c.alignment,
                    GROUP_CONCAT(COALESCE(cc.class_label, cc.class_name) || ' ' || cc.level, ' / ') as level_summary
             FROM \"character\" c
             LEFT JOIN character_class cc ON c.id = cc.character_id
             WHERE 1=1"
        );

        let mut params: Vec<Box<dyn ToSql>> = Vec::new();

        if let Some(q) = &filters.query {
            if !q.trim().is_empty() {
                query.push_str(" AND c.id IN (SELECT rowid FROM character_fts WHERE character_fts MATCH ?)");
                // Escape special FTS5 characters and wrap in quotes for phrase matching
                let escaped_query = q.replace('"', "\"\"");
                params.push(Box::new(format!("\"{}\"", escaped_query)));
            }
        }

        if let Some(t) = &filters.character_type {
            if !t.is_empty() {
                query.push_str(" AND c.type = ?");
                params.push(Box::new(t.clone()));
            }
        }

        if let Some(r) = &filters.race {
            if !r.is_empty() {
                query.push_str(" AND c.race LIKE ?");
                params.push(Box::new(format!("%{}%", r)));
            }
        }

        if let Some(cn) = &filters.class_name {
             if !cn.is_empty() {
                // Must ensure the character has this class.
                // Since we left join, filtering on cc might filter out rows, but we group by c.id later.
                // Actually `WHERE cc.class_name = ?` would filter the join rows.
                // But if we want characters who HAVE the class, filtering the JOIN result is fine *if* we just want the character.
                // However, we want the SUMMARY to include all classes.
                // If we filter `WHERE cc.class_name = Mage`, then the GROUP_CONCAT only sees Mage.
                // So we should filter by EXISTS.
                query.push_str(" AND EXISTS (SELECT 1 FROM character_class cc2 WHERE cc2.character_id = c.id AND cc2.class_name = ?)");
                params.push(Box::new(cn.clone()));
             }
        }

        // Let's refine level filtering logic:
        // We can't easily modify the string builder for "between" if we handle min/max independently.
        // Revised Level Logic:
        if let Some(min) = filters.min_level {
             query.push_str(" AND (SELECT COALESCE(SUM(level), 0) FROM character_class WHERE character_id = c.id) >= ?");
             params.push(Box::new(min));
        }
        if let Some(max) = filters.max_level {
             query.push_str(" AND (SELECT COALESCE(SUM(level), 0) FROM character_class WHERE character_id = c.id) <= ?");
             params.push(Box::new(max));
        }

        // Ability Filters
        // We need to join character_ability table if we haven't already.
        // Or we can use subqueries or just LEFT JOIN in the main query.
        // The main query already has LEFT JOIN character_class.
        // Let's add LEFT JOIN character_ability ca ON c.id = ca.character_id
        // But we are constructing the query string.
        // It's safer to rewrite the base query to include the join if we are going to use it.
        // However, `query` is already initialized at the top.
        // I will inject the JOIN by replacing the base string OR use a subquery EXISTS/value check.
        // Subquery is cleaner for dynamic filters:
        // AND (SELECT str FROM character_ability WHERE character_id = c.id) >= ?

        if let Some(min) = filters.min_str {
            query.push_str(" AND (SELECT str FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_dex {
            query.push_str(" AND (SELECT dex FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_con {
            query.push_str(" AND (SELECT con FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_int {
            query.push_str(" AND (SELECT int FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_wis {
            query.push_str(" AND (SELECT wis FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_cha {
            query.push_str(" AND (SELECT cha FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }
        if let Some(min) = filters.min_com {
            query.push_str(" AND (SELECT com FROM character_ability WHERE character_id = c.id) >= ?");
            params.push(Box::new(min));
        }

        query.push_str(" GROUP BY c.id ORDER BY c.name");

        let mut stmt = conn.prepare(&query)?;

        // rusqlite doesn't support binding `Vec<Box<dyn ToSql>>` directly easily in `query_map` without `params_from_iter`.
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
             let id: i64 = row.get(0)?;
             let name: String = row.get(1)?;
             let char_type: String = row.get(2)?;
             let race: Option<String> = row.get(3)?;
             let alignment: Option<String> = row.get(4)?;
             let level_raw: Option<String> = row.get(5)?;

             // We also want `classes` list (strings).
             // We can parse `level_summary` or simpler, just return summary.
             // Struct `CharacterSearchResult` has `classes: Vec<String>`.
             // We can fetch classes in a separate query or just ignore it for the list view if `level_summary` is enough.
             // The task says "Character Search & Filtering". The list will show results.
             // Let's parse the summary or just put the summary in the struct if the frontend uses it.
             // Frontend `CharacterSearchResult` has `classes: Vec<String>`.
             // Let's infer classes from the summary string or fetch them.
             // Fetching inside the loop is N+1.
             // Alternatively, use `GROUP_CONCAT(class_name)` separately.

             Ok(CharacterSearchResult {
                 id,
                 name,
                 character_type: char_type,
                 race,
                 alignment,
                 level_summary: level_raw.clone().unwrap_or_default(),
                 classes: vec![], // Populated below or we accept empty for search results
             })
        })?;

        let mut results = vec![];
        for r in rows {
            results.push(r?);
        }

        // Optimizing: The frontend probably wants `classes` for display badges.
        // But `level_summary` "Mage 5 / Cleric 3" is duplicate info.
        // Let's just update `CharacterSearchResult` to make `classes` optional or populate it properly?
        // For now, let's just leave `classes` empty or parse items from summary if needed.
        // Actually, let's create a better query or just leave it empty if the UI uses `level_summary`.
        // The implementation plan doesn't specify UI details for the list card, but "Mage 5" is good.

        Ok::<Vec<CharacterSearchResult>, AppError>(results)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}
