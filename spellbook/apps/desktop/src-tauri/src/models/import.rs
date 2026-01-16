use super::spell::{SpellDetail, SpellUpdate};
// No longer using direct imports here as they were unused or redundant with explicit paths in some places,
// though clippy specifically complained about these being unused.

use serde_json::Value;
use std::collections::HashMap;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
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

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ImportArtifact {
    #[serde(rename = "type")]
    pub r#type: String,
    pub path: String,
    pub hash: String,
    pub imported_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ImportConflictField {
    pub field: String,
    pub existing: Option<String>,
    pub incoming: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde", tag = "type", rename_all = "snake_case")]
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

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ParseConflict {
    pub path: String,
    pub reason: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ImportFile {
    pub name: String,
    pub content: Vec<u8>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ImportResult {
    pub spells: Vec<SpellDetail>,
    pub artifacts: Vec<Value>,
    pub conflicts: Vec<ImportConflict>,
    pub warnings: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ImportConflictResolution {
    pub action: String,
    pub existing_id: i64,
    pub spell: Option<SpellUpdate>,
    pub artifact: Option<ImportArtifact>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct ResolveImportResult {
    pub resolved: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
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

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct PreviewResult {
    pub spells: Vec<PreviewSpell>,
    pub artifacts: Vec<ImportArtifact>,
    pub conflicts: Vec<ImportConflict>,
}
