## MODIFIED Requirements

### Requirement: Input Validation
The Spell Editor MUST enforce schema-compliant input.

#### Scenario: Numeric Validation
- GIVEN a numeric scalar input (base_value, per_level, quantity)
- WHEN user enters a value outside the allowed range (e.g. negative)
- THEN the editor MUST use clamp-on-change per frontend-standards (e.g. clamp to 0) so the persisted value is valid
- AND MUST NOT persist the invalid value. Semantic validation (e.g. required tradition/school/sphere) continues to use block save + inline error.

#### Scenario: Maximum value cap
- The advisory cap for structured scalar numeric fields is **999999**.
- GIVEN a structured scalar input
- WHEN the user enters a value above 999999
- THEN the component MUST show a warning and MUST allow the value (no clamp, no block save); the cap is advisory for UX consistency.

#### Scenario: Unit Enum Validation
- GIVEN a unit dropdown
- WHEN the value does not match the schema enum
- THEN the editor MUST display a validation error.

#### Scenario: Tradition Validation (Arcane)
- GIVEN a spell with tradition = "ARCANE"
- WHEN school is not selected
- THEN the editor MUST block saving
- AND display an inline validation error.

#### Scenario: Tradition Validation (Divine)
- GIVEN a spell with tradition = "DIVINE"
- WHEN sphere is not selected
- THEN the editor MUST block saving
- AND display an inline validation error.

#### Scenario: Tradition Load Error (School and Sphere Co-presence)
- GIVEN a spell record loaded from the database that has both `school` and `sphere` set (co-present)
- WHEN the editor loads the spell
- THEN the editor MUST display a data-integrity warning identifying that school and sphere cannot both be set
- AND MUST block saving until the conflict is resolved by clearing either school or sphere.

#### Scenario: Dismissing the Tradition Load Error via Tradition Change
- GIVEN a spell that triggered the tradition load error (both school and sphere set)
- WHEN the user selects a new value from the tradition dropdown
- THEN the tradition load error flag MUST be cleared and the data-integrity warning MUST be dismissed
- AND normal tradition validation MUST take effect immediately: if school is not set for ARCANE, the ARCANE school-required error MUST appear and block save; if sphere is not set for DIVINE, the DIVINE sphere-required error MUST appear and block save.
- The user must also clear the field that does not belong to the chosen tradition (sphere for ARCANE; school for DIVINE). The JSON schema `allOf` constraint enforces this at save time — a record with both fields set will fail schema validation regardless of tradition. Save is unblocked only when the required field is set AND the opposing tradition's field is cleared.

#### Scenario: Class List and Tradition
- NOTE: `class_list` is currently a plain array of strings with no schema-level enforcement of Arcane/Divine membership. Arcane spells are intended for Arcane casters (e.g. Wizard, Bard); Divine spells are intended for Divine casters (e.g. Priest, Druid). No UI-level validation or restriction of `class_list` by tradition is required at this time. A future class schema feature will implement spell-list access control.

### Testing Requirements

The following behaviors MUST be verified using Playwright E2E tests:
- The UI properly reflects the removal of the BOTH tradition (i.e. tradition dropdown only contains "Arcane" and "Divine").
- Existing inline errors and block-save logic persist when saving a new spell with no school (ARCANE).
