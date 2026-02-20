use crate::models::{CastingTimeUnit, MaterialComponentSpec, SpellCastingTime, SpellComponents};
use regex::Regex;

pub struct ComponentsParser;

impl Default for ComponentsParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ComponentsParser {
    pub fn new() -> Self {
        Self
    }

    pub fn parse_casting_time(&self, input: &str) -> SpellCastingTime {
        // Simple passthrough for now based on legacy implementation
        // or simplistic extraction of "1 round", "1 action", etc.
        // Based on original implementation:

        let input_clean = input.trim();
        if input_clean.is_empty() {
            return SpellCastingTime::default();
        }

        let lower = input_clean.to_lowercase();

        // Very basic parsing for 1 round / 1 action / instantaneous
        let base_val = input_clean
            .split_whitespace()
            .next()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(1.0);

        if lower.contains("bonus action") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::BonusAction,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("reaction") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Reaction,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("action") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Action,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("round") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Round,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("minute") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Minute,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("hour") {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Hour,
                base_value: Some(base_val),
                ..Default::default()
            };
        }
        if lower.contains("segment")
            || lower.contains("segments")
            || lower == "seg"
            || lower.ends_with(" seg")
        {
            return SpellCastingTime {
                text: input.to_string(),
                unit: CastingTimeUnit::Segment,
                base_value: Some(base_val),
                ..Default::default()
            };
        }

