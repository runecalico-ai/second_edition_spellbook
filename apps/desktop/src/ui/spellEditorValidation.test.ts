import { describe, expect, it } from "vitest";
import {
  deriveSpellEditorFieldErrors,
  getFirstInvalidFocusTarget,
  sortFieldErrorsByFocusOrder,
  type SpellEditorValidationInput,
} from "./spellEditorValidation";
import type { AreaSpec, DurationSpec, RangeSpec, SpellCastingTime } from "../types/spell";

type SpellEditorFormFields = SpellEditorValidationInput["form"];

type BaseInputOverrides = Partial<Omit<SpellEditorValidationInput, "form">> & {
  form?: Partial<SpellEditorFormFields>;
};

function baseInput(overrides: BaseInputOverrides = {}): SpellEditorValidationInput {
  const { form: formOverrides, ...rest } = overrides;
  return {
    form: {
      name: "Fireball",
      description: "A blast",
      level: 3,
      school: "Evocation",
      sphere: null,
      classList: "Mage",
      isQuestSpell: 0,
      isCantrip: 0,
      ...formOverrides,
    },
    tradition: "ARCANE",
    rangeSpec: null,
    durationSpec: null,
    castingTimeSpec: null,
    areaSpec: null,
    ...rest,
  };
}

describe("deriveSpellEditorFieldErrors", () => {
  it("empty name returns spell-name-error field error", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({ form: { name: "   ", description: "x" } }),
    );
    const nameErr = errors.find((e) => e.field === "spell-name");
    expect(nameErr).toEqual({
      field: "spell-name",
      testId: "spell-name-error",
      message: "Name is required.",
      focusTarget: "spell-name",
    });
  });

  it("empty description preserves description-required validation", () => {
    const errors = deriveSpellEditorFieldErrors(baseInput({ form: { description: "" } }));
    expect(errors).toContainEqual({
      field: "spell-description",
      testId: "error-description-required",
      message: "Description is required.",
      focusTarget: "spell-description",
    });
  });

  it("invalid level preserves level-range validation", () => {
    for (const level of [-1, 13, Number.NaN]) {
      const errors = deriveSpellEditorFieldErrors(baseInput({ form: { level } }));
      expect(errors).toContainEqual({
        field: "spell-level",
        testId: "error-level-range",
        message: "Level must be 0-12.",
        focusTarget: "spell-level",
      });
    }
  });

  it("Arcane tradition with no school returns error-school-required-arcane-tradition", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "ARCANE",
        form: { school: "", sphere: null },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-school",
      testId: "error-school-required-arcane-tradition",
      message: "School is required for Arcane tradition.",
      focusTarget: "spell-school",
    });
  });

  it("Arcane tradition with no school does not also surface error-tradition-conflict", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "ARCANE",
        form: { school: "", sphere: null },
      }),
    );
    expect(errors.some((e) => e.testId === "error-tradition-conflict")).toBe(false);
  });

  it("Epic level without school returns error-school-required-arcane", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 10, school: "", sphere: null },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-school",
      testId: "error-school-required-arcane",
      message: "School is required for Epic (Arcane) spells.",
      focusTarget: "spell-school",
    });
  });

  it("Epic level without school does not also emit the generic Arcane-tradition school error", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 10, school: "", sphere: null },
      }),
    );
    expect(errors.some((e) => e.testId === "error-school-required-arcane-tradition")).toBe(false);
  });

  it("Epic spell with priest/cleric classes and no Wizard/Mage returns error-epic-arcane-class-restriction", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: {
          level: 10,
          school: "Evocation",
          sphere: null,
          classList: "Cleric",
        },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-classes",
      testId: "error-epic-arcane-class-restriction",
      message: "Epic spells are Arcane only and require Wizard/Mage class access.",
      focusTarget: "spell-classes",
    });
  });

  it("Divine tradition with no sphere returns error-sphere-required-divine-tradition", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "DIVINE",
        form: { school: null, sphere: "" },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-sphere",
      testId: "error-sphere-required-divine-tradition",
      message: "Sphere is required for Divine tradition.",
      focusTarget: "spell-sphere",
    });
  });

  it("Quest spell without sphere returns error-sphere-required-divine", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 8, isQuestSpell: 1, school: null, sphere: "" },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-sphere",
      testId: "error-sphere-required-divine",
      message: "Sphere is required for Quest (Divine) spells.",
      focusTarget: "spell-sphere",
    });
  });

  it("Quest spell without sphere does not also emit the generic Divine-tradition sphere error", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "DIVINE",
        form: { level: 8, isQuestSpell: 1, school: null, sphere: "" },
      }),
    );
    expect(errors.some((e) => e.testId === "error-sphere-required-divine-tradition")).toBe(false);
  });

  it("epic-plus-quest conflict preserves blocking validation", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 10, isQuestSpell: 1 },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-level",
      testId: "error-epic-quest-conflict",
      message: "Cannot be both Epic and Quest spell.",
      focusTarget: "spell-level",
    });
  });

  it("cantrip gating preserves constraints: cantrip flag with non-zero level", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 3, isCantrip: 1 },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-level",
      testId: "error-cantrip-level",
      message: "Cantrips must be Level 0",
      focusTarget: "spell-level",
    });
  });

  it("quest gating: quest with school and no sphere is restricted", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { level: 8, isQuestSpell: 1, school: "Evocation", sphere: null },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-sphere",
      testId: "error-quest-spell-divine-only",
      message: "Quest spells are Divine (has Sphere) only",
      focusTarget: "spell-sphere",
    });
  });

  it("school plus sphere conflict returns error-tradition-conflict", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: { school: "Evocation", sphere: "Fire" },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-tradition",
      testId: "error-tradition-conflict",
      message:
        "This spell has both a School and a Sphere set — school and sphere are mutually exclusive. Remove one before saving.",
      focusTarget: "spell-tradition",
    });
  });

  it("valid spell returns no field errors", () => {
    expect(deriveSpellEditorFieldErrors(baseInput())).toEqual([]);
  });

  it("ScalarInput path: negative range base value returns exact copy on range-base-value", () => {
    const rangeSpec: RangeSpec = {
      kind: "distance",
      unit: "ft",
      distance: { mode: "fixed", value: -1 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ rangeSpec }));
    expect(errors).toContainEqual({
      field: "range-base-value",
      testId: "error-range-base-value",
      message: "Base value must be 0 or greater",
      focusTarget: "range-base-value",
    });
  });

  it("range per_level mode: negative per-level uses range-per-level", () => {
    const rangeSpec: RangeSpec = {
      kind: "distance",
      unit: "ft",
      distance: { mode: "per_level", perLevel: -2 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ rangeSpec }));
    expect(errors).toContainEqual({
      field: "range-per-level",
      testId: "error-range-per-level",
      message: "Per level must be 0 or greater",
      focusTarget: "range-per-level",
    });
  });

  it("StructuredFieldInput path: negative casting-time base returns exact copy", () => {
    const castingTimeSpec: SpellCastingTime = {
      text: "",
      unit: "segment",
      baseValue: -2,
      perLevel: 0,
      levelDivisor: 1,
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ castingTimeSpec }));
    expect(errors).toContainEqual({
      field: "casting-time-base-value",
      testId: "error-casting-time-base-value",
      message: "Base value must be 0 or greater",
      focusTarget: "casting-time-base-value",
    });
  });

  it("AreaForm path: negative length returns Length must be 0 or greater on area-form-length-value", () => {
    const areaSpec: AreaSpec = {
      kind: "cone",
      shapeUnit: "ft",
      length: { mode: "fixed", value: -0.5 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ areaSpec }));
    expect(errors).toContainEqual({
      field: "area-form-length-value",
      testId: "error-area-form-length-value",
      message: "Length must be 0 or greater",
      focusTarget: "area-form-length-value",
    });
  });

  it("area radius per_level mode: negative uses area-form-radius-per-level", () => {
    const areaSpec: AreaSpec = {
      kind: "radius_circle",
      shapeUnit: "ft",
      radius: { mode: "per_level", perLevel: -1 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ areaSpec }));
    expect(errors).toContainEqual({
      field: "area-form-radius-per-level",
      testId: "error-area-form-radius-per-level",
      message: "Per level must be 0 or greater",
      focusTarget: "area-form-radius-per-level",
    });
  });

  it("duration time kind: negative duration base value returns Base value message", () => {
    const durationSpec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: -3 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ durationSpec }));
    expect(errors).toContainEqual({
      field: "duration-base-value",
      testId: "error-duration-base-value",
      message: "Base value must be 0 or greater",
      focusTarget: "duration-base-value",
    });
  });

  it("duration time kind: per_level mode negative uses duration-per-level", () => {
    const durationSpec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "per_level", perLevel: -1 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ durationSpec }));
    expect(errors).toContainEqual({
      field: "duration-per-level",
      testId: "error-duration-per-level",
      message: "Per level must be 0 or greater",
      focusTarget: "duration-per-level",
    });
  });

  it("duration usage_limited: invalid uses scalar returns duration-uses-value error", () => {
    const durationSpec: DurationSpec = {
      kind: "usage_limited",
      uses: { mode: "fixed", value: -5 },
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ durationSpec }));
    expect(errors).toContainEqual({
      field: "duration-uses-value",
      testId: "error-duration-uses-value",
      message: "Base value must be 0 or greater",
      focusTarget: "duration-uses-value",
    });
  });

  it("casting time: negative per-level returns Per level must be 0 or greater", () => {
    const castingTimeSpec: SpellCastingTime = {
      text: "",
      unit: "segment",
      baseValue: 1,
      perLevel: -1,
      levelDivisor: 1,
    };
    const errors = deriveSpellEditorFieldErrors(baseInput({ castingTimeSpec }));
    expect(errors).toContainEqual({
      field: "casting-time-per-level",
      testId: "error-casting-time-per-level",
      message: "Per level must be 0 or greater",
      focusTarget: "casting-time-per-level",
    });
  });

  it("epic without arcane school but with sphere emits error-epic-level-arcane-only", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "DIVINE",
        form: {
          level: 10,
          school: null,
          sphere: "Healing",
        },
      }),
    );
    expect(errors).toContainEqual({
      field: "spell-school",
      testId: "error-epic-level-arcane-only",
      message: "Levels 10-12 are Arcane (has School) only",
      focusTarget: "spell-school",
    });
  });
});

describe("getFirstInvalidFocusTarget", () => {
  it("uses deterministic focus order (name before school)", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        tradition: "ARCANE",
        form: { name: "", school: "", description: "x", level: 10 },
      }),
    );
    expect(getFirstInvalidFocusTarget(errors)).toBe("spell-name");
  });
});

describe("sortFieldErrorsByFocusOrder", () => {
  it("orders school before classes when both invalid", () => {
    const errors = deriveSpellEditorFieldErrors(
      baseInput({
        form: {
          level: 10,
          school: "",
          sphere: null,
          classList: "Cleric",
        },
      }),
    );
    const sorted = sortFieldErrorsByFocusOrder(errors);
    const classIdx = sorted.findIndex((e) => e.field === "spell-classes");
    const schoolIdx = sorted.findIndex((e) => e.field === "spell-school");
    expect(schoolIdx).toBeGreaterThanOrEqual(0);
    expect(classIdx).toBeGreaterThanOrEqual(0);
    expect(schoolIdx).toBeLessThan(classIdx);
  });
});
