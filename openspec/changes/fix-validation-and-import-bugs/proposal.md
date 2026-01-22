# Fix Validation and Import Bugs

## Overview

This change addresses 8 critical bugs discovered during code review:

1. **Spell Validation Bypass**: Epic (10-12) and Quest spells can bypass class restrictions when `class_list` is null/missing
2. **Missing Cantrip Flags**: Markdown imports with `level: 0` don't set the cantrip flag, causing UI/filter issues
3. **Modal Backdrop Promise Hang**: Clicking modal backdrop doesn't resolve promises from `alert()`/`confirm()`, causing code to hang
4. **Import Conflict Key Collision**: Multiple files matching the same spell create duplicate conflict keys, causing UI and resolution bugs
5. **Character Creation Parameter Mismatch**: Frontend uses `characterType` (camelCase) but backend expects `character_type` (snake_case), breaking character creation
6. **Import Filename Collision**: Multiple files with different names can sanitize to the same filename, causing silent data loss
7. **Overwrite Omits Identity Fields**: Import overwrite doesn't update `name`, `level`, or `source` fields, preventing identity changes
8. **Character ID Hardcoded to Zero**: `get_character_class_spells` returns `character_id: 0` instead of actual character ID

## Problem Statement

### Bug 1: Spell Validation Bypass (spells.rs)

**Location**: `spellbook/apps/desktop/src-tauri/src/commands/spells.rs:27-68`

The `validate_epic_and_quest_spells` function only enforces arcane/divine restrictions when `class_list` is `Some(...)`. When `class_list` is `None`:
- Epic spells (level 10-12) bypass the arcane-only check
- Quest spells bypass the divine-only check

**Impact**: Imported data or API calls that omit `class_list` can create invalid spells (e.g., a level-10 divine spell, or a quest spell with arcane school).

### Bug 2: Missing Cantrip Flags (spellbook_sidecar.py)

**Location**: `spellbook/services/ml/spellbook_sidecar.py:86-105`

The `_spell_from_markdown` function only sets `is_cantrip = 1` when:
- `level_val == "cantrip"` (string literal), OR
- `level == 0` AND explicit `is_cantrip` metadata exists

**Impact**: Markdown files with `level: 0` (numeric) import as regular level-0 spells, not cantrips. They won't show the Cantrip badge or match Cantrip-only filters.

### Bug 3: Modal Backdrop Promise Hang (Modal.tsx)

**Location**: `spellbook/apps/desktop/src/ui/components/Modal.tsx:25-30`

Clicking the modal backdrop calls `hideModal()` but doesn't resolve the Promise returned by `useModal.alert()` or `useModal.confirm()`. Promises only resolve via button `onClick` handlers.

**Impact**: Code awaiting modal results (e.g., validation errors, confirmation dialogs) hangs indefinitely if users dismiss via backdrop click.

### Bug 4: Import Conflict Key Collision (ImportWizard.tsx)

**Location**: `spellbook/apps/desktop/src/ui/ImportWizard.tsx:158-159`

The `getConflictKey` function returns only `existing.id` when multiple incoming files match the same existing spell:

```typescript
const getConflictKey = (conflict: SpellConflict, index: number) =>
  conflict.existing.id ? `${conflict.existing.id}` : `${conflict.incoming.name}-${index}`;
```

**Impact**:
- React list key collisions (warnings/errors)
- `conflictSelections` state overwrites (user choices lost)
- Backend receives multiple resolutions for the same spell ID with only the last one applied

### Bug 5: Character Creation Parameter Mismatch (CharacterManager.tsx)

**Location**: `spellbook/apps/desktop/src/ui/CharacterManager.tsx:41`

The frontend calls `create_character` with `characterType` (camelCase):

```typescript
await invoke("create_character", {
  name: newCharName,
  characterType: newCharType,  // ← camelCase
  notes: "",
});
```

But the backend expects `character_type` (snake_case):

```rust
pub async fn create_character(
    state: State<'_, Arc<Pool>>,
    name: String,
    character_type: String,  // ← snake_case
    notes: Option<String>,
) -> Result<i64, AppError>
```

**Impact**: Tauri's IPC layer performs strict parameter name matching during deserialization. The mismatch causes deserialization to fail, preventing character creation entirely. Users see an error alert when trying to create new characters.

### Bug 6: Import Filename Collision (import.rs)

**Location**: `spellbook/apps/desktop/src-tauri/src/commands/import.rs:36-41, 195-198, 254-263`

The `sanitize_import_filename` function replaces non-safe characters with `_`:

```rust
fn sanitize_import_filename(name: &str) -> (String, bool) {
    let re = Regex::new(r"[^a-zA-Z0-9._-]").unwrap();
    let sanitized = re.replace_all(name, "_").to_string();
    let changed = sanitized != name;
    (sanitized, changed)
}
```

