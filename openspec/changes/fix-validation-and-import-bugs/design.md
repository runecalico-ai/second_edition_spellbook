# Design Document

## Overview

This change fixes 4 critical bugs discovered during code review. The fixes are isolated and straightforward, requiring minimal changes to existing logic.

## Technical Approach

### Fix 1: Epic Spell Validation Bypass

**File**: `spellbook/apps/desktop/src-tauri/src/commands/spells.rs`

**Current Logic** (lines 36-50):
```rust
if level > 9 {
    if is_quest_spell {
        return Err(AppError::Validation(
            "Spells above 9th level cannot be Quest Spells".into(),
        ));
    }
    if let Some(classes) = class_list {  // ← Only checks when Some
        let classes_lower = classes.to_lowercase();
        if !classes_lower.contains("wizard") && !classes_lower.contains("mage") {
            return Err(AppError::Validation(
                "Spells above 9th level are restricted to Arcane casters (Wizard/Mage)".into(),
            ));
        }
    }
}
```

**Proposed Change**:
```rust
if level > 9 {
    if is_quest_spell {
        return Err(AppError::Validation(
            "Spells above 9th level cannot be Quest Spells".into(),
        ));
    }
    // Reject if class_list is None
    let classes = class_list.as_ref().ok_or_else(|| {
        AppError::Validation(
            "Epic spells (level 10-12) require class_list with arcane casters (Wizard/Mage)".into()
        )
    })?;

    let classes_lower = classes.to_lowercase();
    if !classes_lower.contains("wizard") && !classes_lower.contains("mage") {
        return Err(AppError::Validation(
            "Epic spells (level 10-12) require class_list with arcane casters (Wizard/Mage)".into(),
        ));
    }
}
```

**Rationale**: Epic spells are inherently arcane by game rules. Missing `class_list` should be treated as invalid, not as a bypass.

---

### Fix 2: Quest Spell Validation Bypass

**File**: `spellbook/apps/desktop/src-tauri/src/commands/spells.rs`

**Current Logic** (lines 51-66):
```rust
if is_quest_spell {
    if level != 8 {
        return Err(AppError::Validation(
            "Quest spells must be level 8 (Quest level)".into(),
        ));
    }
    if let Some(classes) = class_list {  // ← Only checks when Some
        let classes_lower = classes.to_lowercase();
        let divine_classes = ["priest", "cleric", "druid", "paladin", "ranger"];
        if !divine_classes.iter().any(|&c| classes_lower.contains(c)) {
            return Err(AppError::Validation(
                "Quest spells are restricted to Divine casters (Priest/Cleric/Druid/Paladin/Ranger)".into(),
            ));
        }
    }
}
```

**Proposed Change**:
```rust
if is_quest_spell {
    if level != 8 {
        return Err(AppError::Validation(
            "Quest spells must be level 8 (Quest level)".into(),
        ));
    }
    // Reject if class_list is None
    let classes = class_list.as_ref().ok_or_else(|| {
        AppError::Validation(
            "Quest spells require class_list with divine casters (Priest/Cleric/Druid/Paladin/Ranger)".into()
        )
    })?;

    let classes_lower = classes.to_lowercase();
    let divine_classes = ["priest", "cleric", "druid", "paladin", "ranger"];
    if !divine_classes.iter().any(|&c| classes_lower.contains(c)) {
        return Err(AppError::Validation(
            "Quest spells require class_list with divine casters (Priest/Cleric/Druid/Paladin/Ranger)".into(),
        ));
    }
}
```

**Rationale**: Quest spells are inherently divine by game rules. Missing `class_list` should be treated as invalid.

---

### Fix 3: Cantrip Auto-Detection

**File**: `spellbook/services/ml/spellbook_sidecar.py`

**Current Logic** (lines 86-105):
```python
if level_val == "cantrip":
    level = 0
    is_cantrip = 1
elif level_val == "quest":
    level = 8
    is_quest = 1
elif level_val == "8" and meta.get("sphere"):
    level = 8
    is_quest = 1
else:
    try:
        level = int(level_val)
        if level == 0 and str(meta.get("is_cantrip", "0")).lower() in {
            "1",
            "true",
            "yes",
        }:
            is_cantrip = 1
    except ValueError:
        level = 0
```

**Proposed Change**:
```python
if level_val == "cantrip":
    level = 0
    is_cantrip = 1
elif level_val == "quest":
    level = 8
    is_quest = 1
elif level_val == "8" and meta.get("sphere"):
    level = 8
    is_quest = 1
else:
    try:
        level = int(level_val)
    except ValueError:
        level = 0

# Auto-detect cantrips from level 0, allow explicit override
if level == 0:
    is_cantrip_meta = str(meta.get("is_cantrip", "")).lower()
    if is_cantrip_meta in {"0", "false", "no"}:
        is_cantrip = 0  # Explicit override
    else:
        is_cantrip = 1  # Default for level 0
```

**Rationale**: In AD&D 2e, level-0 spells are cantrips by definition. This aligns with user expectations while allowing explicit overrides for edge cases.

---

### Fix 4: Modal Backdrop Dismissal

**Files**:
- `spellbook/apps/desktop/src/store/useModal.ts`
- `spellbook/apps/desktop/src/ui/components/Modal.tsx`

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

### Fix 5: Import Conflict Key Collision

**File**: `spellbook/apps/desktop/src/ui/ImportWizard.tsx`

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

### Fix 6: Character Creation Parameter Name

**File**: `spellbook/apps/desktop/src/ui/CharacterManager.tsx`

**Current Logic** (line 39-43):
```typescript
await invoke("create_character", {
  name: newCharName,
  characterType: newCharType,  // ← camelCase doesn't match backend
  notes: "",
});
```

**Proposed Change**:
```typescript
await invoke("create_character", {
  name: newCharName,
  character_type: newCharType,  // ← Fix: use snake_case to match backend
  notes: "",
});
```

**Rationale**: Tauri's IPC layer performs strict parameter name matching during deserialization. The Rust backend parameter is `character_type: String` (line 15 in `characters.rs`), so the frontend must use the exact same name.

---

### Fix 7: Filename Sanitization Collision Detection

**File**: `spellbook/apps/desktop/src-tauri/src/commands/import.rs`

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

### Fix 8: Include Identity Fields in Overwrite UPDATE

**File**: `spellbook/apps/desktop/src-tauri/src/commands/import.rs`

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

### Fix 9: Fetch Actual Character ID from Database

**File**: `spellbook/apps/desktop/src-tauri/src/commands/characters.rs`

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

**File**: `spellbook/apps/desktop/src-tauri/src/commands/spells.rs` (add tests)

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

**File**: `spellbook/services/ml/tests/test_batch_import.py` (add tests)

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

**File**: `spellbook/apps/desktop/tests/modal_backdrop.spec.ts` (new file)

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

**File**: `spellbook/apps/desktop/tests/import_conflicts.spec.ts` (add test)

```typescript
test('multiple files matching same spell have independent conflict resolutions', async ({ app, fileTracker }) => {
  // Create 3 files with same spell name/level/source
  // Import all 3
  // Verify 3 independent conflicts are shown
  // Make different resolution choices for each
  // Verify all choices are preserved
});
```

**File**: `spellbook/apps/desktop/tests/character_creation.spec.ts` (new file or add to existing)

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
