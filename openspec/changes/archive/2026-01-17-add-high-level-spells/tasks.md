# Tasks: Add High-Level Spells

## 1. Database & Models
- [ ] 1.1 Create migration `0006_add_cantrip_flag.sql` adding `is_cantrip` column (Default 0, Version 6)
- [ ] 1.2 Update `migrations.rs` to load and apply migration v6
- [ ] 1.3 Update `SpellSummary`, `SpellCreate`, `SpellUpdate`, and `SpellDetail` structs in `models/spell.rs` to include `is_cantrip` (Note: `is_quest_spell` is already present)
- [ ] 1.4 Update `get_spell_from_conn` and other database queries in `spells.rs` to handle the new field
- [ ] 1.5 Update `diff_spells` and `log_changes` logic in `spells.rs` to track the new flag
- [ ] 1.6 Update `search_keyword_with_conn` in `search.rs` to use the `is_cantrip` column instead of `level = 0`

## 2. Backend Validation
- [ ] 2.1 Update `validate_spell_fields` in `spells.rs` to allow levels 0-12
- [ ] 2.2 Implement `validate_epic_and_quest_spells` in `spells.rs` (Arcane levels, Quest spells, Cantrip/Level 0 check)
- [ ] 2.3 Call validation from `create_spell`, `update_spell`, and `upsert_spell`

## 3. Frontend UI Updates
- [ ] 3.1 Update `Library.tsx` level slider max and default range to 12
- [ ] 3.2 Add Quest and Cantrip spell filter toggles to `Library.tsx`
- [ ] 3.3 Add `is_quest_spell` and `is_cantrip` toggles and validation UI to `SpellEditor.tsx`
- [ ] 3.4 Implement conditional visibility/disabling of school/sphere/quest-toggle in `SpellEditor.tsx`
- [ ] 3.5 Implement visual badges and editor indicators for "Epic", "Quest", and "Cantrip"
- [ ] 3.5 Update `SpellbookBuilder.tsx` to ensure level filters 10-12 are always available

## 4. Import / Export
- [ ] 4.1 Update `ImportWizard.tsx` and mapping logic to support `is_quest_spell` and `is_cantrip`
- [ ] 4.2 Add high-level validation and warnings (with suppression) to the import process

## 5. Verification
- [ ] 5.1 Run `cargo test` to verify backend validation logic
- [ ] 5.2 Add Playwright E2E tests for epic spell creation, filtering, and restrictions
- [ ] 5.3 Add Playwright E2E tests for Quest spell creation, filtering, and restrictions
- [ ] 5.4 Verify import/export flow for high-level content
