# Design Document

## Overview

This change fixes 4 critical bugs discovered during code review. The fixes are isolated and straightforward, requiring minimal changes to existing logic.

## Technical Approach



### Fix 1: Modal Backdrop Dismissal

**Files**:
- `apps/desktop/src/store/useModal.ts`
- `apps/desktop/src/ui/components/Modal.tsx`

**Current Logic**:
- `Modal.tsx` line 29: Backdrop always calls `hideModal()`
- `useModal.ts` lines 49-95: Promises only resolve via button `onClick` handlers

**Proposed Changes**:

**useModal.ts**:
```typescript
interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string | string[];
  buttons: ModalButton[];
  dismissible?: boolean;  // ← Add this
  onClose?: () => void;
}

alert: (message, title = "Notice", type = "info") => {
  return new Promise((resolve) => {
    get().showModal({
      title,
      message,
      type,
      dismissible: false,  // ← Add this
      buttons: [
        {
          label: "OK",
          variant: "primary",
          onClick: () => {
            get().hideModal();
            resolve();
          },
        },
      ],
    });
  });
},

confirm: (message, title = "Confirm") => {
  return new Promise((resolve) => {
    get().showModal({
      title,
      message,
      type: "warning",
      dismissible: false,  // ← Add this
      buttons: [
        // ... existing buttons
      ],
    });
  });
},
```

**Modal.tsx**:
```tsx
export default function Modal() {
  const { isOpen, type, title, message, buttons, dismissible = true, hideModal } = useModal();

  // ...

  <button
    type="button"
    aria-label="Close modal"
    className="..."
    onClick={() => {
      if (dismissible) {  // ← Add this check
        hideModal();
      }
    }}
  />
```

**Rationale**: Alert/confirm modals require explicit user action. Backdrop dismissal creates ambiguous state (no promise resolution).

---

### Fix 2: Import Conflict Key Collision

**File**: `apps/desktop/src/ui/ImportWizard.tsx`

**Current Logic** (lines 158-159):
```typescript
const getConflictKey = (conflict: SpellConflict, index: number) =>
  conflict.existing.id ? `${conflict.existing.id}` : `${conflict.incoming.name}-${index}`;
```

**Proposed Change**:
```typescript
const getConflictKey = (conflict: SpellConflict, index: number) =>
  conflict.existing.id ? `${conflict.existing.id}-${index}` : `${conflict.incoming.name}-${index}`;
```

**Rationale**: Each conflict represents a unique resolution decision. Including the index ensures unique keys even when multiple files match the same existing spell.

---

### Fix 3: Character Model Modernization (camelCase standardization)

**Files**:
- `apps/desktop/src-tauri/src/models/character.rs`
- `apps/desktop/src/types/character.ts`
- `apps/desktop/src/ui/CharacterManager.tsx`
- `apps/desktop/src/ui/CharacterEditor.tsx`

**Current Problem**: The project mixes `camelCase` (JS standard) and `snake_case` (Rust target). Functions like `create_character` and `update_character_details` fail or use inconsistent property names because backend structs aren't configured for `camelCase` renaming.

**Proposed Changes**:

1. **Rust Models (`character.rs`)**:
   Add `#[serde(rename_all = "camelCase")]` to all character structs used for IPC.
   ```rust
   #[derive(serde::Serialize, serde::Deserialize)]
   #[serde(rename_all = "camelCase")]
   pub struct Character {
       pub character_type: String, // Becomes .characterType in JS
       ...
   }
   ```

2. **TypeScript Types (`character.ts`)**:
   Standardize interfaces to `camelCase`.
   ```typescript
   export interface Character {
     characterType: CharacterType;
     ...
   }
   ```

3. **Frontend Components**:
   Update usages of `character_type` to `characterType`, `class_name` to `className`, etc.

**Rationale**: Adhering to Tauri's intended `camelCase` bridge ensures the frontend remains idiomatic JavaScript while maintaining strict type safety and fixing all deserialization errors.

---

### Fix 4: Filename Sanitization Collision Detection

**File**: `apps/desktop/src-tauri/src/commands/import.rs`

**Current Logic** (lines 193-198 in preview, 252-263 in import):
```rust
for file in files {
    let (safe_name, _) = sanitize_import_filename(&file.name);
    let path = dir.join(&safe_name);
    fs::write(&path, &file.content)?;  // ← Overwrites if collision
    paths.push(path);
}
```

