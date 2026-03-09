use serde::{Deserialize, Serialize};

use super::{CharacterAbilities, SpellDetail};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterBundle {
    pub format: String,
    pub format_version: String,
    pub name: String,
    pub character_type: String,
    pub race: Option<String>,
    pub alignment: Option<String>,
    pub com_enabled: i32,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub abilities: Option<CharacterAbilities>,
    pub classes: Vec<BundleClass>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct BundleClass {
    pub class_name: String,
    pub class_label: Option<String>,
    pub level: i32,
    pub spells: Vec<BundleClassSpell>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct BundleClassSpell {
    pub spell: SpellDetail,
    pub list_type: String, // "KNOWN", "PREPARED"
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct MarkdownBundle {
    pub character_yml: String, // Path or content? For commands we might handle file IO.
    // Actually, for markdown export we produce a folder.
    // This struct might not be needed if we just stream the files.
    // But for import we might need a structure to hold parsed content.
    pub name: String,
    // ... we'll see if we need this struct.
}
