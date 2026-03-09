# Design: Spell Notes Persistence

## Architecture
The relationship between a `CharacterClass` and a `Spell` is many-to-many, mediated by the `character_class_spell` table. This table includes a `list_type` column ('KNOWN' or 'PREPARED') and a `notes` column.

### Data Model
No changes to the schema are required, but the usage of the data is refined.
- `character_class_spell`:
    - `character_class_id`: FK
    - `spell_id`: FK
    - `list_type`: "KNOWN" | "PREPARED"
    - `notes`: TEXT

### Backend Logic
The `get_character_class_spells` command previously aggregated rows by `spell_id`. This was efficient for simply listing available spells but effectively "flattened" the notes field, making it impossible to deterministically retrieve the note for the 'PREPARED' instance if a 'KNOWN' instance also existed.

**Change:** The query must return individual rows for each `character_class_spell` entry, or map them effectively. We chose to return individual rows and let the frontend/mapping logic handle the display.

### Frontend Logic
The `CharacterEditor` iterates over spells. When a user updates a note, the application must know *which* context (tab) controls the update.
- `update_character_spell_notes(..., listType: string, ...)`

## Trade-offs
- **Duplicate Spell Rows:** Removing `GROUP BY` might result in the same spell appearing twice in the raw result set (once for Known, once for Prepared). The frontend or intermediate mapping must handle this if the UI expects a unique list of spells. *Decision:* The current UI separates these into tabs, so distinct data points are actually preferred.
