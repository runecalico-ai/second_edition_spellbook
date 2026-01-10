# Spellbook Seed Bundle

Contents:
- `spells_md/` — Four example AD&D 2e-style spells as Markdown with YAML front-matter.
- `db/0001_init.sql` — SQLite schema (tables, FTS5, sqlite-vec, triggers).

## Use

1. Create/open your SQLite database in the app; ensure `sqlite-vec` extension loads at startup.
2. Run the migration:
   ```sql
   .read db/0001_init.sql
   ```
   or via your app's migration runner.

3. Import the Markdown spells using the Import wizard, or programmatically:
   - Parse YAML front-matter to map fields.
   - Insert into `spell` table and keep the Markdown file path in `artifact` with a SHA-256 `hash`.

4. Build embeddings:
   - For each new/updated spell, compute a 384-d embedding (MiniLM-L6-v2) and upsert into `spell_vec`:
     ```sql
     INSERT INTO spell_vec(rowid, v) VALUES(:spell_id, :embedding)
     ON CONFLICT(rowid) DO UPDATE SET v=excluded.v;
     ```

5. Verify search:
   - Keyword example:
     ```sql
     SELECT s.* FROM spell_fts f JOIN spell s ON s.id=f.rowid
     WHERE f MATCH 'fire OR evocation' ORDER BY bm25(f) LIMIT 20;
     ```
   - Semantic example (pseudocode): get query embedding `:qvec` then
     ```sql
     SELECT s.* FROM spell_vec v JOIN spell s ON s.id=v.rowid
     ORDER BY distance(v.v, :qvec) ASC LIMIT 20;
     ```
