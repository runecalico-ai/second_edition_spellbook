use crate::db::Pool;
use crate::error::AppError;
use crate::models::{SpellArtifact, SpellCreate, SpellDetail, SpellSummary, SpellUpdate};
use chrono::Utc;
use rusqlite::params;
use rusqlite::{Connection, OptionalExtension};
use std::sync::Arc;
use tauri::State;

fn validate_spell_fields(name: &str, level: i64, description: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("Spell name cannot be empty".into()));
    }
    if !(0..=12).contains(&level) {
        return Err(AppError::Validation(
            "Spell level must be between 0 and 12".into(),
        ));
    }
    if description.trim().is_empty() {
        return Err(AppError::Validation(
            "Spell description cannot be empty".into(),
        ));
    }
    Ok(())
}

fn validate_epic_and_quest_spells(
    level: i64,
    class_list: &Option<String>,
    is_quest_spell: bool,
    is_cantrip: bool,
) -> Result<(), AppError> {
    if is_cantrip && level != 0 {
        return Err(AppError::Validation("Cantrips must be level 0".into()));
    }
    if level > 9 {
        if is_quest_spell {
            return Err(AppError::Validation(
                "Spells above 9th level cannot be Quest Spells".into(),
            ));
        }
        if let Some(classes) = class_list {
            let classes_lower = classes.to_lowercase();
            if !classes_lower.contains("wizard") && !classes_lower.contains("mage") {
                return Err(AppError::Validation(
                    "Spells above 9th level are restricted to Arcane casters (Wizard/Mage)".into(),
                ));
            }
        }
    }
    if is_quest_spell {
        if level != 8 {
            return Err(AppError::Validation(
                "Quest spells must be level 8 (Quest level)".into(),
            ));
        }
        if let Some(classes) = class_list {
            let classes_lower = classes.to_lowercase();
            let divine_classes = ["priest", "cleric", "druid", "paladin", "ranger"];
            if !divine_classes.iter().any(|&c| classes_lower.contains(c)) {
                return Err(AppError::Validation(
                    "Quest spells are restricted to Divine casters (Priest/Cleric/Druid/Paladin/Ranger)".into(),
                ));
            }
        }
    }
    Ok(())
}

pub fn get_spell_from_conn(conn: &Connection, id: i64) -> Result<Option<SpellDetail>, AppError> {
    let mut spell: SpellDetail = conn
        .query_row(
            "SELECT id, name, school, sphere, class_list, level, range, components,
                material_components, casting_time, duration, area, saving_throw, reversible,
                description, tags, source, edition, author, license, is_quest_spell, is_cantrip
         FROM spell WHERE id = ?",
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
                    is_quest_spell: row.get(20)?,
                    is_cantrip: row.get(21)?,
                    artifacts: None,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound("Spell not found".into()))?;

    let mut stmt = conn.prepare(
        "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
    )?;
    let artifact_rows = stmt.query_map([id], |row| {
        Ok(SpellArtifact {
            id: row.get(0)?,
            spell_id: row.get(1)?,
            r#type: row.get(2)?,
            path: row.get(3)?,
            hash: row.get(4)?,
            imported_at: row.get(5)?,
        })
    })?;

    let mut artifacts = vec![];
    for artifact in artifact_rows {
        artifacts.push(artifact?);
    }
    spell.artifacts = Some(artifacts);

    Ok(Some(spell))
}

