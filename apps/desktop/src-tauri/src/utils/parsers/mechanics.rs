use crate::models::{
    ExperienceComponentSpec, ExperienceKind, MagicResistanceKind, MagicResistanceSpec, MrAppliesTo,
    SaveAppliesTo, SaveOutcomeEffect, SaveResult, SaveTiming, SaveType, SaveVs, SavingThrowKind,
    SavingThrowSpec, SingleSave, SpellDamageSpec,
};
use regex::Regex;

pub struct MechanicsParser {
    dice_term_regex: Regex,
    scaling_rule_regex: Regex,
    xp_regex: Regex,
}

impl Default for MechanicsParser {
    fn default() -> Self {
        Self::new()
    }
}

impl MechanicsParser {
    pub fn new() -> Self {
        Self {
            dice_term_regex: Regex::new(r"(?P<count>\d+)?d(?P<sides>\d+)(?:\s*(?P<mod>[+-]\s*\d+))?").unwrap(),
            scaling_rule_regex: Regex::new(r"(?i)\/(?:per\s+)?(?P<step>\d+)?\s*(?P<unit>level|hd|caster level|spell level|target hd)(?:\s*\(max\s*(?P<max>[^)]+)\))?").unwrap(),
            xp_regex: Regex::new(r"(?i)(?P<val>\d+(?:,\d+)*)\s*xp").unwrap(),
        }
    }

