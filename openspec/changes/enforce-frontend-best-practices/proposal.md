# Change: Enforce Frontend Best Practices

## Why
The current frontend codebase has significant gaps in testability and consistency. Approximately 80% of interactive components lack stable identifiers (`data-testid`), making E2E tests brittle and hard to write. Additionally, input validation patterns are inconsistent, with some forms allowing invalid state (e.g., negative levels) to exist in the UI until save time, while others clamp values immediately.

## What Changes
- **Testing Standard**: All interactive elements (inputs, buttons) and list items MUST have unique `data-testid` attributes.
- **Validation Standard**: Numeric inputs MUST use the "clamp-on-change" pattern to prevent invalid values from ever being rendered in the state.
- **Semantic HTML**: All pages MUST have a top-level `<h1>` and all inputs MUST have accessible labels (`aria-label` or `<label>`).

## Impact
- **Affected Specs**: `frontend-standards` (NEW)
- **Affected Code**:
  - `AGENTS.md` (Add validation patterns)
  - `SpellEditor.tsx` (Heavy refactor for validation and IDs)
  - `Library.tsx` (Add IDs and labels)
  - `SpellbookBuilder.tsx` (Add IDs)
  - `ImportWizard.tsx` (Add IDs)
  - `Chat.tsx` (Add IDs)
