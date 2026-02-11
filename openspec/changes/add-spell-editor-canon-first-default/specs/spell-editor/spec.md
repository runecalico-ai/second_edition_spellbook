# Spell Editor — Delta: Canon-First Default (Option B)

This delta adds requirements for canon-first default and per-field expand/collapse. It applies to the Details block only (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance, Description). All other editor fields (name, level, school, sphere, class list, source, edition, author, license, tags, reversible, quest, cantrip) are unchanged.

## ADDED Requirements

### Requirement: Canon-First Default (Details Block)

The Spell Editor MUST present the Details block in a canon-first way: by default the user SHALL see and edit **canon text** (one single-line text input per field), not the full structured schema. Structured controls (StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, MagicResistanceInput, ComponentCheckboxes) MUST NOT be visible in the default view and MUST be revealed per field only when the user opts in via a per-field expand control (Option B: hybrid single-line + expand/collapse). Each expand control MUST be placed below or adjacent to its single-line input so the relationship is clear to users and implementers.

---

#### Default view and field order

#### Scenario: Default view is canon text only

- **GIVEN** the Spell Editor form and the Details section
- **WHEN** the user views the editor (or has not expanded any detail field)
- **THEN** the editor MUST show one single-line text input per canon field in this order: Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance
- **AND** the Description MUST remain a textarea as today (after the above fields)
- **AND** the editor MUST NOT reorder these fields so that layout is consistent and testable
- **AND** the editor MUST NOT render StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, MagicResistanceInput, or ComponentCheckboxes in the default (collapsed) view
- **AND** each single-line input MUST be bound to the corresponding form text field (e.g. form.range, form.duration) so save persists those strings
- **AND** Damage and Magic Resistance MUST always be shown in the same order; when there is no value, the single-line input MUST be shown empty as a visual aid so the user sees the field exists and can fill it

#### Scenario: Damage and Magic Resistance always visible when empty

- **GIVEN** the canon-first Details block
- **THEN** Damage and Magic Resistance MUST always be shown in the fixed field order (after Saving Throw, before Description)
- **AND** when the spell has no value for Damage or Magic Resistance, the corresponding single-line input MUST be shown empty (not hidden), so the user has a clear visual indication that the field exists and can be filled

---

#### Expand/collapse and sync

#### Scenario: Only one detail field expanded at a time

- **GIVEN** the Spell Editor form and at most one detail field is currently expanded
- **WHEN** the user activates the expand control for a different detail field
- **THEN** the editor MUST collapse the currently expanded field first (if that field is dirty, serialize its spec to the canon line; otherwise leave the line unchanged), then expand the newly selected field
- **AND** only one detail field MUST be expanded at any time

#### Scenario: Per-field expand reveals structured form

- **GIVEN** the Spell Editor form and a canon field (e.g. Duration) in collapsed state
- **WHEN** the user activates the expand control for that field
- **THEN** the editor MUST reveal the structured component for that field (e.g. StructuredFieldInput for range/duration/casting_time, AreaForm for area, DamageForm for damage, SavingThrowInput, MagicResistanceInput, ComponentCheckboxes plus material list for components)
- **AND** the editor MUST populate that structured form: if the spell was loaded with `canonical_data` that includes this field, use that structured value; otherwise parse the current text via the corresponding Tauri parser command and show the result (or "special" + raw_legacy_value on parse failure or if the command rejects/throws; per main spell-editor spec, handle defensively)
- **AND** when the editor must parse via a Tauri command (no `canonical_data` for this field), parser commands are async—the editor MUST show a loading state (e.g. spinner, disabled inputs, or skeleton) in the expanded area until the structured form is populated; only then MAY the user edit. When the form is populated from `canonical_data` (synchronous), no loading state is required.
- **AND** the expand control MUST be keyboard and screen-reader friendly (e.g. aria-expanded, focus management)

#### Scenario: On collapse, line updates from spec only when dirty

- **GIVEN** a detail field is expanded and the user has edited the structured form (field is dirty)
- **WHEN** the user collapses that field
- **THEN** the editor MUST serialize the current structured value to text using the existing helpers (e.g. durationToText, rangeToText, componentsToText)
- **AND** MUST update the form text field and the single-line input with that value so the canon line stays in sync with the structured form

