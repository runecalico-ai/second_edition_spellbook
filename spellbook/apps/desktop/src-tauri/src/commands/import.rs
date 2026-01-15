use crate::commands::spells::{apply_spell_update_with_conn, get_spell_from_conn};
use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    ImportArtifact, ImportConflict, ImportConflictField, ImportConflictResolution, ImportFile,
    ImportResult, ImportSpell, ParseConflict, PreviewResult, PreviewSpell, ResolveImportResult,
    SpellDetail, SpellUpdate,
};
use crate::sidecar::call_sidecar;
use chrono::Utc;
use dirs::data_dir as system_data_dir;
use regex::Regex;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde_json::json;
use std::collections::HashMap;
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

fn sanitize_import_filename(name: &str) -> (String, bool) {
    let re = Regex::new(r"[^a-zA-Z0-9._-]").unwrap();
    let sanitized = re.replace_all(name, "_").to_string();
    let changed = sanitized != name;
    (sanitized, changed)
}

fn build_conflict_fields(
    existing: &SpellDetail,
    incoming: &ImportSpell,
) -> Vec<ImportConflictField> {
    fn push_conflict(
        fields: &mut Vec<ImportConflictField>,
        field: &str,
        existing: Option<String>,
        incoming: Option<String>,
    ) {
        if existing != incoming {
            fields.push(ImportConflictField {
                field: field.to_string(),
                existing,
                incoming,
            });
        }
    }

    let mut fields = Vec::new();

    push_conflict(
        &mut fields,
        "name",
        Some(existing.name.clone()),
        Some(incoming.name.clone()),
    );
    push_conflict(
        &mut fields,
        "school",
        existing.school.clone(),
        incoming.school.clone(),
    );
    push_conflict(
        &mut fields,
        "sphere",
        existing.sphere.clone(),
        incoming.sphere.clone(),
    );
    push_conflict(
        &mut fields,
        "class_list",
        existing.class_list.clone(),
        incoming.class_list.clone(),
    );
    push_conflict(
        &mut fields,
        "level",
        Some(existing.level.to_string()),
        Some(incoming.level.to_string()),
    );
    push_conflict(
        &mut fields,
        "range",
        existing.range.clone(),
        incoming.range.clone(),
    );
    push_conflict(
        &mut fields,
        "components",
        existing.components.clone(),
        incoming.components.clone(),
    );
    push_conflict(
        &mut fields,
        "material_components",
        existing.material_components.clone(),
        incoming.material_components.clone(),
    );
    push_conflict(
        &mut fields,
        "casting_time",
        existing.casting_time.clone(),
        incoming.casting_time.clone(),
    );
    push_conflict(
        &mut fields,
        "duration",
        existing.duration.clone(),
        incoming.duration.clone(),
    );
    push_conflict(
        &mut fields,
        "area",
        existing.area.clone(),
        incoming.area.clone(),
    );
    push_conflict(
        &mut fields,
        "saving_throw",
        existing.saving_throw.clone(),
        incoming.saving_throw.clone(),
    );
    push_conflict(
        &mut fields,
        "reversible",
        existing.reversible.map(|v| v.to_string()),
        incoming.reversible.map(|v| v.to_string()),
    );
    push_conflict(
        &mut fields,
        "description",
        Some(existing.description.clone()),
        Some(incoming.description.clone()),
    );
    push_conflict(
        &mut fields,
        "tags",
        existing.tags.clone(),
        incoming.tags.clone(),
    );
    push_conflict(
        &mut fields,
        "source",
        existing.source.clone(),
        incoming.source.clone(),
    );
    push_conflict(
        &mut fields,
        "edition",
        existing.edition.clone(),
        incoming.edition.clone(),
    );
    push_conflict(
        &mut fields,
        "author",
        existing.author.clone(),
        incoming.author.clone(),
    );
    push_conflict(
        &mut fields,
        "license",
        existing.license.clone(),
        incoming.license.clone(),
    );

    fields
}

