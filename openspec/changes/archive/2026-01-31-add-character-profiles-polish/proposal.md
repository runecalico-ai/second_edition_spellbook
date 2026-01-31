# Change: Add Character Profiles - Printing, Search, and Polish (Part 3 of 3)

## Why
Parts 1 and 2 established core character management and data portability. **Part 3** completes the Character Profiles feature by adding printing (character sheets and spellbook packs), search/filtering, and production-ready polish.

This implements the final requirements from `spec_3_character_profiles_feature.md`.

**Dependencies**: Requires Part 1 (Foundation) and Part 2 (Import/Export) to be completed

**Completes**: Full Character Profiles feature

## What Changes
- **Character Sheet Printing**: Generate html/Markdown character sheets with identity, abilities, and per-class spell tables
- **Spellbook Pack Printing**: Generate per-class spell packs with compact or full stat block layouts
- **Search & Filtering**: Find characters by name, type, race, class, level range, and ability thresholds
- **Performance Optimization**: Ensure search < 150ms (P95), add database indexes
- **UX Polish**: Accessibility, theming, error handling, loading states, confirmation dialogs
- **Comprehensive E2E Testing**: Full workflow tests covering create → manage → export → print → search → delete
- **Documentation**: User guides, developer docs, AGENTS.md updates

## Impact
- **Affected specs**: `characters` (add printing and search requirements)
- **Affected code**:
  - Backend: Printing commands, search commands
  - Frontend: Print dialogs, search/filter UI
  - Templates: Character sheet and spellbook pack Markdown templates
- **Breaking changes**: None
- **Dependencies**: Parts 1 and 2 must be deployed first
- **Completes**: Character Profiles feature (all milestones C0-C5)
