use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub struct MaterialComponentSpec {
    pub name: String,
    #[serde(default = "default_quantity")]
    pub quantity: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gp_value: Option<f64>,
    #[serde(default)]
    pub is_consumed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_quantity() -> f64 {
    1.0
}

impl MaterialComponentSpec {
    pub fn normalize(&mut self) {
        self.name = crate::models::canonical_spell::normalize_string(
            &self.name,
            crate::models::canonical_spell::NormalizationMode::Structured,
        );
        if let Some(u) = &mut self.unit {
            *u = crate::models::canonical_spell::normalize_string(
                u,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        if let Some(d) = &mut self.description {
            *d = crate::models::canonical_spell::normalize_string(
                d,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        if let Some(val) = &mut self.gp_value {
            *val = crate::models::canonical_spell::clamp_precision(*val);
        }
        self.quantity = crate::models::canonical_spell::clamp_precision(self.quantity);
    }
}
