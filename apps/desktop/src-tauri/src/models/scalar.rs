use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScalarMode {
    #[serde(alias = "FIXED", alias = "Fixed")]
    Fixed,
    #[serde(alias = "PER_LEVEL", alias = "PerLevel")]
    PerLevel,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScalarRounding {
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
pub struct SpellScalar {
    pub mode: ScalarMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub per_level: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_level: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_level: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap_level: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rounding: Option<ScalarRounding>,
}

impl Default for SpellScalar {
    fn default() -> Self {
        Self {
            mode: ScalarMode::Fixed,
            value: None,
            per_level: None,
            min_level: None,
            max_level: None,
            cap_value: None,
            cap_level: None,
            rounding: None,
        }
    }
}

impl SpellScalar {
    pub fn fixed(value: f64) -> Self {
        Self {
            mode: ScalarMode::Fixed,
            value: Some(value),
            ..Default::default()
        }
    }

    pub fn per_level(per_level: f64) -> Self {
        Self {
            mode: ScalarMode::PerLevel,
            per_level: Some(per_level),
            ..Default::default()
        }
    }
}

// SpellScalar represents a scalable numerical value (fixed or per-level).
