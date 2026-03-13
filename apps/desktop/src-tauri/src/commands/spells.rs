use crate::commands::vault::export_spell_to_vault_by_hash;
use crate::db::Pool;
use crate::error::AppError;
use crate::models::canonical_spell::CanonicalSpell;
use crate::models::{
    MaterialComponentSpec, SpellArtifact, SpellComponents, SpellCreate, SpellDetail, SpellSummary,
    SpellUpdate,
};
use crate::utils::migration_manager;
use crate::utils::spell_parser::SpellParser;
use chrono::Utc;
use rusqlite::params;
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
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
                description, tags, source, edition, author, license, is_quest_spell, is_cantrip,
                damage, magic_resistance, schema_version, canonical_data, content_hash
         FROM spell WHERE id = ?",
            [id],
            |row| {
                let canonical_data_str: Option<String> = row.get(25)?;

                // Try to parse canonical_data to populate structured specs
                let mut range_spec = None;
                let mut components_spec = None;
                let mut material_components_spec = None;
                let mut casting_time_spec = None;
                let mut duration_spec = None;
                let mut area_spec = None;
                let mut saving_throw_spec = None;
                let mut damage_spec = None;
                let mut magic_resistance_spec = None;

                if let Some(json_str) = &canonical_data_str {
                    if let Ok(canon) = serde_json::from_str::<CanonicalSpell>(json_str) {
                        range_spec = canon.range;
                        components_spec = canon.components;
                        material_components_spec = canon.material_components;
                        casting_time_spec = canon.casting_time;
                        duration_spec = canon.duration;
                        area_spec = canon.area;
                        saving_throw_spec = canon.saving_throw;
                        damage_spec = canon.damage;
                        magic_resistance_spec = canon.magic_resistance;
                    }
                }

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
                    damage: row.get(22)?,
                    magic_resistance: row.get(23)?,
                    schema_version: row.get(24)?,
                    artifacts: None,
                    canonical_data: canonical_data_str,
                    content_hash: row.get(26)?,
                    range_spec,
                    components_spec,
                    material_components_spec,
                    casting_time_spec,
                    duration_spec,
                    area_spec,
                    saving_throw_spec,
                    damage_spec,
                    magic_resistance_spec,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound("Spell not found".into()))?;

    // Hash-first: load artifacts by spell content hash; fallback to spell_id only when
    // spell_content_hash IS NULL (migration-period legacy). Exclude rows whose spell_id
    // matches but spell_content_hash belongs to a different spell.
    // artifact.hash = file hash (we return it); spell_content_hash = spell ref (we filter by it).
    // When spell_id is dropped: keep only spell_content_hash = ? branch; remove legacy OR and (sid, None) arm.
    let artifact_has_hash_column = table_has_column(conn, "artifact", "spell_content_hash");
    let artifacts: Vec<SpellArtifact> = match (spell.id, spell.content_hash.as_deref()) {
        (Some(sid), Some(h)) => {
            if artifact_has_hash_column {
                let mut stmt = conn.prepare(
                    "SELECT id, spell_id, type, path, hash, imported_at FROM artifact
                     WHERE (spell_content_hash IS NOT NULL AND spell_content_hash = ?)
                        OR (spell_content_hash IS NULL AND spell_id = ?)",
                )?;
                let rows = stmt.query_map(rusqlite::params![h, sid], |row| {
                    let spell_id: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(sid);
                    Ok(SpellArtifact {
                        id: row.get(0)?,
                        spell_id,
                        r#type: row.get(2)?,
                        path: row.get(3)?,
                        hash: row.get(4)?,
                        imported_at: row.get(5)?,
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            } else {
                let mut stmt = conn.prepare(
                    "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
                )?;
                let rows = stmt.query_map([sid], |row| {
                    Ok(SpellArtifact {
                        id: row.get(0)?,
                        spell_id: row.get::<_, Option<i64>>(1)?.unwrap_or(sid),
                        r#type: row.get(2)?,
                        path: row.get(3)?,
                        hash: row.get(4)?,
                        imported_at: row.get(5)?,
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            }
        }
        (Some(sid), None) => {
            let mut stmt = conn.prepare(
                "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
            )?;
            let rows = stmt.query_map([sid], |row| {
                Ok(SpellArtifact {
                    id: row.get(0)?,
                    spell_id: row.get(1)?,
                    r#type: row.get(2)?,
                    path: row.get(3)?,
                    hash: row.get(4)?,
                    imported_at: row.get(5)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        }
        (None, _) => vec![],
    };

    spell.artifacts = Some(artifacts);

    Ok(Some(spell))
}

pub(crate) fn diff_spells(old: &SpellDetail, new: &SpellUpdate) -> Vec<(String, String, String)> {
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
    if old.damage != new.damage {
        changes.push((
            "damage".into(),
            old.damage.clone().unwrap_or_default(),
            new.damage.clone().unwrap_or_default(),
        ));
    }
    if old.magic_resistance != new.magic_resistance {
        changes.push((
            "magic_resistance".into(),
            old.magic_resistance.clone().unwrap_or_default(),
            new.magic_resistance.clone().unwrap_or_default(),
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

fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => return false,
    };
    stmt.query_row([column], |_| Ok(())).is_ok()
}

fn cascade_spell_content_hash_refs(
    conn: &Connection,
    old_hash: Option<&str>,
    new_hash: &str,
) -> Result<(), AppError> {
    let Some(old_hash) = old_hash else {
        return Ok(());
    };
    if old_hash == new_hash {
        return Ok(());
    }

    if table_has_column(conn, "character_class_spell", "spell_content_hash") {
        conn.execute(
            "UPDATE character_class_spell SET spell_content_hash = ? WHERE spell_content_hash = ?",
            params![new_hash, old_hash],
        )?;
    }
    if table_has_column(conn, "artifact", "spell_content_hash") {
        conn.execute(
            "UPDATE artifact SET spell_content_hash = ? WHERE spell_content_hash = ?",
            params![new_hash, old_hash],
        )?;
    }
    Ok(())
}

fn spell_detail_to_update(spell: &SpellDetail, id: i64) -> SpellUpdate {
    SpellUpdate {
        id,
        name: spell.name.clone(),
        school: spell.school.clone(),
        sphere: spell.sphere.clone(),
        class_list: spell.class_list.clone(),
        level: spell.level,
        range: spell.range.clone(),
        components: spell.components.clone(),
        material_components: spell.material_components.clone(),
        casting_time: spell.casting_time.clone(),
        duration: spell.duration.clone(),
        area: spell.area.clone(),
        saving_throw: spell.saving_throw.clone(),
        damage: spell.damage.clone(),
        magic_resistance: spell.magic_resistance.clone(),
        reversible: spell.reversible,
        description: spell.description.clone(),
        tags: spell.tags.clone(),
        source: spell.source.clone(),
        edition: spell.edition.clone(),
        author: spell.author.clone(),
        license: spell.license.clone(),
        is_quest_spell: spell.is_quest_spell,
        is_cantrip: spell.is_cantrip,
        range_spec: spell.range_spec.clone(),
        components_spec: spell.components_spec.clone(),
        material_components_spec: spell.material_components_spec.clone(),
        casting_time_spec: spell.casting_time_spec.clone(),
        duration_spec: spell.duration_spec.clone(),
        area_spec: spell.area_spec.clone(),
        saving_throw_spec: spell.saving_throw_spec.clone(),
        damage_spec: spell.damage_spec.clone(),
        magic_resistance_spec: spell.magic_resistance_spec.clone(),
    }
}

fn rollback_savepoint(conn: &Connection, savepoint_name: &str) {
    let _ = conn.execute_batch(&format!(
        "ROLLBACK TO SAVEPOINT {savepoint_name};
         RELEASE SAVEPOINT {savepoint_name};"
    ));
}

fn run_in_savepoint<T, F>(
    conn: &Connection,
    savepoint_name: &str,
    operation: F,
) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError>,
{
    conn.execute_batch(&format!("SAVEPOINT {savepoint_name};"))?;
    match operation() {
        Ok(value) => {
            conn.execute_batch(&format!("RELEASE SAVEPOINT {savepoint_name};"))?;
            Ok(value)
        }
        Err(err) => {
            rollback_savepoint(conn, savepoint_name);
            Err(err)
        }
    }
}

pub fn canonicalize_spell_detail(
    detail: SpellDetail,
) -> Result<(CanonicalSpell, String, String), AppError> {
    let mut canonical = CanonicalSpell::try_from(detail).map_err(AppError::Validation)?;

    // Normalize BEFORE hashing/serializing to ensure the stored data is clean
    let res = canonical.normalize(None);
    if res.notes_truncated {
        return Err(AppError::Validation(
            "Saving throw notes truncated during migration (exceeded 2048 characters)".into(),
        ));
    }

    let hash = canonical
        .compute_hash()
        .map_err(|e| AppError::Validation(format!("Hash error: {}", e)))?;

    // Store FULL JSON (with metadata) but normalized
    // Fix: Set id to hash so it's included in the canonical_data JSON in the DB
    canonical.id = Some(hash.clone());

    let json = serde_json::to_string(&canonical)
        .map_err(|e| AppError::Validation(format!("JSON error: {}", e)))?;

    Ok((canonical, hash, json))
}

pub(crate) fn log_changes(
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
    run_in_savepoint(conn, "spell_update_write", || {
        validate_spell_fields(&spell.name, spell.level, &spell.description)?;
        validate_epic_and_quest_spells(
            spell.level,
            &spell.class_list,
            spell.is_quest_spell != 0,
            spell.is_cantrip != 0,
        )?;

        let old_hash = if let Some(old_spell) = get_spell_from_conn(conn, spell.id)? {
            let changes = diff_spells(&old_spell, spell);
            log_changes(conn, spell.id, changes)?;
            old_spell.content_hash
        } else {
            None
        };

        let detail = SpellDetail {
            id: Some(spell.id),
            name: spell.name.clone(),
            school: spell.school.clone(),
            sphere: spell.sphere.clone(),
            class_list: spell.class_list.clone(),
            level: spell.level,
            range: spell.range.clone(),
            components: spell.components.clone(),
            material_components: spell.material_components.clone(),
            casting_time: spell.casting_time.clone(),
            duration: spell.duration.clone(),
            area: spell.area.clone(),
            saving_throw: spell.saving_throw.clone(),
            damage: spell.damage.clone(),
            magic_resistance: spell.magic_resistance.clone(),
            reversible: spell.reversible,
            description: spell.description.clone(),
            tags: spell.tags.clone(),
            source: spell.source.clone(),
            edition: spell.edition.clone(),
            author: spell.author.clone(),
            license: spell.license.clone(),
            is_quest_spell: spell.is_quest_spell,
            is_cantrip: spell.is_cantrip,
            schema_version: None, // Will be populated/upgraded by canonicalize_spell_detail
            artifacts: None,
            canonical_data: None,
            content_hash: None,
            range_spec: spell.range_spec.clone(),
            components_spec: spell.components_spec.clone(),
            material_components_spec: spell.material_components_spec.clone(),
            casting_time_spec: spell.casting_time_spec.clone(),
            duration_spec: spell.duration_spec.clone(),
            area_spec: spell.area_spec.clone(),
            saving_throw_spec: spell.saving_throw_spec.clone(),
            damage_spec: spell.damage_spec.clone(),
            magic_resistance_spec: spell.magic_resistance_spec.clone(),
        };
        let (canonical, hash, json) = canonicalize_spell_detail(detail)?;

        conn.execute(
            "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?,
             components=?, material_components=?, casting_time=?, duration=?, area=?,
             saving_throw=?, damage=?, magic_resistance=?, reversible=?, description=?,
             tags=?, source=?, edition=?, author=?, license=?, is_quest_spell=?,
             is_cantrip=?, updated_at=?, canonical_data=?, content_hash=?,
             schema_version=? WHERE id=?",
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
                spell.damage,
                spell.magic_resistance,
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
                json,
                hash,
                canonical.schema_version,
                spell.id,
            ],
        )?;
        cascade_spell_content_hash_refs(conn, old_hash.as_deref(), &hash)?;

        migration_manager::sync_check_spell(conn, spell.id);
        export_spell_to_vault_by_hash(conn, &hash)?;
        Ok(spell.id)
    })
}

/// Recursively convert object keys from snake_case to camelCase for IPC.
fn value_keys_to_camel_case(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let keys: Vec<String> = map.keys().cloned().collect();
            for k in keys {
                let v = map.remove(&k).unwrap();
                let mut new_v = v;
                value_keys_to_camel_case(&mut new_v);
                let new_key = snake_to_camel(&k);
                map.insert(new_key, new_v);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                value_keys_to_camel_case(item);
            }
        }
        _ => {}
    }
}

fn snake_to_camel(s: &str) -> String {
    let mut out = String::new();
    let mut cap_next = false;
    for c in s.chars() {
        if c == '_' {
            cap_next = true;
        } else if cap_next {
            out.extend(c.to_uppercase());
            cap_next = false;
        } else {
            out.push(c);
        }
    }
    out
}

fn parsed_to_camel_value<T: serde::Serialize>(t: &T) -> Result<Value, AppError> {
    let mut v = serde_json::to_value(t).map_err(|e| AppError::Unknown(e.to_string()))?;
    value_keys_to_camel_case(&mut v);
    Ok(v)
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
pub async fn parse_spell_range(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_range(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub async fn parse_spell_duration(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_duration(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub async fn parse_spell_casting_time(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_casting_time(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub async fn parse_spell_area(legacy: String) -> Result<Option<Value>, AppError> {
    let parser = SpellParser::new();
    let opt = parser.parse_area(&legacy);
    match opt {
        Some(spec) => Ok(Some(parsed_to_camel_value(&spec)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn parse_spell_damage(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_damage(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub fn parse_spell_components(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_components(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub fn extract_materials_from_components_line(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.extract_materials_from_components_line(&legacy);
    parsed_to_camel_value(&spec)
}

#[tauri::command]
pub async fn parse_spell_material_components(legacy: String) -> Result<Value, AppError> {
    let parser = SpellParser::new();
    let spec = parser.parse_material_components(&legacy);
    parsed_to_camel_value(&spec)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellComponentsWithMigration {
    pub components: SpellComponents,
    pub materials: Vec<MaterialComponentSpec>,
}

#[tauri::command]
pub fn parse_spell_components_with_migration(
    legacy_components: String,
    legacy_materials: Option<String>,
) -> Result<Value, AppError> {
    let parser = SpellParser::new();

    let components = parser.parse_components(&legacy_components);

    let materials = if let Some(mat_text) = legacy_materials.filter(|s| !s.trim().is_empty()) {
        parser.parse_material_components(&mat_text)
    } else {
        parser.extract_materials_from_components_line(&legacy_components)
    };
    let result = SpellComponentsWithMigration {
        components,
        materials,
    };
    parsed_to_camel_value(&result)
}

#[tauri::command]
pub async fn list_spells(state: State<'_, Arc<Pool>>) -> Result<Vec<SpellSummary>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, school, sphere, level, class_list, components, duration, source, is_quest_spell, is_cantrip, tags
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
                tags: row.get(11)?,
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

        let detail = SpellDetail {
            id: None,
            name: spell.name.clone(),
            school: spell.school.clone(),
            sphere: spell.sphere.clone(),
            class_list: spell.class_list.clone(),
            level: spell.level,
            range: spell.range.clone(),
            components: spell.components.clone(),
            material_components: spell.material_components.clone(),
            casting_time: spell.casting_time.clone(),
            duration: spell.duration.clone(),
            area: spell.area.clone(),
            saving_throw: spell.saving_throw.clone(),
            damage: spell.damage.clone(),
            magic_resistance: spell.magic_resistance.clone(),
            reversible: spell.reversible,
            description: spell.description.clone(),
            tags: spell.tags.clone(),
            source: spell.source.clone(),
            edition: spell.edition.clone(),
            author: spell.author.clone(),
            license: spell.license.clone(),
            is_quest_spell: spell.is_quest_spell,
            is_cantrip: spell.is_cantrip,
            schema_version: None,
            artifacts: None,
            canonical_data: None,
            content_hash: None,
            range_spec: spell.range_spec.clone(),
            components_spec: spell.components_spec.clone(),
            material_components_spec: spell.material_components_spec.clone(),
            casting_time_spec: spell.casting_time_spec.clone(),
            duration_spec: spell.duration_spec.clone(),
            area_spec: spell.area_spec.clone(),
            saving_throw_spec: spell.saving_throw_spec.clone(),
            damage_spec: spell.damage_spec.clone(),
            magic_resistance_spec: spell.magic_resistance_spec.clone(),
        };
        let (canonical, hash, json) = canonicalize_spell_detail(detail)?;

        let conn = pool.get()?;
        run_in_savepoint(&conn, "spell_create_write", || {
            conn.execute(
                "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                 material_components, casting_time, duration, area, saving_throw, damage,
                 magic_resistance, reversible, description, tags, source, edition, author,
                 license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                 schema_version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                    spell.damage,
                    spell.magic_resistance,
                    spell.reversible.unwrap_or(0),
                    spell.description,
                    spell.tags,
                    spell.source,
                    spell.edition,
                    spell.author,
                    spell.license,
                    spell.is_quest_spell,
                    spell.is_cantrip,
                    json,
                    hash,
                    canonical.schema_version,
                ],
            )?;
            let spell_id = conn.last_insert_rowid();
            export_spell_to_vault_by_hash(&conn, &hash)?;
            Ok::<i64, AppError>(spell_id)
        })
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

        let (canonical, hash, json) = canonicalize_spell_detail(spell.clone())?;

        let spell_id = if let Some(id) = spell.id {
            let update = spell_detail_to_update(&spell, id);
            apply_spell_update_with_conn(&conn, &update)?;
            id
        } else {
            run_in_savepoint(&conn, "spell_upsert_insert_write", || {
                conn.execute(
                    "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                     material_components, casting_time, duration, area, saving_throw, damage,
                     magic_resistance, reversible, description, tags, source, edition, author,
                     license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                     schema_version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                        spell.damage,
                        spell.magic_resistance,
                        spell.reversible.unwrap_or(0),
                        spell.description,
                        spell.tags,
                        spell.source,
                        spell.edition,
                        spell.author,
                        spell.license,
                        spell.is_quest_spell,
                        spell.is_cantrip,
                        json,
                        hash,
                        canonical.schema_version,
                    ],
                )?;
                let id = conn.last_insert_rowid();
                export_spell_to_vault_by_hash(&conn, &hash)?;
                Ok::<i64, AppError>(id)
            })?
        };
        migration_manager::sync_check_spell(&conn, spell_id);
        Ok::<i64, AppError>(spell_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::vault::VaultTestEnvGuard;
    use rusqlite::Connection;

    #[test]
    fn test_get_spell_from_conn_loads_artifact_by_content_hash_when_hash_set() {
        let conn = setup_get_spell_artifact_test_db();
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash) VALUES (NULL, 'source', 'a.md', 'ah', '2026-01-01T00:00:00Z', 'spell-hash-1')",
            [],
        )
        .expect("insert artifact keyed by hash only");
        let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
        let artifacts = detail.artifacts.expect("artifacts loaded");
        assert_eq!(artifacts.len(), 1, "artifact with spell_content_hash=spell hash must be loaded");
        assert_eq!(artifacts[0].path, "a.md");
    }

    #[test]
    fn test_get_spell_from_conn_excludes_artifact_when_spell_id_matches_but_hash_different() {
        let conn = setup_get_spell_artifact_test_db();
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash) VALUES (1, 'source', 'wrong.md', 'ah', '2026-01-01T00:00:00Z', 'other-spell-hash')",
            [],
        )
        .expect("insert artifact with stale spell_id but different spell_content_hash");
        let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
        let artifacts = detail.artifacts.unwrap_or_default();
        assert!(artifacts.is_empty(), "artifact whose spell_content_hash belongs to another spell must not leak into this spell");
    }

    #[test]
    fn test_get_spell_from_conn_legacy_fallback_loads_artifact_when_hash_null() {
        let conn = setup_get_spell_artifact_test_db();
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash) VALUES (1, 'source', 'legacy.md', 'ah', '2026-01-01T00:00:00Z', NULL)",
            [],
        )
        .expect("insert legacy artifact with spell_id only");
        let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
        let artifacts = detail.artifacts.expect("artifacts loaded");
        assert_eq!(artifacts.len(), 1, "legacy artifact with spell_content_hash NULL but spell_id match must be loaded");
        assert_eq!(artifacts[0].path, "legacy.md");
    }

    #[test]
    fn test_get_spell_from_conn_legacy_artifact_schema_without_hash_column() {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER NOT NULL DEFAULT 0,
                is_cantrip INTEGER NOT NULL DEFAULT 0,
                damage TEXT,
                magic_resistance TEXT,
                schema_version INTEGER,
                updated_at TEXT,
                canonical_data TEXT,
                content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL
            );
            "#,
        )
        .expect("create legacy spell+artifact test schema");
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (1, 'source', 'legacy-schema.md', 'ah', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("insert legacy artifact row");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (1, 'errata', 'legacy-schema-2.md', 'bh', '2026-01-01T00:00:01Z')",
            [],
        )
        .expect("insert second legacy artifact row");

        let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
        let artifacts = detail.artifacts.expect("artifacts loaded");
        assert_eq!(artifacts.len(), 2, "legacy artifact schema should still load all matching rows by spell_id fallback");
        assert_eq!(artifacts[0].path, "legacy-schema.md");
        assert_eq!(artifacts[1].path, "legacy-schema-2.md");
    }

    #[test]
    fn test_validate_cantrip_level() {
        // Cantrip must be level 0
        assert!(validate_epic_and_quest_spells(0, &None, false, true).is_ok());
        assert!(validate_epic_and_quest_spells(1, &None, false, true).is_err());
    }

    #[test]
    fn test_validate_quest_spell_restrictions() {
        // Quest spells must be level 8 (Quest level in this app)
        assert!(validate_epic_and_quest_spells(8, &Some("Priest".into()), true, false).is_ok());
        assert!(validate_epic_and_quest_spells(10, &Some("Priest".into()), true, false).is_err());
        assert!(validate_epic_and_quest_spells(1, &Some("Priest".into()), true, false).is_err());

        // Quest spells must be for Divine classes
        assert!(validate_epic_and_quest_spells(8, &Some("Priest".into()), true, false).is_ok());
        assert!(validate_epic_and_quest_spells(8, &Some("Cleric".into()), true, false).is_ok());
        assert!(validate_epic_and_quest_spells(8, &Some("Druid".into()), true, false).is_ok());
        assert!(validate_epic_and_quest_spells(8, &Some("Paladin".into()), true, false).is_ok());
        assert!(validate_epic_and_quest_spells(8, &Some("Ranger".into()), true, false).is_ok());

        // Not a divine class
        assert!(validate_epic_and_quest_spells(8, &Some("Wizard".into()), true, false).is_err());
        assert!(validate_epic_and_quest_spells(8, &Some("Fighter".into()), true, false).is_err());
    }

    #[test]
    fn test_validate_epic_spell_restrictions() {
        // Spells > 9 must be for Arcane classes (Wizard/Mage)
        assert!(validate_epic_and_quest_spells(10, &Some("Wizard".into()), false, false).is_ok());
        assert!(validate_epic_and_quest_spells(10, &Some("Mage".into()), false, false).is_ok());
        assert!(validate_epic_and_quest_spells(10, &Some("Priest".into()), false, false).is_err());
    }

    /// Minimal schema for get_spell_from_conn artifact read-path tests (spell + artifact only).
    fn setup_get_spell_artifact_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER NOT NULL DEFAULT 0,
                is_cantrip INTEGER NOT NULL DEFAULT 0,
                damage TEXT,
                magic_resistance TEXT,
                schema_version INTEGER,
                updated_at TEXT,
                canonical_data TEXT,
                content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                spell_content_hash TEXT
            );
            "#,
        )
        .expect("create spell+artifact test schema");
        conn
    }

    fn setup_spell_update_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER NOT NULL DEFAULT 0,
                is_cantrip INTEGER NOT NULL DEFAULT 0,
                damage TEXT,
                magic_resistance TEXT,
                schema_version INTEGER,
                updated_at TEXT,
                canonical_data TEXT,
                content_hash TEXT
            );
            CREATE TABLE change_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER NOT NULL,
                field TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                spell_content_hash TEXT
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER NOT NULL,
                character_class_id INTEGER NOT NULL,
                spell_content_hash TEXT
            );
            "#,
        )
        .expect("create spell test schema");
        conn
    }

    #[test]
    fn test_apply_spell_update_with_conn_persists_vault_file() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_spell_update_test_db();
        let initial_detail = SpellDetail {
            id: Some(1),
            name: "Vaulted Spell".to_string(),
            level: 3,
            description: "Original description".to_string(),
            school: Some("Abjuration".to_string()),
            ..Default::default()
        };
        let (canonical, hash, json) =
            canonicalize_spell_detail(initial_detail.clone()).expect("canonicalize initial spell");
        conn.execute(
            "INSERT INTO spell (
                id, name, school, sphere, class_list, level, range, components, material_components,
                casting_time, duration, area, saving_throw, reversible, description, tags, source,
                edition, author, license, is_quest_spell, is_cantrip, damage, magic_resistance,
                schema_version, canonical_data, content_hash
             ) VALUES (
                1, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, NULL, NULL,
                NULL, NULL, NULL, 0, 0, NULL, NULL, ?, ?, ?
             )",
            rusqlite::params![
                initial_detail.name,
                initial_detail.school,
                initial_detail.level,
                initial_detail.description,
                canonical.schema_version,
                json,
                hash,
            ],
        )
        .expect("seed spell row");

        let update = SpellUpdate {
            id: 1,
            name: "Vaulted Spell".to_string(),
            level: 3,
            description: "Updated description".to_string(),
            school: Some("Abjuration".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
            ..Default::default()
        };

        apply_spell_update_with_conn(&conn, &update).expect("update spell");

        let updated_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query updated hash");
        let vault_file = temp_dir
            .path()
            .join("spells")
            .join(format!("{updated_hash}.json"));
        assert!(
            vault_file.exists(),
            "spell update should materialize the corresponding vault file"
        );
    }

    #[test]
    fn test_apply_spell_update_with_conn_cascades_hash_references() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_spell_update_test_db();
        let initial_detail = SpellDetail {
            id: Some(1),
            name: "Cascade Spell".to_string(),
            level: 3,
            description: "Original description".to_string(),
            school: Some("Abjuration".to_string()),
            ..Default::default()
        };
        let (canonical, old_hash, json) =
            canonicalize_spell_detail(initial_detail.clone()).expect("canonicalize initial spell");
        conn.execute(
            "INSERT INTO spell (
                id, name, school, sphere, class_list, level, range, components, material_components,
                casting_time, duration, area, saving_throw, reversible, description, tags, source,
                edition, author, license, is_quest_spell, is_cantrip, damage, magic_resistance,
                schema_version, canonical_data, content_hash
             ) VALUES (
                1, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, NULL, NULL,
                NULL, NULL, NULL, 0, 0, NULL, NULL, ?, ?, ?
             )",
            rusqlite::params![
                initial_detail.name,
                initial_detail.school,
                initial_detail.level,
                initial_detail.description,
                canonical.schema_version,
                json,
                old_hash,
            ],
        )
        .expect("seed spell row");
        conn.execute(
            "INSERT INTO character_class_spell (spell_id, character_class_id, spell_content_hash)
             VALUES (1, 7, ?1)",
            [old_hash.as_str()],
        )
        .expect("seed character class reference");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 'source', 'spells/cascade.md', 'artifact-hash', '2026-03-08T00:00:00Z', ?1)",
            [old_hash.as_str()],
        )
        .expect("seed artifact reference");

        let update = SpellUpdate {
            id: 1,
            name: "Cascade Spell".to_string(),
            level: 3,
            description: "Updated description".to_string(),
            school: Some("Abjuration".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
            ..Default::default()
        };

        apply_spell_update_with_conn(&conn, &update).expect("update spell");

        let new_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query updated hash");
        assert_ne!(new_hash, old_hash, "test update should produce a new hash");

        let class_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query class hash");
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash");

        assert_eq!(class_hash, new_hash);
        assert_eq!(artifact_hash, new_hash);
    }

    #[test]
    fn test_run_in_savepoint_rolls_back_and_releases_on_error() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute("CREATE TABLE test_tx (value TEXT NOT NULL)", [])
            .expect("create test table");

        let err = run_in_savepoint(&conn, "test_tx_write", || {
            conn.execute("INSERT INTO test_tx (value) VALUES ('pending')", [])?;
            Err::<(), AppError>(AppError::Validation("boom".to_string()))
        })
        .expect_err("savepoint should bubble error");
        assert!(err.to_string().contains("boom"));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM test_tx", [], |row| row.get(0))
            .expect("query row count");
        assert_eq!(count, 0, "savepoint should roll back failed writes");

        run_in_savepoint(&conn, "test_tx_write", || {
            conn.execute("INSERT INTO test_tx (value) VALUES ('committed')", [])?;
            Ok::<(), AppError>(())
        })
        .expect("savepoint should be reusable after rollback");

        let stored: String = conn
            .query_row("SELECT value FROM test_tx", [], |row| row.get(0))
            .expect("query committed value");
        assert_eq!(stored, "committed");
    }

    #[test]
    fn test_apply_spell_update_with_conn_rolls_back_on_vault_export_failure() {
        let long_root = std::env::temp_dir()
            .join("spellbook-backend")
            .join("a".repeat(240));
        let _env = VaultTestEnvGuard::with_root(long_root.clone())
            .expect("set isolated vault env");

        let conn = setup_spell_update_test_db();
        let initial_detail = SpellDetail {
            id: Some(1),
            name: "Rollback Spell".to_string(),
            level: 3,
            description: "Original description".to_string(),
            school: Some("Abjuration".to_string()),
            ..Default::default()
        };
        let (canonical, old_hash, json) =
            canonicalize_spell_detail(initial_detail.clone()).expect("canonicalize initial spell");
        conn.execute(
            "INSERT INTO spell (
                id, name, school, sphere, class_list, level, range, components, material_components,
                casting_time, duration, area, saving_throw, reversible, description, tags, source,
                edition, author, license, is_quest_spell, is_cantrip, damage, magic_resistance,
                schema_version, canonical_data, content_hash
             ) VALUES (
                1, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?, NULL, NULL,
                NULL, NULL, NULL, 0, 0, NULL, NULL, ?, ?, ?
             )",
            rusqlite::params![
                initial_detail.name,
                initial_detail.school,
                initial_detail.level,
                initial_detail.description,
                canonical.schema_version,
                json,
                old_hash,
            ],
        )
        .expect("seed spell row");
        conn.execute(
            "INSERT INTO character_class_spell (spell_id, character_class_id, spell_content_hash)
             VALUES (1, 7, ?1)",
            [old_hash.as_str()],
        )
        .expect("seed character class reference");
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 'source', 'spells/rollback.md', 'artifact-hash', '2026-03-08T00:00:00Z', ?1)",
            [old_hash.as_str()],
        )
        .expect("seed artifact reference");

        let update = SpellUpdate {
            id: 1,
            name: "Rollback Spell".to_string(),
            level: 3,
            description: "Updated description".to_string(),
            school: Some("Abjuration".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
            ..Default::default()
        };

        let err =
            apply_spell_update_with_conn(&conn, &update).expect_err("vault export should fail");
        assert!(err.to_string().contains("Windows path length"));

        let stored_description: String = conn
            .query_row("SELECT description FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query rolled back description");
        let stored_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query rolled back hash");
        let class_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query rolled back class hash");
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query rolled back artifact hash");
        let change_log_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM change_log WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query change log count");

        assert_eq!(stored_description, "Original description");
        assert_eq!(stored_hash, old_hash);
        assert_eq!(class_hash, old_hash);
        assert_eq!(artifact_hash, old_hash);
        assert_eq!(change_log_count, 0);
    }
}
