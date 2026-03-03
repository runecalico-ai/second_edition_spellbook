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
    let mut sql = "SELECT id, name, school, sphere, level, class_list, components, duration, source, is_quest_spell, is_cantrip, tags FROM spell WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !query.trim().is_empty() {
        // Use FTS5 for full-text search across name, description, material_components, tags, source, author,
        // and canonical text fields (range, duration, area, casting time, saving throw, damage, magic resistance, xp cost)
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
            tags: row.get(11)?,
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
                    s.source, s.is_quest_spell, s.is_cantrip, s.tags, vec_distance_cosine(v.v, ?) as distance
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

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    /// Creates an in-memory database with the spell table and the migration-0014
    /// FTS schema (virtual table + triggers).  Using include_str! means these
    /// tests exercise the exact SQL that ships in production.
    fn setup_fts_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id               INTEGER PRIMARY KEY,
                name             TEXT NOT NULL DEFAULT '',
                description      TEXT NOT NULL DEFAULT '',
                material_components TEXT DEFAULT '',
                tags             TEXT DEFAULT '',
                source           TEXT DEFAULT '',
                author           TEXT DEFAULT '',
                canonical_data   TEXT
            );
            "#,
        )
        .unwrap();
        let migration_sql =
            include_str!("../../../../../db/migrations/0014_fts_extend_canonical.sql");
        conn.execute_batch(migration_sql).unwrap();
        conn
    }

    /// Returns the rowids from spell_fts that match the given FTS term.
    fn fts_rowids(conn: &Connection, term: &str) -> Vec<i64> {
        let mut stmt = conn
            .prepare("SELECT rowid FROM spell_fts WHERE spell_fts MATCH ?")
            .unwrap();
        let rows = stmt.query_map([term], |row| row.get::<_, i64>(0)).unwrap();
        rows.filter_map(|r| r.ok()).collect()
    }

    /// Verify that the INSERT trigger indexes both plain description text and
    /// canonical_range_text extracted from canonical_data JSON.
    #[test]
    fn test_fts_insert_trigger() {
        let conn = setup_fts_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Fireball', 'A blazing orb of fire', \
             '{\"range\":{\"text\":\"hundredyards\"}}')",
            [],
        )
        .unwrap();

        assert!(
            fts_rowids(&conn, "blazing").contains(&1),
            "description term 'blazing' should be indexed after INSERT"
        );
        assert!(
            fts_rowids(&conn, "hundredyards").contains(&1),
            "canonical_range_text term 'hundredyards' should be indexed after INSERT"
        );
    }

    /// Verify that the UPDATE trigger removes the old description term and adds
    /// the new one (basic sync behaviour).
    #[test]
    fn test_fts_update_trigger_sync() {
        let conn = setup_fts_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Missile Storm', 'Fires xyzoldterm projectiles', '{}')",
            [],
        )
        .unwrap();

        assert!(
            fts_rowids(&conn, "xyzoldterm").contains(&1),
            "old term should be present before update"
        );

        conn.execute(
            "UPDATE spell SET description = 'Fires xyznewterm projectiles' WHERE id = 1",
            [],
        )
        .unwrap();

        assert!(
            !fts_rowids(&conn, "xyzoldterm").contains(&1),
            "old term 'xyzoldterm' must not match after update"
        );
        assert!(
            fts_rowids(&conn, "xyznewterm").contains(&1),
            "new term 'xyznewterm' must match after update"
        );
    }

    /// Verify that the UPDATE trigger passes old.canonical_data values correctly
    /// so that stale canonical_range_text entries are removed from the FTS index.
    #[test]
    fn test_fts_update_trigger_no_stale_entries() {
        let conn = setup_fts_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Range Spell', 'A test spell', \
             '{\"range\":{\"text\":\"oldrangetoken\"}}')",
            [],
        )
        .unwrap();

        assert!(
            fts_rowids(&conn, "oldrangetoken").contains(&1),
            "old canonical_range_text should be present before update"
        );

        conn.execute(
            "UPDATE spell SET canonical_data = '{\"range\":{\"text\":\"newrangetoken\"}}' \
             WHERE id = 1",
            [],
        )
        .unwrap();

        assert!(
            !fts_rowids(&conn, "oldrangetoken").contains(&1),
            "stale canonical_range_text must be removed after update (old.* trigger correctness)"
        );
        assert!(
            fts_rowids(&conn, "newrangetoken").contains(&1),
            "new canonical_range_text must be indexed after update"
        );
    }

    /// Verify that the DELETE trigger removes both the description term and the
    /// canonical_range_text term from the FTS index using old.* values.
    #[test]
    fn test_fts_delete_trigger_correctness() {
        let conn = setup_fts_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Vanishing Spell', 'Contains uniquedeletetoken term', \
             '{\"range\":{\"text\":\"deleterangetoken\"}}')",
            [],
        )
        .unwrap();

        assert!(
            fts_rowids(&conn, "uniquedeletetoken").contains(&1),
            "description term should be present before delete"
        );
        assert!(
            fts_rowids(&conn, "deleterangetoken").contains(&1),
            "canonical_range_text term should be present before delete"
        );

        conn.execute("DELETE FROM spell WHERE id = 1", []).unwrap();

        assert!(
            !fts_rowids(&conn, "uniquedeletetoken").contains(&1),
            "description term must be removed after spell deletion"
        );
        assert!(
            !fts_rowids(&conn, "deleterangetoken").contains(&1),
            "canonical_range_text term must be removed after spell deletion (old.* trigger correctness)"
        );
    }

    /// Verify that spells with NULL canonical_data are indexed without errors.
    /// The json_extract + COALESCE in triggers must handle NULL gracefully so that
    /// basic name/description terms are still searchable.
    #[test]
    fn test_fts_null_canonical_data() {
        let conn = setup_fts_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Nullspell', 'Contains nullcanonicaltoken text', NULL)",
            [],
        )
        .unwrap();

        assert!(
            fts_rowids(&conn, "nullcanonicaltoken").contains(&1),
            "description term should be indexed even when canonical_data is NULL"
        );
        assert!(
            fts_rowids(&conn, "Nullspell").contains(&1),
            "name term should be indexed even when canonical_data is NULL"
        );
    }
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
