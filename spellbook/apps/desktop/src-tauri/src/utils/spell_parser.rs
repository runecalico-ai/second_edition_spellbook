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
    duration_divisor_regex: Regex,
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
            // Matches "10 yards", "60.5 ft.", "3", "10'"
            range_simple_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"]+)$"#).unwrap(),

            // Pattern 2: Variable Scaling
            // Matches "10 yards + 5/level yards", "10 + 10/level", "10 yards + 5 yards/level"
            range_variable_regex: Regex::new(
                r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"]+)?\s*\+\s*(\d+(?:\.\d+)?)(?:\s*([a-z\.'"]+))?/level(?:\s*([a-z\.'"]+))?$"#,
            )
            .unwrap(),

            // Pattern 3: Simple Duration/Casting Time
            duration_simple_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)$").unwrap(),

            // Pattern 4: Per N Levels (e.g., "1 round / 2 levels")
            duration_divisor_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)?\s*/\s*(\d+)\s*levels?$").unwrap(),

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

            area_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*[\s\-]*([a-z\.'"]+)(?:\s+([a-z\.]+))?$"#)
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
                .get(3)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));

            // Unit can be in group 2 (base unit), 4 (per-level unit), or 5 (trailing unit)
            let unit_raw = caps
                .get(5)
                .or(caps.get(4))
                .or(caps.get(2))
                .map_or("Special", |m| m.as_str());

            let unit = match unit_raw {
                "'" => "Ft.".to_string(),
                "\"" => "In.".to_string(),
                _ => title_case(unit_raw),
            };

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
            let unit_raw = caps.get(2).map_or("Special", |m| m.as_str());

            let unit = match unit_raw {
                "'" => "Ft.".to_string(),
                "\"" => "In.".to_string(),
                _ => title_case(unit_raw),
            };

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

        // Pattern 4: Per N Levels "1 round / 2 levels"
        if let Some(caps) = self.duration_divisor_regex.captures(input_clean) {
            let per_level = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit = caps
                .get(2)
                .map_or("Round".to_string(), |m| title_case(m.as_str()));
            let divisor = caps
                .get(3)
                .map_or(1.0, |m| m.as_str().parse().unwrap_or(1.0));

            return SpellDuration {
                text: input.to_string(),
                unit,
                base_value: 0.0,
                per_level,
                level_divisor: divisor,
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

            let dist_unit = caps
                .get(2)
                .map(|m| m.as_str().to_lowercase())
                .unwrap_or_default();
            let shape = caps
                .get(3)
                .map(|m| m.as_str().to_lowercase())
                .unwrap_or_default();

            let unit = match (dist_unit.as_str(), shape.as_str()) {
                ("foot" | "ft." | "ft" | "'", "radius") => "Foot Radius".to_string(),
                ("yard" | "yd." | "yd", "radius") => "Yard Radius".to_string(),
                ("mile" | "mi." | "mi", "radius") => "Mile Radius".to_string(),
                ("foot" | "ft." | "ft" | "'", "cube") => "Foot Cube".to_string(),
                ("yard" | "yd." | "yd", "cube") => "Yard Cube".to_string(),
                (_, "radius") => "Foot Radius".to_string(), // Default shape if unit unknown
                (_, "cube") => "Foot Cube".to_string(),
                _ => "Special".to_string(),
            };

            return SpellArea {
                text: input.to_string(),
                unit,
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
        let parts: Vec<&str> = lower
            .split(|c: char| c == ',' || c == ';' || c == '+' || c.is_whitespace())
            .collect();
        for part in parts {
            let p = part.trim();
            if p.is_empty() {
                continue;
            }
            if p == "v" || p == "verbal" {
                v = true;
            } else if p == "s" || p == "somatic" {
                s = true;
            } else if p == "m" || p == "material" {
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
        assert_eq!(res.unit, "Foot Radius"); // Shape is captured as unit per current logic

        let res2 = parser.parse_area("30 ft. cone");
        assert_eq!(res2.base_value, 30.0);
        assert_eq!(res2.unit, "Special");
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

    #[test]
    fn test_parse_shorthand_units() {
        let parser = SpellParser::new();

        // Range Shorthand
        let res = parser.parse_range("10'");
        assert_eq!(res.base_value, 10.0);
        assert_eq!(res.unit, "Ft.");

        let res2 = parser.parse_range("6\"");
        assert_eq!(res2.base_value, 6.0);
        assert_eq!(res2.unit, "In.");

        let res3 = parser.parse_range("10' + 5'/level");
        assert_eq!(res3.base_value, 10.0);
        assert_eq!(res3.per_level, 5.0);
        assert_eq!(res3.unit, "Ft.");

        // Area Shorthand
        let area = parser.parse_area("20' radius");
        assert_eq!(area.base_value, 20.0);
        assert_eq!(area.unit, "Foot Radius");

        let area2 = parser.parse_area("10' cube");
        assert_eq!(area2.base_value, 10.0);
        assert_eq!(area2.unit, "Foot Cube");
    }
}
