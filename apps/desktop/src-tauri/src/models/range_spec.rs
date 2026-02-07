use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

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
            )
            .to_lowercase();
            // Unit alias normalization for hash stability (e.g., "10 yards" vs "10 yd")
            *t = t
                .replace("yards", "yd")
                .replace("yard", "yd")
                .replace("yd.", "yd")
                .replace("feet", "ft")
                .replace("foot", "ft")
                .replace("ft.", "ft")
                .replace("miles", "mi")
                .replace("mile", "mi")
                .replace("mi.", "mi")
                .replace("inches", "inch")
                .replace("in.", "inch");
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