#### Scenario: On collapse without edit, canon line unchanged

- **GIVEN** a detail field is expanded and the user has not edited the structured form (field is not dirty; they only expanded to view)
- **WHEN** the user collapses that field
- **THEN** the editor MUST NOT overwrite the canon line
- **AND** the existing text in the single-line input and form text field MUST remain unchanged

#### Scenario: Manual adjustment of structured form is allowed

- **GIVEN** a detail field was expanded and the parser returned "special" (or the user wishes to adjust the structured value)
- **WHEN** the user edits the structured form (e.g. changes kind, fills in unit and duration, or corrects a parsed value)
- **THEN** the field is marked dirty
- **AND** on collapse the editor MUST serialize the current structured value to text and update the canon line so the user's manual fix is persisted

#### Scenario: Components collapsed and expanded

- **GIVEN** the Components detail field
- **WHEN** the field is collapsed
- **THEN** the editor MUST show a single line (e.g. "V, S, M" or "V, S, M (ruby dust 50 gp)") bound to form.components (and material display as needed)
- **WHEN** the user expands Components
- **THEN** the editor MUST show ComponentCheckboxes and the material component list; on collapse, if the components structured form was edited (dirty), MUST serialize to form.components and form.materialComponents via componentsToText; otherwise MUST NOT overwrite the canon line

#### Scenario: New spell starts collapsed

- **GIVEN** the user is creating a new spell
- **WHEN** the editor loads
- **THEN** all detail fields MUST be collapsed with empty or placeholder canon text lines
- **AND** on first expand of a field, the editor MUST parse the current text (or treat empty string per design: default or "special" with empty raw) and show the structured form

#### Scenario: First expand with empty canon line

- **GIVEN** a canon field (e.g. Duration) whose current text is empty (e.g. new spell or user cleared the line)
- **WHEN** the user expands that field
- **THEN** the editor MUST call the corresponding Tauri parser with the empty string
- **AND** if the parser returns a defined default (a valid spec), the editor MUST show that spec in the structured form
- **AND** if the parser does not return a valid default, the editor MUST treat the field as "special" with empty `raw_legacy_value` and show the structured form in that state

#### Scenario: Warning when expanded and spec is special

- **GIVEN** a detail field is expanded and the structured value for that field has kind "special" (or parse failed)
- **THEN** the editor MUST show the existing "could not be fully parsed" hint for that field (inline or in the expanded section)
- **AND** when that field is collapsed, the editor MUST show a subtle indicator (e.g. icon or tooltip) if the last parse or loaded spec for that field was "special", so the user knows the line is stored but not fully structured for hashing

---

#### Persistence and validation

#### Scenario: Persistence unchanged

- **GIVEN** the user edits only in the canon (collapsed) view and saves
- **THEN** the editor MUST persist the flat text columns as today
- **AND** when structured state exists (e.g. user expanded and edited), the editor MUST continue to build and persist canonical_data from current specs on save; persistence shape (flat columns + canonical_data) is unchanged
- **AND** on explicit Save, if any detail field is currently expanded and dirty, the editor MUST serialize that field to the canon line before building the persistence payload so flat text and canonical_data stay in sync

#### Scenario: Validation applies when saving from canon view

- **GIVEN** the user edits only in the canon (collapsed) view (no expanded structured forms)
- **WHEN** the user attempts to save
- **THEN** existing validation rules MUST still apply (e.g. required name, Epic requires School, Quest requires Sphere, other tradition/semantic rules from the main spell-editor spec)
- **AND** the editor MUST block save and display the same inline errors as today until the form is valid

---

#### Unsaved changes and navigation

#### Scenario: Unsaved changes — warn on navigate or close; no auto-serialize; save is explicit

- **GIVEN** the user has unsaved changes (e.g. edited canon lines and/or has a detail field expanded with edits not yet collapsed or saved)
- **WHEN** the user attempts to navigate away from the spell (e.g. to another route, spell, or Add Spell) or to **close the editor** (e.g. closing the editor window or leaving the spell route so the spell is no longer being edited)
- **THEN** the editor MUST warn the user about unsaved changes (e.g. confirm dialog or equivalent) and MUST allow the user to cancel and stay, or to leave and discard
- **AND** the editor MUST NOT automatically serialize any dirty expanded field to the canon line on navigate/close—serialization to the canon line happens only when the user explicitly collapses that field or when the user explicitly saves
- **AND** saving MUST always be explicit (user activates Save); the editor MUST NOT auto-save or serialize-and-persist on navigate or close

