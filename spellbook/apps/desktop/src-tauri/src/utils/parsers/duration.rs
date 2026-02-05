use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
use crate::models::scalar::{ScalarMode, SpellScalar};
use regex::Regex;

pub struct DurationParser {
    duration_simple_regex: Regex,
    duration_divisor_regex: Regex,
    duration_usage_regex: Regex,
}

impl Default for DurationParser {
    fn default() -> Self {
        Self::new()
    }
}

impl DurationParser {
    pub fn new() -> Self {
        Self {
            duration_simple_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)$").unwrap(),
            duration_divisor_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)\s*/\s*(\d+)\s*levels?$").unwrap(),
            // Pattern: "6 uses", "1 charge/level", "3 strikes"
            duration_usage_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(?:/level)?\s*(uses?|charges?|activations?|strikes?|discharges?)(?:\s*/level)?$"#).unwrap(),
        }
    }

    pub fn parse(&self, input: &str) -> DurationSpec {
        let input_clean = input.trim();
        let mut lower = input_clean.to_lowercase();

        if lower == "instantaneous" || lower == "instant" {
            return DurationSpec {
                kind: DurationKind::Instant,
                ..Default::default()
            };
        }

        if lower == "permanent" {
            return DurationSpec {
                kind: DurationKind::Permanent,
                ..Default::default()
            };
        }

        if lower == "concentration" {
            return DurationSpec {
                kind: DurationKind::Concentration,
                ..Default::default()
            };
        }

        if lower == "until dispelled" {
            return DurationSpec {
                kind: DurationKind::UntilDispelled,
                ..Default::default()
            };
        }

        if lower == "dismissible" || lower == "(dismissible)" {
            return DurationSpec {
                kind: DurationKind::Special,
                notes: Some("Dismissible".to_string()),
                ..Default::default()
            };
        }

        // Triggered: "Until triggered", "Until triggered (by touch)"
        if lower.starts_with("until triggered") {
            let cond = if lower.len() > 15 {
                input_clean[15..]
                    .trim()
                    .trim_matches(|c| c == '(' || c == ')')
                    .trim()
                    .to_string()
            } else {
                "triggered".to_string()
            };
            return DurationSpec {
                kind: DurationKind::UntilTriggered,
                condition: Some(cond),
                ..Default::default()
            };
        }

        // Planar: "Planar", "Planar (until discharged)"
        if lower.starts_with("planar") {
            let cond = if lower.len() > 6 {
                input_clean[6..]
                    .trim()
                    .trim_matches(|c| c == '(' || c == ')')
                    .trim()
                    .to_string()
            } else {
                "planar presence".to_string()
            };
            return DurationSpec {
                kind: DurationKind::Planar,
                condition: Some(cond),
                ..Default::default()
            };
        }

        if lower.starts_with("until ") {
            let cond = &input_clean[6..];
            return DurationSpec {
                kind: DurationKind::Conditional,
                condition: Some(cond.to_string()),
                ..Default::default()
            };
        }

        if lower == "special" {
            return DurationSpec {
                kind: DurationKind::Special,
                notes: Some("Special".to_string()),
                ..Default::default()
            };
        }

        // Handle Usage Limited "6 uses", "1 charge/level"
        if let Some(caps) = self.duration_usage_regex.captures(&lower) {
            let val = caps
                .get(1)
                .map_or(1.0, |m| m.as_str().parse().unwrap_or(1.0));
            let is_per_level = lower.contains("/level");

            let scalar = if is_per_level {
                SpellScalar {
                    mode: ScalarMode::PerLevel,
                    per_level: Some(val),
                    ..Default::default()
                }
            } else {
                SpellScalar {
                    mode: ScalarMode::Fixed,
                    value: Some(val),
                    ..Default::default()
                }
            };

            return DurationSpec {
                kind: DurationKind::UsageLimited,
                uses: Some(scalar),
                ..Default::default()
            };
        }

        // Dual-duration splitting (e.g. "1 round/level or until discharged")
        let mut condition = None;
        let mut target_str = input_clean;
        if lower.contains(" or until ") {
            let parts: Vec<&str> = input_clean.splitn(2, " or until ").collect();
            if parts.len() == 2 {
                lower = parts[0].to_lowercase();
                target_str = parts[0];
                condition = Some(parts[1].to_string());
            }
        } else if lower.contains(" until ") {
            let parts: Vec<&str> = input_clean.splitn(2, " until ").collect();
            if parts.len() == 2 {
                lower = parts[0].to_lowercase();
                target_str = parts[0];
                condition = Some(parts[1].to_string());
            }
        }

        // Helper to map units
        let map_unit = |u: &str| -> Option<DurationUnit> {
            match u.to_lowercase().as_str() {
                "round" | "rounds" => Some(DurationUnit::Round),
                "turn" | "turns" => Some(DurationUnit::Turn),
                "minute" | "minutes" | "min" | "min." => Some(DurationUnit::Minute),
                "hour" | "hours" | "hr" | "hr." => Some(DurationUnit::Hour),
                "day" | "days" => Some(DurationUnit::Day),
                "week" | "weeks" => Some(DurationUnit::Week),
                "month" | "months" => Some(DurationUnit::Month),
                "year" | "years" => Some(DurationUnit::Year),
                "segment" | "segments" => Some(DurationUnit::Segment),
                _ => None,
            }
        };

        // Pattern 4: Per N Levels "1 round / 2 levels"
        if let Some(caps) = self.duration_divisor_regex.captures(target_str.trim()) {
            let per_level = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());
            let divisor = caps
                .get(3)
                .map_or(1.0, |m| m.as_str().parse().unwrap_or(1.0));

            let unit = map_unit(unit_raw);
            if let Some(u) = unit {
                let adjusted_per_level = if divisor > 0.0 {
                    per_level / divisor
                } else {
                    per_level
                };
                let scalar = SpellScalar {
                    mode: ScalarMode::PerLevel,
                    value: None,
                    per_level: Some(adjusted_per_level),
                    min_level: None,
                    max_level: None,
                    cap_value: None,
                    cap_level: None,
                    rounding: None,
                };

                return DurationSpec {
                    kind: DurationKind::Time,
                    unit: Some(u),
                    duration: Some(scalar),
                    condition,
                    ..Default::default()
                };
            }
        }

        // Helper for "1 round/level"
        let simplified = lower.replace(" /", "/").replace("/ ", "/");
        if simplified.contains("/level") {
            let parts: Vec<&str> = simplified.split("/level").collect();
            if let Some(first_part) = parts.first() {
                if let Some(caps) = self.duration_simple_regex.captures(first_part.trim()) {
                    let per_level = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let unit_raw = caps.get(2).map_or("", |m| m.as_str());
                    let unit = map_unit(unit_raw);

                    if let Some(u) = unit {
                        let scalar = SpellScalar {
                            mode: ScalarMode::PerLevel,
                            value: Some(0.0), // Explicit 0 base value for spec compliance
                            per_level: Some(per_level),
                            min_level: None,
                            max_level: None,
                            cap_value: None,
                            cap_level: None,
                            rounding: None,
                        };
                        return DurationSpec {
                            kind: DurationKind::Time,
                            unit: Some(u),
                            duration: Some(scalar),
                            condition,
                            ..Default::default()
                        };
                    }
                }
            }
        }

        if let Some(caps) = self.duration_simple_regex.captures(target_str.trim()) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());
            let unit = map_unit(unit_raw);

            if let Some(u) = unit {
                let scalar = SpellScalar {
                    mode: ScalarMode::Fixed,
                    value: Some(base),
                    per_level: None,
                    min_level: None,
                    max_level: None,
                    cap_value: None,
                    cap_level: None,
                    rounding: None,
                };
                return DurationSpec {
                    kind: DurationKind::Time,
                    unit: Some(u),
                    duration: Some(scalar),
                    condition,
                    ..Default::default()
                };
            }
        }

        DurationSpec {
            kind: DurationKind::Special,
            notes: Some(input.to_string()),
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::duration_spec::{DurationKind, DurationUnit};

    #[test]
    fn test_parse_duration_simple() {
        let parser = DurationParser::new();
        let res = parser.parse("10 rounds");
        let dur = res.duration.unwrap();
        assert_eq!(dur.value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(DurationUnit::Round));
    }

    #[test]
    fn test_parse_duration_per_level() {
        let parser = DurationParser::new();
        let res = parser.parse("1 round/level");
        let dur = res.duration.unwrap();
        assert_eq!(dur.per_level.unwrap(), 1.0);
        assert_eq!(res.unit, Some(DurationUnit::Round));
    }

    #[test]
    fn test_parse_duration_special_keywords() {
        let parser = DurationParser::new();
        let res = parser.parse("Instantaneous");
        assert_eq!(res.kind, DurationKind::Instant);

        let res2 = parser.parse("Permanent");
        assert_eq!(res2.kind, DurationKind::Permanent);
    }

    #[test]
    fn test_parse_duration_extended_keywords() {
        let parser = DurationParser::new();

        let res = parser.parse("Concentration");
        assert_eq!(res.kind, DurationKind::Concentration);

        let res2 = parser.parse("Until Dispelled");
        assert_eq!(res2.kind, DurationKind::UntilDispelled);

        let res3 = parser.parse("Until Triggered");
        assert_eq!(res3.kind, DurationKind::UntilTriggered);
    }

    #[test]
    fn test_parse_duration_usage_limited() {
        let parser = DurationParser::new();

        let res = parser.parse("6 uses");
        assert_eq!(res.kind, DurationKind::UsageLimited);
        assert_eq!(res.uses.unwrap().value.unwrap(), 6.0);

        let res2 = parser.parse("3 charges");
        assert_eq!(res2.kind, DurationKind::UsageLimited);
        assert_eq!(res2.uses.unwrap().value.unwrap(), 3.0);
    }

    #[test]
    fn test_parse_duration_planar_conditional() {
        let parser = DurationParser::new();

        let res = parser.parse("Planar");
        assert_eq!(res.kind, DurationKind::Planar);
        assert_eq!(res.condition.unwrap(), "planar presence");

        let res2 = parser.parse("Until the sun rises");
        assert_eq!(res2.kind, DurationKind::Conditional);
        assert_eq!(res2.condition.unwrap(), "the sun rises");
    }

    #[test]
    fn test_parse_duration_dual_splitting() {
        let parser = DurationParser::new();

        let res = parser.parse("1 round/level or until discharged");
        assert_eq!(res.kind, DurationKind::Time);
        assert_eq!(res.unit.unwrap(), DurationUnit::Round);
        assert_eq!(res.duration.unwrap().per_level.unwrap(), 1.0);
        assert_eq!(res.condition.unwrap(), "discharged");

        let res2 = parser.parse("10 minutes until used");
        assert_eq!(res2.kind, DurationKind::Time);
        assert_eq!(res2.unit.unwrap(), DurationUnit::Minute);
        assert_eq!(res2.duration.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.condition.unwrap(), "used");
    }

    #[test]
    fn test_parse_duration_enhanced_logic() {
        let parser = DurationParser::new();

        // Scaling usage
        let res = parser.parse("1 strike/level");
        assert_eq!(res.kind, DurationKind::UsageLimited);
        assert_eq!(res.uses.unwrap().per_level.unwrap(), 1.0);

        let res2 = parser.parse("3 charges/level");
        assert_eq!(res2.kind, DurationKind::UsageLimited);
        assert_eq!(res2.uses.unwrap().per_level.unwrap(), 3.0);

        // Trigger capture
        let res3 = parser.parse("Until triggered (by a loud noise)");
        assert_eq!(res3.kind, DurationKind::UntilTriggered);
        assert_eq!(res3.condition.unwrap(), "by a loud noise");

        // Planar capture
        let res4 = parser.parse("Planar (until discharged)");
        assert_eq!(res4.kind, DurationKind::Planar);
        assert_eq!(res4.condition.unwrap(), "until discharged");

        // Keywords
        let res5 = parser.parse("Dismissible");
        assert_eq!(res5.kind, DurationKind::Special);
        assert_eq!(res5.notes.unwrap(), "Dismissible");

        let res6 = parser.parse("Instant");
        assert_eq!(res6.kind, DurationKind::Instant);
    }
    #[test]
    fn test_issue_2_duration_parsing_value_zero() {
        let parser = DurationParser::new();
        let spec = parser.parse("1 round / level");

        let scalar = spec.duration.expect("Should have duration scalar");
        assert_eq!(scalar.mode, ScalarMode::PerLevel);
        assert_eq!(scalar.per_level, Some(1.0));
        assert_eq!(
            scalar.value,
            Some(0.0),
            "Per-level duration should have explicit value: 0.0"
        );
    }

    #[test]
    fn test_regression_spacing_and_divisors() {
        let parser = DurationParser::new();

        // Case 1: "1 round / level" with spaces (Fixed by simplified replace)
        let res = parser.parse("1 round / level");
        let dur = res.duration.unwrap();
        assert_eq!(dur.per_level.unwrap(), 1.0);
        assert_eq!(dur.value, Some(0.0), "Should resolve to value: 0 per spec");

        // Case 2: "1 round/ 2 levels" (Handled by regex \s*)
        let res2 = parser.parse("1 round/ 2 levels");
        let dur2 = res2.duration.unwrap();
        assert_eq!(dur2.per_level.unwrap(), 0.5); // 1 / 2

        // Case 3: "1 round / 2 levels" (Handled by regex \s*)
        let res3 = parser.parse("1 round / 2 levels");
        let dur3 = res3.duration.unwrap();
        assert_eq!(dur3.per_level.unwrap(), 0.5);

        // Case 4: "10 minutes / level"
        let res4 = parser.parse("10 minutes / level");
        let dur4 = res4.duration.unwrap();
        assert_eq!(dur4.per_level.unwrap(), 10.0);
    }
}
