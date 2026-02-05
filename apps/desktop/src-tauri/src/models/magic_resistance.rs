use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MagicResistanceKind {
    #[default]
    Unknown,
    Normal,
    IgnoresMr,
    Partial,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MrAppliesTo {
    #[default]
    WholeSpell,
    HarmfulEffectsOnly,
    BeneficialEffectsOnly,
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MrPartialScope {
    DamageOnly,
    NonDamageOnly,
    PrimaryEffectOnly,
    SecondaryEffectsOnly,
    ByPartId,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct MrPartialSpec {
    pub scope: MrPartialScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub part_ids: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct MagicResistanceSpec {
    pub kind: MagicResistanceKind,
    #[serde(default)]
    pub applies_to: MrAppliesTo,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial: Option<MrPartialSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub special_rule: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl MagicResistanceSpec {
    pub fn normalize(&mut self) {
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        if let Some(s) = &mut self.special_rule {
            *s = crate::models::canonical_spell::normalize_string(
                s,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
    }
}
