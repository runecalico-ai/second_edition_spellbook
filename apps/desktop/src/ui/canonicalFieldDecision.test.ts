import { describe, expect, it, vi } from "vitest";
import { decideCanonicalField } from "./canonicalFieldDecision";

describe("decideCanonicalField", () => {
  it("returns unsuppressed when key is missing", () => {
    const normalize = vi.fn((value: Record<string, unknown>) => value);
    const validate = vi.fn(() => true);

    const result = decideCanonicalField({}, "range", normalize, validate);

    expect(result).toEqual({ suppressExpandParse: false });
    expect(normalize).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("treats explicit null as missing so legacy is parsed on expand (hybrid loading spec)", () => {
    const normalize = vi.fn((value: Record<string, unknown>) => value);
    const validate = vi.fn(() => true);

    const result = decideCanonicalField({ range: null }, "range", normalize, validate);

    expect(result).toEqual({ suppressExpandParse: false });
    expect(normalize).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("treats malformed non-object canonical field as missing-equivalent", () => {
    const normalize = vi.fn((value: Record<string, unknown>) => value);
    const validate = vi.fn(() => true);

    const result = decideCanonicalField({ range: "30 ft" }, "range", normalize, validate);

    expect(result).toEqual({ suppressExpandParse: false });
    expect(normalize).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("treats invalid normalized object as missing-equivalent", () => {
    const normalize = vi.fn((value: Record<string, unknown>) => ({
      kind: value.kind,
      rawLegacyValue: value.raw_legacy_value,
    }));
    const validate = vi.fn(() => false);

    const result = decideCanonicalField({ range: {} }, "range", normalize, validate);

    expect(result).toEqual({ suppressExpandParse: false });
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("suppresses parse and returns structured value for valid normalized object", () => {
    const normalize = vi.fn((value: Record<string, unknown>) => ({
      kind: value.kind,
      unit: value.unit,
    }));
    const validate = vi.fn(() => true);

    const result = decideCanonicalField(
      { range: { kind: "distance", unit: "ft" } },
      "range",
      normalize,
      validate,
    );

    expect(result).toEqual({
      suppressExpandParse: true,
      structuredValue: { kind: "distance", unit: "ft" },
    });
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
