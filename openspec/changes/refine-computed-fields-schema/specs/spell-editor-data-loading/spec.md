## MODIFIED Requirements

### Requirement: Spell Editor Data Loading
The Spell Editor MUST handle loading spell data from multiple sources with graceful fallbacks.

#### Scenario: Canonical Data Loading
- GIVEN a spell with `canonical_data` column populated
- WHEN opening the spell in the editor
- THEN the editor MUST load structured values from `canonical_data`
- AND populate all structured input components with those values (`StructuredFieldInput` for Range, Duration, and Casting Time; `SavingThrowInput` and `MagicResistanceInput` for their respective fields).

#### Scenario: Hybrid canonical_data (partial)
- GIVEN a spell where `canonical_data` exists (is not null)
- BUT a specific key (e.g. "range", "duration") is **absent or explicitly `null`** in the JSON object
- AND a legacy string exists for that field (e.g. from flat columns), OR no data exists for that field at all
- WHEN opening the spell in the editor
- THEN the editor MUST parse that field via the Tauri parser commands and merge the parsed structured value into the editor state for that field.
- AND for `savingThrow` and `magicResistance` keys absent or `null` in `canonical_data`, the editor MUST apply the same fallback mapping used in the Legacy String Parsing scenario (no parser command; map legacy text to structured state).
- AND if any parsed field falls back to `kind: "special"`, the warning banner MUST be displayed (same rules as Legacy String Parsing).
- AND while parser invocations are in flight, the editor MUST render the form in a loading/disabled state until all pending parser calls resolve.

**Hybrid Loading Logic Details:**
- **`canonical_data` exists**: JSON.parse succeeds and result is an object (not null). This includes empty objects `{}`.
- **Missing field**: Field is absent or explicitly `null`. The canonical check MUST be: `canonicalData[field] == null` (loose equality), which covers both `undefined` (key absent) and `null` (key present with null value) in a single expression. Do NOT use strict `=== undefined` or the `in` operator separately — the loose equality check is the prescribed pattern to avoid subtle divergence.
- **Empty object `{}`**: All fields are missing per the above check; parse all legacy strings for all fields that have legacy string values.
- **No legacy string available**: If a field is missing from `canonical_data` AND no legacy string exists for it, initialize the field to its UI default state. See `spell-editor-structured-fields` for the authoritative UI-defaults contract per field type.
- **Parallel parsing**: When multiple fields require parser commands simultaneously, all invocations MUST be dispatched in parallel (`Promise.all`). Sequential dispatch is not acceptable.
- **savingThrow / magicResistance**: `canonicalData.savingThrow` and `canonicalData.magicResistance` are checked with the same `== null` predicate. When absent/null, apply fallback mapping from legacy text; do not invoke a parser command.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands. Command names use `parse_spell_*` prefix: `parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`, and `parse_spell_components` when a legacy component string is present (i.e. a non-empty legacy component column value exists rather than structured `components.*` boolean flags). These commands wrap `SpellParser` in `src-tauri/src/utils/spell_parser.rs`. Each accepts a legacy string and returns the schema-native structured type.
- AND all parser invocations MUST be dispatched in parallel (`Promise.all`). Sequential dispatch is not acceptable.
- AND while parser invocations are in flight, the editor MUST render the form in a loading/disabled state until all pending parser calls resolve.
- AND if a Tauri invocation itself fails (IPC error, command not found, serialization error), the affected field MUST be treated as a parser failure and handled as follows — log the error in all cases:
  - **Fields with `kind: "special"`** (`RangeSpec`, `DurationSpec`, `AreaSpec`, `MagicResistanceSpec`): initialize to `kind: "special"` with the original legacy string in `raw_legacy_value`; include the field in the warning banner.
  - **`casting_time`** (no `kind` field; uses `unit: "special"`): initialize to `unit: "special"` with the original legacy string in `raw_legacy_value`; include in the warning banner.
  - **`SpellDamageSpec`** (kinds: `"none"`, `"modeled"`, `"dm_adjudicated"` — no `"special"` kind): initialize to `kind: "none"`, preserve the original legacy string in `source_text`. This does NOT trigger the warning banner since damage has no `kind: "special"` fallback.
- AND `savingThrow` and `magicResistance` are handled without parser commands: when `canonical_data` is missing for those fields, the editor MUST use fallback mapping from legacy text to structured state. The fallback mapping for `savingThrow` resolves common 2e strings (e.g. "Save vs. Spell", "Save vs. Rod") to `save_type` + `save_vs` pairs per the AD&D 2e saving throw matrix; for `magicResistance`, the legacy value may be a percentage string (e.g. "20%"), "Yes", "No", or a descriptive string — map to the structured `MagicResistanceSpec` kind accordingly.
- AND populate structured inputs with parsed values. If a field has no legacy string AND no `canonical_data` value, initialize it to its UI default (see `spell-editor-structured-fields`).
- AND display a warning banner if any field's parsing fell back to `kind: "special"`. The banner MUST appear as a single banner at the top of the form, listing the fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). Note: `raw_legacy_value` is unconditionally preserved for all kinds, but acts as the primary user-editable display text when kind is "special".

