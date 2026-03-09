use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AreaKind {
    #[serde(alias = "RADIUS_CIRCLE", alias = "RadiusCircle")]
    RadiusCircle,
    #[serde(alias = "RADIUS_SPHERE", alias = "RadiusSphere")]
    RadiusSphere,
    #[serde(alias = "CONE", alias = "Cone")]
    Cone,
    #[serde(alias = "LINE", alias = "Line")]
    Line,
    #[serde(alias = "RECT", alias = "Rect")]
    Rect,
    #[serde(alias = "RECT_PRISM", alias = "RectPrism")]
    RectPrism,
    #[serde(alias = "CYLINDER", alias = "Cylinder")]
    Cylinder,
    #[serde(alias = "WALL", alias = "Wall")]
    Wall,
    #[serde(alias = "CUBE", alias = "Cube")]
    Cube,
    #[serde(alias = "VOLUME", alias = "Volume")]
    Volume,
    #[serde(alias = "SURFACE", alias = "Surface")]
    Surface,
    #[serde(alias = "TILES", alias = "Tiles")]
    Tiles,
    #[serde(alias = "CREATURES", alias = "Creatures")]
    Creatures,
    #[serde(alias = "OBJECTS", alias = "Objects")]
    Objects,
    #[serde(alias = "REGION", alias = "Region")]
    Region,
    #[serde(alias = "SCOPE", alias = "Scope")]
    Scope,
    #[serde(alias = "POINT", alias = "Point")]
    Point,
    #[default]
    #[serde(alias = "SPECIAL", alias = "Special")]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AreaUnit {
    #[serde(
        alias = "FT",
        alias = "feet",
        alias = "Feet",
        alias = "foot",
        alias = "Foot"
    )]
    Ft,
    #[serde(
        alias = "YD",
        alias = "yards",
        alias = "Yards",
        alias = "yard",
        alias = "Yard"
    )]
    Yd,
    #[serde(
        alias = "MI",
        alias = "miles",
        alias = "Miles",
        alias = "mile",
        alias = "Mile"
    )]
    Mi,
    #[serde(alias = "FT2", alias = "sq_ft", alias = "SqFt")]
    Ft2,
    #[serde(alias = "YD2", alias = "sq_yd", alias = "SqYd")]
    Yd2,
    #[serde(alias = "SQUARE", alias = "Square")]
    Square,
    #[serde(alias = "FT3", alias = "cu_ft", alias = "CuFt")]
    Ft3,
    #[serde(alias = "YD3", alias = "cu_yd", alias = "CuYd")]
    Yd3,
    #[serde(alias = "HEX", alias = "Hex")]
    Hex,
    #[serde(alias = "ROOM", alias = "Room")]
    Room,
    #[serde(alias = "FLOOR", alias = "Floor")]
    Floor,
    #[serde(alias = "INCH", alias = "inches", alias = "Inch", alias = "Inches")]
    Inch,
}

impl AreaUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            AreaUnit::Ft => "ft",
            AreaUnit::Yd => "yd",
            AreaUnit::Mi => "mi",
            AreaUnit::Inch => "inch",
            AreaUnit::Ft2 => "ft2",
            AreaUnit::Yd2 => "yd2",
            AreaUnit::Square => "square",
            AreaUnit::Ft3 => "ft3",
            AreaUnit::Yd3 => "yd3",
            AreaUnit::Hex => "hex",
            AreaUnit::Room => "room",
            AreaUnit::Floor => "floor",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AreaShapeUnit {
    #[serde(alias = "FT", alias = "Foot", alias = "Feet")]
    Ft,
    #[serde(alias = "YD", alias = "Yard", alias = "Yards")]
    Yd,
    #[serde(alias = "MI", alias = "Mile", alias = "Miles")]
    Mi,
    #[serde(alias = "INCH", alias = "Inch", alias = "Inches")]
    Inch,
}

