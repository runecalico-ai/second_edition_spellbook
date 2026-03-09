-- Migration 0014: Extend spell_fts with canonical text fields from canonical_data JSON.
-- Drops old FTS5 table and triggers, recreates with 14 columns.
-- Fixes the stale-entry bug in DELETE/UPDATE triggers by passing old.* values
-- (including json_extract(old.canonical_data, ...)) instead of empty strings.

DROP TRIGGER IF EXISTS spell_ai;
DROP TRIGGER IF EXISTS spell_ad;
DROP TRIGGER IF EXISTS spell_au;
DROP TABLE IF EXISTS spell_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS spell_fts USING fts5(
    name,
    description,
    material_components,
    tags,
    source,
    author,
    canonical_range_text,
    canonical_duration_text,
    canonical_area_text,
    canonical_casting_time_text,
    canonical_saving_throw_text,
    canonical_damage_text,
    canonical_mr_text,
    canonical_xp_text,
    content='spell',
    content_rowid='id'
);
-- NOTE: content='spell' enables rowid-based MATCH lookups against the spell table.
-- However, SELECT * FROM spell_fts is NOT supported at runtime because the
-- canonical_* columns (canonical_range_text, canonical_duration_text, etc.) do not
-- exist on the spell table itself — they are derived via json_extract in triggers.
-- Avoid SELECT * FROM spell_fts; always join or filter through spell_fts.rowid.
-- NOTE: highlight() and snippet() auxiliary functions will also fail for
-- canonical_* column indices (6–13) since those columns do not exist on
-- the spell table. Use MATCH for search; join back to spell for display.

-- Repopulate FTS from existing spells using explicit SELECT (not VALUES('rebuild'),
-- which would fail because canonical_* columns do not exist on the spell table).
INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author,
    canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text,
    canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text)
