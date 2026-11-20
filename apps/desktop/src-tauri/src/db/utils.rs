use rusqlite::{Connection, OptionalExtension};

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

/// True when `spell_vec` is the sqlite-vec `vec0` virtual table rather than the
/// blob-backed fallback that migration 0001 creates when vec0 is missing.
pub fn spell_vec_is_vec0(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'spell_vec'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|sql| sql.contains("vec0") || sql.contains("float["))
    .unwrap_or(false)
}

pub fn get_app_meta(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
}

pub fn set_app_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_meta(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn load_static_sqlite_vec_for_test(conn: &Connection) {
    type VecInit = unsafe extern "C" fn(
        *mut rusqlite::ffi::sqlite3,
        *mut *mut std::os::raw::c_char,
        *const std::ffi::c_void,
    ) -> std::os::raw::c_int;
    // SAFETY: sqlite-vec is compiled with SQLITE_CORE, so the API-routines pointer is unused.
    let rc = unsafe {
        let init =
            std::mem::transmute::<*const (), VecInit>(sqlite_vec::sqlite3_vec_init as *const ());
        init(conn.handle(), std::ptr::null_mut(), std::ptr::null())
    };
    assert_eq!(
        rc,
        rusqlite::ffi::SQLITE_OK,
        "sqlite-vec static init failed"
    );
}