**Proposed Change**:
```rust
let mut seen_names = HashMap::new();
for file in &files {
    let (safe_name, changed) = sanitize_import_filename(&file.name);

    // Detect collision
    if let Some(original) = seen_names.get(&safe_name) {
        return Err(AppError::Validation(format!(
            "Filename collision: '{}' and '{}' both sanitize to '{}'",
            original, file.name, safe_name
        )));
    }

    if changed {
        all_warnings.push(format!(
            "Sanitized import file name '{}' to '{}'.",
            file.name, safe_name
        ));
    }

    seen_names.insert(safe_name.clone(), file.name.clone());
    let path = dir.join(&safe_name);
    fs::write(&path, &file.content)?;
    paths.push(path);
}
```

**Rationale**: Detecting collisions early prevents silent data loss. Users get clear error messages showing which files conflict, allowing them to rename files before retrying.

---

### Fix 5: Include Identity Fields in Overwrite UPDATE

**File**: `apps/desktop/src-tauri/src/commands/import.rs`

**Current Logic** (lines 384-395 and 508-519):
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

**Proposed Change**:
```rust
conn.execute(
    "UPDATE spell SET name=?, level=?, source=?, school=?, sphere=?, class_list=?, range=?, components=?,
    material_components=?, casting_time=?, duration=?, area=?, saving_throw=?,
    reversible=?, description=?, tags=?, edition=?, author=?, license=?,
    is_quest_spell=?, is_cantrip=?, updated_at=? WHERE id=?",
    params![
        spell.name, spell.level, spell.source,  // ← Add these at the beginning
        spell.school, spell.sphere, spell.class_list, spell.range, spell.components,
        spell.material_components, spell.casting_time, spell.duration, spell.area, spell.saving_throw,
        spell.reversible.unwrap_or(0), spell.description, spell.tags, spell.edition, spell.author, spell.license,
        spell.is_quest_spell, spell.is_cantrip, Utc::now().to_rfc3339(), id
    ]
)?;
```

**Rationale**: Users expect "overwrite" to update all fields. This allows correcting spell names, levels, or sources via import. The WHERE clause still uses the ID, so the update is safe.

---

### Fix 6: Fetch Actual Character ID from Database

**File**: `apps/desktop/src-tauri/src/commands/characters.rs`

**Current Logic** (lines 333-400):
```rust
let query = if list_type.is_some() {
    "SELECT s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
            CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
            CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
            ccs.notes,
            s.tags
     FROM character_class_spell ccs
     JOIN spell s ON s.id = ccs.spell_id
     WHERE ccs.character_class_id = ? AND ccs.list_type = ?
     ORDER BY s.level, s.name"
} else {
    // ... similar query without list_type filter
};

// Row mapping
Ok(CharacterSpellbookEntry {
    character_id: 0,  // ← Hardcoded!
    spell_id: row.get(0)?,
    spell_name: row.get(1)?,
    // ...
})
```

**Proposed Change**:
```rust
let query = if list_type.is_some() {
    "SELECT cc.character_id, s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
            CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
            CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
            ccs.notes,
            s.tags
     FROM character_class_spell ccs
     JOIN spell s ON s.id = ccs.spell_id
     JOIN character_class cc ON cc.id = ccs.character_class_id  // ← Add join
     WHERE ccs.character_class_id = ? AND ccs.list_type = ?
     ORDER BY s.level, s.name"
} else {
    "SELECT cc.character_id, s.id, s.name, s.level, s.school, s.sphere, s.is_quest_spell, s.is_cantrip,
            CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
            CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
            ccs.notes,
            s.tags
     FROM character_class_spell ccs
     JOIN spell s ON s.id = ccs.spell_id
     JOIN character_class cc ON cc.id = ccs.character_class_id  // ← Add join
     WHERE ccs.character_class_id = ?
     ORDER BY s.level, s.name"
};

// Update row mapping (shift all indices by 1)
Ok(CharacterSpellbookEntry {
    character_id: row.get(0)?,  // ← Get from query
    spell_id: row.get(1)?,
    spell_name: row.get(2)?,
    spell_level: row.get(3)?,
    spell_school: row.get(4)?,
    spell_sphere: row.get(5)?,
    is_quest_spell: row.get(6)?,
    is_cantrip: row.get(7)?,
    prepared: row.get(8)?,
    known: row.get(9)?,
    notes: row.get(10)?,
    tags: row.get(11)?,
})
```

