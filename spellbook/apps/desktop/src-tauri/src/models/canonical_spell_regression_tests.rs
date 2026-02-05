use crate::models::canonical_spell::CanonicalSpell;
use crate::models::range_spec::RangeKind;
use crate::models::scalar::ScalarMode;
use crate::utils::parsers::area::AreaParser;
use crate::utils::parsers::duration::DurationParser;
use crate::utils::parsers::range::RangeParser;

#[test]
fn test_issue_1_duration_per_level_zero_preservation() {
    let parser = DurationParser::new();
    // Case 1: "1 round / level" path
    let spec = parser.parse("1 round / level");
    let scalar = spec.duration.unwrap();
    assert_eq!(scalar.mode, ScalarMode::PerLevel);
    assert_eq!(scalar.value, Some(0.0));

    // Case 2: "1 round / 2 levels" divisor path
    let spec2 = parser.parse("1 round / 2 levels");
    let scalar2 = spec2.duration.unwrap();
    assert_eq!(scalar2.mode, ScalarMode::PerLevel);
    assert_eq!(scalar2.value, Some(0.0));
}

#[test]
fn test_issue_2_materialize_defaults() {
    let mut spell = CanonicalSpell {
        name: "Test Spell".to_string(),
        tradition: "arcane".to_string(),
        description: "Test".to_string(),
        level: 1,
        reversible: None,          // Implicitly 0
        material_components: None, // Implicitly []
        components: None,          // Implicitly all false
        casting_time: None,        // Implicitly default
        schema_version: 0,         // Implicitly 1
        ..Default::default()
    };

    spell.normalize();

    assert_eq!(spell.reversible, Some(0));
    assert_eq!(spell.material_components, Some(vec![]));
    let components = spell.components.unwrap();
    assert!(!components.verbal);
    assert!(!components.somatic);

    let ct = spell.casting_time.as_ref().unwrap();
    assert_eq!(ct.unit, "Segment");
    assert_eq!(ct.base_value, 1.0);

    // Ensure school/sphere are NOT materialized if they are None (they stay None)
    assert!(spell.school.is_none());
}

#[test]
fn test_issue_3_mixed_unit_fallback() {
    let range_parser = RangeParser::new();
    let res = range_parser.parse("1 yd + 1 ft/level");
    assert_eq!(res.kind, RangeKind::Special);
    assert_eq!(res.text.unwrap(), "1 yd + 1 ft/level");

    let area_parser = AreaParser::new();
    let res_area = area_parser.parse("10 ft + 5 yd/level radius").unwrap();
    assert_eq!(res_area.kind, crate::models::area_spec::AreaKind::Special);
}

#[test]
fn test_issue_4_area_spec_relaxed_validation() {
    // This is more of a schema check, but we can verify the model allows it
    use crate::models::area_spec::{AreaKind, AreaSpec};
    let area = AreaSpec {
        kind: AreaKind::Line,
        length: None, // Optional per relaxed schema
        width: None,
        ..Default::default()
    };
    // If it serializes and can be part of a CanonicalSpell, we are good.
    let spell = CanonicalSpell {
        area: Some(area),
        ..Default::default()
    };
    let json = serde_json::to_value(&spell).unwrap();
    assert!(json.get("area").is_some());
}
