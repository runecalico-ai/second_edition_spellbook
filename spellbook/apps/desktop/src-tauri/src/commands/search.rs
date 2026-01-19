use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    ChatResponse, Facets, SavedSearch, SavedSearchPayload, SearchFilters, SpellSummary,
};
use crate::sidecar::call_sidecar;
use rusqlite::params;
use rusqlite::Connection;
use serde_json::json;
use std::sync::Arc;
use tauri::State;

fn collect_facet_entries(conn: &Connection, sql: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
    let mut all_entries = std::collections::HashSet::new();
    for row in rows {
        if let Some(s) = row? {
            for part in s.split(',') {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    all_entries.insert(trimmed.to_string());
                }
            }
        }
    }
    let mut sorted: Vec<String> = all_entries.into_iter().collect();
    sorted.sort();
    Ok(sorted)
}

fn search_keyword_with_conn(
    conn: &Connection,
    query: &str,
    filters: Option<SearchFilters>,
) -> Result<Vec<SpellSummary>, AppError> {
    let mut sql = "SELECT id, name, school, sphere, level, class_list, components, duration, source, is_quest_spell, is_cantrip FROM spell WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !query.trim().is_empty() {
        // Use FTS5 for full-text search across name, description, material_components, tags, source, author
        sql.push_str(" AND id IN (SELECT rowid FROM spell_fts WHERE spell_fts MATCH ?)");
        // Escape special FTS5 characters and wrap in quotes for phrase matching
        let escaped_query = query.replace('"', "\"\"");
        params.push(Box::new(format!("\"{}\"", escaped_query)));
    }

    if let Some(f) = filters {
        if let Some(schools) = f.schools {
            if !schools.is_empty() {
                sql.push_str(" AND (");
                for (i, school) in schools.iter().enumerate() {
                    if i > 0 {
                        sql.push_str(" OR ");
                    }
                    sql.push_str("school LIKE ?");
                    params.push(Box::new(format!("%{}%", school)));
                }
                sql.push(')');
            }
        }

        if let Some(spheres) = f.spheres {
            if !spheres.is_empty() {
                sql.push_str(" AND (");
                for (i, sphere) in spheres.iter().enumerate() {
                    if i > 0 {
                        sql.push_str(" OR ");
                    }
                    sql.push_str("sphere LIKE ?");
                    params.push(Box::new(format!("%{}%", sphere)));
                }
                sql.push(')');
            }
        }

        if let Some(min) = f.level_min {
            sql.push_str(" AND level >= ?");
            params.push(Box::new(min));
        }

        if let Some(max) = f.level_max {
            sql.push_str(" AND level <= ?");
            params.push(Box::new(max));
        }

        if let Some(class) = f.class_list {
            if !class.is_empty() {
                sql.push_str(" AND class_list LIKE ?");
                params.push(Box::new(format!("%{}%", class)));
            }
        }

        if let Some(source) = f.source {
            if !source.is_empty() {
                sql.push_str(" AND source LIKE ?");
                params.push(Box::new(format!("%{}%", source)));
            }
        }

        if let Some(components) = f.components {
            if !components.is_empty() {
                sql.push_str(" AND components LIKE ?");
                params.push(Box::new(format!("%{}%", components)));
            }
        }

        if let Some(tags) = f.tags {
            if !tags.is_empty() {
                sql.push_str(" AND tags LIKE ?");
                params.push(Box::new(format!("%{}%", tags)));
            }
        }

        if let Some(is_quest) = f.is_quest_spell {
            if is_quest {
                sql.push_str(" AND is_quest_spell = 1");
            }
        }

        if let Some(is_cantrip) = f.is_cantrip {
            if is_cantrip {
                sql.push_str(" AND is_cantrip = 1");
            }
        }
    }

    sql.push_str(" ORDER BY name ASC LIMIT 100");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
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
    Ok(spells)
}

#[tauri::command]
pub async fn search_keyword(
    state: State<'_, Arc<Pool>>,
    query: String,
    filters: Option<SearchFilters>,
) -> Result<Vec<SpellSummary>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        search_keyword_with_conn(&conn, &query, filters)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn search_semantic(
    state: State<'_, Arc<Pool>>,
    query: String,
) -> Result<Vec<SpellSummary>, AppError> {
    let embedding_resp = call_sidecar("embed", json!({"text": query})).await?;
    let vector: Vec<f32> = serde_json::from_value(
        embedding_resp
            .get("embedding")
            .cloned()
            .unwrap_or(json!([])),
    )
    .map_err(|e| AppError::Sidecar(format!("Failed to parse embedding: {}", e)))?;

    if vector.is_empty() {
        return Err(AppError::Sidecar("Empty embedding returned".into()));
    }

    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.school, s.sphere, s.level, s.class_list, s.components, s.duration,
                    s.source, s.is_quest_spell, s.is_cantrip, vec_distance_cosine(v.v, ?) as distance
             FROM spell_vec v
             JOIN spell s ON s.id = v.rowid
             ORDER BY distance ASC
             LIMIT 50",
        )?;

        let vec_json = serde_json::to_string(&vector).unwrap();
        let rows = stmt.query_map([vec_json], |row| {
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
pub async fn list_facets(state: State<'_, Arc<Pool>>) -> Result<Facets, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let schools = collect_facet_entries(&conn, "SELECT school FROM spell")?;
        let spheres = collect_facet_entries(&conn, "SELECT sphere FROM spell")?;
        let sources = collect_facet_entries(&conn, "SELECT source FROM spell")?;
        let class_list = collect_facet_entries(&conn, "SELECT class_list FROM spell")?;
        let components = collect_facet_entries(&conn, "SELECT components FROM spell")?;
        let tags = collect_facet_entries(&conn, "SELECT tags FROM spell")?;

        let mut stmt = conn.prepare("SELECT DISTINCT level FROM spell ORDER BY level")?;
        let levels_rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        let mut levels = vec![];
        for r in levels_rows {
            levels.push(r?);
        }

        Ok::<Facets, AppError>(Facets {
            schools,
            spheres,
            sources,
            class_list,
            components,
            tags,
            levels,
        })
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn save_search(
    state: State<'_, Arc<Pool>>,
    name: String,
    payload: SavedSearchPayload,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let filter_json =
            serde_json::to_string(&payload).map_err(|e| AppError::Unknown(e.to_string()))?;
        conn.execute(
            "INSERT INTO saved_search (name, filter_json) VALUES (?, ?)",
            params![name, filter_json],
        )?;
        Ok::<i64, AppError>(conn.last_insert_rowid())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn list_saved_searches(
    state: State<'_, Arc<Pool>>,
) -> Result<Vec<SavedSearch>, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, filter_json, created_at FROM saved_search ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SavedSearch {
                id: row.get(0)?,
                name: row.get(1)?,
                filter_json: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok::<Vec<SavedSearch>, AppError>(out)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn delete_saved_search(state: State<'_, Arc<Pool>>, id: i64) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute("DELETE FROM saved_search WHERE id = ?", [id])?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub async fn chat_answer(prompt: String) -> Result<ChatResponse, AppError> {
    let result = call_sidecar("chat", json!({"prompt": prompt})).await?;

    let answer = result
        .get("answer")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let citations = result
        .get("citations")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let meta = result.get("meta").cloned().unwrap_or(json!({}));

    Ok(ChatResponse {
        answer,
        citations,
        meta,
    })
}
