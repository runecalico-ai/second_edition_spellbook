
Two-Pass Deep Analysis: spell.schema.json
Pass 1 — Structural & Syntactic Inconsistencies
1.1 Boolean-vs-Integer flag split
reversible, is_quest_spell, and is_cantrip use "type": "integer", "enum": [0, 1], while components.verbal / somatic / material / focus / divine_focus / experience use "type": "boolean". The same semantic concept (yes/no flag) is modeled two different ways in the same document. Choose one or document the reason for the difference.

1.2 const: null on fields whose type has no null in the enum
In the top-level allOf:

sphere is declared as "type": "string" with a strict enum. JSON Schema const: null asserts the value must literally be JSON null, but null is not a member of the sphere enum and is not listed as an allowed type. A validator following the spec will reject sphere: null against the base property definition and accept its absence — making the const: null constraint both logically broken and redundant. The same defect exists for school in the DIVINE branch. The correct idiom is:

1.3 SavingThrowSpec missing conditional required guards
SavingThrowSpec.kind has values single, multiple, and dm_adjudicated, but there are no allOf / if-then conditions enforcing:

kind: "single" → required: ["single"]
kind: "multiple" → required: ["multiple"]
kind: "dm_adjudicated" → required: ["dm_guidance"]
Every other discriminated-union spec (SpellDamageSpec, ExperienceComponentSpec, DurationSpec, AreaSpec, RangeSpec) has these guards. SavingThrowSpec is the only one that omits them, making it structurally inconsistent and unenforceable.

1.4 SpellDamageSpec.kind: "modeled" allows parts-free records
"modeled" semantically means "damage is represented by a dice model." Allowing notes alone (without parts) is logically contradictory — a "modelled" spell without a single DamagePart is not modelled. The "dm_adjudicated" kind already exists for unquantifiable damage. "modeled" should hard-require parts.

1.5 raw_legacy_value is never enforced when kind: "special"
AreaSpec, RangeSpec, DurationSpec, and SpellDamageSpec each reserve raw_legacy_value as the fallback for unparseable values. However, none of them contain a condition like:

The same gap exists for casting_time when unit: "special". The fallback field can silently be omitted, defeating its own purpose.

1.6 casting_time.unit: "instantaneous" is semantically a duration unit
instantaneous describes the duration of an effect, not how long it takes to cast. It appears in both:

casting_time.unit enum (this file)
DurationSpec.kind as "instant" (different name, same concept)
A spell's casting time in AD&D 2e is measured in segments or rounds; there is no such thing as an "instantaneous" casting time. This is a domain error masquerading as a structural one, and the naming is also inconsistent ("instantaneous" vs "instant").

1.7 scalar def allows both value and per_level simultaneously
The allOf in scalar requires value when mode: "fixed" and per_level when mode: "per_level", but does not prohibit the other field. A consumer can store { mode: "fixed", value: 10, per_level: 2 } and the schema accepts it. This creates ambiguity in any downstream serializer that reads both fields.

1.8 AreaSpec.unit mixes linear, area, and volume dimensions
unit on AreaSpec contains:

linear: "ft", "yd", "mi", "inch"
area: "ft2", "yd2", "square"
volume: "ft3", "yd3"
logical: "hex", "room", "floor"
Meanwhile shape_unit (for geometric dimensions) is correctly restricted to linear values. The mixed unit enum should be split or at minimum only the relevant subset used per kind should be in play. Currently kind: "surface" requires unit (area), kind: "volume" requires unit (volume), and kind: "tiles" requires tile_unit instead — but nothing prevents kind: "radius_circle" from having unit: "ft3".

1.9 components block is optional but internally fully required
The top-level required array does not include "components". If the block is present, all six sub-fields are required. If it is absent, no defaults are applied. This is inconsistent with every individual sub-field having "default": false — defaults in JSON Schema are informational, not applied by validators. The block should either be in required or the sub-field required: [...] should be dropped.

1.10 material_components and experience_cost have no binding to components
No constraint ensures:

components.material = true when material_components is non-empty
components.experience = true when experience_cost.kind != "none"
Two sources of truth for the same fact can diverge silently.

1.11 RangeSpec.kind — "los" / "loe" standalone kinds vs "distance_los" / "distance_loe"
Four kinds exist: los, loe, distance_los, distance_loe. The allOf for distance_los mandates required: ["distance", "unit"] and recommends requires: ["los"]. But los alone (no distance) has no constraints. LOS with no numeric distance is equivalent to sight ("sight" is also in the enum). The relationship between "los" and "sight" is undefined, creating ambiguity.

Pass 2 — Semantic & Domain Inconsistencies
2.1 school enum contains both compound and component schools
The enum lists mutually-overlapping values:

Compound	Component parts
"Conjuration/Summoning"	"Conjuration", "Summoning"
"Enchantment/Charm"	"Enchantment", "Charm"
"Invocation/Evocation"	"Invocation", "Evocation"
"Illusion/Phantasm"	"Illusion", "Phantasm"
AD&D 2e uses the compound forms as the primary school names (PHB p.19). The individual sub-names (Conjuration, Evocation etc.) exist as subschools. Storing them at the same level in the same field creates ambiguity about which form to use and whether a spell has a compound school or two separate schools.

