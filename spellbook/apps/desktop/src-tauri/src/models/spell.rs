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
    pub artifacts: Option<Vec<SpellArtifact>>,
}
