use crate::models::duration_spec::{DurationKind, DurationSpec, DurationUnit};
use crate::models::scalar::{ScalarMode, SpellScalar};
use crate::models::{
    AreaKind, AreaShapeUnit, AreaSpec, AreaUnit, CountSubject, ExperienceComponentSpec,
    ExperienceKind, ExperiencePayer, MagicResistanceKind, MagicResistanceSpec,
    MaterialComponentSpec, MrAppliesTo, PaymentSemantics, PaymentTiming, RangeAnchor, RangeContext,
    RangeKind, RangeSpec, RangeUnit, Recoverability, RegionUnit, SaveAppliesTo, SaveOutcomeEffect,
    SaveResult, SaveTiming, SaveType, SaveVs, SavingThrowKind, SavingThrowSpec, SingleSave,
    SpellCastingTime, SpellComponents, SpellDamageSpec, TileUnit,
};
use regex::Regex;

pub struct SpellParser {
    range_simple_regex: Regex,

    range_variable_regex: Regex,
    range_per_level_regex: Regex,
    duration_simple_regex: Regex,
    area_regex: Regex,
    area_multi_regex: Regex,
    area_count_regex: Regex,
    area_volume_regex: Regex,
    area_tile_regex: Regex,
    duration_divisor_regex: Regex,
    duration_usage_regex: Regex,
    range_anchor_regex: Regex,
    range_region_regex: Regex,
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
            // Pattern 3: Per-level only
            // Matches "5 ft/level", "5/level yards"
            range_per_level_regex: Regex::new(
                r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"]+)?\s*/\s*level(?:\s*([a-z\.'"]+))?$"#,
            )
            .unwrap(),

            // Duration Patterns
            duration_simple_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)$").unwrap(),
            duration_divisor_regex: Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.]+)\s*/\s*(\d+)\s*levels?$").unwrap(),
            // Pattern: "6 uses", "1 charge/level", "3 strikes"
            duration_usage_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(?:/level)?\s*(uses?|charges?|activations?|strikes?|discharges?)(?:\s*/level)?$"#).unwrap(),

            area_regex: Regex::new(r#"(?i)^(?:\s*(\d+(?:\.\d+)?)\s*[\s\-]*([a-z\.'"]+)\s+)?([a-z\.]+)$"#).unwrap(),
            // Pattern: "20' by 10' wall", "10x10 rect", "20 ft. x 10 ft. x 10 ft. rect_prism"
            // We use \s+ or word boundaries to separate units from "x/by" to avoid greediness
            area_multi_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?\s*(?:(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?)?\s*([a-z\._]+)$"#).unwrap(),
            // Pattern: "1 creature/level", "up to 6 targets", "6 objects"
            area_count_regex: Regex::new(r#"(?i)^(?:up\s+to\s+)?(\d+(?:\.\d+)?|1)\s*(?:/level)?\s*(creatures?|targets?|enemies?|allies?|objects?|undead|structures?)(?:\s*/level)?$"#).unwrap(),
            // Pattern: "1000 cubic feet", "500 cu. yd."
            area_volume_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(cubic|cu\.)\s*([a-z\.'"]+)$"#).unwrap(),
            // Pattern: "16 10ft. squares", "5 hexes"
            area_tile_regex: Regex::new(r#"(?i)^(\d+)\s*(?:(\d+(?:\.\d+)?)\s*([a-z\.'"]+)\s*)?(squares?|hexes?|rooms?|floors?)$"#).unwrap(),

            range_anchor_regex: Regex::new(r#"(?i)(?:from|centered on)\s+(caster|target|object|fixed|self|point of impact)"#).unwrap(),
            range_region_regex: Regex::new(r#"(?i)\((structure|building|bridge|ship|fortress|region|domain|demiplane|plane)\)"#).unwrap(),
        }
    }

    pub fn parse_range(&self, input: &str) -> RangeSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() {
            return RangeSpec::default();
        }

        let mut lower = input_clean.to_lowercase();
        let mut context = Vec::new();
        let mut anchor = None;
        let mut region_unit = None;

        // 1. Anchor Extraction
        if let Some(caps) = self.range_anchor_regex.captures(&lower) {
            let matched = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            anchor = match matched {
                "caster" | "self" => Some(RangeAnchor::Caster),
                "target" => Some(RangeAnchor::Target),
                "object" => Some(RangeAnchor::Object),
                "fixed" | "point of impact" => Some(RangeAnchor::Fixed),
                _ => None,
            };
            // Clean matched part
            lower = lower
                .replace(caps.get(0).unwrap().as_str(), "")
                .trim()
                .to_string();
        }

        // 2. Region Unit Extraction
        if let Some(caps) = self.range_region_regex.captures(&lower) {
            let matched = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            region_unit = match matched {
                "object" => Some(RegionUnit::Object),
                "structure" => Some(RegionUnit::Structure),
                "building" => Some(RegionUnit::Building),
                "bridge" => Some(RegionUnit::Bridge),
                "ship" => Some(RegionUnit::Ship),
                "fortress" => Some(RegionUnit::Fortress),
                "region" => Some(RegionUnit::Region),
                "domain" => Some(RegionUnit::Domain),
                "demiplane" => Some(RegionUnit::Demiplane),
                "plane" => Some(RegionUnit::Plane),
                _ => None,
            };
            lower = lower
                .replace(caps.get(0).unwrap().as_str(), "")
                .trim()
                .to_string();
        }

        // 3. Detect LOS/LOE markers
        let mut force_kind: Option<RangeKind> = None;

        if lower.contains("(los)") || lower.contains("line of sight") {
            context.push(RangeContext::Los);
            force_kind = Some(RangeKind::DistanceLos);
            lower = lower
                .replace("(los)", "")
                .replace("line of sight", "")
                .trim()
                .to_string();
        } else if lower.contains("(loe)") || lower.contains("line of effect") {
            context.push(RangeContext::Loe);
            force_kind = Some(RangeKind::DistanceLoe);
            lower = lower
                .replace("(loe)", "")
                .replace("line of effect", "")
                .trim()
                .to_string();
        }

        let requires = if context.is_empty() {
            None
        } else {
            Some(context)
        };
        let input_stripped = lower;

        if input_stripped.is_empty() {
            if let Some(fk) = force_kind {
                let kind = match fk {
                    RangeKind::DistanceLos => RangeKind::Los,
                    RangeKind::DistanceLoe => RangeKind::Loe,
                    _ => fk,
                };
                return RangeSpec {
                    kind,
                    requires,
                    anchor,
                    region_unit,
                    ..Default::default()
                };
            }
        }

        // 4. Keyword Mapping
        match input_stripped.as_str() {
            "personal" | "0" | "self" => {
                return RangeSpec {
                    kind: RangeKind::Personal,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "touch" => {
                return RangeSpec {
                    kind: RangeKind::Touch,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "unlimited" => {
                return RangeSpec {
                    kind: RangeKind::Unlimited,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "sight" => {
                return RangeSpec {
                    kind: RangeKind::Sight,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "hearing" => {
                return RangeSpec {
                    kind: RangeKind::Hearing,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "voice" => {
                return RangeSpec {
                    kind: RangeKind::Voice,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "senses" | "sensory" => {
                return RangeSpec {
                    kind: RangeKind::Senses,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "room" | "same room" | "same_room" => {
                return RangeSpec {
                    kind: RangeKind::SameRoom,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "structure" | "same structure" | "same_structure" => {
                return RangeSpec {
                    kind: RangeKind::SameStructure,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "dungeon level" | "same dungeon level" | "same_dungeon_level" => {
                return RangeSpec {
                    kind: RangeKind::SameDungeonLevel,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "wilderness" => {
                return RangeSpec {
                    kind: RangeKind::Wilderness,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "plane" | "same plane" | "same_plane" => {
                return RangeSpec {
                    kind: RangeKind::SamePlane,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "interplanar" => {
                return RangeSpec {
                    kind: RangeKind::Interplanar,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "anywhere on plane" | "anywhere_on_plane" => {
                return RangeSpec {
                    kind: RangeKind::AnywhereOnPlane,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "domain" => {
                return RangeSpec {
                    kind: RangeKind::Domain,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "los" => {
                return RangeSpec {
                    kind: RangeKind::Los,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            "loe" => {
                return RangeSpec {
                    kind: RangeKind::Loe,
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
            _ => {}
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
        if let Some(caps) = self.range_variable_regex.captures(&input_stripped) {
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
                force_kind.unwrap_or(RangeKind::Distance)
            } else {
                RangeKind::Special
            };

            // Create scalar manually
            let scalar = SpellScalar {
                mode: if per_level != 0.0 {
                    ScalarMode::PerLevel
                } else {
                    ScalarMode::Fixed
                },
                value: Some(base),
                per_level: Some(per_level),
                ..Default::default()
            };

            let notes = if unit.is_none() {
                Some(input_stripped.to_string())
            } else {
                None
            };

            return RangeSpec {
                kind,
                unit,
                distance: Some(scalar),
                requires,
                anchor,
                region_unit,
                notes,
            };
        }

        // Pattern 3: Per-level only "5 ft/level"
        if let Some(caps) = self.range_per_level_regex.captures(&input_stripped) {
            let per_level = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));

            let unit_raw = caps.get(3).or(caps.get(2)).map_or("", |m| m.as_str());

            let unit = map_unit(unit_raw);
            let kind = if unit.is_some() {
                force_kind.unwrap_or(RangeKind::Distance)
            } else {
                RangeKind::Special
            };

            let scalar = SpellScalar {
                mode: ScalarMode::PerLevel,
                per_level: Some(per_level),
                ..Default::default()
            };

            let notes = if unit.is_none() {
                Some(input_stripped.to_string())
            } else {
                None
            };

            return RangeSpec {
                kind,
                unit,
                distance: Some(scalar),
                requires,
                anchor,
                region_unit,
                notes,
            };
        }

        // Pattern 1: Simple "10 yards"
        if let Some(caps) = self.range_simple_regex.captures(&input_stripped) {
            let base = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());

            let unit = map_unit(unit_raw);

            // If unit is recognized, it's Distance. Else Special.
            if let Some(u) = unit {
                let scalar = SpellScalar {
                    mode: ScalarMode::Fixed,
                    value: Some(base),
                    ..Default::default()
                };
                return RangeSpec {
                    kind: force_kind.unwrap_or(RangeKind::Distance),
                    unit: Some(u),
                    distance: Some(scalar),
                    requires,
                    anchor,
                    region_unit,
                    notes: None,
                };
            }
        }

        // Fallback
        RangeSpec {
            kind: RangeKind::Special,
            requires,
            anchor,
            region_unit,
            notes: Some(input_clean.to_string()),
            ..Default::default()
        }
    }

    pub fn parse_duration(&self, input: &str) -> DurationSpec {
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
        if lower.contains("/level") {
            let parts: Vec<&str> = lower.split("/level").collect();
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
                            value: None,
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

    // Independent implementation of casting time parsing (LEGACY SCHEMA)
    pub fn parse_casting_time(&self, input: &str) -> SpellCastingTime {
        let input_clean = input.trim();
        let lower = input_clean.to_lowercase();

        let title_case = |s: &str| -> String {
            let mut c = s.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        };

        if lower == "instantaneous" {
            return SpellCastingTime {
                text: input.to_string(),
                unit: "Instantaneous".to_string(),
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

            return SpellCastingTime {
                text: input.to_string(),
                unit,
                base_value: 0.0,
                per_level,
                level_divisor: divisor,
            };
        }

        // Helper for "1 round/level"
        if lower.contains("/level") {
            let parts: Vec<&str> = lower.split("/level").collect();
            if let Some(first_part) = parts.first() {
                if let Some(caps) = self.duration_simple_regex.captures(first_part.trim()) {
                    let per_level = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let unit = caps
                        .get(2)
                        .map_or("Round".to_string(), |m| title_case(m.as_str()));
                    return SpellCastingTime {
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
            return SpellCastingTime {
                text: input.to_string(),
                unit,
                base_value: base,
                per_level: 0.0,
                level_divisor: 1.0,
            };
        }

        SpellCastingTime {
            text: input.to_string(),
            unit: "Special".to_string(),
            base_value: 0.0,
            per_level: 0.0,
            level_divisor: 1.0,
        }
    }

    pub fn parse_area(&self, input: &str) -> Option<AreaSpec> {
        let input_clean = input.trim();
        if input_clean.is_empty() {
            return None;
        }

        let lower = input_clean.to_lowercase();

        // Detect "Point" kind early if no digits present
        if lower == "point" || lower == "point of impact" || lower == "point of contact" {
            return Some(AreaSpec {
                kind: AreaKind::Point,
                unit: Some(AreaUnit::Ft),
                shape_unit: Some(AreaShapeUnit::Ft),
                ..Default::default()
            });
        }

        // Helper to map units
        let map_units = |u: &str| -> (Option<AreaUnit>, Option<AreaShapeUnit>) {
            match u {
                "foot" | "ft." | "ft" | "'" => (Some(AreaUnit::Ft), Some(AreaShapeUnit::Ft)),
                "yard" | "yd." | "yd" => (Some(AreaUnit::Yd), Some(AreaShapeUnit::Yd)),
                "mile" | "mi." | "mi" => (Some(AreaUnit::Mi), Some(AreaShapeUnit::Mi)),
                "inch" | "in." | "in" | "inches" | "\"" => {
                    (Some(AreaUnit::Inches), Some(AreaShapeUnit::Inches))
                }
                "square" | "sq." | "sq" => (Some(AreaUnit::Square), None),
                "ft2" | "sq. ft." | "sq ft" => (Some(AreaUnit::Ft2), Some(AreaShapeUnit::Ft)),
                "yd2" | "sq. yd." | "sq yd" => (Some(AreaUnit::Yd2), Some(AreaShapeUnit::Yd)),
                "ft3" | "cu. ft." | "cu ft" => (Some(AreaUnit::Ft3), Some(AreaShapeUnit::Ft)),
                "yd3" | "cu. yd." | "cu yd" => (Some(AreaUnit::Yd3), Some(AreaShapeUnit::Yd)),
                "hex" | "hexes" => (Some(AreaUnit::Hex), None),
                "room" | "rooms" => (Some(AreaUnit::Room), None),
                "floor" | "floors" => (Some(AreaUnit::Floor), None),
                _ => (None, None),
            }
        };

        // Helper to create SpellScalar
        let make_scalar = |v: f64| SpellScalar {
            mode: ScalarMode::Fixed,
            value: Some(v),
            per_level: None,
            min_level: None,
            max_level: None,
            cap_value: None,
            cap_level: None,
            rounding: None,
        };

        // 1. Multi-dimensional: "20' by 10' wall", "10x10 rect"
        if let Some(caps) = self.area_multi_regex.captures(&lower) {
            let val1 = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit1 = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let val2 = caps
                .get(3)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit2 = caps.get(4).map(|m| m.as_str()).unwrap_or("");
            let val3 = caps
                .get(5)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit3 = caps.get(6).map(|m| m.as_str()).unwrap_or("");
            let shape = caps.get(7).map(|m| m.as_str()).unwrap_or("");

            let (u1, su1) = map_units(unit1);
            let (_u2, su2) = map_units(unit2);
            let (_u3, su3) = map_units(unit3);

            let main_unit = u1.or(Some(AreaUnit::Ft));
            let main_shape_unit = su1.or(su2).or(su3).or(Some(AreaShapeUnit::Ft));

            match shape {
                "wall" => {
                    return Some(AreaSpec {
                        kind: AreaKind::Wall,
                        unit: main_unit,
                        shape_unit: main_shape_unit,
                        length: Some(make_scalar(val1)),
                        height: Some(make_scalar(val2)),
                        thickness: if val3 > 0.0 {
                            Some(make_scalar(val3))
                        } else {
                            None
                        },
                        ..Default::default()
                    });
                }
                "rect" | "square" => {
                    return Some(AreaSpec {
                        kind: AreaKind::Rect,
                        unit: main_unit,
                        shape_unit: main_shape_unit,
                        length: Some(make_scalar(val1)),
                        width: Some(make_scalar(val2)),
                        ..Default::default()
                    });
                }
                "rect_prism" => {
                    return Some(AreaSpec {
                        kind: AreaKind::RectPrism,
                        unit: main_unit,
                        shape_unit: main_shape_unit,
                        length: Some(make_scalar(val1)),
                        width: Some(make_scalar(val2)),
                        height: Some(make_scalar(val3)),
                        ..Default::default()
                    });
                }
                _ => {}
            }
        }

        // 2. Count-based: "1 creature/level", "6 objects"
        if let Some(caps) = self.area_count_regex.captures(&lower) {
            let count_str = caps.get(1).map_or("1", |m| m.as_str());
            let subject_str = caps.get(2).map_or("", |m| m.as_str());

            let val = count_str.parse::<f64>().unwrap_or(1.0);
            let is_per_level = lower.contains("/level");

            let kind = if subject_str.starts_with("object") {
                AreaKind::Objects
            } else {
                AreaKind::Creatures
            };

            let subject = match subject_str {
                "creature" | "creatures" => Some(CountSubject::Creature),
                "undead" => Some(CountSubject::Undead),
                "ally" | "allies" => Some(CountSubject::Ally),
                "enemy" | "enemies" => Some(CountSubject::Enemy),
                "object" | "objects" => Some(CountSubject::Object),
                "structure" | "structures" => Some(CountSubject::Structure),
                _ => Some(CountSubject::Creature),
            };

            let scalar = if is_per_level {
                SpellScalar {
                    mode: ScalarMode::PerLevel,
                    per_level: Some(val),
                    ..Default::default()
                }
            } else {
                make_scalar(val)
            };

            return Some(AreaSpec {
                kind,
                count: Some(scalar),
                count_subject: subject,
                ..Default::default()
            });
        }

        // 3. Volume: "1000 cubic feet"
        if let Some(caps) = self.area_volume_regex.captures(&lower) {
            let val = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(3).map_or("", |m| m.as_str());
            let (u, _su) = map_units(unit_raw);

            return Some(AreaSpec {
                kind: AreaKind::Volume,
                volume: Some(make_scalar(val)),
                unit: u.or(Some(AreaUnit::Ft3)),
                ..Default::default()
            });
        }

        // 4. Tiles: "16 10ft. squares"
        if let Some(caps) = self.area_tile_regex.captures(&lower) {
            let count = caps
                .get(1)
                .map_or(1.0, |m| m.as_str().parse().unwrap_or(1.0));
            let size = caps.get(2).map(|m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(3).map_or("", |m| m.as_str());
            let tile_unit_str = caps.get(4).map_or("", |m| m.as_str());

            let (u, su) = map_units(unit_raw);

            let tile_unit = match tile_unit_str {
                "square" | "squares" => Some(TileUnit::Square),
                "hex" | "hexes" => Some(TileUnit::Hex),
                "room" | "rooms" => Some(TileUnit::Room),
                "floor" | "floors" => Some(TileUnit::Floor),
                _ => None,
            };

            return Some(AreaSpec {
                kind: AreaKind::Tiles,
                tile_count: Some(make_scalar(count)),
                tile_unit,
                length: size.map(make_scalar), // For squares/hexes, size is often length
                unit: u,
                shape_unit: su,
                ..Default::default()
            });
        }

        // 5. Basic shapes: "20' radius", "10 ft. cone"
        if let Some(caps) = self.area_regex.captures(&lower) {
            let val = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());
            let shape_raw = caps.get(3).map_or("", |m| m.as_str());

            let (u, su) = map_units(unit_raw);

            let (kind, radius, length, width, height, thickness, edge): (
                AreaKind,
                Option<f64>,
                Option<f64>,
                Option<f64>,
                Option<f64>,
                Option<f64>,
                Option<f64>,
            ) = match shape_raw {
                "radius" => (
                    AreaKind::RadiusCircle,
                    Some(val),
                    None,
                    None,
                    None,
                    None,
                    None,
                ),
                "sphere" => (
                    AreaKind::RadiusSphere,
                    Some(val),
                    None,
                    None,
                    None,
                    None,
                    None,
                ),
                "cube" => (AreaKind::Cube, None, None, None, None, None, Some(val)),
                "cone" => (AreaKind::Cone, None, Some(val), None, None, None, None),
                "square" | "rect" | "rectangle" => {
                    (AreaKind::Rect, None, Some(val), Some(val), None, None, None)
                }
                "line" => (AreaKind::Line, None, Some(val), None, None, None, None),
                "wall" => (AreaKind::Wall, None, Some(val), None, None, None, None),
                "cylinder" => (AreaKind::Cylinder, Some(val), None, None, None, None, None),
                "point" => (AreaKind::Point, None, None, None, None, None, None),
                _ => (AreaKind::Special, None, None, None, None, None, None),
            };

            let is_special = kind == AreaKind::Special;

            return Some(AreaSpec {
                kind,
                unit: u.or(if is_special { None } else { Some(AreaUnit::Ft) }),
                shape_unit: su.or(if is_special {
                    None
                } else {
                    Some(AreaShapeUnit::Ft)
                }),
                radius: radius.map(make_scalar),
                length: length.map(make_scalar),
                width: width.map(make_scalar),
                height: height.map(make_scalar),
                thickness: thickness.map(make_scalar),
                edge: edge.map(make_scalar),
                notes: if is_special {
                    Some(input.to_string())
                } else {
                    None
                },
                ..Default::default()
            });
        }

        // Fallback
        Some(AreaSpec {
            kind: AreaKind::Special,
            notes: Some(input.to_string()),
            ..Default::default()
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
        let mut f = false;
        let mut df = false;
        let mut e = false;

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

    pub fn parse_damage(&self, input: &str) -> SpellDamageSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" {
            return SpellDamageSpec::default();
        }
        SpellDamageSpec {
            notes: Some(input_clean.to_string()),
            ..Default::default()
        }
    }

    pub fn parse_magic_resistance(&self, input: &str) -> MagicResistanceSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" || input_clean == "0" {
            return MagicResistanceSpec::default();
        }

        let mut kind = MagicResistanceKind::Normal;
        let lower = input_clean.to_lowercase();

        if lower.contains("special") {
            kind = MagicResistanceKind::Special;
        } else if lower.contains("none") || lower == "0" {
            kind = MagicResistanceKind::IgnoresMr;
        }

        MagicResistanceSpec {
            kind,
            applies_to: MrAppliesTo::WholeSpell,
            partial: None,
            special_rule: if kind == MagicResistanceKind::Special {
                Some(input_clean.to_string())
            } else {
                None
            },
            notes: Some(input_clean.to_string()),
        }
    }

    pub fn parse_saving_throw(&self, input: &str) -> SavingThrowSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" {
            return SavingThrowSpec::default();
        }

        let mut kind = SavingThrowKind::Single;
        let mut result_kind = SaveResult::NoEffect; // Default for "Negates"
        let mut save_vs = SaveVs::Spell;
        let mut modifier = 0;

        let lower = input_clean.to_lowercase();

        // Detect kind
        if lower.contains("neg") {
            kind = SavingThrowKind::Single;
            result_kind = SaveResult::NoEffect;
        } else if lower.contains("half") {
            kind = SavingThrowKind::Single;
            result_kind = SaveResult::ReducedEffect;
        } else if lower.contains("partial") {
            kind = SavingThrowKind::Single;
            result_kind = SaveResult::ReducedEffect;
        } else if lower.contains("special") {
            kind = SavingThrowKind::DmAdjudicated;
        }

        // Detect Save Vs
        if lower.contains("poison") {
            save_vs = SaveVs::Poison;
        } else if lower.contains("breath") {
            save_vs = SaveVs::Breath;
        } else if lower.contains("death") {
            save_vs = SaveVs::DeathMagic;
        } else if lower.contains("poly") {
            save_vs = SaveVs::Polymorph;
        } else if lower.contains("petri") {
            save_vs = SaveVs::Petrification;
        }

        // Detect modifier: "-2", "+4", etc.
        let mod_regex = Regex::new(r"([+\-]\d+)").unwrap();
        if let Some(caps) = mod_regex.captures(&lower) {
            modifier = caps
                .get(1)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or(0);
        }

        SavingThrowSpec {
            kind,
            single: Some(SingleSave {
                id: None,
                save_type: SaveType::Spell, // Default
                save_vs,
                modifier,
                applies_to: SaveAppliesTo::EachTarget,
                timing: SaveTiming::OnEffect,
                on_success: SaveOutcomeEffect {
                    result: result_kind.clone(),
                    notes: None,
                },
                on_failure: SaveOutcomeEffect {
                    result: SaveResult::FullEffect,
                    notes: None,
                },
            }),
            multiple: None,
            dm_guidance: None,
            notes: Some(input_clean.to_string()),
        }
    }

    pub fn parse_experience_cost(&self, input: &str) -> ExperienceComponentSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" || input_clean == "0" {
            return ExperienceComponentSpec::default();
        }

        let mut kind = ExperienceKind::Fixed;
        let mut amount_xp = None;
        let lower = input_clean.to_lowercase();

        // Extract fixed XP: "500 XP", "1,000 xp"
        let xp_regex = Regex::new(r"(\d+(?:,\d+)?)\s*xp").unwrap();
        if let Some(caps) = xp_regex.captures(&lower) {
            amount_xp = caps
                .get(1)
                .map(|m| m.as_str().replace(',', "").parse::<i32>().unwrap_or(0));
        }

        if lower.contains("special") || lower.contains("dm") {
            kind = ExperienceKind::DmAdjudicated;
        } else if lower.contains('/') || lower.contains("per") {
            kind = ExperienceKind::PerUnit;
        }

        ExperienceComponentSpec {
            kind,
            payer: ExperiencePayer::Caster,
            payment_timing: PaymentTiming::OnCompletion,
            payment_semantics: PaymentSemantics::Spend,
            can_reduce_level: true,
            recoverability: Recoverability::NormalEarning,
            amount_xp,
            per_unit: None,
            formula: None,
            tiered: None,
            dm_guidance: None,
            source_text: Some(input_clean.to_string()),
            notes: Some(input_clean.to_string()),
        }
    }

    pub fn parse_material_components(&self, input: &str) -> Vec<MaterialComponentSpec> {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" || input_clean == "none" {
            return vec![];
        }

        // Split by comma/semicolon but ignore those inside parentheses (e.g. "bead (10 gp, crushed)")
        // For simplicity, we'll split by comma and then recombine if mismatched parens
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
        let gp_regex = Regex::new(r"(?i)\((\d+(?:\.\d+)?)\s*gp\)").unwrap();
        let consumed_regex = Regex::new(r"(?i)\b(consumed|expended|destroyed)\b").unwrap();

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
                name = gp_regex.replace(&name, "").to_string();
            }

            // Detect if consumed
            if consumed_regex.is_match(&p) {
                is_consumed = true;
                // We keep the word in the name for now as it's often part of the description
            }

            results.push(MaterialComponentSpec {
                name: name.trim().to_string(),
                quantity: 1.0,
                unit: None,
                gp_value,
                is_consumed,
                description: Some(p.clone()),
            });
        }

        results
    }
}

// title_case was removed as unused

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::duration_spec::{DurationKind, DurationUnit};
    use crate::models::{CountSubject, RangeAnchor, RegionUnit, TileUnit};

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
    fn test_parse_range_per_level_only() {
        let parser = SpellParser::new();
        let res = parser.parse_range("5 ft/level");
        assert_eq!(res.kind, RangeKind::Distance);
        assert_eq!(res.unit, Some(RangeUnit::Ft));
        let dist = res.distance.unwrap();
        assert_eq!(dist.mode, ScalarMode::PerLevel);
        assert_eq!(dist.per_level.unwrap(), 5.0);
        assert!(dist.value.is_none());
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
        assert_eq!(res.notes.unwrap(), "1d6/level (max 10d6)");
    }

    #[test]
    fn test_parse_damage_fixed() {
        let parser = SpellParser::new();
        let res = parser.parse_damage("1d6");
        assert_eq!(res.notes.unwrap(), "1d6");

        let res2 = parser.parse_damage("2d4+1");
        assert_eq!(res2.notes.unwrap(), "2d4+1");
    }

    #[test]
    fn test_parse_damage_scaling() {
        let parser = SpellParser::new();
        let res = parser.parse_damage("1d6/level");
        assert_eq!(res.notes.unwrap(), "1d6/level");

        let res2 = parser.parse_damage("1d8 + 1d6/level");
        assert_eq!(res2.notes.unwrap(), "1d8 + 1d6/level");
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
        let dur = res.duration.unwrap();
        assert_eq!(dur.value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(DurationUnit::Round));
    }

    #[test]
    fn test_parse_duration_per_level() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("1 round/level");
        let dur = res.duration.unwrap();
        assert_eq!(dur.per_level.unwrap(), 1.0);
        assert_eq!(res.unit, Some(DurationUnit::Round));
    }

    #[test]
    fn test_parse_duration_special_keywords() {
        let parser = SpellParser::new();
        let res = parser.parse_duration("Instantaneous");
        assert_eq!(res.kind, DurationKind::Instant);

        let res2 = parser.parse_duration("Permanent");
        assert_eq!(res2.kind, DurationKind::Permanent);
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

    #[test]
    fn test_parse_range_los_loe_markers() {
        let parser = SpellParser::new();

        let res = parser.parse_range("120 yards (LOS)");
        assert_eq!(res.kind, RangeKind::DistanceLos);
        assert_eq!(res.unit, Some(RangeUnit::Yd));
        assert_eq!(res.distance.unwrap().value.unwrap(), 120.0);
        assert_eq!(res.requires.unwrap()[0], RangeContext::Los);

        let res2 = parser.parse_range("60 ft. line of effect");
        assert_eq!(res2.kind, RangeKind::DistanceLoe);
        assert_eq!(res2.unit, Some(RangeUnit::Ft));
        assert_eq!(res2.requires.unwrap()[0], RangeContext::Loe);
    }

    #[test]
    fn test_parse_duration_extended_keywords() {
        let parser = SpellParser::new();

        let res = parser.parse_duration("Concentration");
        assert_eq!(res.kind, DurationKind::Concentration);

        let res2 = parser.parse_duration("Until Dispelled");
        assert_eq!(res2.kind, DurationKind::UntilDispelled);

        let res3 = parser.parse_duration("Until Triggered");
        assert_eq!(res3.kind, DurationKind::UntilTriggered);
    }

    #[test]
    fn test_parse_area_extended_shapes() {
        let parser = SpellParser::new();

        let res = parser.parse_area("10 ft. sphere").unwrap();
        assert_eq!(res.kind, AreaKind::RadiusSphere);
        assert_eq!(res.radius.unwrap().value.unwrap(), 10.0);

        let res2 = parser.parse_area("15 ft. cylinder").unwrap();
        assert_eq!(res2.kind, AreaKind::Cylinder);
        assert_eq!(res2.radius.unwrap().value.unwrap(), 15.0);
        // Height is no longer defaulted
        assert!(res2.height.is_none());

        let res3 = parser.parse_area("30 ft. wall").unwrap();
        assert_eq!(res3.kind, AreaKind::Wall);
        assert_eq!(res3.length.unwrap().value.unwrap(), 30.0);
        // Height and thickness are no longer defaulted
        assert!(res3.height.is_none());
    }

    #[test]
    fn test_parse_duration_usage_limited() {
        let parser = SpellParser::new();

        let res = parser.parse_duration("6 uses");
        assert_eq!(res.kind, DurationKind::UsageLimited);
        assert_eq!(res.uses.unwrap().value.unwrap(), 6.0);

        let res2 = parser.parse_duration("3 charges");
        assert_eq!(res2.kind, DurationKind::UsageLimited);
        assert_eq!(res2.uses.unwrap().value.unwrap(), 3.0);
    }

    #[test]
    fn test_parse_duration_planar_conditional() {
        let parser = SpellParser::new();

        let res = parser.parse_duration("Planar");
        assert_eq!(res.kind, DurationKind::Planar);
        assert_eq!(res.condition.unwrap(), "planar presence");

        let res2 = parser.parse_duration("Until the sun rises");
        assert_eq!(res2.kind, DurationKind::Conditional);
        assert_eq!(res2.condition.unwrap(), "the sun rises");
    }

    #[test]
    fn test_parse_duration_dual_splitting() {
        let parser = SpellParser::new();

        let res = parser.parse_duration("1 round/level or until discharged");
        assert_eq!(res.kind, DurationKind::Time);
        assert_eq!(res.unit.unwrap(), DurationUnit::Round);
        assert_eq!(res.duration.unwrap().per_level.unwrap(), 1.0);
        assert_eq!(res.condition.unwrap(), "discharged");

        let res2 = parser.parse_duration("10 minutes until used");
        assert_eq!(res2.kind, DurationKind::Time);
        assert_eq!(res2.unit.unwrap(), DurationUnit::Minute);
        assert_eq!(res2.duration.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.condition.unwrap(), "used");
    }

    #[test]
    fn test_parse_area_multi_dimensions() {
        let parser = SpellParser::new();

        let res = parser.parse_area("20' by 10' wall").unwrap();
        assert_eq!(res.kind, AreaKind::Wall);
        assert_eq!(res.length.unwrap().value.unwrap(), 20.0);
        assert_eq!(res.height.unwrap().value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(AreaUnit::Ft));

        let res2 = parser.parse_area("10x10 rect").unwrap();
        assert_eq!(res2.kind, AreaKind::Rect);
        assert_eq!(res2.length.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.width.unwrap().value.unwrap(), 10.0);

        let res3 = parser
            .parse_area("20 ft. x 10 ft. x 5 ft. rect_prism")
            .unwrap();
        assert_eq!(res3.kind, AreaKind::RectPrism);
        assert_eq!(res3.length.unwrap().value.unwrap(), 20.0);
        assert_eq!(res3.width.unwrap().value.unwrap(), 10.0);
        assert_eq!(res3.height.unwrap().value.unwrap(), 5.0);
    }

    #[test]
    fn test_parse_area_counts() {
        let parser = SpellParser::new();

        let res = parser.parse_area("1 creature/level").unwrap();
        assert_eq!(res.kind, AreaKind::Creatures);
        assert_eq!(res.count.unwrap().per_level.unwrap(), 1.0);
        assert_eq!(res.count_subject, Some(CountSubject::Creature));

        let res2 = parser.parse_area("up to 6 targets").unwrap();
        assert_eq!(res2.kind, AreaKind::Creatures);
        assert_eq!(res2.count.unwrap().value.unwrap(), 6.0);
        assert_eq!(res2.count_subject, Some(CountSubject::Creature));

        let res3 = parser.parse_area("10 objects").unwrap();
        assert_eq!(res3.kind, AreaKind::Objects);
        assert_eq!(res3.count.unwrap().value.unwrap(), 10.0);
        assert_eq!(res3.count_subject, Some(CountSubject::Object));
    }

    #[test]
    fn test_parse_area_volume_and_tiles() {
        let parser = SpellParser::new();

        let res = parser.parse_area("1000 cubic feet").unwrap();
        assert_eq!(res.kind, AreaKind::Volume);
        assert_eq!(res.volume.unwrap().value.unwrap(), 1000.0);
        assert_eq!(res.unit, Some(AreaUnit::Ft3));

        let res2 = parser.parse_area("16 10ft. squares").unwrap();
        assert_eq!(res2.kind, AreaKind::Tiles);
        assert_eq!(res2.tile_count.unwrap().value.unwrap(), 16.0);
        assert_eq!(res2.length.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.tile_unit, Some(TileUnit::Square));

        let res3 = parser.parse_area("5 hexes").unwrap();
        assert_eq!(res3.kind, AreaKind::Tiles);
        assert_eq!(res3.tile_count.unwrap().value.unwrap(), 5.0);
        assert_eq!(res3.tile_unit, Some(TileUnit::Hex));
    }

    #[test]
    fn test_parse_area_point() {
        let parser = SpellParser::new();
        let res = parser.parse_area("point of impact").unwrap();
        assert_eq!(res.kind, AreaKind::Point);
        assert_eq!(res.unit, Some(AreaUnit::Ft)); // Default for non-special
    }

    #[test]
    fn test_parse_duration_enhanced_logic() {
        let parser = SpellParser::new();

        // Scaling usage
        let res = parser.parse_duration("1 strike/level");
        assert_eq!(res.kind, DurationKind::UsageLimited);
        assert_eq!(res.uses.unwrap().per_level.unwrap(), 1.0);

        let res2 = parser.parse_duration("3 charges/level");
        assert_eq!(res2.kind, DurationKind::UsageLimited);
        assert_eq!(res2.uses.unwrap().per_level.unwrap(), 3.0);

        // Trigger capture
        let res3 = parser.parse_duration("Until triggered (by a loud noise)");
        assert_eq!(res3.kind, DurationKind::UntilTriggered);
        assert_eq!(res3.condition.unwrap(), "by a loud noise");

        // Planar capture
        let res4 = parser.parse_duration("Planar (until discharged)");
        assert_eq!(res4.kind, DurationKind::Planar);
        assert_eq!(res4.condition.unwrap(), "until discharged");

        // Keywords
        let res5 = parser.parse_duration("Dismissible");
        assert_eq!(res5.kind, DurationKind::Special);
        assert_eq!(res5.notes.unwrap(), "Dismissible");

        let res6 = parser.parse_duration("Instant");
        assert_eq!(res6.kind, DurationKind::Instant);
    }

    #[test]
    fn test_parse_range_enhanced_logic() {
        let parser = SpellParser::new();

        // 1. Narrative Keywords
        let res = parser.parse_range("Sight");
        assert_eq!(res.kind, RangeKind::Sight);

        let res2 = parser.parse_range("Same Room");
        assert_eq!(res2.kind, RangeKind::SameRoom);

        let res3 = parser.parse_range("Unlimited");
        assert_eq!(res3.kind, RangeKind::Unlimited);

        // 2. Anchors
        let res4 = parser.parse_range("60 ft. from target");
        assert_eq!(res4.kind, RangeKind::Distance);
        assert_eq!(res4.distance.as_ref().unwrap().value.unwrap(), 60.0);
        assert_eq!(res4.unit, Some(RangeUnit::Ft));
        assert_eq!(res4.anchor, Some(RangeAnchor::Target));

        let res5 = parser.parse_range("centered on object 30 yards");
        assert_eq!(res5.kind, RangeKind::Distance);
        assert_eq!(res5.distance.as_ref().unwrap().value.unwrap(), 30.0);
        assert_eq!(res5.anchor, Some(RangeAnchor::Object));

        // 3. Region Units
        let res6 = parser.parse_range("Domain (Structure)");
        assert_eq!(res6.kind, RangeKind::Domain);
        assert_eq!(res6.region_unit, Some(RegionUnit::Structure));

        // 4. Standalone LOS/LOE
        let res7 = parser.parse_range("Line of Sight");
        assert_eq!(res7.kind, RangeKind::Los);
        assert!(res7.requires.as_ref().unwrap().contains(&RangeContext::Los));

        let res8 = parser.parse_range("100 miles (LOE)");
        assert_eq!(res8.kind, RangeKind::DistanceLoe);
        assert_eq!(res8.distance.as_ref().unwrap().value.unwrap(), 100.0);
        assert_eq!(res8.unit, Some(RangeUnit::Mi));
    }
}
