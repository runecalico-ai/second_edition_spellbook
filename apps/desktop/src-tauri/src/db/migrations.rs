use crate::error::AppError;
use rusqlite::Connection;
use tracing::{info, warn};

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    conn.query_row(&sql, [column], |_| Ok(())).is_ok()
}

/// Applies migration 0015: hash reference columns and indexes.
///
/// Column creation happens here (not in the SQL file) so we can run ADD COLUMN
/// only when missing, keeping the migration idempotent on DBs that were
/// partially upgraded. The SQL file (phase 2) assumes these columns already
/// exist and only runs backfills and index creation. The expected non-unique
/// index on character_class_spell(spell_content_hash) is
/// `idx_ccs_spell_content_hash`.
fn apply_hash_reference_columns_migration(conn: &Connection) -> Result<(), AppError> {
    if !has_column(conn, "character_class_spell", "spell_content_hash") {
        conn.execute(
            "ALTER TABLE character_class_spell ADD COLUMN spell_content_hash TEXT",
            [],
        )?;
    }
    if !has_column(conn, "artifact", "spell_content_hash") {
        conn.execute(
            "ALTER TABLE artifact ADD COLUMN spell_content_hash TEXT",
            [],
        )?;
    }

    let sql = include_str!("../../../../../db/migrations/0015_add_hash_reference_columns.sql");
    conn.execute_batch(sql)?;
    Ok(())
}

