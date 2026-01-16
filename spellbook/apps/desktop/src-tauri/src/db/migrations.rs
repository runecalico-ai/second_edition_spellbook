use crate::error::AppError;
use rusqlite::Connection;

pub fn load_migrations(conn: &Connection) -> Result<(), AppError> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

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
                    eprintln!(
                        "sqlite-vec: vec0 module unavailable; falling back to blob-backed spell_vec table."
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

    Ok(())
}
