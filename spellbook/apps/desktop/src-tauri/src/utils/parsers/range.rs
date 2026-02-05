use crate::models::scalar::{ScalarMode, SpellScalar};
use crate::models::{RangeAnchor, RangeContext, RangeKind, RangeSpec, RangeUnit, RegionUnit};
use regex::Regex;

pub struct RangeParser {
    range_simple_regex: Regex,
    range_variable_regex: Regex,
    range_per_level_regex: Regex,
    range_anchor_regex: Regex,
    range_region_regex: Regex,
}

impl Default for RangeParser {
    fn default() -> Self {
        Self::new()
    }
}

impl RangeParser {
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
            range_anchor_regex: Regex::new(r#"(?i)(?:from|centered on)\s+(caster|target|object|fixed|self|point of impact)"#).unwrap(),
            range_region_regex: Regex::new(r#"(?i)\((structure|building|bridge|ship|fortress|region|domain|demiplane|plane)\)"#).unwrap(),
        }
    }

    pub fn parse(&self, input: &str) -> RangeSpec {
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

        let mut res = if input_stripped.is_empty() {
            if let Some(fk) = force_kind {
                let kind = match fk {
                    RangeKind::DistanceLos => RangeKind::Los,
                    RangeKind::DistanceLoe => RangeKind::Loe,
                    _ => fk,
                };
                RangeSpec {
                    kind,
                    requires: requires.clone(),
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            } else {
                RangeSpec {
                    kind: RangeKind::Special,
                    requires: requires.clone(),
                    anchor,
                    region_unit,
                    ..Default::default()
                }
            }
        } else {
            let mut matched_spec = None;

            // 4. Keyword Mapping
            match input_stripped.as_str() {
                "personal" | "0" | "self" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Personal,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "touch" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Touch,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "unlimited" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Unlimited,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "sight" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Sight,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "hearing" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Hearing,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "voice" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Voice,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "senses" | "sensory" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Senses,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "room" | "same room" | "same_room" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::SameRoom,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "structure" | "same structure" | "same_structure" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::SameStructure,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "dungeon level" | "same dungeon level" | "same_dungeon_level" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::SameDungeonLevel,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "wilderness" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Wilderness,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "plane" | "same plane" | "same_plane" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::SamePlane,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "interplanar" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Interplanar,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "anywhere on plane" | "anywhere_on_plane" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::AnywhereOnPlane,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "domain" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Domain,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                "los" => {
                    matched_spec = Some(RangeSpec {
                        kind: RangeKind::Los,
                        anchor,
                        region_unit,
                        requires: requires.clone(),
                        ..Default::default()
                    });
                }
                _ => {}
            }

            if matched_spec.is_none() {
                // Helper to map units
                let map_unit = |u: &str| -> Option<RangeUnit> {
                    match u {
                        "foot" | "feet" | "ft." | "ft" | "'" => Some(RangeUnit::Ft),
                        "yard" | "yd." | "yd" | "yards" => Some(RangeUnit::Yd),
                        "mile" | "mi." | "mi" | "miles" => Some(RangeUnit::Mi),
                        "inch" | "in." | "in" | "inches" | "\"" => Some(RangeUnit::Inches),
                        _ => None,
                    }
                };

                // Pattern 2: Variable Scaling "10 + 5/level yards"
                if let Some(caps) = self.range_variable_regex.captures(&input_stripped) {
                    let base = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let unit1_raw = caps.get(2).map_or("", |m| m.as_str());
                    let per_level = caps
                        .get(3)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let mut unit_raw = caps.get(4).map(|m| m.as_str()).unwrap_or("");
                    if unit_raw.is_empty() {
                        unit_raw = unit1_raw;
                    }

                    let u1 = map_unit(unit1_raw);
                    let u2 = map_unit(unit_raw);

                    // Mixed Unit detection per spec: If both units are present and different, fallback to Special.
                    if u1.is_some() && u2.is_some() && u1 != u2 {
                        matched_spec = Some(RangeSpec {
                            kind: RangeKind::Special,
                            text: Some(input_stripped.to_string()),
                            ..Default::default()
                        });
                    } else {
                        let unit = u2.or(u1);
                        if let Some(u) = unit {
                            let kind = match u {
                                RangeUnit::Ft
                                | RangeUnit::Yd
                                | RangeUnit::Mi
                                | RangeUnit::Inches => force_kind.unwrap_or(RangeKind::Distance),
                            };

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

                            matched_spec = Some(RangeSpec {
                                kind,
                                unit: Some(u),
                                distance: Some(scalar),
                                requires: requires.clone(),
                                anchor,
                                region_unit,
                                ..Default::default()
                            });
                        }
                    }
                }
                // Pattern 3: Per-level only "5 ft/level"
                else if let Some(caps) = self.range_per_level_regex.captures(&input_stripped) {
                    let per_level = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let mut unit_raw = caps.get(2).map_or("", |m| m.as_str());
                    let unit2 = caps.get(3).map_or("", |m| m.as_str());
                    if unit_raw.is_empty() {
                        unit_raw = unit2;
                    }

                    let unit = map_unit(unit_raw);
                    if let Some(u) = unit {
                        let kind = match u {
                            RangeUnit::Ft | RangeUnit::Yd | RangeUnit::Mi | RangeUnit::Inches => {
                                force_kind.unwrap_or(RangeKind::Distance)
                            }
                        };
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
                        matched_spec = Some(RangeSpec {
                            kind,
                            unit: Some(u),
                            distance: Some(scalar),
                            requires: requires.clone(),
                            anchor,
                            region_unit,
                            ..Default::default()
                        });
                    }
                }
                // Pattern 1: Simple "10 yards"
                else if let Some(caps) = self.range_simple_regex.captures(&input_stripped) {
                    let base = caps
                        .get(1)
                        .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
                    let unit_raw = caps.get(2).map_or("", |m| m.as_str());

                    if let Some(u) = map_unit(unit_raw) {
                        matched_spec = Some(RangeSpec {
                            kind: force_kind.unwrap_or(RangeKind::Distance),
                            unit: Some(u),
                            distance: Some(SpellScalar {
                                mode: ScalarMode::Fixed,
                                value: Some(base),
                                per_level: None,
                                min_level: None,
                                max_level: None,
                                cap_value: None,
                                cap_level: None,
                                rounding: None,
                            }),
                            requires: requires.clone(),
                            anchor,
                            region_unit,
                            ..Default::default()
                        });
                    }
                }
            }

            matched_spec.unwrap_or_else(|| RangeSpec {
                kind: RangeKind::Special,
                requires: requires.clone(),
                anchor,
                region_unit,
                notes: Some(input_clean.to_string()),
                ..Default::default()
            })
        };

        res.text = Some(input_clean.to_string());
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::scalar::ScalarMode;
    use crate::models::{RangeAnchor, RangeContext, RangeKind, RangeUnit, RegionUnit};

    #[test]
    fn test_parse_simple_range() {
        let parser = RangeParser::new();
        let res = parser.parse("10 yards");
        assert_eq!(res.kind, RangeKind::Distance);
        assert_eq!(res.distance.unwrap().value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(RangeUnit::Yd));
    }

    #[test]
    fn test_parse_float_range() {
        let parser = RangeParser::new();
        let res = parser.parse("60.5 ft.");
        assert_eq!(res.kind, RangeKind::Distance);
        assert_eq!(res.distance.unwrap().value.unwrap(), 60.5);
        assert_eq!(res.unit, Some(RangeUnit::Ft));
    }

    #[test]
    fn test_parse_variable_range_ft_per_level() {
        let parser = RangeParser::new();
        let res = parser.parse("100 ft. + 10 ft./level");

        let dist = res.distance.unwrap();
        assert_eq!(dist.mode, ScalarMode::PerLevel);
        assert_eq!(dist.value.unwrap(), 100.0);
        assert_eq!(dist.per_level.unwrap(), 10.0);
        assert_eq!(res.unit, Some(RangeUnit::Ft));
    }

    #[test]
    fn test_parse_range_per_level_only() {
        let parser = RangeParser::new();
        let res = parser.parse("5 ft/level");
        assert_eq!(res.kind, RangeKind::Distance);
        assert_eq!(res.unit, Some(RangeUnit::Ft));
        let dist = res.distance.unwrap();
        assert_eq!(dist.per_level.unwrap(), 5.0);
        assert_eq!(dist.mode, ScalarMode::PerLevel);
    }

    #[test]
    fn test_parse_touch() {
        let parser = RangeParser::new();
        let res = parser.parse("Touch");
        assert_eq!(res.kind, RangeKind::Touch);
    }

    #[test]
    fn test_parse_shorthand_units() {
        let parser = RangeParser::new();

        // Range
        let r1 = parser.parse("10'");
        assert_eq!(r1.unit, Some(RangeUnit::Ft));
        let r2 = parser.parse("10 ft");
        assert_eq!(r2.unit, Some(RangeUnit::Ft));
        let r3 = parser.parse("10 yards");
        assert_eq!(r3.unit, Some(RangeUnit::Yd));
        let r4 = parser.parse("10 yd.");
        assert_eq!(r4.unit, Some(RangeUnit::Yd));
    }

    #[test]
    fn test_parse_range_los_loe_markers() {
        let parser = RangeParser::new();

        let r1 = parser.parse("120 yards (LOS)");
        assert_eq!(r1.kind, RangeKind::DistanceLos);
        assert_eq!(r1.distance.unwrap().value, Some(120.0));
        assert!(r1.requires.unwrap().contains(&RangeContext::Los));

        let r2 = parser.parse("Sight (LOE)");
        // Logic: LOE detected -> DistanceLoe force_kind. But "Sight" keyword matching returns RangeKind::Sight.
        // Wait, my implementation of `parse` checks keywords first or after?
        // In `range.rs`:
        // 1. Anchors
        // 2. Region Units
        // 3. LOS/LOE -> force_kind
        // 4. Keywords -> RETURNS IMMEDIATELY if matched.
        // So "Sight (LOE)" -> "Sight" -> RangeKind::Sight.
        // The requires LOE context is preserved?
        // Returning RangeSpec { kind: Sight, requires: Some([Loe]), ... }
        // Let's verify assertion
        assert_eq!(r2.kind, RangeKind::Sight);
        assert!(r2.requires.unwrap().contains(&RangeContext::Loe));
    }

    #[test]
    fn test_parse_range_enhanced_logic() {
        let parser = RangeParser::new();

        // 1. Narrative Keywords
        let res = parser.parse("Sight");
        assert_eq!(res.kind, RangeKind::Sight);

        let res2 = parser.parse("Same Room");
        assert_eq!(res2.kind, RangeKind::SameRoom);

        let res3 = parser.parse("Unlimited");
        assert_eq!(res3.kind, RangeKind::Unlimited);

        // 2. Anchors
        let res4 = parser.parse("60 ft. from target");
        assert_eq!(res4.kind, RangeKind::Distance);
        assert_eq!(res4.distance.as_ref().unwrap().value.unwrap(), 60.0);
        assert_eq!(res4.unit, Some(RangeUnit::Ft));
        assert_eq!(res4.anchor, Some(RangeAnchor::Target));

        let res5 = parser.parse("centered on object 30 yards");
        assert_eq!(res5.kind, RangeKind::Distance);
        assert_eq!(res5.distance.as_ref().unwrap().value.unwrap(), 30.0);
        assert_eq!(res5.anchor, Some(RangeAnchor::Object));

        // 3. Region Units
        let res6 = parser.parse("Domain (Structure)");
        assert_eq!(res6.kind, RangeKind::Domain);
        assert_eq!(res6.region_unit, Some(RegionUnit::Structure));

        // 4. Standalone LOS/LOE
        let res7 = parser.parse("Line of Sight");
        assert_eq!(res7.kind, RangeKind::Los);
        assert!(res7.requires.as_ref().unwrap().contains(&RangeContext::Los));
    }
}
