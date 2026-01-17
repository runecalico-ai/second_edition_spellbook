## Context
The application needs to support AD&D 2e high-level magic (10th-12th level Wizard spells and Divine Quest spells) which have specific restrictions based on the magic type (Arcane vs. Divine).

## Decisions
- **Level 8 for Quest Spells**: Use Level 8 as the internal numeric representation for Quest spells to allow them to sit just above 7th level Divine spells while still being distinguishable via the `is_quest_spell` flag. The importer SHALL map both "8" and "quest" (case-insensitive) to Level 8 and set the `is_quest_spell` flag.
- **Cantrips as Level 0 Subset**: Use an `is_cantrip` flag to distinguish true Cantrips from other Level 0 spells. The UI toggle for `is_cantrip` SHALL only be enabled when Level is 0. The importer SHALL map both "0" and "cantrip" (case-insensitive) to Level 0 and set the `is_cantrip` flag.
- **Mutual Exclusivity**: Standardize the check for Arcane/Divine based on the presence of `school` or `sphere`. This simplifies validation and aligns with existing data patterns.
- **UI Terminology**: Automatically map levels 10, 11, 12 to "10th Circle", "11th Circle", and "12th Circle" in the UI for Arcane spells to ensure the numeric level remains clear.

## Architectural Patterns
- **Change Log Maintenance**: All updates to `is_quest_spell` and `is_cantrip` SHALL be included in the `change_log` via the existing `diff_spells` and `log_changes` functions in `spells.rs`.
- **FTS Consistency**: Ensure the `spell_fts` triggers in `0001_init.sql` (or subsequent migrations) do not need adjustment for the new flags, as flags are currently not indexed in FTS.
- **Sidecar JSON-RPC**: Any new import parsing logic for "Quest" or "Cantrip" keywords belongs in the Python sidecar's JSON-RPC handlers to maintain the sidecar logic pattern.
- **DTO Consistency**: Update all spell DTOs (`SpellCreate`, `SpellUpdate`, `SpellDetail`, `SpellSummary`) to include the new `is_cantrip` property.

## Risks / Trade-offs
- **Slider Granularity**: Increasing the slider max to 12 might make it slightly touchier on small screens, but 13 steps is generally manageable.
- **Search Facets**: Facets for levels 10-12 should only appear if such spells exist, unless we override this behavior to always show them. We will opt to always show them in the Spellbook Builder for convenience.

## Migration Plan
- A single SQL migration `0006_add_cantrip_flag.sql` (version 6) will add the `is_cantrip` column with a default of 0. This is safe for existing data.
- Note: `is_quest_spell` was added in version 4 (`0004_add_quest_spells.sql`).
