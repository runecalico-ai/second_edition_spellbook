use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Character {
    pub id: i64,
    pub name: String,
    pub character_type: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct CharacterSpellbookEntry {
    pub character_id: i64,
    pub spell_id: i64,
    pub spell_name: String,
    pub spell_level: i64,
    pub spell_school: Option<String>,
    pub prepared: i64,
    pub known: i64,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct PrintableCharacter {
    pub name: String,
    pub character_type: String,
    pub notes: Option<String>,
    pub spells: Vec<PrintableSpell>,
}

#[derive(Serialize)]
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
}