When multiple files sanitize to the same name (e.g., `a/b.md` and `a?b.md` both become `a_b.md`), the second `fs::write` call overwrites the first:

```rust
let (safe_name, _) = sanitize_import_filename(&file.name);
let path = dir.join(&safe_name);
fs::write(&path, &file.content)?;  // ← Overwrites if collision
```

**Impact**: Silent data loss during import. Multiple files collapse into one on disk, and preview/import results can be wrong or incomplete. Users won't know that some files were lost.

### Bug 7: Overwrite Omits Identity Fields (import.rs)

**Location**: `spellbook/apps/desktop/src-tauri/src/commands/import.rs:384-395, 508-519`

The UPDATE statements for overwrite mode omit `name`, `level`, and `source`:

```rust
conn.execute(
    "UPDATE spell SET school=?, sphere=?, class_list=?, range=?, components=?,
    material_components=?, casting_time=?, duration=?, area=?, saving_throw=?,
    reversible=?, description=?, tags=?, edition=?, author=?, license=?,
    is_quest_spell=?, is_cantrip=?, updated_at=? WHERE id=?",
    // ← name, level, source are NOT updated
    params![/* ... */]
)?;
```

The WHERE clause uses these fields to find the spell (lines 328-332):

```rust
let existing_id: Option<i64> = conn.query_row(
    "SELECT id FROM spell WHERE name = ? AND level = ? AND source IS ?",
    params![spell.name, spell.level, spell.source],
    |row| row.get(0),
).optional()?;
```

**Impact**: Users cannot update a spell's identity fields via import, even with overwrite enabled. This leads to confusing mismatches between imported data and stored records (e.g., importing a corrected spell name won't update the database).

### Bug 8: Character ID Hardcoded to Zero (characters.rs)

**Location**: `spellbook/apps/desktop/src-tauri/src/commands/characters.rs:359, 381`

The `get_character_class_spells` function hardcodes `character_id: 0` in both query branches:

```rust
Ok(CharacterSpellbookEntry {
    character_id: 0,  // ← Hardcoded!
    spell_id: row.get(0)?,
    spell_name: row.get(1)?,
    // ...
})
```

The SQL query doesn't fetch the `character_id` from the database:

```rust
"SELECT s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
        CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
        CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
        ccs.notes,
        s.tags
 FROM character_class_spell ccs
 JOIN spell s ON s.id = ccs.spell_id
 WHERE ccs.character_class_id = ? AND ccs.list_type = ?"
// ← No character_id in SELECT
```

**Impact**: Any UI or downstream logic relying on `character_id` will receive incorrect data (always 0). This could break features that need to know which character owns the spell list, such as displaying character names or filtering by character.

## Proposed Solution

### Fix 1: Enforce Validation Regardless of class_list

**Change**: Modify `validate_epic_and_quest_spells` to enforce restrictions even when `class_list` is `None`.

**Approach**:
- For epic spells (level > 9): Reject if `class_list` is `None` OR doesn't contain arcane classes
- For quest spells: Reject if `class_list` is `None` OR doesn't contain divine classes

**Rationale**: Epic and Quest spells have inherent class restrictions by game rules. Missing `class_list` should be treated as invalid, not as a bypass.

### Fix 2: Auto-detect Cantrips from Level 0

**Change**: Modify `_spell_from_markdown` to automatically set `is_cantrip = 1` for all level-0 spells unless explicitly overridden.

**Approach**:
- After parsing `level`, check if `level == 0`
- Set `is_cantrip = 1` by default
- Allow explicit `is_cantrip: false` metadata to override (for edge cases)

**Rationale**: In AD&D 2nd Edition, level-0 spells are cantrips by definition. This aligns with user expectations.

### Fix 3: Disable Backdrop Dismissal for Alert/Confirm

**Change**: Prevent backdrop clicks from closing `alert()` and `confirm()` modals.

**Approach**:
- Add a `dismissible` flag to modal state (default: true)
- Set `dismissible: false` for `alert()` and `confirm()` helpers
- Only call `hideModal()` on backdrop click if `dismissible` is true

**Rationale**: Alert/confirm modals require explicit user action. Backdrop dismissal creates ambiguous state (no resolution).

### Fix 4: Include Index in Conflict Keys

**Change**: Modify `getConflictKey` to include the conflict index in all cases.

**Approach**:
```typescript
const getConflictKey = (conflict: SpellConflict, index: number) =>
  conflict.existing.id ? `${conflict.existing.id}-${index}` : `${conflict.incoming.name}-${index}`;
```

**Rationale**: Each conflict represents a unique resolution decision, even if they share the same existing spell ID.

### Fix 5: Use snake_case for Tauri IPC Parameters

**Change**: Modify the frontend to use `character_type` instead of `characterType`.

