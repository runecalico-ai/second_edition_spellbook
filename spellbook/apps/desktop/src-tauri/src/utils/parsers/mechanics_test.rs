use spellbook_desktop::utils::parsers::mechanics::MechanicsParser;

#[test]
fn test_complex_damage_parsing() {
    let parser = MechanicsParser::new();

    // Fireball
    let fb = parser.parse_damage("1d6/level (max 10d6) fire damage (half save)");
    let part = &fb.parts.as_ref().unwrap()[0];
    assert_eq!(part.damage_type, crate::models::damage::DamageType::Fire);
    assert_eq!(part.save.kind, crate::models::damage::DamageSaveKind::Half);
    let scaling = &part.scaling.as_ref().unwrap()[0];
    assert_eq!(scaling.max_steps, Some(10));
    assert_eq!(scaling.dice_increment.as_ref().unwrap().count, 1);

    // Magic Missile
    let mm = parser.parse_damage("1d4+1 force damage");
    let mm_part = &mm.parts.as_ref().unwrap()[0];
    assert_eq!(
        mm_part.damage_type,
        crate::models::damage::DamageType::Force
    );
    assert_eq!(mm_part.base.terms[0].count, 1);
    assert_eq!(mm_part.base.flat_modifier, 1);
}

#[test]
fn test_xp_parsing() {
    let parser = MechanicsParser::new();
    let res = parser.parse_experience_cost("500 xp per level");
    assert_eq!(res.kind, crate::models::ExperienceKind::PerUnit);
    assert_eq!(res.per_unit.unwrap().xp_per_unit, 500);
}
