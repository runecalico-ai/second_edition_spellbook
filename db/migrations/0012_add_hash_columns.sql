ALTER TABLE spell ADD COLUMN canonical_data TEXT;
ALTER TABLE spell ADD COLUMN content_hash TEXT;
CREATE UNIQUE INDEX idx_spell_content_hash ON spell(content_hash) WHERE content_hash IS NOT NULL;
