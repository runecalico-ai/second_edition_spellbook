use super::canonical_spell::CanonicalSpell;
use super::spell::{SpellDetail, SpellUpdate};

use serde_json::Value;
use std::collections::HashMap;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpell {
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
    pub magic_resistance: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    pub tags: Option<String>,
    pub source: Option<String>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    #[serde(rename = "_source_file")]
    pub source_file: Option<String>,
    #[serde(default, alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(default, alias = "is_cantrip")]
    pub is_cantrip: i64,
    #[serde(default, alias = "schema_version")]
    pub schema_version: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportArtifact {
    #[serde(rename = "type")]
    pub r#type: String,
    pub path: String,
    pub hash: String,
    #[serde(alias = "imported_at")]
    pub imported_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportConflictField {
    pub field: String,
    pub existing: Option<String>,
    pub incoming: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde", tag = "type", rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct ParseConflict {
    pub path: String,
    pub reason: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub name: String,
    pub content: Vec<u8>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub spells: Vec<SpellDetail>,
    pub artifacts: Vec<Value>,
    pub conflicts: Vec<ImportConflict>,
    pub warnings: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportConflictResolution {
    pub action: String,
    #[serde(alias = "existing_id")]
    pub existing_id: i64,
    pub spell: Option<SpellUpdate>,
    pub artifact: Option<ImportArtifact>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ResolveImportResult {
    pub resolved: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSpell {
    pub name: String,
    pub level: i64,
    pub school: Option<String>,
    pub sphere: Option<String>,
    #[serde(alias = "class_list")]
    pub class_list: Option<String>,
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
    pub magic_resistance: Option<String>,
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
    #[serde(default, alias = "is_quest_spell")]
    pub is_quest_spell: i64,
    #[serde(default, alias = "is_cantrip")]
    pub is_cantrip: i64,
    #[serde(default, alias = "schema_version")]
    pub schema_version: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub spells: Vec<PreviewSpell>,
    pub artifacts: Vec<ImportArtifact>,
    pub conflicts: Vec<ImportConflict>,
}

// --- JSON spell import (Task 2: hash-based import/export) ---

/// Bundle envelope for JSON import: top-level key `spells` (array) required; `bundle_format_version` required.
#[derive(serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpellBundle {
    pub bundle_format_version: i64,
    pub spells: Vec<CanonicalSpell>,
}

/// One spell result from preview_import_spell_json: normalized spell, recomputed hash, and per-spell warnings.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct PreviewSpellJsonItem {
    pub spell: CanonicalSpell,
    pub content_hash: String,
    pub warnings: Vec<String>,
}

/// Result of preview_import_spell_json: no DB write; parsed spells with hashes, warnings, and failures.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct PreviewImportSpellJsonResult {
    pub spells: Vec<PreviewSpellJsonItem>,
    pub warnings: Vec<String>,
    /// Spells that failed validation/hash during preview (name + reason).
    #[serde(default)]
    pub failures: Vec<ImportSpellJsonFailure>,
}

// --- Apply-phase result (Task 2.1.4 / 2.1.5) ---

/// Duplicate handling summary: total skipped, how many had metadata merged, how many unchanged.
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct DuplicatesSkipped {
    pub total: usize,
    pub merged_count: usize,
    pub no_change_count: usize,
}

/// Name collision: same spell name but different content_hash; user resolution required (name-only conflict identity).
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpellJsonConflict {
    pub existing_id: i64,
    pub existing_name: String,
    pub existing_content_hash: Option<String>,
    pub incoming_name: String,
    pub incoming_content_hash: String,
}

/// One resolution for a conflict: existing_id + incoming_content_hash identify the conflict; action says how to resolve.
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpellJsonConflictResolution {
    pub existing_id: i64,
    pub incoming_content_hash: String,
    /// "keep_existing" | "replace_with_new" | "keep_both"
    pub action: String,
}

/// Batch default for conflicts (e.g. when ≥10): apply this action to all conflicts when no per-conflict resolution is given.
/// "skip_all" | "replace_all" | "keep_all" | "review_each" (review_each = require explicit resolution per conflict).
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpellJsonResolveOptions {
    /// Per-conflict resolutions (order can match conflict list).
    #[serde(default)]
    pub resolutions: Vec<ImportSpellJsonConflictResolution>,
    /// Session-only default for remaining conflicts when resolutions don't cover all.
    pub default_action: Option<String>,
}

/// Counts per resolution action (Task 2.1.7).
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ConflictsResolved {
    pub keep_existing_count: usize,
    pub replace_count: usize,
    pub keep_both_count: usize,
}

/// One failure: spell name + reason (validation, schema, or replace error).
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpellJsonFailure {
    pub spell_name: String,
    pub reason: String,
}

/// Result of import_spell_json (apply phase): counts, conflict list or resolution counts, failures.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct ImportSpellJsonResult {
    pub imported_count: usize,
    pub imported_spells: Vec<SpellDetail>,
    pub duplicates_skipped: DuplicatesSkipped,
    pub conflicts: Vec<ImportSpellJsonConflict>,
    /// Counts per resolution action when conflicts were resolved in this run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicts_resolved: Option<ConflictsResolved>,
    /// Validation/schema/hash failures: spell name + reason.
    #[serde(default)]
    pub failures: Vec<ImportSpellJsonFailure>,
    pub warnings: Vec<String>,
}