impl AreaShapeUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            AreaShapeUnit::Ft => "ft",
            AreaShapeUnit::Yd => "yd",
            AreaShapeUnit::Mi => "mi",
            AreaShapeUnit::Inch => "inch",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CountSubject {
    #[serde(alias = "CREATURE", alias = "Creature")]
    Creature,
    #[serde(alias = "UNDEAD", alias = "Undead")]
    Undead,
    #[serde(alias = "ALLY", alias = "Ally")]
    Ally,
    #[serde(alias = "ENEMY", alias = "Enemy")]
    Enemy,
    #[serde(alias = "OBJECT", alias = "Object")]
    Object,
    #[serde(alias = "STRUCTURE", alias = "Structure", alias = "Structures")]
    Structure,
}

impl CountSubject {
    pub fn to_text(&self) -> &'static str {
        match self {
            CountSubject::Creature => "creature",
            CountSubject::Undead => "undead",
            CountSubject::Ally => "ally",
            CountSubject::Enemy => "enemy",
            CountSubject::Object => "object",
            CountSubject::Structure => "structure",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RegionUnit {
    #[serde(alias = "OBJECT", alias = "Object")]
    Object,
    #[serde(alias = "STRUCTURE", alias = "Structure")]
    Structure,
    #[serde(alias = "BUILDING", alias = "Building")]
    Building,
    #[serde(alias = "BRIDGE", alias = "Bridge")]
    Bridge,
    #[serde(alias = "SHIP", alias = "Ship")]
    Ship,
    #[serde(alias = "FORTRESS", alias = "Fortress")]
    Fortress,
    #[serde(alias = "CLEARING", alias = "Clearing")]
    Clearing,
    #[serde(alias = "GROVE", alias = "Grove")]
    Grove,
    #[serde(alias = "FIELD", alias = "Field")]
    Field,
    #[serde(alias = "WATERBODY", alias = "Waterbody")]
    Waterbody,
    #[serde(alias = "CAVESYSTEM", alias = "Cavesystem")]
    Cavesystem,
    #[serde(alias = "VALLEY", alias = "Valley")]
    Valley,
    #[serde(alias = "REGION", alias = "Region")]
    Region,
    #[serde(alias = "DOMAIN", alias = "Domain")]
    Domain,
    #[serde(alias = "DEMIPLANE", alias = "Demiplane")]
    Demiplane,
    #[serde(alias = "PLANE", alias = "Plane")]
    Plane,
}

impl RegionUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            RegionUnit::Object => "object",
            RegionUnit::Structure => "structure",
            RegionUnit::Building => "building",
            RegionUnit::Bridge => "bridge",
            RegionUnit::Ship => "ship",
            RegionUnit::Fortress => "fortress",
            RegionUnit::Clearing => "clearing",
            RegionUnit::Grove => "grove",
            RegionUnit::Field => "field",
            RegionUnit::Waterbody => "water body",
            RegionUnit::Cavesystem => "cave system",
            RegionUnit::Valley => "valley",
            RegionUnit::Region => "region",
            RegionUnit::Domain => "domain",
            RegionUnit::Demiplane => "demiplane",
            RegionUnit::Plane => "plane",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScopeUnit {
    #[serde(alias = "LOS", alias = "Los")]
    Los,
    #[serde(alias = "LOE", alias = "Loe")]
    Loe,
    #[serde(alias = "WITHIN_RANGE", alias = "WithinRange")]
    WithinRange,
    #[serde(alias = "WITHIN_SPELL_RANGE", alias = "WithinSpellRange")]
    WithinSpellRange,
    #[serde(alias = "WITHIN_SIGHT", alias = "WithinSight")]
    WithinSight,
    #[serde(alias = "WITHIN_HEARING", alias = "WithinHearing")]
    WithinHearing,
    #[serde(alias = "AURA", alias = "Aura")]
    Aura,
    #[serde(alias = "SANCTIFIED_GROUND", alias = "SanctifiedGround")]
    SanctifiedGround,
    #[serde(alias = "DESECRATED_GROUND", alias = "DesecratedGround")]
    DesecratedGround,
    #[serde(alias = "PORTFOLIO_DEFINED", alias = "PortfolioDefined")]
    PortfolioDefined,
}

impl ScopeUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            ScopeUnit::Los => "los",
            ScopeUnit::Loe => "loe",
            ScopeUnit::WithinRange => "within range",
            ScopeUnit::WithinSpellRange => "within spell range",
            ScopeUnit::WithinSight => "within sight",
            ScopeUnit::WithinHearing => "within hearing",
            ScopeUnit::Aura => "aura",
            ScopeUnit::SanctifiedGround => "sanctified ground",
            ScopeUnit::DesecratedGround => "desecrated ground",
            ScopeUnit::PortfolioDefined => "portfolio defined",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MovesWith {
    #[serde(alias = "CASTER", alias = "Caster")]
    Caster,
    #[serde(alias = "TARGET", alias = "Target")]
    Target,
    #[serde(alias = "OBJECT", alias = "Object")]
    Object,
    #[serde(alias = "FIXED", alias = "Fixed")]
    Fixed,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TileUnit {
    #[serde(alias = "HEX", alias = "Hex")]
    Hex,
    #[serde(alias = "ROOM", alias = "Room")]
    Room,
    #[serde(alias = "FLOOR", alias = "Floor")]
    Floor,
    #[serde(alias = "SQUARE", alias = "Square")]
    Square,
}

impl TileUnit {
    pub fn to_text(&self) -> &'static str {
        match self {
            TileUnit::Hex => "hex",
            TileUnit::Room => "room",
            TileUnit::Floor => "floor",
            TileUnit::Square => "square",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct AreaSpec {
    pub kind: AreaKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<AreaUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "shape_unit")]
    pub shape_unit: Option<AreaShapeUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diameter: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thickness: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edge: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "angle_deg")]
    pub angle_deg: Option<f64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "surface_area"
    )]
    pub surface_area: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "tile_unit")]
    pub tile_unit: Option<TileUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "tile_count")]
    pub tile_count: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<SpellScalar>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "count_subject"
    )]
    pub count_subject: Option<CountSubject>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "region_unit"
    )]
    pub region_unit: Option<RegionUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "scope_unit")]
    pub scope_unit: Option<ScopeUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "moves_with")]
    pub moves_with: Option<MovesWith>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Original legacy source text preserved as-is for auditability.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "raw_legacy_value"
    )]
    pub raw_legacy_value: Option<String>,
}