pub fn load_migrations(conn: &Connection) -> Result<(), AppError> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    info!(version, "DB migration start");

    if version < 1 {
        let sql = include_str!("../../../../../db/migrations/0001_init.sql");
        match conn.execute_batch(sql) {
            Ok(()) => Ok(()),
            Err(err) => {
                let message = err.to_string();
                if message.contains("no such module: vec0") {
                    let fallback = sql
                        .replace(
                            "VIRTUAL TABLE IF NOT EXISTS spell_vec USING vec0",
                            "TABLE IF NOT EXISTS spell_vec",
                        )
                        .replace("v float[384]", "v BLOB");
                    warn!(
                        "sqlite-vec vec0 unavailable; falling back to blob-backed spell_vec table"
                    );
                    conn.execute_batch(&fallback)?;
                    Ok(())
                } else {
                    Err(AppError::Database(err))
                }
            }
        }?;
        conn.execute("PRAGMA user_version = 1", [])?;
    }

    if version < 2 {
        let sql = include_str!("../../../../../db/migrations/0002_add_character_type.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 2", [])?;
    }

    if version < 3 {
        let sql = include_str!("../../../../../db/migrations/0003_milestone_3_updates.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 3", [])?;
    }

    if version < 4 {
        let sql = include_str!("../../../../../db/migrations/0004_add_quest_spells.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 4", [])?;
    }

    if version < 5 {
        let sql = include_str!("../../../../../db/migrations/0005_fts_add_author.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 5", [])?;
    }

    if version < 6 {
        info!("Applying migration 0006");
        let sql = include_str!("../../../../../db/migrations/0006_add_cantrip_flag.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 6", [])?;
    }

    if version < 7 {
        info!("Applying migration 0007");
        let sql = include_str!("../../../../../db/migrations/0007_character_profiles.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 7", [])?;
    }
    if version < 8 {
        info!("Applying migration 0008");
        let sql = include_str!("../../../../../db/migrations/0008_character_class_label.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 8", [])?;
    }
    if version < 9 {
        info!("Applying migration 0009");
        let sql = include_str!("../../../../../db/migrations/0009_add_artifact_table.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 9", [])?;
    }
    if version < 10 {
        info!("Applying migration 0010");
        let sql = include_str!("../../../../../db/migrations/0010_character_fts_and_indexes.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 10", [])?;
    }
    if version < 11 {
        info!("Applying migration 0011");
        let sql = include_str!("../../../../../db/migrations/0011_add_spell_schema_version.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 11", [])?;
    }

    if version < 12 {
        info!("Applying migration 0012");
        let sql = include_str!("../../../../../db/migrations/0012_add_hash_columns.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 12", [])?;
    }

    if version < 13 {
        info!("Applying migration 0013");
        let sql = include_str!("../../../../../db/migrations/0013_add_mechanics_columns.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 13", [])?;
    }

    if version < 14 {
        info!("Applying migration 0014");
        let sql = include_str!("../../../../../db/migrations/0014_fts_extend_canonical.sql");
        conn.execute_batch(sql)?;
        conn.execute("PRAGMA user_version = 14", [])?;
    }

    if version < 15 {
        info!("Applying migration 0015");
        apply_hash_reference_columns_migration(conn)?;
        conn.execute("PRAGMA user_version = 15", [])?;
    }

    info!(version = 15, "DB migration complete");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_0015_creates_task_5_index_names() {
        let conn = Connection::open_in_memory().expect("open db");
        load_migrations(&conn).expect("load migrations");

        let index_names: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (?, ?, ?)")
            .expect("prepare")
            .query_map(
                rusqlite::params![
                    "idx_ccs_spell_content_hash",
                    "idx_ccs_character_hash_list",
                    "idx_artifact_spell_content_hash",
                ],
                |row| row.get(0),
            )
            .expect("query")
            .filter_map(Result::ok)
            .collect();

        assert!(
            index_names.contains(&"idx_ccs_spell_content_hash".to_string()),
            "sqlite_master must contain idx_ccs_spell_content_hash, got: {:?}",
            index_names
        );
        assert!(
            index_names.contains(&"idx_ccs_character_hash_list".to_string()),
            "sqlite_master must contain idx_ccs_character_hash_list, got: {:?}",
            index_names
        );
        assert!(
            index_names.contains(&"idx_artifact_spell_content_hash".to_string()),
            "sqlite_master must contain idx_artifact_spell_content_hash, got: {:?}",
            index_names
        );
    }

    #[test]
    fn test_load_migrations_adds_hash_reference_columns() {
        let conn = Connection::open_in_memory().expect("open db");

        load_migrations(&conn).expect("load migrations");

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("query user_version");

        assert_eq!(version, 15);
        assert!(has_column(
            &conn,
            "character_class_spell",
            "spell_content_hash"
        ));
        assert!(has_column(&conn, "artifact", "spell_content_hash"));

        let index_exists = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_ccs_character_hash_list'",
                [],
                |row| row.get::<_, i32>(0),
            )
            .is_ok();
        assert!(
            index_exists,
            "idx_ccs_character_hash_list must exist after migration 0015"
        );
    }

    #[test]
    fn test_migration_0015_backfills_existing_hash_references() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_hash TEXT
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                hash TEXT NOT NULL,
                spell_id INTEGER,
                path TEXT,
                metadata TEXT,
                imported_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            PRAGMA user_version = 14;

            INSERT INTO spell (id, content_hash) VALUES (1, 'hash-1');
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
            VALUES (7, 1, 'KNOWN', NULL);
            INSERT INTO artifact (type, hash, spell_id, path, metadata, imported_at)
            VALUES ('source', 'artifact-hash', 1, 'spell.md', NULL, '2026-03-08T00:00:00Z');
            "#,
        )
        .expect("seed version 14 schema");

        load_migrations(&conn).expect("apply migration 0015");

        let character_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character hash");
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash");

        assert_eq!(character_hash, "hash-1");
        assert_eq!(artifact_hash, "hash-1");
    }

    /// Orphan character_class_spell row (spell_id points to non-existent spell) keeps
    /// spell_content_hash NULL after migration; backfill subquery returns NULL.
    #[test]
    fn test_migration_0015_orphan_spell_id_keeps_hash_null() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (id INTEGER PRIMARY KEY AUTOINCREMENT, content_hash TEXT);
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                hash TEXT NOT NULL,
                spell_id INTEGER,
                path TEXT,
                metadata TEXT,
                imported_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            PRAGMA user_version = 14;

            INSERT INTO spell (id, content_hash) VALUES (1, 'hash-1');
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
            VALUES (7, 1, 'KNOWN', NULL), (8, 999, 'KNOWN', NULL);
            "#,
        )
        .expect("seed version 14 with orphan spell_id=999");

        load_migrations(&conn).expect("apply migration 0015");

        let orphan_hash: Option<String> = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE character_class_id = 8 AND spell_id = 999",
                [],
                |row| row.get(0),
            )
            .expect("query orphan row");
        assert!(
            orphan_hash.is_none(),
            "orphan row (spell_id=999) must keep spell_content_hash NULL, got {:?}",
            orphan_hash
        );
    }

    /// Backfill only updates WHERE spell_content_hash IS NULL; pre-set hash is preserved.
    #[test]
    fn test_migration_0015_backfill_does_not_overwrite_existing_hash() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (id INTEGER PRIMARY KEY AUTOINCREMENT, content_hash TEXT);
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT,
                spell_content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                hash TEXT NOT NULL,
                spell_id INTEGER,
                path TEXT,
                metadata TEXT,
                imported_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                spell_content_hash TEXT
            );
            PRAGMA user_version = 14;

            INSERT INTO spell (id, content_hash) VALUES (1, 'hash-1');
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash)
            VALUES (7, 1, 'KNOWN', NULL, 'existing');
            "#,
        )
        .expect("seed version 14 with pre-set spell_content_hash");

        load_migrations(&conn).expect("apply migration 0015");

        let preserved: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE character_class_id = 7",
                [],
                |row| row.get(0),
            )
            .expect("query row");
        assert_eq!(
            preserved, "existing",
            "backfill must not overwrite existing spell_content_hash"
        );
    }

    #[test]
    fn test_migration_0015_is_idempotent_when_columns_already_exist() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_hash TEXT
            );
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                notes TEXT,
                spell_content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                hash TEXT NOT NULL,
                spell_id INTEGER,
                path TEXT,
                metadata TEXT,
                imported_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                spell_content_hash TEXT
            );
            PRAGMA user_version = 14;
            "#,
        )
        .expect("seed version 14 schema with hash columns");

        load_migrations(&conn).expect("apply idempotent migration 0015");

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("query user_version");
        assert_eq!(version, 15);
        assert!(has_column(
            &conn,
            "character_class_spell",
            "spell_content_hash"
        ));
        assert!(has_column(&conn, "artifact", "spell_content_hash"));
    }
}
