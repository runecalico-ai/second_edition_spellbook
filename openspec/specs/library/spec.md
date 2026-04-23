# library Specification

## Purpose
This specification defines the core spell library management system, including CRUD operations for spell records, field-level change tracking, validation rules for AD&D 2e magic systems (Arcane/Divine), and support for high-level magic (Epic spells up to 12th level, Quest spells, and Cantrips). It establishes the data model and business rules for the central spell repository that all other features depend on.
## Requirements
### Requirement: Spell CRUD
The user SHALL be able to create, read, update, and delete spell records containing the following mandatory and optional fields:
- **Mandatory**: Name, Level, Description, Source, Created At.
- **System Specific**: School (Arcane), Sphere (Divine), Classes.
- **Effect Details**: Range, Casting Time, Duration, Area of Effect, Saving Throw, Reversible (Flag).
- **Components**: Components (V/S/M), Material Components (Text).
- **Metadata**: Tags, Edition, Author, License/Permissions, Quest Spell (Flag), Cantrip (Flag).

#### Scenario: Adding a New Spell
- **WHEN** the user fills out the "Create Spell" form with details for "Acid Arrow" (Level 2, Alteration)
- **AND** they click "Save"
- **THEN** the spell record SHALL be persisted with all provided fields appearing in the library list

#### Scenario: Adding an Epic Spell
- **WHEN** the user creates an Arcane spell (has `school`) with level 10, 11, or 12
- **THEN** the record SHALL be persisted and display with an "Epic" badge in the library

#### Scenario: Adding a Quest Spell
- **WHEN** the user creates a Divine spell (has `sphere`) with Level 8 and toggles "Quest Spell"
- **THEN** the record SHALL be persisted and display with a "Quest" badge in the library

#### Scenario: Adding a Cantrip
- **WHEN** the user creates a Level 0 spell and toggles "Cantrip"
- **THEN** the record SHALL be persisted and display with a "Cantrip" badge (versus a plain "0" or no badge for non-cantrip level 0 spells)

### Requirement: Field-Level Change Log
The application SHALL maintain a history of changes to spell records, tracking which field was changed, the old value, the new value, and the timestamp.
#### Scenario: Viewing Spell History
- **WHEN** a user updates the "Casting Time" of a spell
- **THEN** a new entry SHALL be added to the change log for that spell recording the modification details

### Requirement: Character Management
The application SHALL support managing multiple PC and NPC profiles with rich profile data including identity (name, type, race, alignment, notes), abilities (STR, DEX, CON, INT, WIS, CHA, optional COM), and multi-class configurations. Character profiles are managed through the `characters` capability.

#### Scenario: Creating a Character
- **WHEN** the user creates a new character named "Elminster"
- **THEN** the character must be stored in the database and be selectable for spellbook association

#### Scenario: Creating a Character with Full Profile
- **WHEN** the user creates a character with identity, abilities, and multiple classes
- **THEN** all profile data SHALL be persisted and retrievable (see `characters` spec for detailed requirements)

### Requirement: Spellbook Linkage
Each character class SHALL have a personal spellbook where spells from the library can be added, removed, and marked as "known" or "prepared". Multi-class characters maintain separate spell lists per class.

#### Scenario: Adding a Spell to a Character Class
- **WHEN** the user adds "Fireball" to Elminster's "Mage" class Known list
- **THEN** "Fireball" SHALL be linked to that class with list_type "KNOWN"

#### Scenario: Removing a Spell from a Character Class
- **WHEN** the user removes "Magic Missile" from Elminster's "Mage" class Prepared list
- **THEN** the link between the spell and the character class SHALL be removed

#### Scenario: Preparing a Spell
- **WHEN** the user adds "Fireball" to the Prepared list for Elminster's "Mage" class
- **THEN** the change SHALL be persisted and reflected in the character's prepared spells list for that class

### Requirement: Character Spellbook Notes
The user SHALL be able to attach personal notes to each spell within a character's per-class spellbook.

