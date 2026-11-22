use crate::commands::import::{ClassifiedImportPayload, ClassifiedSpell};
use crate::commands::spells::validate_epic_and_quest_spells;
use crate::error::AppError;
use crate::models::area_spec::AreaKind;
use crate::models::canonical_spell::{
    validate_tradition_school_sphere_consistency, CanonicalSpell, CastingTimeUnit, SourceRef,
    CURRENT_SCHEMA_VERSION, SOURCE_REF_NOTE_MAX_CHARS,
};
use crate::models::damage::DamageKind;
use crate::models::duration_spec::DurationKind;
use crate::models::magic_resistance::{
    MagicResistanceKind, MagicResistanceSpec, MrAppliesTo, MrPartialScope, MrPartialSpec,
};
use crate::models::range_spec::RangeKind;
use crate::models::saving_throw::{
    SaveAppliesTo, SaveOutcomeEffect, SaveResult, SaveTiming, SaveType, SaveVs, SavingThrowKind,
    SavingThrowSpec, SingleSave,
};
use crate::models::scalar::{ScalarMode, SpellScalar};
use crate::models::{
    AreaSpec, DurationSpec, ImportSpellJsonFailure, RangeSpec, SpellCastingTime, SpellDamageSpec,
};
use crate::utils::spell_parser::SpellParser;
use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;

const SAVING_THROW_NOTES_MAX_CHARS: usize = 2_048;
const MAX_SOURCE_LIST_SPELLS: usize = 10_000;

const CANONICAL_SCHOOLS: &[&str] = &[
    "Abjuration",
    "Alteration",
    "Calling",
    "Charm",
    "Conjuration",
    "Conjuration/Summoning",
    "Creation",
    "Dimension",
    "Divination",
    "Enchantment",
    "Enchantment/Charm",
    "Evocation",
    "Illusion",
    "Illusion/Phantasm",
    "Invocation",
    "Invocation/Evocation",
    "Necromancy",
    "Phantasm",
    "Shadow",
    "Summoning",
    "Teleportation",
    "Temporal",
];

const CANONICAL_SPHERES: &[&str] = &[
    "All",
    "Animal",
    "Astral",
    "Chaos",
    "Charm",
    "Combat",
    "Creation",
    "Desert",
    "Destiny",
    "Divination",
    "Drow",
    "Elemental Air",
    "Elemental Earth",
    "Elemental Fire",
    "Elemental Water",
    "Elemental Rain",
    "Elemental Sun",
    "Evil",
    "Fate",
    "Good",
    "Guardian",
    "Healing",
    "Law",
    "Magma",
    "Necromantic",
    "Numbers",
    "Plant",
    "Protection",
    "Silt",
    "Summoning",
    "Sun",
    "Thought",
    "Time",
    "Travelers",
    "War",
    "Weather",
];

#[derive(Debug, Clone)]
pub(crate) enum SourceListLevel {
    Int(i64),
    Text(String),
}

#[derive(Debug, Clone, Default)]
pub(crate) struct SourceListRecord {
    pub name: Option<String>,
    pub tradition: Option<String>,
    pub class_list: Vec<String>,
    pub level: Option<SourceListLevel>,
    pub raw_schools: Vec<String>,
    pub sphere: Option<String>,
    pub components: Option<String>,
    pub material_components: Option<String>,
    pub range: Option<String>,
    pub duration: Option<String>,
    pub casting_time: Option<String>,
    pub area_of_effect: Option<String>,
    pub saving_throw: Option<String>,
    pub damage: Option<String>,
    pub magic_resistance: Option<String>,
    pub reversible: Option<bool>,
    pub description: Option<String>,
    pub source_document: Option<String>,
    pub source_page: Option<serde_json::Value>,
    pub review_notes: Option<String>,
    pub needs_review: bool,
    pub edition: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub tags: Vec<String>,
}

pub(crate) fn truncate_chars(s: &str, max_chars: usize) -> (String, bool) {
    let count = s.chars().count();
    if count <= max_chars {
        (s.to_string(), false)
    } else {
        (s.chars().take(max_chars).collect(), true)
    }
}

fn is_valid_scalar(scalar: &SpellScalar) -> bool {
    if let Some(v) = scalar.value {
        if !v.is_finite() || v < 0.0 {
            return false;
        }
    }
    if let Some(p) = scalar.per_level {
        if !p.is_finite() || p < 0.0 {
            return false;
        }
    }
    if let Some(c) = scalar.cap_value {
        if !c.is_finite() || c < 0.0 {
            return false;
        }
    }
    match scalar.mode {
        ScalarMode::Fixed => scalar.value.is_some(),
        ScalarMode::PerLevel => scalar.per_level.is_some(),
    }
}

pub(crate) fn validate_range_spec(spec: &RangeSpec) -> bool {
    match spec.kind {
        RangeKind::Distance | RangeKind::DistanceLos | RangeKind::DistanceLoe => {
            spec.unit.is_some() && spec.distance.as_ref().is_some_and(is_valid_scalar)
        }
        _ => true,
    }
}

pub(crate) fn validate_duration_spec(spec: &DurationSpec) -> bool {
    match spec.kind {
        DurationKind::Time => {
            spec.unit.is_some() && spec.duration.as_ref().is_some_and(is_valid_scalar)
        }
        DurationKind::UsageLimited => spec.uses.as_ref().is_some_and(is_valid_scalar),
        DurationKind::Conditional | DurationKind::UntilTriggered | DurationKind::Planar => spec
            .condition
            .as_deref()
            .is_some_and(|c| !c.trim().is_empty()),
        _ => true,
    }
}

pub(crate) fn validate_spell_casting_time(spec: &SpellCastingTime) -> bool {
    if matches!(
        spec.unit,
        CastingTimeUnit::Action | CastingTimeUnit::BonusAction | CastingTimeUnit::Reaction
    ) {
        return false;
    }
    if let Some(v) = spec.base_value {
        if !v.is_finite() {
            return false;
        }
    }
    if let Some(v) = spec.per_level {
        if !v.is_finite() {
            return false;
        }
    }
    if let Some(v) = spec.level_divisor {
        if !v.is_finite() {
            return false;
        }
    }
    true
}

