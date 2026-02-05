# Parser Coverage Matrix

This document provides a comprehensive overview of the spell parser system, including supported patterns, known limitations, and guidance for handling edge cases.

---

## Overview

The spell parser system uses a **modular architecture** to convert legacy text fields into structured specifications. Each parser handles a specific domain and is designed to gracefully fallback to a "Special" type when patterns aren't recognized.

**Location**: `src/utils/parsers/`

| Parser | File | Responsibility |
|--------|------|----------------|
| `RangeParser` | `range.rs` | Distance, touch, personal, unlimited ranges |
| `AreaParser` | `area.rs` | Shapes, dimensions, creature counts |
| `DurationParser` | `duration.rs` | Time units, scaling, conditions |
| `ComponentsParser` | `components.rs` | V/S/M/DF parsing, casting time |
| `MechanicsParser` | `mechanics.rs` | Damage, saves, MR, XP costs |

---

## Coverage Matrix

### 🟢 Fully Supported Patterns

These patterns are parsed with high confidence into structured specifications.

#### RangeParser

| Pattern | Example | Struct Output |
|---------|---------|---------------|
| Simple distance | `"10 yards"`, `"30 feet"` | `RangeKind::Distance` |
| Floating-point distances | `"2.5 miles"` | `RangeKind::Distance` |
| Per-level scaling | `"10 + 5/level yards"` | `distance.per_level` |
| Touch | `"Touch"` | `RangeKind::Touch` |
| Personal | `"Personal"`, `"Self"` | `RangeKind::Personal` |
| Unlimited | `"Unlimited"` | `RangeKind::Unlimited` |
| Line-of-sight required | `"30 feet (line of sight)"` | `requires: ["los"]` |
| Line-of-effect required | `"60 feet (line of effect)"` | `requires: ["loe"]` |
| Unit abbreviations | `"ft"`, `"yd"`, `"mi"`, `"m"` | Normalized to full unit |
| Context regions | `"within 100 yards of caster"` | `anchor: Caster` |
| Regional modifiers | `"30 feet indoors"`, `"60 feet in open areas"` | `region_notes` |

#### AreaParser

| Pattern | Example | Struct Output |
|---------|---------|---------------|
| Radius circle | `"20-foot radius"` | `AreaKind::RadiusCircle` |
| Emanation | `"10-foot emanation"` | `AreaKind::Emanation` |
| Sphere | `"15-foot sphere"` | `AreaKind::Sphere` |
| Cone | `"30-foot cone"` | `AreaKind::Cone` |
| Line | `"60-foot line"` | `AreaKind::Line` |
| Cube | `"5-foot cube"` | `AreaKind::Cube` |
| Wall with dimensions | `"10 x 20 foot wall"` | `AreaKind::Wall` |
| Cylinder | `"20-foot radius, 40-foot high cylinder"` | `AreaKind::Cylinder` |
| Point target | `"One creature"`, `"The caster"` | `AreaKind::Point` or `Creatures` |
| Multiple targets | `"Up to 3 creatures"`, `"5 objects"` | `count` subject |
| Per-level scaling | `"10 feet per level radius"` | `radius.per_level` |
| Square tiles | `"4 x 4 foot squares"` | `TileUnit::Square` |

#### DurationParser

| Pattern | Example | Struct Output |
|---------|---------|---------------|
| Simple time | `"10 rounds"`, `"5 minutes"` | `DurationKind::Time` |
| Per-level scaling | `"1 round/level"` | `duration.per_level` |
| Fractional scaling | `"1 round / 2 levels"` | `per_level: 0.5` |
| Instantaneous | `"Instantaneous"`, `"Instant"` | `DurationKind::Instant` |
| Permanent | `"Permanent"` | `DurationKind::Permanent` |
| Concentration | `"Concentration"` | `DurationKind::Concentration` |
| Until dispelled | `"Until dispelled"` | `DurationKind::UntilDispelled` |
| Until triggered | `"Until triggered (by touch)"` | `DurationKind::UntilTriggered` |
| Conditional | `"Until the sun rises"` | `DurationKind::Conditional` |
| Dual with condition | `"1 round/level or until discharged"` | `condition` field populated |
| Usage limited (fixed) | `"6 uses"`, `"3 charges"` | `DurationKind::UsageLimited` |
| Usage limited (scaling) | `"1 strike/level"` | `uses.per_level` |
| Planar | `"Planar"`, `"Planar (until discharged)"` | `DurationKind::Planar` |
| Time units | rounds, turns, minutes, hours, days, weeks, months, years, segments | All supported units |

