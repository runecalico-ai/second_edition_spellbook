# Tasks


## Import Fixes


- [ ] **Fix import conflict key collision**
  - [ ] Modify `getConflictKey` in `ImportWizard.tsx` to include index in all cases
  - [ ] Update conflict resolution logic to handle unique keys per conflict
  - [ ] Add E2E test for multiple files matching same existing spell
  - [ ] Verify conflict selections are independent

- [ ] **Fix filename sanitization collision**
  - [ ] Add collision detection in `preview_import` and `import_files` in `import.rs`
  - [ ] Track sanitized filenames in a HashMap
  - [ ] Return clear error when collision detected
  - [ ] Add Rust test for filename collision detection
  - [ ] Add E2E test for importing files that sanitize to same name

- [ ] **Fix overwrite omitting identity fields**
  - [ ] Update UPDATE statement in `import.rs` (lines 384-395) to include `name`, `level`, `source`
  - [ ] Update UPDATE statement in confirmation path (lines 508-519) to include `name`, `level`, `source`
  - [ ] Add Rust test for overwrite updating identity fields
  - [ ] Add E2E test for importing spell with changed name/level/source in overwrite mode

## UI Fixes

- [ ] **Fix character IPC parameter mismatch (camelCase standardization)**
  - [ ] Add `#[serde(rename_all = "camelCase")]` to all structs in `character.rs`
  - [ ] Update `types/character.ts` to use `camelCase` for all interfaces
  - [ ] Global search and replace `character_type` → `characterType` in frontend
  - [ ] Global search and replace `character_id` → `characterId` (where it refers to property)
  - [ ] Global search and replace `class_name` → `className`
  - [ ] Global search and replace `class_label` → `classLabel`
  - [ ] Verify character creation and updates work in the UI
  - [ ] Add E2E test for character creation flow

- [ ] **Fix character_id hardcoded to zero**
  - [ ] Update SQL query in `get_character_class_spells` to join with `character_class` table
  - [ ] Add `cc.character_id` to SELECT statement
  - [ ] Update row mapping to get `character_id` from index 0 (shift all other indices by 1)
  - [ ] Apply fix to both query branches (with and without list_type filter)
  - [ ] Add Rust test to verify character_id is returned correctly
  - [ ] Add E2E test for character spell list returning correct character_id

- [ ] **Fix modal backdrop promise hang**
  - [ ] Add `dismissible` flag to `ModalState` in `useModal.ts` (default: true)
  - [ ] Update `alert()` and `confirm()` helpers to set `dismissible: false`
  - [ ] Modify `Modal.tsx` backdrop to check `dismissible` before calling `hideModal()`
  - [ ] Add E2E test for alert modal backdrop click (should not dismiss)
  - [ ] Add E2E test for confirm modal backdrop click (should not dismiss)

## Testing & Validation

- [ ] **Run existing test suites**
  - [ ] Run Rust tests: `cargo test` in `src-tauri/`
  - [ ] Run Python tests: `pytest` in `services/ml/tests/`
  - [ ] Run E2E tests: `npx playwright test` in `apps/desktop/`
  - [ ] Verify all tests pass

- [ ] **Manual validation**
  - [ ] Import multiple files matching same spell (should show independent conflict resolutions)
  - [ ] Click backdrop on alert modal (should not dismiss)
  - [ ] Create a new character (should work without errors)
  - [ ] Import files with names that sanitize to same value (should reject with clear error)
  - [ ] Import spell with changed name in overwrite mode (should update name in database)
  - [ ] Fetch character class spells and verify character_id is not 0

## Documentation

- [ ] Update `AGENTS.md` if validation rules changed
- [ ] Update spec deltas in OpenSpec
