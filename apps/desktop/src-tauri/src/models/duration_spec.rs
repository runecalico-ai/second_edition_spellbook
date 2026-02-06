use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DurationKind {
    Instant,
    Time,
    Concentration,
    Conditional,
    Permanent,
    UntilDispelled,
    UntilTriggered,
    UsageLimited,
    Planar,
    Special,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DurationUnit {
    Segment,
    Round,
    Turn,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DurationSpec {
    pub kind: DurationKind,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<DurationUnit>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<SpellScalar>, // "duration" in schema, but referencing "scalar" def

    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub uses: Option<SpellScalar>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl Default for DurationSpec {
    fn default() -> Self {
        Self {
            kind: DurationKind::Special,
            unit: None,
            duration: None,
            condition: None,
            uses: None,
            notes: None,
        }
    }
}

impl DurationSpec {
    pub fn normalize(&mut self) {
        if let Some(c) = &mut self.condition {
            *c = crate::models::canonical_spell::normalize_string(
                c,
                crate::models::canonical_spell::NormalizationMode::Structured,
            );
        }
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        crate::models::canonical_spell::normalize_scalar(&mut self.duration);
        crate::models::canonical_spell::normalize_scalar(&mut self.uses);
    }
}
