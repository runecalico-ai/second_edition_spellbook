# Tasks: Spell Editor Canon-First Default (Option B)

Implementation checklist for canon-first default with per-field expand/collapse. See `proposal.md` and `design.md` for scope and behavior.

## Spec and Requirements

- [x] **Spell-editor spec update**
    - [x] Add requirement: Spell Editor default view MUST show canon text fields (single-line inputs) for the details block; structured controls (StructuredFieldInput, AreaForm, etc.) MUST be hidden by default and revealed per field via expand.
    - [x] Add scenarios for Option B: GIVEN the Details section, WHEN the user sees a canon field (e.g. Duration), THEN the editor MUST show a single-line text input and an expand control; WHEN the user expands, THEN the editor MUST show the structured form (parse text or use canonical_data for that field); on collapse, only when the field was edited (dirty) MUST the editor serialize spec to text and update the line, otherwise leave the canon line unchanged.
    - [x] Document first-open rule: if spell has `canonical_data` for the field, use it when expanding; otherwise parse current text via Tauri command.
    - [x] Document Components: collapsed = one line (e.g. "V, S, M"); expanded = ComponentCheckboxes + material component list.
    - [x] Sync with main `openspec/specs/spell-editor/spec.md` (add new section or merge delta). — Done: scenarios merged in main spell-editor spec.

## Details Section: Canon-First UI

- [x] **Replace Details grid with canon-first block**
    - [x] Render one row per canon field in this order: Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance (each with label + single-line input). Do not reorder fields.
    - [x] Always show Damage and Magic Resistance; when there is no value, show the single-line input empty (visual aid that the field exists and can be filled).
    - [x] Keep Description as existing textarea (unchanged).
    - [x] Do not render StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, MagicResistanceInput, or ComponentCheckboxes in the default (collapsed) view.
    - [x] Bind each single-line input to the corresponding form text field (form.range, form.duration, etc.); save continues to persist these strings.
    - [x] Give each canon single-line input a stable `data-testid` (e.g. `detail-range-input`, `detail-duration-input`, `detail-components-input`, `detail-casting-time-input`, `detail-area-input`, `detail-saving-throw-input`, `detail-damage-input`, `detail-magic-resistance-input`) and each expand control a stable `data-testid` (e.g. `detail-range-expand`, `detail-duration-expand`, …) so E2E tests can target them without relying on labels or DOM order.

- [x] **Per-field expand control**
    - [x] Add an expand/collapse control (button or link) per canon field (Range, Components, Duration, Casting Time, Area, Saving Throw, Damage, Magic Resistance); place each expand control below or adjacent to its single-line input (per spec).
    - [x] Track expanded state: only one detail field MAY be expanded at a time; when the user expands another field, collapse the current one first (if that field is dirty, serialize spec to line; then expand the new field).
    - [x] When expanded: show the existing structured component (StructuredFieldInput for range/duration/casting_time, AreaForm for area, DamageForm for damage, SavingThrowInput, MagicResistanceInput, ComponentCheckboxes + material list for components) below the single line.
    - [x] Ensure expand control is keyboard and screen-reader friendly (e.g. aria-expanded, focus management).

## Sync and Data Flow

- [x] **On expand**
    - [x] If spell was loaded with `canonical_data` and this field is present in it: populate structured state from that and show it (no parse).
    - [x] Else: call the corresponding Tauri parser command with the current text; show parsed result (or "special" + raw_legacy_value on failure).
    - [x] Parser commands are async (Tauri invoke): show a loading state in the expanded area (e.g. spinner, disabled inputs, or skeleton) until the structured form is populated; only then allow editing.
    - [x] Empty string / new spell: parse empty or treat as empty structured state per design (default or "special" with empty raw).

- [x] **On collapse**
    - [x] Serialize to text and update the canon line **only when the structured form for that field was edited (dirty)** since expand or load. If the user only expanded to view (no edits in the structured form), do NOT overwrite the canon line on collapse.
    - [x] When dirty: serialize current structured value using existing helpers (rangeToText, durationToText, etc.) and update the form text field and single-line input.
    - [x] Manual adjustment of structured fields is allowed (e.g. user fixes a parser failure by editing the structured form); any edit marks the field dirty and on collapse the serialized value is written to the canon line. Track dirty state per field (e.g. clean when expanded from canonical_data or parse; dirty when user changes any structured input).

- [x] **Load and save**
    - [x] On spell load: populate form with flat text columns; do not show structured forms until user expands. When user expands, follow "On expand" rules (canonical_data or parse).
    - [x] On save: if any detail field is currently expanded and dirty, serialize that field to the canon line first so flat text is up to date; then send flat text and build canonical_data from current specs as today. Persistence shape unchanged. Saving is always explicit (user activates Save); no auto-save on navigate or close.

- [x] **Unsaved changes and navigation**
    - [x] When the user has unsaved changes (edited canon lines and/or a dirty expanded field) and attempts to navigate away (e.g. another spell, Add Spell) or close: show a warning (e.g. confirm dialog); allow cancel-and-stay or leave-and-discard.
    - [x] Do not auto-serialize dirty expanded fields to the canon line on navigate/close—serialization happens only on explicit collapse or on explicit Save.

