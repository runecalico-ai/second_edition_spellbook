use serde::{Deserialize, Serialize};
use serde_json_canonicalizer::to_string as to_jcs_string;
use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

use crate::db::Pool;
use crate::error::AppError;
use crate::models::area_spec::*;
use crate::models::damage::SpellDamageSpec;
use crate::models::duration_spec::DurationSpec;
use crate::models::experience::ExperienceComponentSpec;
use crate::models::magic_resistance::MagicResistanceSpec;
use crate::models::material::MaterialComponentSpec;
use crate::models::range_spec::*;
use crate::models::saving_throw::SavingThrowSpec;
use crate::models::scalar::SpellScalar;
use crate::utils::spell_parser::SpellParser;
use chrono::Utc;
use rusqlite::params;
use std::fmt::Write as _;
use std::sync::Arc;
use tauri::{Emitter, State, Window};

pub const CURRENT_SCHEMA_VERSION: i64 = 2;

/// Format version for hash-based spell bundles (JSON import/export). Used by Task 2
/// import/export to identify bundle structure; increment when the bundle envelope changes.
pub const BUNDLE_FORMAT_VERSION: i64 = 1;

/// Keep at 1 for v1→v2 migration compatibility: v1 spells are accepted and migrated,
/// while version 0 records are expected to be materialized/migrated before validation.
pub const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 1;
pub const SPELL_NAME_MAX_CHARS: usize = 256;
pub const SPELL_DESCRIPTION_MAX_CHARS: usize = 16_384;
pub const SPELL_AUTHOR_MAX_CHARS: usize = 256;
pub const SOURCE_REF_SYSTEM_MAX_CHARS: usize = 128;
pub const SOURCE_REF_BOOK_MAX_CHARS: usize = 512;
pub const SOURCE_REF_NOTE_MAX_CHARS: usize = 2_048;
pub const SOURCE_REF_URL_MAX_CHARS: usize = 2_048;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SpellComponents {
    pub verbal: bool,
    pub somatic: bool,
    pub material: bool,
    pub focus: bool,
    #[serde(alias = "divine_focus")]
    pub divine_focus: bool,
    pub experience: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CastingTimeUnit {
    #[default]
    #[serde(alias = "SEGMENT", alias = "Segment")]
    Segment,
    #[serde(alias = "ROUND", alias = "Round")]
    Round,
    #[serde(alias = "TURN", alias = "Turn")]
    Turn,
    #[serde(alias = "HOUR", alias = "Hour")]
    Hour,
    #[serde(alias = "MINUTE", alias = "Minute")]
    Minute,
    /// Deserialization-only: 5e unit removed from schema in v2. Task 0.1 (v1→v2 migration):
    /// `migrate_to_v2()` remaps this to `Special` and preserves the original text in `raw_legacy_value`.
    #[serde(alias = "ACTION", alias = "Action")]
    Action,
    /// Deserialization-only: 5e unit removed from schema in v2. Task 0.1 (v1→v2 migration):
    /// `migrate_to_v2()` remaps this to `Special` and preserves the original text in `raw_legacy_value`.
    #[serde(alias = "BONUS_ACTION", alias = "BonusAction")]
    BonusAction,
    /// Deserialization-only: 5e unit removed from schema in v2. Task 0.1 (v1→v2 migration):
    /// `migrate_to_v2()` remaps this to `Special` and preserves the original text in `raw_legacy_value`.
    #[serde(alias = "REACTION", alias = "Reaction")]
    Reaction,
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
    #[serde(alias = "INSTANTANEOUS", alias = "Instantaneous")]
    Instantaneous,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SpellCastingTime {
    pub text: String,
    pub unit: CastingTimeUnit,
    #[serde(skip_serializing_if = "Option::is_none", alias = "base_value")]
    pub base_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "per_level")]
    pub per_level: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "level_divisor")]
    pub level_divisor: Option<f64>,
    /// Original legacy source text preserved as-is for auditability.
    #[serde(skip_serializing_if = "Option::is_none", alias = "raw_legacy_value")]
    pub raw_legacy_value: Option<String>,
}

impl SpellCastingTime {
    pub fn normalize(&mut self) {
        self.text = normalize_string(&self.text, NormalizationMode::Structured);

        // Rule 48/88: Materialize defaults then prune if equal to default
        if let Some(v) = self.base_value {
            let clamped = clamp_precision(v);
            if clamped == 1.0 {
                self.base_value = None;
            } else {
                self.base_value = Some(clamped);
            }
        }
        if let Some(v) = self.per_level {
            let clamped = clamp_precision(v);
            if clamped == 0.0 {
                self.per_level = None;
            } else {
                self.per_level = Some(clamped);
            }
        }
        if let Some(v) = self.level_divisor {
            let clamped = clamp_precision(v);
            if clamped == 1.0 {
                self.level_divisor = None;
            } else {
                self.level_divisor = Some(clamped);
            }
        }

        // Task 0.1 (v1→v2 migration): migrate_to_v2() now handles remapping Action/BonusAction/Reaction
        // to Special before this normalize() call, so we no longer need the shim here.
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SpellDamage {
    pub text: String,
    #[serde(default = "default_zero_string", alias = "base_dice")]
    pub base_dice: String,
    #[serde(default = "default_zero_string", alias = "per_level_dice")]
    pub per_level_dice: String,
    #[serde(default = "default_one", alias = "level_divisor")]
    pub level_divisor: f64,
    #[serde(skip_serializing_if = "Option::is_none", alias = "cap_level")]
    pub cap_level: Option<f64>,
}

impl SpellDamage {
    pub fn normalize(&mut self) {
        self.text = normalize_string(&self.text, NormalizationMode::Structured);
        self.base_dice = normalize_string(&self.base_dice, NormalizationMode::Structured);
        self.per_level_dice = normalize_string(&self.per_level_dice, NormalizationMode::Structured);
        self.level_divisor = clamp_precision(self.level_divisor);
        self.cap_level = self.cap_level.map(clamp_precision);
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct SourceRef {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub book: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<serde_json::Value>, // Can be string or int
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Optional URL for source; used as dedup key when both refs have non-empty url (e.g. import/export).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

fn default_one() -> f64 {
    1.0
}

/// Root spell type. Serializes as snake_case for canonical hashing (§2.6). Deserializes from
/// both snake_case and camelCase (aliases below) for JSON import/export and frontend IPC.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct CanonicalSpell {
    #[serde(
        skip_serializing_if = "Option::is_none",
        alias = "content_hash",
        alias = "contentHash"
    )]
    pub id: Option<String>,
    pub name: String,
    pub tradition: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub school: Option<String>,
    #[serde(default)]
    pub subschools: Vec<String>,
    #[serde(default)]
    pub descriptors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sphere: Option<String>,
    #[serde(default, alias = "classList")]
    pub class_list: Vec<String>,
    pub level: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<RangeSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub components: Option<SpellComponents>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "materialComponents")]
    pub material_components: Option<Vec<MaterialComponentSpec>>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "castingTime")]
    pub casting_time: Option<SpellCastingTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<DurationSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub area: Option<AreaSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<SpellDamageSpec>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "magicResistance")]
    pub magic_resistance: Option<MagicResistanceSpec>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "savingThrow")]
    pub saving_throw: Option<SavingThrowSpec>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "experienceCost")]
    pub experience_cost: Option<ExperienceComponentSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reversible: Option<i64>, // 0 or 1
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,

    // Metadata - Skipped when hashing to canonical JSON, but kept for database/export
    #[serde(default, alias = "sourceRefs")]
    pub source_refs: Vec<SourceRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "isQuestSpell"
    )]
    pub is_quest_spell: Option<i64>, // 0 or 1
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "isCantrip")]
    pub is_cantrip: Option<i64>, // 0 or 1

    #[serde(default = "default_schema_version", alias = "schemaVersion")]
    pub schema_version: i64,

    // Temporal Metadata
    #[serde(skip_serializing_if = "Option::is_none", alias = "createdAt")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "updatedAt")]
    pub updated_at: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<serde_json::Value>, // Simplified for now as it's skipped in hash
}

fn default_version() -> String {
    "1.0.0".into()
}
fn default_zero_string() -> String {
    "0".into()
}
/// Returns [`MIN_SUPPORTED_SCHEMA_VERSION`] as the serde default for `schema_version`.
///
/// When a `canonical_data` JSON blob lacks a `schema_version` key, serde
/// deserializes the field to this value. This assumes all serialization paths
/// always include `schema_version` in the output, so the default only applies
/// to manually-crafted or externally-imported JSON.
///
/// **Consequence:** a blob missing the key is treated as an oldest-supported
/// payload and will still flow through normalization-time migration.
///
/// **Important:** Any externally crafted or manually edited JSON that omits
/// `schema_version` will be treated as schema v1. The DB write path and all
/// export functions always include `schema_version`, so this only affects
/// hand-crafted JSON or imports from non-compliant sources.
fn default_schema_version() -> i64 {
    MIN_SUPPORTED_SCHEMA_VERSION
}

impl CanonicalSpell {
    pub fn new(name: String, level: i64, tradition: String, description: String) -> Self {
        Self {
            id: None,
            name,
            level,
            tradition,
            description,
            school: None,
            subschools: vec![],
            descriptors: vec![],
            sphere: None,
            class_list: vec![],
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            damage: None,
            magic_resistance: None,
            saving_throw: None,
            experience_cost: None,
            reversible: Some(0),
            tags: vec![],
            source_refs: vec![],
            edition: None,
            author: None,
            version: default_version(),
            license: None,
            is_quest_spell: Some(0),
            is_cantrip: Some((level == 0) as i64),
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: None,
            updated_at: None,
            artifacts: None,
        }
    }

    pub fn to_canonical_json(&self) -> Result<String, String> {
        let mut clone = self.clone();
        // Heavy Normalization (includes sorting/deduplication of arrays and materialization of defaults)
        let res = clone.normalize(None);
        if res.notes_truncated {
            return Err(format!(
                "Saving throw notes truncated during migration (exceeded {} characters)",
                SAVING_THROW_NOTES_MAX_CHARS
            ));
        }
        clone.to_canonical_json_pre_normalized()
    }

    /// Produces canonical JSON assuming `self` is already normalized. Used by `compute_hash()` to
    /// avoid double normalization and an extra clone. Callers must have called `normalize()` first.
    fn to_canonical_json_pre_normalized(&self) -> Result<String, String> {
        let mut value = serde_json::to_value(self).map_err(|err| err.to_string())?;
        prune_metadata_recursive(&mut value, true);
        to_jcs_string(&value).map_err(|err| err.to_string())
    }
}

/// Root-level array keys that are optional per schema; empty arrays at these paths may be pruned.
/// Required arrays (e.g. damage.parts when kind=modeled) must not be pruned when empty.
const OPTIONAL_ROOT_ARRAY_KEYS: &[&str] = &["class_list", "tags", "subschools", "descriptors"];

fn is_optional_root_array_key(key: &str) -> bool {
    OPTIONAL_ROOT_ARRAY_KEYS.contains(&key)
}

/// Recursively removes metadata fields from a JSON value.
///
/// There is no recursion-depth limit. This is safe because the function is only
/// used on the output of `to_value(CanonicalSpell)`, so depth is bounded by the
/// spell structure. If ever used on untrusted or arbitrary JSON, a max-depth
/// parameter or an iterative implementation should be considered.
///
/// `is_root` specifies if we are at the top-level of the spell object.
fn prune_metadata_recursive(value: &mut serde_json::Value, is_root: bool) {
    match value {
        serde_json::Value::Object(obj) => {
            // 1. Fields to prune ONLY at root
            if is_root {
                let root_meta = [
                    "id",
                    "source_refs",
                    "version",
                    "edition",
                    "author",
                    "license",
                    "schema_version",
                    "created_at",
                    "updated_at",
                    "artifacts",
                ];
                for k in root_meta {
                    obj.remove(k);
                }
            }

            // 2. Fields that should never be in the hash regardless of depth
            obj.remove("artifacts");
            obj.remove("source_refs");
            obj.remove("source_text");
            obj.remove("sourceText");

            // 3. Recurse into children first (so nested objects can become empty)
            for val in obj.values_mut() {
                prune_metadata_recursive(val, false);
            }

            // 4. Lean Hashing: Remove nulls, empty strings, empty objects. Only prune empty
            // arrays at root for optional array keys (class_list, tags, etc.); required arrays
            // like damage.parts when kind=modeled must be retained when empty.
            obj.retain(|k, v| {
                if v.is_null() {
                    return false;
                }
                if let Some(arr) = v.as_array() {
                    if arr.is_empty() && is_root && is_optional_root_array_key(k) {
                        return false;
                    }
                }
                if let Some(s) = v.as_str() {
                    if s.is_empty() {
                        return false;
                    }
                }
                if let Some(o) = v.as_object() {
                    if o.is_empty() {
                        return false;
                    }
                }
                true
            });
        }
        serde_json::Value::Array(arr) => {
            for val in arr.iter_mut() {
                prune_metadata_recursive(val, false);
            }
        }
        _ => {}
    }
}

/// Convert camelCase keys to snake_case recursively. Schema validation expects snake_case;
/// model structs serialize camelCase for IPC, so we convert before validating.
fn json_keys_to_snake_case(val: serde_json::Value) -> serde_json::Value {
    match val {
        serde_json::Value::Object(map) => {
            let converted: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .map(|(k, v)| (camel_to_snake(&k), json_keys_to_snake_case(v)))
                .collect();
            serde_json::Value::Object(converted)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(json_keys_to_snake_case).collect())
        }
        other => other,
    }
}

/// Converts camelCase to snake_case. Consecutive capitals are split per character
/// (e.g. "XMLParser" → "x_m_l_parser"). Safe for current schema keys.
fn camel_to_snake(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 && !result.ends_with('_') {
            result.push('_');
        }
        for c in c.to_lowercase() {
            result.push(c);
        }
    }
    result
}

pub(crate) fn normalize_structured_text_with_unit_aliases(s: &str) -> String {
    let mut normalized = normalize_string(s, NormalizationMode::Structured);

    for (from, to) in [
        ("yards", "yd"),
        ("yard", "yd"),
        ("yd.", "yd"),
        ("feet", "ft"),
        ("foot", "ft"),
        ("ft.", "ft"),
        ("miles", "mi"),
        ("mile", "mi"),
        ("mi.", "mi"),
        ("inches", "inch"),
        ("inch", "inch"),
        ("in.", "inch"),
    ] {
        normalized = replace_word_boundary_alias(&normalized, from, to);
    }

    normalized
}

fn replace_word_boundary_alias(input: &str, from: &str, to: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut index = 0usize;

    while let Some((start, end)) = find_case_insensitive_alias_match(input, from, index) {
        let prev_char = if start == 0 {
            None
        } else {
            input[..start].chars().next_back()
        };
        let next_char = if end >= input.len() {
            None
        } else {
            input[end..].chars().next()
        };

        let left_ok = prev_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');
        let right_ok = next_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');

        if left_ok && right_ok {
            out.push_str(&input[index..start]);
            out.push_str(to);
            index = end;
        } else {
            out.push_str(&input[index..end]);
            index = end;
        }
    }

    out.push_str(&input[index..]);
    out
}

fn find_case_insensitive_alias_match(
    input: &str,
    from: &str,
    start_index: usize,
) -> Option<(usize, usize)> {
    for (offset, _) in input[start_index..].char_indices() {
        let start = start_index + offset;
        let end = start + from.len();

        let Some(candidate) = input.get(start..end) else {
            continue;
        };

        if !candidate.eq_ignore_ascii_case(from) {
            continue;
        }

        let prev_char = if start == 0 {
            None
        } else {
            input[..start].chars().next_back()
        };
        let next_char = if end >= input.len() {
            None
        } else {
            input[end..].chars().next()
        };

        let left_ok = prev_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');
        let right_ok = next_char.is_none_or(|c| !c.is_alphanumeric() && c != '_');

        if left_ok && right_ok {
            return Some((start, end));
        }
    }

    None
}

