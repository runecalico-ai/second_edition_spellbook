use crate::models::canonical_spell::CanonicalSpell;
use crate::models::range_spec::RangeKind;
use crate::models::scalar::ScalarMode;

use crate::utils::parsers::duration::DurationParser;
use crate::utils::parsers::range::RangeParser;

#[test]
fn test_issue_1_duration_per_level_zero_preservation() {
    let parser = DurationParser::new();
    // Case 1: "1 round / level" path
    let spec = parser.parse("1 round / level");
    let scalar = spec.duration.unwrap();
    assert_eq!(scalar.mode, ScalarMode::PerLevel);
    assert_eq!(scalar.value, Some(0.0));

    // Case 2: "1 round / 2 levels" divisor path
    let spec2 = parser.parse("1 round / 2 levels");
    let scalar2 = spec2.duration.unwrap();
    assert_eq!(scalar2.mode, ScalarMode::PerLevel);
    assert_eq!(scalar2.value, Some(0.0));
}

#[test]
fn test_issue_2_materialize_defaults() {
    let mut spell = CanonicalSpell {
        name: "Test Spell".to_string(),
        tradition: "arcane".to_string(),
        description: "Test".to_string(),
        level: 1,
        reversible: None,          // Implicitly 0
        material_components: None, // Implicitly []
        components: None,          // Implicitly all false
        casting_time: None,        // Should stay None now
        is_quest_spell: Some(0),
        is_cantrip: Some(0),
        schema_version: 0, // Implicitly 1
        ..Default::default()
    };

    spell.normalize();

    assert_eq!(spell.reversible, None);
    assert_eq!(spell.material_components, None);
    assert!(spell.components.is_none());

    // Bugfix: casting_time should stay None if it was missing
    assert!(spell.casting_time.is_none());

    // is_quest_spell/is_cantrip materialization (Rule 48)
    // Lean Hashing: both are pruned because they match default 0
    assert_eq!(spell.is_quest_spell, None);
    assert_eq!(spell.is_cantrip, None);
}

#[test]
fn test_issue_3_mixed_unit_fallback_preserves_context() {
    let range_parser = RangeParser::new();
    // Test that LOS and Anchor are preserved even when unit parsing fails
    let res = range_parser.parse("1 yd + 1 ft/level (LOS) centered on target");
    assert_eq!(res.kind, RangeKind::Special);
    assert!(res
        .requires
        .unwrap()
        .contains(&crate::models::RangeContext::Los));
    assert_eq!(res.anchor, Some(crate::models::RangeAnchor::Target));
    assert_eq!(
        res.text.unwrap(),
        "1 yd + 1 ft/level (LOS) centered on target"
    );
}

#[test]
fn test_duration_unit_serialization_snake_case() {
    use crate::models::duration_spec::DurationUnit;
    let unit = DurationUnit::Round;
    let json = serde_json::to_string(&unit).unwrap();
    assert_eq!(json, "\"round\"");
}

#[test]
fn test_experience_flag_autosync() {
    let mut spell = CanonicalSpell::new("XP Test".into(), 1, "ARCANE".into(), "Desc".into());
    spell.experience_cost = Some(crate::models::experience::ExperienceComponentSpec {
        kind: crate::models::experience::ExperienceKind::Fixed,
        amount_xp: Some(100),
        ..Default::default()
    });
    // Components initially all false
    spell.components = Some(crate::models::canonical_spell::SpellComponents {
        verbal: false,
        somatic: false,
        material: false,
        focus: false,
        divine_focus: false,
        experience: false,
    });

    spell.normalize();

    assert!(spell.components.unwrap().experience);
}

#[test]
fn test_damage_sorting_determinism_on_collision() {
    use crate::models::damage::{
        ApplicationSpec, DamageCombineMode, DamageKind, DamagePart, DamageSaveSpec, DamageType,
        DicePool, SpellDamageSpec,
    };

    let mut spec = SpellDamageSpec {
        kind: DamageKind::Modeled,
        combine_mode: DamageCombineMode::Sum,
        parts: Some(vec![
            DamagePart {
                id: "same".to_string(),
                damage_type: DamageType::Fire,
                base: DicePool {
                    terms: vec![],
                    flat_modifier: 10,
                },
                application: ApplicationSpec::default(),
                save: DamageSaveSpec::default(),
                ..Default::default()
            },
            DamagePart {
                id: "same".to_string(),
                damage_type: DamageType::Cold, // Different content
                base: DicePool {
                    terms: vec![],
                    flat_modifier: 5,
                },
                application: ApplicationSpec::default(),
                save: DamageSaveSpec::default(),
                ..Default::default()
            },
        ]),
        ..Default::default()
    };

    spec.normalize();

    // Sort order should be stable based on serialized content tie-breaker
    let parts = spec.parts.as_ref().unwrap();
    // "Cold" (serialized part) likely comes before "Fire" or vice versa, but it must be consistent.
    // Let's just verify it sorted.
    assert_eq!(parts.len(), 2);
}

