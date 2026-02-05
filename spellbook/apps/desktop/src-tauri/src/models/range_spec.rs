use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RangeKind {
    Personal,
    Touch,
    Distance,
    DistanceLos,
    DistanceLoe,
    Los,
    Loe,
    Sight,
    Hearing,
    Voice,
    Senses,
    SameRoom,
    SameStructure,
    SameDungeonLevel,
    Wilderness,
    SamePlane,
    Interplanar,
    AnywhereOnPlane,
    Domain,
    Unlimited,
    #[default]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeUnit {
    Ft,
    Yd,
    Mi,
    Inches,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeContext {
    Los,
    Loe,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RangeAnchor {
    Caster,
    Target,
    Object,
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
                crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
            );
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
