## MODIFIED Requirements

> **Change note:** Updated to reflect `refine-computed-fields-schema` changes:
> - **DamageForm**: `source_text` added to `SpellDamageSpec` (replaces `raw_legacy_value` for non-hashed metadata); `dm_guidance` is **retained** on `SpellDamageSpec` and MUST be shown when `kind = "dm_adjudicated"` (required by schema). Note: `dm_guidance` removal applies only to `SavingThrowSpec` (see proposal Decision 3).
> - **AreaForm**: bind to new `.text` property on `AreaSpec`.
> - **SavingThrowInput**: remove `dm_guidance` binding (field deleted from `SavingThrowSpec`); bind to new `raw_legacy_value`.
> - **MagicResistanceInput**: display (read-only) new `source_text` property.

### Requirement: Complex Field Editing
The Spell Editor MUST provide specialized forms for complex fields.

#### Scenario: Damage Editing
- GIVEN the Spell Editor form
- WHEN editing Damage
- THEN the editor MUST render a `DamageForm`
- AND allow selecting kind (None, Modeled, DM Adjudicated) with human-readable labels; form value and serialization MUST use schema enums (`"none"`, `"modeled"`, `"dm_adjudicated"`)
- AND if Modeled, allow adding multiple damage parts. Each DamagePart MUST satisfy schema required fields (id, damage_type, base, application, save). When adding a new part, the UI MUST initialize `application` to `{ scope: "per_target" }` and `save` to `{ kind: "none" }` as schema-compliant defaults.
- AND each DamagePart MUST be assigned a stable, unique ID upon creation matching schema pattern `^[a-z][a-z0-9_]{0,31}$`. Use the pattern: `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`. IDs MUST be assigned immediately upon part creation. No runtime uniqueness verification is required — the combined timestamp + 7-character base-36 suffix provides sufficient entropy for human-edited spells with a small number of parts.
- AND allow configuring damage type, dice pool, and scaling for each part.
- AND for `"modeled"` kind, a `notes` text area MUST also be provided (schema `allOf` requires either `parts` or `notes` for this kind; notes supports text-only modeled descriptions when no parts are defined).
- AND if kind is `"dm_adjudicated"`, the form MUST show a `dm_guidance` text area (required by schema `allOf` conditional for this kind) and an optional `notes` text area. No damage parts sub-form is shown.
- AND if kind is `"none"`, no damage parts sub-form or `dm_guidance` field is shown.
- AND if `source_text` is populated (the original legacy string preserved by the importer, excluded from the canonical hash), the form MUST display it as a read-only labelled annotation (e.g., "Original source text") for all kinds. It MUST NOT be editable by the user.

#### Scenario: Area Editing
- GIVEN the Spell Editor form
- WHEN editing Area
- THEN the editor MUST render an `AreaForm`
- AND allow selecting kind (Cone, Cube, Sphere, etc.)
- AND allow entering specific scalars (radius, length, etc.) based on kind. Geometric dimensions use `shape_unit` per `#/$defs/AreaSpec`; surface/volume kinds use the scalar plus `unit`.
- AND when kind is NOT "special", the form MUST bind to the `.text` property of the `AreaSpec` for the computed canonical text preview (read-only or auto-recomputed).
- AND when kind IS "special", the user-editable field MUST be `raw_legacy_value` (consistent with Range and Duration special handling). The `.text` property is NOT directly edited by the user in this case; it MUST be derived from `raw_legacy_value` when `raw_legacy_value` is non-empty (the same text, before normalization is applied on save), or set to `None` when `raw_legacy_value` is empty/absent. Do NOT emit an empty string for `.text` when there is nothing to derive from — `AreaSpec.text` is optional in the schema, so `None` is correct for the no-input state. See `spell-editor-structured-fields` for the real-time `.text` preview computation contract.

#### Pattern: Enum selector + optional custom/special field
For fields whose schema has a kind/enum and optional custom or special content (e.g. notes, or a manually editable `raw_legacy_value` when kind is special), the editor MUST provide an enum-based selector for kind/options plus an optional custom or special field when the schema allows. SavingThrowInput and MagicResistanceInput follow this pattern.

#### Scenario: Saving Throw and MR Editing
- GIVEN the Spell Editor form
- WHEN editing Saving Throw
- THEN the editor MUST render `SavingThrowInput` per `#/$defs/SavingThrowSpec` (kind: none, single, multiple, dm_adjudicated)
- AND when kind is `"single"` or `"multiple"`, MUST show SingleSave sub-form(s) (save_type, save_vs, applies_to, on_success, on_failure). `save_type` selects the saving throw matrix *category* (e.g. `"paralyzation_poison_death"`, `"rod_staff_wand"`); `save_vs` selects the *specific effect* being saved against (e.g. `"spell"`, `"poison"`, `"death_magic"`). Both MUST be rendered as enum selectors.
- AND when kind is `"dm_adjudicated"`, no SingleSave sub-form is shown. The `notes` field (the sole narrative field after `dm_guidance` removal) MUST be surfaced as an editable text area.
- AND when kind is `"none"`, no sub-form or additional fields are shown.
- AND for all kinds: if `raw_legacy_value` is populated (new field — stored unconditionally per Decision 1), it MUST be shown as a read-only labelled annotation. The `notes` field (top-level on `SavingThrowSpec`, not scoped to any single kind) MUST be available as an editable text area for all kinds.
- WHEN editing Magic Resistance
- THEN the editor MUST render specific enum-based inputs (not generic strings)
- AND the `applies_to` enum selector MUST be displayed for all kinds EXCEPT `unknown`. When kind is `unknown`, the `applies_to` selector MUST be hidden or disabled as it is not applicable per schema logic.
- AND a `notes` text area MUST be shown for all kinds (it is optional per schema and applies across all MR kinds).
- AND if `source_text` is populated (the original legacy descriptor preserved by the importer, excluded from the canonical hash), it MUST be displayed as a read-only labelled annotation. It MUST NOT be editable by the user.
- UI labels MUST map to schema enum values: `whole_spell` → "Whole Spell"; `harmful_effects_only` → "Harmful Effects Only"; `beneficial_effects_only` → "Beneficial Effects Only"; `dm` → "DM Discretion".

#### Scenario: Magic Resistance partial and special
- GIVEN the Spell Editor form and Magic Resistance is being edited
- WHEN kind is "partial"
- THEN the editor MUST show the `applies_to` selector AND a sub-form for `#/$defs/MagicResistanceSpec`.partial: scope (required enum: `damage_only`, `non_damage_only`, `primary_effect_only`, `secondary_effects_only`, `by_part_id`) and optional part_ids (array of strings referencing `DamagePart.id` values from the spell's damage model — only applicable when scope is `by_part_id`). If scope is `by_part_id` and the spell's `damage.kind` is not `"modeled"` (i.e., no `DamagePart` entries exist), the part_ids picker MUST be disabled and MUST display an informational message (e.g., "No modeled damage parts available — set Damage to Modeled first").
- WHEN kind is "special"
- THEN the editor MUST show the `applies_to` selector AND a field for special_rule (optional text, per schema).