        SpellCastingTime {
            text: input.to_string(),
            unit: CastingTimeUnit::Special,
            base_value: Some(0.0),
            per_level: Some(0.0),
            level_divisor: Some(1.0),
            raw_legacy_value: Some(input.to_string()),
        }
    }

    pub fn parse_components(&self, input: &str) -> SpellComponents {
        let mut v = false;
        let mut s = false;
        let mut m = false;
        let mut f = false;
        let mut df = false;
        let mut e = false;

        let trimmed = input.trim();
        if trimmed.is_empty() {
            return SpellComponents {
                verbal: v,
                somatic: s,
                material: m,
                focus: f,
                divine_focus: df,
                experience: e,
            };
        }

        // Undelimited 1–3 letter component string (e.g. "VSM", "VS", "V")
        let has_delimiter = trimmed.contains(',')
            || trimmed.contains(';')
            || trimmed.contains('+')
            || trimmed.split_whitespace().count() > 1;
        if !has_delimiter && !trimmed.is_empty() && trimmed.len() <= 3 {
            let lower = trimmed.to_lowercase();
            if lower == "df" {
                df = true;
            } else {
                for ch in lower.chars() {
                    match ch {
                        'v' => v = true,
                        's' => s = true,
                        'm' => m = true,
                        'f' => f = true,
                        'e' => e = true,
                        _ => {}
                    }
                }
            }
            return SpellComponents {
                verbal: v,
                somatic: s,
                material: m,
                focus: f,
                divine_focus: df,
                experience: e,
            };
        }

        // Strict parsing by splitting commas and trimming
        let lower = trimmed
            .to_lowercase()
            .replace("divine focus", "divine-focus");
        let parts: Vec<&str> = lower
            .split(|c: char| c == ',' || c == ';' || c == '+' || c.is_whitespace())
            .collect();

        for part in parts {
            let p = part.trim().to_lowercase();
            if p.is_empty() {
                continue;
            }
            if p == "v" || p == "verbal" {
                v = true;
            } else if p == "s" || p == "somatic" {
                s = true;
            } else if p == "m" || p == "material" {
                m = true;
            } else if p == "f" || p == "focus" {
                f = true;
            } else if p == "df" || p == "divine focus" || p == "divine-focus" {
                df = true;
            } else if p == "e" || p == "xp" || p == "experience" {
                e = true;
            }
        }

        SpellComponents {
            verbal: v,
            somatic: s,
            material: m,
            focus: f,
            divine_focus: df,
            experience: e,
        }
    }

    pub fn parse_material_components(&self, input: &str) -> Vec<MaterialComponentSpec> {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" || input_clean == "none" {
            return vec![];
        }

        // Split by comma/semicolon but ignore those inside parentheses
        let raw_parts: Vec<&str> = input_clean.split(',').collect();
        let mut parts = Vec::new();
        let mut current_part = String::new();

        for part in raw_parts {
            if !current_part.is_empty() {
                current_part.push(',');
            }
            current_part.push_str(part);
            if current_part.matches('(').count() == current_part.matches(')').count() {
                parts.push(current_part.trim().to_string());
                current_part = String::new();
            }
        }
        if !current_part.is_empty() {
            parts.push(current_part.trim().to_string());
        }

        let mut results = Vec::new();
        let gp_regex = Regex::new(r"(?i)(?:worth\s+)?(\d+(?:\.\d+)?)\s*gp").unwrap();
        let consumed_regex = Regex::new(r"(?i)\b(consumed|expended|destroyed)\b").unwrap();
        // Remove entire parenthetical block containing gp value (handles "ruby (worth 1000 gp, consumed)")
        let paren_with_gp_regex =
            Regex::new(r"(?i)\([^)]*(?:worth\s+)?\d+(?:\.\d+)?\s*gp[^)]*\)").unwrap();
        let empty_parens_regex = Regex::new(r"\(\s*\)").unwrap();

        for p in parts {
            if p.is_empty() {
                continue;
            }
            let mut name = p.clone();
            let mut gp_value = None;
            let mut is_consumed = false;

            // Extract GP value
            if let Some(caps) = gp_regex.captures(&p) {
                gp_value = caps.get(1).and_then(|m| m.as_str().parse::<f64>().ok());
                // Remove the entire parenthetical block containing gp, OR just the gp match if not in parens
                if paren_with_gp_regex.is_match(&name) {
                    name = paren_with_gp_regex.replace_all(&name, "").to_string();
                } else {
                    name = gp_regex.replace_all(&name, "").to_string();
                }
            }

            // Detect and remove if consumed
            if consumed_regex.is_match(&p) {
                is_consumed = true;
                // Only remove if it wasn't already stripped by the paren removal
                if consumed_regex.is_match(&name) {
                    name = consumed_regex.replace_all(&name, "").to_string();
                }
            }

            // Clean up the name: trim and remove any remaining empty parentheses
            name = name.trim().to_string();
            name = empty_parens_regex.replace_all(&name, "").to_string();
            name = name.replace(" worth ", " "); // Final cleanup of lingering "worth" if any
            name = name.trim().to_string();

            results.push(MaterialComponentSpec {
                name: name.trim().to_string(),
                quantity: Some(1.0),
                unit: None,
                gp_value,
                is_consumed: Some(is_consumed),
                description: Some(p.clone()),
            });
        }

        results
    }

    pub fn extract_materials_from_components_line(
        &self,
        input: &str,
    ) -> Vec<MaterialComponentSpec> {
        let mut all_materials = Vec::new();
        // Regex to find "M (...)" or "Material (...)"
        // Captures exactly what is inside the parentheses
        // Look for M or Material preceded by start of string, space, or comma
        let m_regex = Regex::new(r"(?i)(?:^|[\s,])(?:M|Material)\s*\(([^)]+)\)").unwrap();

        for caps in m_regex.captures_iter(input) {
            if let Some(content) = caps.get(1) {
                let material_specs = self.parse_material_components(content.as_str());
                all_materials.extend(material_specs);
            }
        }

        all_materials
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_components() {
        let parser = ComponentsParser::new();
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
        let parser = ComponentsParser::new();
        // Ensure "M" doesn't trigger "V" or "S" partial matches if logic is flawed
        let res = parser.parse_components("M");
        assert!(!res.verbal);
        assert!(!res.somatic);
        assert!(res.material);

        // "Focus" -> F
        let res2 = parser.parse_components("V, F");
        assert!(res2.verbal);
        assert!(res2.focus);
    }

    #[test]
    fn test_parse_casting_time() {
        let parser = ComponentsParser::new();
        let res = parser.parse_casting_time("1 round");
        assert_eq!(res.unit, CastingTimeUnit::Round);

        let res2 = parser.parse_casting_time("1 action");
        assert_eq!(res2.unit, CastingTimeUnit::Action);
    }

    #[test]
    fn test_parse_components_edge_cases() {
        let parser = ComponentsParser::new();
        // "V, S, M (worth 500 gp)"
        let res = parser.parse_components("V, S, M (worth 500 gp)");
        assert!(res.verbal);
        assert!(res.somatic);
        assert!(res.material);

        let mats = parser.parse_material_components("rubies (worth 500 gp)");
        assert_eq!(mats.len(), 1);
        assert_eq!(mats[0].gp_value, Some(500.0));
        assert_eq!(mats[0].name, "rubies");

        let res_case = parser.parse_components("v, s, m");
        assert!(res_case.verbal);
        assert!(res_case.somatic);
        assert!(res_case.material);

        let res_no_space = parser.parse_components("V,S,M");
        assert!(res_no_space.verbal);
        assert!(res_no_space.somatic);
        assert!(res_no_space.material);
    }

    #[test]
    fn test_parse_material_component_valued() {
        let parser = ComponentsParser::new();

        // GIVEN "100gp diamond dust"
        let mats = parser.parse_material_components("diamond dust (100 gp)");
        assert_eq!(mats.len(), 1);
        assert_eq!(mats[0].gp_value, Some(100.0));
        assert_eq!(mats[0].name, "diamond dust");
        assert!(!mats[0].is_consumed.unwrap_or(false));

        // Test "worth" variant
        let mats2 = parser.parse_material_components("diamond dust (worth 100 gp)");
        assert_eq!(mats2.len(), 1);
        assert_eq!(mats2[0].gp_value, Some(100.0));
        assert_eq!(mats2[0].name, "diamond dust");
    }

    #[test]
    fn test_parse_material_component_consumed() {
        let parser = ComponentsParser::new();

        // Test consumed flag; name must be clean (no "ruby (, consumed)" remnant)
        let mats = parser.parse_material_components("ruby (worth 1000 gp, consumed)");
        assert_eq!(mats.len(), 1);
        assert_eq!(mats[0].gp_value, Some(1000.0));
        assert!(mats[0].is_consumed.unwrap_or(false));
        assert_eq!(mats[0].name, "ruby");

        // Test "expended" variant
        let mats2 = parser.parse_material_components("gem (100 gp, expended)");
        assert_eq!(mats2.len(), 1);
        assert!(mats2[0].is_consumed.unwrap_or(false));

        // Test "destroyed" variant
        let mats3 = parser.parse_material_components("crystal (50 gp, destroyed)");
        assert_eq!(mats3.len(), 1);
        assert!(mats3[0].is_consumed.unwrap_or(false));
    }

    #[test]
    fn test_parse_material_component_multiple() {
        let parser = ComponentsParser::new();

        // Multiple components
        let mats = parser.parse_material_components("bat guano, sulfur");
        assert_eq!(mats.len(), 2);
        assert_eq!(mats[0].name, "bat guano");
        assert_eq!(mats[1].name, "sulfur");
        assert_eq!(mats[0].gp_value, None);
        assert_eq!(mats[1].gp_value, None);

        // Multiple with values
        let mats2 = parser.parse_material_components("ruby (500 gp), diamond (1000 gp, consumed)");
        assert_eq!(mats2.len(), 2);
        assert_eq!(mats2[0].gp_value, Some(500.0));
        assert!(!mats2[0].is_consumed.unwrap_or(false));
        assert_eq!(mats2[1].gp_value, Some(1000.0));
        assert!(mats2[1].is_consumed.unwrap_or(false));
    }

    #[test]
    fn test_parse_material_component_edge_cases_empty() {
        let parser = ComponentsParser::new();

        // Empty input
        let mats = parser.parse_material_components("");
        assert_eq!(mats.len(), 0);

        // "None" string
        let mats2 = parser.parse_material_components("None");
        assert_eq!(mats2.len(), 0);

        // Case insensitive "none"
        let mats3 = parser.parse_material_components("none");
        assert_eq!(mats3.len(), 0);
    }

    #[test]
    fn test_parse_material_component_parentheses_handling() {
        let parser = ComponentsParser::new();

        // Complex string with commas inside parentheses
        let mats = parser.parse_material_components(
            "powdered gemstone (ruby, sapphire, or emerald worth 500 gp)",
        );
        assert_eq!(mats.len(), 1);
        assert_eq!(mats[0].gp_value, Some(500.0));
        assert!(mats[0].name.contains("powdered gemstone"));
    }

    #[test]
    fn test_parse_divine_focus_with_space() {
        let parser = ComponentsParser::new();
        // This is expected to fail currently
        let res = parser.parse_components("V, S, Divine Focus");
        assert!(res.verbal);
        assert!(res.somatic);
        assert!(
            res.divine_focus,
            "Failed to parse 'Divine Focus' with space"
        );
    }

    #[test]
    fn test_parse_casting_time_bonus_reaction() {
        let parser = ComponentsParser::new();

        let res = parser.parse_casting_time("1 bonus action");
        assert_eq!(res.unit, CastingTimeUnit::BonusAction);

        let res2 = parser.parse_casting_time("1 reaction");
        assert_eq!(res2.unit, CastingTimeUnit::Reaction);
    }

    #[test]
    fn test_parse_casting_time_segment() {
        let parser = ComponentsParser::new();

        let res = parser.parse_casting_time("1 segment");
        assert_eq!(res.unit, CastingTimeUnit::Segment);

        let res2 = parser.parse_casting_time("2 segments");
        assert_eq!(res2.unit, CastingTimeUnit::Segment);

        let res3 = parser.parse_casting_time("1 seg");
        assert_eq!(res3.unit, CastingTimeUnit::Segment);
    }

    #[test]
    fn test_parse_components_undelimited() {
        let parser = ComponentsParser::new();

        let res = parser.parse_components("VSM");
        assert!(res.verbal);
        assert!(res.somatic);
        assert!(res.material);

        let res2 = parser.parse_components("VS");
        assert!(res2.verbal);
        assert!(res2.somatic);
        assert!(!res2.material);

        let res3 = parser.parse_components("V");
        assert!(res3.verbal);
        assert!(!res3.somatic);
        assert!(!res3.material);

        let res4 = parser.parse_components("df");
        assert!(res4.divine_focus);
        assert!(!res4.verbal);
    }

    #[test]
    fn test_extract_materials_from_components_line() {
        let parser = ComponentsParser::new();

        // Standard case
        let mats = parser.extract_materials_from_components_line("V, S, M (ruby dust)");
        assert_eq!(mats.len(), 1);
        assert_eq!(mats[0].name, "ruby dust");

        // Multiple matches (rare but possible style)
        let mats2 = parser.extract_materials_from_components_line("M (sulfur), S, M (bat guano)");
        assert_eq!(mats2.len(), 2);
        assert_eq!(mats2[0].name, "sulfur");
        assert_eq!(mats2[1].name, "bat guano");

        // "Material" keyword
        let mats3 = parser.extract_materials_from_components_line("V, Material (gold)");
        assert_eq!(mats3.len(), 1);
        assert_eq!(mats3[0].name, "gold");

        // E2E test string
        let mats4 =
            parser.extract_materials_from_components_line("V, S, M (ruby dust worth 100gp)");
        assert_eq!(mats4.len(), 1);
        assert_eq!(mats4[0].name, "ruby dust");
        assert_eq!(mats4[0].gp_value, Some(100.0));

        // No match
        let mats5 = parser.extract_materials_from_components_line("V, S, M");
        assert_eq!(mats5.len(), 0);

        // E2E reproduction case
        let mats7 =
            parser.extract_materials_from_components_line("V, S, M (ruby dust worth 100gp)");
        assert_eq!(mats7.len(), 1);
        assert_eq!(mats7[0].name, "ruby dust");
        assert_eq!(mats7[0].gp_value, Some(100.0));
    }
}
