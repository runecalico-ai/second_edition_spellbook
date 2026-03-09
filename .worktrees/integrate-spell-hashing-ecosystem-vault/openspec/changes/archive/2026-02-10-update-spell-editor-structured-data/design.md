# Design: Update Spell Editor with Structured Data Components

**Change:** update-spell-editor-structured-data  
**Status:** Finalized (post-implementation)

---

## Context

The spell editor originally treated complex fields (Range, Duration, Casting Time, Area, Damage, Components, Saving Throw, Magic Resistance) as free-text strings. This prevented validation, consistent formatting, and stable content hashing. Spec #1 (add-spell-canonical-hashing-foundation) defined the schema; Spec #2 (add-spell-data-migration-infrastructure) provided backend parsers. This change adds structured UI components that emit schema-native shapes and integrate with the existing SpellEditor, with legacy data loaded via Tauri parser commands when `canonical_data` is missing or partial.

---

## Goals / Non-Goals

**Goals:**
- Replace string inputs with structured form components that emit schema-native shapes (RangeSpec, DurationSpec, AreaSpec, SpellDamageSpec, etc.).
- Share scalar/dimension logic via a common foundation (ScalarInput) while keeping kind-specific UI per field type.
- Load data from `canonical_data` when present; when a field is missing or null, parse legacy strings via Tauri `parse_spell_*` commands and merge into editor state.
- Display content hash in the spell view (first 8 chars + Expand + Copy) and render structured fields in a human-readable way (e.g. computed `.text`).
- Enforce tradition-based validation (ARCANE → school, DIVINE → sphere, BOTH → both) with block-save and inline errors; use clamp-on-change for numeric bounds.
- Preserve backward compatibility: legacy string columns remain; migration is incremental on edit/save.

