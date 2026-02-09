// Imports handled by explicit paths in derives

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellSummary {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    pub level: i64,
    #[serde(alias = "class_list")]
    pub class_list: Option<String>,
    pub components: Option<String>,
    pub duration: Option<String>,
    pub source: Option<String>,
    #[serde(alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(alias = "is_cantrip")]
    pub is_cantrip: i64,
    pub tags: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellCreate {
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    #[serde(alias = "class_list")]
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    #[serde(alias = "material_components")]
    pub material_components: Option<String>,
    #[serde(alias = "casting_time")]
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    #[serde(alias = "saving_throw")]
    pub saving_throw: Option<String>,
    pub damage: Option<String>,
    #[serde(alias = "magic_resistance")]
    pub magic_resistance: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    #[serde(alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(alias = "is_cantrip")]
    pub is_cantrip: i64,
    // Structured Data Spec Objects
    pub range_spec: Option<crate::models::RangeSpec>,
    pub components_spec: Option<crate::models::SpellComponents>,
    pub material_components_spec: Option<Vec<crate::models::MaterialComponentSpec>>,
    pub casting_time_spec: Option<crate::models::SpellCastingTime>,
    pub duration_spec: Option<crate::models::DurationSpec>,
    pub area_spec: Option<crate::models::AreaSpec>,
    pub saving_throw_spec: Option<crate::models::SavingThrowSpec>,
    pub damage_spec: Option<crate::models::SpellDamageSpec>,
    pub magic_resistance_spec: Option<crate::models::MagicResistanceSpec>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellUpdate {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    #[serde(alias = "class_list")]
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    #[serde(alias = "material_components")]
    pub material_components: Option<String>,
    #[serde(alias = "casting_time")]
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    #[serde(alias = "saving_throw")]
    pub saving_throw: Option<String>,
    pub damage: Option<String>,
    #[serde(alias = "magic_resistance")]
    pub magic_resistance: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    #[serde(alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(alias = "is_cantrip")]
    pub is_cantrip: i64,
    // Structured Data Spec Objects
    pub range_spec: Option<crate::models::RangeSpec>,
    pub components_spec: Option<crate::models::SpellComponents>,
    pub material_components_spec: Option<Vec<crate::models::MaterialComponentSpec>>,
    pub casting_time_spec: Option<crate::models::SpellCastingTime>,
    pub duration_spec: Option<crate::models::DurationSpec>,
    pub area_spec: Option<crate::models::AreaSpec>,
    pub saving_throw_spec: Option<crate::models::SavingThrowSpec>,
    pub damage_spec: Option<crate::models::SpellDamageSpec>,
    pub magic_resistance_spec: Option<crate::models::MagicResistanceSpec>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellArtifact {
    pub id: i64,
    pub spell_id: i64,
    pub r#type: String,
    pub path: String,
    pub hash: String,
    pub imported_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellDetail {
    pub id: Option<i64>,
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    #[serde(alias = "class_list")]
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    #[serde(alias = "material_components")]
    pub material_components: Option<String>,
    #[serde(alias = "casting_time")]
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    #[serde(alias = "saving_throw")]
    pub saving_throw: Option<String>,
    pub damage: Option<String>,
    #[serde(alias = "magic_resistance")]
    pub magic_resistance: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    #[serde(alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(alias = "is_cantrip")]
    pub is_cantrip: i64,
    #[serde(alias = "schema_version")]
    pub schema_version: Option<i64>,
    pub artifacts: Option<Vec<SpellArtifact>>,
    /// JSON blob of structured spell data (snake_case). Present when spell has been canonicalized.
    #[serde(alias = "canonical_data")]
    pub canonical_data: Option<String>,
    /// Content-addressed hash (SHA-256) of canonical_data.
    #[serde(alias = "content_hash")]
    pub content_hash: Option<String>,
    // Structured Data Spec Objects
    pub range_spec: Option<crate::models::RangeSpec>,
    pub components_spec: Option<crate::models::SpellComponents>,
    pub material_components_spec: Option<Vec<crate::models::MaterialComponentSpec>>,
    pub casting_time_spec: Option<crate::models::SpellCastingTime>,
    pub duration_spec: Option<crate::models::DurationSpec>,
    pub area_spec: Option<crate::models::AreaSpec>,
    pub saving_throw_spec: Option<crate::models::SavingThrowSpec>,
    pub damage_spec: Option<crate::models::SpellDamageSpec>,
    pub magic_resistance_spec: Option<crate::models::MagicResistanceSpec>,
}
