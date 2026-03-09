# Change: Add Character Profiles - Import/Export (Part 2 of 3)

## Why
Part 1 (Foundation) established the core character management system. **Part 2** adds the ability to import and export character profiles as portable bundles, enabling users to share characters, backup/restore data, and migrate between installations.

This implements the Import/Export requirements from `spec_3_character_profiles_feature.md`.

**Dependencies**: Requires Part 1 (Foundation) to be completed

**Enables**: Completes data portability; Part 3 will add printing and search

## What Changes
- **JSON Bundle Format**: Single-file character export with all profile data, classes, and spell references
- **Markdown Bundle Format**: Folder-based export (character.yml + spells/*.md) for human-editable bundles
- **Spell Dedupe Logic**: Match spells by canonical key (name + level + source) during import
- **Collision Handling**: UI for resolving conflicts when importing existing character names
- **Artifact Recording**: Track imported bundles with hash and timestamp
- **UI Components**: Export dialog with format selection, import dialog with preview and validation
- **E2E Testing**: Playwright tests for round-trip import/export

## Impact
- **Affected specs**: `characters` (add import/export requirements)
- **Affected code**:
  - Backend: New Rust commands for bundle import/export
  - Frontend: Import/Export UI dialogs
  - Parsers: JSON and Markdown bundle parsers
- **Breaking changes**: None
- **Dependencies**: Part 1 (Foundation) must be deployed first
- **Enables**: Part 3 (Printing/Search)
