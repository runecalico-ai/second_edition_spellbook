# Update Spell Editor with Structured Data Components

## Problem
Currently, the spell editor treats complex fields like Range, Duration, and Components as simple strings. This prevents:
1.  **Validation**: Users can enter nonsense or skip required fields.
2.  **Consistency**: No standard format for "10 yards" vs. "10 yds".
3.  **Hashing**: We cannot compute a stable content hash on raw strings.
4.  **UX**: Users have no guidance on valid inputs.

## Solution
Implement a set of specialized React components to handle structured spell data entry:
1.  **`StructuredFieldInput`**: A reusable component for linear scalar fields with units (e.g., Range, Duration, Casting Time).
2.  **Specialized Forms**: Dedicated components for complex fields:
    -   **`AreaForm`**: Handles various shapes (Cone, Cube, Wall, etc.) and their specific dimensions.
    -   **`DamageForm`**: Handles complex damage models (dice pools, multiple parts, scaling).
    -   **`SelectOrCustomInput`**: For enum-based fields like Saving Throw and Magic Resistance.
2.  **`ComponentCheckboxes`**: A dedicated input for Verbal, Somatic, and Material components, with a sub-form for material component details (name, quantity, cost, consumed).
3.  **Editor Integration**: Replace legacy string inputs with these new components.
4.  **Display**: Update the Spell Detail view to render structured data beautifully and show the content hash.

## Scope
### In Scope
-   Implementation of `StructuredFieldInput` component (Range, Duration, Casting Time)
-   Implementation of Specialized Forms (`AreaForm`, `DamageForm`, `SavingThrowInput`, `MagicResistanceInput`)
-   Implementation of `ComponentCheckboxes` component with material sub-form
-   Integration into `SpellEditor` form
-   Legacy data auto-parsing on load (via Tauri backend parsers)
-   Tradition-based validation logic (e.g., Arcane requires School)
-   Input validation (numeric constraints, unit enums, locale handling)
-   `SpellDetail` view updates (hash display, badges)
-   Component documentation and API guides

### Out of Scope
-   Backend schema changes (handled in Spec #1 - `add-spell-canonical-hashing-foundation`)
-   Data migration script (handled in Spec #2 - `add-spell-data-migration-infrastructure`)
-   UI polish, accessibility, and E2E workflows (handled in Spec #4 - `Spell UI Design and Accessibility`)
-   Import/Export (handled in Spec #5 - `integrate-spell-hashing-ecosystem`)

## Dependencies
-   **Spec #1: `add-spell-canonical-hashing-foundation`**
    - Enforces the schema that these components must produce.
-   **Spec #2: `add-spell-data-migration-infrastructure`**
    - Provides the parsing logic needed to load legacy string data into these components.
