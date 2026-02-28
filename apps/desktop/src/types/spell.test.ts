import { describe, expect, it } from "vitest";
import {
  areaToText,
  castingTimeToText,
  componentsToText,
  damageToText,
  durationToText,
  formatDicePool,
  magicResistanceToText,
  rangeToText,
  savingThrowToText,
  type AreaSpec,
  type DurationSpec,
  type RangeSpec,
  type SavingThrowSpec,
  type SpellCastingTime,
  type SpellComponents,
  type SpellDamageSpec,
} from "./spell";

describe("formatDicePool", () => {
  it("formats without a modifier", () => {
    expect(formatDicePool({ terms: [{ count: 2, sides: 6 }] })).toBe("2d6");
  });

  it("formats with a positive modifier", () => {
    expect(formatDicePool({ terms: [{ count: 2, sides: 6 }], flatModifier: 3 })).toBe("2d6+3");
  });
});

describe("damageToText", () => {
  it("returns empty string for none", () => {
    const spec: SpellDamageSpec = { kind: "none" };
    expect(damageToText(spec)).toBe("");
  });

  it("formats modeled part with save kind", () => {
    const spec: SpellDamageSpec = {
      kind: "modeled",
      parts: [
        {
          id: "part_fire",
          damageType: "physical_bludgeoning",
          base: { terms: [{ count: 2, sides: 6 }], flatModifier: 1 },
          save: { kind: "half" },
        },
      ],
    };

    expect(damageToText(spec)).toBe("2d6+1 physical bludgeoning (half save)");
  });

  it("uses dm_adjudicated sourceText fallback", () => {
    const spec: SpellDamageSpec = {
      kind: "dm_adjudicated",
      sourceText: "DM rules this at runtime",
    };

    expect(damageToText(spec)).toBe("DM rules this at runtime");
  });
});

describe("areaToText", () => {
  it("formats point", () => {
    const spec: AreaSpec = { kind: "point" };
    expect(areaToText(spec)).toBe("Point");
  });

  it("formats radius circle and radius sphere", () => {
    const circle: AreaSpec = {
      kind: "radius_circle",
      shapeUnit: "ft",
      radius: { mode: "fixed", value: 30 },
    };
    const sphere: AreaSpec = {
      kind: "radius_sphere",
      shapeUnit: "yd",
      radius: { mode: "per_level", perLevel: 2 },
    };

    expect(areaToText(circle)).toBe("30-ft radius");
    expect(areaToText(sphere)).toBe("2-yd radius (sphere)");
  });

  it("formats cone and line", () => {
    const cone: AreaSpec = {
      kind: "cone",
      shapeUnit: "ft",
      length: { mode: "fixed", value: 60 },
    };
    const line: AreaSpec = {
      kind: "line",
      shapeUnit: "yd",
      length: { mode: "fixed", value: 120 },
    };

    expect(areaToText(cone)).toBe("Cone 60 ft");
    expect(areaToText(line)).toBe("Line 120 yd");
  });

  it("ignores rawLegacyValue for non-special kinds", () => {
    const spec: AreaSpec = {
      kind: "point",
      rawLegacyValue: "40 ft radius burst",
    };
    // Design Decision 2: rawLegacyValue is NEVER the .text input when structured fields are present
    expect(areaToText(spec)).toBe("Point");
  });

  it("uses rawLegacyValue for special kind", () => {
    const spec: AreaSpec = {
      kind: "special",
      rawLegacyValue: "40 ft radius burst",
    };
    expect(areaToText(spec)).toBe("40 ft radius burst");
  });

  it("returns 'Special' when special kind has no rawLegacyValue", () => {
    const spec: AreaSpec = { kind: "special" };
    expect(areaToText(spec)).toBe("Special");
  });
});

describe("savingThrowToText", () => {
  it('returns "None" for kind none', () => {
    const spec: SavingThrowSpec = { kind: "none" };
    expect(savingThrowToText(spec)).toBe("None");
  });

  it("formats single and multiple saves", () => {
    expect(
      savingThrowToText({
        kind: "single",
        single: {
          saveType: "spell",
          onSuccess: { result: "no_effect" },
          onFailure: { result: "reduced_effect" },
        },
      }),
    ).toBe("spell (reduced effect on fail)");

    expect(
      savingThrowToText({
        kind: "multiple",
        multiple: [
          {
            saveType: "spell",
            onSuccess: { result: "no_effect" },
            onFailure: { result: "reduced_effect" },
          },
          {
            saveType: "breath_weapon",
            onSuccess: { result: "no_effect" },
            onFailure: { result: "full_effect" },
          },
        ],
      }),
    ).toBe("spell (reduced effect on fail); breath weapon (full effect on fail)");
  });

  it("formats dm_adjudicated", () => {
    expect(
      savingThrowToText({
        kind: "dm_adjudicated",
        rawLegacyValue: "Save outcome varies by terrain",
      }),
    ).toBe("Save outcome varies by terrain");
  });
});