---

#### Testability

#### Scenario: Stable test IDs for canon-first UI

- **GIVEN** the canon-first Details block is rendered
- **THEN** each canon single-line input MUST have a stable `data-testid` (e.g. `detail-range-input`, `detail-duration-input`, and equivalents for Components, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance)
- **AND** each per-field expand control MUST have a stable `data-testid` (e.g. `detail-range-expand`, `detail-duration-expand`, and equivalents for the same fields)
- **SO THAT** E2E tests and Storybook can target elements without relying on labels or DOM order. The exact IDs are listed in Documentation Updates (developer doc).

---

## Documentation Updates

As a result of this change, the following application documentation MUST be updated so it accurately describes the Spell Editor UI and behavior.

### User-facing documentation

- **`docs/user/spell_editor.md`** (Spell Editor Guide)
  - Describe the **default view** as canon-first: one single-line text input per detail field (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance) with an expand control per field below or adjacent to each line; no structured forms visible by default.
  - State that **Damage and Magic Resistance** are always shown; when there is no value, the input is shown empty as a visual aid that the field exists and can be filled.
  - Explain that **expanding** a field reveals the structured form (parsed from text or from `canonical_data`); **collapsing** updates the canon line only when the user edited the structured form (dirty); view-only expand/collapse leaves the line unchanged.
  - Explain that **unsaved changes** (edited canon lines and/or a dirty expanded field) trigger a warning when the user navigates away (e.g. to another spell or Add Spell) or closes the editor (e.g. leaves the spell route); the user can cancel and stay or leave and discard. Saving is always explicit (no auto-save on navigate/close).
  - Keep or adapt the existing "Structured Fields" content to describe the **expanded** experience (kind, base value, unit, etc.); clarify that these controls appear only when the user expands a field.
  - Describe the **"special" indicator** when collapsed (e.g. icon or tooltip) for fields that could not be fully parsed.
  - Retain sections on Legacy String vs Structured Data, Content Hash, and Validation; adjust wording so it is consistent with canon-first default and optional structured layer.

### Developer documentation

- **`docs/dev/spell_editor_components.md`** (Spell Editor Structured Components – Developer Guide)
  - Add or update a section describing the **canon-first Details block**: default (collapsed) view shows one row per canon field (label + single-line input + expand control) in the specified order; the expand control is placed below or adjacent to its single-line input; structured components (StructuredFieldInput, AreaForm, etc.) are **not** rendered until the user expands that field.
  - Document **data flow**: on load, form is populated with flat text; on expand, use `canonical_data` for that field if present, otherwise parse via Tauri command; on collapse, serialize to the canon line only when the field is dirty.
  - Update the **E2E and test IDs** section to include the canon-first test IDs: `detail-range-input`, `detail-range-expand`, `detail-duration-input`, `detail-duration-expand`, `detail-components-input`, `detail-components-expand`, `detail-casting-time-input`, `detail-casting-time-expand`, `detail-area-input`, `detail-area-expand`, `detail-saving-throw-input`, `detail-saving-throw-expand`, `detail-damage-input`, `detail-damage-expand`, `detail-magic-resistance-input`, `detail-magic-resistance-expand` (and any equivalent labels used in the implementation).
  - Adjust **example usage** or **state management** wording as needed so it is clear that SpellEditor shows structured components only when a detail field is expanded, and that the parent manages both canon text state and per-field expanded state + structured state.

### Testing documentation

- **`docs/TESTING.md`**
  - In the E2E or Spell Editor testing section, mention or reference the **canon-first E2E spec** (e.g. `spell_editor_canon_first.spec.ts`) and that it covers canon-only edit/save, expand–edit–collapse serialization, view-only collapse, load with `canonical_data`, new spell, manual fix of "special", loading state on expand (async parser), and unsaved-changes warning (no auto-serialize on navigate/close).
  - If Storybook gains canon-first Details stories, note that they exist (e.g. under Spell Editor or Details block) and where to find them (path or story title).
