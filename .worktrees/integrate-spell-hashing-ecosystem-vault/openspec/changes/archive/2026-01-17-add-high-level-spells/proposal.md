# Change: Add 12th Circle, Quest, and Cantrip Spells

## Why
The application currently limits Arcane spell levels to 0-9 and does not explicitly support Divine Quest spells or provide special terminology for high-level "Circle" magic and "Cantrips". This change extends the magic system to support epic-level play and AD&D 2e specific magic types.

## What Changes
- **Arcane Spell Levels**: Extend supported levels to 10th, 11th, and 12th Circle magic.
- **Divine Quest Spells**: Add a `is_quest_spell` flag for level 8 Divine spells, bypassing the standard level 7 cap.
- **Cantrips**: Formalize Cantrips as a specific type of Level 0 spell using an `is_cantrip` flag.
- **Validation**: Enforce Arcane-only restrictions for levels 9-12 and Divine-only restrictions for Quest spells.
- **UI Updates**: Update library sliders, spell editor toggles, and add visual badges for high-level and quest magic.

## Impact
- **Affected Specs**: `library`, `search`, `importers`, `spellbooks`, `architecture`.
- **Affected Code**: `Library.tsx`, `SpellEditor.tsx`, `spells.rs`, `models/spell.rs`, `migrations.rs`. Includes `is_quest_spell` and `is_cantrip` field support.
- **BREAKING**: None, but introduces new data fields and validation rules.
