use super::spell::{SpellDetail, SpellUpdate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportSpell {
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
    #[serde(rename = "_source_file")]
    pub source_file: Option<String>,
    #[serde(default)]
    pub is_quest_spell: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportArtifact {
    #[serde(rename = "type")]
    pub r#type: String,
    pub path: String,
    pub hash: String,
    pub imported_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportConflictField {
    pub field: String,
    pub existing: Option<String>,
    pub incoming: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ImportConflict {
    Parse {
        path: String,
        reason: String,
    },
    Spell {
        existing: Box<SpellDetail>,
        incoming: Box<SpellDetail>,
        fields: Vec<ImportConflictField>,
        artifact: Option<ImportArtifact>,
    },
}

#[derive(Deserialize)]
pub struct ParseConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize)]
pub struct ImportFile {
    pub name: String,
    pub content: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
pub struct ImportResult {
    pub spells: Vec<SpellDetail>,
    pub artifacts: Vec<Value>,
    pub conflicts: Vec<ImportConflict>,
    pub warnings: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ImportConflictResolution {
    pub action: String,
    pub existing_id: i64,
    pub spell: Option<SpellUpdate>,
    pub artifact: Option<ImportArtifact>,
}

#[derive(Serialize, Deserialize)]
pub struct ResolveImportResult {
    pub resolved: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PreviewSpell {
    pub name: String,
    pub level: i64,
    pub school: Option<String>,
    pub sphere: Option<String>,
    pub class_list: Option<String>,
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
    #[serde(rename = "_confidence")]
    pub confidence: HashMap<String, f32>,
    #[serde(rename = "_raw_text")]
    pub raw_text: Option<String>,
    #[serde(rename = "_source_file")]
    pub source_file: String,
    #[serde(default)]
    pub is_quest_spell: i64,
}

#[derive(Serialize, Deserialize)]
pub struct PreviewResult {
    pub spells: Vec<PreviewSpell>,
    pub artifacts: Vec<ImportArtifact>,
    pub conflicts: Vec<ImportConflict>,
}