**Non-Goals:**
- Backend schema or hashing algorithm changes (Spec #1).
- One-time bulk migration of all spells (Spec #2).
- Dedicated read-only Spell Detail route (detail behavior lives in SpellEditor when editing).
- UI polish, theme, or broad accessibility (Spec #4).
- Import/Export integration (Spec #5).

---

## Decisions

### 1. Component Architecture: Shared Scalar + Kind-Specific Blocks

**Decision:** Implement `StructuredFieldInput` as a single component that accepts `fieldType` (range | duration | casting_time) and internally uses a shared `ScalarInput` for dimensions/scalars, with distinct kind selectors and layout blocks per field type. Area, Damage, Saving Throw, and Magic Resistance each have dedicated components (`AreaForm`, `DamageForm`, `SavingThrowInput`, `MagicResistanceInput`). Components use a shared `EnumWithSpecial`-style pattern where the schema has a kind enum plus optional custom/special content.

**Rationale:**
- Avoids duplication of scalar/dimension logic (mode, value, per_level, unit) across range, duration, and area.
- Keeps a single contract for the editor: pass value + onChange; component emits schema shape.
- Area and Damage are complex enough to warrant their own components; Saving Throw and Magic Resistance share the “kind + optional sub-form” pattern for consistency.

**Alternatives Considered:**
- Separate components per field (RangeInput, DurationInput, etc.): More files and prop duplication; scalar logic would be repeated or extracted anyway.
- Single mega-component for all structured fields: Hard to maintain and test; kind enums and shapes differ too much.

---

### 2. Data Loading: Canonical-First, Then Legacy Parse

**Decision:** On load, prefer `canonical_data` (JSON). For each field, if the key is missing or null and a legacy string exists, call the corresponding Tauri parser command (`parse_spell_range`, `parse_spell_duration`, etc.) and merge the result into editor state. If `canonical_data` is null or missing entirely, parse all legacy strings. Do not duplicate parser logic in the frontend.

**Rationale:**
- Single source of truth after first save; no re-parsing on subsequent edits.
- Backward compatibility: existing spells with only legacy columns still open and can be edited; on save, structured data is written to `canonical_data`.
- Parsers live in Rust (Spec #2); frontend only invokes commands and validates output (e.g. via `parserValidation.ts`) with fallback to `kind: "special"` and warning banner on failure.

**Implementation notes:**
- Treat both `undefined` and `null` as “missing” for hybrid loading.
- Empty object `{}` in `canonical_data` means all fields missing → parse all legacy strings.

---

### 3. Casing: camelCase in Frontend/IPC, snake_case in Canonical Storage

**Decision:** Parser commands return structured types with **camelCase** field names (backend uses `#[serde(rename_all = "camelCase")]`). Frontend state and component props use camelCase. Conversion to **snake_case** happens when building `CanonicalSpell` for persistence; `canonical_data` column stores snake_case per canonical serialization spec.

**Rationale:**
- Tauri/JavaScript convention is camelCase; schema and canonical hashing use snake_case. Clear boundary at “build for persistence” avoids mixing conventions in the UI layer.

---

### 4. Parser Failure and Warning Banner

**Decision:** If a parser command fails (IPC error, invalid output) or returns a shape that fails frontend validation, treat the field as unparseable: set fallback to `kind: "special"` with `raw_legacy_value` set to the original legacy string. Show a single, non-dismissible warning banner at the top of the form listing all affected fields (e.g. “Range and Duration could not be fully parsed; original text preserved”). Do not block editing or saving; user can fix or save as-is.

**Rationale:**
- Graceful degradation: odd or legacy-specific strings don’t break the editor.
- Single banner avoids multiple alerts; non-dismissible keeps the issue visible until data is fixed or saved.

---

### 5. Tradition Validation: Block Save + Inline Errors

**Decision:** Tradition validation is semantic: ARCANE requires school, DIVINE requires sphere, BOTH requires both. Use “block save + inline validation errors” (red border, error message under the field). Do not use clamp for these; only numeric inputs use clamp-on-change for bounds (e.g. base_value ≥ 0, quantity ≥ 1.0).

**Rationale:**
- School/sphere are required by business rules, not numeric ranges; blocking save and showing where the problem is matches user expectations.
- Aligns with frontend-standards: clamp for numbers, block-save + inline error for semantic rules.

---

### 6. Spell “Detail” View: No Separate Route

**Decision:** There is no dedicated read-only “Spell Detail” route (e.g. `/spell/:id`). Hash display, structured field rendering, and component badges are implemented in the **SpellEditor** when editing an existing spell (e.g. when `!isNew && form.contentHash`). The spec’s “Spell Detail view” is interpreted as “the view where the user sees spell details,” i.e. the editor itself.

**Rationale:**
- Current app flow is Library → Edit; adding a separate detail view was out of scope.
- Same UI (hash, .text display, badges) can be reused later if a read-only detail route is added (e.g. Spec #4 or #5).

---

### 7. Component Testability: data-testid and Naming

**Decision:** All new structured form components and key controls use `data-testid` with kebab-case, descriptive values (e.g. `range-base-value`, `duration-unit`, `component-checkbox-material`, `area-form-kind`, `damage-form-add-part`, `spell-detail-hash-display`, `spell-detail-hash-copy`, `spell-detail-hash-expand`). E2E and Storybook target these for stability.

**Rationale:**
- Matches frontend-standards; avoids brittle selectors and supports automated tests and accessibility checks.

---

### 8. Material Component Uncheck: Confirmation Before Clear

**Decision:** When the user unchecks the Material checkbox and the material components list is not empty, show a confirmation dialog. Only clear `material_components` and set `material: false` if the user confirms.

**Rationale:**
- Prevents accidental data loss; explicit confirmation is a common pattern for destructive or large changes.

---

### 9. Damage Part IDs: Stable, Schema-Compliant, Assigned on Create

**Decision:** Each new damage part is assigned a unique ID at creation time using the pattern `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, matching schema pattern `^[a-z][a-z0-9_]{0,31}$`. IDs are not editable; collisions are handled by regenerating or appending. When kind is switched to “none,” parts are cleared (or omitted) from emitted state so output is `{ kind: "none" }`.

**Rationale:**
- Deterministic hashing and list stability require stable IDs; assignment at creation keeps the model consistent. Clearing parts on “none” keeps UI and persisted state aligned.

---

### 10. Defaults: UI vs Canonical

**Decision:** Editor UI uses user-friendly defaults (e.g. casting_time unit “action” for display). Canonical materialization (backend) uses schema defaults when fields are omitted (e.g. casting_time unit “segment”). Quantity defaults to 1.0 in UI and in emitted material_components for hashing consistency.

**Rationale:**
- UI prioritizes clarity; canonical prioritizes schema consistency. Documenting the split avoids confusion when the same field appears differently in the editor vs stored blob.

---

## Summary

The design centers on: (1) structured components that emit schema-native shapes and share scalar logic where possible; (2) canonical-first loading with legacy parse fallback via Tauri commands and a single warning banner; (3) camelCase in frontend/IPC and snake_case in `canonical_data`; (4) tradition validation via block-save and inline errors; (5) no separate detail route—detail behavior lives in SpellEditor; (6) consistent testids and confirmation for material uncheck; (7) stable damage part IDs and clear “none” behavior. This aligns the implementation with the proposal, tasks, and delta specs and leaves room for future UI polish and read-only detail views.
