//! Editor-compatible legacy saving throw / magic resistance mappers.
//!
//! These functions mirror `mapLegacySavingThrow` / `mapLegacyMagicResistance` in
//! `src/ui/hooks/useSpellParser.ts` and MUST change in lockstep with them. They
//! intentionally differ from [`super::mechanics::MechanicsParser`], which performs
//! richer (non-editor) parsing.
//!
//! The Rust output is a superset of the editor's: it adds extra fields (`notes` on
//! `dm_adjudicated`, default `save_vs`/`modifier`/`applies_to`/`timing`) and truncates
//! notes/`special_rule`/`source_text` to 2048 chars.
//!
//! The `\bparaly\b`, `\bpoly\b`, and `\bpetrif\b` patterns are intentionally kept
//! identical to the TS editor for parity, so change them only together with
//! `apps/desktop/src/ui/hooks/useSpellParser.ts`.

use crate::models::canonical_spell::SAVING_THROW_NOTES_MAX_CHARS;
use crate::models::magic_resistance::{
    MagicResistanceKind, MagicResistanceSpec, MrAppliesTo, MrPartialScope, MrPartialSpec,
};
use crate::models::saving_throw::{
    SaveAppliesTo, SaveOutcomeEffect, SaveResult, SaveTiming, SaveType, SaveVs, SavingThrowKind,
    SavingThrowSpec, SingleSave,
};
use regex::Regex;
use std::sync::OnceLock;

fn normalize_legacy_text(value: &str) -> String {
    static RE_PUNCT: OnceLock<Regex> = OnceLock::new();
    static RE_WS: OnceLock<Regex> = OnceLock::new();
    let re_punct = RE_PUNCT.get_or_init(|| Regex::new(r"[()\[\],.;:]+").expect("static regex"));
    let re_ws = RE_WS.get_or_init(|| Regex::new(r"[\s_-]+").expect("static regex"));

    let lower = value.trim().to_lowercase();
    let no_punct = re_punct.replace_all(&lower, " ");
    re_ws.replace_all(&no_punct, " ").trim().to_string()
}

pub fn map_editor_saving_throw(legacy: &str) -> SavingThrowSpec {
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
        let notes: String = legacy.chars().take(SAVING_THROW_NOTES_MAX_CHARS).collect();
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

pub fn map_editor_magic_resistance(legacy: &str) -> MagicResistanceSpec {
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

    let truncated: String = legacy.chars().take(SAVING_THROW_NOTES_MAX_CHARS).collect();
    MagicResistanceSpec {
        kind: MagicResistanceKind::Special,
        applies_to: MrAppliesTo::WholeSpell,
        special_rule: Some(truncated.clone()),
        source_text: Some(truncated),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_editor_saving_throw_special_and_none() {
        let special = map_editor_saving_throw("Special");
        assert_eq!(special.kind, SavingThrowKind::DmAdjudicated);
        assert_eq!(special.raw_legacy_value.as_deref(), Some("Special"));
        assert_eq!(special.notes.as_deref(), Some("Special"));
        assert!(special.single.is_none());

        for none_case in ["None", "none", "NONE", "No save", "N/A", "—", "-"] {
            let mapped = map_editor_saving_throw(none_case);
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

        let negates = map_editor_saving_throw("Save vs. Spell negates");
        assert_eq!(negates.kind, SavingThrowKind::Single);
        let single = negates.single.expect("single save");
        assert_eq!(single.save_type, SaveType::Spell);
        assert_eq!(single.on_success.result, SaveResult::NoEffect);

        let breath_half = map_editor_saving_throw("Save vs. Breath Weapon for half");
        assert_eq!(breath_half.kind, SavingThrowKind::Single);
        let single = breath_half.single.expect("single breath save");
        assert_eq!(single.save_type, SaveType::BreathWeapon);
        assert_eq!(single.save_vs, SaveVs::Breath);
        assert_eq!(single.on_success.result, SaveResult::ReducedEffect);

        let poison_partial = map_editor_saving_throw("Poison (partial)");
        let single = poison_partial.single.expect("single poison save");
        assert_eq!(single.save_type, SaveType::ParalyzationPoisonDeath);
        assert_eq!(single.save_vs, SaveVs::Poison);
        assert_eq!(single.on_success.result, SaveResult::PartialNonDamageOnly);
    }

    #[test]
    fn test_map_editor_magic_resistance_parity() {
        assert_eq!(
            map_editor_magic_resistance("").kind,
            MagicResistanceKind::Unknown
        );
        assert_eq!(
            map_editor_magic_resistance("Yes").kind,
            MagicResistanceKind::Normal
        );
        assert_eq!(
            map_editor_magic_resistance("No").kind,
            MagicResistanceKind::IgnoresMr
        );
        let partial = map_editor_magic_resistance("Partial (damage)");
        assert_eq!(partial.kind, MagicResistanceKind::Partial);
        assert_eq!(partial.partial.unwrap().scope, MrPartialScope::DamageOnly);

        let special = map_editor_magic_resistance("50% only");
        assert_eq!(special.kind, MagicResistanceKind::Special);
        assert_eq!(special.special_rule.as_deref(), Some("50% only"));
        assert_eq!(special.source_text.as_deref(), Some("50% only"));
    }

    #[test]
    fn test_editor_compat_truncates_multibyte_at_char_boundary() {
        let long = "é".repeat(2049);
        let st = map_editor_saving_throw(&long);
        assert_eq!(st.kind, SavingThrowKind::DmAdjudicated);
        assert_eq!(st.notes.as_ref().unwrap().chars().count(), 2048);
        assert_eq!(st.raw_legacy_value.as_deref(), Some(long.as_str()));

        let mr = map_editor_magic_resistance(&long);
        assert_eq!(mr.kind, MagicResistanceKind::Special);
        assert_eq!(mr.special_rule.as_ref().unwrap().chars().count(), 2048);
        assert_eq!(mr.source_text.as_ref().unwrap().chars().count(), 2048);
    }

    #[test]
    fn test_editor_compat_saving_throw_fraction_and_case() {
        let frac = map_editor_saving_throw("Save vs. Spell for 1/2");
        assert_eq!(
            frac.single.unwrap().on_success.result,
            SaveResult::ReducedEffect
        );

        let loud = map_editor_saving_throw("SAVE VS. POISON; NEGATES");
        assert_eq!(loud.kind, SavingThrowKind::Single);
        assert_eq!(
            loud.raw_legacy_value.as_deref(),
            Some("SAVE VS. POISON; NEGATES")
        );
        let s = loud.single.unwrap();
        assert_eq!(s.save_type, SaveType::ParalyzationPoisonDeath);
        assert_eq!(s.save_vs, SaveVs::Poison);
        assert_eq!(s.on_success.result, SaveResult::NoEffect);
        assert_eq!(s.on_failure.result, SaveResult::FullEffect);
    }

    #[test]
    fn test_editor_compat_no_and_first_match_wins() {
        let st = map_editor_saving_throw("No");
        assert_eq!(st.kind, SavingThrowKind::None);
        assert_eq!(st.raw_legacy_value, None);
        assert_eq!(
            map_editor_magic_resistance("No").kind,
            MagicResistanceKind::IgnoresMr
        );
        assert_eq!(
            map_editor_magic_resistance("Yes, partial").kind,
            MagicResistanceKind::Normal
        );
    }
}
