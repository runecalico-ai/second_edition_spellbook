use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageKind {
    #[default]
    #[serde(alias = "NONE", alias = "None")]
    None,
    #[serde(alias = "MODELED", alias = "Modeled")]
    Modeled,
    #[serde(alias = "DM_ADJUDICATED", alias = "DmAdjudicated")]
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageCombineMode {
    #[default]
    #[serde(alias = "SUM", alias = "Sum")]
    Sum,
    #[serde(alias = "MAX", alias = "Max")]
    Max,
    #[serde(alias = "CHOOSE_ONE", alias = "ChooseOne")]
    ChooseOne,
    #[serde(alias = "SEQUENCE", alias = "Sequence")]
    Sequence,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageType {
    #[serde(alias = "ACID", alias = "Acid")]
    Acid,
    #[serde(alias = "COLD", alias = "Cold")]
    Cold,
    #[serde(alias = "ELECTRICITY", alias = "Electricity")]
    Electricity,
    #[serde(alias = "FIRE", alias = "Fire")]
    Fire,
    #[serde(alias = "SONIC", alias = "Sonic")]
    Sonic,
    #[serde(alias = "FORCE", alias = "Force")]
    Force,
    #[serde(alias = "MAGIC", alias = "Magic")]
    Magic,
    #[serde(alias = "NEGATIVE_ENERGY", alias = "NegativeEnergy")]
    NegativeEnergy,
    #[serde(alias = "POSITIVE_ENERGY", alias = "PositiveEnergy")]
    PositiveEnergy,
    #[serde(alias = "POISON", alias = "Poison")]
    Poison,
    #[serde(alias = "PSYCHIC", alias = "Psychic")]
    Psychic,
    #[serde(alias = "PHYSICAL_BLUDGEONING", alias = "PhysicalBludgeoning")]
    PhysicalBludgeoning,
    #[serde(alias = "PHYSICAL_PIERCING", alias = "PhysicalPiercing")]
    PhysicalPiercing,
    #[serde(alias = "PHYSICAL_SLASHING", alias = "PhysicalSlashing")]
    PhysicalSlashing,
    #[default]
    #[serde(alias = "UNTYPED", alias = "Untyped")]
    Untyped,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct DiceTerm {
    pub count: i32,
    pub sides: i32,
    #[serde(default)]
    pub per_die_modifier: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct DicePool {
    pub terms: Vec<DiceTerm>,
    #[serde(default)]
    pub flat_modifier: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScalingKind {
    #[default]
    #[serde(alias = "ADD_DICE_PER_STEP", alias = "AddDicePerStep")]
    AddDicePerStep,
    #[serde(alias = "ADD_FLAT_PER_STEP", alias = "AddFlatPerStep")]
    AddFlatPerStep,
    #[serde(alias = "SET_BASE_BY_LEVEL_BAND", alias = "SetBaseByLevelBand")]
    SetBaseByLevelBand,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScalingDriver {
    #[default]
    #[serde(alias = "CASTER_LEVEL", alias = "CasterLevel")]
    CasterLevel,
    #[serde(alias = "SPELL_LEVEL", alias = "SpellLevel")]
    SpellLevel,
    #[serde(alias = "TARGET_HD", alias = "TargetHd")]
    TargetHd,
    #[serde(alias = "TARGET_LEVEL", alias = "TargetLevel")]
    TargetLevel,
    #[serde(alias = "CHOICE", alias = "Choice")]
    Choice,
    #[serde(alias = "OTHER", alias = "Other")]
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct LevelBand {
    pub min: i32,
    pub max: i32,
    pub base: DicePool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct ScalingRule {
    pub kind: ScalingKind,
    pub driver: ScalingDriver,
    #[serde(default = "default_step")]
    pub step: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_steps: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dice_increment: Option<DiceTerm>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flat_increment: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_bands: Option<Vec<LevelBand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

fn default_step() -> i32 {
    1
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct ClampSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_total: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_total: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ApplicationScope {
    #[default]
    #[serde(alias = "PER_TARGET", alias = "PerTarget")]
    PerTarget,
    #[serde(alias = "PER_AREA_TARGET", alias = "PerAreaTarget")]
    PerAreaTarget,
    #[serde(alias = "PER_MISSILE", alias = "PerMissile")]
    PerMissile,
    #[serde(alias = "PER_RAY", alias = "PerRay")]
    PerRay,
    #[serde(alias = "PER_ROUND", alias = "PerRound")]
    PerRound,
    #[serde(alias = "PER_TURN", alias = "PerTurn")]
    PerTurn,
    #[serde(alias = "PER_HIT", alias = "PerHit")]
    PerHit,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TickDriver {
    #[default]
    #[serde(alias = "FIXED", alias = "Fixed")]
    Fixed,
    #[serde(alias = "CASTER_LEVEL", alias = "CasterLevel")]
    CasterLevel,
    #[serde(alias = "SPELL_LEVEL", alias = "SpellLevel")]
    SpellLevel,
    #[serde(alias = "DURATION", alias = "Duration")]
    Duration,
    #[serde(alias = "CHOICE", alias = "Choice")]
    Choice,
    #[serde(alias = "DM", alias = "Dm")]
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ApplicationSpec {
    pub scope: ApplicationScope,
    #[serde(default = "default_step")]
    pub ticks: i32,
    #[serde(default = "default_tick_driver")]
    pub tick_driver: TickDriver,
}

impl Default for ApplicationSpec {
    fn default() -> Self {
        Self {
            scope: ApplicationScope::default(),
            ticks: 1,
            tick_driver: TickDriver::default(),
        }
    }
}

fn default_tick_driver() -> TickDriver {
    TickDriver::Fixed
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageSaveKind {
    #[default]
    #[serde(alias = "NONE", alias = "None")]
    None,
    #[serde(alias = "HALF", alias = "Half")]
    Half,
    #[serde(alias = "NEGATES", alias = "Negates")]
    Negates,
    #[serde(alias = "PARTIAL", alias = "Partial")]
    Partial,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DamageSavePartial {
    pub numerator: i32,
    pub denominator: i32,
}

impl Default for DamageSavePartial {
    fn default() -> Self {
        Self {
            numerator: 1,
            denominator: 2,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct DamageSaveSpec {
    pub kind: DamageSaveKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial: Option<DamageSavePartial>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MrInteraction {
    #[default]
    #[serde(alias = "NORMAL", alias = "Normal")]
    Normal,
    #[serde(alias = "IGNORES_MR", alias = "IgnoresMr")]
    IgnoresMr,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
    #[serde(alias = "UNKNOWN", alias = "Unknown")]
    Unknown,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct DamagePart {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub damage_type: DamageType,
    pub base: DicePool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scaling: Option<Vec<ScalingRule>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clamp_total: Option<ClampSpec>,
    pub application: ApplicationSpec,
    pub save: DamageSaveSpec,
    #[serde(default = "default_mr_interaction")]
    pub mr_interaction: MrInteraction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

fn default_mr_interaction() -> MrInteraction {
    MrInteraction::Normal
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct SpellDamageSpec {
    pub kind: DamageKind,
    #[serde(default)]
    pub combine_mode: DamageCombineMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parts: Option<Vec<DamagePart>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dm_guidance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl SpellDamageSpec {
    pub fn normalize(&mut self) {
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        if let Some(g) = &mut self.dm_guidance {
            *g = crate::models::canonical_spell::normalize_string(
                g,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }

        if let Some(parts) = &mut self.parts {
            for part in parts.iter_mut() {
                part.id = crate::models::canonical_spell::normalize_string(
                    &part.id,
                    crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
                );
                if let Some(l) = &mut part.label {
                    *l = crate::models::canonical_spell::normalize_string(
                        l,
                        crate::models::canonical_spell::NormalizationMode::Textual,
                    );
                }
                if let Some(pn) = &mut part.notes {
                    *pn = crate::models::canonical_spell::normalize_string(
                        pn,
                        crate::models::canonical_spell::NormalizationMode::Textual,
                    );
                }
                if let Some(scaling_rules) = &mut part.scaling {
                    for rule in scaling_rules.iter_mut() {
                        if let Some(rn) = &mut rule.notes {
                            *rn = crate::models::canonical_spell::normalize_string(
                                rn,
                                crate::models::canonical_spell::NormalizationMode::Textual,
                            );
                        }
                        if let Some(bands) = &mut rule.level_bands {
                            bands.sort_by_key(|b| (b.min, b.max));
                        }
                    }
                    // Sort scaling rules by kind, driver, and step
                    scaling_rules.sort_by(|a, b| {
                        (a.kind as i32, a.driver as i32, a.step).cmp(&(
                            b.kind as i32,
                            b.driver as i32,
                            b.step,
                        ))
                    });
                }
            }
            // Sort parts by ID to ensure stable hash, UNLESS combine_mode is sequence
            // For sequence mode, order is semantically meaningful and must be preserved.
            // If IDs are identical, use serialized content as a tie-breaker to ensure
            // order-independent hashing remains fully deterministic.
            if self.combine_mode != DamageCombineMode::Sequence {
                parts.sort_by(|a, b| {
                    let id_cmp = a.id.cmp(&b.id);
                    if id_cmp == std::cmp::Ordering::Equal {
                        // Tie-breaker: deterministic JCS-serialized content
                        let a_json = serde_json_canonicalizer::to_string(a).unwrap_or_default();
                        let b_json = serde_json_canonicalizer::to_string(b).unwrap_or_default();
                        a_json.cmp(&b_json)
                    } else {
                        id_cmp
                    }
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_mode_preserves_order() {
        let mut spec = SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sequence,
            parts: Some(vec![
                DamagePart {
                    id: "z_initial".to_string(),
                    damage_type: DamageType::Fire,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 6,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "a_followup".to_string(),
                    damage_type: DamageType::Cold,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 4,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "m_final".to_string(),
                    damage_type: DamageType::Acid,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 8,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
            ]),
            dm_guidance: None,
            notes: None,
        };

        spec.normalize();

        let parts = spec.parts.as_ref().unwrap();
        assert_eq!(parts.len(), 3);
        // Order should be preserved (z, a, m) not sorted (a, m, z)
        assert_eq!(parts[0].id, "z_initial");
        assert_eq!(parts[1].id, "a_followup");
        assert_eq!(parts[2].id, "m_final");
    }

    #[test]
    fn test_non_sequence_modes_sort_by_id() {
        let mut spec = SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sum, // Non-sequence mode
            parts: Some(vec![
                DamagePart {
                    id: "z_third".to_string(),
                    damage_type: DamageType::Fire,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 6,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "a_first".to_string(),
                    damage_type: DamageType::Cold,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 4,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "m_second".to_string(),
                    damage_type: DamageType::Acid,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 8,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
            ]),
            dm_guidance: None,
            notes: None,
        };

        spec.normalize();

        let parts = spec.parts.as_ref().unwrap();
        assert_eq!(parts.len(), 3);
        // Should be sorted alphabetically by ID
        assert_eq!(parts[0].id, "a_first");
        assert_eq!(parts[1].id, "m_second");
        assert_eq!(parts[2].id, "z_third");
    }

    #[test]
    fn test_all_combine_modes_sort_except_sequence() {
        for (mode, should_sort) in [
            (DamageCombineMode::Sum, true),
            (DamageCombineMode::Max, true),
            (DamageCombineMode::ChooseOne, true),
            (DamageCombineMode::Sequence, false),
        ] {
            let mut spec = SpellDamageSpec {
                kind: DamageKind::Modeled,
                combine_mode: mode,
                parts: Some(vec![
                    DamagePart {
                        id: "z".to_string(),
                        damage_type: DamageType::Fire,
                        base: DicePool {
                            terms: vec![DiceTerm {
                                count: 1,
                                sides: 6,
                                per_die_modifier: 0,
                            }],
                            flat_modifier: 0,
                        },
                        application: ApplicationSpec::default(),
                        save: DamageSaveSpec::default(),
                        ..Default::default()
                    },
                    DamagePart {
                        id: "a".to_string(),
                        damage_type: DamageType::Cold,
                        base: DicePool {
                            terms: vec![DiceTerm {
                                count: 1,
                                sides: 4,
                                per_die_modifier: 0,
                            }],
                            flat_modifier: 0,
                        },
                        application: ApplicationSpec::default(),
                        save: DamageSaveSpec::default(),
                        ..Default::default()
                    },
                ]),
                dm_guidance: None,
                notes: None,
            };

            spec.normalize();

            let parts = spec.parts.as_ref().unwrap();
            if should_sort {
                assert_eq!(parts[0].id, "a", "Mode {:?} should sort parts", mode);
                assert_eq!(parts[1].id, "z", "Mode {:?} should sort parts", mode);
            } else {
                assert_eq!(parts[0].id, "z", "Mode {:?} should preserve order", mode);
                assert_eq!(parts[1].id, "a", "Mode {:?} should preserve order", mode);
            }
        }
    }

    #[test]
    fn test_sequence_different_order_different_serialization() {
        // Two specs with same parts but different order should serialize differently
        let mut spec1 = SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sequence,
            parts: Some(vec![
                DamagePart {
                    id: "first".to_string(),
                    damage_type: DamageType::Fire,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 6,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "second".to_string(),
                    damage_type: DamageType::Cold,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 4,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
            ]),
            dm_guidance: None,
            notes: None,
        };

        let mut spec2 = SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sequence,
            parts: Some(vec![
                DamagePart {
                    id: "second".to_string(), // Swapped order
                    damage_type: DamageType::Cold,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 4,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
                DamagePart {
                    id: "first".to_string(), // Swapped order
                    damage_type: DamageType::Fire,
                    base: DicePool {
                        terms: vec![DiceTerm {
                            count: 1,
                            sides: 6,
                            per_die_modifier: 0,
                        }],
                        flat_modifier: 0,
                    },
                    application: ApplicationSpec::default(),
                    save: DamageSaveSpec::default(),
                    ..Default::default()
                },
            ]),
            dm_guidance: None,
            notes: None,
        };

        spec1.normalize();
        spec2.normalize();

        let json1 = serde_json::to_string(&spec1).unwrap();
        let json2 = serde_json::to_string(&spec2).unwrap();

        // Different order should result in different serialization
        assert_ne!(
            json1, json2,
            "Sequence mode should preserve order differences"
        );
    }
}
