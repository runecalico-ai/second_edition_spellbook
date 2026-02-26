use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MagicResistanceKind {
    #[default]
    #[serde(alias = "UNKNOWN", alias = "Unknown")]
    Unknown,
    #[serde(alias = "NORMAL", alias = "Normal")]
    Normal,
    #[serde(alias = "IGNORES_MR", alias = "IgnoresMr")]
    IgnoresMr,
    #[serde(alias = "PARTIAL", alias = "Partial")]
    Partial,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MrAppliesTo {
    #[default]
    #[serde(alias = "WHOLE_SPELL", alias = "WholeSpell")]
    WholeSpell,
    #[serde(alias = "HARMFUL_EFFECTS_ONLY", alias = "HarmfulEffectsOnly")]
    HarmfulEffectsOnly,
    #[serde(alias = "BENEFICIAL_EFFECTS_ONLY", alias = "BeneficialEffectsOnly")]
    BeneficialEffectsOnly,
    #[serde(alias = "DM", alias = "Dm")]
    Dm,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MrPartialScope {
    #[serde(alias = "DAMAGE_ONLY", alias = "DamageOnly")]
    DamageOnly,
    #[serde(alias = "NON_DAMAGE_ONLY", alias = "NonDamageOnly")]
    NonDamageOnly,
    #[serde(alias = "PRIMARY_EFFECT_ONLY", alias = "PrimaryEffectOnly")]
    PrimaryEffectOnly,
    #[serde(alias = "SECONDARY_EFFECTS_ONLY", alias = "SecondaryEffectsOnly")]
    SecondaryEffectsOnly,
    #[serde(alias = "BY_PART_ID", alias = "ByPartId")]
    ByPartId,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MrPartialSpec {
    pub scope: MrPartialScope,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "part_ids")]
    pub part_ids: Option<Vec<String>>,
}

impl MrPartialSpec {
    pub fn normalize(&mut self) {
        if let Some(ids) = &mut self.part_ids {
            for id in ids.iter_mut() {
                *id = crate::models::canonical_spell::normalize_string(
                    id,
                    crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
                );
            }
            ids.sort();
            ids.dedup();
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MagicResistanceSpec {
    pub kind: MagicResistanceKind,
    #[serde(default, alias = "applies_to")]
    pub applies_to: MrAppliesTo,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial: Option<MrPartialSpec>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "special_rule"
    )]
    pub special_rule: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "source_text")]
    pub source_text: Option<String>,
}

impl MagicResistanceSpec {
    pub fn is_default(&self) -> bool {
        self.kind == MagicResistanceKind::Unknown
            && self.applies_to == MrAppliesTo::WholeSpell
            && self.partial.is_none()
            && self.special_rule.is_none()
            && self.notes.is_none()
            && self.source_text.is_none()
    }

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
        if let Some(p) = &mut self.partial {
            p.normalize();
        }
        if let Some(s) = &mut self.source_text {
            *s = crate::models::canonical_spell::normalize_string(
                s,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Priority D (TG2): MagicResistanceSpec::normalize() applies Textual mode to source_text.
    #[test]
    fn test_magic_resistance_normalize_applies_textual_to_source_text() {
        let mut mr = MagicResistanceSpec {
            kind: MagicResistanceKind::Normal,
            source_text: Some("  Line one   \n\n   Line two   ".to_string()),
            ..Default::default()
        };
        mr.normalize();
        // Textual: trim, collapse internal whitespace per line, collapse blank lines to single \n
        assert_eq!(
            mr.source_text.as_deref(),
            Some("Line one\nLine two"),
            "source_text must be normalized with Textual mode"
        );
    }
}
