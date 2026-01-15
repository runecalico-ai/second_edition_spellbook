use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct SpellSummary {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub level: i64,
    pub class_list: Option<String>,
    pub components: Option<String>,
    pub duration: Option<String>,
    pub source: Option<String>,
    pub is_quest_spell: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SpellCreate {
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    pub material_components: Option<String>,
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    pub saving_throw: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub is_quest_spell: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SpellUpdate {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    pub material_components: Option<String>,
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    pub saving_throw: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub is_quest_spell: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SpellArtifact {
    pub id: i64,
    pub spell_id: i64,
    pub r#type: String,
    pub path: String,
    pub hash: String,
    pub imported_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SpellDetail {
    pub id: Option<i64>,
    pub name: String,
    pub school: Option<String>,
    pub sphere: Option<String>,
    pub class_list: Option<String>,
    pub level: i64,
    pub range: Option<String>,
    pub components: Option<String>,
    pub material_components: Option<String>,
    pub casting_time: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    pub saving_throw: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub is_quest_spell: i64,
    pub artifacts: Option<Vec<SpellArtifact>>,
}
