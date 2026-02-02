use crate::models::scalar::SpellScalar;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AreaKind {
    RadiusCircle,
    RadiusSphere,
    Cone,
    Line,
    Rect,
    RectPrism,
    Cylinder,
    Wall,
    Cube,
    Volume,
    Surface,
    Tiles,
    Creatures,
    Objects,
    Region,
    Scope,
    #[default]
    Special,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AreaUnit {
    Ft,
    Yd,
    Mi,
    Ft2,
    Yd2,
    Square,
    Ft3,
    Yd3,
    Hex,
    Room,
    Floor,
    Inches,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AreaShapeUnit {
    Ft,
    Yd,
    Mi,
    Inches,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CountSubject {
    Creature,
    Undead,
    Ally,
    Enemy,
    Object,
    Structure,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RegionUnit {
    Object,
    Structure,
    Building,
    Bridge,
    Ship,
    Fortress,
    Clearing,
    Grove,
    Field,
    Waterbody,
    Cavesystem,
    Valley,
    Region,
    Domain,
    Demiplane,
    Plane,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScopeUnit {
    Los,
    Loe,
    WithinRange,
    WithinSpellRange,
    WithinSight,
    WithinHearing,
    Aura,
    SanctifiedGround,
    DesecratedGround,
    PortfolioDefined,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MovesWith {
    Caster,
    Target,
    Object,
    Fixed,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TileUnit {
    Hex,
    Room,
    Floor,
    Square,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct AreaSpec {
    pub kind: AreaKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<AreaUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub angle_deg: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_area: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile_unit: Option<TileUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile_count: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<SpellScalar>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count_subject: Option<CountSubject>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region_unit: Option<RegionUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_unit: Option<ScopeUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moves_with: Option<MovesWith>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
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