**Rationale**: The `CharacterSpellbookEntry` structure includes `character_id` for a reason. Returning the correct value ensures UI and logic can properly identify which character owns the spell list.

---

## Testing Strategy

### Unit Tests (Rust)

**File**: `apps/desktop/src-tauri/src/commands/spells.rs` (add tests)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epic_spell_without_class_list() {
        let result = validate_epic_and_quest_spells(10, &None, false, false);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Epic spells"));
    }

    #[test]
    fn test_epic_spell_with_divine_only_class_list() {
        let result = validate_epic_and_quest_spells(
            10,
            &Some("Priest, Cleric".into()),
            false,
            false
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("arcane casters"));
    }

    #[test]
    fn test_quest_spell_without_class_list() {
        let result = validate_epic_and_quest_spells(8, &None, true, false);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Quest spells"));
    }

    #[test]
    fn test_quest_spell_with_arcane_only_class_list() {
        let result = validate_epic_and_quest_spells(
            8,
            &Some("Wizard, Mage".into()),
            true,
            false
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("divine casters"));
    }
}
```

### Unit Tests (Python)

**File**: `services/ml/tests/test_batch_import.py` (add tests)

```python
def test_cantrip_auto_detection_from_numeric_level(tmp_path: Path):
    """Verify that level: 0 automatically sets is_cantrip."""
    path = tmp_path / "cantrip.md"
    path.write_text("""---
name: Test Cantrip
level: 0
school: Evocation
---
A simple cantrip.""", encoding="utf-8")

    sidecar = _load_sidecar_module()
    spell = sidecar._spell_from_markdown(path)

    assert spell["level"] == 0
    assert spell["is_cantrip"] == 1

def test_cantrip_explicit_override(tmp_path: Path):
    """Verify that is_cantrip: false overrides auto-detection."""
    path = tmp_path / "not_cantrip.md"
    path.write_text("""---
name: Test Level 0
level: 0
is_cantrip: false
school: Evocation
---
A level 0 spell that is not a cantrip.""", encoding="utf-8")

    sidecar = _load_sidecar_module()
    spell = sidecar._spell_from_markdown(path)

    assert spell["level"] == 0
    assert spell["is_cantrip"] == 0
```

### E2E Tests (Playwright)

**File**: `apps/desktop/tests/modal_backdrop.spec.ts` (new file)

```typescript
import { test, expect } from './fixtures/test-fixtures';

test('alert modal cannot be dismissed via backdrop', async ({ app }) => {
  // Trigger an alert modal (e.g., via validation error)
  // Click backdrop
  // Verify modal is still open
});

test('confirm modal cannot be dismissed via backdrop', async ({ app }) => {
  // Trigger a confirm modal
  // Click backdrop
  // Verify modal is still open
});
```

**File**: `apps/desktop/tests/import_conflicts.spec.ts` (add test)

```typescript
test('multiple files matching same spell have independent conflict resolutions', async ({ app, fileTracker }) => {
  // Create 3 files with same spell name/level/source
  // Import all 3
  // Verify 3 independent conflicts are shown
  // Make different resolution choices for each
  // Verify all choices are preserved
});
```

**File**: `apps/desktop/tests/character_creation.spec.ts` (new file or add to existing)

```typescript
test('character creation works with correct parameter names', async ({ app }) => {
  // Navigate to Characters page
  // Enter character name
  // Click create button
  // Verify character appears in list
  // Verify no errors in console
});
```

---

## Rollout Plan

1. **Implement fixes** in order: Rust validation → Python import → TypeScript UI (character creation, modal, import wizard)
2. **Run unit tests** after each fix
3. **Run E2E tests** after all fixes
4. **Manual validation** of key scenarios
5. **Deploy** with clear release notes about validation changes

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Fix 1/2 may reject previously-accepted spells | Clear validation error messages guide users to add `class_list` |
| Fix 3 may auto-flag non-cantrip level-0 spells | Allow explicit `is_cantrip: false` override |
| Fix 4 changes modal UX behavior | Only affects alert/confirm, not custom modals |
| Fix 5 may break existing conflict resolution | Pure bug fix, no behavior change for valid cases |
| Fix 6 may break character creation if other params change | Pure bug fix that enables currently broken functionality |
| Fix 7 may reject imports that previously succeeded silently | Clear error messages guide users to rename files |
| Fix 8 may change existing spell identity fields on re-import | Document that overwrite now updates all fields |
| Fix 9 may break code expecting character_id to be 0 | Pure bug fix that returns correct data |
