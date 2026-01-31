# Character Profiles Architecture

## Overview

The Character Profiles feature provides a complete system for managing D&D characters with ability scores, multi-class support, and independent spell lists per character.

## Database Schema

### Tables

#### `character`
Core character identity table.
```sql
CREATE TABLE "character" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'PC',
    race TEXT,
    alignment TEXT,
    com_enabled INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_char_name ON "character"(name);
```

#### `character_ability`
Relational table for ability scores (supports INT_MAX).
```sql
CREATE TABLE character_ability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL UNIQUE,
    str INTEGER DEFAULT 10,
    dex INTEGER DEFAULT 10,
    con INTEGER DEFAULT 10,
    int INTEGER DEFAULT 10,
    wis INTEGER DEFAULT 10,
    cha INTEGER DEFAULT 10,
    com INTEGER DEFAULT 10,
    FOREIGN KEY(character_id) REFERENCES "character"(id) ON DELETE CASCADE
);
```

#### `character_class`
Multi-class support tracking levels and optional custom labels.
```sql
CREATE TABLE character_class (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    class_label TEXT,
    level INTEGER DEFAULT 1,
    FOREIGN KEY(character_id) REFERENCES "character"(id) ON DELETE CASCADE
);
CREATE INDEX idx_char_class ON character_class(character_id, class_name);
```

#### `character_class_spell`
Per-class spell management for Known and Prepared lists.
```sql
CREATE TABLE character_class_spell (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_class_id INTEGER NOT NULL,
    spell_id INTEGER NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('KNOWN', 'PREPARED')),
    notes TEXT,
    FOREIGN KEY(character_class_id) REFERENCES character_class(id) ON DELETE CASCADE,
    FOREIGN KEY(spell_id) REFERENCES spell(id) ON DELETE CASCADE,
    UNIQUE(character_class_id, spell_id, list_type)
);
CREATE INDEX idx_ccs_list ON character_class_spell(character_class_id, list_type);
```

### Data Isolation

Spell isolation is guaranteed by foreign key constraints:
- `character_class_id` links spells to specific character class instances.
- `ON DELETE CASCADE` ensures cleanup when a character or class is deleted.
- Each character has completely independent spell lists; changing a spell's notes or preparation status in one profile does not affect others.

## Backend Commands

### Character Management (`src-tauri/src/commands/characters.rs`)

- `create_character(name, type, notes)` → Character ID
- `update_character_details(input)` → Updates identity and COM toggle
- `get_character(id)` → Character details
- `list_characters()` → List of all characters
- `search_characters(filters)` → Advanced filtering (race, type, class, level, abilities)
- `delete_character(id)` → Deletion with cascade cleanup

### Ability Management
- `get_character_abilities(character_id)` → Current scores
- `update_character_abilities(input)` → Updates and validates (0 to INT_MAX)

### Class Management
- `add_character_class(character_id, class_name, class_label, level)` → Class ID
- `get_character_classes(character_id)` → List of classes
- `update_character_class_level(class_id, level)` → Incremental updates
- `remove_character_class(class_id)` → Deletion with spell cleanup

### Spell Management
- `add_character_spell(class_id, spell_id, list_type, notes)` → Link creation
- `get_character_class_spells(class_id, list_type)` → List of spells for that class/type
- `update_character_spell_notes(class_id, spell_id, list_type, notes)` → Per-character spell notes
- `remove_character_spell(class_id, spell_id, list_type)` → Link removal (removing from KNOWN also removes from PREPARED)

### Export & Printing Commands (`src-tauri/src/commands/export.rs`)

- `export_character_sheet(character_id, format, include_com, include_notes)` → File path
- `export_character_spellbook_pack(character_id, class_name, format, layout)` → File path
- `export_character_bundle(id, format)` → JSON or ZIP bundle

**Supported print formats**: `html` (print-optimized), `md` (Markdown)

## Frontend Components

### `CharacterEditor.tsx`
Main component for editing character details:
- Ability score inputs with real-time validation and persistence.
- Identity panel for race, alignment, and COM toggle.
- Class list management with expansion/collapse for spell lists.
- Spell management (Known/Prepared) per class with picker integration.
- Contextual print actions.

### `PrintOptionsDialog.tsx`
Unified dialog for print customization:
- Format selection (HTML/Markdown).
- Layout selection (Compact/Full) for spellbook packs.
- Toggles for "Include COM" and "Include Notes".

## Printing System Integration

### Python Sidecar (`spellbook_sidecar.py`)
- **HTML Generation**: Generates print-optimized HTML using Jinja2 templates.
- **Markdown Generation**: Uses standard templates for clean text output.
- **Templates**: Located in `spellbook/services/ml/templates/`.

## Search Query Optimization

### Advanced Filtering
The search system uses a dynamic query builder with subqueries and `EXISTS` clauses to support complex filters while maintaining performance:
- FTS5 integration for character name/notes search.
- Native SQLite filters for race, type, and ability thresholds.
- `EXISTS` subqueries for multi-class filtering.

## Integration Testing

### E2E Test Suite
- `character_master_workflow.spec.ts`: End-to-end user journey.
- `character_search.spec.ts`: Advanced filtering and performance.
- `character_print_options.spec.ts`: Print UI and file generation.
- `character_snapshots.spec.ts`: Structural verification of exports.
- `character_edge_cases.spec.ts`: Boundary testing (names, high levels, stats).
- `character_io.spec.ts`: Import/Export round-trip validation.

## Performance Considerations
- **Search Latency**: Target < 150ms (P95) on local database with 100+ characters.
- **Lazy Loading**: Class-specific spells are fetched only when the class section is expanded.
- **Batching**: Support for bulk add/remove of spells to minimize IPC overhead.