#### ComponentsParser

| Pattern | Example | Struct Output |
|---------|---------|---------------|
| Standard abbreviations | `"V, S, M"` | Separate boolean flags |
| Divine focus | `"V, S, DF"`, `"Divine Focus"` | `divine_focus: true` |
| Material with description | `"V, S, M (bat guano)"` | Plus `MaterialComponentSpec` |
| Valued materials | `"M (ruby worth 50 gp)"` | `value: 50, currency: "gp"` |
| Consumed materials | `"M (consumed incense)"` | `consumed: true` |
| Focus components | `"V, S, F (crystal orb)"` | `focus: true` |
| Casting time units | `"1 action"`, `"1 round"`, `"10 minutes"` | `SpellCastingTime` struct |
| Bonus/reaction | `"1 bonus action"`, `"1 reaction"` | Corresponding unit |
| Segment casting | `"3 segments"` | `CastingTimeUnit::Segment` |

#### MechanicsParser

| Pattern | Example | Struct Output |
|---------|---------|---------------|
| Simple dice | `"1d6"`, `"2d8"` | `SpellDamageSpec.parts` |
| Dice with bonus | `"2d4+2"`, `"1d6-1"` | `bonus` field |
| Typed damage | `"1d6 fire"` | `damage_type` field |
| Per-level scaling | `"1d6/level"` | `per_level_dice` |
| Capped scaling | `"1d6/level (max 10d6)"` | `cap_level: 10` |
| Fixed damage | `"10 points"` | `fixed` value |
| Multi-part | `"1d6 fire + 1d4 cold"` | Multiple parts in array |
| Ongoing damage | `"1d6/round for 3 rounds"` | `ongoing_rounds` |
| Saving throw result | `"None"`, `"Negates"`, `"Half"` | `SavingThrowKind` |
| Save type | `"Spell negates"`, `"Reflex half"` | `save_type` field |
| Magic resistance | `"Yes"`, `"No"`, `"Special"` | `MagicResistanceKind` |
| Experience cost | `"50 XP"`, `"100 XP per HD"` | `ExperienceComponentSpec` |

---

### 🟡 Partially Supported Patterns

These patterns are recognized but may result in incomplete or inferred structures.

| Parser | Pattern | Current Behavior | Notes |
|--------|---------|------------------|-------|
| Duration | Complex dual durations | Parses first part, stores remainder in `condition` | e.g., `"1 day per level or until dispelled"` |
| Duration | Multi-condition termination | Falls back to `Special` with notes | e.g., `"until sunrise or 24 hours, whichever comes first"` |
| Area | Very complex multi-shape | May map to `Special` | e.g., `"three 10-foot cubes or a 30-foot cone"` |
| Range | Conditional ranges | Stores context but may not fully parse | e.g., `"Touch or 30 feet (see text)"` |
| Components | Complex focus requirements | Parses basic focus, ignores complex prerequisites | e.g., `"F (a piece of the target creature)"` |
| Mechanics | Complex damage progressions | May not capture all conditional logic | e.g., `"1d6+1 per 2 levels, +2d6 against undead"` |

---

### 🔴 Known Limitations (Falls back to "Special")

These patterns consistently fall back to `Special` type with the original text preserved.

#### Duration Limitations

| Limitation | Example | Reason |
|------------|---------|--------|
| Multiple termination conditions | `"Until dispelled, triggered, or 1 week passes"` | Too complex for current regex |
| Sunrise/sunset references | `"Until the next dawn"`, `"From dusk to dawn"` | Ambiguous time values |
| Story-driven durations | `"Until the quest is complete"` | No structured representation |
| Incremental decay | `"1 hour, then check each hour"` | Multi-phase logic unsupported |
| Paradoxical durations | `"Instantaneous but effects linger"` | Contradictory semantics |