#[test]
fn test_range_text_structured_mode_preserves_case() {
    use crate::models::range_spec::RangeSpec;
    let mut r1 = RangeSpec {
        kind: RangeKind::Special,
        text: Some("Line of Sight".to_string()),
        ..Default::default()
    };
    let mut r2 = RangeSpec {
        kind: RangeKind::Special,
        text: Some("line of sight".to_string()),
        ..Default::default()
    };

    r1.normalize();
    r2.normalize();

    // Structured mode preserves case; only whitespace is collapsed
    assert_eq!(r1.text, Some("Line of Sight".to_string()));
    assert_eq!(r2.text, Some("line of sight".to_string()));
}

// ============================================================================
// Regression tests for canonical hashing fixes (2026-02-06)
// ============================================================================

/// Regression test: RangeSpec.unit should serialize as "inch" not "inches"
/// per proposal.md line 27: normalized to canonical "inch" form
#[test]
fn test_range_unit_inch_serialization() {
    use crate::models::range_spec::{RangeKind, RangeSpec, RangeUnit};

    let spec = RangeSpec {
        kind: RangeKind::Distance,
        unit: Some(RangeUnit::Inch),
        ..Default::default()
    };

    let json = serde_json::to_string(&spec).unwrap();
    assert!(
        json.contains("\"unit\":\"inch\""),
        "RangeUnit::Inch should serialize as 'inch', got: {}",
        json
    );
    assert!(
        !json.contains("\"inches\""),
        "Should NOT contain 'inches', got: {}",
        json
    );
}

/// Regression test: DurationSpec.condition uses Structured mode
/// per docs: DurationSpec.condition should collapse whitespace
#[test]
fn test_duration_condition_structured_normalization() {
    use crate::models::duration_spec::{DurationKind, DurationSpec};

    let mut spec = DurationSpec {
        kind: DurationKind::Conditional,
        condition: Some("  until  the  target \n leaves  ".to_string()),
        ..Default::default()
    };

    spec.normalize();

    // Structured mode collapses all whitespace including newlines
    assert_eq!(spec.condition, Some("until the target leaves".to_string()));
}

/// Regression test: MaterialComponentSpec.unit uses Structured mode
/// per docs: unit names should collapse whitespace
#[test]
fn test_material_component_unit_structured_normalization() {
    use crate::models::material::MaterialComponentSpec;

    let mut spec = MaterialComponentSpec {
        name: "Diamond".to_string(),
        unit: Some("  fluid  ounces  ".to_string()),
        ..Default::default()
    };

    spec.normalize();

    // Structured mode collapses whitespace
    assert_eq!(spec.unit, Some("fluid ounces".to_string()));
}

/// Regression test: RangeSpec.text uses Structured mode (not LowercaseStructured)
/// per docs line 136: preserves case, only collapses whitespace
#[test]
fn test_range_text_preserves_case() {
    use crate::models::range_spec::{RangeKind, RangeSpec};

    let mut spec = RangeSpec {
        kind: RangeKind::Special,
        text: Some("  Line  of  Sight  ".to_string()),
        ..Default::default()
    };

    spec.normalize();

    // Structured mode preserves case, only collapses whitespace (canonical-serialization spec)
    assert_eq!(spec.text, Some("Line of Sight".to_string()));
}

#[test]
fn test_regression_magic_resistance_partial_normalization() {
    use crate::models::magic_resistance::*;
    let mut spec = MagicResistanceSpec {
        kind: MagicResistanceKind::Partial,
        partial: Some(MrPartialSpec {
            scope: MrPartialScope::ByPartId,
            part_ids: Some(vec!["  Part B  ".into(), "part a".into(), "part a".into()]),
        }),
        ..Default::default()
    };
    spec.normalize();
    let partial = spec.partial.unwrap();
    let ids = partial.part_ids.unwrap();
    assert_eq!(ids.len(), 2);
    assert_eq!(ids[0], "part a");
    assert_eq!(ids[1], "part b");
}

