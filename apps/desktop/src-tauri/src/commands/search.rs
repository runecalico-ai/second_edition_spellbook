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

// ---------------------------------------------------------------------------
// FTS5 query builder — two-tier search
// ---------------------------------------------------------------------------

/// Escapes the contents of a word for use inside an FTS5 quoted phrase (`"..."`).
/// Only `"` needs to be doubled; all other FTS5 special characters (`*`, `(`, `)`,
/// `^`, `:`, `-`, `+`) have no query-level meaning inside a quoted phrase and are
/// passed literally to the tokenizer by FTS5 itself.
fn escape_fts_phrase_content(s: &str) -> String {
    s.replace('"', "\"\"")
}

/// Wraps a string as a single FTS5 quoted phrase term.
fn wrap_as_fts_phrase(s: &str) -> String {
    format!("\"{}\"", escape_fts_phrase_content(s))
}

/// Returns true for any of the three FTS5 boolean operators (`AND`, `OR`, `NOT`).
fn is_fts_operator(token: &str) -> bool {
    matches!(token, "AND" | "OR" | "NOT")
}

/// Attempts to build an advanced-mode FTS5 query from already-tokenised input.
///
/// Rules:
/// - Cannot start with any FTS5 operator (`AND`, `OR`, `NOT`); FTS5 boolean operators
///   are all infix-only and require operands on both sides.
/// - Cannot end with any operator.
/// - `AND`/`OR` cannot be immediately followed by another `AND`/`OR` (but `AND NOT`
///   is valid).
/// - Must contain at least one non-operator (content) token.
///
/// Content tokens are wrapped individually as quoted phrases; `NEAR` therefore
/// becomes `"NEAR"` — a literal word, never an FTS5 NEAR operator.
///
/// Returns `None` when the expression is malformed, which causes the caller to
/// fall back to basic mode.
fn try_build_advanced_fts_query(tokens: &[&str]) -> Option<String> {
    if tokens.is_empty() {
        return None;
    }
    // Cannot start with any FTS5 operator. NOT is also infix-only in FTS5
    // (there is no unary prefix negation), so "NOT ice" is invalid syntax.
    if is_fts_operator(tokens[0]) {
        return None;
    }
    // Cannot end with any operator (malformed: "fire AND", "fire NOT").
    if is_fts_operator(tokens[tokens.len() - 1]) {
        return None;
    }
    // Any operator immediately followed by another operator is malformed, except
    // for "AND NOT" which collapses to FTS5's infix NOT later.
    // Both sides are checked with is_fts_operator so "NOT NOT", "NOT OR", etc.
    // are all correctly rejected.
    for window in tokens.windows(2) {
        if is_fts_operator(window[0]) && is_fts_operator(window[1]) {
            // AND NOT is the only valid consecutive pair (AND collapses to NOT later).
            let is_and_not = window[0] == "AND" && window[1] == "NOT";
            if !is_and_not {
                return None;
            }
        }
    }
    // Must have at least one content token.
    if !tokens.iter().any(|t| !is_fts_operator(t)) {
        return None;
    }

    // Build the FTS5 expression.  FTS5's NOT is an infix binary operator that
    // already means "AND NOT", so `a AND NOT b` is invalid syntax — collapse
    // "AND NOT" token pairs to just "NOT".
    let mut parts: Vec<String> = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if token == "AND" && i + 1 < tokens.len() && tokens[i + 1] == "NOT" {
            // Skip the redundant AND; the NOT on the next iteration handles it.
            i += 1;
            continue;
        }
        if is_fts_operator(token) {
            parts.push(token.to_string());
        } else {
            parts.push(wrap_as_fts_phrase(token));
        }
        i += 1;
    }
    Some(parts.join(" "))
}

