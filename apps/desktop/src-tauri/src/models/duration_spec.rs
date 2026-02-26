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

impl DurationUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            DurationUnit::Segment => "segment",
            DurationUnit::Round => "round",
            DurationUnit::Turn => "turn",
            DurationUnit::Minute => "minute",
            DurationUnit::Hour => "hour",
            DurationUnit::Day => "day",
            DurationUnit::Week => "week",
            DurationUnit::Month => "month",
            DurationUnit::Year => "year",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
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

    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,

    /// Original legacy source text preserved as-is for auditability.
    #[serde(skip_serializing_if = "Option::is_none", alias = "raw_legacy_value")]
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
            text: None,
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
        // Note: In the canonical pipeline, CanonicalSpell::normalize() calls
        // synthesize_duration_text() immediately after this method, which unconditionally
        // overwrites `text`. This branch is only effective when DurationSpec::normalize()
        // is called standalone (e.g. in unit tests).
        if let Some(t) = &mut self.text {
            *t = crate::models::canonical_spell::normalize_structured_text_with_unit_aliases(t);
        }
        crate::models::canonical_spell::normalize_scalar(&mut self.duration);
        crate::models::canonical_spell::normalize_scalar(&mut self.uses);
    }

    pub fn synthesize_text(&mut self) {
        use crate::models::duration_spec::DurationKind;

        let synthesized = match self.kind {
            DurationKind::Special => self.raw_legacy_value.clone(),
            DurationKind::Instant => Some("Instant".to_string()),
            DurationKind::Permanent => Some("Permanent".to_string()),
            DurationKind::Concentration => Some("Concentration".to_string()),
            DurationKind::UntilDispelled => Some("Until dispelled".to_string()),
            DurationKind::Conditional | DurationKind::UntilTriggered | DurationKind::Planar => {
                self.condition.as_ref().map(|c| c.to_string())
            }
            DurationKind::UsageLimited => self
                .uses
                .as_ref()
                .map(|uses| format!("{} uses", uses.to_text())),
            DurationKind::Time => match (&self.duration, self.unit.clone()) {
                (Some(value), Some(unit)) => {
                    Some(format!("{} {}", value.to_text(), unit.to_text()))
                }
                _ => None,
            },
        };

        if let Some(t) = synthesized {
            self.text = Some(
                crate::models::canonical_spell::normalize_structured_text_with_unit_aliases(&t),
            );
        }
    }
}