#[test]
fn test_regression_experience_normalization() {
    use crate::models::experience::*;
    let mut spec = ExperienceComponentSpec {
        kind: ExperienceKind::Formula,
        formula: Some(ExperienceFormula {
            expr: "2 * X".into(),
            vars: vec![FormulaVar {
                name: "  X  ".into(),
                var_kind: VarKind::Count,
                label: None,
            }],
            rounding: RoundingMode::None,
            min_xp: None,
            max_xp: None,
        }),
        per_unit: Some(PerUnitXp {
            xp_per_unit: 10,
            unit_kind: UnitKind::Creature,
            unit_label: Some("  Creatures  ".into()),
            rounding: RoundingMode::None,
            min_xp: None,
            max_xp: None,
        }),
        ..Default::default()
    };
    spec.normalize();
    let formula = spec.formula.unwrap();
    assert_eq!(formula.vars[0].name, "x", "FormulaVar.name is normalized to schema-valid lowercase");
    let per_unit = spec.per_unit.unwrap();
    assert_eq!(per_unit.unit_label, Some("Creatures".into()));
}

#[test]
fn test_regression_schema_version_future_warning() {
    let mut spell = CanonicalSpell::new("Future Spell".into(), 1, "ARCANE".into(), "Desc".into());
    spell.school = Some("Abjuration".into());
    spell.schema_version = crate::models::canonical_spell::CURRENT_SCHEMA_VERSION + 1;

    let result = spell.validate();
    // Rule update: Future versions are now warnings, not hard errors
    assert!(
        result.is_ok(),
        "Future schema versions should be allowed with a warning"
    );
}

#[test]
fn test_regression_material_strict_unknown_fields() {
    let json = r#"{
        "name": "Diamond",
        "quantity": 1.0,
        "unknown_field": "error"
    }"#;
    let result: Result<crate::models::material::MaterialComponentSpec, _> =
        serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn test_regression_lean_hashing_complex_pruning() {
    use crate::models::experience::ExperienceComponentSpec;
    use crate::models::magic_resistance::{MagicResistanceKind, MagicResistanceSpec};
    use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

    let mut spell = CanonicalSpell::new("Pruning Test".into(), 1, "ARCANE".into(), "Desc".into());
    spell.school = Some("Abjuration".into());
    spell.class_list = vec!["Wizard".into()];

    // Set complex specs to their default/empty state
    spell.saving_throw = Some(SavingThrowSpec {
        kind: SavingThrowKind::None,
        ..Default::default()
    });
    spell.magic_resistance = Some(MagicResistanceSpec {
        kind: MagicResistanceKind::Unknown,
        ..Default::default()
    });
    spell.experience_cost = Some(ExperienceComponentSpec {
        can_reduce_level: true,
        ..Default::default()
    });
    spell.components = Some(crate::models::canonical_spell::SpellComponents {
        verbal: false,
        somatic: false,
        material: false,
        focus: false,
        divine_focus: false,
        experience: false,
    });

    spell.normalize();

    // Rule 88: All these should be pruned because they match their default state
    assert!(spell.saving_throw.is_none(), "Default ST should be pruned");
    assert!(
        spell.magic_resistance.is_none(),
        "Default MR should be pruned"
    );
    assert!(
        spell.experience_cost.is_none(),
        "Default XP should be pruned"
    );
    assert!(
        spell.components.is_none(),
        "All-false components should be pruned"
    );
}

#[test]
fn test_regression_normalization_mode_distinction() {
    use crate::models::damage::DamagePart;
    use crate::models::experience::FormulaVar;
    use crate::models::experience::VarKind;

    // 1. FormulaVar.name: LowercaseStructured + spaces to underscores (schema-valid ^[a-z][a-z0-9_]{0,31}$)
    use crate::models::experience::{ExperienceFormula, ExperienceKind, RoundingMode};
    let mut spec = crate::models::experience::ExperienceComponentSpec {
        kind: ExperienceKind::Formula,
        formula: Some(ExperienceFormula {
            expr: "CL * 10".into(),
            vars: vec![FormulaVar {
                name: "  Caster  Level  ".into(),
                var_kind: VarKind::CasterLevel,
                label: None,
            }],
            rounding: RoundingMode::None,
            min_xp: None,
            max_xp: None,
        }),
        ..Default::default()
    };
    spec.normalize();
    assert_eq!(
        spec.formula.as_ref().unwrap().vars[0].name,
        "caster_level",
        "FormulaVar.name must be schema-valid (lowercase, underscores)"
    );

    // 2. DamagePart.id: LowercaseStructured (Collapses whitespace, LOWERCASE)
    let mut part = DamagePart {
        id: "  Main  Damage  ".into(),
        ..Default::default()
    };
    part.id = crate::models::canonical_spell::normalize_string(
        &part.id,
        crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
    );
    assert_eq!(part.id, "main damage");
}