/// Builds the FTS5 MATCH expression string for `raw_query`.
///
/// The returned string is always bound as a single `?` parameter — raw user
/// input is never concatenated into SQL.
///
/// **Basic mode** (default):  
///   The entire query is wrapped as a single quoted phrase.  All FTS5 special
///   characters (`"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`) are treated as
///   literal text.  Boolean keywords typed in any case are not operators.
///
/// **Advanced mode** (opt-in):  
///   Activated when the trimmed query contains at least one standalone uppercase
///   boolean keyword (`AND`, `OR`, `NOT`) as a whitespace-delimited token.
///   Matched operators are kept as FTS5 boolean operators; all other tokens are
///   individually wrapped as quoted phrases.  `NEAR` is *always* escaped — even
///   when other operators are present it becomes `"NEAR"`, never the FTS5 NEAR
///   operator.  Falls back to basic mode on malformed operator expressions (e.g.
///   trailing operator, leading operator (`AND`/`OR`/`NOT`), consecutive operators).
fn build_fts_query(raw_query: &str) -> String {
    let trimmed = raw_query.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let tokens: Vec<&str> = trimmed.split_whitespace().collect();

    // Advanced-mode heuristic: any standalone AND, OR, or NOT token.
    let has_boolean_operator = tokens.iter().any(|&t| is_fts_operator(t));
    if has_boolean_operator {
        if let Some(advanced) = try_build_advanced_fts_query(&tokens) {
            return advanced;
        }
        // Malformed expression — fall through to basic mode.
    }

    // Basic mode: wrap the entire query as a single quoted phrase.
    wrap_as_fts_phrase(trimmed)
}

// ---------------------------------------------------------------------------
// Search command utilities
// ---------------------------------------------------------------------------

/// Maximum results per query. Applied to both BM25-ranked text results (where
/// relevance justifies the cap) and filter-only alphabetical results (where the
/// cap is an arbitrary completeness ceiling — silent truncation is possible for
/// large result sets).
const SEARCH_RESULT_LIMIT: usize = 100;

/// Escapes `\`, `%`, and `_` so they are treated as literals in a SQLite LIKE
/// clause. The caller must append `ESCAPE '\'` to the SQL clause.
fn escape_like_value(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn collect_facet_entries(conn: &Connection, sql: &str) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
    let mut all_entries = std::collections::BTreeSet::new();
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
    Ok(all_entries.into_iter().collect())
}