pub(crate) fn validate_area_spec(spec: &AreaSpec) -> bool {
    let has_scalar = |s: &Option<SpellScalar>| s.as_ref().is_some_and(is_valid_scalar);
    match spec.kind {
        AreaKind::RadiusCircle | AreaKind::RadiusSphere => {
            has_scalar(&spec.radius) && spec.shape_unit.is_some()
        }
        AreaKind::Cone | AreaKind::Line => has_scalar(&spec.length) && spec.shape_unit.is_some(),
        AreaKind::Rect => {
            has_scalar(&spec.length) && has_scalar(&spec.width) && spec.shape_unit.is_some()
        }
        AreaKind::RectPrism => {
            has_scalar(&spec.length)
                && has_scalar(&spec.width)
                && has_scalar(&spec.height)
                && spec.shape_unit.is_some()
        }
        AreaKind::Cylinder => {
            has_scalar(&spec.radius) && has_scalar(&spec.height) && spec.shape_unit.is_some()
        }
        AreaKind::Cube => has_scalar(&spec.edge) && spec.shape_unit.is_some(),
        AreaKind::Wall => {
            has_scalar(&spec.length)
                && has_scalar(&spec.height)
                && has_scalar(&spec.thickness)
                && spec.shape_unit.is_some()
        }
        AreaKind::Surface => has_scalar(&spec.surface_area) && spec.unit.is_some(),
        AreaKind::Volume => has_scalar(&spec.volume) && spec.unit.is_some(),
        AreaKind::Tiles => spec.tile_unit.is_some() && has_scalar(&spec.tile_count),
        AreaKind::Creatures | AreaKind::Objects => {
            has_scalar(&spec.count) && spec.count_subject.is_some()
        }
        AreaKind::Region => spec.region_unit.is_some(),
        AreaKind::Scope => spec.scope_unit.is_some(),
        AreaKind::Point | AreaKind::Special => true,
    }
}

pub(crate) fn validate_spell_damage_spec(spec: &SpellDamageSpec) -> bool {
    match spec.kind {
        DamageKind::None => true,
        DamageKind::Modeled => {
            let Some(parts) = spec.parts.as_ref() else {
                return false;
            };
            if parts.is_empty() {
                return false;
            }
            parts.iter().all(|part| {
                !part.id.is_empty() && part.id.len() <= 32 && !part.base.terms.is_empty()
            })
        }
        DamageKind::DmAdjudicated => spec
            .dm_guidance
            .as_deref()
            .is_some_and(|g| !g.trim().is_empty()),
    }
}

pub(crate) fn parse_range_with_editor_fallback(parser: &SpellParser, raw: &str) -> RangeSpec {
    let parsed = parser.parse_range(raw);
    if validate_range_spec(&parsed) {
        parsed
    } else {
        RangeSpec {
            kind: RangeKind::Special,
            text: Some(raw.to_string()),
            raw_legacy_value: Some(raw.to_string()),
            ..Default::default()
        }
    }
}

pub(crate) fn parse_duration_with_editor_fallback(parser: &SpellParser, raw: &str) -> DurationSpec {
    let parsed = parser.parse_duration(raw);
    if validate_duration_spec(&parsed) {
        parsed
    } else {
        DurationSpec {
            kind: DurationKind::Special,
            text: Some(raw.to_string()),
            raw_legacy_value: Some(raw.to_string()),
            ..Default::default()
        }
    }
}

pub(crate) fn parse_casting_time_with_editor_fallback(
    parser: &SpellParser,
    raw: &str,
) -> SpellCastingTime {
    let parsed = parser.parse_casting_time(raw);
    if validate_spell_casting_time(&parsed) {
        parsed
    } else {
        SpellCastingTime {
            text: raw.to_string(),
            unit: CastingTimeUnit::Special,
            raw_legacy_value: Some(raw.to_string()),
            ..Default::default()
        }
    }
}

pub(crate) fn parse_area_with_editor_fallback(parser: &SpellParser, raw: &str) -> AreaSpec {
    match parser.parse_area(raw) {
        Some(parsed) if validate_area_spec(&parsed) => parsed,
        _ => AreaSpec {
            kind: AreaKind::Special,
            text: Some(raw.to_string()),
            raw_legacy_value: Some(raw.to_string()),
            ..Default::default()
        },
    }
}

pub(crate) fn parse_damage_with_editor_fallback(
    parser: &SpellParser,
    raw: &str,
) -> SpellDamageSpec {
    let parsed = parser.parse_damage(raw);
    if validate_spell_damage_spec(&parsed) {
        parsed
    } else {
        SpellDamageSpec {
            kind: DamageKind::None,
            source_text: Some(raw.to_string()),
            ..Default::default()
        }
    }
}

fn normalize_legacy_text(value: &str) -> String {
    static RE_PUNCT: OnceLock<Regex> = OnceLock::new();
    static RE_WS: OnceLock<Regex> = OnceLock::new();
    let re_punct = RE_PUNCT.get_or_init(|| Regex::new(r"[()\[\],.;:]+").expect("static regex"));
    let re_ws = RE_WS.get_or_init(|| Regex::new(r"[\s_-]+").expect("static regex"));

    let lower = value.trim().to_lowercase();
    let no_punct = re_punct.replace_all(&lower, " ");
    re_ws.replace_all(&no_punct, " ").trim().to_string()
}

pub(crate) fn map_legacy_saving_throw(legacy: &str) -> SavingThrowSpec {
    static RE_NONE: OnceLock<Regex> = OnceLock::new();
    static RE_PARALY: OnceLock<Regex> = OnceLock::new();
    static RE_POISON: OnceLock<Regex> = OnceLock::new();
    static RE_BREATH: OnceLock<Regex> = OnceLock::new();
    static RE_ROD_STAFF_WAND: OnceLock<Regex> = OnceLock::new();
    static RE_POLY_PETRIF: OnceLock<Regex> = OnceLock::new();
    static RE_POLY: OnceLock<Regex> = OnceLock::new();
    static RE_SPECIAL: OnceLock<Regex> = OnceLock::new();
    static RE_NEGATES: OnceLock<Regex> = OnceLock::new();
    static RE_HALF: OnceLock<Regex> = OnceLock::new();
    static RE_PARTIAL: OnceLock<Regex> = OnceLock::new();

    let re_none = RE_NONE.get_or_init(|| {
        Regex::new(r"^(none|no|n/a|na|nil|—|-)$|\bno save\b").expect("static regex")
    });
    let re_paraly = RE_PARALY
        .get_or_init(|| Regex::new(r"\bparaly\b|\bpoison\b|\bdeath\b").expect("static regex"));
    let re_poison = RE_POISON.get_or_init(|| Regex::new(r"\bpoison\b").expect("static regex"));
    let re_breath = RE_BREATH.get_or_init(|| Regex::new(r"\bbreath\b").expect("static regex"));
    let re_rod_staff_wand = RE_ROD_STAFF_WAND
        .get_or_init(|| Regex::new(r"\brod\b|\bstaff\b|\bwand\b").expect("static regex"));
    let re_poly_petrif =
        RE_POLY_PETRIF.get_or_init(|| Regex::new(r"\bpoly\b|\bpetrif\b").expect("static regex"));
    let re_poly = RE_POLY.get_or_init(|| Regex::new(r"\bpoly\b").expect("static regex"));
    let re_special = RE_SPECIAL.get_or_init(|| Regex::new(r"\bspecial\b").expect("static regex"));
    let re_negates =
        RE_NEGATES.get_or_init(|| Regex::new(r"\bnegat(?:e|es|ed|ing)?\b").expect("static regex"));
    let re_half =
        RE_HALF.get_or_init(|| Regex::new(r"\bhalf\b|\b1\s*/\s*2\b").expect("static regex"));
    let re_partial = RE_PARTIAL.get_or_init(|| Regex::new(r"\bpartial\b").expect("static regex"));

    let normalized = normalize_legacy_text(legacy);
    if normalized.is_empty() || re_none.is_match(&normalized) {
        return SavingThrowSpec {
            kind: SavingThrowKind::None,
            raw_legacy_value: None,
            ..Default::default()
        };
    }

    // 6-row save_type/save_vs matrix matching editor mapLegacySavingThrow (first match wins).
    let (save_type, save_vs) = if re_paraly.is_match(&normalized) {
        (
            SaveType::ParalyzationPoisonDeath,
            if re_poison.is_match(&normalized) {
                SaveVs::Poison
            } else {
                SaveVs::DeathMagic
            },
        )
    } else if re_breath.is_match(&normalized) {
        (SaveType::BreathWeapon, SaveVs::Breath)
    } else if re_rod_staff_wand.is_match(&normalized) {
        (SaveType::RodStaffWand, SaveVs::Other)
    } else if re_poly_petrif.is_match(&normalized) {
        (
            SaveType::PetrificationPolymorph,
            if re_poly.is_match(&normalized) {
                SaveVs::Polymorph
            } else {
                SaveVs::Petrification
            },
        )
    } else if re_special.is_match(&normalized) {
        (SaveType::Special, SaveVs::Spell)
    } else {
        (SaveType::Spell, SaveVs::Spell)
    };

    let on_success_result = if re_negates.is_match(&normalized) {
        SaveResult::NoEffect
    } else if re_half.is_match(&normalized) {
        SaveResult::ReducedEffect
    } else if re_partial.is_match(&normalized) {
        SaveResult::PartialNonDamageOnly
    } else {
        let (notes, _) = truncate_chars(legacy, SAVING_THROW_NOTES_MAX_CHARS);
        return SavingThrowSpec {
            kind: SavingThrowKind::DmAdjudicated,
            single: None,
            multiple: None,
            raw_legacy_value: Some(legacy.to_string()),
            legacy_dm_guidance: None,
            notes: Some(notes),
        };
    };

    SavingThrowSpec {
        kind: SavingThrowKind::Single,
        single: Some(SingleSave {
            id: None,
            save_type,
            save_vs,
            modifier: 0,
            applies_to: SaveAppliesTo::EachTarget,
            timing: SaveTiming::OnEffect,
            on_success: SaveOutcomeEffect {
                result: on_success_result,
                notes: None,
            },
            on_failure: SaveOutcomeEffect {
                result: SaveResult::FullEffect,
                notes: None,
            },
        }),
        multiple: None,
        raw_legacy_value: Some(legacy.to_string()),
        legacy_dm_guidance: None,
        notes: None,
    }
}

