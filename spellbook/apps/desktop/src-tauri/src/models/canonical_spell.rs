use serde::{Deserialize, Serialize};
use serde_json_canonicalizer::to_string as to_jcs_string;
use sha2::{Digest, Sha256};

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
pub struct SpellComponents {
    pub verbal: bool,
    pub somatic: bool,
    pub material: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
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
pub struct SourceRef {
    pub system: Option<String>,
    pub book: String,
    pub page: Option<serde_json::Value>, // Can be string or int
    pub note: Option<String>,
}

fn default_one() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CanonicalSpell {
    #[serde(skip_serializing, skip_deserializing, default)]
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

    // Metadata - Skipped when hashing/serializing to canonical JSON
    #[serde(skip_serializing, default)]
    pub source_refs: Vec<SourceRef>,
    #[serde(skip_serializing)]
    pub edition: Option<String>,
    #[serde(skip_serializing)]
    pub author: Option<String>,
    #[serde(skip_serializing, default = "default_version")]
    pub version: String,
    #[serde(skip_serializing)]
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
            schema_version: 1,
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

        to_jcs_string(&clone).map_err(|err| err.to_string())
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

        // Map complex fields to basic text-only objects for now
        spell.range = detail.range.map(|text| SpellRange {
            text,
            unit: "Special".into(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        });

        spell.casting_time = detail.casting_time.map(|text| SpellCastingTime {
            text,
            unit: "Special".into(),
            base_value: 1.0,
            per_level: 0.0,
            level_divisor: 1.0,
        });

        spell.duration = detail.duration.map(|text| SpellDuration {
            text,
            unit: "Special".into(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        });

        spell.area = detail.area.map(|text| SpellArea {
            text,
            unit: "Special".into(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        });

        // Components parsing (basic heuristic)
        if let Some(comp_str) = &detail.components {
            let lower = comp_str.to_lowercase();
            spell.components = Some(SpellComponents {
                verbal: lower.contains('v'),
                somatic: lower.contains('s'),
                material: lower.contains('m'),
            });
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
        assert!(json.contains("\"schema_version\":1")); // Now included
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

        // Assign an ID
        spell.id = Some("existing-id".to_string());
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
    fn test_regression_schema_version_presence() {
        // Bug: schema_version was declared but valid as skipped, making it useless for versioning.
        // Fix: Added explicit schema_version field to JSON validation and struct serialization.
        let spell = CanonicalSpell::new(
            "Version Test".to_string(),
            1,
            "ARCANE".to_string(),
            "Desc".to_string(),
        );

        let json = spell.to_canonical_json().unwrap();

        // Must be present and strictly 1 (integer)
        assert!(
            json.contains("\"schema_version\":1"),
            "schema_version:1 must be present in canonical JSON"
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
            area: None,
            saving_throw: None,
            reversible: Some(0),
            description: "Desc".into(),
            tags: Some("Fire, Fire".into()), // Duplicates here too
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
}
