use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageKind {
    #[default]
    None,
    Modeled,
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageCombineMode {
    #[default]
    Sum,
    Max,
    ChooseOne,
    Sequence,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DamageType {
    Acid,
    Cold,
    Electricity,
    Fire,
    Sonic,
    Force,
    Magic,
    NegativeEnergy,
    PositiveEnergy,
    Poison,
    Psychic,
    PhysicalBludgeoning,
    PhysicalPiercing,
    PhysicalSlashing,
    #[default]
    Untyped,
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
    AddDicePerStep,
    AddFlatPerStep,
    SetBaseByLevelBand,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScalingDriver {
    #[default]
    CasterLevel,
    SpellLevel,
    TargetHd,
    TargetLevel,
    Choice,
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
    PerTarget,
    PerAreaTarget,
    PerMissile,
    PerRay,
    PerRound,
    PerTurn,
    PerHit,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TickDriver {
    #[default]
    Fixed,
    CasterLevel,
    SpellLevel,
    Duration,
    Choice,
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
    None,
    Half,
    Negates,
    Partial,
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
    Normal,
    IgnoresMr,
    Special,
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
            // Sort parts by ID to ensure stable hash
            parts.sort_by(|a, b| a.id.cmp(&b.id));
        }
    }
}