impl CanonicalSpell {
    /// See docs/architecture/canonical-serialization.md §4.1: validation runs on full JSON (including metadata).
    pub fn compute_hash(&self) -> Result<String, String> {
        let mut normalized_clone = self.clone();
        let res = normalized_clone.normalize(None);
        if res.notes_truncated {
            return Err(format!(
                "Saving throw notes truncated during migration (exceeded {} characters)",
                SAVING_THROW_NOTES_MAX_CHARS
            ));
        }
        normalized_clone.validate()?;

        let canonical_json = normalized_clone.to_canonical_json_pre_normalized()?;
        let mut hasher = Sha256::new();
        hasher.update(canonical_json.as_bytes());
        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    pub fn validate(&self) -> Result<(), String> {
        use std::sync::OnceLock;
        static COMPILED_SCHEMA: OnceLock<jsonschema::JSONSchema> = OnceLock::new();

        let compiled = COMPILED_SCHEMA.get_or_init(|| {
            const SCHEMA_STR: &str = include_str!("../../schemas/spell.schema.json");
            let mut schema = serde_json::from_str::<serde_json::Value>(SCHEMA_STR)
                .expect("Invalid embedded schema definition");
            apply_text_field_limits(&mut schema);
            jsonschema::JSONSchema::compile(&schema).expect("Schema compilation error")
        });

        let instance =
            serde_json::to_value(self).map_err(|e| format!("Serialization error: {}", e))?;
        // Schema expects snake_case; models serialize camelCase for IPC. Convert keys before validation.
        let instance = json_keys_to_snake_case(instance);

        // Version Validation: Reject incompatible (invalid) versions.
        if self.schema_version < MIN_SUPPORTED_SCHEMA_VERSION {
            return Err(format!(
                "Incompatible schema version {} for spell '{}'. Minimum supported version is {}.",
                self.schema_version, self.name, MIN_SUPPORTED_SCHEMA_VERSION
            ));
        }

        // Versions > CURRENT are logged as warnings for forward compatibility.
        if self.schema_version > CURRENT_SCHEMA_VERSION {
            eprintln!("WARNING: Spell '{}' uses a newer schema version ({}). This application supports up to version {}. Forward compatibility is not guaranteed.",
                 self.name, self.schema_version, CURRENT_SCHEMA_VERSION);
        }

        let result = compiled.validate(&instance);
        if let Err(errors) = result {
            let mut msg = String::new();
            for error in errors {
                let _ = writeln!(
                    msg,
                    "Validation error: {} at {}",
                    error, error.instance_path
                );
            }
            return Err(msg);
        }

        Ok(())
    }
}

fn apply_text_field_limits(schema: &mut serde_json::Value) {
    set_schema_max_length(schema, "/properties/name", SPELL_NAME_MAX_CHARS);
    set_schema_max_length(
        schema,
        "/properties/description",
        SPELL_DESCRIPTION_MAX_CHARS,
    );
    set_schema_max_length(schema, "/properties/author", SPELL_AUTHOR_MAX_CHARS);
    set_schema_max_length(
        schema,
        "/properties/source_refs/items/properties/system",
        SOURCE_REF_SYSTEM_MAX_CHARS,
    );
    set_schema_max_length(
        schema,
        "/properties/source_refs/items/properties/book",
        SOURCE_REF_BOOK_MAX_CHARS,
    );
    set_schema_max_length(
        schema,
        "/properties/source_refs/items/properties/note",
        SOURCE_REF_NOTE_MAX_CHARS,
    );
    set_schema_max_length(
        schema,
        "/properties/source_refs/items/properties/url",
        SOURCE_REF_URL_MAX_CHARS,
    );
}

fn set_schema_max_length(schema: &mut serde_json::Value, pointer: &str, max_length: usize) {
    let property = schema
        .pointer_mut(pointer)
        .unwrap_or_else(|| panic!("missing schema pointer for text limit: {pointer}"));
    let object = property
        .as_object_mut()
        .unwrap_or_else(|| panic!("schema pointer is not an object: {pointer}"));
    object.insert(
        "maxLength".to_string(),
        serde_json::Value::from(max_length as u64),
    );
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFailure {
    /// Database row id of the spell (always set in bulk migration).
    pub spell_id: i64,
    pub spell_name: Option<String>,
    pub error: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub total: u32,
    pub migrated: u32,
    pub skipped: u32,
    pub failed: Vec<MigrationFailure>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrateV2Result {
    pub notes_truncated: bool,
    pub truncated_spell_id: Option<i64>,
}

impl CanonicalSpell {
    /// Migrates a spell from schema version 1 to 2 (Task 0.1 — v1→v2 migration):
    /// (1) moves `legacy_dm_guidance` into `saving_throw.notes`, truncating at
    /// `SAVING_THROW_NOTES_MAX_CHARS` and setting `MigrateV2Result::notes_truncated` if needed;
    /// (2) remaps 5e casting-time units (Action/BonusAction/Reaction) to `Special` and preserves
    /// the original text in `raw_legacy_value`.
    ///
    /// Stamps `schema_version = CURRENT_SCHEMA_VERSION` on success.
    /// `db_id` is optional; when provided (e.g. bulk migration), truncation sets `truncated_spell_id`.
    /// See "Migration Plan / Schema version compatibility" in design.md.
    fn migrate_to_v2(&mut self, db_id: Option<i64>) -> MigrateV2Result {
        let mut result = MigrateV2Result::default();
        if self.schema_version >= CURRENT_SCHEMA_VERSION {
            return result;
        }

        // 1. Saving Throw: legacy_dm_guidance -> notes
        if let Some(st) = &mut self.saving_throw {
            if let Some(guidance) = st.legacy_dm_guidance.take() {
                let current_notes = st.notes.clone().unwrap_or_default();
                let next_notes = if current_notes.is_empty() {
                    guidance
                } else {
                    format!("{}\n{}", current_notes, guidance)
                };

                if next_notes.chars().count() > SAVING_THROW_NOTES_MAX_CHARS {
                    result.notes_truncated = true;
                    result.truncated_spell_id = db_id;
                    // Truncate to safety limit
                    st.notes = Some(
                        next_notes
                            .chars()
                            .take(SAVING_THROW_NOTES_MAX_CHARS)
                            .collect(),
                    );
                } else {
                    st.notes = Some(next_notes);
                }
            }
        }

        // 2. Casting Time: Remap 5e units to Special and preserve text in raw_legacy_value
        if let Some(ct) = &mut self.casting_time {
            if matches!(
                ct.unit,
                CastingTimeUnit::Action | CastingTimeUnit::BonusAction | CastingTimeUnit::Reaction
            ) {
                if ct.raw_legacy_value.is_none() {
                    // v2 migration: if text is empty, synthesize from base_value + unit name
                    if ct.text.trim().is_empty() {
                        let unit_str = match ct.unit {
                            CastingTimeUnit::Action => "action",
                            CastingTimeUnit::BonusAction => "bonus action",
                            CastingTimeUnit::Reaction => "reaction",
                            _ => "special",
                        };
                        ct.raw_legacy_value =
                            Some(format!("{} {}", ct.base_value.unwrap_or(0.0), unit_str));
                    } else {
                        ct.raw_legacy_value = Some(ct.text.clone());
                    }
                }
                ct.unit = CastingTimeUnit::Special;
            }
        }

        // 3. Damage Spec: `raw_legacy_value` -> `source_text`.
        // This move is performed at deserialization time via
        // `SpellDamageSpec.source_text` alias = "raw_legacy_value" in models/damage.rs.
        // By migration time, legacy values are already materialized in `source_text`.

        self.schema_version = 2;
        result
    }

    /// Recursively normalizes all string and number fields for deterministic hashing.
    /// Also sorts and deduplicates unordered arrays.
    ///
    /// Order of operations (matches canonical-serialization contract: Materialize → Sanitize → … → Prune):
    /// schema version migration (migrate_to_v2 if needed); string sanitization and sub-spec normalization;
    /// tradition-consistent clearing; default materialization and pruning; component materialization and
    /// pruning; array sort/dedup (subschools/descriptors with casing normalization).
    ///
    /// Pass `db_id` in bulk migration so truncation can set `truncated_spell_id`.
    pub fn normalize(&mut self, db_id: Option<i64>) -> MigrateV2Result {
        let mut migrate_result = MigrateV2Result::default();
        // Schema Migration: Run before heavy normalization so v1 fields can be preserved/moved.
        if self.schema_version < CURRENT_SCHEMA_VERSION {
            migrate_result = self.migrate_to_v2(db_id);
        }

        self.name = normalize_string(&self.name, NormalizationMode::Structured);
        self.tradition =
            normalize_string(&self.tradition, NormalizationMode::Structured).to_uppercase();
        self.school = self.school.as_ref().map(|s| match_schema_case(s));
        self.description = normalize_string(&self.description, NormalizationMode::Textual);

        if let Some(materials) = &mut self.material_components {
            for m in materials.iter_mut() {
                m.normalize();
            }
        }

        if let Some(range) = &mut self.range {
            range.normalize();
        }

        if let Some(ct) = &mut self.casting_time {
            ct.normalize();
        }

        if let Some(dur) = &mut self.duration {
            dur.normalize();
            dur.synthesize_text();
        }

        if let Some(area) = &mut self.area {
            area.normalize();
            area.synthesize_text();
        }

        if let Some(damage) = &mut self.damage {
            damage.normalize();
        }

        if let Some(mr) = &mut self.magic_resistance {
            mr.normalize();
        }

        if let Some(st) = &mut self.saving_throw {
            st.normalize();
        }

        if let Some(xp) = &mut self.experience_cost {
            xp.normalize();
        }
        self.sphere = self.sphere.as_ref().map(|s| match_schema_case(s));

        // Prohibited fields for hashing: tradition-inconsistent fields are cleared so they never
        // appear in canonical JSON. Ensures hash is identical whether or not source had the other
        // tradition's field set (verification: prohibited field omission).
        if self.tradition == "ARCANE" {
            self.sphere = None;
        }
        if self.tradition == "DIVINE" {
            self.school = None;
        }

        // Rule 88: Prune optional fields if they equal their materialized defaults (Lean Hashing)
        // This ensures hash stability as the schema adds new optional properties.
        if self.reversible == Some(0) {
            self.reversible = None;
        }

        if self.is_quest_spell == Some(0) {
            self.is_quest_spell = None;
        }

        if self.is_cantrip == Some(0) {
            self.is_cantrip = None;
        }

        if let Some(materials) = &self.material_components {
            if materials.is_empty() {
                self.material_components = None;
            }
        }

        if let Some(st) = &self.saving_throw {
            if st.is_default() {
                self.saving_throw = None;
            }
        }

        if let Some(mr) = &self.magic_resistance {
            if mr.is_default() {
                self.magic_resistance = None;
            }
        }

        // Prune default experience_cost before syncing components so metadata-only (e.g. source_text) doesn't affect hash.
        if let Some(xp) = &self.experience_cost {
            if xp.is_default() {
                self.experience_cost = None;
            }
        }

        if self.components.is_none() {
            self.components = Some(SpellComponents {
                verbal: false,
                somatic: false,
                material: false,
                focus: false,
                divine_focus: false,
                experience: false,
            });
        }

        // If experience_cost is still present after pruning, force experience component to true.
        if self.experience_cost.is_some() {
            if let Some(comp) = &mut self.components {
                comp.experience = true;
            }
        }

        // Rule 88: Prune components if all are false (default state)
        if let Some(comp) = &self.components {
            if !comp.verbal
                && !comp.somatic
                && !comp.material
                && !comp.focus
                && !comp.divine_focus
                && !comp.experience
            {
                self.components = None;
            }
        }

        // migrate_to_v2() (called above) is the sole migration path and stamps schema_version
        // = CURRENT_SCHEMA_VERSION on every spell that needed upgrading. Spells that arrived at
        // >= CURRENT are left unchanged. Either way, the version must be >= CURRENT here.
        debug_assert!(
            self.schema_version >= CURRENT_SCHEMA_VERSION,
            "schema_version should be current or newer after migrate_to_v2() (got {})",
            self.schema_version
        );

        self.class_list = self
            .class_list
            .iter()
            .map(|s| normalize_string(s, NormalizationMode::Structured))
            .collect();
        self.tags = self
            .tags
            .iter()
            .map(|s| normalize_string(s, NormalizationMode::Structured))
            .collect();
        // Subschools and descriptors: normalize casing (match_schema_case) for hash stability.
        self.subschools = self
            .subschools
            .iter()
            .map(|s| match_schema_case(s))
            .collect();
        self.descriptors = self
            .descriptors
            .iter()
            .map(|s| match_schema_case(s))
            .collect();

        // Sort and deduplicate after normalization to catch duplicates created by normalization (e.g. whitespace collapse)
        self.class_list.sort();
        self.class_list.dedup();
        self.tags.sort();
        self.tags.dedup();
        self.subschools.sort();
        self.subschools.dedup();
        self.descriptors.sort();
        self.descriptors.dedup();

        migrate_result
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum NormalizationMode {
    Structured,          // Collapses all internal whitespace AND newlines
    LowercaseStructured, // Structured + lowercase
    Textual,             // Collapses horizontal whitespace, preserves newlines
    Exact,               // NFC and trim, but NO internal whitespace collapsing
}

/// Normalizes a string: NFC, trim, and applies the specified normalization mode.
pub(crate) fn normalize_string(s: &str, mode: NormalizationMode) -> String {
    let nfc: String = s.nfc().collect();
    let normalized = nfc.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();

    match mode {
        NormalizationMode::Structured => {
            // Collapse ALL whitespace (including newlines) into single spaces
            trimmed.split_whitespace().collect::<Vec<_>>().join(" ")
        }
        NormalizationMode::LowercaseStructured => {
            // Collapse ALL whitespace (including newlines) into single spaces AND lowercase
            trimmed
                .to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        }
        NormalizationMode::Textual => {
            // Collapse internal horizontal whitespace but preserve all distinct lines.
            // Rule 48 requires multiple empty lines to be collapsed into a single \n separator.
            trimmed
                .split('\n')
                .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        }
        NormalizationMode::Exact => trimmed.to_string(),
    }
}

/// Matches a string against schema-defined enums case-insensitively, or falls back to Title Case.
fn match_schema_case(s: &str) -> String {
    let normalized = normalize_string(s, NormalizationMode::Structured);
    let lower = normalized.to_lowercase();

    // Common complex enums from schema (Lowercase singular per Rule 48/54)
    match lower.as_str() {
        "segment" | "segments" => "segment".to_string(),
        "round" | "rounds" => "round".to_string(),
        "turn" | "turns" => "turn".to_string(),
        "hour" | "hours" => "hour".to_string(),
        "minute" | "minutes" => "minute".to_string(),
        "action" | "actions" => "action".to_string(),
        "bonus action" | "bonus actions" => "bonus_action".to_string(),
        "reaction" | "reactions" => "reaction".to_string(),
        "instant" | "instantaneous" => "instantaneous".to_string(),
        "special" => "special".to_string(),
        "ft" | "foot" | "feet" => "ft".to_string(),
        "yd" | "yard" | "yards" => "yd".to_string(),
        "mi" | "mile" | "miles" => "mi".to_string(),
        "inch" | "inches" => "inch".to_string(),
        "ft2" | "sq ft" | "square feet" => "ft2".to_string(),
        "yd2" | "sq yd" | "square yards" => "yd2".to_string(),
        "ft3" | "cu ft" | "cubic feet" => "ft3".to_string(),
        "yd3" | "cu yd" | "cubic yards" => "yd3".to_string(),
        "conjuration/summoning" => "Conjuration/Summoning".to_string(),
        "enchantment/charm" => "Enchantment/Charm".to_string(),
        "illusion/phantasm" => "Illusion/Phantasm".to_string(),
        "invocation/evocation" => "Invocation/Evocation".to_string(),
        "mind-affecting" => "Mind-Affecting".to_string(),
        "elemental air" => "Elemental Air".to_string(),
        "elemental earth" => "Elemental Earth".to_string(),
        "elemental fire" => "Elemental Fire".to_string(),
        "elemental water" => "Elemental Water".to_string(),
        "elemental rain" => "Elemental Rain".to_string(),
        "elemental sun" => "Elemental Sun".to_string(),
        _ => {
            // Intentionally simple fallback: first character only. For single-word or unknown enum
            // values. Multi-word unrecognized values may not be fully title-cased and could still
            // fail schema validation.
            let mut c = lower.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }
    }
}

pub(crate) fn normalize_scalar(s_opt: &mut Option<SpellScalar>) {
    if let Some(s) = s_opt {
        // Value Handling: Dependent on Mode
        if let Some(v) = s.value {
            let clamped = clamp_precision(v);
            // If Fixed, value is required, so valid 0.0 must be preserved.
            // If PerLevel, value is optional (base), so 0.0 implies explicit base 0.
            // We clamp it, and then explicitly preserve it.
            s.value = Some(clamped);
        }

        // PerLevel Handling
        // Rule 66: Materialize value = 0 when mode="per_level" and omitted
        if s.mode == crate::models::scalar::ScalarMode::PerLevel && s.value.is_none() {
            s.value = Some(0.0);
        }

        if let Some(v) = s.per_level {
            let clamped = clamp_precision(v);
            // If PerLevel, per_level is required.
            if s.mode == crate::models::scalar::ScalarMode::PerLevel {
                s.per_level = Some(clamped);
            } else {
                // In Fixed mode, per_level should be 0 or None. If 0.0, strip it.
                if clamped == 0.0 {
                    s.per_level = None;
                } else {
                    s.per_level = Some(clamped);
                }
            }
        }

        if let Some(v) = s.cap_value {
            let clamped = clamp_precision(v);
            if clamped == 0.0 {
                s.cap_value = None;
            } else {
                s.cap_value = Some(clamped);
            }
        }
    }
}

/// Clamps floating point precision to 6 decimal places.
pub(crate) fn clamp_precision(val: f64) -> f64 {
    (val * 1_000_000.0).round() / 1_000_000.0
}

/// Helper to parse comma-separated strings into sorted Vecs
fn parse_comma_list(input: &Option<String>) -> Vec<String> {
    input
        .as_ref()
        .map(|s| {
            let mut vec: Vec<String> = s
                .split(',')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect();
            vec.sort();
            vec.dedup();
            vec
        })
        .unwrap_or_default()
}

fn normalized_optional_structured_field(value: Option<&str>) -> Option<String> {
    value.and_then(|raw| {
        let normalized = normalize_string(raw, NormalizationMode::Structured);
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

pub(crate) fn validate_tradition_school_sphere_consistency(
    spell_name: &str,
    tradition: &str,
    school: Option<&str>,
    sphere: Option<&str>,
) -> Result<(), String> {
    let normalized_tradition =
        normalize_string(tradition, NormalizationMode::Structured).to_uppercase();
    let normalized_school = normalized_optional_structured_field(school);
    let normalized_sphere = normalized_optional_structured_field(sphere);

    if normalized_school.is_some() && normalized_sphere.is_some() {
        return Err(format!(
            "Spell '{}' is invalid: School and sphere are mutually exclusive.",
            spell_name
        ));
    }

    if normalized_school.is_none() && normalized_sphere.is_none() {
        return Err(format!(
            "Spell '{}' is invalid: Must have a School (Arcane) or Sphere (Divine) defined.",
            spell_name
        ));
    }

    match normalized_tradition.as_str() {
        "ARCANE" => {
            if normalized_school.is_none() {
                return Err(format!(
                    "Spell '{}' is invalid: ARCANE tradition requires a School and forbids Sphere.",
                    spell_name
                ));
            }
        }
        "DIVINE" => {
            if normalized_sphere.is_none() {
                return Err(format!(
                    "Spell '{}' is invalid: DIVINE tradition requires a Sphere and forbids School.",
                    spell_name
                ));
            }
        }
        _ => {}
    }

    Ok(())
}

impl TryFrom<crate::models::spell::SpellDetail> for CanonicalSpell {
    type Error = String;

    fn try_from(detail: crate::models::spell::SpellDetail) -> Result<Self, Self::Error> {
        // Tradition Inference
        let tradition = match (&detail.school, &detail.sphere) {
            (Some(_), Some(_)) => return Err(format!("Spell '{}' (ID {:?}) is invalid: School and sphere are mutually exclusive.", detail.name, detail.id)),
            (Some(_), None) => "ARCANE".to_string(),
            (None, Some(_)) => "DIVINE".to_string(),
            (None, None) => return Err(format!("Spell '{}' (ID {:?}) is invalid: Must have a School (Arcane) or Sphere (Divine) defined.", detail.name, detail.id)),
        };

        let mut spell = Self::new(detail.name, detail.level, tradition, detail.description);

        spell.school = detail.school.filter(|s| !s.is_empty());
        spell.sphere = detail.sphere.filter(|s| !s.is_empty());
        validate_tradition_school_sphere_consistency(
            &spell.name,
            &spell.tradition,
            spell.school.as_deref(),
            spell.sphere.as_deref(),
        )?;
        spell.class_list = parse_comma_list(&detail.class_list);
        spell.tags = parse_comma_list(&detail.tags);

        // Carry over schema version if present
        if let Some(version) = detail.schema_version {
            spell.schema_version = version;
        }

        let parser = SpellParser::new();

        // Prioritize structured spec objects if provided by frontend
        spell.range = detail.range_spec.or_else(|| {
            detail
                .range
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|s| parser.parse_range(s))
        });

        spell.casting_time = detail.casting_time_spec.or_else(|| {
            detail
                .casting_time
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|s| parser.parse_casting_time(s))
        });

        spell.duration = detail.duration_spec.or_else(|| {
            detail
                .duration
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|s| parser.parse_duration(s))
        });

        spell.area = detail.area_spec.or_else(|| {
            detail
                .area
                .as_ref()
                .filter(|s| !s.is_empty())
                .and_then(|s| parser.parse_area(s))
        });

        // Damage parsing
        spell.damage = detail.damage_spec.or_else(|| {
            detail
                .damage
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|dmg_str| parser.parse_damage(dmg_str))
        });

        // Components parsing
        if let Some(spec) = detail.components_spec {
            spell.components = Some(spec);
            // If we have a components string, still check for experience cost
            if let Some(comp_str) = detail.components.as_ref().filter(|s| !s.is_empty()) {
                let xp_spec = parser.parse_experience_cost(comp_str);
                if xp_spec.kind != crate::models::experience::ExperienceKind::None {
                    spell.experience_cost = Some(xp_spec);
                }
            }
        } else if let Some(comp_str) = detail.components.as_ref().filter(|s| !s.is_empty()) {
            spell.components = Some(parser.parse_components(comp_str));
            let xp_spec = parser.parse_experience_cost(comp_str);
            if xp_spec.kind != crate::models::experience::ExperienceKind::None {
                spell.experience_cost = Some(xp_spec);
            }
        }

        spell.material_components = detail.material_components_spec.or_else(|| {
            detail
                .material_components
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|s| parser.parse_material_components(s))
        });

        // Fallback: If still no materials, try extracting from the components line
        if spell.material_components.is_none() {
            if let Some(comp_str) = detail.components.as_ref().filter(|s| !s.is_empty()) {
                let extracted = parser.extract_materials_from_components_line(comp_str);
                if !extracted.is_empty() {
                    spell.material_components = Some(extracted);
                }
            }
        }

        // Saving Throw and Magic Resistance
        spell.saving_throw = detail.saving_throw_spec.or_else(|| {
            detail
                .saving_throw
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|st_str| parser.parse_saving_throw(st_str))
        });

        spell.magic_resistance = detail.magic_resistance_spec.or_else(|| {
            detail
                .magic_resistance
                .as_ref()
                .filter(|s| !s.is_empty())
                .map(|mr_str| parser.parse_magic_resistance(mr_str))
        });

        spell.reversible = Some(detail.reversible.unwrap_or(0));

        // Metadata
        if let Some(book) = detail.source {
            spell.source_refs = vec![SourceRef {
                system: detail.edition.clone(),
                book,
                page: None,
                note: None,
                url: None,
            }];
        }

        spell.edition = detail.edition;
        spell.author = detail.author;
        spell.license = detail.license;
        spell.is_quest_spell = Some(detail.is_quest_spell);
        spell.is_cantrip = Some(detail.is_cantrip);

        Ok(spell)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
    use crate::models::scalar::ScalarMode;

    // ── Shared test helpers ──────────────────────────────────────────────────

    /// Creates an in-memory SQLite connection with the minimal `spell` table
    /// schema used by `run_migration_batch_impl`.
    fn setup_migration_db() -> Result<rusqlite::Connection, rusqlite::Error> {
        let conn = rusqlite::Connection::open_in_memory()?;
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                canonical_data TEXT NOT NULL,
                content_hash TEXT,
                schema_version INTEGER,
                updated_at TEXT
            );
            "#,
        )?;
        Ok(conn)
    }

    /// Like `setup_migration_db` but also adds the unique index on `content_hash`
    /// that mirrors the production schema (Migration 0011).
    fn setup_migration_db_with_unique_hash() -> Result<rusqlite::Connection, rusqlite::Error> {
        let conn = setup_migration_db()?;
        conn.execute_batch(
            "CREATE UNIQUE INDEX idx_spell_content_hash ON spell(content_hash) WHERE content_hash IS NOT NULL;",
        )?;
        Ok(conn)
    }

    // ────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_regression_deserialization_defaults() {
        // Fix: Missing tags/class_list should default to empty, not error
        let json = r#"{
            "name": "Test",
            "level": 1,
            "tradition": "ARCANE",
            "description": "Desc",
            "schema_version": 1,
            "is_quest_spell": 0,
            "is_cantrip": 0
        }"#;

