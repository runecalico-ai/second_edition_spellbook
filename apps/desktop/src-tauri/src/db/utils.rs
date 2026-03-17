use rusqlite::Connection;

/// Returns true if `column` exists on `table` in the given SQLite connection.
/// Used during the schema-migration transition period (migration 0015) where
/// callers branch on whether `spell_content_hash` columns have been added yet.
pub fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    conn.query_row(&sql, [column], |_| Ok(())).is_ok()
}
