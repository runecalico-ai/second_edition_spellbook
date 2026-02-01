use serde::{Deserialize, Serialize};
use serde_json_canonicalizer::to_string as to_jcs_string;
use sha2::{Digest, Sha256};

use crate::utils::spell_parser::SpellParser;
use std::fmt::Write as FmtWrite;

pub const CURRENT_SCHEMA_VERSION: i64 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
// Note: Fields are mapped to canonical JSON names.
// Keys are sorted lexicographically by serde_json::Value (BTreeMap) during canonicalization,
// so struct field order doesn't strictly matter for the hash, but helps readability.
pub struct SpellRange {
    pub text: String,
    pub unit: String,
    #[serde(default)]
    pub base_value: f64,
    #[serde(default)]
    pub per_level: f64,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellComponents {
    pub verbal: bool,
    pub somatic: bool,
    pub material: bool,
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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellDuration {
    pub text: String,
    pub unit: String,
    #[serde(default)]
    pub base_value: f64,
    #[serde(default)]
    pub per_level: f64,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellArea {
    pub text: String,
    pub unit: String,
    #[serde(default)]
    pub base_value: f64,
    #[serde(default)]
    pub per_level: f64,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpellDamage {
    pub text: String,
    #[serde(default)]
    pub base_dice: String,
    #[serde(default)]
    pub per_level_dice: String,
    #[serde(default = "default_one")]
    pub level_divisor: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cap_level: Option<f64>,
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
    pub range: Option<SpellRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub components: Option<SpellComponents>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_components: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub casting_time: Option<SpellCastingTime>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<SpellDuration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub area: Option<SpellArea>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<SpellDamage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saving_throw: Option<String>,
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

    // We explicitly omit schema_version from the serialised JSON because
    // the official schema (v1) has additionalProperties: false and does not define it.
    // UPDATE: Schema now defines it, so we include it.
    #[serde(default = "default_schema_version")]
    pub schema_version: i64,
}

fn default_version() -> String {
    "1.0.0".into()
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
            saving_throw: None,
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
        }
    }

    /// Canonicalize the spell:
    /// 1. Sort array fields (done on construction or here safety).
    /// 2. Convert to serde_json::Value (which uses BTreeMap for objects, sorting keys).
    /// 3. Serialize to string.
    pub fn to_canonical_json(&self) -> Result<String, String> {
        let mut clone = self.clone();

        // Canonical sorting of arrays
        clone.class_list.sort();
        clone.tags.sort();
        clone.subschools.sort();
        clone.descriptors.sort();

        // Note: Nested structs (Range, etc.) are objects, which BTreeMap handles
        // for key sorting, but we don't have arrays inside them that need nested sorting yet.

        let mut value = serde_json::to_value(&clone).map_err(|err| err.to_string())?;

        // Metadata Exclusion: id, source_refs, edition, author, version, license, and schema_version
        // are strictly excluded from the canonical JSON used for hashing to ensure hash stability.
        if let Some(obj) = value.as_object_mut() {
            obj.remove("id");
            obj.remove("source_refs");
            obj.remove("edition");
            obj.remove("author");
            obj.remove("version");
            obj.remove("license");
            obj.remove("schema_version");
        }

        to_jcs_string(&value).map_err(|err| err.to_string())
    }

    pub fn compute_hash(&self) -> Result<String, String> {
        self.validate()?;
        let canonical_json = self.to_canonical_json()?;
        let mut hasher = Sha256::new();
        hasher.update(canonical_json.as_bytes());
        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    pub fn validate(&self) -> Result<(), String> {
        const SCHEMA_STR: &str = include_str!("../../schemas/spell.schema.json");
        let schema = serde_json::from_str::<serde_json::Value>(SCHEMA_STR)
            .map_err(|e| format!("Invalid schema definition: {}", e))?;

        let compiled = jsonschema::JSONSchema::compile(&schema)
            .map_err(|e| format!("Schema compilation error: {:?}", e))?;

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
        spell.area = detail.area.map(|s| parser.parse_area(&s));
        spell.damage = None; // Legacy schema does not have a dedicated damage field

        // Components parsing
        if let Some(comp_str) = &detail.components {
            spell.components = Some(parser.parse_components(comp_str));
        }

        spell.material_components = detail.material_components;
        spell.saving_throw = detail.saving_throw;
        spell.reversible = detail.reversible;

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

        // Non-skipped Option::None fields appear as `null` if not skipped
        assert!(!json.contains("\"material_components\""));
        assert!(json.contains("\"is_cantrip\":0")); // is_cantrip is i64, 0 for level 1
        assert!(
            !json.contains("\"schema_version\""),
            "schema_version should be excluded from canonical JSON"
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
    fn test_damage_without_cap_level_passes() {
        let mut spell = CanonicalSpell::new(
            "Damage Cap Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Testing null cap level".to_string(),
        );
        spell.school = Some("Evocation".to_string());
        spell.class_list = vec!["Wizard".to_string()];
        spell.damage = Some(SpellDamage {
            text: "1d6".into(),
            base_dice: "0".into(),
            per_level_dice: "0".into(),
            level_divisor: 1.0,
            cap_level: None, // This will serialize to null
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
        spell.damage = Some(SpellDamage {
            text: "1d6".into(),
            base_dice: "0".into(),
            per_level_dice: "0".into(),
            level_divisor: 1.0,
            cap_level: None, // This specifically was the issue for nested structs
        });

        let json = spell.to_canonical_json().unwrap();

        // Verify total absence of keys
        assert!(
            !json.contains("\"material_components\""),
            "material_components should be omitted"
        );
        assert!(
            !json.contains("\"saving_throw\""),
            "saving_throw should be omitted"
        );
        assert!(
            !json.contains("\"reversible\""),
            "reversible should be omitted"
        );
        assert!(
            !json.contains("\"cap_level\""),
            "cap_level inside damage should be omitted"
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

        // Test SpellRange
        let json = r#"{"text": "10 yards", "unit": "Yards", "unknown_field": "error"}"#;
        let res: Result<SpellRange, _> = serde_json::from_str(json);
        assert!(res.is_err(), "Should reject unknown field in SpellRange");

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
        spell.range = Some(SpellRange {
            text: "Touch".into(),
            unit: "Touch".into(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
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
        };

        let spell = CanonicalSpell::try_from(detail).unwrap();

        // Range
        let r = spell.range.unwrap();
        assert_eq!(r.base_value, 10.0);
        assert_eq!(r.per_level, 5.0);
        assert_eq!(r.unit, "Yards");

        // Duration
        let d = spell.duration.unwrap();
        assert_eq!(d.per_level, 1.0);
        assert_eq!(d.level_divisor, 2.0);
        assert_eq!(d.unit, "Round");

        // Area
        let a = spell.area.unwrap();
        assert_eq!(a.base_value, 20.0);
        assert_eq!(a.unit, "Foot Radius");

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
}