fn diff_spells(old: &SpellDetail, new: &SpellUpdate) -> Vec<(String, String, String)> {
    let mut changes = vec![];

    if old.name != new.name {
        changes.push(("name".into(), old.name.clone(), new.name.clone()));
    }
    if old.school != new.school {
        changes.push((
            "school".into(),
            old.school.clone().unwrap_or_default(),
            new.school.clone().unwrap_or_default(),
        ));
    }
    if old.sphere != new.sphere {
        changes.push((
            "sphere".into(),
            old.sphere.clone().unwrap_or_default(),
            new.sphere.clone().unwrap_or_default(),
        ));
    }
    if old.class_list != new.class_list {
        changes.push((
            "class_list".into(),
            old.class_list.clone().unwrap_or_default(),
            new.class_list.clone().unwrap_or_default(),
        ));
    }
    if old.level != new.level {
        changes.push(("level".into(), old.level.to_string(), new.level.to_string()));
    }
    if old.range != new.range {
        changes.push((
            "range".into(),
            old.range.clone().unwrap_or_default(),
            new.range.clone().unwrap_or_default(),
        ));
    }
    if old.components != new.components {
        changes.push((
            "components".into(),
            old.components.clone().unwrap_or_default(),
            new.components.clone().unwrap_or_default(),
        ));
    }
    if old.material_components != new.material_components {
        changes.push((
            "material_components".into(),
            old.material_components.clone().unwrap_or_default(),
            new.material_components.clone().unwrap_or_default(),
        ));
    }
    if old.casting_time != new.casting_time {
        changes.push((
            "casting_time".into(),
            old.casting_time.clone().unwrap_or_default(),
            new.casting_time.clone().unwrap_or_default(),
        ));
    }
    if old.duration != new.duration {
        changes.push((
            "duration".into(),
            old.duration.clone().unwrap_or_default(),
            new.duration.clone().unwrap_or_default(),
        ));
    }
    if old.area != new.area {
        changes.push((
            "area".into(),
            old.area.clone().unwrap_or_default(),
            new.area.clone().unwrap_or_default(),
        ));
    }
    if old.saving_throw != new.saving_throw {
        changes.push((
            "saving_throw".into(),
            old.saving_throw.clone().unwrap_or_default(),
            new.saving_throw.clone().unwrap_or_default(),
        ));
    }
    match (old.reversible, new.reversible) {
        (Some(o), Some(n)) if o != n => {
            changes.push(("reversible".into(), o.to_string(), n.to_string()));
        }
        (Some(o), None) => {
            changes.push(("reversible".into(), o.to_string(), "0".to_string()));
        }
        (None, Some(n)) if n != 0 => {
            changes.push(("reversible".into(), "0".to_string(), n.to_string()));
        }
        _ => {}
    }
    if old.description != new.description {
        changes.push((
            "description".into(),
            old.description.clone(),
            new.description.clone(),
        ));
    }
    if old.tags != new.tags {
        changes.push((
            "tags".into(),
            old.tags.clone().unwrap_or_default(),
            new.tags.clone().unwrap_or_default(),
        ));
    }
    if old.source != new.source {
        changes.push((
            "source".into(),
            old.source.clone().unwrap_or_default(),
            new.source.clone().unwrap_or_default(),
        ));
    }
    if old.edition != new.edition {
        changes.push((
            "edition".into(),
            old.edition.clone().unwrap_or_default(),
            new.edition.clone().unwrap_or_default(),
        ));
    }
    if old.author != new.author {
        changes.push((
            "author".into(),
            old.author.clone().unwrap_or_default(),
            new.author.clone().unwrap_or_default(),
        ));
    }
    if old.license != new.license {
        changes.push((
            "license".into(),
            old.license.clone().unwrap_or_default(),
            new.license.clone().unwrap_or_default(),
        ));
    }
    if old.is_cantrip != new.is_cantrip {
        changes.push((
            "is_cantrip".into(),
            old.is_cantrip.to_string(),
            new.is_cantrip.to_string(),
        ));
    }

    changes
}

fn log_changes(
    conn: &Connection,
    spell_id: i64,
    changes: Vec<(String, String, String)>,
) -> Result<(), AppError> {
    for (field, old_val, new_val) in changes {
        conn.execute(
            "INSERT INTO change_log (spell_id, field, old_value, new_value) VALUES (?, ?, ?, ?)",
            params![spell_id, field, old_val, new_val],
        )?;
    }
    Ok(())
}

