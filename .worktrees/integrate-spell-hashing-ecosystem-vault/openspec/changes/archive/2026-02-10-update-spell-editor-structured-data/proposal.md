# Update Spell Editor with Structured Data Components

**This change is Spec #3** in the spell hashing ecosystem.

### Dependencies / Spec Index
| Spec | Change | Purpose |
|------|--------|---------|
| #1 | `add-spell-canonical-hashing-foundation` | Schema, hashing |
| #2 | `add-spell-data-migration-infrastructure` | Parsing, migration |
| **#3** | **update-spell-editor-structured-data** | **Structured editor UI (this change)** |
| #4 | Spell UI Design and Accessibility | UI polish, a11y |
| #5 | `integrate-spell-hashing-ecosystem` | Import/Export |

## Problem
Currently, the spell editor treats complex fields like Range, Duration, and Components as simple strings. This prevents:
1.  **Validation**: Users can enter nonsense or skip required fields.
2.  **Consistency**: No standard format for "10 yards" vs. "10 yds".
3.  **Hashing**: We cannot compute a stable content hash on raw strings.
4.  **UX**: Users have no guidance on valid inputs.

## Solution
Implement a set of specialized React components to handle structured spell data entry:
1.  **`StructuredFieldInput`**: A reusable component for linear scalar fields with units (e.g., Range, Duration, Casting Time). Internally modular to handle distinct kind enums while sharing scalar logic.
2.  **Specialized Forms**: Dedicated components for complex fields:
    -   **`AreaForm`**: Handles various shapes (Cone, Cube, Wall, etc.) and their specific dimensions.
    -   **`DamageForm`**: Handles complex damage models (dice pools, multiple parts, scaling).
    -   **SavingThrowInput** and **MagicResistanceInput**: Enum-based selector for kind/options plus optional custom or special field (e.g. dm_guidance, raw_legacy_value) where the schema allows.
3.  **`ComponentCheckboxes`**: A dedicated input for Verbal, Somatic, and Material components, with a sub-form for material component details (name, quantity, gp_value or GP value, consumed).
4.  **Editor Integration**: Replace legacy string inputs with these new components.
5.  **Display**: Update the Spell Detail view to render structured data beautifully and show the content hash.

## Scope
### In Scope
-   Implementation of `StructuredFieldInput` component (Range, Duration, Casting Time)
-   Implementation of Specialized Forms (`AreaForm`, `DamageForm`, `SavingThrowInput`, `MagicResistanceInput`; SavingThrow and MagicResistance use enum selector + optional custom/special field pattern per spec)
-   Implementation of `ComponentCheckboxes` component with material sub-form
-   Integration into `SpellEditor` form
-   Legacy data auto-parsing on load (via Tauri backend parsers)
-   Tradition-based validation logic (e.g., Arcane requires School)
-   Input validation (numeric constraints, unit enums, locale handling)
-   `SpellDetail` view updates (hash display, badges)
-   Component documentation and API guides

### Out of Scope
-   Backend schema changes (Spec #1 - `add-spell-canonical-hashing-foundation`)
-   Data migration script (Spec #2 - `add-spell-data-migration-infrastructure`)
-   UI polish, accessibility, and E2E workflows (Spec #4 - Spell UI Design and Accessibility)
-   Import/Export (Spec #5 - `integrate-spell-hashing-ecosystem`)

### Component scope (components field)
-   Only Verbal, Somatic, and Material are editable in this change. The schema also defines `focus`, `divine_focus`, and `experience`; these remain schema defaults (false) and are not exposed in the editor UI.

## Dependencies
-   **Spec #1: `add-spell-canonical-hashing-foundation`**
    - Enforces the schema that these components must produce.
-   **Spec #2: `add-spell-data-migration-infrastructure`**
    - Provides the parsing logic needed to load legacy string data into these components.

## Migration Path

This change implements a hybrid approach to handle existing spells with legacy string data:

1. **On First Edit**: When a user opens a spell in the editor:
   - If `canonical_data` exists and contains structured data for a field, use that structured data.
   - If `canonical_data` exists but a field is missing (undefined) or null, and a legacy string exists for that field, parse the legacy string via Tauri parser commands and merge the parsed structured value into the editor state.
   - If `canonical_data` is null or missing entirely, parse all legacy strings via Tauri parser commands and populate structured inputs.

2. **After Save**: When the spell is saved:
   - Parsed structured data is stored in the `canonical_data` column as JSON.
   - Legacy string columns (e.g. `range`, `duration`, `casting_time`) remain in the database for backward compatibility but are no longer the primary source of truth.

3. **Future Edits**: On subsequent edits:
   - The editor loads structured data from `canonical_data` (no parsing needed).
   - Users edit using the structured form components.
   - Changes are saved back to `canonical_data`.

4. **Backward Compatibility**: Legacy string columns are preserved to ensure:
   - Older versions of the application can still read spell data.
   - Export/import operations can fall back to legacy format if needed.
   - Data migration scripts can reference original values.

This approach ensures a smooth transition without requiring a one-time bulk migration of all existing spells. Spells are migrated incrementally as users edit them.
