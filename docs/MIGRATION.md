# Spell Data Migration Guide

This document outlines the migration process for the Second Edition Spellbook, introducing the new structured data format (`CanonicalSpell`) and content hashing.

## For Users

### What is happening?
The application is upgrading how it stores spells. Previously, fields like Range, Duration, and Casting Time were simple text strings. Now, they are being parsed into structured data to enable better searching, filtering, and cross-referencing.

### Automatic Migration
When you start the application after updating, a background process ("Hash Backfill") will automatically:
1.  **Backup your database** to `spells_backup_<timestamp>.db` in your data folder.
2.  Scan all spells.
3.  Parse their text fields into structured data.
4.  Compute a unique `content_hash` for each spell.
5.  Store the structured data alongside the legacy text.

This process is **non-destructive**. Your original data is preserved.

### Troubleshooting
If you suspect data issues:
- **Check the logs**: A `migration.log` file is created in your data directory. Logs are automatically rotated when they exceed 10MB or 30 days of age (rotated file: `migration.log.old`).
- **Run Integrity Check**: Run the application with the `--check-integrity` flag. It verifies that every spell's stored `content_hash` matches the hash recomputed from its `canonical_data`, and reports NULL hashes, orphan references, and duplicate hashes.
  ```bash
  .\spellbook-desktop.exe --check-integrity
  ```
- **Re-run Migration**: If you need to force a re-computation of all hashes:
  ```bash
  .\spellbook-desktop.exe --recompute-hashes
  ```
- **Detect hash collisions**: If you have duplicate `content_hash` values, run `--detect-collisions`. The tool compares `canonical_data` for each duplicate group and reports either "Duplicate content (same spell data)" or "True hash collision (different content, same hash)" so you can fix or merge duplicates.
  ```bash
  .\spellbook-desktop.exe --detect-collisions
  ```

### Backfill behavior
During hash backfill, the application logs progress every 100 spells (e.g. "Migrating spell 100 of 1000...") and writes a final summary to stderr and `migration.log`: processed count, updated count, parse fallback count, hash failure count, and success/fallback percentages. If the backfill fails due to a hash collision (UNIQUE constraint on `content_hash`), a clear message is written to `migration.log` and stderr; fix duplicates or run `--detect-collisions` and retry.

### Restoring from Backup
If data is corrupted, you can restore from a backup:
- **CLI**: Use `--restore-backup <path>` to restore from a backup file. The application runs an integrity check on the restored database and reports failure if the check does not return "ok".
- **Manual**: Navigate to your data directory (e.g., `%APPDATA%/SpellbookVault` on Windows), identify the `spells_backup_....db` file, and replace the main database file (e.g. rename the backup to `spellbook.sqlite3`).

---

## For Developers

### Parser Architecture

The spell parser has been refactored into a modular architecture for maintainability and testability.

**Location**: `src/utils/` directory structure:
```
src/utils/
├── spell_parser.rs          # Facade pattern entry point
└── parsers/
    ├── range.rs              # RangeParser
    ├── area.rs               # AreaParser
    ├── duration.rs           # DurationParser
    ├── mechanics.rs          # MechanicsParser (damage, saves, MR, XP)
    └── components.rs         # ComponentsParser (components, casting time)
```

**Usage**: The `SpellParser` struct acts as a facade, delegating to domain-specific parsers:
```rust
let parser = SpellParser::new();
let range = parser.parse_range("10 yards");
let duration = parser.parse_duration("1 round/level");
let area = parser.parse_area("20-foot radius");
```

### Supported Parsing Patterns

Parsers convert legacy text strings into structured specification objects. Below are examples of supported patterns for each major spec type.

#### Range Patterns (`RangeParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "10 yards" | `RangeSpec { kind: Distance, distance: {value: 10}, unit: "yd" }` |
| "10 + 5/level yards" | `RangeSpec { kind: Distance, distance: {per_level: 5, value: 10}, unit: "yd" }` |
| "Touch" | `RangeSpec { kind: Touch }` |
| "Personal" | `RangeSpec { kind: Personal }` |
| "Unlimited" | `RangeSpec { kind: Unlimited }` |
| "30 feet (line of sight)" | `RangeSpec { kind: DistanceLos, distance: {value: 30}, unit: "ft", requires: ["los"] }` |

