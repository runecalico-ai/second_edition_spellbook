use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: i64,
    pub name: String,
    pub character_type: String,
    pub race: Option<String>,
    pub alignment: Option<String>,
    pub com_enabled: i32,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterAbilities {
    pub id: i64,
    pub character_id: i64,
    pub str: i32,
    pub dex: i32,
    pub con: i32,
    pub int: i32,
    pub wis: i32,
    pub cha: i32,
    pub com: i32,
}

#[derive(Deserialize)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct UpdateAbilitiesInput {
    pub character_id: i64,
    pub str: i32,
    pub dex: i32,
    pub con: i32,
    pub int: i32,
    pub wis: i32,
    pub cha: i32,
    pub com: i32,
}

#[derive(Deserialize)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct UpdateCharacterDetailsInput {
    pub id: i64,
    pub name: String,
    pub character_type: String,
    pub race: Option<String>,
    pub alignment: Option<String>,
    pub com_enabled: i32,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterClass {
    pub id: i64,
    pub character_id: i64,
    pub class_name: String,
    pub class_label: Option<String>,
    pub level: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterClassSpell {
    pub id: i64,
    pub character_class_id: i64,
    pub spell_id: i64,
    pub list_type: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterSpellbookEntry {
    pub character_id: i64,
    pub spell_id: i64,
    pub spell_name: String,
    pub spell_level: i64,
    pub spell_school: Option<String>,
    pub spell_sphere: Option<String>,
    pub is_quest_spell: i64,
    pub is_cantrip: i64,
    pub prepared: i64,
    pub known: i64,
    pub notes: Option<String>,
    pub tags: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintableCharacter {
    pub name: String,
    pub character_type: String,
    pub race: Option<String>,
    pub alignment: Option<String>,
    pub notes: Option<String>,
    pub character_spells: Vec<PrintableSpellbookEntry>,
    pub abilities: Option<CharacterAbilities>,
    pub classes: Vec<CharacterClass>,
    pub include_com: bool,
    pub include_notes: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintableSpell {
    pub name: String,
    pub level: i64,
    pub school: Option<String>,
    pub components: Option<String>,
    pub casting_time: Option<String>,
    pub range: Option<String>,
    pub duration: Option<String>,
    pub area: Option<String>,
    pub saving_throw: Option<String>,
    pub description: String,
    pub source: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintableSpellbookEntry {
    pub id: i64,
    pub name: String,
    pub level: i64,
    pub school: Option<String>,
    pub class_list: Option<String>,
    pub range: Option<String>,
    pub components: Option<String>,
    pub duration: Option<String>,
    pub saving_throw: Option<String>,
    pub description: String,
    pub prepared: i64,
    pub known: i64,
    pub notes: Option<String>,
    pub class_name: Option<String>, // Added to associate with specific class in character sheet
}
