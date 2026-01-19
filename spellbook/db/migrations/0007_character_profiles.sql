-- Migration: Add Character Profiles Foundation
-- Part 1 of 3

-- 1. Add columns to "character" table
ALTER TABLE "character" ADD COLUMN race TEXT;
ALTER TABLE "character" ADD COLUMN alignment TEXT;
ALTER TABLE "character" ADD COLUMN com_enabled INTEGER DEFAULT 0;
ALTER TABLE "character" ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "character" ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 2. Create "character_ability" table
CREATE TABLE IF NOT EXISTS character_ability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL UNIQUE,
    str INTEGER DEFAULT 10,
    dex INTEGER DEFAULT 10,
    con INTEGER DEFAULT 10,
    int INTEGER DEFAULT 10,
    wis INTEGER DEFAULT 10,
    cha INTEGER DEFAULT 10,
    com INTEGER DEFAULT 10,
    FOREIGN KEY(character_id) REFERENCES "character"(id) ON DELETE CASCADE
);

-- 3. Create "character_class" table
CREATE TABLE IF NOT EXISTS character_class (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    FOREIGN KEY(character_id) REFERENCES "character"(id) ON DELETE CASCADE
);

-- 4. Create "character_class_spell" table
-- Note: list_type should be 'KNOWN' or 'PREPARED'
CREATE TABLE IF NOT EXISTS character_class_spell (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_class_id INTEGER NOT NULL,
    spell_id INTEGER NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('KNOWN', 'PREPARED')),
    notes TEXT,
    FOREIGN KEY(character_class_id) REFERENCES character_class(id) ON DELETE CASCADE,
    FOREIGN KEY(spell_id) REFERENCES spell(id) ON DELETE CASCADE,
    UNIQUE(character_class_id, spell_id, list_type)
);

-- 5. Add indexes
CREATE INDEX IF NOT EXISTS idx_char_name ON "character"(name);
CREATE INDEX IF NOT EXISTS idx_char_class ON character_class(character_id, class_name);
CREATE INDEX IF NOT EXISTS idx_ccs_list ON character_class_spell(character_class_id, list_type);

-- 6. Legacy Migration Logic
-- For existing characters in legacy 'spellbook' table,
-- create a default 'Mage' class and migrate their spells.
INSERT INTO character_class (character_id, class_name, level)
SELECT DISTINCT character_id, 'Mage', 1
FROM spellbook;

INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
SELECT cc.id, sb.spell_id,
       CASE WHEN sb.known != 0 THEN 'KNOWN' ELSE 'PREPARED' END,
       sb.notes
FROM spellbook sb
JOIN character_class cc ON cc.character_id = sb.character_id AND cc.class_name = 'Mage';

-- Migrate PREPARED spells if they weren't also KNOWN (avoiding unique constraint violation)
-- Actually, the logic above only handles one list_type per spell.
-- Let's do it properly: migrate KNOWN spells first, then PREPARED if different.

DELETE FROM character_class_spell; -- Reset for robust migration

INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
SELECT cc.id, sb.spell_id, 'KNOWN', sb.notes
FROM spellbook sb
JOIN character_class cc ON cc.character_id = sb.character_id AND cc.class_name = 'Mage'
WHERE sb.known != 0;

INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
SELECT cc.id, sb.spell_id, 'PREPARED', sb.notes
FROM spellbook sb
JOIN character_class cc ON cc.character_id = sb.character_id AND cc.class_name = 'Mage'
WHERE sb.prepared != 0;

-- 7. Deprecation Notice (in schema)
-- The 'spellbook' table is now DEPRECATED. Use 'character_class_spell' instead.