#### Range Limitations

| Limitation | Example | Reason |
|------------|---------|--------|
| Conditional switching | `"Touch; or 30 feet if cast on self"` | Multiple modes unsupported |
| Story-based ranges | `"As far as the eye can see"` | No numeric conversion |
| Dimension-dependent | `"100 feet (200 on the Astral)"` | Planar modifiers not supported |
| Linked ranges | `"Same as the linked spell"` | Meta-reference unsupported |

#### Area Limitations

| Limitation | Example | Reason |
|------------|---------|--------|
| Complex shape unions | `"Two 10 ft spheres or one 20 ft cylinder"` | Choice logic unsupported |
| Descriptive areas | `"All within earshot"` | No numeric conversion |
| Volumetric constraints | `"100 cubic feet, any shape"` | Free-form volumes unsupported |
| Moving areas | `"A 20-ft radius that follows caster"` | Movement logic unsupported |

#### Component Limitations

| Limitation | Example | Reason |
|------------|---------|--------|
| Conditional components | `"V, S, or just V if quickened"` | Choice logic unsupported |
| Consumable alternatives | `"M (gem worth 100gp or 200gp of gold dust)"` | Alternative lists unsupported |
| Component metamagic | `"As original spell +1 level"` | Meta-references unsupported |

#### Mechanics Limitations

| Limitation | Example | Reason |
|------------|---------|--------|
| Conditional modifiers | `"+2d6 against evil, +4d6 if fiend"` | Multi-condition unsupported |
| Variable dice types | `"1d6 or 1d8 if two-handed"` | Mode switching unsupported |
| Retroactive damage | `"Damage dealt since last turn"` | Temporal references unsupported |
| Save DCs in text | `"DC 15 or half damage"` | Inline DC specification |

---

## Fallback Behavior

When a parser cannot recognize a pattern, it employs **graceful degradation**:

1. **Returns a valid struct**: Never crashes or returns `null`
2. **Sets kind to `Special`**: Signals the data requires manual review
3. **Preserves original text**: In `notes`, `text`, or equivalent field
4. **Logs the fallback**: To `migration.log` for later analysis

### Example Fallback Output

```rust
// Input: "Until the caster sneezes or 1d4 hours"
DurationSpec {
    kind: DurationKind::Special,
    notes: Some("Until the caster sneezes or 1d4 hours".to_string()),
    unit: None,
    duration: None,
    condition: None,
    uses: None,
}
```

---

## Extending Parser Coverage

### Adding New Patterns

1. **Identify the pattern class**: Determine which parser should handle it
2. **Add a regex or check**: Before the final `Special` fallback
3. **Add unit tests**: Cover the new pattern with at least 3 variations
4. **Update this matrix**: Document the new coverage

### Testing Recommendations

```bash
# Test a specific parser
cargo test --lib parsers::duration

# Test with output visibility
cargo test --lib parsers::area -- --nocapture

# Run all parser tests
cargo test --lib parsers
```

### Creating Regression Tests

When fixing a parsing bug:

1. Add a test that reproduces the original failure
2. Prefix with `test_regression_` or `test_issue_N_`
3. Include a comment explaining the original bug
4. Verify the test passes with the fix

---

## Statistics (Estimated)

Based on the current implementation:

| Parser | Covered Patterns | Limitations | Coverage % |
|--------|------------------|-------------|------------|
| RangeParser | ~15 | ~5 | ~90% |
| AreaParser | ~12 | ~4 | ~85% |
| DurationParser | ~18 | ~8 | ~80% |
| ComponentsParser | ~10 | ~3 | ~92% |
| MechanicsParser | ~14 | ~6 | ~85% |

> **Note**: These percentages are estimates based on common spell patterns in 2nd Edition sources.

---

## Related Documentation

- [MIGRATION.md](./MIGRATION.md) - Migration process and example patterns
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Debugging parsing issues
- [TESTING.md](./TESTING.md) - Comprehensive testing guidelines

---

**Last Updated**: 2026-02-05
