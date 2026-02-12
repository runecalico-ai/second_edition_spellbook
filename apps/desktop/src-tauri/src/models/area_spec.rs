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
    #[serde(alias = "STRUCTURE", alias = "Structure")]
    Structure,
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
    /// When parsing fails or falls back to Special, the original legacy string is stored here.
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
}
