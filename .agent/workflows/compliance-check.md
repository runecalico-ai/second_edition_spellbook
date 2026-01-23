---
description: Perform a compliance check on UI Best practices for a component or page
---

Follow these steps to ensure a UI component or page complies with the project's quality standards for testability, accessibility, and validation.

### 1. Preparatory Review
1. Open the component file (e.g., `src/ui/MyComponent.tsx`).
2. Read the standard guidelines in [AGENTS.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/src/AGENTS.md).
3. Identify all interactive elements: buttons, inputs, links, and selectable list items.

### 2. Audit: Element Discoverability
1. **data-testid**: Verify that EVERY interactive element has a `data-testid` attribute.
   - Use kebab-case: `{action}-button`, `{field}-input`, `{item}-row`.
   - Dynamic rows must include IDs: `data-testid={`spell-row-${name.toLowerCase().replace(/\s+/g, '-')}`}`.
2. **Semantic HTML**:
   - Ensure the page (or main view) has exactly one `<h1>`.
   - Use `<button>` for actions, never `<div>` or `<span>` with `onClick`.
3. **Accessibility**:
   - Every `<input>` must have a linked `<label>` or an `aria-label`.
   - Icon-only buttons must have an `aria-label`.

### 3. Audit: Input Validation
1. **Numeric Inputs**: Verify use of the "clamp-on-change" pattern.
   - Values should be clamped (e.g., `Math.max(0, val)`) within the `onChange` handler before being set in state.
   - Validation should prevent negative values and non-numeric characters from persisting in the UI state.

### 4. Verification
1. **Static Analysis**: Search the file for any interactive elements lacking `data-testid`.
2. **Runtime Check**:
   - If writing a test, use `page.getByTestId('your-id')` to confirm visibility.
   - Run existing E2E tests:
     ```powershell
     npx playwright test
     ```
3. **Inspector Check**: (Optional) Run the app and use the browser inspector to verify `data-testid` attributes are rendered correctly in the DOM.

### 5. Remediation
1. Fix any gaps found during the audit.
2. Update the Page Object Model (e.g., `SpellbookApp.ts`) if new stable identifiers were added.
3. Verify that the changes do not break existing E2E tests.