pub(crate) fn map_legacy_magic_resistance(legacy: &str) -> MagicResistanceSpec {
    static RE_YES: OnceLock<Regex> = OnceLock::new();
    static RE_NO: OnceLock<Regex> = OnceLock::new();
    static RE_PARTIAL: OnceLock<Regex> = OnceLock::new();

    let re_yes = RE_YES
        .get_or_init(|| Regex::new(r"\byes\b|\bapplies\b|\ballowed\b").expect("static regex"));
    let re_no = RE_NO.get_or_init(|| {
        Regex::new(r"\bno\b|\bdoes not apply\b|\bbypassed\b|\bignore[sd]?\b").expect("static regex")
    });
    let re_partial = RE_PARTIAL.get_or_init(|| Regex::new(r"\bpartial\b").expect("static regex"));

    let normalized = normalize_legacy_text(legacy);
    if normalized.is_empty() {
        return MagicResistanceSpec {
            kind: MagicResistanceKind::Unknown,
            ..Default::default()
        };
    }

    if re_yes.is_match(&normalized) {
        return MagicResistanceSpec {
            kind: MagicResistanceKind::Normal,
            applies_to: MrAppliesTo::WholeSpell,
            ..Default::default()
        };
    }

    if re_no.is_match(&normalized) {
        return MagicResistanceSpec {
            kind: MagicResistanceKind::IgnoresMr,
            applies_to: MrAppliesTo::WholeSpell,
            ..Default::default()
        };
    }

    if re_partial.is_match(&normalized) {
        return MagicResistanceSpec {
            kind: MagicResistanceKind::Partial,
            applies_to: MrAppliesTo::WholeSpell,
            partial: Some(MrPartialSpec {
                scope: MrPartialScope::DamageOnly,
                part_ids: None,
            }),
            ..Default::default()
        };
    }

    let (truncated, _) = truncate_chars(legacy, SAVING_THROW_NOTES_MAX_CHARS);
    MagicResistanceSpec {
        kind: MagicResistanceKind::Special,
        applies_to: MrAppliesTo::WholeSpell,
        special_rule: Some(truncated.clone()),
        source_text: Some(truncated),
        ..Default::default()
    }
}

fn match_canonical_school(token: &str) -> Option<&'static str> {
    let trimmed = token.trim();
    CANONICAL_SCHOOLS
        .iter()
        .copied()
        .find(|canon| canon.eq_ignore_ascii_case(trimmed))
}

fn match_canonical_sphere(token: &str) -> String {
    let trimmed = token.trim();
    CANONICAL_SPHERES
        .iter()
        .copied()
        .find(|canon| canon.eq_ignore_ascii_case(trimmed))
        .map(str::to_string)
        .unwrap_or_else(|| trimmed.to_string())
}

