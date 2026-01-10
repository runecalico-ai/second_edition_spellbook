import sqlite3
from pathlib import Path


def test_migration_creates_tables(tmp_path: Path):
    db_path = tmp_path / "spellbook.sqlite3"
    conn = sqlite3.connect(db_path)
    sql = (Path(__file__).resolve().parents[1] / "migrations" / "0001_init.sql").read_text(
        encoding="utf-8"
    )
    try:
        conn.executescript(sql)
    except sqlite3.OperationalError as exc:
        if "no such module: vec0" not in str(exc):
            raise
        sql = sql.replace(
            "CREATE VIRTUAL TABLE IF NOT EXISTS spell_vec USING vec0(\n  rowid INTEGER PRIMARY KEY,\n  v float[384]\n);\n",
            "CREATE TABLE IF NOT EXISTS spell_vec (rowid INTEGER PRIMARY KEY, v BLOB);\n",
        )
        conn.executescript(sql)

    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
    names = {row[0] for row in cursor.fetchall()}

    assert "spell" in names
    assert "spell_fts" in names
    assert "artifact" in names
    assert "change_log" in names
    assert "character" in names
    assert "spellbook" in names
