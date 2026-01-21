# Design: Character Profiles - Foundation (Part 1 of 3)

## Context
The current character system is minimal (name, type, notes) and was designed as a placeholder for spellbook association. This is **Part 1 of 3** proposals implementing the Character Profiles feature.

**Part 1 (Foundation)** focuses on:
- Rich profile data (abilities, race, alignment, multi-class)
- Per-class spell management (separate Known/Prepared lists per class)
- Core UI for character editing

**Future parts**:
- Part 2: Import/export with spell dedupe
- Part 3: Printing character sheets and spellbook packs, search and filtering

This design extends the existing `character` table and adds new normalized tables for abilities, classes, and per-class spell lists.

## Goals / Non-Goals

### Goals
- Support multi-class characters with independent levels per class
- Track all AD&D 2e abilities (STR, DEX, CON, INT, WIS, CHA) plus optional COM
- Enable per-class spell management (Known and Prepared lists)
- Provide core UI for character editing (Identity, Abilities, Classes, Spells panels)
- Maintain backward compatibility with existing characters

### Non-Goals (Part 1)
- Import/export (Part 2)
- Printing character sheets and spellbook packs (Part 3)
- Search and filtering (Part 3)
- XP tracking, inventory, or combat stats (future feature)
- Automated rules enforcement (e.g., class restrictions, level caps)
- Per-session spell slot tracking (future feature)
- Custom class definitions (v1 uses fixed core list + "Other")
- Network sync or multi-user support

## Decisions

### Decision 1: Normalized Multi-Class Schema
**What**: Use separate `character_class` table with one row per class, rather than JSON array or single-class field.

**Why**:
- Enables efficient queries (filter by class, level range)
- Supports per-class spell lists via foreign key
- Allows future extension (class-specific metadata, history)
- Follows relational best practices

**Alternatives considered**:
- JSON array in `character` table: Poor query performance, no referential integrity
- Single class field: Doesn't support multi-class

### Decision 2: Per-Class Spell Lists
**What**: Create `character_class_spell` table linking `character_class` to `spell` with `list_type` (KNOWN/PREPARED).

**Why**:
- Each class on a character has independent spell lists
- Supports different spell sets per class (e.g., Mage/Cleric multi-class)
- Enables per-spell notes within class context
- Clean separation from global library

**Alternatives considered**:
- Reuse existing `spellbook` table: Doesn't support per-class distinction
- Separate tables for Known/Prepared: Redundant schema, harder to query

### Decision 3: Abilities as Separate Table
**What**: Create `character_ability` table with 1:1 relationship to `character`.

**Why**:
- Keeps `character` table focused on identity
- Allows NULL abilities (character created but abilities not yet set)
- Easier to extend with computed fields (modifiers) in future
- Clean separation of concerns

**Alternatives considered**:
- Columns on `character` table: Works, but clutters main table
- JSON field: Poor query performance for ability-based filters

### Decision 4: Fixed Core Class List (v1)
**What**: Use predefined list of core AD&D 2e classes plus "Other" with free-text label.

**Why**:
- Simpler implementation (no class definition management)
- Covers 99% of use cases
- "Other" escape hatch for edge cases
- Future migration path to `class_definition` table

**Alternatives considered**:
- Full class definition system: Over-engineered for v1, adds complexity
- Free-text only: No validation, inconsistent data

### Decision 5: Character Bundle Format
**What**: Support both JSON (single file) and Markdown (folder) bundle formats.

**Why**:
- JSON: Machine-readable, easy to parse, good for automation
- Markdown: Human-editable, version control friendly, aligns with spell exports
- Both use canonical spell keys for dedupe
- Consistent with existing spell import/export patterns

**Alternatives considered**:
- JSON only: Less user-friendly for manual editing
- Markdown only: Harder to parse, more fragile

### Decision 6: Spell Dedupe Strategy
**What**: Match spells by canonical key (name + level + source) during import.

**Why**:
- Reuses existing spell dedupe logic
- Prevents duplicate spells in library
- Allows character bundles to reference existing spells
- Consistent with spell import behavior

**Alternatives considered**:
- Always create new spells: Bloats library, breaks references
- Match by name only: Too loose, causes incorrect matches

### Decision 7: Backward Compatibility
**What**: Add new columns to `character` table with defaults; existing characters get NULL/default values.

**Why**:
- No data migration required
- Existing characters continue to work
- Users can gradually fill in profile data
- No breaking changes to existing code

**Alternatives considered**:
- Require migration: Disruptive, user-facing complexity
- New table: Breaks existing character references

## Data Model

### ER Diagram
```
Character (1) ──── (1) CharacterAbility
    │
    └── (1:N) CharacterClass
              │
              └── (1:N) CharacterClassSpell ──── (N:1) Spell
```

### Table Relationships
- `character` ↔ `character_ability`: 1:1 (optional)
- `character` → `character_class`: 1:N
- `character_class` → `character_class_spell`: 1:N
- `character_class_spell` → `spell`: N:1

### Indexes
- `idx_char_name` on `character(name)` - Fast name search
- `idx_char_class` on `character_class(character_id, class_name)` - Class filtering
- `idx_ccs_list` on `character_class_spell(character_class_id, list_type)` - Spell list queries

## API Design

