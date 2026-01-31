# Update Spell Editor with Structured Data Components

## Problem
Currently, the spell editor treats complex fields like Range, Duration, and Components as simple strings. This prevents:
1.  **Validation**: Users can enter nonsense or skip required fields.
2.  **Consistency**: No standard format for "10 yards" vs. "10 yds".
3.  **Hashing**: We cannot compute a stable content hash on raw strings.
4.  **UX**: Users have no guidance on valid inputs.

## Solution
Implement a set of specialized React components to handle structured spell data entry:
1.  **`StructuredFieldInput`**: A reusable component for fields with Base Value, Per Level, Divisor, and Unit (e.g., Range, Duration).
2.  **`ComponentCheckboxes`**: A dedicated input for Verbal, Somatic, and Material components.
3.  **Editor Integration**: Replace legacy string inputs with these new components.
4.  **Display**: Update the Spell Detail view to render structured data beautifully and show the content hash.

## Scope
### In Scope
-   Implementation of `StructuredFieldInput` component
-   Implementation of `ComponentCheckboxes` component
-   Integration into `SpellEditor` form
-   Legacy data auto-parsing on load (using Spec #2 parsers)
-   Tradition-based validation logic (e.g., Arcane requires School)
-   `SpellDetail` view updates (hash display, badges)
-   Component documentation and API guides

### Out of Scope
-   Backend schema changes (handled in Spec #1)
-   Data migration script (handled in Spec #2)
-   UI polish, accessibility, and E2E workflows (handled in Spec #4)
-   Import/Export (handled in Spec #5)

## Dependencies
-   **Spec #1: `add-spell-canonical-hashing-foundation`**
    - Enforces the schema that these components must produce.
-   **Spec #2: `add-spell-data-migration-infrastructure`**
    - Provides the parsing logic needed to load legacy string data into these components.
