-- Migration: Character FTS and Search Indexes
-- Part 3 implementation

-- 1. Create FTS5 Virtual Table for characters
CREATE VIRTUAL TABLE IF NOT EXISTS character_fts USING fts5(
    name,
    notes,
    content='character',
    content_rowid='id'
);

-- 2. Create triggers to keep character_fts in sync
CREATE TRIGGER IF NOT EXISTS character_ai AFTER INSERT ON "character" BEGIN
  INSERT INTO character_fts(rowid, name, notes) VALUES (new.id, new.name, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS character_ad AFTER DELETE ON "character" BEGIN
  INSERT INTO character_fts(character_fts, rowid, name, notes) VALUES('delete', old.id, old.name, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS character_au AFTER UPDATE ON "character" BEGIN
  INSERT INTO character_fts(character_fts, rowid, name, notes) VALUES('delete', old.id, old.name, old.notes);
  INSERT INTO character_fts(rowid, name, notes) VALUES (new.id, new.name, new.notes);
END;

-- 3. Populate FTS table with existing data
INSERT INTO character_fts(rowid, name, notes)
SELECT id, name, notes FROM "character";

-- 4. Add performance indexes for character filters
CREATE INDEX IF NOT EXISTS idx_char_type ON "character"(type);
CREATE INDEX IF NOT EXISTS idx_char_race ON "character"(race);
CREATE INDEX IF NOT EXISTS idx_char_alignment ON "character"(alignment);

-- 5. Add performance indexes for ability filters
CREATE INDEX IF NOT EXISTS idx_ca_str ON character_ability(str);
CREATE INDEX IF NOT EXISTS idx_ca_dex ON character_ability(dex);
CREATE INDEX IF NOT EXISTS idx_ca_con ON character_ability(con);
CREATE INDEX IF NOT EXISTS idx_ca_int ON character_ability(int);
CREATE INDEX IF NOT EXISTS idx_ca_wis ON character_ability(wis);
CREATE INDEX IF NOT EXISTS idx_ca_cha ON character_ability(cha);
CREATE INDEX IF NOT EXISTS idx_ca_com ON character_ability(com);
