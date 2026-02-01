use crate::models::canonical_spell::{
    AreaKind, AreaShapeUnit, AreaSpec, AreaUnit, RangeKind, RangeSpec, RangeUnit, Scalar,
    ScalarMode, SpellCastingTime, SpellComponents, SpellDamage, SpellDuration,
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

    pub fn parse_range(&self, input: &str) -> RangeSpec {
        let input_clean = input.trim();
        let lower = input_clean.to_lowercase();

        if lower == "touch" {
            return RangeSpec {
                kind: RangeKind::Touch,
                unit: None,
                distance: None,
                requires: None,
                anchor: None,
                region_unit: None,
                notes: None,
            };
        }

        if lower == "unlimited" {
            return RangeSpec {
                kind: RangeKind::Unlimited,
                unit: None,
                distance: None,
                requires: None,
                anchor: None,
                region_unit: None,
                notes: None,
            };
        }

        if lower == "personal" || lower == "0" {
            return RangeSpec {
                kind: RangeKind::Personal,
                unit: None,
                distance: None,
                requires: None,
                anchor: None,
                region_unit: None,
                notes: None,
            };
        }

        // Helper to map units
        let map_unit = |u: &str| -> Option<RangeUnit> {
            match u.to_lowercase().as_str() {
                "ft" | "ft." | "foot" | "feet" | "'" => Some(RangeUnit::Ft),
                "yd" | "yd." | "yard" | "yards" => Some(RangeUnit::Yd),
                "mi" | "mi." | "mile" | "miles" => Some(RangeUnit::Mi),
                "in" | "in." | "inch" | "inches" | "\"" => Some(RangeUnit::Inches),
                _ => None,
            }
        };

        // Pattern 2: Variable Scaling "10 + 5/level yards"
        if let Some(caps) = self.range_variable_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            // Group 3 is the per_level value
            let per_level = caps
                .get(3)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));

            // Unit extraction logic from original parser
            let unit_raw = caps
                .get(5)
                .or(caps.get(4))
                .or(caps.get(2))
                .map_or("", |m| m.as_str());

            let unit = map_unit(unit_raw);
            let kind = if unit.is_some() {
                RangeKind::Distance
            } else {
                RangeKind::Special
            };

            // Create scalar manually as make_scalar might be simple
            let scalar = Scalar {
                mode: if per_level != 0.0 {
                    ScalarMode::PerLevel
                } else {
                    ScalarMode::Fixed
                },
                value: Some(base),
                per_level: Some(per_level),
                min_level: None,
                max_level: None,
                cap_value: None,
                cap_level: None,
                rounding: None,
            };

            let notes = if unit.is_none() {
                Some(input.to_string())
            } else {
                None
            };

            return RangeSpec {
                kind,
                unit,
                distance: Some(scalar),
                requires: None,
                anchor: None,
                region_unit: None,
                notes,
            };
        }

        // Pattern 1: Simple "10 yards"
        if let Some(caps) = self.range_simple_regex.captures(input_clean) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());

            let unit = map_unit(unit_raw);

            // If unit is recognized, it's Distance. Else Special.
            if let Some(u) = unit {
                let scalar = Scalar {
                    mode: ScalarMode::Fixed,
                    value: Some(base),
                    per_level: None,
                    min_level: None,
                    max_level: None,
                    cap_value: None,
                    cap_level: None,
                    rounding: None,
                };
                return RangeSpec {
                    kind: RangeKind::Distance,
                    unit: Some(u),
                    distance: Some(scalar),
                    requires: None,
                    anchor: None,
                    region_unit: None,
                    notes: None,
                };
            }
        }

        // Fallback
        RangeSpec {
            kind: RangeKind::Special,
            unit: None,
            distance: None,
            requires: None,
            anchor: None,
            region_unit: None,
            notes: Some(input.to_string()),
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

    pub fn parse_area(&self, input: &str) -> Option<AreaSpec> {
        let input_clean = input.trim();
        if input_clean.is_empty() {
            return None;
        }

        if let Some(caps) = self.area_regex.captures(input_clean) {
            let val = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));

            let unit_raw = caps
                .get(2)
                .map(|m| m.as_str().to_lowercase())
                .unwrap_or_default();
            let shape_raw = caps
                .get(3)
                .map(|m| m.as_str().to_lowercase())
                .unwrap_or_default();

            // Normalize unit first
            let parsed_unit = match unit_raw.as_str() {
                "foot" | "ft." | "ft" | "'" => Some((AreaUnit::Ft, AreaShapeUnit::Ft)),
                "yard" | "yd." | "yd" => Some((AreaUnit::Yd, AreaShapeUnit::Yd)),
                "mile" | "mi." | "mi" => Some((AreaUnit::Mi, AreaShapeUnit::Mi)),
                _ => None,
            };

            let (kind, unit, shape_unit, radius, length, width, edge) =
                match (parsed_unit, shape_raw.as_str()) {
                    // Radius
                    (Some((u, su)), "radius") => (
                        AreaKind::RadiusCircle,
                        Some(u),
                        Some(su),
                        Some(val),
                        None,
                        None,
                        None,
                    ),
                    (None, "radius") => (
                        AreaKind::RadiusCircle,
                        Some(AreaUnit::Ft),
                        Some(AreaShapeUnit::Ft),
                        Some(val),
                        None,
                        None,
                        None,
                    ),

                    // Cube
                    (Some((u, su)), "cube") => (
                        AreaKind::Cube,
                        Some(u),
                        Some(su),
                        None,
                        None,
                        None,
                        Some(val),
                    ),

                    // Cone
                    (Some((u, su)), "cone") => (
                        AreaKind::Cone,
                        Some(u),
                        Some(su),
                        None,
                        Some(val), // Length
                        None,
                        None,
                    ),
                    (None, "cone") => (
                        AreaKind::Cone,
                        Some(AreaUnit::Ft),
                        Some(AreaShapeUnit::Ft),
                        None,
                        Some(val),
                        None,
                        None,
                    ),

                    _ => (AreaKind::Special, None, None, None, None, None, None),
                };

            // Helper to create Scalar
            let make_scalar = |v: f64| Scalar {
                mode: ScalarMode::Fixed,
                value: Some(v),
                per_level: None,
                min_level: None,
                max_level: None,
                cap_value: None,
                cap_level: None,
                rounding: None,
            };

            return Some(AreaSpec {
                kind,
                unit,
                shape_unit,
                radius: radius.map(make_scalar),
                diameter: None,
                length: length.map(make_scalar),
                width: width.map(make_scalar),
                height: None,
                thickness: None,
                edge: edge.map(make_scalar),
                angle_deg: None,
                surface_area: None,
                volume: None,
                tile_unit: None,
                tile_count: None,
                count: None,
                count_subject: None,
                region_unit: None,
                scope_unit: None,
                moves_with: None,
                notes: Some(input.to_string()), // Preserve original text in notes
            });
        }

        // Fallback for non-regex matches
        Some(AreaSpec {
            kind: AreaKind::Special,
            unit: None,
            shape_unit: None,
            radius: None,
            diameter: None,
            length: None,
            width: None,
            height: None,
            thickness: None,
            edge: None,
            angle_deg: None,
            surface_area: None,
            volume: None,
            tile_unit: None,
            tile_count: None,
            count: None,
            count_subject: None,
            region_unit: None,
            scope_unit: None,
            moves_with: None,
            notes: Some(input.to_string()),
        })
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
        assert_eq!(res.kind, RangeKind::Distance);
        assert_eq!(res.unit, Some(RangeUnit::Yd));
        assert_eq!(res.distance.unwrap().value.unwrap(), 10.0);
    }

    #[test]
    fn test_parse_float_range() {
        let parser = SpellParser::new();
        let res = parser.parse_range("60.5 ft.");
        assert_eq!(res.distance.unwrap().value.unwrap(), 60.5);
        assert_eq!(res.unit, Some(RangeUnit::Ft));
    }

    #[test]
    fn test_parse_variable_range_ft_per_level() {
        let parser = SpellParser::new();
        let res = parser.parse_range("10 + 5/level yards");
        let dist = res.distance.unwrap();
        assert_eq!(dist.value.unwrap(), 10.0);
        assert_eq!(dist.per_level.unwrap(), 5.0);
        assert_eq!(res.unit, Some(RangeUnit::Yd));

        let res2 = parser.parse_range("10 + 5.5/level yards");
        let dist2 = res2.distance.unwrap();
        assert_eq!(dist2.value.unwrap(), 10.0);
        assert_eq!(dist2.per_level.unwrap(), 5.5);
    }

    #[test]
    fn test_parse_touch() {
        let parser = SpellParser::new();
        let res = parser.parse_range("Touch");
        assert_eq!(res.kind, RangeKind::Touch);
        assert_eq!(res.unit, None);
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
        assert_eq!(res.kind, RangeKind::Special);
        assert_eq!(res.notes.unwrap(), "Special (see description)");
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
        let res = parser.parse_area("20-foot radius").unwrap();
        assert_eq!(res.radius.unwrap().value.unwrap(), 20.0);
        assert_eq!(res.kind, AreaKind::RadiusCircle);
        assert_eq!(res.unit.unwrap(), AreaUnit::Ft);

        let res2 = parser.parse_area("30 ft. cone").unwrap();
        assert_eq!(res2.length.unwrap().value.unwrap(), 30.0);
        assert_eq!(res2.kind, AreaKind::Cone);
        assert_eq!(res2.unit.unwrap(), AreaUnit::Ft);
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
        assert_eq!(res.distance.unwrap().value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(RangeUnit::Ft));

        let res2 = parser.parse_range("6\"");
        assert_eq!(res2.distance.unwrap().value.unwrap(), 6.0);
        assert_eq!(res2.unit, Some(RangeUnit::Inches));

        let res3 = parser.parse_range("10' + 5'/level");
        let dist3 = res3.distance.unwrap();
        assert_eq!(dist3.value.unwrap(), 10.0);
        assert_eq!(dist3.per_level.unwrap(), 5.0);
        assert_eq!(res3.unit, Some(RangeUnit::Ft));

        // Area Shorthand
        let area = parser.parse_area("20' radius").unwrap();
        assert_eq!(area.radius.unwrap().value.unwrap(), 20.0);
        assert_eq!(area.kind, AreaKind::RadiusCircle);
        assert_eq!(area.unit.unwrap(), AreaUnit::Ft);

        let area2 = parser.parse_area("10' cube").unwrap();
        assert_eq!(area2.edge.unwrap().value.unwrap(), 10.0);
        assert_eq!(area2.kind, AreaKind::Cube);
        assert_eq!(area2.unit.unwrap(), AreaUnit::Ft);
    }
}
