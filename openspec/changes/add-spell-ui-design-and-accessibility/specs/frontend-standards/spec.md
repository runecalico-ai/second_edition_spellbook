# frontend-standards Specification

## MODIFIED Requirements

### Requirement: Semantic Structure
All application pages SHALL have a proper semantic heading hierarchy.
- **Accessibility**: Controls without sufficient visible text MUST expose an accessible name.
- **WCAG Compliance**: The application SHALL target WCAG 2.1 AA compliance for color contrast and readable text sizing.

#### ADDED Scenario: Icon-only control labeling
- **WHEN** an interactive control has no visible text label
- **THEN** it MUST expose an accessible name such as `aria-label`

#### ADDED Scenario: Visible label preferred
- **WHEN** a form input already has an associated visible label
- **THEN** the visible label SHALL be the primary accessible name
- **AND** redundant `aria-label` usage SHALL be avoided unless needed for disambiguation

## ADDED Requirements

### Requirement: Window Size Handling
This is a Tauri desktop application. Mobile and tablet breakpoints do not apply. The application SHALL remain usable when the desktop window is resized.

#### Scenario: Narrow Window Layout
- **WHEN** the window width approaches the minimum supported width of 900px
- **THEN** editor sub-layouts with multiple horizontally arranged controls SHALL stack or wrap to avoid overflow
- **AND** the application SHALL remain usable without introducing horizontal scrolling for core editing flows

### Requirement: Keyboard Navigability
The application SHALL be fully navigable via keyboard, with logical focus management and visible focus indicators.

#### Scenario: Tab order
- **WHEN** the user presses `Tab` or `Shift+Tab`
- **THEN** focus SHALL move through interactive controls in a logical visual and semantic order
- **AND** the currently focused control SHALL expose a visible focus indicator

#### Scenario: Form submission by keyboard
- **WHEN** focus is within a form and the user activates the expected keyboard submit interaction
- **THEN** the form SHALL submit or attempt to submit consistently with the visible submit action

#### Scenario: Keyboard dismissal
- **WHEN** the user presses `Escape` in a context that supports dismissal
- **THEN** the relevant modal or editing dismissal action SHALL occur without leaving focus in an undefined state

### Requirement: Focus Management
The application SHALL manage focus programmatically so keyboard and screen reader users are not left in an unexpected context.

#### Scenario: Modal focus trap
- **WHEN** a modal dialog is open
- **THEN** focus SHALL remain trapped within the modal
- **AND** focus SHALL NOT escape to interactive content behind the modal

#### Scenario: Focus return after modal close
- **WHEN** a modal dialog is closed
- **THEN** focus SHALL return to the element that opened the modal, or the nearest logical fallback if the opener no longer exists

### Requirement: Error Identification and Association
Validation and help content SHALL be programmatically associated with the fields they describe.

#### Scenario: Field-level error association
- **WHEN** a field is invalid
- **THEN** the field SHALL expose its invalid state programmatically
- **AND** the associated error text SHALL be linked to the field through the correct descriptive relationship

#### Scenario: Help text association
- **WHEN** additional help text or usage guidance is present for a field
- **THEN** the field SHALL expose that help text through a descriptive association rather than relying on visual proximity alone

#### Scenario: Error announcement pattern
- **WHEN** validation feedback appears
- **THEN** the change SHALL define whether the announcement model is field-level, global, or hybrid
- **AND** the chosen model SHALL be applied consistently across the spell editor

### Requirement: Resize-Safe Structured Inputs
Structured inputs and grouped checkboxes SHALL preserve comprehension when horizontal space is constrained.

#### Scenario: Structured input wrapping
- **WHEN** grouped scalar, unit, or checkbox controls no longer fit comfortably in one row
- **THEN** the controls SHALL reflow into a readable stacked or wrapped layout
- **AND** labels, previews, and validation text SHALL remain visually associated with the correct control group

### Requirement: Documentation Synchronization
Application documentation SHALL be updated when this change alters shared UI conventions or user-visible spell and library workflows.

#### Scenario: Shared convention changes
- **WHEN** this change modifies shared frontend behavior such as theme handling, notification patterns, live-region behavior, keyboard expectations, or accessibility conventions
- **THEN** the affected developer and architecture documentation SHALL be updated to reflect the final implementation and guidance

#### Scenario: User-visible workflow changes
- **WHEN** this change modifies spell-editor or library behavior that users rely on
- **THEN** the affected user documentation SHALL be updated so the documented workflow matches the shipped application behavior

#### Scenario: Verification guidance changes
- **WHEN** this change alters verification expectations, E2E coverage, or visual-regression workflow
- **THEN** the affected testing documentation SHALL be updated so future verification follows the current standard