        let spell: CanonicalSpell =
            serde_json::from_str(json).expect("Should deserialize with defaults");
        assert!(
            spell.class_list.is_empty(),
            "class_list should default to empty"
        );
        assert!(spell.tags.is_empty(), "tags should default to empty");
    }

    #[test]
    fn test_camel_to_snake() {
        // Consecutive capitals split per character (XMLParser → x_m_l_parser)
        assert_eq!(camel_to_snake("XMLParser"), "x_m_l_parser");
        assert_eq!(camel_to_snake("someKey"), "some_key");
        assert_eq!(camel_to_snake("id"), "id");
    }

    #[test]
    fn test_regression_material_component_order() {
        // Fix: Material components must NOT be sorted
        let mut spell = CanonicalSpell::new("Order Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.material_components = Some(vec![
            MaterialComponentSpec {
                name: "Zebra".into(),
                ..Default::default()
            },
            MaterialComponentSpec {
                name: "Apple".into(),
                ..Default::default()
            },
        ]);
        spell.school = Some("Abjuration".into()); // Required for validation

        // Normalize
        spell.normalize(None);

        // Assert order preserved
        let mats = spell.material_components.as_ref().unwrap();
        assert_eq!(mats[0].name, "Zebra");
        assert_eq!(mats[1].name, "Apple");
    }

    #[test]
    fn test_regression_casting_time_units() {
        // Fix: Bonus Action and Reaction must be accepted andNormalized
        let units = vec!["bonus action", "reaction", "Bonus Actions"];
        let expected = vec!["bonus_action", "reaction", "bonus_action"];

        for (u, exp) in units.iter().zip(expected.iter()) {
            let normalized = match_schema_case(u);
            assert_eq!(&normalized, exp, "Failed to normalize {}", u);
        }
    }

    #[test]
    fn test_regression_mechanical_fields_in_hash() {
        // Fix: magic_resistance and experience_cost must be included in hash
        let mut s1 = CanonicalSpell::new("Mech Test".into(), 1, "ARCANE".into(), "Desc".into());
        s1.school = Some("Abjuration".into());

        let mut s2 = s1.clone();
        s2.magic_resistance = Some(crate::models::MagicResistanceSpec {
            kind: crate::models::magic_resistance::MagicResistanceKind::Normal,
            ..Default::default()
        });

        assert_ne!(
            s1.compute_hash().unwrap(),
            s2.compute_hash().unwrap(),
            "Magic Resistance should affect hash"
        );

        let mut s3 = s1.clone();
        s3.experience_cost = Some(crate::models::ExperienceComponentSpec {
            kind: crate::models::experience::ExperienceKind::Fixed,
            amount_xp: Some(100),
            ..Default::default()
        });

        assert_ne!(
            s1.compute_hash().unwrap(),
            s3.compute_hash().unwrap(),
            "Experience Cost should affect hash"
        );
    }

    #[test]
    fn test_regression_optional_field_omission() {
        // Fix: Optional fields set to None must be OMITTED from JSON, not null
        let spell = CanonicalSpell::new("Omit Test".into(), 1, "ARCANE".into(), "Desc".into());
        let json = spell.to_canonical_json().unwrap();

        // Check for absence of keys
        assert!(!json.contains("\"school\":"), "school should be omitted");
        assert!(!json.contains("\"sphere\":"), "sphere should be omitted");
        assert!(!json.contains("\"range\":"), "range should be omitted");
        assert!(
            !json.contains("\"material_components\":"),
            "material_components should be omitted"
        );

        // Check presence of required keys
        assert!(json.contains("\"name\":\"Omit Test\""));
        assert!(json.contains("\"level\":1"));
    }

    #[test]
    fn test_prohibited_field_omission_arcane_sphere() {
        // Verification: Arcane spell with sphere set must omit sphere from canonical output
        // and produce the same hash as the same spell with sphere never present.
        let mut with_sphere = CanonicalSpell::new(
            "Prohibited Test".into(),
            1,
            "ARCANE".into(),
            "Description".into(),
        );
        with_sphere.school = Some("Evocation".into());
        with_sphere.sphere = Some("All".into()); // Tradition-inconsistent; must be cleared

        let mut without_sphere = CanonicalSpell::new(
            "Prohibited Test".into(),
            1,
            "ARCANE".into(),
            "Description".into(),
        );
        without_sphere.school = Some("Evocation".into());
        // sphere left None

        let json_with = with_sphere.to_canonical_json().unwrap();
        let json_without = without_sphere.to_canonical_json().unwrap();

        assert!(
            !json_with.contains("\"sphere\":"),
            "canonical JSON for Arcane spell must OMIT sphere key even when source had sphere set"
        );
        assert_eq!(
            json_with, json_without,
            "canonical JSON must be identical for Arcane spell with or without sphere in source"
        );
        assert_eq!(
            with_sphere.compute_hash().unwrap(),
            without_sphere.compute_hash().unwrap(),
            "hash must be identical for Arcane spell with or without sphere in source"
        );
    }

    #[test]
    fn test_identical_content_produces_identical_hash() {
        let mut s1 = CanonicalSpell::new("Test Spell".into(), 1, "ARCANE".into(), "Desc".into());
        s1.class_list = vec!["A".into(), "B".into()];
        s1.school = Some("Necromancy".into());

        let mut s2 = CanonicalSpell::new("Test Spell".into(), 1, "ARCANE".into(), "Desc".into());
        s2.class_list = vec!["B".into(), "A".into()];
        s2.school = Some("Necromancy".into());
        // Arrays are sorted in new() or to_canonical_json

        assert_eq!(
            s1.to_canonical_json().unwrap(),
            s2.to_canonical_json().unwrap()
        );
        assert_eq!(s1.compute_hash().unwrap(), s2.compute_hash().unwrap());
    }

    #[test]
    fn test_content_change_produces_different_hash() {
        let mut s1 = CanonicalSpell::new("Test Spell".into(), 1, "ARCANE".into(), "Desc".into());
        s1.school = Some("Evocation".into());

        let mut s2 = s1.clone();
        s2.description = "New Desc".into();

        assert_ne!(s1.compute_hash().unwrap(), s2.compute_hash().unwrap());
    }

    #[test]
    fn test_compute_hash_stable() {
        let mut spell1 = CanonicalSpell::new(
            "Magic Missile".to_string(),
            1,
            "ARCANE".to_string(),
            "Deals damage".to_string(),
        );
        spell1.school = Some("Evocation".into());

        let mut spell2 = CanonicalSpell::new(
            "Magic Missile".to_string(),
            1,
            "ARCANE".to_string(),
            "Deals damage".to_string(),
        );
        spell2.school = Some("Evocation".into());

        let hash1 = spell1.compute_hash().unwrap();
        let hash2 = spell2.compute_hash().unwrap();

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_compute_hash_diff_content() {
        let mut spell1 = CanonicalSpell::new(
            "Magic Missile".to_string(),
            1,
            "ARCANE".to_string(),
            "Deals damage".to_string(),
        );
        spell1.school = Some("Evocation".into());

        let mut spell2 = CanonicalSpell::new(
            "Fireball".to_string(),
            3,
            "ARCANE".to_string(),
            "Explosion".to_string(),
        );
        spell2.school = Some("Evocation".into());

        let hash1 = spell1.compute_hash().unwrap();
        let hash2 = spell2.compute_hash().unwrap();

        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_array_normalization_sorting() {
        let mut spell1 = CanonicalSpell::new(
            "Sort Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".to_string(), "Bard".to_string()];
        spell1.tags = vec!["Offensive".to_string(), "Evocation".to_string()];

        let mut spell2 = CanonicalSpell::new(
            "Sort Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell2.school = Some("Abjuration".into());
        spell2.class_list = vec!["Bard".to_string(), "Wizard".to_string()];
        spell2.tags = vec!["Evocation".to_string(), "Offensive".to_string()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap()
        );
    }

    #[test]
    fn test_validate_valid_arcane_spell() {
        let mut spell = CanonicalSpell::new(
            "Magic Missile".to_string(),
            1,
            "ARCANE".to_string(),
            "Deals damage".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];

        let result = spell.validate();
        assert!(result.is_ok(), "Validation failed: {:?}", result.err());
    }

    #[test]
    fn test_validate_valid_divine_spell() {
        let mut spell = CanonicalSpell::new(
            "Cure Light Wounds".to_string(),
            1,
            "DIVINE".to_string(),
            "Heals targets".to_string(),
        );
        spell.sphere = Some("Healing".to_string());
        spell.class_list = vec!["Priest".to_string()];

        let result = spell.validate();
        assert!(result.is_ok(), "Validation failed: {:?}", result.err());
    }

    #[test]
    fn test_validate_missing_school_arcane() {
        let mut spell = CanonicalSpell::new(
            "Magic Missile".to_string(),
            1,
            "ARCANE".to_string(),
            "Deals damage".to_string(),
        );
        // Missing school
        spell.class_list = vec!["Wizard".to_string()]; // Add a class list to satisfy other requirements

        let result = spell.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("school"));
    }

    #[test]
    fn test_validate_missing_sphere_divine() {
        let mut spell = CanonicalSpell::new(
            "Cure Light Wounds".to_string(),
            1,
            "DIVINE".to_string(),
            "Heals targets".to_string(),
        );
        // Missing sphere
        spell.class_list = vec!["Cleric".to_string()]; // Add a class list to satisfy other requirements

        let result = spell.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("sphere"));
    }

    #[test]
    fn test_metadata_exclusion_from_hash() {
        let mut spell1 = CanonicalSpell::new(
            "Hash Stability".to_string(),
            1,
            "ARCANE".to_string(),
            "Test metadata exclusion".to_string(),
        );
        spell1.school = Some("Abjuration".to_string());
        spell1.class_list = vec!["Wizard".to_string()]; // Required for validation
        spell1.version = "1.0.0".to_string();
        spell1.author = Some("Original Author".to_string());

        let mut spell2 = spell1.clone();
        spell2.version = "1.1.0".to_string();
        spell2.author = Some("New Author".to_string());
        spell2.source_refs = vec![SourceRef {
            system: None,
            book: "Test Book".to_string(),
            page: Some(serde_json::json!(123)),
            note: None,
            url: None,
        }];

        let hash1 = spell1.compute_hash().unwrap();
        let hash2 = spell2.compute_hash().unwrap();

        assert_eq!(
            hash1, hash2,
            "Hash must be identical despite metadata changes"
        );
    }

    #[test]
    fn test_experience_cost_default_with_source_text_same_hash() {
        // BUG-2: source_text is metadata (excluded from hash); is_default() must not depend on it.
        // Two spells that differ only by experience_cost: None vs Some(default with source_text set) must produce the same hash.
        let default_with_source = ExperienceComponentSpec {
            kind: crate::models::experience::ExperienceKind::None,
            payer: crate::models::experience::ExperiencePayer::Caster,
            payment_timing: crate::models::experience::PaymentTiming::OnCompletion,
            payment_semantics: crate::models::experience::PaymentSemantics::Spend,
            can_reduce_level: true,
            recoverability: crate::models::experience::Recoverability::NormalEarning,
            amount_xp: None,
            per_unit: None,
            formula: None,
            tiered: None,
            dm_guidance: None,
            source_text: Some("XP, no cost".to_string()),
            notes: None,
        };
        assert!(
            default_with_source.is_default(),
            "Spec with only source_text set must be considered default"
        );

        let mut spell1 = CanonicalSpell::new(
            "XP Default Hash".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Abjuration".to_string());
        spell1.class_list = vec!["Wizard".to_string()];
        spell1.experience_cost = None;

        let mut spell2 = spell1.clone();
        spell2.experience_cost = Some(default_with_source);

        let mut norm1 = spell1.clone();
        let mut norm2 = spell2.clone();
        norm1.normalize(None);
        norm2.normalize(None);
        assert_eq!(
            norm1.experience_cost, norm2.experience_cost,
            "After normalize both must prune default experience_cost"
        );
        assert_eq!(
            norm1.components, norm2.components,
            "After normalize components must match (no experience flag from pruned cost)"
        );

        let hash1 = spell1.compute_hash().unwrap();
        let hash2 = spell2.compute_hash().unwrap();
        assert_eq!(
            hash1, hash2,
            "Hash must be identical when experience_cost is mechanically default but has source_text set"
        );
    }

    /// Task 1.5: raw_legacy_value (hashed fields) must affect hash; changing it must produce different hash.
    #[test]
    fn test_raw_legacy_value_included_in_hash() {
        use crate::models::duration_spec::{DurationKind, DurationSpec};

        let mut spell1 = CanonicalSpell::new(
            "Raw legacy hash".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Evocation".to_string());
        spell1.class_list = vec!["Wizard".to_string()];
        spell1.duration = Some(DurationSpec {
            kind: DurationKind::Special,
            raw_legacy_value: Some("See below".to_string()),
            ..Default::default()
        });

        let mut spell2 = spell1.clone();
        spell2.duration.as_mut().unwrap().raw_legacy_value = Some("See description".to_string());

        assert_ne!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Changing duration raw_legacy_value must change canonical hash"
        );
    }

    /// Task 1.5: After normalize(), Area/Duration .text must be synthesized; for kind=Special, .text from raw_legacy_value.
    #[test]
    fn test_normalize_area_duration_text_synthesis() {
        use crate::models::area_spec::{AreaKind, AreaSpec};
        use crate::models::duration_spec::{DurationKind, DurationSpec};

        let mut spell = CanonicalSpell::new(
            "Text synthesis".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];
        spell.area = Some(AreaSpec {
            kind: AreaKind::Special,
            raw_legacy_value: Some("Custom area text".to_string()),
            ..Default::default()
        });
        spell.duration = Some(DurationSpec {
            kind: DurationKind::Special,
            raw_legacy_value: Some("Custom duration text".to_string()),
            ..Default::default()
        });

        let _ = spell.normalize(None);

        let area = spell.area.as_ref().unwrap();
        assert!(
            area.text.is_some(),
            "Area .text must be synthesized after normalize()"
        );
        assert_eq!(
            area.text.as_deref(),
            area.raw_legacy_value.as_deref(),
            "Area kind=Special: .text must equal raw_legacy_value"
        );

        let dur = spell.duration.as_ref().unwrap();
        assert!(
            dur.text.is_some(),
            "Duration .text must be synthesized after normalize()"
        );
        assert_eq!(
            dur.raw_legacy_value.as_deref(),
            Some("Custom duration text"),
            "Duration raw_legacy_value preserved"
        );
        assert_eq!(
            dur.text.as_deref(),
            Some("Custom duration text"),
            "Duration kind=Special: .text from raw_legacy_value (no unit alias change here)"
        );
    }

    /// Task 1.5 Gap G1: verify text synthesis from structured (non-Special) fields.
    #[test]
    fn test_normalize_area_duration_text_synthesis_structured_fields() {
        use crate::models::area_spec::{AreaKind, AreaShapeUnit, AreaSpec};
        use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
        use crate::models::scalar::SpellScalar;

        let mut spell = CanonicalSpell::new(
            "Structured text synthesis".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];
        spell.area = Some(AreaSpec {
            kind: AreaKind::RadiusCircle,
            radius: Some(SpellScalar::fixed(20.0)),
            shape_unit: Some(AreaShapeUnit::Ft),
            ..Default::default()
        });
        spell.duration = Some(DurationSpec {
            kind: DurationKind::Time,
            duration: Some(SpellScalar::fixed(3.0)),
            unit: Some(DurationUnit::Round),
            ..Default::default()
        });

        let _ = spell.normalize(None);

        assert_eq!(
            spell.area.as_ref().and_then(|a| a.text.as_deref()),
            Some("20 ft radius"),
            "Area kind=RadiusCircle should synthesize canonical structured text"
        );
        assert_eq!(
            spell.duration.as_ref().and_then(|d| d.text.as_deref()),
            Some("3 round"),
            "Duration kind=Time should synthesize canonical structured text"
        );
    }

    #[test]
    fn test_damage_source_text_excluded_from_hash() {
        let mut spell1 = CanonicalSpell::new(
            "Damage source text hash".to_string(),
            3,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Evocation".to_string());
        spell1.class_list = vec!["Wizard".to_string()];
        spell1.damage = Some(crate::models::damage::SpellDamageSpec {
            kind: crate::models::damage::DamageKind::DmAdjudicated,
            dm_guidance: Some("DM adjudicates damage".to_string()),
            source_text: Some("1d6+1 per level".to_string()),
            ..Default::default()
        });

        let mut spell2 = spell1.clone();
        spell2.damage.as_mut().unwrap().source_text = Some("different source text".to_string());

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Damage source_text/sourceText must be excluded from canonical hash"
        );
    }

    #[test]
    fn test_magic_resistance_source_text_excluded_from_hash() {
        let mut spell1 = CanonicalSpell::new(
            "MR source text hash".to_string(),
            3,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Abjuration".to_string());
        spell1.class_list = vec!["Wizard".to_string()];
        spell1.magic_resistance = Some(crate::models::magic_resistance::MagicResistanceSpec {
            kind: crate::models::magic_resistance::MagicResistanceKind::Normal,
            source_text: Some("Yes".to_string()),
            ..Default::default()
        });

        let mut spell2 = spell1.clone();
        spell2.magic_resistance.as_mut().unwrap().source_text = Some("No".to_string());

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "MagicResistance source_text/sourceText must be excluded from canonical hash"
        );
    }

    #[test]
    fn test_experience_source_text_excluded_from_hash() {
        let mut spell1 = CanonicalSpell::new(
            "XP source text hash".to_string(),
            3,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell1.school = Some("Abjuration".to_string());
        spell1.class_list = vec!["Wizard".to_string()];
        spell1.experience_cost = Some(crate::models::experience::ExperienceComponentSpec {
            kind: crate::models::experience::ExperienceKind::Fixed,
            amount_xp: Some(100),
            source_text: Some("100 XP".to_string()),
            ..Default::default()
        });

        let mut spell2 = spell1.clone();
        spell2.experience_cost.as_mut().unwrap().source_text =
            Some("100 experience points".to_string());

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Experience source_text/sourceText must be excluded from canonical hash"
        );
    }

    #[test]
    fn test_compute_hash_fails_on_invalid_spell() {
        let mut spell = CanonicalSpell::new(
            "Invalid".to_string(),
            1,
            "ARCANE".to_string(),
            "Missing school".to_string(),
        );
        spell.school = None; // Explicitly ensure school is missing for ARCANE
        spell.class_list = vec!["Wizard".to_string()]; // Add a class list to satisfy other requirements

        let result = spell.compute_hash();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Validation error"));
    }

    #[test]
    fn test_null_handling_and_formatting() {
        let mut spell = CanonicalSpell::new(
            "Null Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Test optional fields are null in JSON".to_string(),
        );
        spell.school = Some("Abjuration".to_string());
        spell.class_list = vec!["Wizard".to_string()]; // Required for validation

        let json = spell.to_canonical_json().unwrap();

        // Standard fields should be present
        assert!(json.contains("\"name\":\"Null Test\""));
        assert!(json.contains("\"level\":1"));

        // Option fields not in the struct but in schema should NOT be present if they are skipped or None
        // Actually, our new struct doesn't have `source` but Has `author` etc. which are skipped.
        assert!(
            !json.contains("\"author\""),
            "Skipped field should not be in JSON"
        );

        // Non-skipped Option::None fields appear as `null` if not skipped.
        // HOWEVER, material_components is now PRUNED by Lean Hashing if empty.
        assert!(!json.contains("\"material_components\":[]"));
        // is_cantrip/is_quest_spell are NOW pruned if 0 (Lean Hashing)
        assert!(!json.contains("\"is_cantrip\""));
        assert!(!json.contains("\"is_quest_spell\""));
        assert!(
            !json.contains("\"schema_version\""),
            "schema_version should be excluded from canonical JSON"
        );
    }

    #[test]
    fn test_empty_object_pruned() {
        // GAP-3: Lean Hashing must remove empty objects (e.g. clamp_total: {})
        use crate::models::damage::{
            ApplicationSpec, ClampSpec, DamagePart, DamageSaveSpec, DicePool, DiceTerm,
            SpellDamageSpec,
        };
        use crate::models::damage::{DamageKind, DamageType};

        let mut spell = CanonicalSpell::new(
            "Empty Obj Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];
        spell.damage = Some(SpellDamageSpec {
            kind: DamageKind::Modeled,
            parts: Some(vec![DamagePart {
                id: "main".to_string(),
                damage_type: DamageType::Fire,
                base: DicePool {
                    terms: vec![DiceTerm {
                        count: 1,
                        sides: 6,
                        per_die_modifier: 0,
                    }],
                    flat_modifier: 0,
                },
                clamp_total: Some(ClampSpec {
                    min_total: None,
                    max_total: None,
                }),
                application: ApplicationSpec::default(),
                save: DamageSaveSpec::default(),
                ..Default::default()
            }]),
            ..Default::default()
        });

        let json = spell.to_canonical_json().unwrap();
        assert!(
            !json.contains("\"clamp_total\":{}"),
            "Empty clamp_total object must be pruned from canonical JSON"
        );
    }

    #[test]
    fn test_empty_array_omission() {
        let mut spell = CanonicalSpell::new(
            "Empty Array Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Test empty arrays in canonical JSON".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        // Explicitly set tags to empty array
        spell.tags = vec![];
        spell.class_list = vec![]; // Also test empty class_list
        spell.subschools = vec![];
        spell.descriptors = vec![];

        let json = spell.to_canonical_json().unwrap();

        // GIVEN a spell with tags = []
        // THEN the canonical JSON MUST OMIT "tags": [] (Lean Hashing)
        assert!(
            !json.contains("\"tags\":[]"),
            "Empty tags array should be PRUNED in canonical JSON"
        );
        assert!(
            !json.contains("\"class_list\":[]"),
            "Empty class_list array should be PRUNED"
        );
        assert!(
            !json.contains("\"subschools\":[]"),
            "Empty subschools array should be PRUNED"
        );
        assert!(
            !json.contains("\"descriptors\":[]"),
            "Empty descriptors array should be PRUNED"
        );
    }

    /// Schema requires damage.parts when kind=modeled; empty parts array must be retained in canonical JSON.
    #[test]
    fn test_damage_modeled_empty_parts_retained_in_canonical_json() {
        use crate::models::damage::{DamageKind, SpellDamageSpec};

        let mut spell = CanonicalSpell::new(
            "Modeled Empty Parts".to_string(),
            1,
            "ARCANE".to_string(),
            "Spell with modeled damage and no parts.".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.damage = Some(SpellDamageSpec {
            kind: DamageKind::Modeled,
            parts: Some(vec![]),
            ..Default::default()
        });

        let json = spell.to_canonical_json().unwrap();
        assert!(
            json.contains("\"parts\":[]"),
            "damage.parts when kind=modeled must be retained when empty (schema required); got: {}",
            json
        );
    }

    #[test]
    fn test_from_spell_detail_components_fallback_when_specs_omitted() {
        use crate::models::spell::SpellDetail;

        let detail = SpellDetail {
            id: Some(1),
            name: "Fallback Components".into(),
            school: Some("Evocation".into()),
            sphere: None,
            class_list: Some("Wizard".into()),
            level: 2,
            components: Some("V, S, M".into()),
            material_components: Some("ruby dust (worth 100 gp, consumed)".into()),
            components_spec: None,
            material_components_spec: None,
            description: "Fallback parse behavior.".into(),
            is_quest_spell: 0,
            is_cantrip: 0,
            ..Default::default()
        };

        let canon = CanonicalSpell::try_from(detail).unwrap();
        let components = canon
            .components
            .expect("components should be parsed from legacy text");
        assert!(components.verbal);
        assert!(components.somatic);
        assert!(components.material);

        let materials = canon
            .material_components
            .expect("material components should be parsed from legacy text");
        assert_eq!(materials.len(), 1);
        assert_eq!(materials[0].name, "ruby dust");
        assert_eq!(materials[0].gp_value, Some(100.0));
        assert_eq!(materials[0].is_consumed, Some(true));
    }

    #[test]
    fn test_from_spell_detail_inference() {
        use crate::models::spell::SpellDetail;

        // 1. Arcane Inference (School only)
        let mut detail = SpellDetail {
            id: Some(1),
            name: "Arcane Spell".into(),
            school: Some("Evocation".into()),
            sphere: None,
            class_list: Some("Wizard, Sorcerer".into()),
            level: 3,
            range: Some("100 yards".into()),
            components: Some("V, S, M".into()),
            material_components: Some("Bat guano".into()),
            casting_time: Some("1".into()),
            duration: Some("Instantaneous".into()),
            area: Some("20 ft. radius".into()),
            saving_throw: Some("1/2".into()),
            reversible: Some(0),
            description: "Big boom".into(),
            tags: Some("Fire, AoE".into()),
            source: Some("PHB".into()),
            edition: Some("2e".into()),
            author: None,
            license: None,
            is_quest_spell: 0,
            is_cantrip: 0,
            artifacts: None,
            ..Default::default()
        };

        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        assert_eq!(canon.tradition, "ARCANE");
        assert_eq!(canon.school, Some("Evocation".to_string()));
        assert_eq!(canon.sphere, None);
        assert_eq!(canon.class_list.len(), 2);
        assert!(canon.class_list.contains(&"Wizard".to_string()));
        assert!(canon.components.as_ref().unwrap().verbal);
        assert!(canon.components.as_ref().unwrap().material);
        assert_eq!(canon.source_refs[0].book, "PHB");

        // 2. Divine Inference (Sphere only)
        detail.school = None;
        detail.sphere = Some("Healing".into());
        // Since school is None, tradition defaults based on Sphere
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        assert_eq!(canon.tradition, "DIVINE");
        assert_eq!(canon.school, None);
        assert_eq!(canon.sphere, Some("Healing".to_string()));

        // 3. Both Inference
        detail.school = Some("Abjuration".into());
        let result = CanonicalSpell::try_from(detail.clone());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("mutually exclusive"));

        // 4. Default / Fallback tests moved to regression test
    }

    /// Verifies the JSON schema `allOf` mutual-exclusivity constraint independently of `TryFrom`.
    /// Even if a `CanonicalSpell` is constructed with both `school` and `sphere` set (bypassing the
    /// ingest gate), the schema-level `allOf` rule (`sphere: { const: null }` for ARCANE;
    /// `school: { const: null }` for DIVINE) must still reject the record at `validate()` time.
    #[test]
    fn test_schema_rejects_both_school_and_sphere_directly() {
        // Manually construct a CanonicalSpell with ARCANE tradition but both school and sphere set,
        // bypassing TryFrom to exercise the allOf schema constraint directly.
        let mut spell = CanonicalSpell::new(
            "Both Fields Spell".to_string(),
            1,
            "ARCANE".to_string(),
            "Testing schema allOf mutual-exclusivity.".to_string(),
        );
        // Force both fields — normally prevented by TryFrom
        spell.school = Some("Evocation".to_string());
        spell.sphere = Some("Combat".to_string());
        spell.class_list = vec!["Wizard".to_string()];

        // validate() directly runs the JSON schema including the allOf constraint.
        // For ARCANE tradition, school is required AND sphere must be null.
        // Having sphere set violates the `sphere: { const: null }` rule.
        let result = spell.validate();
        assert!(
            result.is_err(),
            "Schema validation must reject an ARCANE spell with sphere set"
        );

        // Also verify the DIVINE direction: sphere set + school set must fail.
        let mut spell_divine = CanonicalSpell::new(
            "Both Fields Divine".to_string(),
            1,
            "DIVINE".to_string(),
            "Testing schema allOf mutual-exclusivity for DIVINE.".to_string(),
        );
        spell_divine.sphere = Some("Healing".to_string());
        spell_divine.school = Some("Necromancy".to_string()); // opponent field
        spell_divine.class_list = vec!["Priest".to_string()];

        let result_divine = spell_divine.validate();
        assert!(
            result_divine.is_err(),
            "Schema validation must reject a DIVINE spell with school set"
        );
    }

    #[test]
    fn test_id_assigned_does_not_change_hash() {
        let mut spell = CanonicalSpell::new(
            "ID Stability".to_string(),
            1,
            "ARCANE".to_string(),
            "Hash should not change with ID".to_string(),
        );
        spell.school = Some("Abjuration".to_string());
        spell.class_list = vec!["Wizard".to_string()];

        let hash_no_id = spell.compute_hash().unwrap();

        // Assign an ID (must match schema pattern: 64 hex chars)
        spell.id = Some("a".repeat(64));
        let hash_with_id = spell.compute_hash().unwrap();

        assert_eq!(
            hash_no_id, hash_with_id,
            "Hash must remain identical even when an ID is assigned"
        );
    }

    #[test]
    fn test_normalization_nfc() {
        // "e" + acute accent (U+0065 U+0301) vs "é" (U+00E9)
        let s1_name = "Fiance\u{0301}";
        let s2_name = "Fianc\u{00e9}";

        let mut spell1 = CanonicalSpell::new(s1_name.into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];

        let mut spell2 = CanonicalSpell::new(s2_name.into(), 1, "ARCANE".into(), "Desc".into());
        spell2.school = Some("Abjuration".into());
        spell2.class_list = vec!["Wizard".into()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "NFD and NFC strings must hash identically"
        );
    }

    #[test]
    fn test_normalization_whitespace_collapse() {
        let mut spell1 = CanonicalSpell::new("Spell".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];
        spell1.range = Some(RangeSpec {
            kind: RangeKind::Special,
            text: None,
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: Some("Some  note".into()),
            raw_legacy_value: None,
        });

        let mut spell2 = spell1.clone();
        spell2.range.as_mut().unwrap().notes = Some("Some note".into());

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Internal whitespace must be collapsed"
        );
    }

    #[test]
    fn test_normalization_line_endings() {
        let mut spell1 = CanonicalSpell::new(
            "Line Endings".into(),
            1,
            "ARCANE".into(),
            "Line1\r\nLine2".into(),
        );
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];

        let mut spell2 = CanonicalSpell::new(
            "Line Endings".into(),
            1,
            "ARCANE".into(),
            "Line1\nLine2".into(),
        );
        spell2.school = Some("Abjuration".into());
        spell2.class_list = vec!["Wizard".into()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "CRLF and LF line endings must hash identically"
        );
    }

    #[test]
    fn test_time_unit_normalization_to_schema_enums() {
        let mut spell = CanonicalSpell::new("Units".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.casting_time = Some(SpellCastingTime {
            text: "1".into(),
            unit: CastingTimeUnit::Round,
            base_value: Some(1.0),
            per_level: Some(0.0),
            level_divisor: Some(1.0),
            raw_legacy_value: None,
        });
        spell.duration = Some(DurationSpec {
            kind: DurationKind::Time,
            unit: Some(DurationUnit::Hour),
            duration: Some(SpellScalar {
                mode: ScalarMode::Fixed,
                value: Some(2.0),
                per_level: None,
                min_level: None,
                max_level: None,
                cap_value: None,
                cap_level: None,
                rounding: None,
            }),
            notes: Some("2".to_string()), // Preserving text as notes if needed, though not strictly required for this test
            text: None,
            uses: None,
            condition: None,
            raw_legacy_value: None,
        });

        let canonical_json = spell.to_canonical_json().unwrap();
        assert!(
            canonical_json.contains("\"unit\":\"round\""),
            "Casting time unit should normalize to round"
        );
        assert!(
            canonical_json.contains("\"unit\":\"hour\""),
            "Duration unit should normalize to hour (lowercase singular per new standard)"
        );
    }

    #[test]
    fn test_normalization_float_precision() {
        let mut spell1 = CanonicalSpell::new("Spell".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];

        // Helper to make scalar
        let make_spec = |val: f64| RangeSpec {
            kind: RangeKind::Distance,
            text: None,
            unit: Some(RangeUnit::Yd),
            distance: Some(SpellScalar {
                mode: ScalarMode::Fixed,
                value: Some(val),
                per_level: None,
                min_level: None,
                max_level: None,
                cap_value: None,
                cap_level: None,
                rounding: None,
            }),
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
            raw_legacy_value: None,
        };

        spell1.range = Some(make_spec(10.0000001));

        let mut spell2 = spell1.clone();
        spell2.range = Some(make_spec(10.0000004));

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Floats must be rounded to 6 decimal places"
        );

        let mut spell3 = spell1.clone();
        spell3.range = Some(make_spec(10.000001));
        assert_ne!(
            spell1.compute_hash().unwrap(),
            spell3.compute_hash().unwrap(),
            "Different values beyond 6 decimals must be different"
        );
    }

    #[test]
    fn test_array_deduplication() {
        let mut spell1 =
            CanonicalSpell::new("Deduplicate".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into(), "Wizard".into()];
        spell1.tags = vec!["TagA".into(), "TagA".into()];

        let mut spell2 = spell1.clone();
        spell2.class_list = vec!["Wizard".into()];
        spell2.tags = vec!["TagA".into()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Arrays must be deduplicated"
        );
    }

    #[test]
    fn test_casing_normalization_tradition() {
        let mut spell1 = CanonicalSpell::new("Casing".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];

        let mut spell2 = spell1.clone();
        spell2.tradition = "arcane".into();

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Tradition 'arcane' must be normalized to 'ARCANE'"
        );
    }

    #[test]
    fn test_casing_normalization_enums() {
        let mut spell1 = CanonicalSpell::new("Enums".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];

        // Range is enum-typed now, so no string normalization to test there directly
        // Testing string fields like School/Sphere is sufficient

        let mut spell2 = spell1.clone();
        spell2.school = Some("abjuration".into());

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "School 'abjuration' must be corrected to Title Case"
        );
    }

    #[test]
    fn test_subschools_descriptors_case_normalization() {
        // GAP-4: subschools and descriptors differing only by case must produce the same hash.
        let mut spell1 = CanonicalSpell::new("Taxonomy".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Evocation".into());
        spell1.class_list = vec!["Wizard".into()];
        spell1.subschools = vec!["Fire".to_string()];
        spell1.descriptors = vec!["Mind-Affecting".to_string()];

        let mut spell2 = spell1.clone();
        spell2.subschools = vec!["fire".to_string()];
        spell2.descriptors = vec!["mind-affecting".to_string()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "subschools/descriptors case differences must normalize to same hash"
        );
    }

    #[test]
    fn test_reversible_materialization() {
        let mut spell1 =
            CanonicalSpell::new("Reversible".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];
        spell1.reversible = Some(0);

        let mut spell2 = spell1.clone();
        spell2.reversible = None;

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "None reversible must hash identically to Some(0) due to default materialization"
        );
    }

    #[test]
    fn test_damage_without_cap_level_passes() {
        let mut spell = CanonicalSpell::new(
            "Damage Cap Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Testing null cap level".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];
        spell.damage = Some(SpellDamageSpec {
            kind: crate::models::damage::DamageKind::Modeled,
            notes: Some("1d6".into()),
            ..Default::default()
        });

        let result = spell.validate();
        assert!(
            result.is_ok(),
            "Validation failed for null cap_level: {:?}",
            result.err()
        );
    }

    #[test]
    fn test_regression_canonical_json_null_omission() {
        // Bug: Optional fields were serializing as `null`, breaking deterministic hashing.
        // Fix: Added `skip_serializing_if = "Option::is_none"`.
        let mut spell = CanonicalSpell::new(
            "Null Regression Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );
        // Explicitly set these to None to trigger potential null serialization
        spell.material_components = None;
        spell.saving_throw = None;
        spell.reversible = None;
        spell.damage = Some(SpellDamageSpec {
            kind: crate::models::damage::DamageKind::Modeled,
            notes: Some("1d6".into()),
            ..Default::default()
        });

        let json = spell.to_canonical_json().unwrap();

        // Lean Hashing: material_components: [] should be PRUNED
        assert!(
            !json.contains("\"material_components\":[]"),
            "material_components should be pruned"
        );
        assert!(
            !json.contains("\"saving_throw\""),
            "saving_throw should be omitted"
        );
        assert!(
            !json.contains("\"cap_level\""),
            "cap_level inside damage should be omitted"
        );

        // Lean Hashing: reversible: 0 should be PRUNED
        assert!(
            !json.contains("\"reversible\""),
            "reversible should be pruned if 0"
        );
    }

    #[test]
    fn test_regression_schema_version_exclusion_from_canonical_json() {
        // Bug: schema_version was included in canonical JSON, making hashes change per schema version.
        // Fix: schema_version is now removed during canonicalization for hashing.
        // Note: It is STILL present in standard serialization for export/validation.
        let spell = CanonicalSpell::new(
            "Version Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );

        let json = spell.to_canonical_json().unwrap();

        assert!(
            !json.contains("\"schema_version\""),
            "schema_version must be EXCLUDED from canonical JSON"
        );

        // Verify it IS present in standard serialization
        let standard_json = serde_json::to_string(&spell).unwrap();
        assert!(
            standard_json.contains(&format!("\"schema_version\":{}", CURRENT_SCHEMA_VERSION)),
            "schema_version must be PRESENT in standard JSON for export"
        );
    }

    #[test]
    fn test_issue_1_enum_normalization_casing() {
        let mut spell = CanonicalSpell::new("Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("EVOCATION".into());
        spell.normalize(None);
        assert_eq!(
            spell.school.as_deref(),
            Some("Evocation"),
            "Should normalize EVOCATION to Evocation"
        );

        spell.school = Some("aBjUrAtIoN".into());
        spell.normalize(None);
        assert_eq!(
            spell.school.as_deref(),
            Some("Abjuration"),
            "Should normalize aBjUrAtIoN to Abjuration"
        );
    }

    #[test]
    fn test_issue_2_normalization_preserves_zero_value() {
        use crate::models::scalar::*;
        // Verify canonicalization doesn't strip value: 0.0 for PerLevel scalars
        let mut spell = CanonicalSpell::new("Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());

        // Manually construct scalar as if parsed
        let scalar = SpellScalar {
            mode: ScalarMode::PerLevel,
            value: Some(0.0),
            per_level: Some(1.0),
            ..Default::default()
        };

        spell.duration = Some(crate::models::duration_spec::DurationSpec {
            kind: crate::models::duration_spec::DurationKind::Time,
            duration: Some(scalar),
            ..Default::default()
        });

        spell.normalize(None);

        let json = serde_json::to_value(&spell).unwrap();
        let dur_json = json.get("duration").unwrap().get("duration").unwrap();
        assert_eq!(
            dur_json.get("value").unwrap().as_f64(),
            Some(0.0),
            "value: 0.0 should be preserved"
        );
    }

    #[test]
    fn test_issue_3_area_spec_schema_requirements() {
        let mut spell = CanonicalSpell::new("Area Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into()); // REQUIRED for validation to even get to Area check
        spell.area = Some(AreaSpec {
            kind: AreaKind::Cylinder,
            radius: Some(SpellScalar {
                mode: ScalarMode::Fixed,
                value: Some(5.0),
                ..Default::default()
            }),
            height: Some(SpellScalar {
                mode: ScalarMode::Fixed,
                value: Some(10.0),
                ..Default::default()
            }),
            shape_unit: Some(AreaShapeUnit::Ft),
            ..Default::default()
        });

        let result = spell.validate();
        assert!(
            result.is_ok(),
            "Validation should succeed for partial Cylinder (missing radius/unit): {:?}",
            result.err()
        );
    }

    #[test]
    fn test_issue_4_components_hashing() {
        let mut s1 = CanonicalSpell::new("Comp Test".into(), 1, "ARCANE".into(), "Desc".into());
        s1.school = Some("Divination".into());
        s1.components = None;

        let mut s2 = CanonicalSpell::new("Comp Test".into(), 1, "ARCANE".into(), "Desc".into());
        s2.school = Some("Divination".into());
        s2.components = Some(SpellComponents {
            verbal: false,
            somatic: false,
            material: false,
            focus: false,
            divine_focus: false,
            experience: false,
        });

        let h1 = s1.compute_hash().expect("Hash 1");
        let h2 = s2.compute_hash().expect("Hash 2");

        assert_eq!(
            h1, h2,
            "Spells with None components and Default components should have identical hash"
        );
    }

    #[test]
    fn test_regression_varied_area_shapes() {
        // Validation should succeed for various shapes with minimal fields (relaxed schema)
        let shapes = vec![
            AreaKind::Cone,
            AreaKind::Line,
            AreaKind::Rect,
            AreaKind::Cube,
            AreaKind::Wall,
        ];

        for kind in shapes {
            let mut spell =
                CanonicalSpell::new(format!("{:?}", kind), 1, "ARCANE".into(), "Desc".into());
            spell.school = Some("Abjuration".into());

            let scalar = Some(SpellScalar {
                value: Some(5.0),
                ..Default::default()
            });

            spell.area = Some(AreaSpec {
                kind,
                radius: if kind == AreaKind::Cone || kind == AreaKind::Cylinder {
                    scalar.clone()
                } else {
                    None
                },
                length: if kind == AreaKind::Line
                    || kind == AreaKind::Wall
                    || kind == AreaKind::Cone
                    || kind == AreaKind::Rect
                {
                    scalar.clone()
                } else {
                    None
                },
                width: if kind == AreaKind::Rect || kind == AreaKind::Line || kind == AreaKind::Wall
                {
                    scalar.clone()
                } else {
                    None
                },
                height: if kind == AreaKind::Wall
                    || kind == AreaKind::Cube
                    || kind == AreaKind::Cylinder
                {
                    scalar.clone()
                } else {
                    None
                },
                edge: if kind == AreaKind::Cube {
                    scalar.clone()
                } else {
                    None
                },
                thickness: if kind == AreaKind::Wall {
                    scalar.clone()
                } else {
                    None
                },
                shape_unit: Some(AreaShapeUnit::Ft),
                ..Default::default()
            });

            let val_res = spell.validate();
            assert!(
                val_res.is_ok(),
                "Validation failed for minimal area shape: {:?}. Error: {:?}",
                kind,
                val_res.err()
            );
        }
    }

    #[test]
    fn test_regression_duplicate_array_items_fail_validation() {
        // Bug: parse_comma_list didn't deduplicate, schema has uniqueItems: true.
        // If duplicates exist, validation fails, preventing hashing.

        // Setup a spell with duplicates in class_list
        // Setup a spell with duplicates in class_list
        let detail = crate::models::spell::SpellDetail {
            id: Some(1),
            name: "Duplicate Test".into(),
            school: Some("Evocation".into()),
            sphere: None,
            // Duplicates here:
            class_list: Some("Wizard, Wizard, Sorcerer".into()),
            level: 3,
            range: Some("100 yards".into()),
            components: Some("V".into()),
            material_components: None,
            casting_time: Some("1".into()),
            duration: Some("Instantaneous".into()),
            area: Some("20 ft. radius".into()),
            saving_throw: Some("1/2".into()),
            reversible: Some(0),
            description: "Big boom".into(),
            tags: Some("Fire, Fire".into()),
            source: Some("PHB".into()),
            edition: Some("2e".into()),
            author: None,
            license: None,
            is_quest_spell: 0,
            is_cantrip: 0,
            artifacts: None,
            ..Default::default()
        };

        let canon = CanonicalSpell::try_from(detail).expect("Should convert successfully");

        // Before Fix: this should FAIL validation because duplicates are present
        // After Fix: this should PASS validation because duplicates are removed during conversion
        let result = canon.validate();

        // We assert true here because we WANT it to pass.
        // If the bug exists, this test will fail, confirming the need for a fix.
        assert!(
            result.is_ok(),
            "Validation failed due to duplicates: {:?}",
            result.err()
        );

        // Verify dedup happened
        assert_eq!(
            canon.class_list.len(),
            2,
            "Class list should be deduped to 2 items"
        );
        assert_eq!(canon.tags.len(), 1, "Tags should be deduped to 1 item");
    }

    #[test]
    fn test_regression_invalid_tradition_inference() {
        // Bug: If School and Sphere are both None, tradition defaults to ARCANE but School is None.
        // Fix: TryFrom should fail if neither is present.
        let detail = crate::models::spell::SpellDetail {
            id: Some(1),
            name: "Ambiguous Spell".into(),
            school: None,
            sphere: None,
            class_list: Some("Wizard".into()),
            level: 1,
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            reversible: None,
            description: "Desc".into(),
            tags: None,
            source: None,
            edition: None,
            author: None,
            license: None,
            is_quest_spell: 0,
            is_cantrip: 0,
            artifacts: None,
            ..Default::default()
        };

        let result = CanonicalSpell::try_from(detail);

        // Verify refactor: conversion MUST fail
        assert!(
            result.is_err(),
            "Conversion should fail for spell with no School or Sphere"
        );
        let err = result.err().unwrap();
        assert!(
            err.contains("Must have a School"),
            "Error message should mention School requirement"
        );
    }

    #[test]
    fn test_validate_schema_version_current() {
        let mut spell = CanonicalSpell::new("V1".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.schema_version = CURRENT_SCHEMA_VERSION;
        assert!(spell.validate().is_ok());
    }

    #[test]
    fn test_validate_schema_version_future_warning() {
        let mut spell = CanonicalSpell::new("V100".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.schema_version = CURRENT_SCHEMA_VERSION + 1;
        // Should PASS validation with a warning logging (verified via behavior, not return type)
        assert!(spell.validate().is_ok());
    }

    #[test]
    fn test_validate_schema_version_zero_rejected() {
        let mut spell = CanonicalSpell::new("V0".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.schema_version = 0;
        let result = spell.validate();
        assert!(
            result.is_err(),
            "Schema version 0 must be rejected by validate() when MIN_SUPPORTED_SCHEMA_VERSION=1"
        );
    }

    #[test]
    fn test_validate_schema_version_rejected() {
        let mut spell = CanonicalSpell::new("Invalid".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.schema_version = -1;
        let result = spell.validate();
        assert!(
            result.is_err(),
            "Schema version < MIN_SUPPORTED must be rejected"
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("Incompatible schema version"),
            "Error message should indicate incompatible version"
        );
    }

    #[test]
    fn test_hash_stability_across_schema_versions() {
        let mut spell1 = CanonicalSpell::new("Stability".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];
        spell1.schema_version = 1;

        let mut spell2 = spell1.clone();
        spell2.schema_version = 0; // Historical/migration version

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Hash must be identical across supported schema versions (0 and 1)"
        );
    }

    #[test]
    fn test_nested_deny_unknown_fields() {
        // Test SpellComponents
        let json =
            r#"{"verbal": true, "somatic": true, "material": false, "unknown_field": "error"}"#;
        let res: Result<SpellComponents, _> = serde_json::from_str(json);
        assert!(
            res.is_err(),
            "Should reject unknown field in SpellComponents"
        );

        // Test SpellCastingTime
        let json = r#"{"text": "1", "unit": "Round", "unknown_field": "error"}"#;
        let res: Result<SpellCastingTime, _> = serde_json::from_str(json);
        assert!(
            res.is_err(),
            "Should reject unknown field in SpellCastingTime"
        );

        // Test RangeSpec
        let json = r#"{"kind": "touch", "unknown_field": "error"}"#;
        let res: Result<RangeSpec, _> = serde_json::from_str(json);
        assert!(res.is_err(), "Should reject unknown field in RangeSpec");

        // Test CanonicalSpell top-level
        let json = r#"{
            "name": "Test",
            "level": 1,
            "tradition": "ARCANE",
            "description": "Desc",
            "unknown_top_level": "error"
        }"#;
        let res: Result<CanonicalSpell, _> = serde_json::from_str(json);
        assert!(
            res.is_err(),
            "Should reject unknown field in CanonicalSpell"
        );
    }

    #[test]
    fn test_validation_strictly_rejects_unknown_properties() {
        // This test ensures that the schema itself is strict, even if Serde didn't catch something
        let mut spell = CanonicalSpell::new("Strict".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];

        // Confirm valid first
        assert!(spell.validate().is_ok());

        // Now manually create a JSON value with an extra field at top level
        let mut value = serde_json::to_value(&spell).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("extra".to_string(), serde_json::json!("field"));

        // Compile and validate
        const SCHEMA_STR: &str = include_str!("../../schemas/spell.schema.json");
        let schema = serde_json::from_str::<serde_json::Value>(SCHEMA_STR).unwrap();
        let compiled = jsonschema::JSONSchema::compile(&schema).unwrap();

        let result = compiled.validate(&value);
        assert!(
            result.is_err(),
            "Schema should reject additionalProperties: false at top level"
        );

        // Test nested additional properties (e.g. range)
        let mut spell =
            CanonicalSpell::new("Strict Nested".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];
        spell.range = Some(RangeSpec {
            kind: RangeKind::Touch,
            text: None,
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
            raw_legacy_value: None,
        });

        let mut value = serde_json::to_value(&spell).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .get_mut("range")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("extra".to_string(), serde_json::json!("field"));

        let result = compiled.validate(&value);
        assert!(
            result.is_err(),
            "Schema should reject additionalProperties: false in range"
        );
    }

    #[test]
    fn test_is_quest_spell_is_cantrip_enum_constraint() {
        let mut spell = CanonicalSpell::new("Enum Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];

        // 0 and 1 are valid
        spell.is_quest_spell = Some(0);
        spell.is_cantrip = Some(1);
        assert!(spell.validate().is_ok());

        spell.is_quest_spell = Some(1);
        spell.is_cantrip = Some(0);
        assert!(spell.validate().is_ok());

        // Anything other than 0 or 1 should fail
        let mut value = serde_json::to_value(&spell).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("is_quest_spell".into(), serde_json::json!(2));

        const SCHEMA_STR: &str = include_str!("../../schemas/spell.schema.json");
        let schema = serde_json::from_str::<serde_json::Value>(SCHEMA_STR).unwrap();
        let compiled = jsonschema::JSONSchema::compile(&schema).unwrap();

        assert!(
            compiled.validate(&value).is_err(),
            "Should reject 2 for is_quest_spell"
        );

        let mut value = serde_json::to_value(&spell).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("is_cantrip".into(), serde_json::json!(false));
        assert!(
            compiled.validate(&value).is_err(),
            "Should reject boolean for is_cantrip"
        );
    }

    #[test]
    fn test_component_parsing_exact_match() {
        use crate::models::spell::SpellDetail;

        let mut detail = SpellDetail {
            id: Some(1),
            name: "Somatic Test".into(),
            school: Some("Abjuration".into()),
            sphere: None,
            class_list: None,
            level: 1,
            range: None,
            components: Some("Somatic".into()), // Should NOT match 'M'
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            reversible: None,
            description: "Desc".into(),
            tags: None,
            source: None,
            edition: None,
            author: None,
            license: None,
            is_quest_spell: 0,
            is_cantrip: 0,
            artifacts: None,
            ..Default::default()
        };

        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(!comps.verbal);
        assert!(comps.somatic);
        assert!(
            !comps.material,
            "Somatic should NOT set material=true despite containing 'm'"
        );

        detail.components = Some("V, S, M".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(comps.verbal);
        assert!(comps.somatic);
        assert!(comps.material);

        detail.components = Some("verbal ; somatic".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(comps.verbal);
        assert!(comps.somatic);
        assert!(!comps.material);

        // Case: Mixed case and extra whitespace
        detail.components = Some("  vErBaL ,   S  ".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(comps.verbal);
        assert!(comps.somatic);
        assert!(!comps.material);

        // Case: Unknown tokens and full words
        detail.components = Some("V, Material, Focus".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(comps.verbal);
        assert!(!comps.somatic);
        assert!(comps.material);

        // Case: Empty or nonsensical tokens
        detail.components = Some(", ; ,".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(!comps.verbal);
        assert!(!comps.somatic);
        assert!(!comps.material);

        detail.components = Some("".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        assert!(
            canon.components.is_none(),
            "Empty components string should result in None"
        );
        assert!(!comps.verbal);
        assert!(!comps.somatic);
        assert!(!comps.material);

        // Case: Combined string without separators (VSM parses as V, S, M per parser spec)
        detail.components = Some("VSM".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(comps.verbal, "Undelimited VSM should parse as verbal");
        assert!(comps.somatic, "Undelimited VSM should parse as somatic");
        assert!(comps.material, "Undelimited VSM should parse as material");
    }

    #[test]
    fn test_metadata_preservation_for_storage() {
        let mut spell =
            CanonicalSpell::new("Metadata Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.author = Some("Test Author".into());
        spell.edition = Some("2e".into());

        // 1. Verify Standard Serialization KEEPS metadata
        let standard_json = serde_json::to_string(&spell).unwrap();
        assert!(
            standard_json.contains("\"author\":\"Test Author\""),
            "Standard JSON must contain author"
        );
        assert!(
            standard_json.contains("\"edition\":\"2e\""),
            "Standard JSON must contain edition"
        );

        // 2. Verify Canonical Serialization REMOVES metadata for hashing
        let canonical_json = spell.to_canonical_json().unwrap();
        assert!(
            !canonical_json.contains("\"author\""),
            "Canonical JSON must EXCLUDE author"
        );
        assert!(
            !canonical_json.contains("\"edition\""),
            "Canonical JSON must EXCLUDE edition"
        );
    }

    #[test]
    fn test_new_uses_current_schema_version() {
        let spell = CanonicalSpell::new("V".into(), 1, "ARCANE".into(), "D".into());
        assert_eq!(spell.schema_version, CURRENT_SCHEMA_VERSION);
    }
    #[test]
    fn test_complex_field_structuring_regression() {
        use crate::models::spell::SpellDetail;

        let detail = SpellDetail {
            id: Some(1),
            name: "Complex Scaling Spell".to_string(),
            level: 3,
            school: Some("Evocation".to_string()),
            sphere: None,
            class_list: Some("Wizard".to_string()),
            range: Some("10 yards + 5 yards/level".to_string()),
            components: Some("V, S, M (gem)".to_string()),
            material_components: Some("Gem".to_string()),
            casting_time: Some("1 action".to_string()),
            duration: Some("1 round / 2 levels".to_string()),
            area: Some("20-foot radius".to_string()),
            saving_throw: Some("None".to_string()),
            reversible: Some(0),
            description: "Desc".to_string(),
            tags: Some("tag".to_string()),
            source: Some("Test".to_string()),
            edition: Some("2e".to_string()),
            author: Some("Me".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
            license: None,
            artifacts: None,
            ..Default::default()
        };

        let spell = CanonicalSpell::try_from(detail).unwrap();

        // Range
        let r = spell.range.unwrap();
        assert_eq!(r.kind, RangeKind::Distance);
        let dist = r.distance.unwrap();
        assert_eq!(dist.value.unwrap(), 10.0);
        assert_eq!(dist.per_level.unwrap(), 5.0);
        assert_eq!(r.unit, Some(RangeUnit::Yd));

        // Duration
        let d = spell.duration.unwrap();
        // "1 round / 2 levels" -> 0.5 round per level
        assert_eq!(d.duration.unwrap().per_level.unwrap(), 0.5);
        assert_eq!(d.unit, Some(DurationUnit::Round));

        // Area
        let a = spell.area.unwrap();
        assert_eq!(a.kind, AreaKind::RadiusCircle);
        assert_eq!(a.radius.unwrap().value.unwrap(), 20.0);
        assert_eq!(a.unit.unwrap(), AreaUnit::Ft);

        // Casting Time — "1 action" is a 5e unit; parser remaps to Special at parse time
        let ct = spell.casting_time.unwrap();
        assert_eq!(ct.base_value.unwrap_or(1.0), 1.0);
        assert_eq!(ct.unit, CastingTimeUnit::Special);
        assert_eq!(ct.raw_legacy_value.as_deref(), Some("1 action"));

        // Components
        let c = spell.components.unwrap();
        assert!(c.verbal);
        assert!(c.somatic);
        assert!(c.material);
    }

    #[test]
    fn test_parser_schema_compliance_deep_dive() {
        use crate::models::spell::SpellDetail;
        // Setup: A spell with complex area that needs parsing -> AreaSpec -> Validation
        let detail = SpellDetail {
            id: Some(999),
            name: "Deep Dive Area".to_string(),
            level: 3,
            school: Some("Evocation".to_string()),
            sphere: None,
            class_list: Some("Wizard".to_string()),
            range: Some("0".to_string()),
            components: Some("V".to_string()),
            material_components: None,
            casting_time: Some("1".to_string()),
            duration: Some("Instantaneous".to_string()),
            area: Some("20 ft. radius".to_string()), // Target of test
            saving_throw: Some("None".to_string()),
            reversible: Some(0),
            description: "Desc".to_string(),
            tags: None,
            source: Some("Test".to_string()),
            edition: Some("2e".to_string()),
            author: Some("Me".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
            license: None,
            artifacts: None,
            ..Default::default()
        };

        // 1. Conversion (Parser Logic)
        let canon = CanonicalSpell::try_from(detail).expect("Canonicalization should succeed");

        let area = canon.area.as_ref().expect("Area should be parsed");
        assert_eq!(area.kind, AreaKind::RadiusCircle);
        assert_eq!(area.radius.as_ref().unwrap().value, Some(20.0));
        assert_eq!(area.unit, Some(AreaUnit::Ft));

        // 2. Validation (Schema Logic)
        // This ensures the AreaSpec struct we built is actually valid against the JSON Schema
        let validation_res = canon.validate();
        assert!(
            validation_res.is_ok(),
            "CanonicalSpell with AreaSpec failed schema validation: {:?}",
            validation_res.err()
        );

        // 3. Round-trip hash check
        let hash = canon.compute_hash().expect("Hash computation failed");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_parser_cone_unit_bug() {
        use crate::models::canonical_spell::{AreaKind, AreaShapeUnit, AreaUnit};
        use crate::utils::spell_parser::SpellParser;
        let parser = SpellParser::new();

        // This should parse as Yards
        let spec = parser.parse_area("30 yard cone").unwrap();
        assert_eq!(spec.kind, AreaKind::Cone);
        assert_eq!(spec.unit, Some(AreaUnit::Yd));
        assert_eq!(spec.shape_unit, Some(AreaShapeUnit::Yd));
        assert_eq!(spec.length.unwrap().value, Some(30.0));
    }

    #[test]
    fn test_validation_explicit_duration_spec_success() {
        use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
        use crate::models::scalar::{ScalarMode, SpellScalar};

        let mut spell = CanonicalSpell::new(
            "Valid Duration Spec".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];

        spell.duration = Some(DurationSpec {
            kind: DurationKind::Time,
            unit: Some(DurationUnit::Round),
            duration: Some(SpellScalar {
                value: Some(1.0),
                mode: ScalarMode::Fixed,
                ..Default::default()
            }),
            ..Default::default()
        });

        let result = spell.validate();
        assert!(
            result.is_ok(),
            "Validation failed with explicit duration: {:?}",
            result.err()
        );
    }

    #[test]
    fn test_normalization_preserves_newlines() {
        let input = "Line 1\nLine 2 \n  Line 3";
        let output = normalize_string(input, NormalizationMode::Textual);
        assert_eq!(output, "Line 1\nLine 2\nLine 3");

        let input2 = "Line 1\r\nLine 2\n\nLine 3";
        let output2 = normalize_string(input2, NormalizationMode::Textual);
        // \r\n -> \n, and multiple empty lines are collapsed to a single \n separator (Rule 48)
        assert_eq!(output2, "Line 1\nLine 2\nLine 3");

        let input3 = "Line 1\n\n\nLine 2";
        let output3 = normalize_string(input3, NormalizationMode::Textual);
        assert_eq!(output3, "Line 1\nLine 2");
    }

    #[test]
    fn test_regression_inches_area_unit() {
        use crate::utils::spell_parser::SpellParser;
        let parser = SpellParser::new();
        let spec = parser.parse_area("10 inch radius").unwrap();
        assert_eq!(spec.kind, AreaKind::RadiusCircle);
        assert_eq!(spec.unit, Some(AreaUnit::Inch));
    }

    #[test]
    fn test_regression_line_width_optional() {
        let mut spell = CanonicalSpell::new("Line Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];

        // Line without width (new schema relaxation)
        spell.area = Some(AreaSpec {
            kind: AreaKind::Line,
            unit: Some(AreaUnit::Ft),
            shape_unit: Some(AreaShapeUnit::Ft),
            length: Some(SpellScalar::fixed(60.0)),
            ..Default::default()
        });

        assert!(
            spell.validate().is_ok(),
            "Line should be valid without width"
        );
    }

    #[test]
    fn test_unit_based_identity_distinction() {
        let mut spell_yd = CanonicalSpell::new("Dist".into(), 1, "ARCANE".into(), "D".into());
        spell_yd.school = Some("Evocation".into());
        spell_yd.class_list = vec!["Wizard".into()];
        spell_yd.range = Some(RangeSpec {
            kind: RangeKind::Distance,
            unit: Some(RangeUnit::Yd),
            distance: Some(SpellScalar::fixed(1.0)),
            ..Default::default()
        });

        let mut spell_ft = spell_yd.clone();
        spell_ft.range.as_mut().unwrap().unit = Some(RangeUnit::Ft);
        spell_ft.range.as_mut().unwrap().distance = Some(SpellScalar::fixed(3.0));

        let hash_yd = spell_yd.compute_hash().unwrap();
        let hash_ft = spell_ft.compute_hash().unwrap();

        assert_ne!(
            hash_yd, hash_ft,
            "1 yard and 3 feet must produce different hashes (unit preservation)"
        );
    }

    #[test]
    fn test_hash_stability_reordered_lists() {
        let mut spell1 = CanonicalSpell::new(
            "Test Spell".to_string(),
            3,
            "Arcane".to_string(),
            "A test spell.".to_string(),
        );
        spell1.school = Some("Abjuration".to_string());
        spell1.class_list = vec!["Wizard".to_string(), "Cleric".to_string()];
        spell1.tags = vec!["combat".to_string(), "utility".to_string()];

        let mut spell2 = spell1.clone();
        spell2.class_list = vec!["Cleric".to_string(), "Wizard".to_string()];
        spell2.tags = vec!["utility".to_string(), "combat".to_string()];

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Reordered string lists should result in same hash"
        );
    }

    #[test]
    fn test_hash_stability_reordered_mechanics() {
        let mut spell1 = CanonicalSpell::new(
            "Nuke".to_string(),
            5,
            "Arcane".to_string(),
            "Big boom.".to_string(),
        );
        spell1.school = Some("Evocation".to_string());
        spell1.class_list = vec!["Wizard".to_string()];

        // Damage parts reordered
        use crate::models::damage::{DamagePart, DamageType, DicePool, DiceTerm, SpellDamageSpec};

        let part_a = DamagePart {
            id: "a".to_string(),
            damage_type: DamageType::Fire,
            base: DicePool {
                terms: vec![DiceTerm {
                    count: 10,
                    sides: 6,
                    per_die_modifier: 0,
                }],
                flat_modifier: 0,
            },
            ..Default::default()
        };
        let part_b = DamagePart {
            id: "b".to_string(),
            damage_type: DamageType::Cold,
            base: DicePool {
                terms: vec![DiceTerm {
                    count: 5,
                    sides: 4,
                    per_die_modifier: 0,
                }],
                flat_modifier: 0,
            },
            ..Default::default()
        };

        spell1.damage = Some(SpellDamageSpec {
            kind: crate::models::damage::DamageKind::Modeled,
            parts: Some(vec![part_a.clone(), part_b.clone()]),
            ..Default::default()
        });

        let mut spell2 = spell1.clone();
        spell2.damage.as_mut().unwrap().kind = crate::models::damage::DamageKind::Modeled;
        spell2.damage.as_mut().unwrap().parts = Some(vec![part_b, part_a]);

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Reordered damage parts should result in same hash"
        );
    }

    #[test]
    fn test_default_value_materialization() {
        let mut spell = CanonicalSpell::new(
            "Default Test".to_string(),
            1,
            "Arcane".to_string(),
            "Test.".to_string(),
        );

        // Initially None
        spell.reversible = None;
        spell.material_components = None;

        let json = spell.to_canonical_json().unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Should be PRUNED in JSON if it equals default (Lean Hashing)
        assert!(value.get("reversible").is_none());
        assert!(value.get("material_components").is_none());
    }

    #[test]
    fn test_metadata_pruning_preserves_mechanical_ids() {
        let mut spell = CanonicalSpell::new(
            "ID Test".to_string(),
            1,
            "Arcane".to_string(),
            "Test.".to_string(),
        );
        spell.id = Some("root_id".to_string());

        use crate::models::damage::{DamagePart, DamageType, DicePool, DiceTerm, SpellDamageSpec};
        spell.damage = Some(SpellDamageSpec {
            parts: Some(vec![DamagePart {
                id: "nested_id".to_string(),
                damage_type: DamageType::Acid,
                base: DicePool {
                    terms: vec![DiceTerm {
                        count: 1,
                        sides: 4,
                        per_die_modifier: 0,
                    }],
                    flat_modifier: 0,
                },
                ..Default::default()
            }]),
            ..Default::default()
        });

        let json = spell.to_canonical_json().unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Root ID should be gone
        assert!(value.get("id").is_none(), "Root ID should be pruned");

        // Nested mechanical ID should be preserved
        let nested_id = value["damage"]["parts"][0]["id"].as_str().unwrap();
        assert_eq!(
            nested_id, "nested_id",
            "Nested mechanical ID should be preserved"
        );
    }

    #[test]
    fn test_id_normalization_regression() {
        use crate::models::damage::{DamagePart, DamageType, DicePool, DiceTerm, SpellDamageSpec};
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec, SingleSave};

        let mut spell =
            CanonicalSpell::new("ID Normalization".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];

        // 1. DamagePart.id
        spell.damage = Some(SpellDamageSpec {
            parts: Some(vec![DamagePart {
                id: "  Part ID  ".to_string(),
                damage_type: DamageType::Fire,
                base: DicePool {
                    terms: vec![DiceTerm {
                        count: 1,
                        sides: 6,
                        per_die_modifier: 0,
                    }],
                    flat_modifier: 0,
                },
                ..Default::default()
            }]),
            ..Default::default()
        });

        // 2. SingleSave.id
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            single: Some(SingleSave {
                id: Some("  Save ID  ".to_string()),
                save_type: crate::models::saving_throw::SaveType::Spell,
                ..Default::default()
            }),
            ..Default::default()
        });

        spell.normalize(None);

        assert_eq!(
            spell.damage.as_ref().unwrap().parts.as_ref().unwrap()[0].id,
            "part id"
        );
        assert_eq!(
            spell
                .saving_throw
                .as_ref()
                .unwrap()
                .single
                .as_ref()
                .unwrap()
                .id
                .as_ref()
                .unwrap(),
            "save id"
        );
    }

    #[test]
    fn test_range_text_normalization_regression() {
        let mut spell = CanonicalSpell::new("Range Text".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Evocation".into());
        spell.class_list = vec!["Wizard".into()];
        spell.range = Some(RangeSpec {
            kind: RangeKind::Distance,
            text: Some("  60   FT.  ".to_string()),
            unit: Some(RangeUnit::Ft),
            distance: Some(crate::models::scalar::SpellScalar::fixed(60.0)),
            ..Default::default()
        });

        spell.normalize(None);

        // Structured (preserve case) + word-boundary unit alias (ft. -> ft when lowercase)
        assert_eq!(
            spell.range.as_ref().unwrap().text.as_ref().unwrap(),
            "60 FT.",
            "range text: collapse whitespace, preserve case; unit alias only matches lowercase"
        );
    }

    #[test]
    fn test_range_parser_populates_text_regression() {
        use crate::utils::parsers::range::RangeParser;
        let parser = RangeParser::new();

        let inputs = vec!["60 ft.", "Touch", "Sight (LOS)", "Special Notes"];
        for input in inputs {
            let res = parser.parse(input);
            assert_eq!(res.text.unwrap(), input);
        }
    }

    /// Task 0.1.4 (TG1): migrate_to_v2() applies both dm_guidance → notes and 5e unit → Special in one call.
    #[test]
    fn test_migrate_v1_to_v2() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let mut spell =
            CanonicalSpell::new("Migration Test".into(), 1, "ARCANE".into(), "Desc".into());
        spell.schema_version = 1;

        // 1. Saving Throw with legacy_dm_guidance
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            legacy_dm_guidance: Some("Legacy Guidance".into()),
            notes: Some("Original Notes".into()),
            ..Default::default()
        });

        // 2. Casting Time with 5e unit
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::Action,
            text: "1 action".into(),
            ..Default::default()
        });

        spell.normalize(None); // Should trigger migrate_to_v2

        assert_eq!(spell.schema_version, 2);

        let st = spell.saving_throw.as_ref().unwrap();
        assert!(st.legacy_dm_guidance.is_none());
        assert_eq!(
            st.notes.as_ref().unwrap(),
            "Original Notes\nLegacy Guidance"
        );

        let ct = spell.casting_time.as_ref().unwrap();
        assert_eq!(ct.unit, CastingTimeUnit::Special);
        assert_eq!(ct.raw_legacy_value.as_ref().unwrap(), "1 action");
    }

    /// Task 0.1.4 (TG1): notes_truncated flag is set when merged notes exceed SAVING_THROW_NOTES_MAX_CHARS.
    #[test]
    fn test_migrate_v1_to_v2_notes_truncation_flag() {
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let mut spell = CanonicalSpell::new(
            "Migration Truncate".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.schema_version = 1;
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            notes: Some("a".repeat(2047)),
            legacy_dm_guidance: Some("bc".to_string()),
            ..Default::default()
        });

        let res = spell.normalize(None);
        assert!(res.notes_truncated, "truncation flag should be set");
        assert_eq!(spell.schema_version, 2);
        let notes_len = spell
            .saving_throw
            .as_ref()
            .and_then(|st| st.notes.as_ref())
            .map(|s| s.chars().count())
            .unwrap_or_default();
        assert!(notes_len <= SAVING_THROW_NOTES_MAX_CHARS);
    }

    /// Task 0.1.4 (TG1): compute_hash() and to_canonical_json() return Err when notes are truncated during migration.
    #[test]
    fn test_compute_hash_and_canonical_json_error_when_notes_truncated() {
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let mut spell = CanonicalSpell::new(
            "Migration Truncate Error".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.schema_version = 1;
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            notes: Some("a".repeat(2047)),
            legacy_dm_guidance: Some("bc".to_string()),
            ..Default::default()
        });

        let hash_err = spell
            .compute_hash()
            .expect_err("compute_hash() must fail when migration truncates notes");
        assert!(
            hash_err.contains("truncated"),
            "error should mention truncation; got: {hash_err}"
        );

        let json_err = spell
            .to_canonical_json()
            .expect_err("to_canonical_json() must fail when migration truncates notes");
        assert!(
            json_err.contains("truncated"),
            "error should mention truncation; got: {json_err}"
        );
    }

    /// Task 0.1.4 (TG1): when casting_time.text is empty, raw_legacy_value is synthesized from base_value + unit.
    #[test]
    fn test_migrate_v1_to_v2_casting_time_empty_text_synthesizes_raw() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};

        let mut spell = CanonicalSpell::new(
            "Migration Cast Empty".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.schema_version = 1;
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::Action,
            text: "   ".into(),
            base_value: Some(0.0),
            ..Default::default()
        });

        let _ = spell.normalize(None);
        let ct = spell.casting_time.as_ref().unwrap();
        assert_eq!(ct.unit, CastingTimeUnit::Special);
        assert_eq!(ct.raw_legacy_value.as_deref(), Some("0 action"));
    }

    /// Task 0.1.4 (TG1): when raw_legacy_value is already set on a 5e unit, it is preserved unchanged.
    #[test]
    fn test_migrate_v1_to_v2_casting_time_preserves_existing_raw() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};

        let mut spell = CanonicalSpell::new(
            "Migration Cast Preserve".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.schema_version = 1;
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::Reaction,
            text: "1 reaction".into(),
            raw_legacy_value: Some("keep me".into()),
            ..Default::default()
        });

        let _ = spell.normalize(None);
        let ct = spell.casting_time.as_ref().unwrap();
        assert_eq!(ct.unit, CastingTimeUnit::Special);
        assert_eq!(ct.raw_legacy_value.as_deref(), Some("keep me"));
    }

    /// Task 0.1 (TG2): schema_version = 0 is treated as pre-v2 and migrated to v2 via migrate_to_v2().
    #[test]
    fn test_migrate_v1_to_v2_schema_version_zero_to_two() {
        let mut spell =
            CanonicalSpell::new("Migration V0".into(), 1, "ARCANE".into(), "Desc".into());
        spell.schema_version = 0;

        let _ = spell.normalize(None);
        assert_eq!(spell.schema_version, 2);
    }

    #[test]
    fn test_missing_schema_version_defaults_to_min_supported_before_normalize() {
        let payload = serde_json::json!({
            "name": "Missing Schema Version",
            "tradition": "ARCANE",
            "level": 1,
            "description": "Desc",
            "school": "Abjuration"
        });

        let mut spell: CanonicalSpell =
            serde_json::from_value(payload).expect("deserialize spell without schema_version");

        assert_eq!(spell.schema_version, MIN_SUPPORTED_SCHEMA_VERSION);

        let _ = spell.normalize(None);
        assert_eq!(spell.schema_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_migrate_v1_to_v2_passthrough_for_v2_and_newer() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};

        let mut spell = CanonicalSpell::new(
            "Migration Passthrough".into(),
            1,
            "ARCANE".into(),
            "Desc".into(),
        );
        spell.schema_version = 2;
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::Round,
            text: "1 round".into(),
            ..Default::default()
        });

        let res = spell.normalize(None);
        assert!(!res.notes_truncated);
        assert_eq!(res.truncated_spell_id, None);
        assert_eq!(spell.schema_version, 2);
        assert_eq!(
            spell.casting_time.as_ref().unwrap().unit,
            CastingTimeUnit::Round
        );
    }

    /// Priority D (TG5): Future schema_version (e.g. 3) is passed through without migration.
    #[test]
    fn test_migrate_v1_to_v2_passthrough_future_schema_version() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};

        let mut spell =
            CanonicalSpell::new("Future Version".into(), 1, "ARCANE".into(), "Desc".into());
        spell.schema_version = 3;
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::Round,
            text: "1 round".into(),
            ..Default::default()
        });

        let res = spell.normalize(None);
        assert!(!res.notes_truncated);
        assert_eq!(res.truncated_spell_id, None);
        assert_eq!(
            spell.schema_version, 3,
            "future schema_version must be preserved"
        );
        assert_eq!(
            spell.casting_time.as_ref().unwrap().unit,
            CastingTimeUnit::Round,
            "casting time must be unchanged when schema_version >= CURRENT"
        );
    }

    /// Priority D (TG4): Migration step (1) and step (2) both applied in one normalize() call.
    #[test]
    fn test_migrate_v1_to_v2_step_ordering_both_steps_in_single_normalize() {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let mut spell = CanonicalSpell::new("Step Order".into(), 1, "ARCANE".into(), "Desc".into());
        spell.schema_version = 1;
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            legacy_dm_guidance: Some("DM says be careful.".into()),
            notes: Some("Existing.".into()),
            ..Default::default()
        });
        spell.casting_time = Some(SpellCastingTime {
            unit: CastingTimeUnit::BonusAction,
            text: "1 bonus action".into(),
            ..Default::default()
        });

        let _ = spell.normalize(None);

        assert_eq!(spell.schema_version, 2);
        // Step 1: dm_guidance moved to notes
        let notes = spell
            .saving_throw
            .as_ref()
            .and_then(|st| st.notes.as_ref())
            .unwrap();
        assert!(notes.contains("Existing."));
        assert!(notes.contains("DM says be careful."));
        assert!(spell
            .saving_throw
            .as_ref()
            .unwrap()
            .legacy_dm_guidance
            .is_none());
        // Step 2: 5e unit remapped to Special, raw preserved
        let ct = spell.casting_time.as_ref().unwrap();
        assert_eq!(ct.unit, CastingTimeUnit::Special);
        assert_eq!(ct.raw_legacy_value.as_deref(), Some("1 bonus action"));
    }

    /// Priority C (Task 0.1.3, TG3): Spell-level failure does not abort successful updates; other spells are still written.
    #[test]
    fn test_migration_batch_spell_level_failure_does_not_abort(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let db = setup_migration_db()?;

        let good = {
            let mut s = CanonicalSpell::new("Good".into(), 1, "ARCANE".into(), "Desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            serde_json::to_string(&s)?
        };
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Good", good],
        )?;
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Bad", "{ invalid json "],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |_, _| {})?;
        tx.commit()?;

        assert_eq!(result.total, 2);
        assert_eq!(result.migrated, 1);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0].error.contains("Deserialization error"));

        let schema_v2: i64 = conn.query_row(
            "SELECT schema_version FROM spell WHERE name = 'Good'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(
            schema_v2, 2,
            "Successful spell must be updated to schema_version 2"
        );

        let has_hash: i64 = conn.query_row(
            "SELECT COUNT(*) FROM spell WHERE name = 'Good' AND content_hash IS NOT NULL",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(has_hash, 1, "Successful spell must have content_hash set");

        Ok(())
    }

    /// Priority C (Task 0.1.3, TG3): DB-level failure (UNIQUE constraint on content_hash) triggers rollback; no rows updated.
    #[test]
    fn test_migration_batch_db_failure_rollback() -> Result<(), Box<dyn std::error::Error>> {
        let db = setup_migration_db_with_unique_hash()?;

        let same_canonical = {
            let mut s = CanonicalSpell::new("Same".into(), 1, "ARCANE".into(), "Same desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            serde_json::to_string(&s)?
        };
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Spell A", same_canonical],
        )?;
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Spell B", same_canonical],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let run_result = run_migration_batch_impl(&tx, &mut |_, _| {});
        assert!(
            run_result.is_err(),
            "run_migration_batch_impl must fail when two spells produce same content_hash (UNIQUE on second UPDATE)"
        );
        drop(tx);

        let with_hash: i64 = conn.query_row(
            "SELECT COUNT(*) FROM spell WHERE content_hash IS NOT NULL",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(
            with_hash, 0,
            "After failed batch (no commit), transaction rolls back; no rows should have content_hash set"
        );

        Ok(())
    }

    /// Priority D (Task 0.1, TG6): progress callback must still emit when a spell hits an inner failure path.
    #[test]
    fn test_migration_batch_progress_emitted_on_truncation_failure(
    ) -> Result<(), Box<dyn std::error::Error>> {
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let db = setup_migration_db()?;

        let mut spell = CanonicalSpell::new("Truncate".into(), 1, "ARCANE".into(), "Desc".into());
        spell.schema_version = 1;
        spell.saving_throw = Some(SavingThrowSpec {
            kind: SavingThrowKind::Single,
            notes: Some("a".repeat(2047)),
            legacy_dm_guidance: Some("bc".to_string()),
            ..Default::default()
        });

        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Truncate", serde_json::to_string(&spell)?],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let mut progress_events = Vec::new();
        let result = run_migration_batch_impl(&tx, &mut |current, total| {
            progress_events.push((current, total));
        })?;

        assert_eq!(result.total, 1);
        assert_eq!(result.migrated, 0);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(
            progress_events,
            vec![(1, 1)],
            "progress callback should emit final progress even on truncation failure"
        );

        Ok(())
    }

    /// Priority D (Task 0.1, TG6): progress callback is invoked on a successful batch when there are
    /// at least PROGRESS_BATCH_SIZE spells (same callback site as truncation/deserialization paths).
    #[test]
    fn test_migration_batch_progress_emitted_on_success() -> Result<(), Box<dyn std::error::Error>>
    {
        const PROGRESS_BATCH_SIZE: usize = 50;
        let db = setup_migration_db()?;

        let v1_spell = {
            let mut s = CanonicalSpell::new("P".into(), 1, "ARCANE".into(), "Desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            serde_json::to_string(&s)?
        };
        for i in 0..PROGRESS_BATCH_SIZE {
            db.execute(
                "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
                params![format!("Spell {}", i), v1_spell],
            )?;
        }

        let mut conn = db;
        let tx = conn.transaction()?;
        let mut progress_events = Vec::new();
        let result = run_migration_batch_impl(&tx, &mut |current, total| {
            progress_events.push((current, total));
        })?;
        tx.commit()?;

        assert_eq!(result.total, PROGRESS_BATCH_SIZE as u32);
        assert_eq!(result.migrated, PROGRESS_BATCH_SIZE as u32);
        assert!(
            !progress_events.is_empty(),
            "progress callback must be invoked at least once when batch size >= PROGRESS_BATCH_SIZE"
        );

        Ok(())
    }

    /// Task 0 Unit 2(a) (Task 0.1.3, TG3): After bulk migration, content_hash is computed from v2 canonical JSON
    /// (including raw_legacy_value). Running migration on a v1 spell updates the row's content_hash
    /// and the hash matches a recomputed v2 hash.
    #[test]
    fn test_migration_batch_content_hash_is_v2_canonical() -> Result<(), Box<dyn std::error::Error>>
    {
        let db = setup_migration_db()?;

        let v1_spell = {
            let mut s = CanonicalSpell::new("Hash Check".into(), 1, "ARCANE".into(), "Desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            serde_json::to_string(&s)?
        };
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Hash Check", v1_spell],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |_, _| {})?;
        tx.commit()?;

        assert_eq!(result.total, 1);
        assert_eq!(result.migrated, 1, "spell must be migrated");

        let (content_hash, canonical_data): (String, String) = conn.query_row(
            "SELECT content_hash, canonical_data FROM spell WHERE name = 'Hash Check'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let spell: CanonicalSpell = serde_json::from_str(&canonical_data)?;
        let recomputed = spell
            .compute_hash()
            .expect("recompute hash from migrated spell");
        assert_eq!(
            content_hash, recomputed,
            "stored content_hash must match recomputed v2 canonical hash"
        );

        Ok(())
    }

    /// Task 0 Unit 2(b) (Task 0.1.3/0.1.4, TG3): 5e unit remapping. A spell with casting_time.unit = action
    /// (or bonus_action, reaction) is remapped to special and raw_legacy_value is set. The DB row
    /// after migration has unit "special", raw_legacy_value populated, and the stored content_hash
    /// equals the recomputed v2 canonical hash (verifying raw_legacy_value is included in hash).
    #[test]
    fn test_migration_batch_5e_unit_remapping_in_db() -> Result<(), Box<dyn std::error::Error>> {
        use crate::models::canonical_spell::{CastingTimeUnit, SpellCastingTime};

        let db = setup_migration_db()?;

        let v1_spell = {
            let mut s =
                CanonicalSpell::new("Action Spell".into(), 1, "ARCANE".into(), "Desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            s.casting_time = Some(SpellCastingTime {
                unit: CastingTimeUnit::Action,
                text: "1 action".into(),
                ..Default::default()
            });
            serde_json::to_string(&s)?
        };
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["Action Spell", v1_spell],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |_, _| {})?;
        tx.commit()?;

        assert_eq!(result.migrated, 1);

        let canonical_data: String = conn.query_row(
            "SELECT canonical_data FROM spell WHERE name = 'Action Spell'",
            [],
            |r| r.get(0),
        )?;
        let spell: CanonicalSpell = serde_json::from_str(&canonical_data)?;
        let ct = spell
            .casting_time
            .as_ref()
            .expect("casting_time must be present");
        assert_eq!(
            ct.unit,
            CastingTimeUnit::Special,
            "5e unit must be remapped to Special in DB row"
        );
        assert!(
            ct.raw_legacy_value.is_some(),
            "raw_legacy_value must be populated after migration"
        );
        assert_eq!(
            ct.raw_legacy_value.as_deref(),
            Some("1 action"),
            "raw_legacy_value must preserve original text"
        );

        // Task 0.1.3: verify stored content_hash equals recomputed v2 hash (raw_legacy_value included).
        let content_hash: String = conn.query_row(
            "SELECT content_hash FROM spell WHERE name = 'Action Spell'",
            [],
            |r| r.get(0),
        )?;
        let recomputed = spell
            .compute_hash()
            .expect("recompute hash from migrated spell");
        assert_eq!(
            content_hash, recomputed,
            "stored content_hash must match recomputed v2 canonical hash (raw_legacy_value included)"
        );

        Ok(())
    }

    /// Task 0 Unit 2(c) (Task 0.1.4, TG1): dm_guidance cleanup. A spell with SavingThrowSpec.dm_guidance
    /// populated has content moved to notes and dm_guidance cleared (not serialized). After migration
    /// canonical_data has no dm_guidance and notes contains the migrated content.
    #[test]
    fn test_migration_batch_dm_guidance_cleanup_in_db() -> Result<(), Box<dyn std::error::Error>> {
        use crate::models::saving_throw::{SavingThrowKind, SavingThrowSpec};

        let db = setup_migration_db()?;

        // Build v1 spell JSON that includes dm_guidance. legacy_dm_guidance is skip_serializing
        // in SavingThrowSpec, so we must inject "dm_guidance" into the JSON for the migration
        // to see it and move it to notes.
        let v1_spell = {
            let mut s = CanonicalSpell::new(
                "DM Guidance Spell".into(),
                1,
                "ARCANE".into(),
                "Desc".into(),
            );
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 1;
            s.saving_throw = Some(SavingThrowSpec {
                kind: SavingThrowKind::Single,
                legacy_dm_guidance: Some("DM adjudicates this.".into()),
                notes: None,
                ..Default::default()
            });
            let mut value = serde_json::to_value(&s)?;
            value["saving_throw"]["dm_guidance"] = serde_json::json!("DM adjudicates this.");
            serde_json::to_string(&value)?
        };
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version) VALUES (?1, ?2, 1)",
            params!["DM Guidance Spell", v1_spell],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |_, _| {})?;
        tx.commit()?;

        assert_eq!(result.migrated, 1);

        let canonical_data: String = conn.query_row(
            "SELECT canonical_data FROM spell WHERE name = 'DM Guidance Spell'",
            [],
            |r| r.get(0),
        )?;
        assert!(
            !canonical_data.contains("\"dm_guidance\""),
            "canonical_data must not contain dm_guidance after migration"
        );
        let spell: CanonicalSpell = serde_json::from_str(&canonical_data)?;
        let st = spell
            .saving_throw
            .as_ref()
            .expect("saving_throw must be present");
        assert!(
            st.legacy_dm_guidance.is_none(),
            "dm_guidance must be cleared in canonical_data after migration"
        );
        assert!(
            st.notes
                .as_ref()
                .map_or(false, |n| n.contains("DM adjudicates this.")),
            "notes must contain the migrated dm_guidance content"
        );

        Ok(())
    }

    /// Task 0.1.3 (robustness, TG3): A v2 spell row whose content_hash is NULL (e.g. from a partial
    /// prior run or manual edit) must be backfilled by run_migration_batch_impl.
    /// It must NOT be silently skipped; after migration content_hash must be non-NULL and valid.
    #[test]
    fn test_migration_batch_v2_null_hash_is_backfilled() -> Result<(), Box<dyn std::error::Error>> {
        let db = setup_migration_db()?;

        let v2_spell = {
            let mut s = CanonicalSpell::new("V2 No Hash".into(), 1, "ARCANE".into(), "Desc".into());
            s.school = Some("Evocation".into());
            s.class_list = vec!["Wizard".into()];
            s.schema_version = 2;
            serde_json::to_string(&s)?
        };
        // Insert with schema_version = 2 but NULL content_hash (partial prior run scenario).
        db.execute(
            "INSERT INTO spell (name, canonical_data, schema_version, content_hash) VALUES (?1, ?2, 2, NULL)",
            params!["V2 No Hash", v2_spell],
        )?;

        let mut conn = db;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |_, _| {})?;
        tx.commit()?;

        assert_eq!(result.total, 1);
        assert_eq!(
            result.migrated, 1,
            "v2 spell with NULL content_hash must be backfilled (counted as migrated)"
        );
        assert_eq!(
            result.skipped, 0,
            "spell with NULL content_hash must not be skipped even if schema_version = 2"
        );

        let (content_hash, canonical_data): (String, String) = conn.query_row(
            "SELECT content_hash, canonical_data FROM spell WHERE name = 'V2 No Hash'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        assert!(
            !content_hash.is_empty(),
            "content_hash must be non-empty after backfill"
        );

        let spell: CanonicalSpell = serde_json::from_str(&canonical_data)?;
        let recomputed = spell
            .compute_hash()
            .expect("recompute hash from backfilled spell");
        assert_eq!(
            content_hash, recomputed,
            "stored content_hash must match recomputed v2 canonical hash"
        );

        Ok(())
    }
}