impl AreaSpec {
    pub fn normalize(&mut self) {
        if let Some(n) = &mut self.notes {
            *n = crate::models::canonical_spell::normalize_string(
                n,
                crate::models::canonical_spell::NormalizationMode::Textual,
            );
        }
        // Note: In the canonical pipeline, CanonicalSpell::normalize() calls
        // synthesize_area_text() immediately after this method, which unconditionally
        // overwrites `text`. This branch is only effective when AreaSpec::normalize()
        // is called standalone (e.g. in unit tests).
        if let Some(t) = &mut self.text {
            *t = crate::models::canonical_spell::normalize_structured_text_with_unit_aliases(t);
        }

        crate::models::canonical_spell::normalize_scalar(&mut self.radius);
        crate::models::canonical_spell::normalize_scalar(&mut self.diameter);
        crate::models::canonical_spell::normalize_scalar(&mut self.length);
        crate::models::canonical_spell::normalize_scalar(&mut self.width);
        crate::models::canonical_spell::normalize_scalar(&mut self.height);
        crate::models::canonical_spell::normalize_scalar(&mut self.thickness);
        crate::models::canonical_spell::normalize_scalar(&mut self.edge);
        crate::models::canonical_spell::normalize_scalar(&mut self.surface_area);
        crate::models::canonical_spell::normalize_scalar(&mut self.volume);
        crate::models::canonical_spell::normalize_scalar(&mut self.tile_count);
        crate::models::canonical_spell::normalize_scalar(&mut self.count);

        if let Some(angle) = &mut self.angle_deg {
            *angle = crate::models::canonical_spell::clamp_precision(*angle);
        }
    }