#### Area Patterns (`AreaParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "20-foot radius" | `AreaSpec { kind: RadiusCircle, radius: {value: 20}, shape_unit: "ft" }` |
| "30-foot cone" | `AreaSpec { kind: Cone, length: {value: 30}, shape_unit: "ft" }` |
| "10 x 20 foot wall" | `AreaSpec { kind: Wall, length: {value: 10}, height: {value: 20}, shape_unit: "ft" }` |
| "5-foot cube" | `AreaSpec { kind: Cube, edge: {value: 5}, shape_unit: "ft" }` |
| "One creature" | `AreaSpec { kind: Creatures, count: {value: 1}, count_subject: "creature" }` |
| "Special" | `AreaSpec { kind: Special }` |

#### Duration Patterns (`DurationParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "1 round" | `DurationSpec { kind: Time, unit: Round, duration: {value: 1} }` |
| "10 minutes" | `DurationSpec { kind: Time, unit: Minute, duration: {value: 10} }` |
| "1 round/level" | `DurationSpec { kind: Time, unit: Round, duration: {per_level: 1} }` |
| "Instantaneous" | `DurationSpec { unit: Instantaneous }` |
| "Permanent" | `DurationSpec { unit: Permanent }` |
| "Concentration" | `DurationSpec { unit: Concentration }` |
| "Special" | `DurationSpec { unit: Special }` |

> [!NOTE]
> **Complex Duration Handling**: Parsers support most common patterns but may fall back to "Special" for highly conditional durations (e.g., "until dispelled or 1 day per level"). See [PARSER_COVERAGE.md](./PARSER_COVERAGE.md) for a complete coverage matrix and known limitations.

> [!NOTE]
> **Unparseable strings**: When parsing falls back to Special (or equivalent), the original legacy string is stored in the spec's **`raw_legacy_value`** field so it is preserved in `canonical_data` and included in hashing. See PARSER_COVERAGE.md for details.

#### Component Patterns (`ComponentsParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "V, S" | `SpellComponents { verbal: true, somatic: true, material: false, ... }` |
| "V, S, M" | `SpellComponents { verbal: true, somatic: true, material: true, ... }` |
| "V, S, M (bat guano)" | Components + MaterialComponentSpec entry |
| "V, S, DF" | `SpellComponents { verbal: true, somatic: true, divine_focus: true, ... }` |

#### Damage Patterns (`MechanicsParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "1d6" | `SpellDamageSpec { parts: [{ dice: "1d6" }] }` |
| "1d6/level (max 10d6)" | `SpellDamageSpec { parts: [{ per_level_dice: "1d6", cap_level: 10 }] }` |
| "1d6 fire" | `SpellDamageSpec { parts: [{ dice: "1d6", damage_type: "fire" }] }` |
| "2d4+2" | `SpellDamageSpec { parts: [{ dice: "2d4", bonus: 2 }] }` |

#### Saving Throw Patterns (`MechanicsParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "None" | `SavingThrowSpec { kind: None }` |
| "Negates" | `SavingThrowSpec { kind: Negates }` |
| "Half" | `SavingThrowSpec { kind: Half }` |
| "Spell negates" | `SavingThrowSpec { kind: Negates, allowed: ["Spell"] }` |

#### Magic Resistance Patterns (`MechanicsParser`)

| Legacy Text | Parsed Result |
|-------------|---------------|
| "Yes" | `MagicResistanceSpec { kind: Yes }` |
| "No" | `MagicResistanceSpec { kind: No }` |
| "Special" | `MagicResistanceSpec { kind: Special }` |


### Database Strategy
We use an "Expand and Contract" pattern:
1.  **Expand**: Added `canonical_data` and `content_hash` columns (Migration 12).
2.  **Migrate**: The `backfill` script populates these columns.
3.  **Contract**: (Future) Remove legacy columns once migration is verified and UI is updated.

### Handling Parsing Failures
Parsers are designed to fallback gracefully. If a pattern isn't recognized, the parser returns a "Special" unit with the original text preserved in the `text` field. This ensures no data is lost even if parsing "fails" to find a specific structure.

> [!WARNING]
> **Developer Note on Column Ordering**: When modifying `SELECT` statements in `migration_manager.rs`, ensure that the `row.get(N)` indices in the mapping block **exactly match** the column order in the SQL query. A mismatch between the query and mapping (e.g., swapping `level` and `school`) will lead to incorrect hash computation and data corruption. Always run the `test_migration_column_mapping_regression` test after modifying these queries.
