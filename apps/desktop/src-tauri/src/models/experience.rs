use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExperienceKind {
    #[default]
    #[serde(alias = "NONE", alias = "None")]
    None,
    #[serde(alias = "FIXED", alias = "Fixed")]
    Fixed,
    #[serde(alias = "PER_UNIT", alias = "PerUnit")]
    PerUnit,
    #[serde(alias = "FORMULA", alias = "Formula")]
    Formula,
    #[serde(alias = "TIERED", alias = "Tiered")]
    Tiered,
    #[serde(alias = "DM_ADJUDICATED", alias = "DmAdjudicated")]
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExperiencePayer {
    #[default]
    #[serde(alias = "CASTER", alias = "Caster")]
    Caster,
    #[serde(alias = "PRIMARY_CASTER", alias = "PrimaryCaster")]
    PrimaryCaster,
    #[serde(alias = "PARTICIPANT", alias = "Participant")]
    Participant,
    #[serde(alias = "RECIPIENT", alias = "Recipient")]
    Recipient,
    #[serde(alias = "ITEM", alias = "Item")]
    Item,
    #[serde(alias = "OTHER", alias = "Other")]
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PaymentTiming {
    #[serde(alias = "ON_START", alias = "OnStart")]
    OnStart,
    #[default]
    #[serde(alias = "ON_COMPLETION", alias = "OnCompletion")]
    OnCompletion,
    #[serde(alias = "ON_EFFECT", alias = "OnEffect")]
    OnEffect,
    #[serde(alias = "ON_SUCCESS", alias = "OnSuccess")]
    OnSuccess,
    #[serde(alias = "ON_FAILURE", alias = "OnFailure")]
    OnFailure,
    #[serde(alias = "ON_BOTH", alias = "OnBoth")]
    OnBoth,
    #[serde(alias = "DM", alias = "Dm")]
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PaymentSemantics {
    #[default]
    #[serde(alias = "SPEND", alias = "Spend")]
    Spend,
    #[serde(alias = "LOSS", alias = "Loss")]
    Loss,
    #[serde(alias = "DRAIN", alias = "Drain")]
    Drain,
    #[serde(alias = "SACRIFICE", alias = "Sacrifice")]
    Sacrifice,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Recoverability {
    #[default]
    #[serde(alias = "NORMAL_EARNING", alias = "NormalEarning")]
    NormalEarning,
    #[serde(alias = "NOT_RECOVERABLE", alias = "NotRecoverable")]
    NotRecoverable,
    #[serde(alias = "SPECIAL_ONLY", alias = "SpecialOnly")]
    SpecialOnly,
    #[serde(alias = "DM", alias = "Dm")]
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UnitKind {
    #[serde(alias = "GP_VALUE_1000", alias = "GpValue1000")]
    GpValue1000,
    #[serde(alias = "SPELL_LEVEL", alias = "SpellLevel")]
    SpellLevel,
    #[serde(alias = "RECIPIENT_LEVEL", alias = "RecipientLevel")]
    RecipientLevel,
    #[serde(alias = "HIT_DIE", alias = "HitDie")]
    HitDie,
    #[serde(alias = "CREATURE", alias = "Creature")]
    Creature,
    #[serde(alias = "DAY", alias = "Day")]
    Day,
    #[serde(alias = "CHARGE", alias = "Charge")]
    Charge,
    #[serde(alias = "OTHER", alias = "Other")]
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RoundingMode {
    #[serde(alias = "NONE", alias = "None")]
    None,
    #[serde(alias = "FLOOR", alias = "Floor")]
    Floor,
    #[serde(alias = "CEIL", alias = "Ceil")]
    Ceil,
    #[serde(alias = "NEAREST", alias = "Nearest")]
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
    #[serde(alias = "GP_VALUE", alias = "GpValue")]
    GpValue,
    #[serde(alias = "SPELL_LEVEL", alias = "SpellLevel")]
    SpellLevel,
    #[serde(alias = "CASTER_LEVEL", alias = "CasterLevel")]
    CasterLevel,
    #[serde(alias = "RECIPIENT_LEVEL", alias = "RecipientLevel")]
    RecipientLevel,
    #[serde(alias = "HIT_DICE", alias = "HitDice")]
    HitDice,
    #[serde(alias = "COUNT", alias = "Count")]
    Count,
    #[serde(alias = "OTHER", alias = "Other")]
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
    pub fn is_default(&self) -> bool {
        // source_text is metadata (excluded from hash); do not use for default detection.
        self.kind == ExperienceKind::None
            && self.payer == ExperiencePayer::Caster
            && self.payment_timing == PaymentTiming::OnCompletion
            && self.payment_semantics == PaymentSemantics::Spend
            && self.formula.is_none()
            && self.per_unit.is_none()
            && self.tiered.is_none()
            && self.can_reduce_level
            && self.recoverability == Recoverability::NormalEarning
            && self.notes.is_none()
            && self.amount_xp.is_none()
            && self.dm_guidance.is_none()
    }

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

        if let Some(per_unit) = &mut self.per_unit {
            if let Some(ul) = &mut per_unit.unit_label {
                *ul = crate::models::canonical_spell::normalize_string(
                    ul,
                    crate::models::canonical_spell::NormalizationMode::Textual,
                );
            }
        }

        if let Some(formula) = &mut self.formula {
            formula.expr = crate::models::canonical_spell::normalize_string(
                &formula.expr,
                crate::models::canonical_spell::NormalizationMode::Exact,
            );
            for var in &mut formula.vars {
                // Schema requires ^[a-z][a-z0-9_]{0,31}$; normalize to lowercase and underscores.
                var.name = crate::models::canonical_spell::normalize_string(
                    &var.name,
                    crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
                );
                var.name = var.name.replace(' ', "_");
                if var.name.len() > 32 {
                    var.name = var.name.chars().take(32).collect();
                }
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
