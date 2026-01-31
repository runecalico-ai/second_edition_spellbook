use crate::error::AppError;
use jsonschema::{Draft, JSONSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Digest;
use std::collections::BTreeMap;
use std::sync::OnceLock;

use super::spell::SpellDetail;

const SCHEMA_JSON: &str = include_str!("../../resources/spell.schema.json");

const SORTED_ARRAY_FIELDS: [&str; 4] = ["class_list", "tags", "subschools", "descriptors"];
const EXCLUDED_HASH_FIELDS: [&str; 9] = [
    "id",
    "artifacts",
    "created_at",
    "updated_at",
    "source_refs",
    "edition",
    "author",
    "license",
    "version",
];

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct CanonicalSpell {
    pub id: Option<String>,
    pub schema_version: i64,
    pub name: String,
    pub tradition: String,
    pub school: Option<String>,
    #[serde(default)]
    pub subschools: Vec<String>,
    #[serde(default)]
    pub descriptors: Vec<String>,
    pub sphere: Option<String>,
    #[serde(default)]
    pub class_list: Vec<String>,
    pub level: i64,
    pub range: Option<SpellRange>,
    pub components: Option<SpellComponents>,
    pub material_components: Option<String>,
    pub casting_time: Option<SpellCastingTime>,
    pub duration: Option<SpellDuration>,
    pub area: Option<SpellArea>,
    pub damage: Option<SpellDamage>,
    pub saving_throw: Option<String>,
    pub reversible: Option<i64>,
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<SpellSourceRef>,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub version: String,
    pub license: Option<String>,
    pub is_quest_spell: i64,
    pub is_cantrip: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellRange {
    pub text: String,
    pub unit: String,
    pub base_value: f64,
    pub per_level: f64,
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellComponents {
    pub verbal: bool,
    pub somatic: bool,
    pub material: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellCastingTime {
    pub text: String,
    pub unit: String,
    pub base_value: f64,
    pub per_level: f64,
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellDuration {
    pub text: String,
    pub unit: String,
    pub base_value: f64,
    pub per_level: f64,
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellArea {
    pub text: String,
    pub unit: String,
    pub base_value: f64,
    pub per_level: f64,
    pub level_divisor: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellDamage {
    pub text: String,
    pub base_dice: String,
    pub per_level_dice: String,
    pub level_divisor: f64,
    pub cap_level: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SpellSourceRef {
    pub system: Option<String>,
    pub book: String,
    pub page: Option<Value>,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
pub struct SchemaMigrationReport {
    pub from_version: i64,
    pub to_version: i64,
    pub notes: Vec<String>,
}

impl CanonicalSpell {
    pub fn from_spell_detail(spell: &SpellDetail) -> Result<Self, AppError> {
        let (tradition, school, sphere) = derive_tradition(&spell.school, &spell.sphere)?;
        Ok(Self {
            id: None,
            schema_version: current_schema_version()?,
            name: spell.name.clone(),
            tradition,
            school,
            subschools: Vec::new(),
            descriptors: Vec::new(),
            sphere,
            class_list: parse_json_list(&spell.class_list),
            level: spell.level,
            range: spell.range.as_ref().map(|text| SpellRange {
                text: text.clone(),
                unit: "Yards".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            components: parse_components(&spell.components),
            material_components: spell.material_components.clone(),
            casting_time: spell.casting_time.as_ref().map(|text| SpellCastingTime {
                text: text.clone(),
                unit: "Segment".to_string(),
                base_value: 1.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            duration: spell.duration.as_ref().map(|text| SpellDuration {
                text: text.clone(),
                unit: "Round".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            area: spell.area.as_ref().map(|text| SpellArea {
                text: text.clone(),
                unit: "Special".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            damage: None,
            saving_throw: spell.saving_throw.clone(),
            reversible: spell.reversible,
            description: spell.description.clone(),
            tags: parse_json_list(&spell.tags),
            source_refs: Vec::new(),
            edition: spell.edition.clone(),
            author: spell.author.clone(),
            version: "1.0.0".to_string(),
            license: spell.license.clone(),
            is_quest_spell: spell.is_quest_spell,
            is_cantrip: spell.is_cantrip,
        })
    }

    pub fn from_json(value: Value) -> Result<Self, AppError> {
        let migrated = migrate_json_to_current(value)?;
        serde_json::from_value(migrated).map_err(|err| AppError::Validation(err.to_string()))
    }

    pub fn validate_schema(&self) -> Result<(), AppError> {
        validate_schema_version(self.schema_version)?;
        let schema = schema_validator()?;
        let instance =
            serde_json::to_value(self).map_err(|err| AppError::Validation(err.to_string()))?;
        if let Err(errors) = schema.validate(&instance) {
            let messages: Vec<String> = errors
                .map(|error| format!("{} at {}", error, error.instance_path))
                .collect();
            return Err(AppError::Validation(messages.join("; ")));
        }
        Ok(())
    }

    pub fn canonical_json(&self) -> Result<String, AppError> {
        let value =
            serde_json::to_value(self).map_err(|err| AppError::Validation(err.to_string()))?;
        let canonical = canonicalize_value(value, None)
            .ok_or_else(|| AppError::Validation("Canonical spell is empty".to_string()))?;
        serde_json::to_string(&canonical).map_err(|err| AppError::Validation(err.to_string()))
    }

    pub fn compute_hash(&self) -> Result<String, AppError> {
        self.validate_schema()?;
        let canonical_json = self.canonical_json()?;
        let mut hasher = sha2::Sha256::new();
        hasher.update(canonical_json.as_bytes());
        let result = hasher.finalize();
        Ok(hex::encode(result))
    }
}

fn migrate_json_to_current(mut value: Value) -> Result<Value, AppError> {
    let current_version = current_schema_version()?;
    let mut report = SchemaMigrationReport {
        from_version: current_version,
        to_version: current_version,
        notes: Vec::new(),
    };

    if let Value::Object(ref mut map) = value {
        let incoming_version = map
            .get("schema_version")
            .and_then(Value::as_i64)
            .unwrap_or(1);
        report.from_version = incoming_version;
        if incoming_version < current_version {
            map.insert(
                "schema_version".to_string(),
                Value::Number(current_version.into()),
            );
            report.to_version = current_version;
            report.notes.push(format!(
                "Migrated schema_version {} -> {}",
                incoming_version, current_version
            ));
        }
    }

    if report.from_version != report.to_version {
        eprintln!(
            "Schema migration report: {}",
            serde_json::to_string(&report).unwrap_or_default()
        );
    }

    Ok(value)
}

fn derive_tradition(
    school: &Option<String>,
    sphere: &Option<String>,
) -> Result<(String, Option<String>, Option<String>), AppError> {
    match (school.clone(), sphere.clone()) {
        (Some(school), Some(sphere)) => Ok(("BOTH".to_string(), Some(school), Some(sphere))),
        (Some(school), None) => Ok(("ARCANE".to_string(), Some(school), None)),
        (None, Some(sphere)) => Ok(("DIVINE".to_string(), None, Some(sphere))),
        (None, None) => Err(AppError::Validation(
            "Cannot derive tradition: provide school and/or sphere".to_string(),
        )),
    }
}

fn parse_components(components: &Option<String>) -> Option<SpellComponents> {
    let text = components.as_ref()?;
    let normalized = text.to_lowercase();
    Some(SpellComponents {
        verbal: normalized.contains('v'),
        somatic: normalized.contains('s'),
        material: normalized.contains('m'),
    })
}

fn parse_json_list(value: &Option<String>) -> Vec<String> {
    let Some(raw) = value else {
        return Vec::new();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.starts_with('[') {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(trimmed) {
            return list;
        }
    }
    trimmed
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn schema_validator() -> Result<&'static JSONSchema, AppError> {
    static SCHEMA: OnceLock<JSONSchema> = OnceLock::new();
    SCHEMA.get_or_try_init(|| {
        let schema_json: Value = serde_json::from_str(SCHEMA_JSON)
            .map_err(|err| AppError::Validation(err.to_string()))?;
        JSONSchema::options()
            .with_draft(Draft::Draft202012)
            .compile(&schema_json)
            .map_err(|err| AppError::Validation(err.to_string()))
    })
}

fn current_schema_version() -> Result<i64, AppError> {
    let schema_json: Value =
        serde_json::from_str(SCHEMA_JSON).map_err(|err| AppError::Validation(err.to_string()))?;
    schema_json
        .get("x-schema-version")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::Validation("Schema version metadata missing".to_string()))
}

fn validate_schema_version(schema_version: i64) -> Result<(), AppError> {
    let current = current_schema_version()?;
    if schema_version > current {
        eprintln!(
            "Warning: incoming schema version {} is newer than supported {}",
            schema_version, current
        );
        return Err(AppError::Validation(format!(
            "Schema version {} is newer than supported {}",
            schema_version, current
        )));
    }
    Ok(())
}

fn canonicalize_value(value: Value, key: Option<&str>) -> Option<Value> {
    match value {
        Value::Null => None,
        Value::Bool(_) | Value::Number(_) | Value::String(_) => Some(value),
        Value::Array(items) => {
            let mut canonical_items: Vec<Value> = items
                .into_iter()
                .filter_map(|item| canonicalize_value(item, None))
                .collect();
            if key.map(|field| SORTED_ARRAY_FIELDS.contains(&field)) == Some(true) {
                canonical_items.sort_by(|a, b| a.to_string().cmp(&b.to_string()));
            }
            Some(Value::Array(canonical_items))
        }
        Value::Object(map) => {
            let mut ordered = BTreeMap::new();
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();
            for key_name in keys {
                if EXCLUDED_HASH_FIELDS.contains(&key_name.as_str()) {
                    continue;
                }
                if let Some(value) = map.get(&key_name) {
                    if let Some(canonical) = canonicalize_value(value.clone(), Some(&key_name)) {
                        ordered.insert(key_name, canonical);
                    }
                }
            }
            let mut object = serde_json::Map::new();
            for (key, value) in ordered {
                object.insert(key, value);
            }
            Some(Value::Object(object))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn base_spell() -> CanonicalSpell {
        CanonicalSpell {
            id: None,
            schema_version: 1,
            name: "Fireball".to_string(),
            tradition: "ARCANE".to_string(),
            school: Some("Evocation".to_string()),
            subschools: vec![],
            descriptors: vec![],
            sphere: None,
            class_list: vec!["Wizard".to_string()],
            level: 3,
            range: Some(SpellRange {
                text: "10 yards".to_string(),
                unit: "Yards".to_string(),
                base_value: 10.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            components: Some(SpellComponents {
                verbal: true,
                somatic: true,
                material: true,
            }),
            material_components: None,
            casting_time: Some(SpellCastingTime {
                text: "3".to_string(),
                unit: "Segment".to_string(),
                base_value: 3.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            duration: Some(SpellDuration {
                text: "Instant".to_string(),
                unit: "Instantaneous".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            area: Some(SpellArea {
                text: "20 ft radius".to_string(),
                unit: "Foot Radius".to_string(),
                base_value: 20.0,
                per_level: 0.0,
                level_divisor: 1.0,
            }),
            damage: None,
            saving_throw: Some("1/2".to_string()),
            reversible: Some(0),
            description: "Boom".to_string(),
            tags: vec!["Fire".to_string(), "Damage".to_string()],
            source_refs: vec![],
            edition: Some("2e".to_string()),
            author: Some("Mage".to_string()),
            version: "1.0.0".to_string(),
            license: Some("OGL".to_string()),
            is_quest_spell: 0,
            is_cantrip: 0,
        }
    }

    #[test]
    fn identical_content_produces_identical_hash() {
        let mut first = base_spell();
        let mut second = base_spell();
        second.tags = vec!["Damage".to_string(), "Fire".to_string()];
        let hash_a = first.compute_hash().expect("hash a");
        let hash_b = second.compute_hash().expect("hash b");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn content_change_produces_different_hash() {
        let mut spell = base_spell();
        let hash_a = spell.compute_hash().expect("hash a");
        spell.description = "Explosion".to_string();
        let hash_b = spell.compute_hash().expect("hash b");
        assert_ne!(hash_a, hash_b);
    }

    #[test]
    fn metadata_change_does_not_affect_hash() {
        let mut spell_a = base_spell();
        let mut spell_b = base_spell();
        spell_b.author = Some("Wizard".to_string());
        spell_b.edition = Some("3e".to_string());
        let hash_a = spell_a.compute_hash().expect("hash a");
        let hash_b = spell_b.compute_hash().expect("hash b");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn null_value_handling_omits_field() {
        let mut spell = base_spell();
        spell.reversible = None;
        let json = spell.canonical_json().expect("json");
        assert!(!json.contains("\"reversible\""));
    }

    #[test]
    fn schema_validation_rejects_invalid_tradition() {
        let mut spell = base_spell();
        spell.tradition = "PSIONIC".to_string();
        let result = spell.validate_schema();
        assert!(result.is_err());
    }

    #[test]
    fn schema_validation_accepts_valid_spell() {
        let spell = base_spell();
        spell.validate_schema().expect("valid spell");
    }

    #[test]
    fn schema_validation_rejects_arcane_without_school() {
        let mut spell = base_spell();
        spell.school = None;
        let result = spell.validate_schema();
        assert!(result.is_err());
    }

    #[test]
    fn schema_validation_rejects_divine_without_sphere() {
        let mut spell = base_spell();
        spell.tradition = "DIVINE".to_string();
        spell.school = None;
        spell.sphere = None;
        let result = spell.validate_schema();
        assert!(result.is_err());
    }

    #[test]
    fn default_values_are_included() {
        let spell = base_spell();
        let json = spell.canonical_json().expect("json");
        assert!(json.contains("\"is_cantrip\":0"));
        assert!(json.contains("\"is_quest_spell\":0"));
    }

    #[test]
    fn field_order_independence_in_canonicalization() {
        let mut map_a = serde_json::Map::new();
        map_a.insert("b".to_string(), Value::String("two".to_string()));
        map_a.insert("a".to_string(), Value::String("one".to_string()));
        let mut map_b = serde_json::Map::new();
        map_b.insert("a".to_string(), Value::String("one".to_string()));
        map_b.insert("b".to_string(), Value::String("two".to_string()));

        let canonical_a = canonicalize_value(Value::Object(map_a), None).expect("canonical a");
        let canonical_b = canonicalize_value(Value::Object(map_b), None).expect("canonical b");

        assert_eq!(canonical_a, canonical_b);
    }

    #[test]
    fn migrate_sets_schema_version() {
        let mut map = serde_json::Map::new();
        map.insert("name".to_string(), Value::String("Test".to_string()));
        let migrated = migrate_json_to_current(Value::Object(map)).expect("migrated");
        let schema_version = migrated
            .get("schema_version")
            .and_then(Value::as_i64)
            .expect("schema_version");
        assert_eq!(schema_version, current_schema_version().expect("current"));
    }

    #[test]
    fn unique_constraint_detects_hash_collisions() {
        let conn = Connection::open_in_memory().expect("conn");
        conn.execute(
            "CREATE TABLE spell_hash (content_hash TEXT UNIQUE NOT NULL)",
            [],
        )
        .expect("create");
        conn.execute(
            "INSERT INTO spell_hash (content_hash) VALUES (?1)",
            ["deadbeef"],
        )
        .expect("insert");
        let result = conn.execute(
            "INSERT INTO spell_hash (content_hash) VALUES (?1)",
            ["deadbeef"],
        );
        assert!(result.is_err());
    }
}