    pub fn parse_damage(&self, input: &str) -> SpellDamageSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" {
            return SpellDamageSpec {
                kind: crate::models::damage::DamageKind::None,
                ..Default::default()
            };
        }

        let mut parts = Vec::new();
        // Support multiple parts separated by semicolon or " and "
        let split_regex = Regex::new(r"(?i);\s*|\s+and\s+").unwrap();
        let items: Vec<&str> = split_regex
            .split(input_clean)
            .filter(|s| !s.trim().is_empty())
            .collect();

        if items.is_empty() {
            return SpellDamageSpec {
                kind: crate::models::damage::DamageKind::DmAdjudicated,
                dm_guidance: Some(input_clean.to_string()),
                ..Default::default()
            };
        }

        // Move tick_regex outside loop to avoid regex creation in loops (clippy)
        let tick_regex = Regex::new(r"(?i)for\s+(\d+)\s+round").unwrap();

        for (i, item) in items.iter().enumerate() {
            let item_clean = item.trim();
            if !self.dice_term_regex.is_match(item_clean)
                && !item_clean.to_lowercase().contains("special")
            {
                continue;
            }

            let part_id = format!("part_{}", i + 1);
            let mut damage_type = crate::models::damage::DamageType::Untyped;

            let lower = item_clean.to_lowercase();
            if lower.contains("fire") {
                damage_type = crate::models::damage::DamageType::Fire;
            } else if lower.contains("cold") {
                damage_type = crate::models::damage::DamageType::Cold;
            } else if lower.contains("acid") {
                damage_type = crate::models::damage::DamageType::Acid;
            } else if lower.contains("elec") {
                damage_type = crate::models::damage::DamageType::Electricity;
            } else if lower.contains("sonic") {
                damage_type = crate::models::damage::DamageType::Sonic;
            } else if lower.contains("force") {
                damage_type = crate::models::damage::DamageType::Force;
            }

            let mut base_dice = crate::models::damage::DicePool {
                terms: vec![],
                flat_modifier: 0,
            };
            let mut scaling = Vec::new();

            if let Some(caps) = self.dice_term_regex.captures(item_clean) {
                let count = caps
                    .name("count")
                    .map_or(1, |m| m.as_str().parse().unwrap_or(1));
                let sides = caps
                    .name("sides")
                    .map_or(6, |m| m.as_str().parse().unwrap_or(6));
                let flat = caps
                    .name("mod")
                    .map_or(0, |m| m.as_str().replace(" ", "").parse().unwrap_or(0));

                let is_scaling = self.scaling_rule_regex.is_match(item_clean);

                if is_scaling {
                    base_dice.terms.push(crate::models::damage::DiceTerm {
                        count: 0,
                        sides,
                        per_die_modifier: 0,
                    });

                    let mut step = 1;
                    if let Some(s_caps) = self.scaling_rule_regex.captures(item_clean) {
                        if let Some(step_str) = s_caps.name("step") {
                            step = step_str.as_str().parse().unwrap_or(1);
                        }
                    }

                    let mut scaling_rule = crate::models::damage::ScalingRule {
                        kind: crate::models::damage::ScalingKind::AddDicePerStep,
                        driver: crate::models::damage::ScalingDriver::CasterLevel,
                        step,
                        max_steps: None,
                        dice_increment: Some(crate::models::damage::DiceTerm {
                            count,
                            sides,
                            per_die_modifier: 0,
                        }),
                        flat_increment: if flat != 0 { Some(flat) } else { None },
                        level_bands: None,
                        notes: None,
                    };

                    if let Some(s_caps) = self.scaling_rule_regex.captures(item_clean) {
                        if let Some(max_str) = s_caps.name("max") {
                            if let Some(max_dice_caps) =
                                self.dice_term_regex.captures(max_str.as_str())
                            {
                                let max_count = max_dice_caps
                                    .name("count")
                                    .map_or(1, |m| m.as_str().parse().unwrap_or(1));
                                scaling_rule.max_steps = Some(max_count);
                            }
                        }
                    }
                    scaling.push(scaling_rule);
                } else {
                    base_dice.terms.push(crate::models::damage::DiceTerm {
                        count,
                        sides,
                        per_die_modifier: 0,
                    });
                    base_dice.flat_modifier = flat;
                }
            }

            let mut save_kind = crate::models::damage::DamageSaveKind::None;
            if lower.contains("half") {
                save_kind = crate::models::damage::DamageSaveKind::Half;
            } else if lower.contains("neg") {
                save_kind = crate::models::damage::DamageSaveKind::Negates;
            }

            let mut scope = crate::models::damage::ApplicationScope::PerTarget;
            let mut ticks = 1;

            if lower.contains("round") || lower.contains("per round") {
                scope = crate::models::damage::ApplicationScope::PerRound;
                if let Some(tcaps) = tick_regex.captures(&lower) {
                    ticks = tcaps[1].parse().unwrap_or(1);
                }
            }

            parts.push(crate::models::damage::DamagePart {
                id: part_id,
                label: None,
                damage_type,
                base: base_dice,
                scaling: if scaling.is_empty() {
                    None
                } else {
                    Some(scaling)
                },
                clamp_total: None,
                application: crate::models::damage::ApplicationSpec {
                    scope,
                    ticks,
                    tick_driver: crate::models::damage::TickDriver::Fixed,
                },
                save: crate::models::damage::DamageSaveSpec {
                    kind: save_kind,
                    partial: None,
                },
                mr_interaction: crate::models::damage::MrInteraction::Normal,
                notes: Some(item_clean.to_string()),
            });
        }

        if parts.is_empty() {
            return SpellDamageSpec {
                kind: crate::models::damage::DamageKind::DmAdjudicated,
                dm_guidance: Some(input_clean.to_string()),
                ..Default::default()
            };
        }

        SpellDamageSpec {
            kind: crate::models::damage::DamageKind::Modeled,
            combine_mode: crate::models::damage::DamageCombineMode::Sum,
            parts: Some(parts),
            dm_guidance: None,
            notes: Some(input_clean.to_string()),
        }
    }

    pub fn parse_magic_resistance(&self, input: &str) -> MagicResistanceSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "0" {
            return MagicResistanceSpec {
                kind: MagicResistanceKind::IgnoresMr,
                ..Default::default()
            };
        }

        let mut kind = MagicResistanceKind::Normal;
        let mut applies_to = MrAppliesTo::WholeSpell;
        let mut partial = None;
        let lower = input_clean.to_lowercase();

        if lower.contains("special") || lower.contains("standard") {
            kind = MagicResistanceKind::Special;
        } else if lower.contains("none") || lower == "0" || lower == "no" {
            kind = MagicResistanceKind::IgnoresMr;
        } else if lower.contains("partial") || lower.contains("applies only to") {
            kind = MagicResistanceKind::Partial;
            let mut scope = crate::models::magic_resistance::MrPartialScope::ByPartId;
            if lower.contains("damage") {
                scope = crate::models::magic_resistance::MrPartialScope::DamageOnly;
            } else if lower.contains("primary") {
                scope = crate::models::magic_resistance::MrPartialScope::PrimaryEffectOnly;
            }
            partial = Some(crate::models::magic_resistance::MrPartialSpec {
                scope,
                part_ids: None,
            });
        }

        if lower.contains("harmful") {
            applies_to = MrAppliesTo::HarmfulEffectsOnly;
        } else if lower.contains("beneficial") {
            applies_to = MrAppliesTo::BeneficialEffectsOnly;
        }

        MagicResistanceSpec {
            kind,
            applies_to,
            partial,
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

        // Split by delimiters to detect multiple saves
        // Delimiters: ";", " and ", " or " (case insensitive)
        let split_regex = Regex::new(r"(?i)(?:;| and | or )").unwrap();
        let parts: Vec<&str> = split_regex
            .split(input_clean)
            .filter(|s| !s.trim().is_empty())
            .collect();

        // Check if the entire input matches a standard category to avoid incorrect splitting
        // (e.g. "Rod, Staff, or Wand" should not be split by " or ")
        let lower = input_clean.to_lowercase();
        let is_standard_complex = lower.contains("rod")
            || lower.contains("staff")
            || lower.contains("wand")
            || lower.contains("poison")
            || lower.contains("death")
            || lower.contains("paraly")
            || lower.contains("poly")
            || lower.contains("petri");

        if parts.len() > 1 && !is_standard_complex {
            let mut saves = Vec::new();
            for part in parts {
                saves.push(self.parse_single_save_intern(part));
            }
            return SavingThrowSpec {
                kind: SavingThrowKind::Multiple,
                single: None,
                multiple: Some(saves),
                dm_guidance: None,
                notes: Some(input_clean.to_string()),
            };
        }

        // Single case
        SavingThrowSpec {
            kind: SavingThrowKind::Single,
            single: Some(self.parse_single_save_intern(input_clean)),
            multiple: None,
            dm_guidance: None,
            notes: Some(input_clean.to_string()),
        }
    }

    fn parse_single_save_intern(&self, input: &str) -> SingleSave {
        let input_clean = input.trim();
        let mut result_kind = SaveResult::NoEffect; // Default for "Negates"
        let mut save_vs = SaveVs::Spell;
        let mut modifier = 0;

        let lower = input_clean.to_lowercase();

        // Detect kind/result
        if lower.contains("neg") {
            result_kind = SaveResult::NoEffect;
        } else if lower.contains("half") || lower.contains("partial") {
            result_kind = SaveResult::ReducedEffect;
        }

        let mut save_type = SaveType::Spell;

        // Detect Save Vs and set SaveType
        if lower.contains("poison") || lower.contains("death") || lower.contains("paraly") {
            save_vs = if lower.contains("poison") {
                SaveVs::Poison
            } else {
                SaveVs::DeathMagic
            };
            save_type = SaveType::ParalyzationPoisonDeath;
        } else if lower.contains("breath") {
            save_vs = SaveVs::Breath;
            save_type = SaveType::BreathWeapon;
        } else if lower.contains("rod") || lower.contains("staff") || lower.contains("wand") {
            save_vs = SaveVs::Other;
            save_type = SaveType::RodStaffWand;
        } else if lower.contains("poly") || lower.contains("petri") {
            save_vs = if lower.contains("poly") {
                SaveVs::Polymorph
            } else {
                SaveVs::Petrification
            };
            save_type = SaveType::PetrificationPolymorph;
        } else if lower.contains("special") {
            save_type = SaveType::Special;
        }

        // Detect modifier: "-2", "+4", etc.
        let mod_regex = Regex::new(r"([+\-]\d+)").unwrap();
        if let Some(caps) = mod_regex.captures(&lower) {
            modifier = caps
                .get(1)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or(0);
        }

        SingleSave {
            id: None,
            save_type,
            save_vs,
            modifier,
            applies_to: SaveAppliesTo::EachTarget,
            timing: SaveTiming::OnEffect,
            on_success: SaveOutcomeEffect {
                result: result_kind,
                notes: None,
            },
            on_failure: SaveOutcomeEffect {
                result: SaveResult::FullEffect,
                notes: None,
            },
        }
    }

    pub fn parse_experience_cost(&self, input: &str) -> ExperienceComponentSpec {
        let input_clean = input.trim();
        if input_clean.is_empty() || input_clean == "None" || input_clean == "0" {
            return ExperienceComponentSpec::default();
        }

        let lower = input_clean.to_lowercase();
        let mut kind = ExperienceKind::None;
        let mut amount_xp = None;
        let mut per_unit = None;

        if lower.contains("special") {
            kind = ExperienceKind::DmAdjudicated;
        } else if lower.contains("per level") {
            kind = ExperienceKind::PerUnit;
            if let Some(caps) = self.xp_regex.captures(&lower) {
                if let Ok(val) = caps["val"].replace(",", "").parse::<i32>() {
                    per_unit = Some(crate::models::experience::PerUnitXp {
                        xp_per_unit: val,
                        unit_kind: crate::models::experience::UnitKind::SpellLevel,
                        unit_label: None,
                        rounding: crate::models::experience::RoundingMode::None,
                        min_xp: None,
                        max_xp: None,
                    });
                }
            }
        } else if let Some(caps) = self.xp_regex.captures(&lower) {
            if let Ok(val) = caps["val"].replace(",", "").parse::<i32>() {
                amount_xp = Some(val);
                kind = ExperienceKind::Fixed;
            }
        }

        ExperienceComponentSpec {
            kind,
            amount_xp,
            per_unit,
            notes: Some(input_clean.to_string()),
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ExperienceKind, MagicResistanceKind, SaveResult, SavingThrowKind};

    #[test]
    fn test_parse_damage_complex() {
        let parser = MechanicsParser::new();
        let fb = parser.parse_damage("1d6/level (max 10d6) fire damage (half save)");
        assert_eq!(fb.kind, crate::models::damage::DamageKind::Modeled);
        let part = &fb.parts.as_ref().unwrap()[0];
        assert_eq!(part.damage_type, crate::models::damage::DamageType::Fire);
        let scaling = &part.scaling.as_ref().unwrap()[0];
        assert_eq!(scaling.max_steps, Some(10));
        assert_eq!(scaling.dice_increment.as_ref().unwrap().count, 1);
        assert_eq!(part.save.kind, crate::models::damage::DamageSaveKind::Half);
    }

    #[test]
    fn test_parse_multi_part_damage() {
        let parser = MechanicsParser::new();

        // GIVEN "1d6 fire + 1d6 cold"
        let dmg = parser.parse_damage("1d6 fire and 1d6 cold");
        assert_eq!(dmg.kind, crate::models::damage::DamageKind::Modeled);
        let parts = dmg.parts.as_ref().unwrap();
        assert_eq!(parts.len(), 2);

        // Verify first part is fire damage
        assert_eq!(
            parts[0].damage_type,
            crate::models::damage::DamageType::Fire
        );
        assert_eq!(parts[0].base.terms[0].count, 1);
        assert_eq!(parts[0].base.terms[0].sides, 6);

        // Verify second part is cold damage
        assert_eq!(
            parts[1].damage_type,
            crate::models::damage::DamageType::Cold
        );
        assert_eq!(parts[1].base.terms[0].count, 1);
        assert_eq!(parts[1].base.terms[0].sides, 6);
    }

    #[test]
    fn test_parse_damage_cap() {
        let parser = MechanicsParser::new();
        let res = parser.parse_damage("1d6/level (max 10d6)");
        assert_eq!(res.notes.unwrap(), "1d6/level (max 10d6)");
    }

    #[test]
    fn test_parse_damage_fixed() {
        let parser = MechanicsParser::new();
        let res = parser.parse_damage("1d6");
        assert_eq!(res.notes.unwrap(), "1d6");

        let res2 = parser.parse_damage("2d4+1");
        assert_eq!(res2.notes.unwrap(), "2d4+1");
    }

    #[test]
    fn test_parse_damage_scaling() {
        let parser = MechanicsParser::new();
        let res = parser.parse_damage("1d6/level");
        let part = &res.parts.as_ref().unwrap()[0];
        assert_eq!(part.scaling.as_ref().unwrap()[0].step, 1);

        let res2 = parser.parse_damage("1d8/2 levels");
        let part2 = &res2.parts.as_ref().unwrap()[0];
        assert_eq!(part2.scaling.as_ref().unwrap()[0].step, 2);
    }

    #[test]
    fn test_parse_damage_ongoing() {
        let parser = MechanicsParser::new();
        let dmg = parser.parse_damage("1d6 fire damage for 3 rounds");
        let part = &dmg.parts.as_ref().unwrap()[0];
        assert_eq!(
            part.application.scope,
            crate::models::damage::ApplicationScope::PerRound
        );
        assert_eq!(part.application.ticks, 3);
    }

    #[test]
    fn test_parse_experience_cost() {
        let parser = MechanicsParser::new();

        // Fixed
        let res1 = parser.parse_experience_cost("500 XP");
        assert_eq!(res1.kind, ExperienceKind::Fixed);
        assert_eq!(res1.amount_xp.unwrap(), 500);

        // With Comma
        let res2 = parser.parse_experience_cost("1,000 xp");
        assert_eq!(res2.kind, ExperienceKind::Fixed);
        assert_eq!(res2.amount_xp.unwrap(), 1000);

        // Special
        let res3 = parser.parse_experience_cost("Special");
        assert_eq!(res3.kind, ExperienceKind::DmAdjudicated);

        // Per Unit
        let res4 = parser.parse_experience_cost("100 xp per level");
        assert_eq!(res4.kind, ExperienceKind::PerUnit);

        // Fallback / None
        let res5 = parser.parse_experience_cost("None");
        // Check default behavior
        assert_eq!(res5.kind, ExperienceKind::None);
    }

    #[test]
    fn test_parse_saving_throws() {
        let parser = MechanicsParser::new();

        // 1. Single Save
        let res1 = parser.parse_saving_throw("Will negates");
        assert_eq!(res1.kind, SavingThrowKind::Single);
        let s1 = res1.single.unwrap();
        assert_eq!(s1.on_success.result, SaveResult::NoEffect);

        // 2. Modifiers
        let res2 = parser.parse_saving_throw("Fortitude -2 half");
        assert_eq!(res2.kind, SavingThrowKind::Single);
        let s2 = res2.single.unwrap();
        assert_eq!(s2.modifier, -2);
        assert_eq!(s2.on_success.result, SaveResult::ReducedEffect);

        // 3. Multiple Saves (Semicolon)
        let res3 = parser.parse_saving_throw("Fortitude partial; Will negates");
        assert_eq!(res3.kind, SavingThrowKind::Multiple);
        let m3 = res3.multiple.unwrap();
        assert_eq!(m3.len(), 2);
        assert_eq!(m3[0].on_success.result, SaveResult::ReducedEffect);
        assert_eq!(m3[1].on_success.result, SaveResult::NoEffect);

        // 4. Multiple Saves ("and")
        let res4 = parser.parse_saving_throw("Reflex half and Will negates");
        assert_eq!(res4.kind, SavingThrowKind::Multiple);
        let m4 = res4.multiple.unwrap();
        assert_eq!(m4.len(), 2);
        assert_eq!(m4[0].on_success.result, SaveResult::ReducedEffect);
        assert_eq!(m4[1].on_success.result, SaveResult::NoEffect);

        // 5. Save Type mapping
        let res5 = parser.parse_saving_throw("Rod, Staff, or Wand");
        assert_eq!(
            res5.single.as_ref().unwrap().save_type,
            SaveType::RodStaffWand
        );

        let res6 = parser.parse_saving_throw("Save vs. Poison");
        assert_eq!(
            res6.single.as_ref().unwrap().save_type,
            SaveType::ParalyzationPoisonDeath
        );
    }

    #[test]
    fn test_parse_magic_resistance() {
        let parser = MechanicsParser::new();

        // Standard
        let mr1 = parser.parse_magic_resistance("Yes");
        assert_eq!(mr1.kind, MagicResistanceKind::Normal); // Default if not special/none

        // None
        let mr2 = parser.parse_magic_resistance("None");
        assert_eq!(mr2.kind, MagicResistanceKind::IgnoresMr);

        // Special
        let mr3 = parser.parse_magic_resistance("Special");
        assert_eq!(mr3.kind, MagicResistanceKind::Special);
    }
}
