use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DurationKind {
    #[serde(alias = "INSTANT", alias = "Instant")]
    Instant,
    #[serde(alias = "TIME", alias = "Time")]
    Time,
    #[serde(alias = "CONCENTRATION", alias = "Concentration")]
    Concentration,
    #[serde(alias = "CONDITIONAL", alias = "Conditional")]
    Conditional,
    #[serde(alias = "PERMANENT", alias = "Permanent")]
    Permanent,
    #[serde(alias = "UNTIL_DISPELLED", alias = "UntilDispelled")]
    UntilDispelled,
    #[serde(alias = "UNTIL_TRIGGERED", alias = "UntilTriggered")]
    UntilTriggered,
    #[serde(alias = "USAGE_LIMITED", alias = "UsageLimited")]
    UsageLimited,
    #[serde(alias = "PLANAR", alias = "Planar")]
    Planar,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DurationUnit {
    #[serde(
        alias = "SEGMENT",
        alias = "segments",
        alias = "Segment",
        alias = "Segments"
    )]
    Segment,
    #[serde(alias = "ROUND", alias = "rounds", alias = "Round", alias = "Rounds")]
    Round,
    #[serde(alias = "TURN", alias = "turns", alias = "Turn", alias = "Turns")]
    Turn,
    #[serde(
        alias = "MINUTE",
        alias = "minutes",
        alias = "min",
        alias = "Minute",
        alias = "Minutes"
    )]
    Minute,
    #[serde(
        alias = "HOUR",
        alias = "hours",
        alias = "hr",
        alias = "Hour",
        alias = "Hours"
    )]
    Hour,
    #[serde(alias = "DAY", alias = "days", alias = "Day", alias = "Days")]
    Day,
    #[serde(alias = "WEEK", alias = "weeks", alias = "Week", alias = "Weeks")]
    Week,
    #[serde(alias = "MONTH", alias = "months", alias = "Month", alias = "Months")]
    Month,
    #[serde(alias = "YEAR", alias = "years", alias = "Year", alias = "Years")]
    Year,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
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

    /// When parsing fails or falls back to Special, the original legacy string is stored here.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_legacy_value: Option<String>,
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
            raw_legacy_value: None,
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
