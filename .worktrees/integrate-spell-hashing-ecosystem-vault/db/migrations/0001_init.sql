PRAGMA foreign_keys = ON;

-- Core entities
CREATE TABLE IF NOT EXISTS spell (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT,
  sphere TEXT,
  class_list TEXT,            -- JSON array string of classes
  level INTEGER NOT NULL,
  range TEXT,
  components TEXT,            -- e.g., "V,S,M"
  material_components TEXT,
  casting_time TEXT,
  duration TEXT,
  area TEXT,
  saving_throw TEXT,
  reversible INTEGER DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT,                  -- JSON array string
  source TEXT,
  edition TEXT DEFAULT 'AD&D 2e',
  author TEXT,
  license TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT
);

-- FTS5 index
CREATE VIRTUAL TABLE IF NOT EXISTS spell_fts USING fts5(
  name, description, material_components, tags, source, content='spell', content_rowid='id'
);

-- FTS triggers
CREATE TRIGGER IF NOT EXISTS spell_ai AFTER INSERT ON spell BEGIN
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source);
END;
CREATE TRIGGER IF NOT EXISTS spell_ad AFTER DELETE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source)
  VALUES('delete', old.id, '', '', '', '', '');
END;
CREATE TRIGGER IF NOT EXISTS spell_au AFTER UPDATE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source)
  VALUES('delete', old.id, '', '', '', '', '');
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source);
END;

-- Embeddings table via sqlite-vec (load extension at runtime)
CREATE VIRTUAL TABLE IF NOT EXISTS spell_vec USING vec0(
  rowid INTEGER PRIMARY KEY,
  v float[384]
);



CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  changed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  actor TEXT DEFAULT 'local'
);

-- Characters & spellbooks
CREATE TABLE IF NOT EXISTS "character" (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS spellbook (
  character_id INTEGER REFERENCES "character"(id) ON DELETE CASCADE,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  prepared INTEGER DEFAULT 0,
  known INTEGER DEFAULT 1,
  notes TEXT,
  PRIMARY KEY(character_id, spell_id)
);
