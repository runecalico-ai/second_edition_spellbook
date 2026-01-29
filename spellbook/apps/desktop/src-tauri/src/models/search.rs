use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // Standardize frontend communication
pub struct SearchFilters {
    #[serde(rename = "schools")]
    pub schools: Option<Vec<String>>,
    #[serde(rename = "spheres")]
    pub spheres: Option<Vec<String>>,
    // Handled by rename_all="camelCase"
    pub level_min: Option<i64>,
    pub level_max: Option<i64>,
    pub class_list: Option<String>,
    pub source: Option<String>,
    pub components: Option<String>,
    pub tags: Option<String>,
    pub is_quest_spell: Option<bool>,
    pub is_cantrip: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SavedSearch {
    pub id: i64,
    pub name: String,
    pub filter_json: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Keyword,
    Semantic,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SavedSearchPayload {
    pub query: String,
    pub mode: SearchMode,
    pub filters: SearchFilters,
}

#[derive(Serialize, Deserialize)]
pub struct Facets {
    pub schools: Vec<String>,
    pub spheres: Vec<String>,
    pub sources: Vec<String>,
    pub levels: Vec<i64>,
    pub class_list: Vec<String>,
    pub components: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ChatResponse {
    pub answer: String,
    pub citations: Vec<String>,
    pub meta: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSearchFilters {
    pub race: Option<String>,
    pub character_type: Option<String>,
    pub min_level: Option<i32>,
    pub max_level: Option<i32>,
    pub class_name: Option<String>,
    pub query: Option<String>,
    // Ability Filters (min values)
    pub min_str: Option<i32>,
    pub min_dex: Option<i32>,
    pub min_con: Option<i32>,
    pub min_int: Option<i32>,
    pub min_wis: Option<i32>,
    pub min_cha: Option<i32>,
    pub min_com: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSearchResult {
    pub id: i64,
    pub name: String,
    pub character_type: String,
    pub race: Option<String>,
    pub alignment: Option<String>,
    pub level_summary: String,
    pub classes: Vec<String>,
}