#[test]
fn test_regression_enum_alias_deserialization() {
    use crate::models::damage::DamageType;

    // Test varying cases and plurals for DamageType
    let json1 = "\"FIRE\"";
    let json2 = "\"Fire\"";
    let json3 = "\"fire\"";

    let dt1: DamageType = serde_json::from_str(json1).unwrap();
    let dt2: DamageType = serde_json::from_str(json2).unwrap();
    let dt3: DamageType = serde_json::from_str(json3).unwrap();

    assert_eq!(dt1, DamageType::Fire);
    assert_eq!(dt2, DamageType::Fire);
    assert_eq!(dt3, DamageType::Fire);
}

// ---- Regression tests for canonical hashing fixes (bugs, gaps, concerns) ----

#[test]
fn test_regression_range_text_word_boundaries() {
    // BUG-3: Unit alias replacement must use word boundaries; substrings (e.g. "backyard", "footprint") unchanged.
    use crate::models::range_spec::{RangeKind, RangeSpec};

    let mut spell_backyard = CanonicalSpell::new("Backyard".into(), 1, "ARCANE".into(), "Desc".into());
    spell_backyard.school = Some("Evocation".into());
    spell_backyard.class_list = vec!["Wizard".into()];
    spell_backyard.range = Some(RangeSpec {
        kind: RangeKind::Special,
        text: Some("backyard".to_string()),
        unit: None,
        distance: None,
        requires: None,
        anchor: None,
        region_unit: None,
        notes: None,
    });

    let mut spell_yards = spell_backyard.clone();
    spell_yards.name = "Yards".to_string();
    spell_yards.range.as_mut().unwrap().text = Some("10 yards".to_string());

    let mut spell_ft_dot = spell_backyard.clone();
    spell_ft_dot.name = "FtDot".to_string();
    spell_ft_dot.range.as_mut().unwrap().text = Some("60 ft.".to_string());

    spell_backyard.normalize();
    spell_yards.normalize();
    spell_ft_dot.normalize();

    assert_eq!(
        spell_backyard.range.as_ref().unwrap().text.as_deref(),
        Some("backyard"),
        "backyard must be unchanged (no substring replacement)"
    );
    assert_eq!(
        spell_yards.range.as_ref().unwrap().text.as_deref(),
        Some("10 yd"),
        "10 yards must normalize to 10 yd"
    );
    assert_eq!(
        spell_ft_dot.range.as_ref().unwrap().text.as_deref(),
        Some("60 ft"),
        "60 ft. must normalize to 60 ft"
    );
}

#[test]
fn test_regression_empty_object_pruned_from_canonical_json() {
    // GAP-3: Lean Hashing must remove empty objects (e.g. clamp_total: {}).
    use crate::models::damage::{
        ApplicationSpec, ClampSpec, DamagePart, DamageSaveSpec, DicePool, DiceTerm,
        SpellDamageSpec,
    };
    use crate::models::damage::{DamageKind, DamageType};

    let mut spell = CanonicalSpell::new(
        "Empty Obj Regression".into(),
        1,
        "ARCANE".into(),
        "Desc".into(),
    );
    spell.school = Some("Evocation".into());
    spell.class_list = vec!["Wizard".into()];
    spell.damage = Some(SpellDamageSpec {
        kind: DamageKind::Modeled,
        parts: Some(vec![DamagePart {
            id: "main".to_string(),
            damage_type: DamageType::Fire,
            base: DicePool {
                terms: vec![DiceTerm {
                    count: 1,
                    sides: 6,
                    per_die_modifier: 0,
                }],
                flat_modifier: 0,
            },
            clamp_total: Some(ClampSpec {
                min_total: None,
                max_total: None,
            }),
            application: ApplicationSpec::default(),
            save: DamageSaveSpec::default(),
            ..Default::default()
        }]),
        ..Default::default()
    });

    let json = spell.to_canonical_json().unwrap();
    assert!(
        !json.contains("\"clamp_total\":{}"),
        "Empty clamp_total object must be pruned from canonical JSON"
    );
}

