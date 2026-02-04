use serde::{Deserialize, Serialize};
use serde_json_canonicalizer::to_string as to_jcs_string;
use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

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
use std::fmt::Write as FmtWrite;

pub const CURRENT_SCHEMA_VERSION: i64 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellComponents {
    pub verbal: bool,
    pub somatic: bool,
    pub material: bool,
    pub focus: bool,
    pub divine_focus: bool,
    pub experience: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellCastingTime {
    pub text: String,
    pub unit: String,
    #[serde(default = "default_one")]
    pub base_value: f64,
    #[serde(default)]
    pub per_level: f64,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
}

impl Default for SpellCastingTime {
    fn default() -> Self {
        Self {
            text: String::new(),
            unit: String::new(),
            base_value: 1.0,
            per_level: 0.0,
            level_divisor: 1.0,
        }
    }
}

impl SpellCastingTime {
    pub fn normalize(&mut self) {
        if self.unit.is_empty() {
            self.unit = "Segment".to_string();
        }
        self.text = normalize_string(&self.text, NormalizationMode::Textual);
        self.unit = match_schema_case(&self.unit);
        self.base_value = clamp_precision(self.base_value);
        self.per_level = clamp_precision(self.per_level);
        self.level_divisor = clamp_precision(self.level_divisor);
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellDamage {
    pub text: String,
    #[serde(default = "default_zero_string")]
    pub base_dice: String,
    #[serde(default = "default_zero_string")]
    pub per_level_dice: String,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SourceRef {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub book: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<serde_json::Value>, // Can be string or int
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

fn default_one() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CanonicalSpell {
    #[serde(skip_serializing_if = "Option::is_none")]
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
    pub class_list: Vec<String>,
    pub level: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<RangeSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub components: Option<SpellComponents>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_components: Option<Vec<MaterialComponentSpec>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub casting_time: Option<SpellCastingTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<DurationSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub area: Option<AreaSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<SpellDamageSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub magic_resistance: Option<MagicResistanceSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saving_throw: Option<SavingThrowSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub experience_cost: Option<ExperienceComponentSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reversible: Option<i64>, // 0 or 1
    pub description: String,
    pub tags: Vec<String>,

    // Metadata - Skipped when hashing to canonical JSON, but kept for database/export
    #[serde(default)]
    pub source_refs: Vec<SourceRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,

    pub is_quest_spell: i64, // 0 or 1
    pub is_cantrip: i64,     // 0 or 1

    #[serde(default = "default_schema_version")]
    pub schema_version: i64,

    // Temporal Metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
fn default_schema_version() -> i64 {
    1
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
            is_quest_spell: 0,
            is_cantrip: (level == 0) as i64,
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: None,
            updated_at: None,
            artifacts: None,
        }
    }

    pub fn to_canonical_json(&self) -> Result<String, String> {
        let mut clone = self.clone();
        // Heavy Normalization (includes sorting/deduplication of arrays and materialization of defaults)
        clone.normalize();

        let mut value = serde_json::to_value(&clone).map_err(|err| err.to_string())?;

        // Recursive Metadata Exclusion: Excludes strictly non-content fields like source_refs,
        // artifacts, edition, etc., while preserving nested mechanical IDs like those in
        // DamagePart or SingleSave.
        prune_metadata_recursive(&mut value, true);

        to_jcs_string(&value).map_err(|err| err.to_string())
    }
}

/// Recursively removes metadata fields from a JSON value.
/// `is_root` specifies if we are at the top-level of the spell object.
fn prune_metadata_recursive(value: &mut serde_json::Value, is_root: bool) {
    match value {
        serde_json::Value::Object(obj) => {
            // Fields to prune ONLY at root
            if is_root {
                obj.remove("id");
                obj.remove("source_refs");
                obj.remove("version");
                obj.remove("edition");
                obj.remove("author");
                obj.remove("license");
                obj.remove("schema_version");
                obj.remove("created_at");
                obj.remove("updated_at");
                obj.remove("artifacts");
            }

            // Fields that should never be in the hash regardless of depth (if they are pure metadata)
            // Note: We preserve "id" in nested objects because they are used for mechanics (e.g. DamagePart).
            // but "artifacts", "source_refs", or "source_text" should probably always be removed if they ever appear nested.
            obj.remove("artifacts");
            obj.remove("source_refs");
            obj.remove("source_text");

            // Recurse into remaining fields
            for (_key, val) in obj.iter_mut() {
                // If we encounter a nested object that is NOT a mechanical spec known to have mechanical IDs,
                // we might want to be careful. But for now, we only prune the root ID.
                prune_metadata_recursive(val, false);
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr.iter_mut() {
                prune_metadata_recursive(val, false);
            }
        }
        _ => {}
    }
}

impl CanonicalSpell {
    pub fn compute_hash(&self) -> Result<String, String> {
        let mut normalized_clone = self.clone();
        normalized_clone.normalize();
        normalized_clone.validate()?;

        let canonical_json = normalized_clone.to_canonical_json()?;
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
            let schema = serde_json::from_str::<serde_json::Value>(SCHEMA_STR)
                .expect("Invalid embedded schema definition");
            jsonschema::JSONSchema::compile(&schema).expect("Schema compilation error")
        });

        let instance =
            serde_json::to_value(self).map_err(|e| format!("Serialization error: {}", e))?;

        // Version Validation
        if self.schema_version < 1 {
            return Err(format!(
                "Incompatible schema version: {}. Minimum supported version is 1.",
                self.schema_version
            ));
        }
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

    /// Recursively normalizes all string and number fields for deterministic hashing.
    /// Also sorts and deduplicates unordered arrays.
    pub fn normalize(&mut self) {
        self.name = normalize_string(&self.name, NormalizationMode::Structured);
        self.tradition =
            normalize_string(&self.tradition, NormalizationMode::Structured).to_uppercase();
        self.school = self.school.as_ref().map(|s| match_schema_case(s));
        self.description = normalize_string(&self.description, NormalizationMode::Textual);

        if let Some(materials) = &mut self.material_components {
            for m in materials.iter_mut() {
                m.normalize();
            }
            // Sort lexicographical by name to ensure stable hash
            materials.sort_by(|a, b| a.name.cmp(&b.name));
        }

        if let Some(range) = &mut self.range {
            range.normalize();
        }

        if let Some(ct) = &mut self.casting_time {
            ct.normalize();
        }

        if let Some(dur) = &mut self.duration {
            dur.normalize();
        }

        if let Some(area) = &mut self.area {
            area.normalize();
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

        // Materialize Defaults according to Rule 48 of canonicalization contract
        if self.reversible.is_none() {
            self.reversible = Some(0);
        }
        if self.material_components.is_none() {
            self.material_components = Some(vec![]);
        }

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
        self.subschools = self
            .subschools
            .iter()
            .map(|s| normalize_string(s, NormalizationMode::Structured))
            .collect();
        self.descriptors = self
            .descriptors
            .iter()
            .map(|s| normalize_string(s, NormalizationMode::Structured))
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
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum NormalizationMode {
    Structured, // Collapses all internal whitespace AND newlines
    Textual,    // Collapses horizontal whitespace, preserves newlines
    Exact,      // NFC and trim, but NO internal whitespace collapsing
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

    // Common complex enums from schema
    match lower.as_str() {
        "segment" | "segments" => "Segment".to_string(),
        "round" | "rounds" => "Round".to_string(),
        "turn" | "turns" => "Turn".to_string(),
        "hour" | "hours" => "Hour".to_string(),
        "minute" | "minutes" => "Minutes".to_string(),
        "action" | "actions" => "Actions".to_string(),
        "instant" | "instantaneous" => "Instantaneous".to_string(),
        "special" => "Special".to_string(),
        "foot radius" => "Foot Radius".to_string(),
        "yard radius" => "Yard Radius".to_string(),
        "mile radius" => "Mile Radius".to_string(),
        "foot cube" => "Foot Cube".to_string(),
        "yard cube" => "Yard Cube".to_string(),
        "square feet" => "Square Feet".to_string(),
        "cubic feet" => "Cubic Feet".to_string(),
        "square yards" => "Square Yards".to_string(),
        "cubic yards" => "Cubic Yards".to_string(),
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
            // Fallback to simple title case for standard one-word enums
            let mut c = normalized.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }
    }
}

pub(crate) fn normalize_scalar(s_opt: &mut Option<SpellScalar>) {
    if let Some(s) = s_opt {
        if let Some(v) = &mut s.value {
            *v = clamp_precision(*v);
        }
        if let Some(v) = &mut s.per_level {
            *v = clamp_precision(*v);
        }
        if let Some(v) = &mut s.cap_value {
            *v = clamp_precision(*v);
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

impl TryFrom<crate::models::spell::SpellDetail> for CanonicalSpell {
    type Error = String;

    fn try_from(detail: crate::models::spell::SpellDetail) -> Result<Self, Self::Error> {
        // Tradition Inference
        let tradition = match (&detail.school, &detail.sphere) {
            (Some(_), Some(_)) => "BOTH".to_string(),
            (Some(_), None) => "ARCANE".to_string(),
            (None, Some(_)) => "DIVINE".to_string(),
            (None, None) => return Err(format!("Spell '{}' (ID {:?}) is invalid: Must have a School (Arcane) or Sphere (Divine) defined.", detail.name, detail.id)),
        };

        let mut spell = Self::new(detail.name, detail.level, tradition, detail.description);

        spell.school = detail.school;
        spell.sphere = detail.sphere;
        spell.class_list = parse_comma_list(&detail.class_list);
        spell.tags = parse_comma_list(&detail.tags);

        let parser = SpellParser::new();

        spell.range = detail.range.map(|s| parser.parse_range(&s));
        spell.casting_time = detail.casting_time.map(|s| parser.parse_casting_time(&s));
        spell.duration = detail.duration.map(|s| parser.parse_duration(&s));
        spell.area = detail.area.and_then(|s| parser.parse_area(&s));

        // Damage parsing
        if let Some(dmg_str) = &detail.damage {
            spell.damage = Some(parser.parse_damage(dmg_str));
        } else {
            // Fallback: heuristic? (None for now unless we search description)
            spell.damage = None;
        }

        // Components parsing
        if let Some(comp_str) = &detail.components {
            spell.components = Some(parser.parse_components(comp_str));
            // Also parse experience cost from components string
            let xp_spec = parser.parse_experience_cost(comp_str);
            if xp_spec.kind != crate::models::experience::ExperienceKind::None {
                spell.experience_cost = Some(xp_spec);
            }
        }

        spell.material_components = detail
            .material_components
            .map(|s| parser.parse_material_components(&s));

        // Saving Throw and Magic Resistance
        if let Some(st_str) = &detail.saving_throw {
            spell.saving_throw = Some(parser.parse_saving_throw(st_str));
        }

        if let Some(mr_str) = &detail.magic_resistance {
            spell.magic_resistance = Some(parser.parse_magic_resistance(mr_str));
        } else if let Some(st_str) = &detail.saving_throw {
            // Heuristic fallback for MR
            let mr_spec = parser.parse_magic_resistance(st_str);
            if mr_spec.kind != crate::models::MagicResistanceKind::Unknown {
                spell.magic_resistance = Some(mr_spec);
            }
        }

        spell.reversible = Some(detail.reversible.unwrap_or(0));

        // Metadata
        if let Some(book) = detail.source {
            spell.source_refs = vec![SourceRef {
                system: detail.edition.clone(),
                book,
                page: None,
                note: None,
            }];
        }

        spell.edition = detail.edition;
        spell.author = detail.author;
        spell.license = detail.license;
        spell.is_quest_spell = detail.is_quest_spell;
        spell.is_cantrip = detail.is_cantrip;

        Ok(spell)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
    use crate::models::scalar::ScalarMode;

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
        }];

        let hash1 = spell1.compute_hash().unwrap();
        let hash2 = spell2.compute_hash().unwrap();

        assert_eq!(
            hash1, hash2,
            "Hash must be identical despite metadata changes"
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
        // HOWEVER, material_components is now materialized to [] by normalize() for stability.
        assert!(json.contains("\"material_components\":[]"));
        assert!(json.contains("\"is_cantrip\":0")); // is_cantrip is i64, 0 for level 1
        assert!(
            !json.contains("\"schema_version\""),
            "schema_version should be excluded from canonical JSON"
        );
    }

    #[test]
    fn test_empty_array_inclusion() {
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
        // THEN the canonical JSON MUST include "tags": []
        assert!(
            json.contains("\"tags\":[]"),
            "Empty tags array should be included in canonical JSON"
        );
        assert!(
            json.contains("\"class_list\":[]"),
            "Empty class_list array should be included"
        );
        assert!(
            json.contains("\"subschools\":[]"),
            "Empty subschools array should be included"
        );
        assert!(
            json.contains("\"descriptors\":[]"),
            "Empty descriptors array should be included"
        );
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
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        assert_eq!(canon.tradition, "BOTH");
        assert_eq!(canon.school, Some("Abjuration".to_string()));
        assert_eq!(canon.sphere, Some("Healing".to_string()));

        // 4. Default / Fallback tests moved to regression test
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
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: Some("Some  note".into()),
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
            unit: "Rounds".into(),
            base_value: 1.0,
            per_level: 0.0,
            level_divisor: 1.0,
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
            uses: None,
            condition: None,
        });

        let canonical_json = spell.to_canonical_json().unwrap();
        assert!(
            canonical_json.contains("\"unit\":\"Round\""),
            "Casting time unit should normalize to Round"
        );
        assert!(
            canonical_json.contains("\"unit\":\"hour\""),
            "Duration unit should normalize to hour (lowercase per new schema)"
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

        // Verify presence of materialized defaults
        assert!(
            json.contains("\"material_components\":[]"),
            "material_components should be materialized"
        );
        assert!(
            !json.contains("\"saving_throw\""),
            "saving_throw should be omitted"
        );
        assert!(
            !json.contains("\"cap_level\""),
            "cap_level inside damage should be omitted"
        );

        // Verify PRESENCE of fields with non-null defaults (Materialization Rule)
        assert!(
            json.contains("\"reversible\":0"),
            "reversible should be materialized to 0"
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
            standard_json.contains("\"schema_version\":1"),
            "schema_version must be PRESENT in standard JSON for export"
        );
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
        // Should still be OK but will print a warning to stderr
        assert!(spell.validate().is_ok());
    }

    #[test]
    fn test_validate_schema_version_incompatible() {
        let mut spell = CanonicalSpell::new("V0".into(), 1, "ARCANE".into(), "Desc".into());
        spell.school = Some("Abjuration".into());
        spell.class_list = vec!["Wizard".into()];
        spell.schema_version = 0; // Incompatible
        let result = spell.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Incompatible schema version"));
    }

    #[test]
    fn test_hash_stability_across_schema_versions() {
        let mut spell1 = CanonicalSpell::new("Stability".into(), 1, "ARCANE".into(), "Desc".into());
        spell1.school = Some("Abjuration".into());
        spell1.class_list = vec!["Wizard".into()];
        spell1.schema_version = 1;

        let mut spell2 = spell1.clone();
        spell2.schema_version = 2; // Hypothetical future version

        assert_eq!(
            spell1.compute_hash().unwrap(),
            spell2.compute_hash().unwrap(),
            "Hash must be identical across schema versions"
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
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: None,
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
        spell.is_quest_spell = 0;
        spell.is_cantrip = 1;
        assert!(spell.validate().is_ok());

        spell.is_quest_spell = 1;
        spell.is_cantrip = 0;
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
        let comps = canon.components.unwrap();
        assert!(!comps.verbal);
        assert!(!comps.somatic);
        assert!(!comps.material);

        // Case: Combined string without separators (should NOT match)
        detail.components = Some("VSM".into());
        let canon = CanonicalSpell::try_from(detail.clone()).unwrap();
        let comps = canon.components.unwrap();
        assert!(!comps.verbal);
        assert!(!comps.somatic);
        assert!(!comps.material);
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

        // Casting Time
        let ct = spell.casting_time.unwrap();
        assert_eq!(ct.base_value, 1.0);
        assert_eq!(ct.unit, "Action");

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
        assert_eq!(spec.unit, Some(AreaUnit::Inches));
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

        // Should be materialized in JSON
        assert_eq!(value["reversible"], 0);
        assert_eq!(value["material_components"], serde_json::json!([]));
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
}
