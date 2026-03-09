-- Drop and recreate FTS table to include author
DROP TABLE IF EXISTS spell_fts;
CREATE VIRTUAL TABLE spell_fts USING fts5(
  name, description, material_components, tags, source, author, content='spell', content_rowid='id'
);

-- Recreate triggers for FTS sync
DROP TRIGGER IF EXISTS spell_ai;
CREATE TRIGGER spell_ai AFTER INSERT ON spell BEGIN
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author);
END;

DROP TRIGGER IF EXISTS spell_ad;
CREATE TRIGGER spell_ad AFTER DELETE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author)
  VALUES('delete', old.id, '', '', '', '', '', '');
END;

DROP TRIGGER IF EXISTS spell_au;
CREATE TRIGGER spell_au AFTER UPDATE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author)
  VALUES('delete', old.id, '', '', '', '', '', '');
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author);
END;

-- Saved Search table
CREATE TABLE IF NOT EXISTS saved_search (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