## Components Field (Special Case)

- [x] **Components collapsed**
    - [x] Single line showing components text (e.g. "V, S, M" or "V, S, M (ruby dust 50 gp)"); bind to form.components (and optionally material description for display).
- [x] **Components expanded**
    - [x] Show ComponentCheckboxes (V/S/M) and material component list; on collapse, if the components structured form was edited (dirty), serialize to form.components and form.materialComponents via componentsToText; otherwise leave the canon line unchanged.

## Warning and "Special" Indicator

- [x] **When expanded and spec is "special"**
    - [x] Show the existing "could not be fully parsed" hint for that field (inline or in expandable section).
- [x] **When collapsed**
    - [x] If last parse or loaded spec for that field was "special", show a subtle indicator (e.g. icon or tooltip) so user knows the line is stored but not fully structured for hashing (required, not optional).

## Accessibility and UX

- [x] Expand/collapse: aria-expanded, aria-controls; keyboard activation (Enter/Space); focus moves into expanded content when opened, back to expand control when closed (or follow frontend-standards).
- [x] Labels: each single-line input has a visible label (Range, Duration, etc.) and appropriate aria-label if needed.

## Testing

- [x] **Storybook**
    - [x] Add Storybook story or stories for the canon-first Details block (or extracted canon-field row component if applicable).
    - [x] Story: default (collapsed) state — all detail fields as single-line inputs and expand controls visible; no structured forms.
    - [x] Story: one field expanded — e.g. Duration expanded showing StructuredFieldInput; expand control has aria-expanded and focus behavior.
    - [x] Story: optional variants (e.g. Components expanded, Range expanded) so all canon fields can be exercised in isolation.
    - [x] Use the same `data-testid` values as implementation (e.g. `detail-range-input`, `detail-range-expand`) so stories align with E2E.
    - [x] Ensure stories work with existing Storybook setup (fixtures, a11y addon) and run under `pnpm test:storybook` if applicable.

- [x] **Playwright E2E**
    - [x] Create E2E spec for canon-first behavior (e.g. `spell_editor_canon_first.spec.ts`) using existing fixtures (`test-fixtures`, `SpellbookApp`, `TIMEOUTS`) and patterns from `spell_editor_structured_data.spec.ts`.
    - [x] Test: Edit a spell in canon view only (change Range line, save); assert saved text and optional canonical_data.
    - [x] Test: Expand a field, edit structured form, collapse; assert single line updates from spec (dirty → serialize).
    - [x] Test: Expand a field, do not edit structured form, collapse; assert canon line unchanged (view-only → not dirty).
    - [x] Test: Load spell with canonical_data; expand a field; assert structured form shows data from canonical_data (no re-parse).
    - [x] Test: New spell: all fields collapsed, empty lines; expand one field, assert parse or default behavior; save and re-open, assert persistence.
    - [x] Test: Manual fix: expand field with "special", edit structured form to fix, collapse; assert canon line updates with serialized fix.
    - [x] Test (optional): Unsaved changes — with dirty expanded field or edited canon lines, navigate away or trigger close; assert warning is shown and no auto-serialize/auto-save occurs.
    - [x] Target canon inputs and expand controls via `data-testid` (e.g. `detail-range-input`, `detail-duration-expand`) for stability.

## Documentation

- [x] **docs/user/spell_editor.md**
    - [x] Describe default view as canon-first: single-line inputs + expand control per detail field; structured forms only when expanded.
    - [x] Explain expand (reveal structured form from parse or canonical_data), collapse (update canon line only when dirty), and view-only collapse leaves line unchanged.
    - [x] Keep "Structured Fields" content for the expanded experience; add "special" indicator when collapsed for unparseable fields.
    - [x] Keep Legacy String vs Structured Data, Content Hash, Validation consistent with canon-first wording.

- [x] **docs/dev/spell_editor_components.md**
    - [x] Add/update section on canon-first Details block (default: one row per field, order, expand control; structured components only when expanded).
    - [x] Document data flow: load → flat text; expand → canonical_data or parse; collapse → serialize only when dirty.
    - [x] Update E2E and test IDs section with canon-first IDs: `detail-*-input`, `detail-*-expand` for Range, Components, Duration, Casting Time, Area, Saving Throw, Damage, Magic Resistance.
    - [x] Adjust example/state-management wording so structured components are shown only when a field is expanded.

- [x] **docs/TESTING.md**
    - [x] Reference canon-first E2E spec (e.g. `spell_editor_canon_first.spec.ts`) and scenarios it covers (including loading state on expand and unsaved-changes warning).
    - [x] If canon-first Storybook stories are added, note where they live (path or story title).

## Out of Scope (Do Not Implement Here)

- Changes to name, level, school, sphere, class list, source, edition, author, license, tags, reversible, quest, cantrip (unchanged).
- Changes to spell schema or canonical serialization format.
- Changes to backend parser behavior or storage shape.