**Approach**:
```typescript
await invoke("create_character", {
  name: newCharName,
  character_type: newCharType,  // ← Fix: use snake_case
  notes: "",
});
```

**Rationale**: Tauri IPC requires exact parameter name matching. The Rust backend uses snake_case convention, so the frontend must match.

### Fix 6: Add Collision Detection for Sanitized Filenames

**Change**: Track sanitized filenames and detect collisions before writing.

**Approach**:
```rust
let mut seen_names = HashMap::new();
for file in &files {
    let (safe_name, _) = sanitize_import_filename(&file.name);

    // Detect collision
    if let Some(original) = seen_names.get(&safe_name) {
        return Err(AppError::Validation(format!(
            "Filename collision: '{}' and '{}' both sanitize to '{}'",
            original, file.name, safe_name
        )));
    }

    seen_names.insert(safe_name.clone(), file.name.clone());
    let path = dir.join(&safe_name);
    fs::write(&path, &file.content)?;
}
```

**Rationale**: Detecting collisions early prevents silent data loss and gives users clear error messages to fix the issue.

### Fix 7: Include Identity Fields in Overwrite UPDATE

**Change**: Add `name`, `level`, and `source` to the UPDATE statement.

**Approach**:
```rust
conn.execute(
    "UPDATE spell SET name=?, level=?, source=?, school=?, sphere=?, class_list=?, range=?, components=?,
    material_components=?, casting_time=?, duration=?, area=?, saving_throw=?,
    reversible=?, description=?, tags=?, edition=?, author=?, license=?,
    is_quest_spell=?, is_cantrip=?, updated_at=? WHERE id=?",
    params![
        spell.name, spell.level, spell.source,  // ← Add these
        spell.school, spell.sphere, spell.class_list, /* ... */
    ]
)?;
```

**Rationale**: Users expect "overwrite" to update all fields, including identity fields. This allows correcting spell names, levels, or sources via import. The WHERE clause still uses the ID, so the update is safe.

### Fix 9: Fetch Actual Character ID from Database

**Change**: Join with `character_class` table and fetch the actual `character_id`.

**Approach**:
```rust
// Update query to include character_id
let query = if list_type.is_some() {
    "SELECT cc.character_id, s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
            CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
            CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
            ccs.notes,
            s.tags
     FROM character_class_spell ccs
     JOIN spell s ON s.id = ccs.spell_id
     JOIN character_class cc ON cc.id = ccs.character_class_id  // ← Add this join
     WHERE ccs.character_class_id = ? AND ccs.list_type = ?
     ORDER BY s.level, s.name"
} else {
    // ... similar for the other branch
};

// Update row mapping (shift all indices by 1)
Ok(CharacterSpellbookEntry {
    character_id: row.get(0)?,  // ← Get from query
    spell_id: row.get(1)?,
    spell_name: row.get(2)?,
    spell_level: row.get(3)?,
    // ... etc
})
```

**Rationale**: The `CharacterSpellbookEntry` structure includes `character_id` for a reason. Returning the correct value ensures UI and logic can properly identify which character owns the spell list.

## Scope

### In Scope
- Fix all 8 bugs as described
- Add/update tests to prevent regression
- Update documentation if needed

### Out of Scope
- Refactoring unrelated validation logic
- UI/UX improvements beyond bug fixes
- Performance optimizations

## Dependencies

None. These are isolated bug fixes.

## Risks

- **Fix 1**: May reject previously-accepted spells during import/update. Mitigation: Clear validation error messages.
- **Fix 2**: May auto-flag non-cantrip level-0 spells. Mitigation: Allow explicit override via metadata.
- **Fix 3**: Changes modal UX behavior. Mitigation: Only affects alert/confirm, not custom modals.
- **Fix 4**: None. Pure bug fix.
- **Fix 5**: None. Pure bug fix that enables broken functionality.
- **Fix 6**: May reject imports that previously succeeded silently. Mitigation: Clear error messages guide users to rename files.
- **Fix 7**: May change existing spell identity fields on re-import. Mitigation: Document that overwrite now updates all fields.
- **Fix 9**: None. Pure bug fix that returns correct data.

## Success Criteria

1. Epic/Quest spells with missing `class_list` are rejected with clear error messages
2. Markdown imports with `level: 0` correctly set `is_cantrip` flag
3. Alert/confirm modals cannot be dismissed via backdrop click
4. Multiple import conflicts for the same spell have unique keys and independent resolutions
5. Character creation works correctly with proper parameter name matching
6. Import rejects files that sanitize to the same filename with clear error messages
7. Overwrite mode updates all spell fields including `name`, `level`, and `source`
8. `get_character_class_spells` returns the actual `character_id` instead of 0
9. All existing tests pass
10. New tests cover regression scenarios
