-- Migration: Add Artifact Table
-- Stores metadata about imported content for tracking and history

CREATE TABLE IF NOT EXISTS artifact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    hash TEXT NOT NULL,
    spell_id INTEGER,
    path TEXT,
    metadata TEXT,
    imported_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(spell_id) REFERENCES spell(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_hash ON artifact(hash);
CREATE INDEX IF NOT EXISTS idx_artifact_type ON artifact(type);
CREATE INDEX IF NOT EXISTS idx_artifact_spell_id ON artifact(spell_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_spell_path ON artifact(spell_id, path) WHERE spell_id IS NOT NULL;
