use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExperienceKind {
    #[default]
    None,
    Fixed,
    PerUnit,
    Formula,
    Tiered,
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExperiencePayer {
    #[default]
    Caster,
    PrimaryCaster,
    Participant,
    Recipient,
    Item,
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PaymentTiming {
    OnStart,
    #[default]
    OnCompletion,
    OnEffect,
    OnSuccess,
    OnFailure,
    OnBoth,
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PaymentSemantics {
    #[default]
    Spend,
    Loss,
    Drain,
    Sacrifice,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Recoverability {
    #[default]
    NormalEarning,
    NotRecoverable,
    SpecialOnly,
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UnitKind {
    GpValue1000,
    SpellLevel,
    RecipientLevel,
    HitDie,
    Creature,
    Day,
    Charge,
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RoundingMode {
    None,
    Floor,
    Ceil,
    Nearest,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PerUnitXp {
    pub xp_per_unit: i32,
    pub unit_kind: UnitKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit_label: Option<String>,
    #[serde(default = "default_rounding")]
    pub rounding: RoundingMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_xp: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_xp: Option<i32>,
}

fn default_rounding() -> RoundingMode {
    RoundingMode::None
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VarKind {
    GpValue,
    SpellLevel,
    CasterLevel,
    RecipientLevel,
    HitDice,
    Count,
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FormulaVar {
    pub name: String,
    pub var_kind: VarKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ExperienceFormula {
    pub expr: String,
    pub vars: Vec<FormulaVar>,
    #[serde(default = "default_rounding")]
    pub rounding: RoundingMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_xp: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_xp: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TieredXp {
    pub when: String,
    pub amount_xp: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct ExperienceComponentSpec {
    pub kind: ExperienceKind,
    #[serde(default = "default_payer")]
    pub payer: ExperiencePayer,
    #[serde(default = "default_timing")]
    pub payment_timing: PaymentTiming,
    #[serde(default = "default_semantics")]
    pub payment_semantics: PaymentSemantics,
    #[serde(default = "default_true")]
    pub can_reduce_level: bool,
    #[serde(default = "default_recoverability")]
    pub recoverability: Recoverability,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount_xp: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub per_unit: Option<PerUnitXp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formula: Option<ExperienceFormula>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tiered: Option<Vec<TieredXp>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dm_guidance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

fn default_payer() -> ExperiencePayer {
    ExperiencePayer::Caster
}
fn default_timing() -> PaymentTiming {
    PaymentTiming::OnCompletion
}
fn default_semantics() -> PaymentSemantics {
    PaymentSemantics::Spend
}
fn default_true() -> bool {
    true
}
fn default_recoverability() -> Recoverability {
    Recoverability::NormalEarning
}

impl ExperienceComponentSpec {
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
        if let Some(s) = &mut self.source_text {
            *s = crate::models::canonical_spell::normalize_string(
                s,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }

        if let Some(formula) = &mut self.formula {
            formula.expr = crate::models::canonical_spell::normalize_string(
                &formula.expr,
                crate::models::canonical_spell::NormalizationMode::Exact,
            );
            for var in &mut formula.vars {
                if let Some(l) = &mut var.label {
                    *l = crate::models::canonical_spell::normalize_string(
                        l,
                        crate::models::canonical_spell::NormalizationMode::Textual,
                    );
                }
            }
            // Sort variables by name for stable hash
            formula.vars.sort_by(|a, b| a.name.cmp(&b.name));
        }

        if let Some(tiers) = &mut self.tiered {
            for tier in tiers.iter_mut() {
                tier.when = crate::models::canonical_spell::normalize_string(
                    &tier.when,
                    crate::models::canonical_spell::NormalizationMode::Structured,
                );
                if let Some(tn) = &mut tier.notes {
                    *tn = crate::models::canonical_spell::normalize_string(
                        tn,
                        crate::models::canonical_spell::NormalizationMode::Textual,
                    );
                }
            }
            // Sort tiers by condition to ensure stable hash
            tiers.sort_by(|a, b| a.when.cmp(&b.when).then(a.amount_xp.cmp(&b.amount_xp)));
        }
    }
}
