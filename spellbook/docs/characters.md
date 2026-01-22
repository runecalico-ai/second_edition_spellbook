# Character Management Guide

The Character Profile system allows you to create detailed AD&D 2nd Edition character records with multi-class support and per-class spell management.

## Creating a Character

1. Navigate to the **Characters** tab.
2. Enter a name in the "New Name" box and click **+**.
3. Select your new character from the list to open the **Character Editor**.

## Identity & Abilities

In the Character Editor, you can set the following:
- **Identity**: Race, Alignment, and Notes.
- **Comeliness (COM)**: Toggle this on/off in the Identity panel. When enabled, a COM ability score input will appear in the Abilities panel.
- **Abilities**: Enter your STR, DEX, CON, INT, WIS, CHA, and COM scores. The system allows any numeric value (supporting god-like scores or magical enhancements).

> [!TIP]
> Click "Save Identity" or "Save Abilities" after making changes to persist them to the database.

## Multi-Classing

The system supports an unlimited number of classes per character.
- **Add a Class**: Use the dropdown in the **Classes** panel. Select **Other** to enter a custom class name.
- **Levels**: Adjust the level for each class independently using the **+/-** buttons.
- **Remove a Class**: Click the trash icon next to a class. *Warning: This removes all spell associations for that class.*

## Spell Management

Each class you add gets its own independent spell lists:
1. **Known Spells**: Spells in your spellbook or granted by your deity.
2. **Prepared Spells**: Spells currently memorized for the day.

### Adding Spells
1. Find the spell list panel for your class.
2. Select the **KNOWN** or **PREPARED** tab.
3. Click **+ ADD** to open the spell picker.
4. Search for spells by name or use filters (Quest, Cantrip, School).
5. Add individual spells by clicking **ADD** or select multiple and use **BULK ADD**.

### Managing Spells & Notes
- **Notes**: Each spell entry has a "Add notes..." field for per-spell annotation (e.g., "From magic item" or "Bonus spell").
- **Removing**: Click the trash icon for a single spell, or select multiple and click **REMOVE X** for bulk removal.

### Non-Spellcasters
For classes like Fighters or Thieves, the spell management section is automatically collapsed by default. You can expand it if your character has gained spellcasting abilities through special means.