fn split_comma_tokens(raw_values: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for raw in raw_values {
        for part in raw.split(',') {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
    }
    out
}

fn non_empty_trimmed(opt: Option<&str>) -> Option<String> {
    opt.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn normalize_newlines(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

pub(crate) fn map_source_list_record(
    record: SourceListRecord,
    fallback_label: &str,
    file_stem: Option<&str>,
) -> Result<(CanonicalSpell, Vec<String>), ImportSpellJsonFailure> {
    let name = record
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| ImportSpellJsonFailure {
            spell_name: fallback_label.to_string(),
            reason: "Missing spell name".to_string(),
        })?;

    let fail = |reason: String| ImportSpellJsonFailure {
        spell_name: name.clone(),
        reason,
    };

    let mut warnings = Vec::new();

    // Parse schools: split commas only (never `/`).
    let raw_school_tokens = split_comma_tokens(&record.raw_schools);
    let mut primary_school: Option<String> = None;
    let mut subschools: Vec<String> = Vec::new();
    for token in &raw_school_tokens {
        if let Some(canon) = match_canonical_school(token) {
            if primary_school.is_none() {
                primary_school = Some(canon.to_string());
            } else if primary_school.as_deref() != Some(canon)
                && !subschools.iter().any(|s| s == canon)
            {
                subschools.push(canon.to_string());
            }
        } else {
            warnings.push(format!("Dropped unrecognized school '{}'", token));
        }
    }

    let sphere = non_empty_trimmed(record.sphere.as_deref()).map(|s| match_canonical_sphere(&s));

    // Resolve tradition (explicit or inferred).
    let tradition = match non_empty_trimmed(record.tradition.as_deref()) {
        Some(raw_trad) => {
            if raw_trad.eq_ignore_ascii_case("arcane") {
                "ARCANE".to_string()
            } else if raw_trad.eq_ignore_ascii_case("divine") {
                "DIVINE".to_string()
            } else {
                return Err(fail(format!(
                    "Unsupported tradition '{}' (expected Arcane or Divine)",
                    raw_trad
                )));
            }
        }
        None => match (!raw_school_tokens.is_empty(), sphere.is_some()) {
            (true, true) => {
                return Err(fail(
                    "School and sphere are mutually exclusive when tradition is omitted"
                        .to_string(),
                ))
            }
            (true, false) => "ARCANE".to_string(),
            (false, true) => "DIVINE".to_string(),
            (false, false) => {
                return Err(fail(
                    "Missing tradition, school, and sphere (cannot determine Arcane or Divine)"
                        .to_string(),
                ))
            }
        },
    };

    if tradition == "ARCANE" {
        if sphere.is_some() {
            return Err(fail("ARCANE spell cannot specify a sphere".to_string()));
        }
        if primary_school.is_none() {
            return Err(fail(format!(
                "Spell '{}' (ARCANE) has no recognized school",
                name
            )));
        }
    } else {
        // DIVINE
        if !raw_school_tokens.is_empty() {
            return Err(fail("DIVINE spell cannot specify a school".to_string()));
        }
        if sphere.is_none() {
            return Err(fail(format!("Spell '{}' (DIVINE) requires a sphere", name)));
        }
    }

    // Level / cantrip / quest flags.
    let (level, is_cantrip, is_quest_spell) = match record.level {
        Some(SourceListLevel::Int(n)) => {
            let cantrip = if n == 0 { Some(1) } else { None };
            let quest = if tradition == "DIVINE" && n == 8 {
                Some(1)
            } else {
                None
            };
            (n, cantrip, quest)
        }
        Some(SourceListLevel::Text(raw_lvl)) => {
            let trimmed = raw_lvl.trim();
            if trimmed.eq_ignore_ascii_case("cantrip") {
                (0, Some(1), None)
            } else if trimmed.eq_ignore_ascii_case("quest") {
                (8, None, Some(1))
            } else if let Ok(n) = trimmed.parse::<i64>() {
                let cantrip = if n == 0 { Some(1) } else { None };
                let quest = if tradition == "DIVINE" && n == 8 {
                    Some(1)
                } else {
                    None
                };
                (n, cantrip, quest)
            } else {
                return Err(fail(format!("Invalid spell level '{}'", raw_lvl)));
            }
        }
        None => return Err(fail("Missing spell level".to_string())),
    };

    let description = record
        .description
        .as_deref()
        .map(|d| normalize_newlines(d).trim().to_string())
        .filter(|d| !d.is_empty())
        .ok_or_else(|| fail("Spell description cannot be empty".to_string()))?;

    let class_list = split_comma_tokens(&record.class_list);
    let tags = split_comma_tokens(&record.tags);

    let parser = SpellParser::new();

    // Components + material components (never mine description prose).
    let raw_components = non_empty_trimmed(record.components.as_deref());
    let raw_materials = non_empty_trimmed(record.material_components.as_deref());

    let components = raw_components.as_deref().and_then(|comp_str| {
        let parsed = parser.parse_components(comp_str);
        if !parsed.verbal
            && !parsed.somatic
            && !parsed.material
            && !parsed.focus
            && !parsed.divine_focus
            && !parsed.experience
        {
            None
        } else {
            Some(parsed)
        }
    });

    let material_list = if let Some(mat_str) = raw_materials.as_deref() {
        parser.parse_material_components(mat_str)
    } else if let Some(comp_str) = raw_components.as_deref() {
        parser.extract_materials_from_components_line(comp_str)
    } else {
        Vec::new()
    };
    let material_components = if material_list.is_empty() {
        None
    } else {
        Some(material_list)
    };

    let range = non_empty_trimmed(record.range.as_deref())
        .map(|raw| parse_range_with_editor_fallback(&parser, &raw));
    let duration = non_empty_trimmed(record.duration.as_deref())
        .map(|raw| parse_duration_with_editor_fallback(&parser, &raw));
    let casting_time = non_empty_trimmed(record.casting_time.as_deref())
        .map(|raw| parse_casting_time_with_editor_fallback(&parser, &raw));
    let area = non_empty_trimmed(record.area_of_effect.as_deref())
        .map(|raw| parse_area_with_editor_fallback(&parser, &raw));
    let damage = non_empty_trimmed(record.damage.as_deref())
        .map(|raw| parse_damage_with_editor_fallback(&parser, &raw));
    let saving_throw =
        non_empty_trimmed(record.saving_throw.as_deref()).map(|raw| map_legacy_saving_throw(&raw));
    let magic_resistance = non_empty_trimmed(record.magic_resistance.as_deref())
        .map(|raw| map_legacy_magic_resistance(&raw));

    let reversible = match record.reversible {
        Some(true) => Some(1),
        _ => None,
    };

    // Review notes & needs_review warnings.
    let stored_note = if let Some(raw_note) = non_empty_trimmed(record.review_notes.as_deref()) {
        let normalized_note = normalize_newlines(&raw_note);
        let (truncated_note, was_truncated) =
            truncate_chars(&normalized_note, SOURCE_REF_NOTE_MAX_CHARS);
        if was_truncated {
            warnings.push(format!(
                "Review note exceeded {} characters and was truncated",
                SOURCE_REF_NOTE_MAX_CHARS
            ));
        }
        warnings.push(format!("Review note: {}", truncated_note));
        Some(truncated_note)
    } else {
        None
    };

    if record.needs_review {
        warnings.push("Needs review (flagged by source)".to_string());
    }

    // SourceRef book resolution: ignore placeholder `markdown.md` or empty, fall back to file stem, or "Unknown".
    let explicit_book = non_empty_trimmed(record.source_document.as_deref())
        .filter(|b| !b.eq_ignore_ascii_case("markdown.md"));
    let stem_book = non_empty_trimmed(file_stem);
    let resolved_book = explicit_book.or(stem_book);
    let page = match record.source_page {
        Some(serde_json::Value::Null) | None => None,
        Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else if let Ok(n) = trimmed.parse::<i64>() {
                Some(serde_json::Value::Number(n.into()))
            } else {
                Some(serde_json::Value::String(trimmed.to_string()))
            }
        }
        Some(other) => Some(other),
    };

    let source_refs = if resolved_book.is_some() || page.is_some() || stored_note.is_some() {
        vec![SourceRef {
            system: None,
            book: resolved_book.unwrap_or_else(|| "Unknown".to_string()),
            page,
            note: stored_note,
            url: None,
        }]
    } else {
        Vec::new()
    };

    let mut spell = CanonicalSpell::new(name.clone(), level, tradition, description);
    spell.school = primary_school;
    spell.subschools = subschools;
    spell.sphere = sphere;
    spell.class_list = class_list;
    spell.range = range;
    spell.components = components;
    spell.material_components = material_components;
    spell.casting_time = casting_time;
    spell.duration = duration;
    spell.area = area;
    spell.damage = damage;
    spell.magic_resistance = magic_resistance;
    spell.saving_throw = saving_throw;
    spell.reversible = reversible;
    spell.tags = tags;
    spell.source_refs = source_refs;
    spell.edition = non_empty_trimmed(record.edition.as_deref());
    spell.author = non_empty_trimmed(record.author.as_deref());
    spell.license = non_empty_trimmed(record.license.as_deref());
    spell.is_quest_spell = is_quest_spell;
    spell.is_cantrip = is_cantrip;
    spell.schema_version = CURRENT_SCHEMA_VERSION;

    validate_tradition_school_sphere_consistency(
        &spell.name,
        &spell.tradition,
        spell.school.as_deref(),
        spell.sphere.as_deref(),
    )
    .map_err(&fail)?;

    let flat_classes = if spell.class_list.is_empty() {
        None
    } else {
        Some(spell.class_list.join(", "))
    };
    validate_epic_and_quest_spells(
        spell.level,
        &flat_classes,
        spell.is_quest_spell.unwrap_or(0) != 0,
        spell.is_cantrip.unwrap_or(0) != 0,
    )
    .map_err(|e| fail(e.to_string()))?;

    let mut normalized_check = spell.clone();
    let norm_res = normalized_check.normalize(None);
    if norm_res.notes_truncated {
        return Err(fail(
            "Saving throw notes exceeded maximum character limit".to_string(),
        ));
    }
    normalized_check.validate().map_err(fail)?;

    Ok((spell, warnings))
}

fn json_opt_string(obj: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    match obj.get(key) {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

fn json_string_list(obj: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<String> {
    match obj.get(key) {
        Some(serde_json::Value::String(s)) => vec![s.clone()],
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

fn json_joined_string_or_list(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<String> {
    match obj.get(key) {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(serde_json::Value::Array(arr)) => {
            let items: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if items.is_empty() {
                None
            } else {
                Some(items.join(", "))
            }
        }
        _ => None,
    }
}

fn parse_reversible_str(s: &str) -> Option<bool> {
    let lower = s.trim().to_ascii_lowercase();
    match lower.as_str() {
        "1" | "true" | "yes" => Some(true),
        "0" | "false" | "no" | "" => Some(false),
        _ => None,
    }
}

fn parse_reversible_value(val: Option<&serde_json::Value>) -> Option<bool> {
    match val {
        Some(serde_json::Value::Bool(b)) => Some(*b),
        Some(serde_json::Value::Number(n)) => Some(n.as_i64() == Some(1)),
        Some(serde_json::Value::String(s)) => parse_reversible_str(s),
        _ => None,
    }
}

fn parse_bool_flag_str(s: &str) -> bool {
    matches!(s.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes")
}

fn parse_page_value_str(raw: &str) -> Option<serde_json::Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else if let Ok(n) = trimmed.parse::<i64>() {
        Some(serde_json::Value::Number(n.into()))
    } else {
        Some(serde_json::Value::String(trimmed.to_string()))
    }
}

pub(crate) fn parse_spellscribe_json_list(
    arr: &[serde_json::Value],
) -> Result<ClassifiedImportPayload, AppError> {
    if arr.len() > MAX_SOURCE_LIST_SPELLS {
        return Err(AppError::Import(format!(
            "Bundle exceeds maximum of 10,000 spells (received {})",
            arr.len()
        )));
    }

    let mut spells = Vec::with_capacity(arr.len());
    let mut failures = Vec::new();

    for (idx, item) in arr.iter().enumerate() {
        let fallback_label = format!("Spell #{}", idx + 1);
        let Some(obj) = item.as_object() else {
            failures.push(ImportSpellJsonFailure {
                spell_name: fallback_label,
                reason: "Spell entry must be a JSON object".to_string(),
            });
            continue;
        };

        let level = match obj.get("level") {
            Some(serde_json::Value::Number(n)) => n.as_i64().map(SourceListLevel::Int),
            Some(serde_json::Value::String(s)) => Some(SourceListLevel::Text(s.clone())),
            _ => None,
        };

        let class_list = if obj.contains_key("class_list") {
            json_string_list(obj, "class_list")
        } else {
            json_string_list(obj, "classes")
        };

        let area_of_effect =
            json_opt_string(obj, "area_of_effect").or_else(|| json_opt_string(obj, "area"));

        let record = SourceListRecord {
            name: json_opt_string(obj, "name"),
            tradition: json_opt_string(obj, "tradition"),
            class_list,
            level,
            raw_schools: json_string_list(obj, "school"),
            sphere: json_opt_string(obj, "sphere"),
            components: json_joined_string_or_list(obj, "components"),
            material_components: json_joined_string_or_list(obj, "material_components"),
            range: json_opt_string(obj, "range"),
            duration: json_opt_string(obj, "duration"),
            casting_time: json_opt_string(obj, "casting_time"),
            area_of_effect,
            saving_throw: json_opt_string(obj, "saving_throw"),
            damage: json_opt_string(obj, "damage"),
            magic_resistance: json_opt_string(obj, "magic_resistance"),
            reversible: parse_reversible_value(obj.get("reversible")),
            description: json_opt_string(obj, "description"),
            source_document: json_opt_string(obj, "source_document"),
            source_page: obj.get("source_page").cloned(),
            review_notes: json_opt_string(obj, "review_notes"),
            needs_review: obj
                .get("needs_review")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            edition: json_opt_string(obj, "edition"),
            author: json_opt_string(obj, "author"),
            license: json_opt_string(obj, "license"),
            tags: json_string_list(obj, "tags"),
        };

        match map_source_list_record(record, &fallback_label, None) {
            Ok((spell, item_warnings)) => {
                spells.push(ClassifiedSpell {
                    spell,
                    warnings: item_warnings,
                });
            }
            Err(failure) => failures.push(failure),
        }
    }

    Ok(ClassifiedImportPayload { spells, failures })
}

fn strip_bom_and_normalize(content: &str) -> String {
    let without_bom = content.strip_prefix('\u{FEFF}').unwrap_or(content);
    normalize_newlines(without_bom)
}

/// Returns true when the Markdown document begins with a closed YAML front-matter block
/// (`---` on the first line and a closing `---` or `...` delimiter on a later line).
pub(crate) fn has_leading_yaml_front_matter(content: &str) -> bool {
    let normalized = strip_bom_and_normalize(content);
    let mut lines = normalized.split('\n');
    let Some(first) = lines.next() else {
        return false;
    };
    if first.trim_end() != "---" {
        return false;
    }
    lines.any(|line| {
        let trimmed = line.trim_end();
        trimmed == "---" || trimmed == "..."
    })
}

/// Advances fenced-code-block state across a line and returns `true` when the line is
/// either an opening/closing fence or inside a fenced code block.
fn advance_fence_state(line: &str, active_fence: &mut Option<(char, usize)>) -> bool {
    let leading_spaces = line.bytes().take_while(|&b| b == b' ').count();
    let trimmed = &line[leading_spaces..];
    if let Some((open_char, open_len)) = *active_fence {
        if leading_spaces <= 3 {
            let count = trimmed.chars().take_while(|&c| c == open_char).count();
            if count >= open_len && trimmed[count * open_char.len_utf8()..].trim().is_empty() {
                *active_fence = None;
            }
        }
        return true;
    }

    if leading_spaces <= 3 {
        let first_char = trimmed.chars().next();
        if let Some(ch @ ('`' | '~')) = first_char {
            let count = trimmed.chars().take_while(|&c| c == ch).count();
            if count >= 3 {
                let info = &trimmed[count * ch.len_utf8()..];
                if ch == '~' || !info.contains('`') {
                    *active_fence = Some((ch, count));
                    return true;
                }
            }
        }
    }

    false
}

/// Returns `true` when a Markdown document has NO leading YAML front matter and contains
/// at least one `^## ` heading outside fenced code blocks.
#[cfg(test)]
pub(crate) fn is_markdown_spell_list(content: &str) -> bool {
    if has_leading_yaml_front_matter(content) {
        return false;
    }
    let normalized = strip_bom_and_normalize(content);
    let mut active_fence: Option<(char, usize)> = None;
    for line in normalized.split('\n') {
        if advance_fence_state(line, &mut active_fence) {
            continue;
        }
        if line.starts_with("## ") {
            return true;
        }
    }
    false
}

fn file_stem_from_name(file_name: &str) -> Option<String> {
    let segment = file_name
        .rsplit(['/', '\\'])
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    Path::new(segment)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn parse_source_bullet(raw: &str) -> (Option<String>, Option<serde_json::Value>) {
    static SOURCE_PAGE_RE: OnceLock<Regex> = OnceLock::new();
    let re = SOURCE_PAGE_RE
        .get_or_init(|| Regex::new(r"(?i)^(.*),\s*p\.\s*(.*)$").expect("valid source page regex"));

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return (None, None);
    }

    if let Some(caps) = re.captures(trimmed) {
        let book = non_empty_trimmed(caps.get(1).map(|m| m.as_str()));
        let page = caps.get(2).and_then(|m| parse_page_value_str(m.as_str()));
        (book, page)
    } else {
        (Some(trimmed.to_string()), None)
    }
}

fn parse_markdown_bullet(line: &str) -> Option<(String, String)> {
    let leading_spaces = line.bytes().take_while(|&b| b == b' ').count();
    if leading_spaces > 3 {
        return None;
    }
    let trimmed = &line[leading_spaces..];
    let after_marker = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))?;
    let colon_idx = after_marker.find(':')?;
    let raw_key = after_marker[..colon_idx]
        .trim()
        .trim_matches('*')
        .trim_matches('_')
        .trim();
    if raw_key.is_empty() {
        return None;
    }
    let key = raw_key
        .to_ascii_lowercase()
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let val = after_marker[colon_idx + 1..].trim().to_string();
    Some((key, val))
}

fn is_review_subheading(line: &str) -> bool {
    line.strip_prefix("### ")
        .map(|rest| rest.trim().eq_ignore_ascii_case("review"))
        .unwrap_or(false)
}

fn apply_markdown_bullet(record: &mut SourceListRecord, key: &str, val: String) {
    match key {
        "tradition" => record.tradition = non_empty_trimmed(Some(&val)),
        "class" | "classes" | "class list" if !val.trim().is_empty() => {
            record.class_list.push(val);
        }
        "level" => {
            let trimmed = val.trim();
            if let Ok(n) = trimmed.parse::<i64>() {
                record.level = Some(SourceListLevel::Int(n));
            } else if !trimmed.is_empty() {
                record.level = Some(SourceListLevel::Text(trimmed.to_string()));
            }
        }
        "school" | "schools" if !val.trim().is_empty() => {
            record.raw_schools.push(val);
        }
        "sphere" | "spheres" => record.sphere = non_empty_trimmed(Some(&val)),
        "components" | "component" => record.components = non_empty_trimmed(Some(&val)),
        "material components" | "materials" => {
            record.material_components = non_empty_trimmed(Some(&val));
        }
        "range" => record.range = non_empty_trimmed(Some(&val)),
        "duration" => record.duration = non_empty_trimmed(Some(&val)),
        "casting time" => record.casting_time = non_empty_trimmed(Some(&val)),
        "area of effect" | "area" => record.area_of_effect = non_empty_trimmed(Some(&val)),
        "saving throw" => record.saving_throw = non_empty_trimmed(Some(&val)),
        "damage" => record.damage = non_empty_trimmed(Some(&val)),
        "magic resistance" => record.magic_resistance = non_empty_trimmed(Some(&val)),
        "reversible" => {
            if let Some(b) = parse_reversible_str(&val) {
                record.reversible = Some(b);
            }
        }
        "source" => {
            let (book, page) = parse_source_bullet(&val);
            if book.is_some() {
                record.source_document = book;
            }
            if page.is_some() {
                record.source_page = page;
            }
        }
        "source document" => record.source_document = non_empty_trimmed(Some(&val)),
        "source page" => {
            if let Some(page) = parse_page_value_str(&val) {
                record.source_page = Some(page);
            }
        }
        "edition" => record.edition = non_empty_trimmed(Some(&val)),
        "author" => record.author = non_empty_trimmed(Some(&val)),
        "license" => record.license = non_empty_trimmed(Some(&val)),
        "tags" | "tag" if !val.trim().is_empty() => {
            record.tags.push(val);
        }
        "needs review" => record.needs_review = parse_bool_flag_str(&val),
        "review notes" => {
            if let Some(trimmed_note) = non_empty_trimmed(Some(&val)) {
                record.review_notes = Some(match record.review_notes.take() {
                    Some(prev) => format!("{prev}\n{trimmed_note}"),
                    None => trimmed_note,
                });
            }
        }
        _ => {}
    }
}

fn parse_markdown_section(heading_name: String, lines: &[&str]) -> SourceListRecord {
    let mut record = SourceListRecord {
        name: Some(heading_name),
        ..Default::default()
    };

    let mut description_lines: Vec<&str> = Vec::new();
    let mut review_lines: Vec<&str> = Vec::new();
    let mut in_review = false;
    let mut seen_any_bullet = false;
    let mut reading_bullets = true;
    let mut active_fence: Option<(char, usize)> = None;

    for &line in lines {
        let in_fence = advance_fence_state(line, &mut active_fence);
        if in_review {
            review_lines.push(line);
            continue;
        }
        if !in_fence && is_review_subheading(line) {
            reading_bullets = false;
            in_review = true;
            continue;
        }

        if reading_bullets {
            if line.trim().is_empty() {
                if seen_any_bullet {
                    reading_bullets = false;
                }
                continue;
            }
            if !in_fence {
                if let Some((key, val)) = parse_markdown_bullet(line) {
                    seen_any_bullet = true;
                    apply_markdown_bullet(&mut record, &key, val);
                    continue;
                }
            }
            reading_bullets = false;
        }

        description_lines.push(line);
    }

    let description = description_lines.join("\n").trim().to_string();
    if !description.is_empty() {
        record.description = Some(description);
    }

    let review_text = review_lines.join("\n").trim().to_string();
    if !review_text.is_empty() {
        record.review_notes = Some(match record.review_notes.take() {
            Some(prev) => format!("{prev}\n{review_text}"),
            None => review_text,
        });
    }

    record
}

/// Counts level-2 spell headings (`^## ` outside fenced code blocks) in a Markdown file,
/// rejecting files with leading YAML front matter or zero level-2 headings.
pub(crate) fn count_markdown_spell_sections(
    file_name: &str,
    content: &str,
) -> Result<usize, AppError> {
    if has_leading_yaml_front_matter(content) {
        return Err(AppError::Import(format!(
            "Markdown file '{}' has leading YAML front matter and is not a Markdown spell list",
            file_name
        )));
    }

    let normalized = strip_bom_and_normalize(content);
    let mut count = 0usize;
    let mut active_fence: Option<(char, usize)> = None;
    for line in normalized.split('\n') {
        if advance_fence_state(line, &mut active_fence) {
            continue;
        }
        if line.starts_with("## ") {
            count += 1;
        }
    }

    if count == 0 {
        return Err(AppError::Import(format!(
            "Markdown file '{}' contains no level-2 spell headings (## )",
            file_name
        )));
    }

    Ok(count)
}

/// Parses a multi-spell Markdown document (`^## ` sections outside fenced code blocks,
/// without leading YAML front matter) into canonical spells and named per-section failures.
pub(crate) fn parse_markdown_spell_list(
    file_name: &str,
    content: &str,
) -> Result<ClassifiedImportPayload, AppError> {
    if has_leading_yaml_front_matter(content) {
        return Err(AppError::Import(format!(
            "Markdown file '{}' has leading YAML front matter and is not a Markdown spell list",
            file_name
        )));
    }

    let normalized = strip_bom_and_normalize(content);
    let mut sections: Vec<(String, Vec<&str>)> = Vec::new();
    let mut current: Option<(String, Vec<&str>)> = None;
    let mut active_fence: Option<(char, usize)> = None;

    for line in normalized.split('\n') {
        let in_fence = advance_fence_state(line, &mut active_fence);
        if !in_fence {
            if let Some(rest) = line.strip_prefix("## ") {
                if let Some(prev) = current.take() {
                    sections.push(prev);
                }
                current = Some((rest.trim().to_string(), Vec::new()));
                continue;
            }
        }
        if let Some((_, ref mut body_lines)) = current {
            body_lines.push(line);
        }
    }
    if let Some(last) = current.take() {
        sections.push(last);
    }

    if sections.is_empty() {
        return Err(AppError::Import(format!(
            "Markdown file '{}' contains no level-2 spell headings (## )",
            file_name
        )));
    }

    if sections.len() > MAX_SOURCE_LIST_SPELLS {
        return Err(AppError::Import(format!(
            "Markdown spell list '{}' exceeds maximum of 10,000 spells (received {})",
            file_name,
            sections.len()
        )));
    }

    let file_stem = file_stem_from_name(file_name);
    let mut spells = Vec::with_capacity(sections.len());
    let mut failures = Vec::new();

    for (idx, (heading, body_lines)) in sections.into_iter().enumerate() {
        let fallback_label = format!("Section #{}", idx + 1);
        let record = parse_markdown_section(heading, &body_lines);
        match map_source_list_record(record, &fallback_label, file_stem.as_deref()) {
            Ok((spell, item_warnings)) => spells.push(ClassifiedSpell {
                spell,
                warnings: item_warnings,
            }),
            Err(failure) => failures.push(failure),
        }
    }

    Ok(ClassifiedImportPayload { spells, failures })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::area_spec::AreaShapeUnit;
    use crate::models::damage::{DamageCombineMode, DamagePart, DamageType, DicePool, DiceTerm};
    use crate::models::duration_spec::DurationUnit;
    use crate::models::range_spec::RangeUnit;

    #[test]
    fn test_map_legacy_saving_throw_special_and_none() {
        let special = map_legacy_saving_throw("Special");
        assert_eq!(special.kind, SavingThrowKind::DmAdjudicated);
        assert_eq!(special.raw_legacy_value.as_deref(), Some("Special"));
        assert_eq!(special.notes.as_deref(), Some("Special"));
        assert!(special.single.is_none());

        for none_case in ["None", "none", "NONE", "No save", "N/A", "—", "-"] {
            let mapped = map_legacy_saving_throw(none_case);
            assert_eq!(
                mapped.kind,
                SavingThrowKind::None,
                "expected None kind for {none_case}"
            );
            assert_eq!(
                mapped.raw_legacy_value, None,
                "expected raw_legacy_value None for {none_case}"
            );
        }

        let negates = map_legacy_saving_throw("Save vs. Spell negates");
        assert_eq!(negates.kind, SavingThrowKind::Single);
        let single = negates.single.expect("single save");
        assert_eq!(single.save_type, SaveType::Spell);
        assert_eq!(single.on_success.result, SaveResult::NoEffect);

        let breath_half = map_legacy_saving_throw("Save vs. Breath Weapon for half");
        assert_eq!(breath_half.kind, SavingThrowKind::Single);
        let single = breath_half.single.expect("single breath save");
        assert_eq!(single.save_type, SaveType::BreathWeapon);
        assert_eq!(single.save_vs, SaveVs::Breath);
        assert_eq!(single.on_success.result, SaveResult::ReducedEffect);

        let poison_partial = map_legacy_saving_throw("Poison (partial)");
        let single = poison_partial.single.expect("single poison save");
        assert_eq!(single.save_type, SaveType::ParalyzationPoisonDeath);
        assert_eq!(single.save_vs, SaveVs::Poison);
        assert_eq!(single.on_success.result, SaveResult::PartialNonDamageOnly);
    }

    #[test]
    fn test_map_legacy_magic_resistance_parity() {
        assert_eq!(
            map_legacy_magic_resistance("").kind,
            MagicResistanceKind::Unknown
        );
        assert_eq!(
            map_legacy_magic_resistance("Yes").kind,
            MagicResistanceKind::Normal
        );
        assert_eq!(
            map_legacy_magic_resistance("No").kind,
            MagicResistanceKind::IgnoresMr
        );
        let partial = map_legacy_magic_resistance("Partial (damage)");
        assert_eq!(partial.kind, MagicResistanceKind::Partial);
        assert_eq!(partial.partial.unwrap().scope, MrPartialScope::DamageOnly);

        let special = map_legacy_magic_resistance("50% only");
        assert_eq!(special.kind, MagicResistanceKind::Special);
        assert_eq!(special.special_rule.as_deref(), Some("50% only"));
        assert_eq!(special.source_text.as_deref(), Some("50% only"));
    }

    #[test]
    fn test_editor_shape_validator_fallbacks() {
        // Invalid RangeSpec -> Special preserving original text
        assert!(!validate_range_spec(&RangeSpec {
            kind: RangeKind::Distance,
            unit: None,
            distance: None,
            ..Default::default()
        }));

        // Invalid DurationSpec -> Special preserving original text
        assert!(!validate_duration_spec(&DurationSpec {
            kind: DurationKind::Time,
            unit: None,
            duration: None,
            ..Default::default()
        }));
        assert!(!validate_duration_spec(&DurationSpec {
            kind: DurationKind::Time,
            unit: Some(DurationUnit::Round),
            duration: Some(SpellScalar {
                mode: ScalarMode::Fixed,
                value: None,
                ..Default::default()
            }),
            ..Default::default()
        }));

        // Invalid SpellCastingTime -> Special preserving original text
        assert!(!validate_spell_casting_time(&SpellCastingTime {
            text: "1 action".to_string(),
            unit: CastingTimeUnit::Action,
            ..Default::default()
        }));

        // Invalid AreaSpec (e.g. Wall missing thickness) -> falls back to Special via parser wrapper
        let parser = SpellParser::new();
        let wall = parse_area_with_editor_fallback(&parser, "20' by 10' wall");
        assert_eq!(wall.kind, AreaKind::Special);
        assert_eq!(wall.raw_legacy_value.as_deref(), Some("20' by 10' wall"));
        assert_eq!(wall.text.as_deref(), Some("20' by 10' wall"));

        assert!(validate_area_spec(&AreaSpec {
            kind: AreaKind::Wall,
            length: Some(SpellScalar::fixed(20.0)),
            height: Some(SpellScalar::fixed(10.0)),
            thickness: Some(SpellScalar::fixed(1.0)),
            shape_unit: Some(AreaShapeUnit::Ft),
            ..Default::default()
        }));

        // Invalid SpellDamageSpec -> DamageKind::None with source_text
        assert!(!validate_spell_damage_spec(&SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sum,
            parts: Some(vec![]),
            ..Default::default()
        }));
        assert!(validate_spell_damage_spec(&SpellDamageSpec {
            kind: DamageKind::Modeled,
            combine_mode: DamageCombineMode::Sum,
            parts: Some(vec![DamagePart {
                id: "fire_1".to_string(),
                damage_type: DamageType::Fire,
                base: DicePool {
                    terms: vec![DiceTerm {
                        count: 1,
                        sides: 6,
                        per_die_modifier: 0,
                    }],
                    flat_modifier: 0,
                },
                ..Default::default()
            }]),
            ..Default::default()
        }));
        // Invalid unparsed damage fallback preserves source_text as None
        let fallback_dmg = SpellDamageSpec {
            kind: DamageKind::None,
            source_text: Some("Weird damage".to_string()),
            ..Default::default()
        };
        assert!(validate_spell_damage_spec(&fallback_dmg));

        // Valid RangeSpec sanity check
        assert!(validate_range_spec(&RangeSpec {
            kind: RangeKind::Distance,
            unit: Some(RangeUnit::Yd),
            distance: Some(SpellScalar::fixed(10.0)),
            ..Default::default()
        }));
    }

    #[test]
    fn test_has_leading_yaml_front_matter_and_spell_list_detection() {
        let fm_with_h2 = "---\nname: Fireball\nlevel: 3\n---\n\n## Effect Details\nBoom.\n";
        assert!(has_leading_yaml_front_matter(fm_with_h2));
        assert!(!is_markdown_spell_list(fm_with_h2));

        let bom_crlf_dots = "\u{FEFF}---\r\nname: Wish\r\n...\r\n\r\n## Notes\r\nCareful.\r\n";
        assert!(has_leading_yaml_front_matter(bom_crlf_dots));
        assert!(!is_markdown_spell_list(bom_crlf_dots));

        let fenced_only = "# Heading\n```markdown\n## Fake Spell Heading\n```\n~~~md\n## Another Fake\n~~~\n### Sub\n";
        assert!(!has_leading_yaml_front_matter(fenced_only));
        assert!(!is_markdown_spell_list(fenced_only));

        let mixed_fence_and_real = "```md\n## Example\n```\n\n## Real Spell\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\nBody.\n";
        assert!(is_markdown_spell_list(mixed_fence_and_real));
    }

    #[test]
    fn test_parse_source_bullet_rightmost_comma_page_and_stem() {
        let (book, page) = parse_source_bullet("Synthetic Tome, Vol. 2, p. 19");
        assert_eq!(book.as_deref(), Some("Synthetic Tome, Vol. 2"));
        assert_eq!(page, Some(serde_json::json!(19)));

        let (book2, page2) = parse_source_bullet("Single Book Title, Part A");
        assert_eq!(book2.as_deref(), Some("Single Book Title, Part A"));
        assert_eq!(page2, None);

        assert_eq!(
            file_stem_from_name(r"C:\path\to\Nethril - Empire of Magic - Wizard.md").as_deref(),
            Some("Nethril - Empire of Magic - Wizard")
        );
    }

    #[test]
    fn test_parse_markdown_spell_list_splitter_edge_cases() {
        let md = "\u{FEFF}# Preamble Title\r\nIgnored intro text.\r\n\r\n## Arcane Bolt\r\n\r\n* **tradition**: arcane\r\n- CLASS: Wizard\r\n- level: 1\r\n- School: Evocation\r\n- Components: V, S\r\n- Field: Inventive\r\n- Source: markdown.md, p. 10\r\n\r\nFirst paragraph.\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n\r\n```md\r\n## Not A New Spell\r\n```\r\n\r\n- Prose bullet: should stay in description.\r\n\r\n### Review\r\nCheck saving throw.\r\n";

        let classified = parse_markdown_spell_list("dir/my-source-file.md", md)
            .expect("valid markdown spell list");
        assert!(classified.failures.is_empty());
        assert_eq!(classified.spells.len(), 1);

        let entry = &classified.spells[0];
        let spell = &entry.spell;
        assert_eq!(spell.name, "Arcane Bolt");
        assert_eq!(spell.tradition, "ARCANE");
        assert_eq!(spell.level, 1);
        assert_eq!(spell.school.as_deref(), Some("Evocation"));
        assert!(spell.description.contains("First paragraph."));
        assert!(spell.description.contains("| A | B |"));
        assert!(spell.description.contains("## Not A New Spell"));
        assert!(spell
            .description
            .contains("- Prose bullet: should stay in description."));
        assert!(!spell.description.contains("Ignored intro text."));
        assert!(!spell.description.contains("Check saving throw."));
        assert!(!spell.description.contains("### Review"));
        assert_eq!(spell.source_refs.len(), 1);
        assert_eq!(spell.source_refs[0].book, "my-source-file");
        assert_eq!(spell.source_refs[0].page, Some(serde_json::json!(10)));
        assert_eq!(
            spell.source_refs[0].note.as_deref(),
            Some("Check saving throw.")
        );
        assert!(entry
            .warnings
            .iter()
            .any(|w| w.contains("Check saving throw.")));

        // Front-matter document returns Err when sent directly to spell-list parser
        let fm = "---\nname: Single\n---\n\n## Sub\nText";
        assert!(parse_markdown_spell_list("single.md", fm).is_err());
    }
}