/// Progress callback is invoked every this many spells and on the final spell.
/// Progress is emitted every N spells so the frontend can throttle if needed (e.g. avoid
/// excessive window events for large libraries).
const PROGRESS_BATCH_SIZE: usize = 50;

/// Maximum number of characters allowed in `saving_throw.notes` after merging `legacy_dm_guidance`.
/// Exceeding this limit during v1→v2 migration sets `MigrateV2Result::notes_truncated`.
pub(crate) const SAVING_THROW_NOTES_MAX_CHARS: usize = 2048;

/// One spell row update produced by the migration: id, canonical_data JSON, content_hash, schema_version.
/// `updated_at` is set at apply time.
struct MigrationUpdate {
    id: i64,
    canonical_data: String,
    content_hash: String,
    schema_version: i64,
}

/// Collects all migration updates by scanning spell rows, normalizing/validating/hashing each
/// that needs v1→v2 migration or has NULL content_hash. Returns updates to apply and the
/// MigrationResult (total, migrated, skipped, failed). Emits progress every PROGRESS_BATCH_SIZE spells.
fn collect_migration_updates(
    tx: &rusqlite::Transaction<'_>,
    progress: &mut impl FnMut(u32, u32),
) -> Result<(Vec<MigrationUpdate>, MigrationResult), AppError> {
    let mut result = MigrationResult::default();
    let mut updates = Vec::new();

    // Fetch content_hash alongside canonical_data so we can detect v2 rows
    // whose content_hash was never populated (e.g. partial prior run or manual edit).
    let mut stmt = tx.prepare("SELECT id, name, canonical_data, content_hash FROM spell")?;
    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let data: String = row.get(2)?;
            let hash_db: Option<String> = row.get(3)?;
            Ok((id, name, data, hash_db))
        })?
        .collect::<Vec<_>>();

    result.total = rows.len() as u32;

    for (i, row) in rows.into_iter().enumerate() {
        let (db_id, name, data, hash_db) = row?;
        match serde_json::from_str::<CanonicalSpell>(&data) {
            Ok(mut spell) => {
                // Process rows that need v1→v2 migration OR rows that are already v2
                // but still have a NULL content_hash (e.g. from a partial prior run).
                if spell.schema_version < 2 || hash_db.is_none() {
                    let res = spell.normalize(Some(db_id));
                    if res.notes_truncated {
                        result.failed.push(MigrationFailure {
                            spell_id: db_id,
                            spell_name: Some(name.clone()),
                            error: format!(
                                "Saving throw notes truncated during migration (exceeded {} characters)",
                                SAVING_THROW_NOTES_MAX_CHARS
                            ),
                        });
                    } else {
                        // Spell already normalized above; use pre-normalized path to avoid
                        // double normalization (compute_hash would clone and normalize again).
                        match spell.validate() {
                            Ok(()) => match spell.to_canonical_json_pre_normalized() {
                                Ok(canonical_json) => {
                                    let hash =
                                        hex::encode(Sha256::digest(canonical_json.as_bytes()));
                                    spell.id = Some(hash.clone());
                                    match serde_json::to_string(&spell) {
                                        Ok(json) => {
                                            updates.push(MigrationUpdate {
                                                id: db_id,
                                                canonical_data: json,
                                                content_hash: hash,
                                                schema_version: spell.schema_version,
                                            });
                                            result.migrated += 1;
                                        }
                                        Err(e) => {
                                            result.failed.push(MigrationFailure {
                                                spell_id: db_id,
                                                spell_name: Some(name.clone()),
                                                error: format!(
                                                    "Could not serialize spell after migration: {}",
                                                    e
                                                ),
                                            });
                                        }
                                    }
                                }
                                Err(e) => {
                                    result.failed.push(MigrationFailure {
                                        spell_id: db_id,
                                        spell_name: Some(name.clone()),
                                        error: format!(
                                            "Could not compute canonical form for hashing: {}",
                                            e
                                        ),
                                    });
                                }
                            },
                            Err(e) => {
                                result.failed.push(MigrationFailure {
                                    spell_id: db_id,
                                    spell_name: Some(name.clone()),
                                    error: format!("Validation error: {}", e),
                                });
                            }
                        }
                    }
                } else {
                    result.skipped += 1;
                }
            }
            Err(e) => {
                result.failed.push(MigrationFailure {
                    spell_id: db_id,
                    spell_name: Some(name),
                    error: format!("Deserialization error: {}", e),
                });
            }
        }

        if (i + 1) % PROGRESS_BATCH_SIZE == 0 || (i + 1) == result.total as usize {
            progress((i + 1) as u32, result.total);
        }
    }

    Ok((updates, result))
}

