# Add Spell UI Design and Accessibility

## Why
The structured spell editing work now exists, but the surrounding user experience remains uneven. This change tightens the spell editor and library UX, formalizes cross-app accessibility expectations, and adds a consistent theme and transient-feedback model.

The main gaps are:
1. **Spell workflow polish**: validation, save feedback, hash presentation, and empty states are inconsistent or under-specified.
2. **Accessibility consistency**: focus handling, field associations, keyboard behavior, and resize safety need explicit cross-app standards.
3. **Theme and transient feedback**: light mode, system theme behavior, non-modal notifications, tooltips, and live announcements were previously described only in tasks or design notes, not in formal requirements.

## What Changes
This change is now split across three spec areas:

1. **`library`**
   Covers spell-editor and library-facing behavior:
   - validation feedback
   - save workflow feedback
   - hash display and copy confirmation
   - empty-library, empty-search, and empty-character-spellbook states
   - loading-state boundaries for spell routes

2. **`frontend-standards`**
   Covers cross-app interaction and accessibility rules:
   - semantic labeling expectations
   - keyboard navigation
   - focus trapping and focus return
   - field error/help associations
   - resize-safe layouts at the supported desktop minimum width

3. **`theme-and-feedback`**
   Covers global theme and transient UI patterns:
   - light/dark/system theme behavior via Settings page (native select + follow-system checkbox)
   - theme selection accessibility
   - non-modal notification patterns
   - live-region announcements
   - theme-oriented visual regression expectations

## Scope
### In Scope
- Spell editor and library UX polish for this change area
- Desktop resize handling at the supported minimum width of 900px
- WCAG 2.1 AA-oriented accessibility improvements for affected flows
- Theme support with persistence and system preference handling
- Non-modal feedback patterns for success, warning, and clipboard actions
- Documentation updates for affected user, developer, testing, and architecture references
- Verification updates for E2E and visual regression coverage

### Out of Scope
- Functional structured-field implementation itself, which remains owned by `update-spell-editor-structured-data`
- Backend persistence semantics that are not already part of this change
- Data migration behavior
- Broader application redesign outside the touched workflows

## Dependencies
- **`update-spell-editor-structured-data`**
  - This change polishes and verifies the structured editor surfaces introduced there.
- **Existing hashing foundation and migration work**
  - This change may restyle or expose existing data, but it does not redefine backend hashing or migration contracts.

## Important Scope Clarifications
- This is a **UI and interaction change**, not a backend contract change.
- The change may define **user-visible loading and save feedback**, but it does not define new timeout persistence behavior such as saving with `hash: null`.
- Screenshot tests may toggle theme classes directly for isolation, but the change also requires verification of the **real theme selection and persistence flow**.
