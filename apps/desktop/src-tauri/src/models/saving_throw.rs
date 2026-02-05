use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SavingThrowKind {
    #[default]
    None,
    Single,
    Multiple,
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveType {
    ParalyzationPoisonDeath,
    RodStaffWand,
    PetrificationPolymorph,
    BreathWeapon,
    #[default]
    Spell,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveVs {
    #[default]
    Spell,
    Poison,
    DeathMagic,
    Polymorph,
    Petrification,
    Breath,
    Weapon,
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveAppliesTo {
    #[default]
    EachTarget,
    EachRound,
    EachApplication,
    OncePerCast,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveTiming {
    OnHit,
    OnContact,
    OnEntry,
    EndOfRound,
    #[default]
    OnEffect,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveResult {
    #[default]
    NoEffect,
    ReducedEffect,
    FullEffect,
    PartialDamageOnly,
    PartialNonDamageOnly,
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct SaveOutcomeEffect {
    pub result: SaveResult,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct SingleSave {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub save_type: SaveType,
    #[serde(default)]
    pub save_vs: SaveVs,
    #[serde(default)]
    pub modifier: i32,
    #[serde(default)]
    pub applies_to: SaveAppliesTo,
    #[serde(default)]
    pub timing: SaveTiming,
    pub on_success: SaveOutcomeEffect,
    pub on_failure: SaveOutcomeEffect,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct SavingThrowSpec {
    pub kind: SavingThrowKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub single: Option<SingleSave>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple: Option<Vec<SingleSave>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dm_guidance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl SavingThrowSpec {
    pub fn normalize(&mut self) {
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        if let Some(g) = &mut self.dm_guidance {
            *g = crate::models::canonical_spell::normalize_string(
                g,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }

        if let Some(s) = &mut self.single {
            normalize_single_save(s);
        }
        if let Some(m) = &mut self.multiple {
            for s in m.iter_mut() {
                normalize_single_save(s);
            }
            // Do NOT sort 'multiple'. The order is semantically significant (sequencing).
            // See Contract Rule 4 (it is not listed as an unordered set).
        }
    }
}

fn normalize_single_save(save: &mut SingleSave) {
    if let Some(id) = &mut save.id {
        *id = crate::models::canonical_spell::normalize_string(
            id,
            crate::models::canonical_spell::NormalizationMode::LowercaseStructured,
        );
    }
    if let Some(n) = &mut save.on_success.notes {
        *n = crate::models::canonical_spell::normalize_string(
            n,
            crate::models::canonical_spell::NormalizationMode::Textual,
        );
    }
    if let Some(n) = &mut save.on_failure.notes {
        *n = crate::models::canonical_spell::normalize_string(
            n,
            crate::models::canonical_spell::NormalizationMode::Textual,
        );
    }
}
