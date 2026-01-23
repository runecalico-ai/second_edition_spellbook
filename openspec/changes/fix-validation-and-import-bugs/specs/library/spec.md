# library Spec Delta

## MODIFIED Requirements

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