use crate::models::scalar::SpellScalar;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RangeKind {
    #[serde(alias = "PERSONAL", alias = "Personal")]
    Personal,
    #[serde(alias = "TOUCH", alias = "Touch")]
    Touch,
    #[serde(alias = "DISTANCE", alias = "Distance")]
    Distance,
    #[serde(alias = "DISTANCE_LOS", alias = "DistanceLos")]
    DistanceLos,
    #[serde(alias = "DISTANCE_LOE", alias = "DistanceLoe")]
    DistanceLoe,
    #[serde(alias = "LOS", alias = "Los")]
    Los,
    #[serde(alias = "LOE", alias = "Loe")]
    Loe,
    #[serde(alias = "SIGHT", alias = "Sight")]
    Sight,
    #[serde(alias = "HEARING", alias = "Hearing")]
    Hearing,
    #[serde(alias = "VOICE", alias = "Voice")]
    Voice,
    #[serde(alias = "SENSES", alias = "Senses")]
    Senses,
    #[serde(alias = "SAME_ROOM", alias = "SameRoom")]
    SameRoom,
    #[serde(alias = "SAME_STRUCTURE", alias = "SameStructure")]
    SameStructure,
    #[serde(alias = "SAME_DUNGEON_LEVEL", alias = "SameDungeonLevel")]
    SameDungeonLevel,
    #[serde(alias = "WILDERNESS", alias = "Wilderness")]
    Wilderness,
    #[serde(alias = "SAME_PLANE", alias = "SamePlane")]
    SamePlane,
    #[serde(alias = "INTERPLANAR", alias = "Interplanar")]
    Interplanar,
    #[serde(alias = "ANYWHERE_ON_PLANE", alias = "AnywhereOnPlane")]
    AnywhereOnPlane,
    #[serde(alias = "DOMAIN", alias = "Domain")]
    Domain,
    #[serde(alias = "UNLIMITED", alias = "Unlimited")]
    Unlimited,
    #[default]
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeUnit {
    #[serde(
        alias = "FT",
        alias = "foot",
        alias = "feet",
        alias = "Foot",
        alias = "Feet"
    )]
    Ft,
    #[serde(
        alias = "YD",
        alias = "yard",
        alias = "yards",
        alias = "Yard",
        alias = "Yards"
    )]
    Yd,
    #[serde(
        alias = "MI",
        alias = "mile",
        alias = "miles",
        alias = "Mile",
        alias = "Miles"
    )]
    Mi,
    #[serde(alias = "INCH", alias = "inches", alias = "Inch", alias = "Inches")]
    Inch,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeContext {
    #[serde(alias = "LOS", alias = "Los")]
    Los,
    #[serde(alias = "LOE", alias = "Loe")]
    Loe,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeAnchor {
    #[serde(alias = "CASTER", alias = "Caster")]
    Caster,
    #[serde(alias = "TARGET", alias = "Target")]
    Target,
    #[serde(alias = "OBJECT", alias = "Object")]
    Object,
    #[serde(alias = "FIXED", alias = "Fixed")]
    Fixed,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct RangeSpec {
    pub kind: RangeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<RangeUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires: Option<Vec<RangeContext>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<RangeAnchor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region_unit: Option<crate::models::area_spec::RegionUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// When parsing fails or falls back to Special, the original legacy string is stored here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_legacy_value: Option<String>,
}

// Word-boundary unit alias regexes (longer tokens first to avoid partial replacement)
fn re_yards() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\byards\b").unwrap())
}
fn re_yard() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\byard\b").unwrap())
}
fn re_yd_dot() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\byd\.").unwrap())
}
fn re_feet() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bfeet\b").unwrap())
}
fn re_foot() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bfoot\b").unwrap())
}
fn re_ft_dot() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bft\.").unwrap())
}
fn re_miles() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bmiles\b").unwrap())
}
fn re_mile() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bmile\b").unwrap())
}
fn re_mi_dot() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bmi\.").unwrap())
}
fn re_inches() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\binches\b").unwrap())
}
fn re_inch() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\binch\b").unwrap())
}
fn re_in_dot() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bin\.\b").unwrap())
}

impl RangeSpec {
    pub fn normalize(&mut self) {
        if let Some(reqs) = &mut self.requires {
            reqs.sort_by_key(|r| match r {
                RangeContext::Los => 0,
                RangeContext::Loe => 1,
            });
            reqs.dedup();
        }
        if let Some(t) = &mut self.text {
            *t = crate::models::canonical_spell::normalize_string(
                t,
                crate::models::canonical_spell::NormalizationMode::Structured,
            );
            // Unit alias normalization with word boundaries (e.g. "10 yards" -> "10 yd"; "backyard" unchanged)
            *t = re_yards().replace_all(t, "yd").to_string();
            *t = re_yard().replace_all(t, "yd").to_string();
            *t = re_yd_dot().replace_all(t, "yd").to_string();
            *t = re_feet().replace_all(t, "ft").to_string();
            *t = re_foot().replace_all(t, "ft").to_string();
            *t = re_ft_dot().replace_all(t, "ft").to_string();
            *t = re_miles().replace_all(t, "mi").to_string();
            *t = re_mile().replace_all(t, "mi").to_string();
            *t = re_mi_dot().replace_all(t, "mi").to_string();
            *t = re_inches().replace_all(t, "inch").to_string();
            *t = re_inch().replace_all(t, "inch").to_string();
            *t = re_in_dot().replace_all(t, "inch").to_string();
        }
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        crate::models::canonical_spell::normalize_scalar(&mut self.distance);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_text_unit_alias_word_boundaries() {
        // Word-boundary replacement: only whole words are normalized; substrings are preserved.
        let mut spec_yd = RangeSpec {
            kind: RangeKind::Distance,
            raw_legacy_value: None,
            text: Some("10 yards".to_string()),
            unit: Some(RangeUnit::Yd),
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
        };
        spec_yd.normalize();
        assert_eq!(spec_yd.text.as_deref(), Some("10 yd"), "yards -> yd");

        let mut spec_backyard = RangeSpec {
            kind: RangeKind::Special,
            raw_legacy_value: None,
            text: Some("backyard".to_string()),
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
        };
        spec_backyard.normalize();
        assert_eq!(
            spec_backyard.text.as_deref(),
            Some("backyard"),
            "backyard must be unchanged (no substring replacement)"
        );

        let mut spec_ft = RangeSpec {
            kind: RangeKind::Distance,
            raw_legacy_value: None,
            text: Some("1 foot".to_string()),
            unit: Some(RangeUnit::Ft),
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
        };
        spec_ft.normalize();
        assert_eq!(spec_ft.text.as_deref(), Some("1 ft"), "foot -> ft");

        let mut spec_footprint = RangeSpec {
            kind: RangeKind::Special,
            raw_legacy_value: None,
            text: Some("footprint".to_string()),
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
        };
        spec_footprint.normalize();
        assert_eq!(
            spec_footprint.text.as_deref(),
            Some("footprint"),
            "footprint must be unchanged"
        );
    }
}