fn search_keyword_with_conn(
    conn: &Connection,
    query: &str,
    filters: Option<SearchFilters>,
) -> Result<Vec<SpellSummary>, AppError> {
    let has_text_query = !query.trim().is_empty();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // When a text query is present we JOIN spell_fts so that bm25() is available
    // for relevance ordering. The `s.` prefix avoids ambiguity on columns that
    // exist in both `spell` and `spell_fts` (e.g. `tags`, `source`).
    let mut sql = if has_text_query {
        params.push(Box::new(build_fts_query(query)));
        "SELECT s.id, s.name, s.school, s.sphere, s.level, s.class_list, s.components, \
         s.duration, s.source, s.is_quest_spell, s.is_cantrip, s.tags \
         FROM spell s JOIN spell_fts ON spell_fts.rowid = s.id \
         WHERE spell_fts MATCH ?"
            .to_string()
    } else {
        "SELECT id, name, school, sphere, level, class_list, components, duration, source, \
         is_quest_spell, is_cantrip, tags FROM spell WHERE 1=1"
            .to_string()
    };

    // When joining with spell_fts, qualify all spell column references with `s.`
    // to avoid ambiguous-column errors while keeping user input bound through `?`.
    let col = if has_text_query { "s." } else { "" };

    if let Some(f) = filters {
        if let Some(schools) = f.schools {
            let nonempty_schools: Vec<_> = schools.iter().filter(|s| !s.is_empty()).collect();
            if !nonempty_schools.is_empty() {
                sql.push_str(" AND (");
                for (i, school) in nonempty_schools.iter().enumerate() {
                    if i > 0 {
                        sql.push_str(" OR ");
                    }
                    sql.push_str(&format!("{}school LIKE ? ESCAPE '\\'", col));
                    params.push(Box::new(format!("%{}%", escape_like_value(school))));
                }
                sql.push(')');
            }
        }

        if let Some(spheres) = f.spheres {
            let nonempty_spheres: Vec<_> = spheres.iter().filter(|s| !s.is_empty()).collect();
            if !nonempty_spheres.is_empty() {
                sql.push_str(" AND (");
                for (i, sphere) in nonempty_spheres.iter().enumerate() {
                    if i > 0 {
                        sql.push_str(" OR ");
                    }
                    sql.push_str(&format!("{}sphere LIKE ? ESCAPE '\\'", col));
                    params.push(Box::new(format!("%{}%", escape_like_value(sphere))));
                }
                sql.push(')');
            }
        }

        if let Some(min) = f.level_min {
            sql.push_str(&format!(" AND {}level >= ?", col));
            params.push(Box::new(min));
        }

        if let Some(max) = f.level_max {
            sql.push_str(&format!(" AND {}level <= ?", col));
            params.push(Box::new(max));
        }

        if let Some(class) = f.class_list {
            if !class.is_empty() {
                sql.push_str(&format!(" AND {}class_list LIKE ? ESCAPE '\\'", col));
                params.push(Box::new(format!("%{}%", escape_like_value(&class))));
            }
        }

        if let Some(source) = f.source {
            if !source.is_empty() {
                sql.push_str(&format!(" AND {}source LIKE ? ESCAPE '\\'", col));
                params.push(Box::new(format!("%{}%", escape_like_value(&source))));
            }
        }

        if let Some(components) = f.components {
            if !components.is_empty() {
                sql.push_str(&format!(" AND {}components LIKE ? ESCAPE '\\'", col));
                params.push(Box::new(format!("%{}%", escape_like_value(&components))));
            }
        }

        if let Some(tags) = f.tags {
            if !tags.is_empty() {
                sql.push_str(&format!(" AND {}tags LIKE ? ESCAPE '\\'", col));
                params.push(Box::new(format!("%{}%", escape_like_value(&tags))));
            }
        }

        if let Some(is_quest) = f.is_quest_spell {
            if is_quest {
                sql.push_str(&format!(" AND {}is_quest_spell = 1", col));
            }
        }

        if let Some(is_cantrip) = f.is_cantrip {
            if is_cantrip {
                sql.push_str(&format!(" AND {}is_cantrip = 1", col));
            }
        }
    }

    if has_text_query {
        sql.push_str(&format!(
            " ORDER BY bm25(spell_fts) ASC LIMIT {SEARCH_RESULT_LIMIT}"
        ));
    } else {
        sql.push_str(&format!(" ORDER BY name ASC LIMIT {SEARCH_RESULT_LIMIT}"));
    }

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

    /// Creates an in-memory database with the FTS schema.
    /// Delegates to `setup_search_db`; the full schema is a superset and
    /// the FTS trigger tests only query `spell_fts`.
    fn setup_fts_db() -> Connection {
        setup_search_db()
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
    /// both name and description terms are still searchable.
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

    // -----------------------------------------------------------------------
    // build_fts_query — unit tests for two-tier search logic
    // -----------------------------------------------------------------------

    use super::build_fts_query;

    #[test]
    fn test_basic_mode_lowercase_and_is_not_operator() {
        // "fire and ice" — lowercase "and" must NOT trigger advanced mode.
        // The whole query is wrapped as a single phrase.
        assert_eq!(build_fts_query("fire and ice"), "\"fire and ice\"");
    }

    #[test]
    fn test_basic_mode_near_is_not_operator() {
        // NEAR is never a recognised boolean in the detection heuristic.
        // "fire NEAR shield" stays in basic mode (single phrase).
        assert_eq!(build_fts_query("fire NEAR shield"), "\"fire NEAR shield\"");
    }

    #[test]
    fn test_advanced_mode_and_operator() {
        // Uppercase AND triggers advanced mode; each word becomes its own phrase.
        assert_eq!(build_fts_query("fire AND ice"), "\"fire\" AND \"ice\"");
    }

    #[test]
    fn test_advanced_mode_and_not_operator() {
        // FTS5's NOT is already an infix "AND NOT" operator, so "AND NOT" collapses
        // to just "NOT" — `"fire" NOT "ice"` is the correct FTS5 syntax.
        assert_eq!(build_fts_query("fire AND NOT ice"), "\"fire\" NOT \"ice\"");
    }

    #[test]
    fn test_advanced_mode_or_operator() {
        assert_eq!(build_fts_query("fire OR ice"), "\"fire\" OR \"ice\"");
    }

    #[test]
    fn test_leading_not_falls_back_to_basic() {
        // FTS5's NOT is an infix binary operator — a leading NOT has no left operand
        // and produces invalid FTS5 syntax. Fall back to basic (phrase) mode.
        assert_eq!(build_fts_query("NOT ice"), "\"NOT ice\"");
    }

    #[test]
    fn test_advanced_mode_near_always_escaped() {
        // When AND is present the query enters advanced mode, but NEAR must still
        // be wrapped as a quoted phrase (literal word), never treated as an operator.
        assert_eq!(
            build_fts_query("fire AND NEAR shield"),
            "\"fire\" AND \"NEAR\" \"shield\""
        );
    }

    #[test]
    fn test_malformed_trailing_operator_falls_back_to_basic() {
        // "fire AND" — trailing binary operator is malformed; fall back to phrase.
        assert_eq!(build_fts_query("fire AND"), "\"fire AND\"");
    }

    #[test]
    fn test_malformed_leading_binary_operator_falls_back_to_basic() {
        // "AND fire" — starts with binary operator; fall back to phrase.
        assert_eq!(build_fts_query("AND fire"), "\"AND fire\"");
    }

    #[test]
    fn test_malformed_consecutive_and_falls_back_to_basic() {
        // "fire AND AND ice" — consecutive binary operators; fall back to phrase.
        assert_eq!(build_fts_query("fire AND AND ice"), "\"fire AND AND ice\"");
    }

    #[test]
    fn test_malformed_operator_only_falls_back_to_basic() {
        // A query that is only an operator token is malformed.
        assert_eq!(build_fts_query("AND"), "\"AND\"");
    }

    #[test]
    fn test_malformed_not_and_falls_back_to_basic() {
        // "NOT AND fire" — NOT followed by AND is malformed; fall back to phrase.
        assert_eq!(build_fts_query("NOT AND fire"), "\"NOT AND fire\"");
    }

    #[test]
    fn test_malformed_not_or_falls_back_to_basic() {
        // "fire NOT OR ice" — NOT followed by OR is malformed; fall back to phrase.
        assert_eq!(build_fts_query("fire NOT OR ice"), "\"fire NOT OR ice\"");
    }

    #[test]
    fn test_malformed_double_not_falls_back_to_basic() {
        // "NOT NOT fire" — consecutive NOT tokens are malformed (NOT NOT is not
        // valid FTS5 syntax); fall back to basic phrase mode.
        assert_eq!(build_fts_query("NOT NOT fire"), "\"NOT NOT fire\"");
    }

    #[test]
    fn test_malformed_or_not_after_term_falls_back_to_basic() {
        // "fire OR NOT ice" — OR immediately followed by NOT is a consecutive-operator
        // pair (other than AND NOT); rejected because NOT itself requires a left operand
        // and cannot begin a sub-expression. Fall back to basic phrase mode.
        assert_eq!(build_fts_query("fire OR NOT ice"), "\"fire OR NOT ice\"");
    }

    #[test]
    fn test_basic_mode_special_chars_escaped_in_phrase() {
        // Double-quote inside user input must be escaped (doubled) inside the
        // wrapping phrase so it doesn't break the FTS5 query syntax.
        assert_eq!(build_fts_query("fire\"ball"), "\"fire\"\"ball\"");
    }

    #[test]
    fn test_empty_query_returns_empty_string() {
        assert_eq!(build_fts_query(""), "");
    }

    #[test]
    fn test_whitespace_only_query_returns_empty_string() {
        assert_eq!(build_fts_query("   "), "");
    }

    #[test]
    fn test_advanced_mode_special_chars_escaped_in_phrase() {
        // Special chars inside content tokens in advanced mode must be escaped.
        assert_eq!(
            build_fts_query("fire\"ball AND ice"),
            "\"fire\"\"ball\" AND \"ice\""
        );
    }

    #[test]
    fn test_malicious_fts_payload_is_wrapped_as_single_phrase() {
        assert_eq!(
            build_fts_query("'; DROP TABLE spell;--"),
            "\"'; DROP TABLE spell;--\""
        );
    }

    // -----------------------------------------------------------------------
    // escape_like_value — unit tests
    // -----------------------------------------------------------------------

    use super::escape_like_value;

    #[test]
    fn test_escape_like_value_percent() {
        assert_eq!(escape_like_value("100%"), "100\\%");
    }

    #[test]
    fn test_escape_like_value_underscore() {
        assert_eq!(escape_like_value("fire_ball"), "fire\\_ball");
    }

    #[test]
    fn test_escape_like_value_backslash() {
        assert_eq!(escape_like_value("C:\\path"), "C:\\\\path");
    }

    /// Verifies that backslash is escaped before wildcards, preventing double-escaping:
    /// e.g. `%` → `\%`, `_` → `\_`, `\` → `\\`.
    #[test]
    fn test_escape_like_value_combined() {
        assert_eq!(
            escape_like_value("50% off_sale\\deal"),
            "50\\% off\\_sale\\\\deal"
        );
    }

    #[test]
    fn test_escape_like_value_no_wildcards() {
        assert_eq!(escape_like_value("Evocation"), "Evocation");
    }

    // -----------------------------------------------------------------------
    // Integration tests: build_fts_query + actual FTS5 search behaviour
    // -----------------------------------------------------------------------

    /// Creates an in-memory DB with the full `spell` table (all columns used by
    /// `search_keyword_with_conn`) plus the migration-0014 FTS schema.
    fn setup_search_db() -> Connection {
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
                school           TEXT DEFAULT '',
                sphere           TEXT DEFAULT '',
                level            INTEGER DEFAULT 0,
                class_list       TEXT DEFAULT '',
                components       TEXT DEFAULT '',
                duration         TEXT DEFAULT '',
                is_quest_spell   INTEGER DEFAULT 0,
                is_cantrip       INTEGER DEFAULT 0,
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

    fn insert_spell(conn: &Connection, id: i64, name: &str, description: &str) {
        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) VALUES (?, ?, ?, NULL)",
            rusqlite::params![id, name, description],
        )
        .unwrap();
    }

    fn search_ids(conn: &Connection, query: &str) -> Vec<i64> {
        use super::search_keyword_with_conn;
        search_keyword_with_conn(conn, query, None)
            .unwrap()
            .into_iter()
            .map(|s| s.id)
            .collect()
    }

    /// Verification plan test 2: a single-token query must match spells whose
    /// name/description contains that token and NOT match unrelated spells.
    #[test]
    fn test_search_single_token_matches_relevant_spell() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fireball", "A blazing orb of fire");
        insert_spell(&conn, 2, "Frostbolt", "A shard of ice and frost");
        let ids = search_ids(&conn, "fire");
        assert!(
            ids.contains(&1),
            "'Fireball' must match single-token query 'fire'"
        );
        assert!(
            !ids.contains(&2),
            "'Frostbolt' must NOT match single-token query 'fire'"
        );
    }

    /// Searching with lowercase "and" activates basic mode (phrase search).
    /// "Fire and Ice" should be returned because its description contains the
    /// phrase "fire and ice".
    #[test]
    fn test_search_basic_mode_lowercase_and_matches_phrase() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fire and Ice", "A spell of fire and ice");
        insert_spell(&conn, 2, "Fire Shield", "A shield wreathed in fire");

        let ids = search_ids(&conn, "fire and ice");
        assert!(
            ids.contains(&1),
            "'Fire and Ice' should match phrase 'fire and ice'"
        );
        assert!(
            !ids.contains(&2),
            "'Fire Shield' must NOT appear: phrase 'fire and ice' should not match it"
        );
    }

    /// Searching with uppercase "AND NOT" activates advanced mode.
    /// "AND NOT" is collapsed to "NOT" (FTS5's NOT is already an infix AND-NOT operator).
    /// "Fire Shield" contains "fire" but NOT "ice", so it should match.
    /// "Fire and Ice" contains both "fire" and "ice", so it must NOT match.
    #[test]
    fn test_search_advanced_mode_and_not_excludes_term() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fire Shield", "A blazing shield of fire");
        insert_spell(&conn, 2, "Fire and Ice", "A spell of fire and ice");

        let ids = search_ids(&conn, "fire AND NOT ice");
        assert!(
            ids.contains(&1),
            "'Fire Shield' should match 'fire AND NOT ice'"
        );
        assert!(
            !ids.contains(&2),
            "'Fire and Ice' must NOT match 'fire AND NOT ice' (contains 'ice')"
        );
    }

    /// "fire NEAR shield" must activate basic mode (NEAR is not a recognised
    /// boolean), so the entire string is treated as a single phrase search.
    /// No spell has the literal adjacent phrase "fire NEAR shield" in its text,
    /// so the result should be empty.
    #[test]
    fn test_search_near_always_basic_mode() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fire Shield", "A shield wreathed in fire");
        insert_spell(&conn, 2, "Fireball", "An orb of fire near the enemy");

        // The literal phrase "fire NEAR shield" appears in neither description.
        let ids = search_ids(&conn, "fire NEAR shield");
        assert!(
            ids.is_empty(),
            "NEAR should be treated as literal text (basic mode phrase), not an FTS5 operator"
        );
    }

    /// An empty query must skip the FTS JOIN path and return results from the
    /// non-FTS SELECT (ordered by name). Verifies the `has_text_query` guard.
    #[test]
    fn test_search_empty_query_returns_results_without_fts() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fireball", "A blazing orb of fire");
        let ids = search_ids(&conn, "");
        assert!(
            ids.contains(&1),
            "empty query should return spells via non-FTS path"
        );
    }

    /// Verify the FTS JOIN path works correctly when a school filter is applied
    /// alongside a text query.  Only the spell that matches BOTH the text search
    /// AND the school filter should be returned.
    #[test]
    fn test_search_fts_with_school_filter() {
        use super::search_keyword_with_conn;
        use crate::models::SearchFilters;

        let conn = setup_search_db();

        // Spell 1: matches text "fire" and is Evocation.
        conn.execute(
            "INSERT INTO spell (id, name, description, school, canonical_data) \
             VALUES (1, 'Fireball', 'A blazing ball of fire', 'Evocation', NULL)",
            [],
        )
        .unwrap();

        // Spell 2: matches text "fire" but is Conjuration — should be excluded.
        conn.execute(
            "INSERT INTO spell (id, name, description, school, canonical_data) \
             VALUES (2, 'Fire Summoning', 'Calls a creature of fire', 'Conjuration', NULL)",
            [],
        )
        .unwrap();

        let filters = SearchFilters {
            schools: Some(vec!["Evocation".to_string()]),
            spheres: None,
            level_min: None,
            level_max: None,
            class_list: None,
            source: None,
            components: None,
            tags: None,
            is_quest_spell: None,
            is_cantrip: None,
        };

        let results = search_keyword_with_conn(&conn, "fire", Some(filters)).unwrap();
        let ids: Vec<i64> = results.into_iter().map(|s| s.id).collect();

        assert!(
            ids.contains(&1),
            "Fireball (Evocation) should match both text 'fire' and school filter"
        );
        assert!(
            !ids.contains(&2),
            "Fire Summoning (Conjuration) should be excluded by the school filter"
        );
    }

    #[test]
    fn test_search_malicious_fts_payload_does_not_mutate_spell_table() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fireball", "A blazing orb of fire");

        let ids = search_ids(&conn, "'; DROP TABLE spell;--");
        assert!(
            ids.is_empty(),
            "malicious punctuation-heavy payload should execute safely as a bound MATCH phrase"
        );

        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 1, "spell table must remain intact after search");
    }

    #[test]
    fn test_search_malformed_operator_payload_falls_back_to_literal_phrase() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Literal", "Incantation fire AND OR ice appears verbatim");
        insert_spell(&conn, 2, "Split Terms", "fire and ice appear separately");

        let ids = search_ids(&conn, "fire AND OR ice");
        assert!(
            ids.contains(&1),
            "malformed operator payload should fall back to a literal phrase search"
        );
        assert!(
            !ids.contains(&2),
            "fallback phrase search must not behave like an injected boolean expression"
        );
    }

    #[test]
    fn test_search_source_filter_treats_like_wildcards_as_literals() {
        use super::search_keyword_with_conn;
        use crate::models::SearchFilters;

        let conn = setup_search_db();
        conn.execute(
            "INSERT INTO spell (id, name, description, source, canonical_data) \
             VALUES (1, 'Escaped Source', 'Keeps literal wildcards', 'Guild_Archive%Vol\\1', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, source, canonical_data) \
             VALUES (2, 'Wildcard Decoy', 'Would only match if LIKE wildcards leaked', 'GuildXArchiveYVol1', NULL)",
            [],
        )
        .unwrap();

        let filters = SearchFilters {
            schools: None,
            spheres: None,
            level_min: None,
            level_max: None,
            class_list: None,
            source: Some("Guild_Archive%Vol\\1".to_string()),
            components: None,
            tags: None,
            is_quest_spell: None,
            is_cantrip: None,
        };

        let ids: Vec<i64> = search_keyword_with_conn(&conn, "", Some(filters))
            .unwrap()
            .into_iter()
            .map(|spell| spell.id)
            .collect();

        assert!(
            ids.contains(&1),
            "LIKE filter should match the literal %, _, and \\ characters"
        );
        assert!(
            !ids.contains(&2),
            "LIKE filter must not treat user input wildcards as SQL wildcards"
        );
    }

    #[test]
    fn test_search_advanced_mode_payload_does_not_mutate_spell_table() {
        let conn = setup_search_db();
        insert_spell(&conn, 1, "Fireball", "A blazing orb of fire and ice");

        let ids = search_ids(&conn, "fire AND ice'); DROP TABLE spell;--");
        assert!(
            ids.is_empty(),
            "advanced-mode payload should execute safely as bound MATCH input and return no rows"
        );

        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            row_count, 1,
            "spell table must remain intact after advanced-mode search payload"
        );
    }

    #[test]
    fn test_search_text_query_with_wildcard_heavy_source_filter_is_safe_on_join_path() {
        use super::search_keyword_with_conn;
        use crate::models::SearchFilters;

        let conn = setup_search_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, source, canonical_data) \
             VALUES (1, 'Bound Match', 'fire rune ward', 'Guild_Archive%Vol\\1', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, source, canonical_data) \
             VALUES (2, 'Wildcard Leak Decoy', 'fire rune ward', 'GuildXArchiveYVol1', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, source, canonical_data) \
             VALUES (3, 'Filter Only Decoy', 'ice rune ward', 'Guild_Archive%Vol\\1', NULL)",
            [],
        )
        .unwrap();

        let filters = SearchFilters {
            schools: None,
            spheres: None,
            level_min: None,
            level_max: None,
            class_list: None,
            source: Some("Guild_Archive%Vol\\1".to_string()),
            components: None,
            tags: None,
            is_quest_spell: None,
            is_cantrip: None,
        };

        let ids: Vec<i64> = search_keyword_with_conn(&conn, "fire AND rune", Some(filters))
            .unwrap()
            .into_iter()
            .map(|spell| spell.id)
            .collect();

        assert!(
            ids.contains(&1),
            "combined FTS + LIKE path should match the row with both the text query and literal source"
        );
        assert!(
            !ids.contains(&2),
            "combined path must not treat %, _, or \\ in the source filter as SQL wildcards"
        );
        assert!(
            !ids.contains(&3),
            "combined path must still enforce the text query when the JOIN path is active"
        );
    }

    #[test]
    fn test_search_ignores_empty_school_and_sphere_entries_in_filter_lists() {
        use super::search_keyword_with_conn;
        use crate::models::SearchFilters;

        let conn = setup_search_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, school, sphere, canonical_data) \
             VALUES (1, 'Exact Match', 'fire sigil', 'Evocation', 'Combat', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, school, sphere, canonical_data) \
             VALUES (2, 'Wrong School', 'fire sigil', 'Conjuration', 'Combat', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, school, sphere, canonical_data) \
             VALUES (3, 'Wrong Sphere', 'fire sigil', 'Evocation', 'Healing', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, school, sphere, canonical_data) \
             VALUES (4, 'Wrong Both', 'fire sigil', 'Alteration', 'Weather', NULL)",
            [],
        )
        .unwrap();

        let filters = SearchFilters {
            schools: Some(vec![String::new(), "Evocation".to_string()]),
            spheres: Some(vec![String::new(), "Combat".to_string()]),
            level_min: None,
            level_max: None,
            class_list: None,
            source: None,
            components: None,
            tags: None,
            is_quest_spell: None,
            is_cantrip: None,
        };

        let ids: Vec<i64> = search_keyword_with_conn(&conn, "fire", Some(filters))
            .unwrap()
            .into_iter()
            .map(|spell| spell.id)
            .collect();

        assert_eq!(
            ids,
            vec![1],
            "empty school/sphere entries must be ignored instead of expanding the filter with LIKE '%%'"
        );
    }

    #[test]
    fn test_search_text_query_results_preserve_observable_bm25_ordering() {
        use super::{build_fts_query, search_keyword_with_conn};

        let conn = setup_search_db();

        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (1, 'Zulu Compact', 'fire rune', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (2, 'Alpha Verbose', 'fire rune ember ember ember ember ember ember ember ember ember ember ember ember', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, canonical_data) \
             VALUES (3, 'Beta Verbose', 'fire rune cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder cinder', NULL)",
            [],
        )
        .unwrap();

        let match_query = build_fts_query("fire AND rune");
        let mut stmt = conn
            .prepare(
                "SELECT s.id, bm25(spell_fts) AS rank \
                 FROM spell s \
                 JOIN spell_fts ON spell_fts.rowid = s.id \
                 WHERE spell_fts MATCH ? \
                 ORDER BY rank ASC",
            )
            .unwrap();
        let expected_ids: Vec<i64> = stmt
            .query_map([match_query], |row| row.get::<_, i64>(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();

        let alphabetical_ids: Vec<i64> = conn
            .prepare("SELECT id FROM spell ORDER BY name ASC")
            .unwrap()
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();

        assert_ne!(
            expected_ids, alphabetical_ids,
            "test fixture must keep bm25 ordering distinguishable from name ordering"
        );

        let ids: Vec<i64> = search_keyword_with_conn(&conn, "fire AND rune", None)
            .unwrap()
            .into_iter()
            .map(|spell| spell.id)
            .collect();

        assert_eq!(ids, expected_ids,
            "text-query results must match the direct bm25-ranked ordering for the same MATCH term"
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
