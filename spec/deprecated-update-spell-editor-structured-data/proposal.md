# Update Spell Editor for Structured Data

## Problem
The current UI uses simple text fields for Duration, Range, Area, etc. The new Canonical Schema requires structured data (Base, Per Level, Unit) to enable automation. The UI needs to produce this data.

## Solution
Update the Spell Editor to support structured inputs.

## Scope
-   **Frontend**: `StructuredFieldInput`, `SpellEditor.tsx`, `SpellDetail.tsx`.

## Dependencies
This change depends on the backend models defined in:
-   `add-spell-canonical-hashing-core` (MUST be applied first).

## Risks
-   UI compatibility with existing "legacy" string data (Migration strategy: move string to `text` field).