/// Applies collected migration updates in the same transaction. All-or-nothing; on error
/// the transaction is left uncommitted so the caller can roll back.
fn apply_migration_updates(
    tx: &rusqlite::Transaction<'_>,
    updates: &[MigrationUpdate],
) -> Result<(), AppError> {
    let mut update_stmt = tx.prepare(
        "UPDATE spell SET canonical_data = ?, content_hash = ?, schema_version = ?, updated_at = ? WHERE id = ?",
    )?;

    for u in updates {
        update_stmt.execute(params![
            u.canonical_data,
            u.content_hash,
            u.schema_version,
            Utc::now().to_rfc3339(),
            u.id
        ])?;
    }

    Ok(())
}

/// Core migration batch logic over a transaction. Used by the Tauri command and by tests.
/// This bulk migration is a hard prerequisite for hash-based features; see `migrate_all_spells_to_v2`.
pub(crate) fn run_migration_batch_impl(
    tx: &rusqlite::Transaction<'_>,
    progress: &mut impl FnMut(u32, u32),
) -> Result<MigrationResult, AppError> {
    let (updates, result) = collect_migration_updates(tx, progress)?;
    apply_migration_updates(tx, &updates)?;
    Ok(result)
}

/// Bulk migration of all spells to schema version 2 (v2), populating `content_hash` for every spell.
/// This migration must be run **before** any hash-based features are used. The application or
/// operator is responsible for running it; there is no runtime guard.
/// Hash-based features include: Migration 0015 (spell_content_hash backfill on
/// `character_class_spell` and `artifact`), hash-based import/export, and any code that relies on
/// `spell.content_hash` being non-NULL and v2-compliant for all spell rows.
/// See `docs/SCHEMA_VERSIONING.md` for when and how to run the migration.
#[tauri::command]
pub async fn migrate_all_spells_to_v2(
    window: Window,
    state: State<'_, Arc<Pool>>,
) -> Result<MigrationResult, AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let result = run_migration_batch_impl(&tx, &mut |current, total| {
            let _ = window.emit(
                "migration-progress",
                serde_json::json!({ "current": current, "total": total }),
            );
        })?;
        tx.commit()?;
        Ok::<MigrationResult, AppError>(result)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}
