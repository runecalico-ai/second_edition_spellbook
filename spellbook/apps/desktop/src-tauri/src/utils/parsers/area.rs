use crate::models::scalar::{ScalarMode, SpellScalar};
use crate::models::{AreaKind, AreaShapeUnit, AreaSpec, AreaUnit, CountSubject, TileUnit};
use regex::Regex;

pub struct AreaParser {
    area_simple_regex: Regex,
    area_variable_regex: Regex,
    area_per_level_regex: Regex,
    area_multi_regex: Regex,
    area_count_regex: Regex,
    area_volume_regex: Regex,
    area_tile_regex: Regex,
}

impl Default for AreaParser {
    fn default() -> Self {
        Self::new()
    }
}

impl AreaParser {
    pub fn new() -> Self {
        Self {
            area_simple_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"\-]+)?\s*([a-z\._-]+)$"#).unwrap(),
            area_variable_regex: Regex::new(
                r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"\-]+)?\s*\+\s*(\d+(?:\.\d+)?)\s*([a-z\.'"\-]+)?/level\s*([a-z\._-]+)$"#,
            ).unwrap(),
            area_per_level_regex: Regex::new(
                r#"(?i)^(\d+(?:\.\d+)?)\s*([a-z\.'"\-]+)?/level\s*([a-z\._-]+)$"#,
            ).unwrap(),
            // Pattern: "20' by 10' wall", "10x10 rect", "20 ft. x 10 ft. x 10 ft. rect_prism"
            // We use \s+ or word boundaries to separate units from "x/by" to avoid greediness
            area_multi_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?\s*(?:(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(ft\.|ft|yards?|yd\.|mi|in\.|in|inches|'|")?)?\s*([a-z\._-]+)$"#).unwrap(),
            // Pattern: "1 creature/level", "up to 6 targets", "6 objects"
            area_count_regex: Regex::new(r#"(?i)^(?:up\s+to\s+)?(\d+(?:\.\d+)?|1)\s*(?:/level)?\s*(creatures?|targets?|enemies?|allies?|objects?|undead|structures?)(?:\s*/level)?$"#).unwrap(),
            // Pattern: "1000 cubic feet", "500 cu. yd."
            area_volume_regex: Regex::new(r#"(?i)^(\d+(?:\.\d+)?)\s*(cubic|cu\.)\s*([a-z\.'"-]+)$"#).unwrap(),
            // Pattern: "16 10ft. squares", "5 hexes"
            area_tile_regex: Regex::new(r#"(?i)^(\d+)\s*(?:(\d+(?:\.\d+)?)\s*([a-z\.'"-]+)\s*)?(squares?|hexes?|rooms?|floors?)$"#).unwrap(),
        }
    }

    pub fn parse(&self, input: &str) -> Option<AreaSpec> {
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
            let u_clean = u.trim_start_matches('-');
            match u_clean {
                "foot" | "ft." | "ft" | "'" | "feet" => {
                    (Some(AreaUnit::Ft), Some(AreaShapeUnit::Ft))
                }
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
                unit: u
                    .map(|unit| match unit {
                        AreaUnit::Ft => AreaUnit::Ft3,
                        AreaUnit::Yd => AreaUnit::Yd3,
                        _ => unit,
                    })
                    .or(Some(AreaUnit::Ft3)),
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

        // 5. Variable Scaling shapes: "10 ft. + 5 ft./level radius"
        if let Some(caps) = self.area_variable_regex.captures(&lower) {
            let val1 = caps[1].parse().unwrap_or(0.0);
            let unit1 = caps.get(2).map_or("", |m| m.as_str());
            let val2 = caps[3].parse().unwrap_or(0.0);
            let unit2 = caps.get(4).map_or("", |m| m.as_str());
            let shape_raw = caps.get(5).map_or("", |m| m.as_str());

            let final_unit = if !unit2.is_empty() { unit2 } else { unit1 };
            let (u, su) = map_units(final_unit);
            let scalar = SpellScalar {
                mode: ScalarMode::PerLevel,
                value: Some(val1),
                per_level: Some(val2),
                ..Default::default()
            };
            return self.build_spec(shape_raw, Some(scalar), u, su, input);
        }

        // 6. Per-level only shapes: "5 ft./level radius"
        if let Some(caps) = self.area_per_level_regex.captures(&lower) {
            let val = caps[1].parse().unwrap_or(0.0);
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());
            let shape_raw = caps.get(3).map_or("", |m| m.as_str());

            let (u, su) = map_units(unit_raw);
            let scalar = SpellScalar {
                mode: ScalarMode::PerLevel,
                value: None,
                per_level: Some(val),
                ..Default::default()
            };
            return self.build_spec(shape_raw, Some(scalar), u, su, input);
        }

        // 7. Simple shapes: "20' radius"
        if let Some(caps) = self.area_simple_regex.captures(&lower) {
            let val = caps
                .get(1)
                .map_or(0.0, |m| m.as_str().parse().unwrap_or(0.0));
            let unit_raw = caps.get(2).map_or("", |m| m.as_str());
            let shape_raw = caps.get(3).map_or("", |m| m.as_str());

            let (u, su) = map_units(unit_raw);
            return self.build_spec(shape_raw, Some(make_scalar(val)), u, su, input);
        }

        // Fallback
        Some(AreaSpec {
            kind: AreaKind::Special,
            notes: Some(input.to_string()),
            ..Default::default()
        })
    }

    fn build_spec(
        &self,
        shape_raw: &str,
        scalar: Option<SpellScalar>,
        u: Option<AreaUnit>,
        su: Option<AreaShapeUnit>,
        input: &str,
    ) -> Option<AreaSpec> {
        let mut radius = None;
        let mut length = None;
        let mut width = None;
        let height = None;
        let thickness = None;
        let mut edge = None;

        let kind = match shape_raw {
            "radius" => {
                radius = scalar;
                AreaKind::RadiusCircle
            }
            "sphere" => {
                radius = scalar;
                AreaKind::RadiusSphere
            }
            "cube" => {
                edge = scalar;
                AreaKind::Cube
            }
            "cone" => {
                length = scalar;
                AreaKind::Cone
            }
            "square" | "rect" | "rectangle" => {
                length = scalar.clone();
                width = scalar;
                AreaKind::Rect
            }
            "line" => {
                length = scalar;
                AreaKind::Line
            }
            "wall" => {
                length = scalar;
                AreaKind::Wall
            }
            "cylinder" => {
                radius = scalar;
                AreaKind::Cylinder
            }
            "point" => AreaKind::Point,
            _ => AreaKind::Special,
        };

        let is_special = kind == AreaKind::Special;

        Some(AreaSpec {
            kind,
            unit: u.or(if is_special { None } else { Some(AreaUnit::Ft) }),
            shape_unit: su.or(if is_special {
                None
            } else {
                Some(AreaShapeUnit::Ft)
            }),
            radius,
            length,
            width,
            height,
            thickness,
            edge,
            notes: if is_special {
                Some(input.to_string())
            } else {
                None
            },
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AreaKind, AreaUnit, CountSubject, TileUnit};

    #[test]
    fn test_parse_area() {
        let parser = AreaParser::new();
        let res = parser.parse("20' radius").unwrap();
        assert_eq!(res.kind, AreaKind::RadiusCircle);
        assert_eq!(res.radius.unwrap().value.unwrap(), 20.0);
        assert_eq!(res.unit, Some(AreaUnit::Ft));
    }

    #[test]
    fn test_parse_shorthand_units() {
        let parser = AreaParser::new();

        // Area Shorthand
        let area = parser.parse("20' radius").unwrap();
        assert_eq!(area.radius.unwrap().value.unwrap(), 20.0);
        assert_eq!(area.kind, AreaKind::RadiusCircle);
        assert_eq!(area.unit.unwrap(), AreaUnit::Ft);

        let area2 = parser.parse("10' cube").unwrap();
        assert_eq!(area2.edge.unwrap().value.unwrap(), 10.0);
        assert_eq!(area2.kind, AreaKind::Cube);
        assert_eq!(area2.unit.unwrap(), AreaUnit::Ft);
    }

    #[test]
    fn test_parse_area_extended_shapes() {
        let parser = AreaParser::new();

        let res = parser.parse("10 ft. sphere").unwrap();
        assert_eq!(res.kind, AreaKind::RadiusSphere);
        assert_eq!(res.radius.unwrap().value.unwrap(), 10.0);

        let res2 = parser.parse("15 ft. cylinder").unwrap();
        assert_eq!(res2.kind, AreaKind::Cylinder);
        assert_eq!(res2.radius.unwrap().value.unwrap(), 15.0);
        // Height is no longer defaulted
        assert!(res2.height.is_none());

        let res3 = parser.parse("30 ft. wall").unwrap();
        assert_eq!(res3.kind, AreaKind::Wall);
        assert_eq!(res3.length.unwrap().value.unwrap(), 30.0);
        // Height and thickness are no longer defaulted
        assert!(res3.height.is_none());
    }

    #[test]
    fn test_parse_area_multi_dimensions() {
        let parser = AreaParser::new();

        let res = parser.parse("20' by 10' wall").unwrap();
        assert_eq!(res.kind, AreaKind::Wall);
        assert_eq!(res.length.unwrap().value.unwrap(), 20.0);
        assert_eq!(res.height.unwrap().value.unwrap(), 10.0);
        assert_eq!(res.unit, Some(AreaUnit::Ft));

        let res2 = parser.parse("10x10 rect").unwrap();
        assert_eq!(res2.kind, AreaKind::Rect);
        assert_eq!(res2.length.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.width.unwrap().value.unwrap(), 10.0);

        let res3 = parser.parse("20 ft. x 10 ft. x 5 ft. rect_prism").unwrap();
        assert_eq!(res3.kind, AreaKind::RectPrism);
        assert_eq!(res3.length.unwrap().value.unwrap(), 20.0);
        assert_eq!(res3.width.unwrap().value.unwrap(), 10.0);
        assert_eq!(res3.height.unwrap().value.unwrap(), 5.0);
    }

    #[test]
    fn test_parse_area_counts() {
        let parser = AreaParser::new();

        let res = parser.parse("1 creature/level").unwrap();
        assert_eq!(res.kind, AreaKind::Creatures);
        assert_eq!(res.count.unwrap().per_level.unwrap(), 1.0);
        assert_eq!(res.count_subject, Some(CountSubject::Creature));

        let res2 = parser.parse("up to 6 targets").unwrap();
        assert_eq!(res2.kind, AreaKind::Creatures);
        assert_eq!(res2.count.unwrap().value.unwrap(), 6.0);
        assert_eq!(res2.count_subject, Some(CountSubject::Creature));

        let res3 = parser.parse("10 objects").unwrap();
        assert_eq!(res3.kind, AreaKind::Objects);
        assert_eq!(res3.count.unwrap().value.unwrap(), 10.0);
        assert_eq!(res3.count_subject, Some(CountSubject::Object));
    }

    #[test]
    fn test_parse_area_volume_and_tiles() {
        let parser = AreaParser::new();

        let res = parser.parse("1000 cubic feet").unwrap();
        assert_eq!(res.kind, AreaKind::Volume);
        assert_eq!(res.volume.unwrap().value.unwrap(), 1000.0);
        assert_eq!(res.unit, Some(AreaUnit::Ft3));

        let res2 = parser.parse("16 10ft. squares").unwrap();
        assert_eq!(res2.kind, AreaKind::Tiles);
        assert_eq!(res2.tile_count.unwrap().value.unwrap(), 16.0);
        assert_eq!(res2.length.unwrap().value.unwrap(), 10.0);
        assert_eq!(res2.tile_unit, Some(TileUnit::Square));

        let res3 = parser.parse("5 hexes").unwrap();
        assert_eq!(res3.kind, AreaKind::Tiles);
        assert_eq!(res3.tile_count.unwrap().value.unwrap(), 5.0);
        assert_eq!(res3.tile_unit, Some(TileUnit::Hex));
    }

    #[test]
    fn test_parse_area_point() {
        let parser = AreaParser::new();
        let res = parser.parse("point of impact").unwrap();
        assert_eq!(res.kind, AreaKind::Point);
        assert_eq!(res.unit, Some(AreaUnit::Ft));
    }

    #[test]
    fn test_parse_area_scaling() {
        let parser = AreaParser::new();

        let res = parser.parse("20' + 5'/level radius").unwrap();
        assert_eq!(res.kind, AreaKind::RadiusCircle);
        let radius = res.radius.unwrap();
        assert_eq!(radius.mode, ScalarMode::PerLevel);
        assert_eq!(radius.value.unwrap(), 20.0);
        assert_eq!(radius.per_level.unwrap(), 5.0);

        let res2 = parser.parse("10 ft./level cone").unwrap();
        assert_eq!(res2.kind, AreaKind::Cone);
        let length = res2.length.unwrap();
        assert_eq!(length.mode, ScalarMode::PerLevel);
        assert_eq!(length.per_level.unwrap(), 10.0);
    }
}