pub fn apply_spell_update_with_conn(
    conn: &Connection,
    spell: &SpellUpdate,
) -> Result<i64, AppError> {
    validate_spell_fields(&spell.name, spell.level, &spell.description)?;
    validate_epic_and_quest_spells(
        spell.level,
        &spell.class_list,
        spell.is_quest_spell != 0,
        spell.is_cantrip != 0,
    )?;

    if let Some(old_spell) = get_spell_from_conn(conn, spell.id)? {
        let changes = diff_spells(&old_spell, spell);
        log_changes(conn, spell.id, changes)?;
    }

    conn.execute(
        "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?,
         components=?, material_components=?, casting_time=?, duration=?, area=?,
         saving_throw=?, reversible=?, description=?, tags=?, source=?, edition=?,
         author=?, license=?, is_quest_spell=?, is_cantrip=?, updated_at=? WHERE id=?",
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
            spell.is_quest_spell,
            spell.is_cantrip,
            Utc::now().to_rfc3339(),
            spell.id,
        ],
    )?;

    Ok(spell.id)
}

#[tauri::command]
pub async fn get_spell(
    state: State<'_, Arc<Pool>>,
    id: i64,
) -> Result<Option<SpellDetail>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        get_spell_from_conn(&conn, id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn list_spells(state: State<'_, Arc<Pool>>) -> Result<Vec<SpellSummary>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, school, sphere, level, class_list, components, duration, source, is_quest_spell, is_cantrip
             FROM spell ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SpellSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                school: row.get(2)?,
                sphere: row.get(3)?,
                level: row.get(4)?,
                class_list: row.get(5)?,
                components: row.get(6)?,
                duration: row.get(7)?,
                source: row.get(8)?,
                is_quest_spell: row.get(9)?,
                is_cantrip: row.get(10)?,
            })
        })?;

        let mut spells = vec![];
        for spell in rows {
            spells.push(spell?);
        }
        Ok::<Vec<SpellSummary>, AppError>(spells)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn create_spell(
    state: State<'_, Arc<Pool>>,
    spell: SpellCreate,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        validate_spell_fields(&spell.name, spell.level, &spell.description)?;
        validate_epic_and_quest_spells(
            spell.level,
            &spell.class_list,
            spell.is_quest_spell != 0,
            spell.is_cantrip != 0,
        )?;

        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
             material_components, casting_time, duration, area, saving_throw, reversible,
             description, tags, source, edition, author, license, is_quest_spell, is_cantrip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                spell.is_quest_spell,
                spell.is_cantrip,
            ],
        )?;
        Ok::<i64, AppError>(conn.last_insert_rowid())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn update_spell(
    state: State<'_, Arc<Pool>>,
    spell: SpellUpdate,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        apply_spell_update_with_conn(&conn, &spell)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn delete_spell(state: State<'_, Arc<Pool>>, id: i64) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM spell WHERE id = ?", [id])?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn upsert_spell(
    state: State<'_, Arc<Pool>>,
    spell: SpellDetail,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        validate_spell_fields(&spell.name, spell.level, &spell.description)?;
        validate_epic_and_quest_spells(
            spell.level,
            &spell.class_list,
            spell.is_quest_spell != 0,
            spell.is_cantrip != 0,
        )?;

        let conn = pool.get()?;

        if let Some(id) = spell.id {
            conn.execute(
                "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?,
                 components=?, material_components=?, casting_time=?, duration=?, area=?,
                 saving_throw=?, reversible=?, description=?, tags=?, source=?, edition=?,
                 author=?, license=?, is_quest_spell=?, is_cantrip=?, updated_at=? WHERE id=?",
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
                    spell.is_quest_spell,
                    spell.is_cantrip,
                    Utc::now().to_rfc3339(),
                    id,
                ],
            )?;
            Ok::<i64, AppError>(id)
        } else {
            conn.execute(
                "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                 material_components, casting_time, duration, area, saving_throw, reversible,
                 description, tags, source, edition, author, license, is_quest_spell, is_cantrip)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                    spell.is_quest_spell,
                    spell.is_cantrip,
                ],
            )?;
            Ok::<i64, AppError>(conn.last_insert_rowid())
        }
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}