SELECT id, name, description, material_components, tags, source, author,
    json_extract(canonical_data, '$.range.text'),        -- single value; NULL when absent
    json_extract(canonical_data, '$.duration.text'),     -- single value; NULL when absent
    json_extract(canonical_data, '$.area.text'),         -- single value; NULL when absent
    -- Multi-source columns below always produce a non-NULL string (COALESCE ensures '').
    COALESCE(json_extract(canonical_data, '$.casting_time.text'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.casting_time.raw_legacy_value'), ''),
    COALESCE(json_extract(canonical_data, '$.saving_throw.raw_legacy_value'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.saving_throw.notes'), ''),
    COALESCE(json_extract(canonical_data, '$.damage.source_text'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.damage.notes'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.damage.dm_guidance'), ''),
    COALESCE(json_extract(canonical_data, '$.magic_resistance.source_text'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.magic_resistance.notes'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.magic_resistance.special_rule'), ''),
    COALESCE(json_extract(canonical_data, '$.experience_cost.source_text'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.experience_cost.notes'), '') || ' ' || COALESCE(json_extract(canonical_data, '$.experience_cost.dm_guidance'), '')
FROM spell;

-- MAINTENANCE: The canonical_* expressions below are intentionally duplicated
-- across spell_ai, spell_ad, and spell_au (and the initial INSERT/SELECT above)
-- because SQLite provides no trigger macros. When adding a new canonical field,
-- update all four locations: the initial repopulation INSERT and all three triggers.
CREATE TRIGGER spell_ai AFTER INSERT ON spell BEGIN
    INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author,
        canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text,
        canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text)
    VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author,
        json_extract(new.canonical_data, '$.range.text'),        -- single value; NULL when absent
        json_extract(new.canonical_data, '$.duration.text'),     -- single value; NULL when absent
        json_extract(new.canonical_data, '$.area.text'),         -- single value; NULL when absent
        COALESCE(json_extract(new.canonical_data, '$.casting_time.text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.casting_time.raw_legacy_value'), ''),
        COALESCE(json_extract(new.canonical_data, '$.saving_throw.raw_legacy_value'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.saving_throw.notes'), ''),
        COALESCE(json_extract(new.canonical_data, '$.damage.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.damage.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.damage.dm_guidance'), ''),
        COALESCE(json_extract(new.canonical_data, '$.magic_resistance.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.magic_resistance.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.magic_resistance.special_rule'), ''),
        COALESCE(json_extract(new.canonical_data, '$.experience_cost.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.experience_cost.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.experience_cost.dm_guidance'), ''));
END;

CREATE TRIGGER spell_ad AFTER DELETE ON spell BEGIN
    INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author,
        canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text,
        canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text)
    VALUES('delete', old.id, old.name, old.description, old.material_components, old.tags, old.source, old.author,
        json_extract(old.canonical_data, '$.range.text'),        -- single value; NULL when absent
        json_extract(old.canonical_data, '$.duration.text'),     -- single value; NULL when absent
        json_extract(old.canonical_data, '$.area.text'),         -- single value; NULL when absent
        COALESCE(json_extract(old.canonical_data, '$.casting_time.text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.casting_time.raw_legacy_value'), ''),
        COALESCE(json_extract(old.canonical_data, '$.saving_throw.raw_legacy_value'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.saving_throw.notes'), ''),
        COALESCE(json_extract(old.canonical_data, '$.damage.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.damage.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.damage.dm_guidance'), ''),
        COALESCE(json_extract(old.canonical_data, '$.magic_resistance.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.magic_resistance.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.magic_resistance.special_rule'), ''),
        COALESCE(json_extract(old.canonical_data, '$.experience_cost.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.experience_cost.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.experience_cost.dm_guidance'), ''));
END;

CREATE TRIGGER spell_au AFTER UPDATE ON spell BEGIN
    INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source, author,
        canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text,
        canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text)
    VALUES('delete', old.id, old.name, old.description, old.material_components, old.tags, old.source, old.author,
        json_extract(old.canonical_data, '$.range.text'),        -- single value; NULL when absent
        json_extract(old.canonical_data, '$.duration.text'),     -- single value; NULL when absent
        json_extract(old.canonical_data, '$.area.text'),         -- single value; NULL when absent
        COALESCE(json_extract(old.canonical_data, '$.casting_time.text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.casting_time.raw_legacy_value'), ''),
        COALESCE(json_extract(old.canonical_data, '$.saving_throw.raw_legacy_value'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.saving_throw.notes'), ''),
        COALESCE(json_extract(old.canonical_data, '$.damage.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.damage.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.damage.dm_guidance'), ''),
        COALESCE(json_extract(old.canonical_data, '$.magic_resistance.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.magic_resistance.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.magic_resistance.special_rule'), ''),
        COALESCE(json_extract(old.canonical_data, '$.experience_cost.source_text'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.experience_cost.notes'), '') || ' ' || COALESCE(json_extract(old.canonical_data, '$.experience_cost.dm_guidance'), ''));
    INSERT INTO spell_fts(rowid, name, description, material_components, tags, source, author,
        canonical_range_text, canonical_duration_text, canonical_area_text, canonical_casting_time_text,
        canonical_saving_throw_text, canonical_damage_text, canonical_mr_text, canonical_xp_text)
    VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source, new.author,
        json_extract(new.canonical_data, '$.range.text'),        -- single value; NULL when absent
        json_extract(new.canonical_data, '$.duration.text'),     -- single value; NULL when absent
        json_extract(new.canonical_data, '$.area.text'),         -- single value; NULL when absent
        COALESCE(json_extract(new.canonical_data, '$.casting_time.text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.casting_time.raw_legacy_value'), ''),
        COALESCE(json_extract(new.canonical_data, '$.saving_throw.raw_legacy_value'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.saving_throw.notes'), ''),
        COALESCE(json_extract(new.canonical_data, '$.damage.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.damage.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.damage.dm_guidance'), ''),
        COALESCE(json_extract(new.canonical_data, '$.magic_resistance.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.magic_resistance.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.magic_resistance.special_rule'), ''),
        COALESCE(json_extract(new.canonical_data, '$.experience_cost.source_text'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.experience_cost.notes'), '') || ' ' || COALESCE(json_extract(new.canonical_data, '$.experience_cost.dm_guidance'), ''));
END;
