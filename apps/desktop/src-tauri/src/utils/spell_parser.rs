use crate::models::duration_spec::DurationSpec;
use crate::models::{
    AreaSpec, ExperienceComponentSpec, MagicResistanceSpec, MaterialComponentSpec, RangeSpec,
    SavingThrowSpec, SpellCastingTime, SpellComponents, SpellDamageSpec,
};
use crate::utils::parsers::{
    area::AreaParser, components::ComponentsParser, duration::DurationParser,
    mechanics::MechanicsParser, range::RangeParser,
};

/// # Spell Parser Facade
///
/// This struct acts as the primary entry point for parsing legacy spell data.
/// It delegates actual parsing logic to domain-specific sub-parsers located in `src/utils/parsers/`.
///
/// ## Usage
/// ```rust
/// use spellbook_desktop::utils::spell_parser::SpellParser;
/// let parser = SpellParser::new();
/// let range = parser.parse_range("10 yards");
/// ```
pub struct SpellParser {
    range: RangeParser,
    area: AreaParser,
    duration: DurationParser,
    components: ComponentsParser,
    mechanics: MechanicsParser,
}

impl Default for SpellParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SpellParser {
    pub fn new() -> Self {
        Self {
            range: RangeParser::new(),
            area: AreaParser::new(),
            duration: DurationParser::new(),
            components: ComponentsParser::new(),
            mechanics: MechanicsParser::new(),
        }
    }

    pub fn parse_range(&self, input: &str) -> RangeSpec {
        self.range.parse(input)
    }

    pub fn parse_duration(&self, input: &str) -> DurationSpec {
        self.duration.parse(input)
    }

    pub fn parse_casting_time(&self, input: &str) -> SpellCastingTime {
        self.components.parse_casting_time(input)
    }

    pub fn parse_area(&self, input: &str) -> Option<AreaSpec> {
        self.area.parse(input)
    }

    pub fn parse_components(&self, input: &str) -> SpellComponents {
        self.components.parse_components(input)
    }

    pub fn parse_damage(&self, input: &str) -> SpellDamageSpec {
        self.mechanics.parse_damage(input)
    }

    pub fn parse_magic_resistance(&self, input: &str) -> MagicResistanceSpec {
        self.mechanics.parse_magic_resistance(input)
    }

    pub fn parse_saving_throw(&self, input: &str) -> SavingThrowSpec {
        self.mechanics.parse_saving_throw(input)
    }

    pub fn parse_experience_cost(&self, input: &str) -> ExperienceComponentSpec {
        self.mechanics.parse_experience_cost(input)
    }

    pub fn parse_material_components(&self, input: &str) -> Vec<MaterialComponentSpec> {
        self.components.parse_material_components(input)
    }

    pub fn extract_materials_from_components_line(
        &self,
        input: &str,
    ) -> Vec<MaterialComponentSpec> {
        self.components
            .extract_materials_from_components_line(input)
    }
}

// title_case was removed as unused

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::duration_spec::DurationUnit;
    use crate::models::{AreaKind, RangeKind};

    // Integration tests for the Facade
    // Detailed unit tests have been moved to:
    // - utils/parsers/range.rs
    // - utils/parsers/area.rs
    // - utils/parsers/duration.rs
    // - utils/parsers/mechanics.rs
    // - utils/parsers/components.rs

    #[test]
    fn test_facade_range_delegation() {
        let parser = SpellParser::new();
        let res = parser.parse_range("10 yards");
        assert_eq!(res.kind, RangeKind::Distance);
    }

    #[test]
    fn test_facade_area_delegation() {
        let parser = SpellParser::new();
        let res = parser.parse_area("20' radius").unwrap();
        assert_eq!(res.kind, AreaKind::RadiusCircle);
    }

    #[test]
    fn test_facade_duration_delegation() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("10 rounds");
        assert_eq!(res.unit, Some(DurationUnit::Round));
    }

    #[test]
    fn test_facade_components_delegation() {
        let parser = SpellParser::new();
        let res = parser.parse_components("V, S");
        assert!(res.verbal);
        assert!(res.somatic);
    }
}
