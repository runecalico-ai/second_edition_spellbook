# Design: Frontend Consistency And Testability

## Context
We are building a desktop application where E2E testing (via Playwright) is the primary verification method. The current codebase has grown organically, leading to mixed patterns for DOM identification and state validation.

## Goals / Non-Goals
- **Goal**: Make every interactive element trivially addressable in Playwright without using implementation details (like CSS classes).
- **Goal**: Prevent "invalid state" (e.g., Level -5) from needing to be handled by the backend or database by strictly enforcing it at the UI entry point.
- **Non-Goal**: We are not rewriting the entire UI component library or moving to a form library (like `react-hook-form`) at this time. We are staying with controlled React components.

## Decisions

### Decision: Ubiquitous `data-testid`
We will use `data-testid` as the primary contract between frontend and tests.
- **Why**: Semantic selectors (`getByRole`, `getByLabel`) are preferred by testing-library philosophies, but in a dense data-heavy app (tables, grids), they often become ambiguous or require brittle `filter()` chains. `data-testid` provides 0(1) lookup reliability.
- **Convention**: `kebab-case`.
  - Lists: `spell-row-{id}`
  - Inputs: `spell-level-input`
  - Actions: `save-button`

### Decision: Clamp-on-Change Validation
For numeric inputs bound to clamped domains (e.g., Level 0-12, Ability Scores 0-25), we will sanitize **inside the `onChange` handler**.
- **Why**: Allowing the state to hold "invalid" values (like "-1") requires every consumer of that state to handle errors. By clamping immediately, the state is always valid by definition, reducing complexity.
- **Trade-off**: Users cannot type "-1" to get to "-10" (not relevant here since we don't have negatives). Users cannot backspace to empty string easily if we force `NaN -> 0` too aggressively.
- **Mitigation**: We will allow empty string or `NaN` to represent "0" or a transient empty state where appropriate, but never an out-of-bounds number.

### Decision: Centralized Selectors via POM
We will strictly enforce usage of the `SpellbookApp` Page Object Model for interacting with the UI.
- **Why**: Direct `page.locator` calls in tests scatter implementation details (selectors) across the test suite. Sourcing them from `SpellbookApp.ts` allows us to refactor ID schemes in one place.
- **Action**: Tests found using direct locators (like `e2e.spec.ts`) will be refactored to use POM methods.

## Refactoring Guidance for `SpellEditor`
The `SpellEditor` component currently uses multiple sequential calls to `handleChange` inside the Level input `onChange` handler to manage side-effects (resetting `is_cantrip` and `is_quest_spell`).

**Current Risk**:
When refactoring to strict clamping, you must ensure that:
1.  The value is clamped *before* determining side effects.
2.  State updates are applied preferably in a single batch to avoid render trashing, though React batching handles this well.
3.  The text input cursor position does not jump unexpectedly (React usually handles this for controlled inputs if the value creates a stable representation).

**Recommended Pattern**:
Use an atomic update pattern or inline `setForm` to apply all changes at once.

```typescript
// Recommended refactor for Level input
onChange={(e) => {
  let val = Number.parseInt(e.target.value, 10);
  // 1. Strict Parsing & Clamping
  if (Number.isNaN(val)) val = 0;
  val = Math.max(0, Math.min(12, val));

  // 2. Define dependent updates
  const updates: Partial<SpellDetail> = { level: val };

  // 3. Side Effects based on CLAMPED value
  if (val !== 0) updates.is_cantrip = 0;
  if (val !== 8) updates.is_quest_spell = 0;

  // 4. Atomic Apply
  setForm(prev => ({ ...prev, ...updates }));
}}
```

**Testing Implications**:
Existing tests like `character_negative_values.spec.ts` already assert clamping behavior (e.g. input "-1" -> "0").
- **Requirement**: The `SpellEditor` refactor MUST satisfy this same contract.
- **Action**: Do not write tests that expect an error message for "-1". Assert that the value becomes "0".

## Risks
- **Refactoring Bugs**: Changing `onChange` logic in `SpellEditor` could break existing data binding if not careful.
