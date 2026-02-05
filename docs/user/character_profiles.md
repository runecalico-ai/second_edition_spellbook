# Character Profiles Guide

## Overview

The Character Profiles feature allows you to create and manage multiple D&D characters, each with their own ability scores, classes, and spell lists.

## Creating Characters

1. Navigate to the **Characters** page
2. Click **Create Character** button
3. Enter a character name
4. Character is created with default ability scores (all 10)

## Managing Ability Scores

1. Open your character in the Character Editor
2. Modify ability scores:
   - **STR, DEX, CON, INT, WIS, CHA**
   - Valid range: 0 to 2,147,483,647
   - Negative values automatically clamp to 0
3. Click **Save Abilities** to persist changes

## Adding Classes

1. In Character Editor, click **Add Class**
2. Select from available classes (Mage, Fighter, Cleric, etc.)
3. Set class level (minimum 1)
4. Each character can have multiple classes

## Managing Spells

### Adding Spells to a Class
1. Expand the class section
2. Click **Add Spell** for Known or Prepared lists
3. Search for spells in the library
4. Select spells to add

### Spell Lists
- **Known**: Spells the character knows
- **Prepared**: Spells currently prepared for use
- **Spell isolation**: Each character's spell lists are completely independent

## Searching Characters

Use the search box to filter characters by:
- **Name**: Partial or full name match
- **Class**: Filter by specific class (e.g., "Mage")
- **Ability scores**: Filter by minimum ability values

## Printing & Exporting

### Print Character Sheet
1. Click **Print Sheet** button in the character header
2. Choose format (**HTML** or **Markdown**)
3. Toggle **Include COM** to add Comeliness scores and tables
4. Toggle **Include Notes** to include your spell-specific notes in the final sheet

### Print Spellbook Pack
1. Expand a class section
2. Click **Print Pack** button
3. Choose layout:
   - **Compact**: Brief spell list
   - **Full**: Complete spell stat blocks
4. File is saved to your downloads folder

### Export Character
- **JSON**: Full character data for backup/transfer
- **Markdown**: Human-readable format

## Tips

- Use unique character names for easier searching
- Save ability scores before navigating away
- Each character's spell lists are isolated - changes to one don't affect others
- HTML format generates print-optimized documents - use your browser's "Print to PDF" or "Print" to save or print them.

## Troubleshooting

**Q: My ability score won't go below 0**
A: This is intentional - negative values are not allowed per game rules

**Q: Can I have more than 3 classes?**
A: Yes, there's no hard limit on number of classes per character

**Q: Are spell lists shared between characters?**
A: No, each character has completely independent spell lists