    pub fn synthesize_text(&mut self) {
        let shaped_linear =
            |scalar: &Option<SpellScalar>, unit: Option<AreaShapeUnit>| -> Option<String> {
                scalar.as_ref().map(|s| {
                    format!(
                        "{} {}",
                        s.to_text(),
                        unit.unwrap_or(AreaShapeUnit::Ft).to_text()
                    )
                })
            };

        let shaped_area =
            |scalar: &Option<SpellScalar>, unit: Option<AreaUnit>| -> Option<String> {
                scalar
                    .as_ref()
                    .map(|s| format!("{} {}", s.to_text(), unit.unwrap_or(AreaUnit::Ft).to_text()))
            };

        let synthesized = match self.kind {
            AreaKind::Special => self.raw_legacy_value.clone(),
            AreaKind::Point => Some("Point".to_string()),
            AreaKind::RadiusCircle => {
                shaped_linear(&self.radius, self.shape_unit).map(|v| format!("{} radius", v))
            }
            AreaKind::RadiusSphere => {
                shaped_linear(&self.radius, self.shape_unit).map(|v| format!("{} radius sphere", v))
            }
            AreaKind::Cone => {
                shaped_linear(&self.length, self.shape_unit).map(|v| format!("{} cone", v))
            }
            AreaKind::Line => {
                shaped_linear(&self.length, self.shape_unit).map(|v| format!("{} line", v))
            }
            AreaKind::Rect => match (&self.length, &self.width, self.shape_unit) {
                (Some(l), Some(w), Some(u)) => Some(format!(
                    "{} x {} {} rect",
                    l.to_text(),
                    w.to_text(),
                    u.to_text()
                )),
                _ => None,
            },
            AreaKind::RectPrism => match (&self.length, &self.width, &self.height, self.shape_unit)
            {
                (Some(l), Some(w), Some(h), Some(u)) => Some(format!(
                    "{} x {} x {} {} prism",
                    l.to_text(),
                    w.to_text(),
                    h.to_text(),
                    u.to_text()
                )),
                _ => None,
            },
            AreaKind::Cylinder => match (&self.radius, &self.height, self.shape_unit) {
                (Some(r), Some(h), Some(u)) => Some(format!(
                    "{} {} radius, {} {} high",
                    r.to_text(),
                    u.to_text(),
                    h.to_text(),
                    u.to_text()
                )),
                _ => None,
            },
            AreaKind::Wall => match (&self.length, &self.height, self.shape_unit) {
                (Some(l), Some(h), Some(u)) => Some(format!(
                    "{} x {} {} wall",
                    l.to_text(),
                    h.to_text(),
                    u.to_text()
                )),
                _ => None,
            },
            AreaKind::Cube => {
                shaped_linear(&self.edge, self.shape_unit).map(|v| format!("{} cube", v))
            }
            AreaKind::Volume => shaped_area(&self.volume, self.unit),
            AreaKind::Surface => shaped_area(&self.surface_area, self.unit),
            AreaKind::Tiles => match (&self.tile_count, self.tile_unit) {
                (Some(c), Some(u)) => Some(format!("{} {}", c.to_text(), u.to_text())),
                _ => None,
            },
            AreaKind::Creatures | AreaKind::Objects => self.count.as_ref().map(|count| {
                let count_text = count.to_text();
                match self.count_subject {
                    Some(subject) => format!("{} {}", count_text, subject.to_text()),
                    None => count_text,
                }
            }),
            AreaKind::Region => self.region_unit.map(|u| u.to_text().to_string()),
            AreaKind::Scope => self.scope_unit.map(|u| u.to_text().to_string()),
        };

        if let Some(t) = synthesized {
            self.text = Some(
                crate::models::canonical_spell::normalize_structured_text_with_unit_aliases(&t),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::scalar::SpellScalar;

    #[test]
    fn test_area_spec_synthesis_region_and_scope() {
        let mut spec = AreaSpec {
            kind: AreaKind::Region,
            region_unit: Some(RegionUnit::Cavesystem),
            ..Default::default()
        };
        spec.synthesize_text();
        assert_eq!(spec.text.as_deref(), Some("cave system"));

        let mut spec = AreaSpec {
            kind: AreaKind::Scope,
            scope_unit: Some(ScopeUnit::WithinSpellRange),
            ..Default::default()
        };
        spec.synthesize_text();
        assert_eq!(spec.text.as_deref(), Some("within spell range"));

        let mut spec = AreaSpec {
            kind: AreaKind::Tiles,
            tile_count: Some(SpellScalar::fixed(5.0)),
            tile_unit: Some(TileUnit::Square),
            ..Default::default()
        };
        spec.synthesize_text();
        assert_eq!(spec.text.as_deref(), Some("5 square"));
    }
}
