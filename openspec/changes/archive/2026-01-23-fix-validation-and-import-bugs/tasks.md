# Tasks


## Import Fixes


- [x] **Fix import conflict key collision**
  - [x] Modify `getConflictKey` in `ImportWizard.tsx` to include index in all cases
  - [x] Update conflict resolution logic to handle unique keys per conflict
  - [x] Add E2E test for multiple files matching same existing spell
  - [x] Verify conflict selections are independent

- [x] **Fix filename sanitization collision**
  - [x] Add collision detection in `preview_import` and `import_files` in `import.rs`
  - [x] Track sanitized filenames in a HashMap
  - [x] Return clear error when collision detected
  - [x] Add Rust test for filename collision detection
  - [x] Add E2E test for importing files that sanitize to same name

- [x] **Fix overwrite omitting identity fields**
  - [x] Update UPDATE statement in `import.rs` (lines 384-395) to include `name`, `level`, `source`
  - [x] Update UPDATE statement in confirmation path (lines 508-519) to include `name`, `level`, `source`
  - [x] Add Rust test for overwrite updating identity fields
  - [x] Add E2E test for importing spell with changed name/level/source in overwrite mode

## UI Fixes

- [x] **Fix character IPC parameter mismatch (camelCase standardization)**
  - [x] Add `#[serde(rename_all = "camelCase")]` to all structs in `character.rs`
  - [x] Update `types/character.ts` to use `camelCase` for all interfaces
  - [x] Global search and replace `character_type` → `characterType` in frontend
  - [x] Global search and replace `character_id` → `characterId` (where it refers to property)
  - [x] Global search and replace `class_name` → `className`
  - [x] Global search and replace `class_label` → `classLabel`
  - [x] Verify character creation and updates work in the UI
  - [x] Add E2E test for character creation flow

- [x] **Fix character_id hardcoded to zero**
  - [x] Update SQL query in `get_character_class_spells` to join with `character_class` table
  - [x] Add `cc.character_id` to SELECT statement
  - [x] Update row mapping to get `character_id` from index 0 (shift all other indices by 1)
  - [x] Apply fix to both query branches (with and without list_type filter)
  - [x] Add Rust test to verify character_id is returned correctly
  - [x] Add E2E test for character spell list returning correct character_id

- [x] **Fix modal backdrop promise hang**
  - [x] Add `dismissible` flag to `ModalState` in `useModal.ts` (default: true)
  - [x] Update `alert()` and `confirm()` helpers to set `dismissible: false`
  - [x] Modify `Modal.tsx` backdrop to check `dismissible` before calling `hideModal()`
  - [x] Add E2E test for alert modal backdrop click (should not dismiss)
  - [x] Add E2E test for confirm modal backdrop click (should not dismiss)

## Testing & Validation

- [x] **Run existing test suites**
  - [x] Run Rust tests: `cargo test` in `src-tauri/`
  - [x] Run Python tests: `pytest` in `services/ml/tests/`
  - [x] Run E2E tests: `npx playwright test` in `apps/desktop/`
  - [x] Verify all tests pass

- [x] **Manual validation**
  - [x] Import multiple files matching same spell (should show independent conflict resolutions)
  - [x] Click backdrop on alert modal (should not dismiss)
  - [x] Create a new character (should work without errors)
  - [x] Import files with names that sanitize to same value (should reject with clear error)
  - [x] Import spell with changed name in overwrite mode (should update name in database)
  - [x] Fetch character class spells and verify character_id is not 0

## Documentation

- [x] Update `AGENTS.md` if validation rules changed
- [x] Update spec deltas in OpenSpec
