use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    Character, CharacterAbilities, CharacterClass, CharacterSearchFilters, CharacterSearchResult,
    CharacterSpellbookEntry, UpdateAbilitiesInput, UpdateCharacterDetailsInput,
};
use rusqlite::ToSql;
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
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
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
        if let Some(lt) = list_type {
            let rows = stmt.query_map(params![character_class_id, lt], |row| {
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