#### Scenario: Adding Notes to a Prepared Spell
- **WHEN** the user adds the note "Use against Trolls" to Elminster's "Fireball" spell in the "Mage" class Prepared list
- **THEN** the note SHALL be persisted and displayed as part of that class's spellbook view

### Requirement: High-Level Magic Validation
The application SHALL enforce validation rules for high-level and quest magic to ensure consistency with AD&D 2e conventions.
- Arcane spells (with `school`) are permitted up to Level 12.
- Divine spells (with `sphere`) are capped at Level 7, unless explicitly flagged as a Quest Spell.
- Quest Spells MUST be Level 8 and MUST be Divine (have `sphere`).
- Cantrips MUST be Level 0.
- A spell SHALL NOT have both a `school` and a `sphere`.

#### Scenario: Preventing Invalid Cantrip Level
- **WHEN** the user attempts to toggle "Cantrip" on a spell with Level > 0
- **THEN** the application SHALL prevent the toggle or display a validation error upon saving

#### Scenario: Preventing Invalid Epic Divine Spell
- **WHEN** the user attempts to save a Divine spell with Level 10
- **THEN** the application SHALL display a validation error and prevent saving

#### Scenario: Preventing Invalid Arcane Quest Spell
- **WHEN** the user attempts to toggle "Quest Spell" on an Arcane spell
- **THEN** the application SHALL prevent the toggle or display a validation error upon saving

### Requirement: Editor Conditional Field Visibility
The spell editor SHALL dynamically adjust context-specific field visibility based on the current spell state.
- **Polish**: Transitions between visibility states SHALL use existing shared animation utilities rather than introducing new animation definitions.
- If `school` is provided, `sphere` SHALL be disabled/hidden and `is_quest_spell` SHALL be disabled.
- If `sphere` is provided, `school` SHALL be disabled/hidden.
- The `is_cantrip` toggle SHALL only be enabled when Level is 0.

#### Scenario: Switching to Arcane Magic
- **WHEN** the user selects a "School" for a new spell
- **THEN** the "Sphere" field and "Quest Spell" toggle SHALL become disabled to prevent multi-type association

#### Scenario: Smooth field transition
- **WHEN** the user changes a controlling spell attribute such as tradition or another field that affects conditional editor content
- **THEN** newly relevant fields SHALL animate into view over a 200ms duration
- **AND** hidden fields SHALL be removed from the active layout without leaving visual gaps
- **AND** the implementation SHALL use existing shared animation utilities already defined in the frontend styles

### Requirement: High-Level Magic Indicator
The spell editor SHALL display a visual indicator or warning when configuring Epic (10+) or Quest spells to highlight their non-standard nature.

#### Scenario: Editing an Epic Spell
- **WHEN** the user sets a spell level to 10
- **THEN** the editor SHALL display an "Epic Magic" indicator

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
	- e.g., switching tradition clears or enforces School/Sphere requirements without waiting for blur
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

### Requirement: Modal Dialog Behavior

Modal dialogs used for critical alerts and confirmations SHALL require explicit user interaction to resolve.

#### Scenario: Alert/Confirm Backdrop Interaction
- **WHEN** an `alert()` or `confirm()` modal is open
- **AND** the user clicks the black backdrop overlay
- **THEN** the modal SHALL NOT close
- **AND** the Promise awaiting the user's choice SHALL NOT hang
- **AND** the user MUST click a button (e.g., "OK", "Cancel") to proceed

### Requirement: Character Data Consistency

The application SHALL ensure consistent data handling for Character entities across the IPC boundary and database queries.

#### Scenario: Character Creation
- **WHEN** a new character is created via the UI
- **THEN** the frontend SHALL send parameters in camelCase (e.g., `characterType`)
- **AND** the backend SHALL correctly deserialize these parameters using standard camelCase conventions
- **AND** the created character SHALL persist in the database

#### Scenario: Retrieving Character Spells
- **WHEN** requesting a character's spell list (Known or Prepared)
- **THEN** the returned data items SHALL include the correct `character_id` matching the database record
- **AND** the `character_id` SHALL NOT be 0

