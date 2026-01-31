ALTER TABLE spell
ADD COLUMN schema_version INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_spell_schema_version ON spell(schema_version);