describe("magicResistanceToText", () => {
  it('returns "N/A" for kind unknown', () => {
    expect(magicResistanceToText({ kind: "unknown" })).toBe("N/A");
  });

  it('returns "Yes" for normal MR', () => {
    expect(magicResistanceToText({ kind: "normal" })).toBe("Yes");
  });

  it('returns "No" for ignores_mr', () => {
    expect(magicResistanceToText({ kind: "ignores_mr" })).toBe("No");
  });

  it("formats partial MR scope", () => {
    expect(
      magicResistanceToText({
        kind: "partial",
        partial: { scope: "harmful_effects_only" },
      }),
    ).toBe("Partial (harmful effects only)");
  });
});

describe("componentsToText", () => {
  it("formats V/S/M component combinations", () => {
    const vs: SpellComponents = {
      verbal: true,
      somatic: true,
      material: false,
      focus: false,
      divineFocus: false,
      experience: false,
    };
    const vsm: SpellComponents = {
      verbal: true,
      somatic: true,
      material: true,
      focus: false,
      divineFocus: false,
      experience: false,
    };

    expect(componentsToText(vs, []).components).toBe("V, S");
    expect(componentsToText(vsm, []).components).toBe("V, S, M");
  });

  it("renders material quantity, gp value, and consumed marker", () => {
    const comp: SpellComponents = {
      verbal: true,
      somatic: false,
      material: true,
      focus: false,
      divineFocus: false,
      experience: false,
    };

    const rendered = componentsToText(comp, [
      { name: "diamond dust", quantity: 2, gpValue: 100, isConsumed: true },
      { name: "bat guano" },
    ]);

    expect(rendered.materialComponents).toBe("diamond dust x2 (100 gp) (consumed); bat guano");
  });
});

describe("rangeToText", () => {
  it("ignores rawLegacyValue for non-special kinds", () => {
    const spec: RangeSpec = {
      kind: "touch",
      rawLegacyValue: "Touch (see text)",
    };
    expect(rangeToText(spec)).toBe("Touch");
  });

  it("uses rawLegacyValue for special kind", () => {
    const spec: RangeSpec = {
      kind: "special",
      rawLegacyValue: "Caster only",
    };
    expect(rangeToText(spec)).toBe("Caster only");
  });

  it("returns 'Special' when special kind has no rawLegacyValue", () => {
    const spec: RangeSpec = { kind: "special" };
    expect(rangeToText(spec)).toBe("Special");
  });

  it("formats distance with unit", () => {
    const spec: RangeSpec = {
      kind: "distance",
      unit: "ft",
      distance: { mode: "fixed", value: 60 },
    };
    expect(rangeToText(spec)).toBe("60 ft");
  });
});

describe("durationToText", () => {
  it("ignores rawLegacyValue for non-special kinds", () => {
    const spec: DurationSpec = {
      kind: "instant",
      rawLegacyValue: "Instantaneous (see text)",
    };
    expect(durationToText(spec)).toBe("Instant");
  });

  it("uses rawLegacyValue for special kind", () => {
    const spec: DurationSpec = {
      kind: "special",
      rawLegacyValue: "Until sunrise",
    };
    expect(durationToText(spec)).toBe("Until sunrise");
  });

  it("returns 'Special' when special kind has no rawLegacyValue", () => {
    const spec: DurationSpec = { kind: "special" };
    expect(durationToText(spec)).toBe("Special");
  });

  it("formats time duration with unit", () => {
    const spec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 3 },
    };
    expect(durationToText(spec)).toBe("3 round");
  });
});

describe("castingTimeToText", () => {
  it("ignores rawLegacyValue for non-special units", () => {
    const ct: SpellCastingTime = {
      text: "1 round",
      unit: "round",
      baseValue: 1,
      rawLegacyValue: "1 round (see below)",
    };
    expect(castingTimeToText(ct)).toBe("1 round");
  });

  it("uses rawLegacyValue for special unit", () => {
    const ct: SpellCastingTime = {
      text: "Special",
      unit: "special",
      rawLegacyValue: "1 hour per gem",
    };
    expect(castingTimeToText(ct)).toBe("1 hour per gem");
  });

  it("returns 'Special' when special unit has no rawLegacyValue", () => {
    const ct: SpellCastingTime = {
      text: "Special",
      unit: "special",
    };
    expect(castingTimeToText(ct)).toBe("Special");
  });

  it("formats base value with unit", () => {
    const ct: SpellCastingTime = {
      text: "3 segments",
      unit: "segment",
      baseValue: 3,
    };
    expect(castingTimeToText(ct)).toBe("3 segments");
  });
});
