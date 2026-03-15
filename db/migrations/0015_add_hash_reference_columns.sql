-- Migration 0015 (phase 2)
-- Column creation for spell_content_hash is performed in load_migrations()
-- before this SQL is executed so the migration remains idempotent on upgraded DBs.
--
-- Artifact table: artifact.hash is the artifact file content hash; artifact.spell_content_hash
-- is the referenced spell's canonical content hash (Decision #5).

UPDATE character_class_spell
SET spell_content_hash = (
    SELECT spell.content_hash
    FROM spell
    WHERE spell.id = character_class_spell.spell_id
)
WHERE spell_content_hash IS NULL;
-- Partial index for hash lookups only; NULLs are legacy/transitional.
CREATE INDEX IF NOT EXISTS idx_ccs_spell_content_hash
ON character_class_spell(spell_content_hash)
WHERE spell_content_hash IS NOT NULL;

UPDATE artifact
SET spell_content_hash = (
    SELECT spell.content_hash
    FROM spell
    WHERE spell.id = artifact.spell_id
)
WHERE spell_content_hash IS NULL
  AND spell_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifact_spell_content_hash
ON artifact(spell_content_hash)
WHERE spell_content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_character_hash_list
ON character_class_spell(character_class_id, spell_content_hash, list_type)
WHERE spell_content_hash IS NOT NULL;
