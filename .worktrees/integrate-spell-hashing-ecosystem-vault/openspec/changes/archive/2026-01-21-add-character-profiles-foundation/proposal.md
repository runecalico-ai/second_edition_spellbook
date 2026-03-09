# Change: Add Character Profiles - Foundation (Part 1 of 3)

## Why
The current character system is minimal (name, type, notes only) and lacks the rich profile data needed for AD&D 2e character management. This is **Part 1 of 3** proposals implementing the Character Profiles feature from `spec_3_character_profiles_feature.md`.

**Part 1 (Foundation)** establishes the core character management system with multi-class support and per-class spell lists. This provides the essential functionality for users to create and manage characters with spells.

**Future parts**:
- Part 2: Import/Export (character bundles)
- Part 3: Printing, Search, and UX Polish

## What Changes
- **Database Schema**: Add `character_ability`, `character_class`, and `character_class_spell` tables to support multi-class characters with abilities and per-class spell lists
- **Character Model**: Extend character table with `race`, `alignment`, `com_enabled` fields
- **Multi-Class Support**: Characters can have multiple classes, each with independent levels (no max)
- **Abilities Tracking**: Track all six core abilities plus optional Comeliness (COM) with no maximum values enforced
- **Per-Class Spell Management**: Each class on a character maintains separate known/prepared spell lists with spell search filtering and notes
- **UI Components**: Character editor with identity, abilities, multi-class management, and per-class spell list panels; spell picker dialog filters reset to default values on open
- **E2E Testing**: Playwright tests for CRUD operations and spell management

## Impact
- **Affected specs**: `architecture`, `library`, new `characters` capability
- **Affected code**:
  - Database: New migration for character profile tables
  - Backend: New Rust commands in `commands/characters.rs` for abilities, classes, and spell management
  - Frontend: New/updated React components for character profile editing
- **Breaking changes**: None - extends existing character table with backward-compatible schema additions
- **Migration**: Existing characters will have NULL values for new fields (race, alignment, com_enabled defaults to 0)
- **Dependencies**: None (this is the foundation)
- **Enables**: Part 2 (Import/Export) and Part 3 (Printing/Search)