2.2 is_cantrip has no level constraint
In AD&D 2e, cantrips are level-0 spells. The schema allows { "is_cantrip": 1, "level": 5 } without error. There should be a constraint that is_cantrip = 1 implies level = 0.

2.3 is_quest_spell has no level constraint
Quest spells in AD&D 2e are typically level 6-7 for priests (some settings use higher for wizards). The schema allows { "is_quest_spell": 1, "level": 1 }. At minimum, some cross-field validation or documentation should exist.

2.4 Duplicate saving throw subsystems
SavingThrowSpec (spell-level, rich) and SaveSpec within DamagePart (simplified) model the same concept with different schemas. A spell can have:

saving_throw.kind: "none" at the spell level
damage.parts[0].save.kind: "half" at the part level
These two fields have no reconciliation rule. Which takes precedence? What does a validator do with contradictory values?

2.5 Duplicate magic resistance subsystems
MagicResistanceSpec at the spell level and DamagePart.mr_interaction repeat the same information at different granularities with no documented precedence rule, same as item 2.4 above.

2.6 focus and divine_focus components are anachronistic
components includes focus and divine_focus. These component types were introduced in D&D 3rd Edition. AD&D 2e only defines Verbal (V), Somatic (S), and Material (M) components. Including 3e-specific component types in an AD&D 2e schema without documentation risks data entry errors.

2.7 sphere enum contains setting-specific values without marking
"Elemental Rain", "Elemental Sun", "Magma", "Silt", "Desert", "Drow", "Destiny", "Fate", "Numbers", "Travelers", "Time", "Thought" are spheres from specific campaign settings (Dark Sun, Forgotten Realms, etc.) while "All", "Animal", "Healing", etc. are core Player's Handbook spheres. All are treated identically. There is no source_setting field or tagging to distinguish core from setting-specific spheres.

2.8 tradition: "BOTH" — no rule on which school/sphere take precedence
When tradition = "BOTH", both school and sphere are required. But in AD&D 2e a spell belongs to one tradition. "Both" most commonly arises for dual-listed spells (e.g., available to both wizard and priest but defined separately for each). Encoding both properties in one record creates a de-normalization that has no documented interpretation rule.

2.9 DurationSpec.kind: "concentration" missing condition requirement
All conditional/triggered duration kinds (conditional, until_triggered, planar) require a condition field. concentration does not. In AD&D 2e, concentration spells end when the caster takes damage, casts another spell, or performs other actions — that breaking condition is mechanical information that should be structured, not silently omitted.

2.10 level maximum of 12 is undocumented
AD&D 2e wizard spells top out at level 9 (with a handful of 10th-circle spells in supplements); priest spells top at 7 (6 for most). The schema accepts level 12 without any trait that distinguishes such spells (beyond is_quest_spell). The maximum is presumably for homebrew / setting extensions but there is no explanation, and no conditional constraint gates what other fields are valid at those levels.

2.11 ExperienceComponentSpec.payment_timing: "on_both" is undefined
"on_both" is listed as a timing option but "both" of what is never specified. The adjacent values are on_start / on_completion / on_effect / on_success / on_failure, from which "both" likely means on_success and on_failure. A clearer name would be on_resolution or the value should be removed and both individual values set via a list.

Summary Table
#	Pass	Category	Severity
1.1	Structural	Boolean/integer flag inconsistency	Medium
1.2	Structural	const: null against non-nullable enum — broken constraint	High
1.3	Structural	SavingThrowSpec missing all discriminated-union guards	High
1.4	Structural	"modeled" damage accepts zero parts	High
1.5	Structural	raw_legacy_value never enforced on "special" kinds	Medium
1.6	Structural	"instantaneous" in casting_time.unit (wrong domain + naming)	Medium
1.7	Structural	scalar allows both value and per_level simultaneously	Medium
1.8	Structural	AreaSpec.unit mixes incompatible dimension types	Medium
1.9	Structural	components optional but internally fully required	Low
1.10	Structural	material_components / experience_cost not bound to components flags	Medium
1.11	Structural	"los" / "loe" standalone kinds overlap with "sight"	Low
2.1	Semantic	school has compound and component schools at the same level	High
2.2	Semantic	is_cantrip=1 not constrained to level=0	Medium
2.3	Semantic	is_quest_spell=1 has no level constraint	Low
2.4	Semantic	Dual saving throw systems with no precedence rule	High
2.5	Semantic	Dual magic resistance systems with no precedence rule	High
2.6	Semantic	focus/divine_focus are 3e concepts, not AD&D 2e	Low
2.7	Semantic	sphere mixes core and setting-specific values unmarked	Low
2.8	Semantic	tradition: "BOTH" has no interpretation rule	Medium
2.9	Semantic	concentration duration doesn't require condition	Medium
2.10	Semantic	level max=12 undocumented, unconstrained	Low
2.11	Semantic	"on_both" payment timing is ambiguous	Low
The five High severity issues (1.2, 1.3, 1.4, 2.1, 2.4, 2.5) are the ones most likely to cause silent data corruption or allow invalid records to pass validation undetected. Would you like me to produce corrected schema fragments for any of them?

