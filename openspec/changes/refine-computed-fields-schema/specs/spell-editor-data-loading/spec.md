## MODIFIED Requirements

### Requirement: Spell Editor Data Loading
The Spell Editor MUST handle loading spell data from multiple sources with graceful fallbacks.

#### Scenario: Legacy Data Loading
- GIVEN a spell with `canonical_data` column populated
- WHEN opening the spell in the editor
- THEN the editor MUST load structured values from `canonical_data`
- AND populate all `StructuredFieldInput` components with those values.

#### Scenario: Hybrid canonical_data (partial)
- GIVEN a spell where `canonical_data` exists (is not null)
- BUT a specific key (e.g. "range", "duration") is **missing** from the JSON object (undefined, not just null)
- AND a legacy string exists for that field (e.g. from flat columns)
- WHEN opening the spell in the editor
- THEN the editor MUST parse that field via the Tauri parser commands and merge the parsed structured value into the editor state for that field.

**Hybrid Loading Logic Details:**
- **`canonical_data` exists**: JSON.parse succeeds and result is an object (not null). This includes empty objects `{}`.
- **Missing field**: Field is `undefined` (not present in object). Check using `field === undefined` or `!(field in canonicalData)`.
- **`null` field**: Field exists but value is `null`. Treat as missing for hybrid loading purposes (parse legacy string if available).
- **Empty object `{}`**: All fields are missing, parse all legacy strings for all fields that have legacy string values.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands. Command names use `parse_spell_*` prefix: `parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`, and optionally `parse_spell_components` for legacy component strings. These commands wrap `SpellParser` in `src-tauri/src/utils/spell_parser.rs`. Each accepts a legacy string and returns the schema-native structured type.
- AND `savingThrow` and `magicResistance` are handled without parser commands: when `canonical_data` is missing for those fields, the editor MUST use fallback mapping from legacy text to structured state.
- AND populate structured inputs with parsed values
- AND display a warning banner if parsing fell back to `kind: "special"`. The banner MUST appear as a single banner at the top of the form, listing the fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). Note: `raw_legacy_value` is unconditionally preserved for all kinds, but acts as the primary user-editable display text when kind is "special".

**Warning Banner UX Details:**
- **Placement**: Banner at the very top of the form, above all field inputs and labels.
- **Dismissibility**: Banner is **non-dismissible** - user must either fix the data or accept the `kind: "special"` fallback by saving the spell.
- **Persistence**: Banner persists until user edits affected field(s) to valid values, saves with kind=special, or navigates away.

**Casing Standards for IPC and Storage:**
- **Parser commands** return structured types using **`camelCase`** field names for IPC (via `#[serde(rename_all = "camelCase")]` on backend structs).
- **Frontend state** MUST use `camelCase` to match IPC return values.
- **Canonical storage** (`canonical_data` column) uses **`snake_case`** per the canonical serialization spec.
- **Conversion** from camelCase (frontend/IPC) to snake_case (canonical storage) happens when building `CanonicalSpell` for persistence.

**Parser fallbacks:** SpellParser returns schema-valid structured types, and ALWAYS unconditionally preserves the original `raw_legacy_value`; on parse failure it returns fallbacks such as `kind: "special"` where the `raw_legacy_value` is presented to the user. The UI MUST handle parser errors defensively (show error, fall back to kind=special with raw string). Invalid parser output MUST be validated by the frontend; if validation fails, treat as parser failure and include in warning banner.