#[tauri::command]
pub async fn preview_import(files: Vec<ImportFile>) -> Result<PreviewResult, AppError> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir)?;

    let mut paths = vec![];
    for file in files {
        let (safe_name, _) = sanitize_import_filename(&file.name);
        let path = dir.join(&safe_name);
        fs::write(&path, &file.content)?;
        paths.push(path);
    }

    let result = call_sidecar("import", json!({"files": paths})).await?;

    let spells: Vec<PreviewSpell> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview spells: {}", e)))?;

    let artifacts: Vec<ImportArtifact> =
        serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview artifacts: {}", e)))?;

    let parse_conflicts: Vec<ParseConflict> =
        serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview conflicts: {}", e)))?;

    let conflicts = parse_conflicts
        .into_iter()
        .map(|conflict| ImportConflict::Parse {
            path: conflict.path,
            reason: conflict.reason,
        })
        .collect();

    Ok(PreviewResult {
        spells,
        artifacts,
        conflicts,
    })
}

#[tauri::command]
pub async fn import_files(
    state: State<'_, Arc<Pool>>,
    files: Vec<ImportFile>,
    allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
) -> Result<ImportResult, AppError> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir)?;

    let mut paths = vec![];
    let mut warnings = vec![];

    for file in &files {
        let (safe_name, changed) = sanitize_import_filename(&file.name);
        if changed {
            warnings.push(format!(
                "Sanitized import file name '{}' to '{}'.",
                file.name, safe_name
            ));
        }
        let path = dir.join(&safe_name);
        fs::write(&path, &file.content)?;
        paths.push(path);
    }

    let needs_spells = spells.is_none();
    let needs_artifacts = artifacts
        .as_ref()
        .map(|items| items.is_empty())
        .unwrap_or(true);
    let needs_conflicts = conflicts.is_none();
    let needs_sidecar = needs_spells || needs_artifacts || needs_conflicts;

    let mut parsed_spells: Vec<ImportSpell> = vec![];
    let mut artifacts_vec: Vec<ImportArtifact> = vec![];
    let mut conflicts_vec: Vec<ImportConflict> = vec![];

    if needs_sidecar {
        let result = call_sidecar("import", json!({"files": paths})).await?;
        if needs_spells {
            parsed_spells =
                serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse spells: {}", e)))?;
        }
        if needs_artifacts {
            artifacts_vec =
                serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse artifacts: {}", e)))?;
        }
        if needs_conflicts {
            let parse_conflicts: Vec<ParseConflict> =
                serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse conflicts: {}", e)))?;
            conflicts_vec.extend(parse_conflicts.into_iter().map(|conflict| {
                ImportConflict::Parse {
                    path: conflict.path,
                    reason: conflict.reason,
                }
            }));
        }
    }

    if let Some(override_artifacts) = artifacts {
        if !override_artifacts.is_empty() {
            artifacts_vec = override_artifacts;
        }
    }

    if let Some(override_conflicts) = conflicts {
        conflicts_vec = override_conflicts;
    }

    let (spells_to_import, spell_sources, using_override) = match spells {
        Some(override_spells) => {
            let sources: Vec<Option<String>> = override_spells
                .iter()
                .map(|spell| spell.source_file.clone())
                .collect();
            (override_spells, sources, true)
        }
        None => {
            let sources: Vec<Option<String>> = artifacts_vec
                .iter()
                .map(|artifact| Some(artifact.path.clone()))
                .collect();
            (parsed_spells, sources, false)
        }
    };

    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let skipped = vec![];
        let mut imported_spells = vec![];
        let mut artifacts_by_path = HashMap::new();

        for artifact in &artifacts_vec {
            artifacts_by_path.insert(artifact.path.clone(), artifact.clone());
        }

        let mut final_conflicts = conflicts_vec;

        for (i, spell) in spells_to_import.iter().enumerate() {
            let existing_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM spell WHERE name = ? AND level = ? AND source = ?",
                    params![spell.name, spell.level, spell.source],
                    |row| row.get(0),
                )
                .optional()?;

            let spell_id = if let Some(id) = existing_id {
                if !allow_overwrite {
                    let existing_spell = get_spell_from_conn(&conn, id)?
                        .ok_or_else(|| AppError::NotFound("Failed to fetch existing spell".into()))?;
                    let artifact = spell_sources
                        .get(i)
                        .and_then(|source| source.as_ref())
                        .and_then(|source| artifacts_by_path.get(source))
                        .cloned();
                    let fields = build_conflict_fields(&existing_spell, spell);
                    final_conflicts.push(ImportConflict::Spell {
                        existing: Box::new(existing_spell),
                        incoming: Box::new(SpellDetail {
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
                            reversible: spell.reversible,
                            description: spell.description.clone(),
                            tags: spell.tags.clone(),
                            source: spell.source.clone(),
                            edition: spell.edition.clone(),
                            author: spell.author.clone(),
                            license: spell.license.clone(),
                            is_quest_spell: spell.is_quest_spell,
                            artifacts: None,
                        }),
                        fields,
                        artifact,
                    });
                    continue;
                }
                conn.execute(
                    "UPDATE spell SET school=?, sphere=?, class_list=?, range=?, components=?, 
                     material_components=?, casting_time=?, duration=?, area=?, saving_throw=?, 
                     reversible=?, description=?, tags=?, edition=?, author=?, license=?, 
                     is_quest_spell=?, updated_at=? WHERE id=?",
                    params![
                        spell.school,
                        spell.sphere,
                        spell.class_list,
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
                        spell.edition,
                        spell.author,
                        spell.license,
                        spell.is_quest_spell,
                        Utc::now().to_rfc3339(),
                        id,
                    ],
                )?;
                id
            } else {
                conn.execute(
                    "INSERT INTO spell (name, school, sphere, class_list, level, range, components, 
                     material_components, casting_time, duration, area, saving_throw, reversible, 
                     description, tags, source, edition, author, license, is_quest_spell) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                    ],
                )?;
                conn.last_insert_rowid()
            };

            imported_spells.push(SpellDetail {
                id: Some(spell_id),
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
                reversible: spell.reversible,
                description: spell.description.clone(),
                tags: spell.tags.clone(),
                source: spell.source.clone(),
                edition: spell.edition.clone(),
                author: spell.author.clone(),
                license: spell.license.clone(),
                is_quest_spell: spell.is_quest_spell,
                artifacts: None,
            });

            let artifact_val = if using_override {
                spell_sources
                    .get(i)
                    .and_then(|source| source.as_ref())
                    .and_then(|source| artifacts_by_path.get(source))
            } else {
                spell_sources
                    .get(i)
                    .and_then(|source| source.as_ref())
                    .and_then(|source| artifacts_by_path.get(source))
                    .or_else(|| artifacts_vec.get(i))
            };

            if let Some(artifact_val) = artifact_val {
                let _ = conn.execute(
                    "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(spell_id, path) DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                    params![
                        spell_id,
                        artifact_val.r#type,
                        artifact_val.path,
                        artifact_val.hash,
                        artifact_val.imported_at
                    ],
                );
            }
        }

        let artifacts_value = serde_json::to_value(&artifacts_vec).unwrap_or_default();

        Ok::<ImportResult, AppError>(ImportResult {
            spells: imported_spells,
            artifacts: artifacts_value.as_array().cloned().unwrap_or_default(),
            conflicts: final_conflicts,
            warnings,
            skipped,
        })
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn resolve_import_conflicts(
    state: State<'_, Arc<Pool>>,
    resolutions: Vec<ImportConflictResolution>,
) -> Result<ResolveImportResult, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut resolved = Vec::new();
        let mut skipped = Vec::new();
        let mut warnings = Vec::new();

        for resolution in resolutions {
            match resolution.action.as_str() {
                "skip" => {
                    if let Some(existing_spell) = get_spell_from_conn(&conn, resolution.existing_id)? {
                        skipped.push(existing_spell.name);
                    }
                }
                "overwrite" | "merge" => {
                    let spell = resolution
                        .spell
                        .ok_or_else(|| AppError::Validation("missing spell for conflict resolution".into()))?;
                    if spell.id != resolution.existing_id {
                        return Err(AppError::Validation("conflict resolution id mismatch".into()));
                    }
                    apply_spell_update_with_conn(&conn, &spell)?;
                    resolved.push(spell.name.clone());

                    if let Some(artifact) = resolution.artifact {
                        if let Err(e) = conn.execute(
                            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                             ON CONFLICT(spell_id, path) DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                            params![
                                spell.id,
                                artifact.r#type,
                                artifact.path,
                                artifact.hash,
                                artifact.imported_at
                            ],
                        ) {
                            warnings.push(format!("Artifact error for {}: {}", spell.name, e));
                        }
                    }
                }
                _ => {
                    return Err(AppError::Validation(format!(
                        "Unknown conflict resolution action: {}",
                        resolution.action
                    )));
                }
            }
        }

        Ok::<ResolveImportResult, AppError>(ResolveImportResult {
            resolved,
            skipped,
            warnings,
        })
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn reparse_artifact(
    state: State<'_, Arc<Pool>>,
    artifact_id: i64,
) -> Result<SpellDetail, AppError> {
    let pool = state.inner().clone();

    let (spell_id, artifact_path) = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            let row: (i64, String) = conn
                .query_row(
                    "SELECT spell_id, path FROM artifact WHERE id = ?",
                    [artifact_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(AppError::Database)?;
            Ok::<_, AppError>(row)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
    };

    let path = std::path::Path::new(&artifact_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Artifact file no longer exists at: {}",
            artifact_path
        )));
    }

    let _original_spell = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            get_spell_from_conn(&conn, spell_id)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
        .ok_or_else(|| AppError::NotFound("Original spell not found".to_string()))?
    };

    let result = call_sidecar("import", json!({"files": [artifact_path]})).await?;
    let spells: Vec<SpellDetail> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse sidecar response: {}", e)))?;

    let parsed_spell = spells
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Sidecar("Sidecar did not return any parsed spells".to_string()))?;

    let pool = pool.clone();
    let updated_spell = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;

        let update_for_diff = SpellUpdate {
            id: spell_id,
            name: parsed_spell.name.clone(),
            school: parsed_spell.school.clone(),
            sphere: parsed_spell.sphere.clone(),
            class_list: parsed_spell.class_list.clone(),
            level: parsed_spell.level,
            range: parsed_spell.range.clone(),
            components: parsed_spell.components.clone(),
            material_components: parsed_spell.material_components.clone(),
            casting_time: parsed_spell.casting_time.clone(),
            duration: parsed_spell.duration.clone(),
            area: parsed_spell.area.clone(),
            saving_throw: parsed_spell.saving_throw.clone(),
            reversible: parsed_spell.reversible,
            description: parsed_spell.description.clone(),
            tags: parsed_spell.tags.clone(),
            source: parsed_spell.source.clone(),
            edition: parsed_spell.edition.clone(),
            author: parsed_spell.author.clone(),
            license: parsed_spell.license.clone(),
            is_quest_spell: parsed_spell.is_quest_spell,
        };

        apply_spell_update_with_conn(&conn, &update_for_diff)?;

        conn.execute(
            "UPDATE artifact SET imported_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), artifact_id],
        )?;

        get_spell_from_conn(&conn, spell_id)?
            .ok_or_else(|| AppError::NotFound("Failed to fetch updated spell".to_string()))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(updated_spell)
}
