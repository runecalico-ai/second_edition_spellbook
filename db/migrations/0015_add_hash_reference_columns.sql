UPDATE character_class_spell
SET spell_content_hash = (
    SELECT spell.content_hash
    FROM spell
    WHERE spell.id = character_class_spell.spell_id
)
WHERE spell_content_hash IS NULL;
CREATE INDEX IF NOT EXISTS idx_character_class_spell_content_hash
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
