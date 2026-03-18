# library Specification

## MODIFIED Requirements

### Requirement: Editor Conditional Field Visibility
The spell editor SHALL dynamically adjust context-specific field visibility based on the current spell state.
- **Polish**: Transitions between visibility states SHALL use existing shared animation utilities rather than introducing new animation definitions.

#### ADDED Scenario: Smooth field transition
- **WHEN** the user changes a controlling spell attribute such as tradition or another field that affects conditional editor content
- **THEN** newly relevant fields SHALL animate into view over a 200ms duration
- **AND** hidden fields SHALL be removed from the active layout without leaving visual gaps
- **AND** the implementation SHALL use existing shared animation utilities already defined in the frontend styles

## ADDED Requirements

### Requirement: Spell Editor Validation Feedback
The spell editor SHALL provide clear, field-level validation feedback without relying on generic modal alerts.

#### Scenario: Invalid required field
- **WHEN** a required field is invalid after the user has interacted with it or after form submission is attempted
- **THEN** the field SHALL be visually highlighted as invalid
- **AND** a clear inline error message SHALL appear adjacent to the field
- **AND** the error message SHALL describe the problem in domain terms rather than using a generic message such as "Invalid value"
- **AND** validation errors that the user can fix in place SHALL NOT be delivered through modal alerts

#### Scenario: Tradition-dependent validation
- **WHEN** the user selects Arcane tradition
- **THEN** the editor SHALL enforce that School is present before save can succeed
- **AND** any Sphere-specific requirement SHALL be cleared or not shown as active

#### Scenario: Divine tradition validation
- **WHEN** the user selects Divine tradition
- **THEN** the editor SHALL enforce that Sphere is present before save can succeed
- **AND** any School-specific requirement that only applies to Arcane context SHALL not remain active

#### Scenario: Validation timing
The spell editor SHALL follow a touched model for validation feedback:
- Text inputs (spell name, scalar values) SHALL validate **on blur**
- Select controls SHALL validate **on change**
- Controlling fields (tradition) SHALL **immediately revalidate their dependents** when changed
  — e.g., switching tradition clears or enforces School/Sphere requirements without waiting for blur
- All fields that have not yet been touched SHALL validate when the user **first attempts to submit**
- An error on a field SHALL clear as soon as the field value becomes valid

### Requirement: Save Workflow Feedback
Saving a spell SHALL communicate progress and result through in-context feedback.

#### Scenario: Save in progress
- **WHEN** a spell save operation remains in progress long enough to be perceptible
- **THEN** the save control SHALL show an inline progress indication
- **AND** the user SHALL remain in the current editing context until the save result is known

#### Scenario: Successful save
- **WHEN** a spell save succeeds
- **THEN** the application SHALL trigger a transient success notification
- **AND** navigate the user to the Library view
- **AND** the success notification SHALL be visible on the Library view after navigation
- **AND** the saved spell SHALL be discoverable in the Library
- **AND** save success SHALL NOT require the user to dismiss a modal before continuing

> **Implementation note**: The Zustand notification store persists across route changes. The save
> handler triggers the notification, then navigates. The notification renders on the Library view
> without any delay-before-nav or dismiss-then-navigate logic.

> **Scope note**: This requirement covers user-visible save feedback only. It does not define backend timeout, retry, or null-hash persistence semantics.

### Requirement: Empty State UX
Library and spell-related views SHALL provide distinct empty states based on the reason no data is available.

#### Scenario: Empty library
- **WHEN** the spell library contains no spells
- **THEN** the Library view SHALL show an empty-library state rather than an empty results row
- **AND** the state SHALL explain that no spells exist yet
- **AND** the state SHALL offer a primary action to create a spell
- **AND** the state SHALL offer a secondary action to import spells

#### Scenario: Empty search results
- **WHEN** the library contains spells but the current search or filters return no matches
- **THEN** the results area SHALL show an empty-search state
- **AND** the message SHALL explain that no spells matched the current criteria
- **AND** the state SHALL suggest resetting or changing filters
- **AND** the state SHALL provide a clear reset action

#### Scenario: Empty character spellbook
- **WHEN** a character spellbook contains no spells
- **THEN** the spellbook view SHALL explain that no spells are currently present
- **AND** the state SHALL provide a clear action to add spells from the library

### Requirement: Hash Display
The spell detail view SHALL display the canonical hash for a saved spell in a dedicated card.

> **Scope clarification**: The existing expandable hash section is restyled and behaviorally refined; this is not a brand-new feature.

#### Scenario: Hash card visible on saved spell
- **WHEN** the user views a saved spell that has a canonical hash
- **THEN** a dedicated hash card SHALL be visible within the spell detail header area
- **AND** the collapsed state SHALL show an abbreviated hash
- **AND** the expanded state SHALL reveal the full hash

#### Scenario: Hash copy interaction
- **WHEN** the user activates the hash copy control
- **THEN** the full canonical hash SHALL be copied to the clipboard
- **AND** the interface SHALL confirm success using transient non-modal feedback
- **AND** screen reader users SHALL receive a polite live announcement that the hash was copied
- **AND** the copy confirmation SHALL NOT use a modal alert

### Requirement: Loading-State Boundaries
The spec SHALL distinguish actual loading states from interactions that do not need visible loading feedback.

#### Scenario: Spell detail navigation
- **WHEN** the user opens a spell for editing or inspection
- **THEN** the application MAY show a loading state if the route fetch is perceptible
- **AND** the change SHALL not introduce a loading indicator that flickers for imperceptible work
- **AND** the spec SHALL describe the intended user-visible behavior rather than assuming a specific synchronous implementation detail
