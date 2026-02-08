use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
#[serde(deny_unknown_fields)]
pub struct MaterialComponentSpec {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gp_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_consumed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
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
                crate::models::canonical_spell::NormalizationMode::Structured,
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

        // Rule 48/88: Materialization and Lean Hashing
        if let Some(q) = self.quantity {
            let clamped = crate::models::canonical_spell::clamp_precision(q);
            if clamped == 1.0 {
                self.quantity = None;
            } else {
                self.quantity = Some(clamped);
            }
        }

        if let Some(consumed) = self.is_consumed {
            if !consumed {
                self.is_consumed = None;
            }
        }
    }
}
