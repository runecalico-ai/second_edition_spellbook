# Character Bundle Formats

This document describes the import/export formats used by the Spellbook application for sharing character data.

## 1. JSON Bundle Format

The JSON bundle is the primary format for lossless data exchange between Spellbook instances. It is a single `.json` file containing the character's identity, stats, classes, and full spell details.

### Schema Structure

Root object: `CharacterBundle`

| Field | Type | Description |
|---|---|---|
| `format` | string | Format identifier ("adnd2e-character") |
| `formatVersion` | string | Schema version (currently "1.0.0") |
| `name` | string | Character name |
| `characterType` | string | "PC" or "NPC" |
| `race` | string? | Character race |
| `alignment` | string? | Character alignment |
| `comEnabled` | integer | 1 if Comeliness attribute is enabled, 0 otherwise |
| `notes` | string? | Freeform inputs |
| `abilities` | object? | Ability scores (see below) |
| `classes` | array | List of character classes |
| `createdAt` | string? | Creation timestamp |
| `updatedAt` | string? | Last update timestamp |

#### Abilities Object
| Field | Type | Description |
|---|---|---|
| `str`, `dex`, `con`, `int`, `wis`, `cha` | integer | Core attributes |
| `com` | integer | Comeliness score (if enabled) |

#### BundleClass Object
Each item in the `classes` array represents a class (e.g., "Wizard 5").

| Field | Type | Description |
|---|---|---|
| `className` | string | Class name (e.g., "Wizard") |
| `classLabel` | string? | Custom label |
| `level` | integer | Class level |
| `spells` | array | List of `BundleClassSpell` objects |

#### BundleClassSpell Object
Links a spell to the character class.

| Field | Type | Description |
|---|---|---|
| `spell` | object | Full `SpellDetail` object (name, level, description, etc.) |
| `listType` | string | "KNOWN" (Spellbook) or "PREPARED" (Memorized) |
| `notes` | string? | Per-character annotation for the spell |

---

## 2. Markdown Bundle Format

The Markdown bundle is designed for human readability and editing. It is exported as a `.zip` archive containing structured YAML and Markdown files.

### Directory Structure

```text
MyCharacter.zip
├── character.yml      # Main character metadata and structure
└── spells/            # Directory containing spell definitions
    ├── fireball.md
    ├── magic-missile.md
    └── ...
```

### `character.yml`
Contains the same data structure as the JSON bundle (`CharacterBundle`), serialized to YAML.
- **Spells**: The `spells` list in `character.yml` still contains the full spell data for portability, ensuring the `character.yml` is the single source of truth for the structure during import.
- **Note**: The individual `.md` files in `spells/` are generated for user reference and editing convenience. Currently, the import logic primarily parses `character.yml`.

### Spell Markdown Format
Generated spell files use standard frontmatter:

```markdown
---
name: "Fireball"
level: 3
school: "Evocation"
---

# Fireball

**Level:** 3
**School:** Evocation
...

[Description text]
```

---

## 3. Import Logic & Deduplication

When importing a bundle (JSON or Markdown), the system performs the following logic to prevent duplicate spells in the database.

### 3.1 Character Collision
1. **Match**: Checks for existing character by `name`.
2. **Resolution**:
   - If **Overwrite** is selected: Updates existing character identity, clears old classes/spells, and inserts new ones.
   - If **Create New** is selected: Creates a new character with `(Imported)` appended to the name.

### 3.2 Spell Deduplication
Since bundles contain full spell definitions, importing a character could introduce duplicate spells into the global library. We prevent this by checking:

**Match Criteria**:
- `name` (case-sensitive exact match)
- `level`
- `source` (treating `null` as empty string)

**Algorithm**:
1. For each spell in the bundle:
   - Query DB: `SELECT id FROM spell WHERE name=? AND level=? AND IFNULL(source, '')=?`
   - **If found**: Use the existing `spell_id`. Link it to the character.
   - **If not found**: Insert the spell as a new record in the `spell` table. Use the new `spell_id`.
2. Insert `character_class_spell` link using the resolved `spell_id`, `listType`, and `notes`.

This ensures that if you import 5 characters who all know "Fireball" (PHB), only one "Fireball" record exists in your database.
