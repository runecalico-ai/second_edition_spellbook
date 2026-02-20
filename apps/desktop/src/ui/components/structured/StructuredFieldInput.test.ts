import { describe, expect, it } from "vitest";
import type { DurationSpec, RangeSpec, SpellCastingTime } from "../../../types/spell";
import { castingTimeToText, durationToText, rangeToText } from "./StructuredFieldInput";

describe("rangeToText", () => {
  it('returns "Touch" for kind touch', () => {
    expect(rangeToText({ kind: "touch" })).toBe("Touch");
  });

  it("returns structured distance text", () => {
    const spec: RangeSpec = {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
    };
    expect(rangeToText(spec)).toBe("30 ft");
  });

  it("returns rawLegacyValue when present (documents short-circuit)", () => {
    const spec: RangeSpec = {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
      rawLegacyValue: "weird text",
    };
    expect(rangeToText(spec)).toBe("weird text");
  });

  it("returns per_level format for distance", () => {
    const spec: RangeSpec = {
      kind: "distance",
      distance: { mode: "per_level", perLevel: 10 },
      unit: "ft",
    };
    expect(rangeToText(spec)).toBe("10/ft/level");
  });

  it('returns "Special" for special kind without rawLegacyValue', () => {
    expect(rangeToText({ kind: "special" })).toBe("Special");
  });

  it("returns rawLegacyValue for special kind when set", () => {
    expect(rangeToText({ kind: "special", rawLegacyValue: "custom range" })).toBe("custom range");
  });
});

describe("durationToText", () => {
  it('returns "Instant" for instant kind', () => {
    expect(durationToText({ kind: "instant" })).toBe("Instant");
  });

  it("returns time-based text", () => {
    const spec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 3 },
    };
    expect(durationToText(spec)).toBe("3 round");
  });

  it("returns rawLegacyValue when present (documents short-circuit)", () => {
    const spec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 3 },
      rawLegacyValue: "stale",
    };
    expect(durationToText(spec)).toBe("stale");
  });

  it("returns per_level format for time duration", () => {
    const spec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "per_level", perLevel: 2 },
    };
    expect(durationToText(spec)).toBe("2 round/level");
  });

  it("returns usage_limited text", () => {
    const spec: DurationSpec = {
      kind: "usage_limited",
      uses: { mode: "fixed", value: 3 },
    };
    expect(durationToText(spec)).toBe("3 use(s)");
  });

  it("returns usage_limited per_level text", () => {
    const spec: DurationSpec = {
      kind: "usage_limited",
      uses: { mode: "per_level", perLevel: 1 },
    };
    expect(durationToText(spec)).toBe("1 uses/level");
  });

  it('returns "Special" for special kind without rawLegacyValue', () => {
    expect(durationToText({ kind: "special" })).toBe("Special");
  });
});

describe("castingTimeToText", () => {
  it("returns unit-based text", () => {
    const ct: SpellCastingTime = {
      text: "1 round",
      unit: "round",
      baseValue: 1,
      perLevel: 0,
      levelDivisor: 1,
    };
    expect(castingTimeToText(ct)).toBe("1 round");
  });

  it("returns rawLegacyValue when present (documents short-circuit)", () => {
    const ct: SpellCastingTime = {
      text: "1 round",
      unit: "round",
      baseValue: 1,
      perLevel: 0,
      levelDivisor: 1,
      rawLegacyValue: "stale",
    };
    expect(castingTimeToText(ct)).toBe("stale");
  });

  it("returns per_level format", () => {
    const ct: SpellCastingTime = {
      text: "",
      unit: "segment",
      baseValue: 3,
      perLevel: 1,
      levelDivisor: 1,
    };
    expect(castingTimeToText(ct)).toBe("3 + 1/level segment");
  });

  it("returns per_level format with divisor", () => {
    const ct: SpellCastingTime = {
      text: "",
      unit: "round",
      baseValue: 2,
      perLevel: 1,
      levelDivisor: 3,
    };
    expect(castingTimeToText(ct)).toBe("2 + 1/3/level round");
  });

  it('returns "Special" for special unit without rawLegacyValue', () => {
    const ct: SpellCastingTime = { text: "", unit: "special" };
    expect(castingTimeToText(ct)).toBe("Special");
  });
});
