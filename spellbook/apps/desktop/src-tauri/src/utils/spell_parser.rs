use crate::models::canonical_spell::{
    SpellArea, SpellCastingTime, SpellComponents, SpellDamage, SpellDuration, SpellRange,
};
use regex::Regex;

pub struct SpellParser {
    range_simple_regex: Regex,
    range_variable_regex: Regex,
    duration_simple_regex: Regex,
    damage_fixed_regex: Regex,
    damage_scaling_regex: Regex,
    damage_capped_regex: Regex,
    area_regex: Regex,
}

impl Default for SpellParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SpellParser {
    pub fn new() -> Self {
        Self {
            // Pattern 1: Fixed Value Only
            // Matches "10 yards", "60.5 ft.", "3"
            range_simple_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)$").unwrap(),

            // Pattern 2: Variable Scaling
            // Matches "10 + 5/level yards", "10 + 10/level"
            range_variable_regex: Regex::new(
                r"(?i)^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)/level(?:\s*([a-z\.]+))?$",
            )
            .unwrap(),

            // Pattern 3: Per N Levels (Not previously captured separately)
            // Matches "1 round / 2 levels" (handled as special case in logic or separate regex)
            // But we can reuse duration simple for "1 round" part and custom logic for "/ level" checks?
            // Actually spec has specific pattern:
            // ^(\d+(?:\.\d+)?)\s*/\s*(\d+)\s*levels?\s*(\w+)?$
            // Let's rely on standard logic but maybe add specialized one if needed.
            // For now, let's keep it simple with existing + expanded simple regex.
            duration_simple_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)$").unwrap(),

            // Damage Patterns
            // 1. Fixed: "1d6", "2d4+1"
            damage_fixed_regex: Regex::new(r"(?i)^(\d+d\d+(?:[+\-]\d+)?)$").unwrap(),
            // 2. Scaling: "1d6/level"
            damage_scaling_regex: Regex::new(
                r"(?i)^(?:(\d+d\d+)(?:\s*\+\s*)?)?(\d+d\d+)\s*/\s*level$",
            )
            .unwrap(),
            // 3. Capped: "1d6/level (max 10d6)"
            damage_capped_regex: Regex::new(r"(?i)^(\d+d\d+)/level\s*\(max\s*(\d+d\d+)\)$")
                .unwrap(),