### Command Patterns
All commands follow existing pattern:
```rust
pub async fn command_name(
    state: State<'_, Arc<Pool>>,
    ...params
) -> Result<T, AppError>
```

Use `tokio::task::spawn_blocking` for database access.

### Key Commands
- **Character CRUD**: `create_character`, `update_character_details`, `delete_character`, `get_character`, `list_characters`
- **Abilities**: `get_character_abilities`, `update_character_abilities` (upsert)
- **Classes**: `add_character_class`, `update_character_class_level`, `remove_character_class`, `get_character_classes`
- **Spells**: `add_character_spell`, `remove_character_spell`, `get_character_class_spells`, `update_character_spell_notes`
- **Import/Export**: `export_character_bundle`, `import_character_bundle`
- **Printing**: `export_character_sheet`, `export_character_spellbook_pack`
- **Search**: `search_characters` (with filters)

## UI Architecture

### Component Hierarchy
```
CharacterManager
├── CharacterList (index with filters)
│   ├── CharacterCard
│   └── SearchBar + FilterPanel
└── CharacterEditor
    ├── IdentityPanel (name, type, race, alignment, notes, COM toggle)
    ├── AbilitiesPanel (STR/DEX/CON/INT/WIS/CHA/COM)
    ├── ClassesPanel
    │   ├── ClassList (add/remove, set levels)
    │   └── ClassSpellsPanel (per-class tabs)
    │       ├── KnownSpellsList
    │       └── PreparedSpellsList
    └── ActionsPanel (Print, Export)
```

### State Management
- Use Zustand or React state for form state
- Optimistic updates for spell add/remove
- Debounced search/filter queries

## Import/Export Flow

### JSON Bundle Structure
```json
{
  "format": "adnd2e-character",
  "format_version": "1.0.0",
  "character": {
    "name": "Elira",
    "type": "PC",
    "race": "Elf",
    "alignment": "CG",
    "notes": "...",
    "abilities": {"str": 10, "dex": 18, "con": 12, "int": 16, "wis": 12, "cha": 14, "com": 17}
  },
  "classes": [
    {
      "class_name": "Mage",
      "level": 5,
      "known_spells": [{"name": "Magic Missile", "level": 1, "source": "PHB"}],
      "prepared_spells": [{"name": "Magic Missile", "level": 1, "source": "PHB"}]
    }
  ]
}
```

### Markdown Bundle Structure
```
character_bundle/
├── character.yml (identity + abilities + classes)
└── spells/
    ├── magic_missile.md
    └── fireball.md
```

### Import Process
1. Parse bundle (JSON or Markdown)
2. Validate schema and required fields
3. Dedupe spells by canonical key (name + level + source)
4. Check for existing character by name (collision detection)
5. Show merge UI if collision (update vs create new)
6. Insert/update character, abilities, classes, spell links
7. Record artifact (bundle hash, timestamp)

## Printing

### Character Sheet Template
- Markdown-first (Pandoc → PDF)
- Sections: Identity, Abilities, Classes (with levels), Per-Class Spell Lists (Known/Prepared)
- Options: Include COM, Include Notes, Compact/Full layout

### Spellbook Pack Template
- Per-class selection
- Compact (spell names + levels) or Full (stat blocks)
- Reuse existing spell export engine

## Search & Performance

### Search Strategy
- Name search: Use existing index on `character(name)`
- Class filter: Join to `character_class`, filter by `class_name`
- Level range: Filter `character_class.level`
- Ability thresholds: Join to `character_ability`, filter by ability columns
- Optional FTS: Create `character_fts` for full-text search on notes/race/alignment

### Performance Targets
- Character list load: < 100ms (P95)
- Search with filters: < 150ms (P95)
- Character detail load: < 50ms (P95)
- Import 100-spell character: < 2s (P95)

### Optimization
- Eager loading (join abilities, classes in single query)
- Pagination for large character lists (100+ characters)
- Index on common filter columns

## Risks / Trade-offs

### Risk: Schema Complexity
**Mitigation**: Normalize tables for query performance and future extensibility. Use foreign keys and indexes.

### Risk: Import/Export Complexity
**Mitigation**: Reuse existing spell dedupe logic. Provide clear validation errors. Test round-trip scenarios.

### Risk: Per-Class Spell Management UX
**Mitigation**: Use tabs for each class. Provide bulk add/remove. Show clear visual distinction between Known/Prepared.

### Risk: Backward Compatibility
**Mitigation**: Add columns with defaults. Existing characters work without new data. Gradual migration.

### Trade-off: Fixed Class List vs Custom Classes
**Decision**: Use fixed list + "Other" for v1. Simpler implementation, covers most cases. Future migration path to `class_definition` table.

### Trade-off: Abilities Table vs Columns
**Decision**: Separate table for cleaner separation, easier extension. Slight query overhead (join) acceptable.

## Migration Plan

### Database Migration
1. Add columns to `character` table (race, alignment, com_enabled, created_at, updated_at)
2. Create `character_ability` table
3. Create `character_class` table
4. Create `character_class_spell` table
5. Create indexes

### Data Migration
- Existing characters: No data migration required (new columns default to NULL/0)
- Existing spellbook: Optionally migrate to new per-class structure (or deprecate old table)

### Rollback
- Drop new tables and columns if needed
- Existing characters remain functional

## Open Questions
None - spec is comprehensive and design decisions are finalized.