**Warning Banner UX Details:**
- **Placement**: Banner at the very top of the form, above all field inputs and labels.
- **Dismissibility**: Banner is **non-dismissible** - user must either fix the data or accept the `kind: "special"` fallback by saving the spell.
- **Persistence**: Banner persists until user edits affected field(s) to valid non-special values, or the spell is saved with `kind: 'special'` still active. The banner tracks active special-fallback fields individually: after a successful save, each field that is no longer `kind: 'special'` (because the user fixed it before saving) is removed from the banner independently. Fields that are saved with `kind: 'special'` still active are also dismissed from the banner — the fallback value is now durably stored and no unsaved changes remain for that field. The banner is fully dismissed only when no fields remain listed. After a failed save, the banner persists unchanged for all listed fields.
- **Navigation guard**: This guard is a *specialized extension* of the general unsaved-changes guard. If the user attempts to navigate away while the warning banner is active AND the form has unsaved changes, the editor MUST show a confirmation dialog (e.g. "You have unparsed fields. Navigating away will discard your current editor state. Continue?"). If the form has no unsaved changes (i.e. the spell was loaded with special fallbacks but the user made no edits), navigation away is permitted without a prompt — the original data in the database is unchanged. If a general unsaved-changes guard already exists in the editor, this scenario MUST be handled within that same guard rather than as a separate interceptor.

**Casing Standards for IPC and Storage:**
- **Parser commands** return structured types using **`camelCase`** field names for IPC (via `#[serde(rename_all = "camelCase")]` on backend structs).
- **Frontend state** MUST use `camelCase` to match IPC return values.
- **Canonical storage** (`canonical_data` column) uses **`snake_case`** per the canonical serialization spec.
- **Reading from `canonical_data`**: The stored JSON blob uses `snake_case` keys. When loading into frontend state, the editor MUST convert keys from `snake_case` to `camelCase` (e.g. `raw_legacy_value` → `rawLegacyValue`, `save_type` → `saveType`). This conversion MUST be applied consistently; do not access `canonical_data` fields by their `snake_case` key names directly in React component state.
- **Conversion** from camelCase (frontend/IPC) to snake_case (canonical storage) happens when building `CanonicalSpell` for persistence.

**Parser fallbacks:** SpellParser returns schema-valid structured types and ALWAYS unconditionally preserves the original source string. For `RangeSpec`, `DurationSpec`, `AreaSpec`, `SavingThrowSpec`, and `casting_time`, this is stored in `raw_legacy_value` (hashed content). For `SpellDamageSpec`, this is stored in `source_text` (non-hashed metadata). On parse failure, the parser returns fallbacks such as `kind: "special"` where the preserved string is presented to the user. The UI MUST handle parser errors defensively (show error, fall back to kind=special with the original string). Invalid parser output MUST be validated by the frontend using a type guard or schema validator (e.g. Zod) against the expected structured type; if validation fails, treat as a parser failure and include the field in the warning banner.

**v1-Shaped `canonical_data` Compatibility:**

The backend's `migrate_to_v2()` runs lazily on `normalize()` (i.e., on save). Until a spell is re-saved, its `canonical_data` column may still contain schema version 1 JSON with the following v1-only shapes:
- `SavingThrowSpec` may contain a `dm_guidance` field (deleted in v2).
- `SpellDamageSpec` may contain `raw_legacy_value` (renamed to `source_text` in v2).

The frontend MUST tolerate these v1-shaped fields without crashing or data loss:
- `dm_guidance` read from `canonical_data`: MUST be remapped to `notes` client-side before populating editor state. If `notes` is already non-empty, append `dm_guidance` content after a newline (matching the backend migration logic). Do NOT bind UI components directly to `dm_guidance`.
- `SpellDamageSpec.raw_legacy_value` read from `canonical_data`: MUST be treated as `source_text` (display as the original source annotation). Do NOT leave the field unread or treat it as an unknown field.
- `SpellDamageSpec.source_text` and `SpellDamageSpec.raw_legacy_value` both present: prefer `source_text` (post-migration value); discard `raw_legacy_value`.

*Implementation guidance:* A lightweight client-side normalization function that maps v1 → v2 field names on the parsed `canonical_data` object before dispatching to editor state is the cleanest approach. This function runs once on load and handles both migrated (v2) and un-migrated (v1) spells transparently.
