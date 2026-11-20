-- Small key/value table for app-level facts tied to this database,
-- e.g. which embedding model revision produced spell_vec.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
