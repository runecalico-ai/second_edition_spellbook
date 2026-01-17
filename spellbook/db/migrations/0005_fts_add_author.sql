-- Rebuild FTS5 table to include author field
DROP TRIGGER IF EXISTS spell_ai;
DROP TRIGGER IF EXISTS spell_ad;
DROP TRIGGER IF EXISTS spell_au;
DROP TABLE IF EXISTS spell_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS spell_fts USING fts5(
  name, description, material_components, tags, source, author, content='spell', content_rowid='id'
);

-- Re-populate FTS from existing spells
INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author)
SELECT id, name, description, material_components, tags, source, author FROM spell;

-- Recreate triggers with author
CREATE TRIGGER spell_ai AFTER INSERT ON spell BEGIN
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author);
END;
CREATE TRIGGER spell_ad AFTER DELETE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author)
  VALUES('delete', old.id, '', '', '', '', '', '');
END;
CREATE TRIGGER spell_au AFTER UPDATE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author)
  VALUES('delete', old.id, '', '', '', '', '', '');
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author);
END;

PRAGMA user_version = 5;
