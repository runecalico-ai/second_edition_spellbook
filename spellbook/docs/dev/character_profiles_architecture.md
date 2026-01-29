# Character Profiles Architecture

## Overview

The Character Profiles feature provides a complete system for managing D&D characters with ability scores, multi-class support, and independent spell lists per character.

## Database Schema

### Tables

#### `characters`
```sql
CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abilities JSON NOT NULL,  -- {str, dex, con, int, wis, cha}
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_char_name ON characters(name);
```

#### `character_classes`
```sql
CREATE TABLE character_classes (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX idx_char_class ON character_classes(character_id);
```

#### `character_class_spells`
```sql
CREATE TABLE character_class_spells (
    id INTEGER PRIMARY KEY,
    character_class_id INTEGER NOT NULL,
    spell_name TEXT NOT NULL,
    list_type TEXT CHECK(list_type IN ('KNOWN', 'PREPARED')),
    FOREIGN KEY (character_class_id) REFERENCES character_classes(id) ON DELETE CASCADE
);
CREATE INDEX idx_ccs_list ON character_class_spells(character_class_id, list_type);
```

### Data Isolation

Spell isolation is guaranteed by foreign key constraints:
- `character_class_id` links spells to specific character class instances
- `ON DELETE CASCADE` ensures cleanup when character or class is deleted
- No shared spell lists between characters

## Backend Commands

### Character Management (`src-tauri/src/commands/io_character.rs`)

- `create_character(name: String)` → Character ID
- `get_characters()` → List of all characters
- `get_character(id: i64)` → Character details
- `search_characters(query, filters)` → Filtered character list
- `delete_character(id: i64)` → Success/Failure

### Class Management

- `add_character_class(character_id, class_name, level)` → Class ID
- `get_character_classes(character_id)` → List of classes
- `remove_character_class(class_id)` → Success/Failure

### Spell Management

- `add_character_spell(class_id, spell_name, list_type)` → Spell ID
- `get_character_class_spells(class_id, list_type)` → List of spells
- `remove_character_spell(spell_id)` → Success/Failure

### Export Commands (`src-tauri/src/commands/export.rs`)

- `export_character_sheet(character_id, format, include_com, include_notes)` →  File path
- `export_character_spellbook_pack(character_id, class_name, format, layout)` → File path

**Supported formats**: `pdf` (outputs print-optimized HTML), `md` (Markdown)

## Frontend Components

### `CharacterEditor.tsx`

Main component for editing character details:
- Ability score inputs with validation (0 to INT_MAX)
- Class list with add/remove functionality
- Spell management per class (Known/Prepared lists)
- Print buttons (Sheet and Pack per class)
-  `PrintOptionsDialog` integration

**Key State**:
```typescript
const [abilities, setAbilities] = useState<Abilities>();
const [classes, setClasses] = useState<CharacterClass[]>([]);
const [printDialogOpen, setPrintDialogOpen] = useState(false);
const [printOptions, setPrintOptions] = useState<PrintOptions>();
```

### `PrintOptionsDialog.tsx`

Modal dialog for print customization:
- Format selection (PDF/Markdown)
- Layout selection (Compact/Full) for spellbook packs
- Toggles for "Include COM" and "Include Notes"
- Passes selected options to backend

## Printing System Integration

### Python Sidecar (`services/ml/spellbook_sidecar.py`)

**PDF Generation**:
- `format="pdf"` generates print-optimized HTML
- Users leverage browser's "Print to PDF" functionality
- No system dependencies (Pandoc/LaTeX) required

**Markdown Generation**:
- Direct Markdown output from templates
- Uses Jinja2 templates for rendering

### Templates

Located in `services/ml/templates/`:
- `character_sheet.html.j2` - Character sheet HTML template
- `spellbook_pack.html.j2` - Spellbook pack HTML template
- `character_sheet.md.j2` - Character sheet Markdown template
- `spellbook_pack.md.j2` - Spellbook pack Markdown template

## Search Query Optimization

### Indexed Fields
- `characters.name` → `idx_char_name`
- `character_classes.character_id` → `idx_char_class`
- `character_class_spells.(character_class_id, list_type)` → `idx_ccs_list`

### Query Patterns

**Search by name**:
```sql
SELECT * FROM characters WHERE name LIKE '%query%';
```

**Filter by class**:
```sql
SELECT DISTINCT c.* FROM characters c
JOIN character_classes cc ON c.id = cc.character_id
WHERE cc.class_name = 'Mage';
```

**Filter by ability threshold**:
```sql
SELECT * FROM characters
WHERE JSON_EXTRACT(abilities, '$.int') >= 15;
```

## Testing

### E2E Test Files
- `character_edge_cases.spec.ts` - Edge cases (names, boundaries, INT_MAX)
- `character_search.spec.ts` - Search functionality
- `character_search_filters.spec.ts` - Advanced filtering
- `character_print_options.spec.ts` - Print dialog UI
- `character_snapshots.spec.ts` - Output format snapshots
- `character_master_workflow.spec.ts` - Comprehensive workflow

### Test Patterns

Use shared `SpellbookApp` page object:
```typescript
const app = new SpellbookApp(page);
await app.createCharacter(name);
await app.openCharacterEditor(name);
await app.addClass("Mage");
await app.addSpellToClass("Mage", "Fireball", "KNOWN");
```

## Performance Considerations

- Character list retrieves all characters (acceptable for typical user counts)
- Search queries use indexed fields for fast lookups
- Spell lists are lazy-loaded per character
- Print generation is async (no UI blocking)

## Security

- Input validation on all text fields (prevents XSS)
- SQL injection prevented via parameterized queries
- Foreign key constraints enforce data integrity
- No file system access from frontend (all via Tauri commands)
