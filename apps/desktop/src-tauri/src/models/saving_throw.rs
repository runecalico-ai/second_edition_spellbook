use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SavingThrowKind {
    #[default]
    #[serde(alias = "NONE", alias = "None")]
    None,
    #[serde(alias = "SINGLE", alias = "Single")]
    Single,
    #[serde(alias = "MULTIPLE", alias = "Multiple")]
    Multiple,
    #[serde(alias = "DM_ADJUDICATED", alias = "DmAdjudicated")]
    DmAdjudicated,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveType {
    #[serde(alias = "PARALYZATION_POISON_DEATH", alias = "ParalyzationPoisonDeath")]
    ParalyzationPoisonDeath,
    #[serde(alias = "ROD_STAFF_WAND", alias = "RodStaffWand")]
    RodStaffWand,
    #[serde(alias = "PETRIFICATION_POLYMORPH", alias = "PetrificationPolymorph")]
    PetrificationPolymorph,
    #[serde(alias = "BREATH_WEAPON", alias = "BreathWeapon")]
    BreathWeapon,
    #[default]
    #[serde(alias = "SPELL", alias = "Spell")]
    Spell,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveVs {
    #[default]
    #[serde(alias = "SPELL", alias = "Spell")]
    Spell,
    #[serde(alias = "POISON", alias = "Poison")]
    Poison,
    #[serde(alias = "DEATH_MAGIC", alias = "DeathMagic")]
    DeathMagic,
    #[serde(alias = "POLYMORPH", alias = "Polymorph")]
    Polymorph,
    #[serde(alias = "PETRIFICATION", alias = "Petrification")]
    Petrification,
    #[serde(alias = "BREATH", alias = "Breath")]
    Breath,
    #[serde(alias = "WEAPON", alias = "Weapon")]
    Weapon,
    #[serde(alias = "OTHER", alias = "Other")]
    Other,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveAppliesTo {
    #[default]
    #[serde(alias = "EACH_TARGET", alias = "EachTarget")]
    EachTarget,
    #[serde(alias = "EACH_ROUND", alias = "EachRound")]
    EachRound,
    #[serde(alias = "EACH_APPLICATION", alias = "EachApplication")]
    EachApplication,
    #[serde(alias = "ONCE_PER_CAST", alias = "OncePerCast")]
    OncePerCast,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveTiming {
    #[serde(alias = "ON_HIT", alias = "OnHit")]
    OnHit,
    #[serde(alias = "ON_CONTACT", alias = "OnContact")]
    OnContact,
    #[serde(alias = "ON_ENTRY", alias = "OnEntry")]
    OnEntry,
    #[serde(alias = "END_OF_ROUND", alias = "EndOfRound")]
    EndOfRound,
    #[default]
    #[serde(alias = "ON_EFFECT", alias = "OnEffect")]
    OnEffect,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SaveResult {
    #[default]
    #[serde(alias = "NO_EFFECT", alias = "NoEffect")]
    NoEffect,
    #[serde(alias = "REDUCED_EFFECT", alias = "ReducedEffect")]
    ReducedEffect,
    #[serde(alias = "FULL_EFFECT", alias = "FullEffect")]
    FullEffect,
    #[serde(alias = "PARTIAL_DAMAGE_ONLY", alias = "PartialDamageOnly")]
    PartialDamageOnly,
    #[serde(alias = "PARTIAL_NON_DAMAGE_ONLY", alias = "PartialNonDamageOnly")]
    PartialNonDamageOnly,
    #[serde(alias = "SPECIAL", alias = "Special")]
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
    pub fn is_default(&self) -> bool {
        self.kind == SavingThrowKind::None
            && self.single.is_none()
            && self.multiple.is_none()
            && self.dm_guidance.is_none()
            && self.notes.is_none()
    }

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