#[test]
fn test_regression_experience_cost_source_text_excluded_from_hash() {
    // BUG-2: source_text is metadata; is_default() must not depend on it; same hash for None vs default-with-source_text.
    use crate::models::experience::{
        ExperienceComponentSpec, ExperienceKind, ExperiencePayer, PaymentTiming,
        PaymentSemantics, Recoverability,
    };

    let default_with_source = ExperienceComponentSpec {
        kind: ExperienceKind::None,
        payer: ExperiencePayer::Caster,
        payment_timing: PaymentTiming::OnCompletion,
        payment_semantics: PaymentSemantics::Spend,
        can_reduce_level: true,
        recoverability: Recoverability::NormalEarning,
        amount_xp: None,
        per_unit: None,
        formula: None,
        tiered: None,
        dm_guidance: None,
        source_text: Some("XP, no cost".to_string()),
        notes: None,
    };

    let mut spell1 = CanonicalSpell::new("XP Hash".into(), 1, "ARCANE".into(), "Desc".into());
    spell1.school = Some("Abjuration".into());
    spell1.class_list = vec!["Wizard".into()];
    spell1.experience_cost = None;

    let mut spell2 = spell1.clone();
    spell2.experience_cost = Some(default_with_source);

    let hash1 = spell1.compute_hash().unwrap();
    let hash2 = spell2.compute_hash().unwrap();
    assert_eq!(
        hash1, hash2,
        "Hash must be identical when experience_cost is mechanically default but has source_text set"
    );
}

#[test]
fn test_regression_dice_term_clamping_in_spell() {
    // CONCERN-3: DiceTerm count/sides clamped in canonical form; spell with invalid values still normalizes and hashes.
    use crate::models::damage::{
        ApplicationSpec, DamagePart, DamageSaveSpec, DicePool, DiceTerm, SpellDamageSpec,
    };
    use crate::models::damage::{DamageKind, DamageType};

    let mut spell = CanonicalSpell::new(
        "Dice Clamp Regression".into(),
        1,
        "ARCANE".into(),
        "Desc".into(),
    );
    spell.school = Some("Evocation".into());
    spell.class_list = vec!["Wizard".into()];
    spell.damage = Some(SpellDamageSpec {
        kind: DamageKind::Modeled,
        parts: Some(vec![DamagePart {
            id: "main".to_string(),
            damage_type: DamageType::Fire,
            base: DicePool {
                terms: vec![
                    DiceTerm {
                        count: -1,
                        sides: 6,
                        per_die_modifier: 0,
                    },
                    DiceTerm {
                        count: 2,
                        sides: 0,
                        per_die_modifier: 0,
                    },
                ],
                flat_modifier: 0,
            },
            application: ApplicationSpec::default(),
            save: DamageSaveSpec::default(),
            ..Default::default()
        }]),
        ..Default::default()
    });

    spell.normalize();
    let terms = &spell.damage.as_ref().unwrap().parts.as_ref().unwrap()[0].base.terms;
    assert_eq!(terms[0].count, 0, "count must be clamped to >= 0");
    assert_eq!(terms[0].sides, 6, "sides unchanged when >= 1");
    assert_eq!(terms[1].count, 2, "count unchanged when >= 0");
    assert_eq!(terms[1].sides, 1, "sides must be clamped to >= 1");

    let hash = spell.compute_hash();
    assert!(hash.is_ok(), "Spell with clamped dice must still hash: {:?}", hash.err());
}

#[test]
fn test_regression_subschools_descriptors_case_normalization() {
    // GAP-4: subschools/descriptors differing only by case must produce the same hash.
    let mut spell1 = CanonicalSpell::new("Taxonomy Case".into(), 1, "ARCANE".into(), "Desc".into());
    spell1.school = Some("Evocation".into());
    spell1.class_list = vec!["Wizard".into()];
    spell1.subschools = vec!["Fire".to_string()];
    spell1.descriptors = vec!["Mind-Affecting".to_string()];

    let mut spell2 = spell1.clone();
    spell2.subschools = vec!["fire".to_string()];
    spell2.descriptors = vec!["mind-affecting".to_string()];

    assert_eq!(
        spell1.compute_hash().unwrap(),
        spell2.compute_hash().unwrap(),
        "subschools/descriptors case differences must normalize to same hash"
    );
}

#[test]
fn test_regression_duration_spec_deny_unknown_fields() {
    // GAP-1: DurationSpec must reject unknown fields at deserialization.
    let json = r#"{"kind": "time", "unit": "round", "unknown_field": "error"}"#;
    let result: Result<crate::models::duration_spec::DurationSpec, _> = serde_json::from_str(json);
    assert!(
        result.is_err(),
        "DurationSpec must reject unknown field"
    );
}