            area_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*[\s\-]*([a-z\.]+)(?:\s+([a-z\.]+))?$")
                .unwrap(),
        }
    }

    pub fn parse_range(&self, input: &str) -> SpellRange {
        let input_clean = input.trim();
        let lower = input_clean.to_lowercase();

        if lower == "touch" {
            return SpellRange {
                text: input.to_string(),
                unit: "Touch".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        if lower == "unlimited" {
            return SpellRange {
                text: input.to_string(),
                unit: "Unlimited".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        // Pattern 2: Variable Scaling "10 + 5/level yards"
        if let Some(caps) = self.range_variable_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let per_level = caps
                .get(2)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit = caps
                .get(3)
                .map_or("Special".to_string(), |m| title_case(m.as_str()));

            return SpellRange {
                text: input.to_string(),
                unit,
                base_value: base,
                per_level,
                level_divisor: 1.0,
            };
        }

        // Pattern 1: Simple "10 yards"
        if let Some(caps) = self.range_simple_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit = caps
                .get(2)
                .map_or("Special".to_string(), |m| title_case(m.as_str()));

            return SpellRange {
                text: input.to_string(),
                unit,
                base_value: base,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        // Fallback
        SpellRange {
            text: input.to_string(),
            unit: "Special".to_string(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        }
    }

    pub fn parse_duration(&self, input: &str) -> SpellDuration {
        let input_clean = input.trim();
        let lower = input_clean.to_lowercase();

        if lower == "instantaneous" {
            return SpellDuration {
                text: input.to_string(),
                unit: "Instantaneous".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        if lower == "permanent" {
            return SpellDuration {
                text: input.to_string(),
                unit: "Permanent".to_string(),
                base_value: 0.0,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        // Helper for "1 round/level"
        if lower.contains("/level") {
            // simplified logic: extract value before /level
            let parts: Vec<&str> = lower.split("/level").collect();
            if let Some(first_part) = parts.first() {
                if let Some(caps) = self.duration_simple_regex.captures(first_part.trim()) {
                    let per_level = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let unit = caps
                        .get(2)
                        .map_or("Round".to_string(), |m| title_case(m.as_str()));
                    return SpellDuration {
                        text: input.to_string(),
                        unit,
                        base_value: 0.0,
                        per_level,
                        level_divisor: 1.0,
                    };
                }
            }
        }

        if let Some(caps) = self.duration_simple_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit = caps
                .get(2)
                .map_or("round".to_string(), |m| title_case(m.as_str()));
            return SpellDuration {
                text: input.to_string(),
                unit,
                base_value: base,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        SpellDuration {
            text: input.to_string(),
            unit: "Special".to_string(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        }
    }

    // Reuse duration logic for casting time as structure is identical
    pub fn parse_casting_time(&self, input: &str) -> SpellCastingTime {
        let dur = self.parse_duration(input);
        SpellCastingTime {
            text: dur.text,
            unit: dur.unit, // e.g. "Round", "Question" -> "Action" logic if needed
            base_value: dur.base_value,
            per_level: dur.per_level,
            level_divisor: dur.level_divisor,
        }
    }

    pub fn parse_area(&self, input: &str) -> SpellArea {
        let input_clean = input.trim();
        if let Some(caps) = self.area_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            // 2nd group usually unit like "ft"
            let _dist_unit = caps.get(2).map_or("", |m| m.as_str());
            // 3rd group shape like "radius"
            let shape = caps
                .get(3)
                .map_or("Special".to_string(), |m| title_case(m.as_str()));

            return SpellArea {
                text: input.to_string(),
                unit: shape, // using shape as "unit" per legacy behavior decisions
                base_value: base,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }
        SpellArea {
            text: input.to_string(),
            unit: "Special".to_string(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        }
    }

    pub fn parse_components(&self, input: &str) -> SpellComponents {
        // Strict parsing by splitting commas and trimming
        let mut v = false;
        let mut s = false;
        let mut m = false;

        let lower = input.to_lowercase();
        // Remove parentheticals for the basic check if they are "M (msg)" etc?
        // Actually, components are often "V, S, M (worth 500gp)".
        // Splitting by comma is safest.
        let parts: Vec<&str> = lower.split(',').collect();
        for part in parts {
            let p = part.trim();
            if p.starts_with('v') || p.starts_with("verbal") {
                v = true;
            } else if p.starts_with('s') || p.starts_with("somatic") {
                s = true;
            } else if p.starts_with('m') || p.starts_with("material") {
                m = true;
            }
        }

        SpellComponents {
            verbal: v,
            somatic: s,
            material: m,
        }
    }

    pub fn parse_damage(&self, input: &str) -> SpellDamage {
        let input_clean = input.trim();

        // 3. Capped Scaling: "1d6/level (max 10d6)"
        if let Some(caps) = self.damage_capped_regex.captures(input_clean) {
            let per_level_dice = caps
                .get(1)
                .map_or("".to_string(), |m| m.as_str().to_string());
            let max_dice_str = caps
                .get(2)
                .map_or("".to_string(), |m| m.as_str().to_string());

            let per_level_count = per_level_dice
                .split('d')
                .next()
                .unwrap_or("1")
                .parse::<f64>()
                .unwrap_or(1.0);
            let max_count = max_dice_str
                .split('d')
                .next()
                .unwrap_or("0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let cap_level = if per_level_count > 0.0 {
                Some(max_count / per_level_count)
            } else {
                None
            };

            return SpellDamage {
                text: input.to_string(),
                base_dice: "0".to_string(),
                per_level_dice,
                level_divisor: 1.0,
                cap_level,
            };
        }

        // 2. Scaling: "1d6/level" or "1d8 + 1d6/level"
        if let Some(caps) = self.damage_scaling_regex.captures(input_clean) {
            let base_dice = caps
                .get(1)
                .map_or("0".to_string(), |m| m.as_str().to_string());
            let per_level_dice = caps
                .get(2)
                .map_or("0".to_string(), |m| m.as_str().to_string());

            return SpellDamage {
                text: input.to_string(),
                base_dice,
                per_level_dice,
                level_divisor: 1.0,
                cap_level: None,
            };
        }

        // 1. Fixed: "1d6", "2d4+1"
        if let Some(caps) = self.damage_fixed_regex.captures(input_clean) {
            return SpellDamage {
                text: input.to_string(),
                base_dice: caps.get(1).unwrap().as_str().to_string(),
                per_level_dice: "0".to_string(),
                level_divisor: 1.0,
                cap_level: None,
            };
        }

        SpellDamage {
            text: input.to_string(),
            base_dice: "0".to_string(),
            per_level_dice: "0".to_string(),
            level_divisor: 1.0,
            cap_level: None,
        }
    }
}

fn title_case(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_range() {
        let parser = SpellParser::new();
        let res = parser.parse_range("10 yards");
        assert_eq!(res.text, "10 yards");
        assert_eq!(res.unit, "Yards");
        assert_eq!(res.base_value, 10.0);
        assert_eq!(res.per_level, 0.0);
    }

    #[test]
    fn test_parse_float_range() {
        let parser = SpellParser::new();
        let res = parser.parse_range("60.5 ft.");
        assert_eq!(res.base_value, 60.5);
        assert_eq!(res.unit, "Ft.");
    }

    #[test]
    fn test_parse_variable_range_ft_per_level() {
        let parser = SpellParser::new();
        let res = parser.parse_range("10 + 5/level yards");
        assert_eq!(res.base_value, 10.0);
        assert_eq!(res.per_level, 5.0);
        assert_eq!(res.unit, "Yards");

        let res2 = parser.parse_range("10 + 5.5/level yards");
        assert_eq!(res2.base_value, 10.0);
        assert_eq!(res2.per_level, 5.5);
    }

    #[test]
    fn test_parse_touch() {
        let parser = SpellParser::new();
        let res = parser.parse_range("Touch");
        assert_eq!(res.unit, "Touch");
        assert_eq!(res.base_value, 0.0);
    }

    #[test]
    fn test_parse_components() {
        let parser = SpellParser::new();
        let res = parser.parse_components("V, S, M");
        assert!(res.verbal);
        assert!(res.somatic);
        assert!(res.material);

        let res2 = parser.parse_components("V, S");
        assert!(res2.verbal);
        assert!(res2.somatic);
        assert!(!res2.material);
    }

    #[test]
    fn test_parse_components_false_positives() {
        // Bug: "M (small bell)" was matching "s" in "small" and setting somatic=true
        let parser = SpellParser::new();
        let res = parser.parse_components("M (small bell)");
        assert!(!res.verbal, "Should not be verbal");
        assert!(!res.somatic, "Should not be somatic");
        assert!(res.material, "Should be material");

        let res2 = parser.parse_components("V, M (see text)");
        assert!(res2.verbal);
        assert!(
            !res2.somatic,
            "see text contains 's' but should not trigger somatic"
        );
        assert!(res2.material);
    }

    #[test]
    fn test_parse_damage_cap() {
        let parser = SpellParser::new();
        let res = parser.parse_damage("1d6/level (max 10d6)");
        assert_eq!(res.per_level_dice, "1d6");
        assert_eq!(res.cap_level, Some(10.0));
    }

    #[test]
    fn test_parse_damage_fixed() {
        let parser = SpellParser::new();
        let res = parser.parse_damage("1d6");
        assert_eq!(res.base_dice, "1d6");
        assert_eq!(res.per_level_dice, "0");
        assert_eq!(res.cap_level, None);

        let res2 = parser.parse_damage("2d4+1");
        assert_eq!(res2.base_dice, "2d4+1");
    }

    #[test]
    fn test_parse_damage_scaling() {
        let parser = SpellParser::new();
        let res = parser.parse_damage("1d6/level");
        assert_eq!(res.base_dice, "0");
        assert_eq!(res.per_level_dice, "1d6");
        assert_eq!(res.cap_level, None);

        let res2 = parser.parse_damage("1d8 + 1d6/level");
        assert_eq!(res2.base_dice, "1d8");
        assert_eq!(res2.per_level_dice, "1d6");
    }

    #[test]
    fn test_unparseable_fallback() {
        let parser = SpellParser::new();
        let res = parser.parse_range("Special (see description)");
        assert_eq!(res.unit, "Special");
        assert_eq!(res.text, "Special (see description)");
    }

    #[test]
    fn test_parse_duration_simple() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("10 rounds");
        assert_eq!(res.base_value, 10.0);
        assert_eq!(res.unit, "Rounds");
    }

    #[test]
    fn test_parse_duration_per_level() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("1 round/level");
        assert_eq!(res.per_level, 1.0);
        assert_eq!(res.unit, "Round");
    }

    #[test]
    fn test_parse_duration_special_keywords() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("Instantaneous");
        assert_eq!(res.unit, "Instantaneous");

        let res2 = parser.parse_duration("Permanent");
        assert_eq!(res2.unit, "Permanent");
    }

    #[test]
    fn test_parse_casting_time() {
        let parser = SpellParser::new();
        let res = parser.parse_casting_time("1 action");
        assert_eq!(res.base_value, 1.0);
        assert_eq!(res.unit, "Action");

        let res2 = parser.parse_casting_time("10 minutes");
        assert_eq!(res2.base_value, 10.0);
        assert_eq!(res2.unit, "Minutes");
    }

    #[test]
    fn test_parse_area() {
        let parser = SpellParser::new();
        let res = parser.parse_area("20-foot radius");
        assert_eq!(res.base_value, 20.0);
        assert_eq!(res.unit, "Radius"); // Shape is captured as unit per current logic

        let res2 = parser.parse_area("30 ft. cone");
        assert_eq!(res2.base_value, 30.0);
        assert_eq!(res2.unit, "Cone");
    }

    #[test]
    fn test_parse_components_edge_cases() {
        let parser = SpellParser::new();
        // Case insensitive
        let res = parser.parse_components("v, s, m");
        assert!(res.verbal);
        assert!(res.somatic);
        assert!(res.material);

        // No spaces
        let res2 = parser.parse_components("V,S,M");
        assert!(res2.verbal);
        assert!(res2.somatic);
        assert!(res2.material);

        // Single
        let res3 = parser.parse_components("V");
        assert!(res3.verbal);
        assert!(!res3.somatic);
        assert!(!res3.material);

        // Empty
        let res4 = parser.parse_components("");
        assert!(!res4.verbal);
        assert!(!res4.somatic);
        assert!(!res4.material);
    }
}
