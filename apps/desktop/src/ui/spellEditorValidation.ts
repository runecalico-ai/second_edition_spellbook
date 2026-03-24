import type {
  AreaKind,
  AreaSpec,
  DurationSpec,
  RangeSpec,
  SpellCastingTime,
  SpellDetail,
  SpellScalar,
} from "../types/spell";
import { RANGE_DISTANCE_KINDS } from "../types/spell";

export type SpellEditorTradition = "ARCANE" | "DIVINE";

/** Field keys match DOM `id` or `data-testid` of the owning control (Chunk 2 / Task 3). */
export type SpellEditorValidatedFieldKey =
  | "spell-name"
  | "spell-description"
  | "spell-level"
  | "spell-tradition"
  | "spell-school"
  | "spell-sphere"
  | "spell-classes"
  | "range-base-value"
  | "range-per-level"
  | "duration-base-value"
  | "duration-per-level"
  | "duration-uses-value"
  | "duration-uses-per-level"
  | "casting-time-base-value"
  | "casting-time-per-level"
  | "area-form-radius-value"
  | "area-form-radius-per-level"
  | "area-form-length-value"
  | "area-form-length-per-level"
  | "area-form-width-value"
  | "area-form-width-per-level"
  | "area-form-height-value"
  | "area-form-height-per-level"
  | "area-form-thickness-value"
  | "area-form-thickness-per-level"
  | "area-form-edge-value"
  | "area-form-edge-per-level"
  | "area-form-surface-area-value"
  | "area-form-surface-area-per-level"
  | "area-form-volume-value"
  | "area-form-volume-per-level"
  | "area-form-tile-count-value"
  | "area-form-tile-count-per-level"
  | "area-form-count-value"
  | "area-form-count-per-level";

export interface SpellEditorFieldError {
  field: SpellEditorValidatedFieldKey;
  testId: string;
  message: string;
  focusTarget: string;
}

export interface SpellEditorValidationInput {
  form: Pick<
    SpellDetail,
    | "name"
    | "description"
    | "level"
    | "school"
    | "sphere"
    | "classList"
    | "isQuestSpell"
    | "isCantrip"
  >;
  tradition: SpellEditorTradition;
  rangeSpec: RangeSpec | null;
  durationSpec: DurationSpec | null;
  castingTimeSpec: SpellCastingTime | null;
  areaSpec: AreaSpec | null;
}

const PRIEST_CLERIC_CLASS = /\b(priest|cleric)\b/i;
const WIZARD_MAGE_CLASS = /\b(wizard|mage)\b/i;

function schoolTrimmed(school: string | null | undefined): string {
  return (school ?? "").trim();
}

function sphereTrimmed(sphere: string | null | undefined): string {
  return (sphere ?? "").trim();
}

function hasTraditionConflict(
  school: string | null | undefined,
  sphere: string | null | undefined,
): boolean {
  return !!schoolTrimmed(school) && !!sphereTrimmed(sphere);
}

function isArcaneByData(school: string | null | undefined): boolean {
  return !!schoolTrimmed(school);
}

function isDivineByData(sphere: string | null | undefined): boolean {
  return !!sphereTrimmed(sphere);
}

function hasPriestOrClericClass(classList: string | null | undefined): boolean {
  return PRIEST_CLERIC_CLASS.test(classList ?? "");
}

function hasWizardOrMageClass(classList: string | null | undefined): boolean {
  return WIZARD_MAGE_CLASS.test(classList ?? "");
}

/** Deterministic first-invalid focus: earlier index wins. */
export const SPELL_EDITOR_FOCUS_ORDER: readonly string[] = [
  "spell-name",
  "spell-level",
  "spell-description",
  "spell-tradition",
  "spell-school",
  "spell-sphere",
  "spell-classes",
  "range-base-value",
  "range-per-level",
  "duration-base-value",
  "duration-per-level",
  "duration-uses-value",
  "duration-uses-per-level",
  "casting-time-base-value",
  "casting-time-per-level",
  "area-form-radius-value",
  "area-form-radius-per-level",
  "area-form-length-value",
  "area-form-length-per-level",
  "area-form-width-value",
  "area-form-width-per-level",
  "area-form-height-value",
  "area-form-height-per-level",
  "area-form-thickness-value",
  "area-form-thickness-per-level",
  "area-form-edge-value",
  "area-form-edge-per-level",
  "area-form-surface-area-value",
  "area-form-surface-area-per-level",
  "area-form-volume-value",
  "area-form-volume-per-level",
  "area-form-tile-count-value",
  "area-form-tile-count-per-level",
  "area-form-count-value",
  "area-form-count-per-level",
] as const;

/** All area dimension scalar keys validated by `deriveSpellEditorFieldErrors` (blur visibility in SpellEditor). */
export const SPELL_EDITOR_AREA_SCALAR_KEYS: readonly SpellEditorValidatedFieldKey[] = [
  "area-form-radius-value",
  "area-form-radius-per-level",
  "area-form-length-value",
  "area-form-length-per-level",
  "area-form-width-value",
  "area-form-width-per-level",
  "area-form-height-value",
  "area-form-height-per-level",
  "area-form-thickness-value",
  "area-form-thickness-per-level",
  "area-form-edge-value",
  "area-form-edge-per-level",
  "area-form-surface-area-value",
  "area-form-surface-area-per-level",
  "area-form-volume-value",
  "area-form-volume-per-level",
  "area-form-tile-count-value",
  "area-form-tile-count-per-level",
  "area-form-count-value",
  "area-form-count-per-level",
];

export function sortFieldErrorsByFocusOrder(
  errors: SpellEditorFieldError[],
): SpellEditorFieldError[] {
  const index = new Map<string, number>();
  for (let i = 0; i < SPELL_EDITOR_FOCUS_ORDER.length; i++) {
    const key = SPELL_EDITOR_FOCUS_ORDER[i];
    if (key !== undefined) index.set(key, i);
  }
  return [...errors].sort((a, b) => {
    const ia = index.get(a.focusTarget) ?? 9999;
    const ib = index.get(b.focusTarget) ?? 9999;
    return ia - ib;
  });
}

export function getFirstInvalidFocusTarget(errors: SpellEditorFieldError[]): string | null {
  const sorted = sortFieldErrorsByFocusOrder(errors);
  return sorted[0]?.focusTarget ?? null;
}

function isNonNegativeNumber(n: number): boolean {
  return !Number.isNaN(n) && n >= 0;
}

function pushScalarErrors(
  out: SpellEditorFieldError[],
  scalar: SpellScalar | undefined,
  fixedKey: SpellEditorValidatedFieldKey,
  perLevelKey: SpellEditorValidatedFieldKey,
  fixedLabelMessage: string,
  perLevelLabelMessage: string,
): void {
  const mode = scalar?.mode ?? "fixed";
  if (mode === "fixed") {
    const v = scalar?.value ?? 0;
    if (!isNonNegativeNumber(v)) {
      out.push({
        field: fixedKey,
        testId: `error-${fixedKey}`,
        message: fixedLabelMessage,
        focusTarget: fixedKey,
      });
    }
  } else {
    const pl = scalar?.perLevel ?? scalar?.per_level ?? 0;
    if (!isNonNegativeNumber(pl)) {
      out.push({
        field: perLevelKey,
        testId: `error-${perLevelKey}`,
        message: perLevelLabelMessage,
        focusTarget: perLevelKey,
      });
    }
  }
}

function validateRangeScalars(range: RangeSpec | null, out: SpellEditorFieldError[]): void {
  if (!range) return;
  if (!RANGE_DISTANCE_KINDS.includes(range.kind as (typeof RANGE_DISTANCE_KINDS)[number])) return;
  pushScalarErrors(
    out,
    range.distance,
    "range-base-value",
    "range-per-level",
    "Base value must be 0 or greater",
    "Per level must be 0 or greater",
  );
}

function validateDurationScalars(spec: DurationSpec | null, out: SpellEditorFieldError[]): void {
  if (!spec) return;
  if (spec.kind === "time") {
    pushScalarErrors(
      out,
      spec.duration,
      "duration-base-value",
      "duration-per-level",
      "Base value must be 0 or greater",
      "Per level must be 0 or greater",
    );
  }
  if (spec.kind === "usage_limited") {
    pushScalarErrors(
      out,
      spec.uses,
      "duration-uses-value",
      "duration-uses-per-level",
      "Base value must be 0 or greater",
      "Per level must be 0 or greater",
    );
  }
}

function validateCastingTimeScalars(
  ct: SpellCastingTime | null,
  out: SpellEditorFieldError[],
): void {
  if (!ct) return;
  const base = ct.baseValue;
  if (base !== undefined && !isNonNegativeNumber(base)) {
    out.push({
      field: "casting-time-base-value",
      testId: "error-casting-time-base-value",
      message: "Base value must be 0 or greater",
      focusTarget: "casting-time-base-value",
    });
  }
  const pl = ct.perLevel;
  if (pl !== undefined && !isNonNegativeNumber(pl)) {
    out.push({
      field: "casting-time-per-level",
      testId: "error-casting-time-per-level",
      message: "Per level must be 0 or greater",
      focusTarget: "casting-time-per-level",
    });
  }
}

const AREA_SCALAR_FIELDS: {
  kinds: readonly AreaKind[];
  prop: keyof Pick<
    AreaSpec,
    | "radius"
    | "length"
    | "width"
    | "height"
    | "thickness"
    | "edge"
    | "surfaceArea"
    | "volume"
    | "tileCount"
    | "count"
  >;
  fixedKey: SpellEditorValidatedFieldKey;
  perLevelKey: SpellEditorValidatedFieldKey;
  fixedMsg: string;
}[] = [
  {
    kinds: ["radius_circle", "radius_sphere", "cylinder"],
    prop: "radius",
    fixedKey: "area-form-radius-value",
    perLevelKey: "area-form-radius-per-level",
    fixedMsg: "Radius must be 0 or greater",
  },
  {
    kinds: ["cone", "line", "rect", "rect_prism", "wall"],
    prop: "length",
    fixedKey: "area-form-length-value",
    perLevelKey: "area-form-length-per-level",
    fixedMsg: "Length must be 0 or greater",
  },
  {
    // H-001: "wall" removed — the wall editor only renders length, height, and
    // thickness inputs; including "wall" here would emit a blocking error with
    // no focusable DOM target when a wall area carries a legacy width value.
    kinds: ["rect", "rect_prism"],
    prop: "width",
    fixedKey: "area-form-width-value",
    perLevelKey: "area-form-width-per-level",
    fixedMsg: "Width must be 0 or greater",
  },
  {
    kinds: ["rect_prism", "cylinder", "wall"],
    prop: "height",
    fixedKey: "area-form-height-value",
    perLevelKey: "area-form-height-per-level",
    fixedMsg: "Height must be 0 or greater",
  },
  {
    kinds: ["wall"],
    prop: "thickness",
    fixedKey: "area-form-thickness-value",
    perLevelKey: "area-form-thickness-per-level",
    fixedMsg: "Thickness must be 0 or greater",
  },
  {
    kinds: ["cube"],
    prop: "edge",
    fixedKey: "area-form-edge-value",
    perLevelKey: "area-form-edge-per-level",
    fixedMsg: "Edge length must be 0 or greater",
  },
  {
    kinds: ["surface"],
    prop: "surfaceArea",
    fixedKey: "area-form-surface-area-value",
    perLevelKey: "area-form-surface-area-per-level",
    fixedMsg: "Surface area must be 0 or greater",
  },
  {
    kinds: ["volume"],
    prop: "volume",
    fixedKey: "area-form-volume-value",
    perLevelKey: "area-form-volume-per-level",
    fixedMsg: "Volume must be 0 or greater",
  },
  {
    kinds: ["tiles"],
    prop: "tileCount",
    fixedKey: "area-form-tile-count-value",
    perLevelKey: "area-form-tile-count-per-level",
    fixedMsg: "Tile count must be 0 or greater",
  },
  {
    kinds: ["creatures", "objects"],
    prop: "count",
    fixedKey: "area-form-count-value",
    perLevelKey: "area-form-count-per-level",
    fixedMsg: "Count must be 0 or greater",
  },
];

function validateAreaScalars(spec: AreaSpec | null, out: SpellEditorFieldError[]): void {
  if (!spec || spec.kind === "special") return;
  for (const row of AREA_SCALAR_FIELDS) {
    if (!row.kinds.includes(spec.kind)) continue;
    const scalar = spec[row.prop] as SpellScalar | undefined;
    pushScalarErrors(
      out,
      scalar,
      row.fixedKey,
      row.perLevelKey,
      row.fixedMsg,
      "Per level must be 0 or greater",
    );
  }
}

/**
 * Pure validation for the spell editor form and in-scope structured specs (Chunk 2).
 */
export function deriveSpellEditorFieldErrors(
  input: SpellEditorValidationInput,
): SpellEditorFieldError[] {
  const { form, tradition } = input;
  const out: SpellEditorFieldError[] = [];

  const nameOk = !!form.name.trim();
  if (!nameOk) {
    out.push({
      field: "spell-name",
      testId: "spell-name-error",
      message: "Name is required.",
      focusTarget: "spell-name",
    });
  }

  if (!form.description.trim()) {
    out.push({
      field: "spell-description",
      testId: "error-description-required",
      message: "Description is required.",
      focusTarget: "spell-description",
    });
  }

  const level = form.level;
  const levelInvalid = Number.isNaN(level) || level < 0 || level > 12;
  if (levelInvalid) {
    out.push({
      field: "spell-level",
      testId: "error-level-range",
      message: "Level must be 0-12.",
      focusTarget: "spell-level",
    });
  }

  const school = form.school;
  const sphere = form.sphere;
  const arcaneData = isArcaneByData(school);
  const divineData = isDivineByData(sphere);
  const traditionConflict = hasTraditionConflict(school, sphere);

  if (traditionConflict) {
    out.push({
      field: "spell-tradition",
      testId: "error-tradition-conflict",
      message:
        "This spell has both a School and a Sphere set — school and sphere are mutually exclusive. Remove one before saving.",
      focusTarget: "spell-tradition",
    });
  }

  const epicClassRestricted =
    level >= 10 &&
    !traditionConflict &&
    hasPriestOrClericClass(form.classList) &&
    !hasWizardOrMageClass(form.classList);

  if (epicClassRestricted) {
    out.push({
      field: "spell-classes",
      testId: "error-epic-arcane-class-restriction",
      message: "Epic spells are Arcane only and require Wizard/Mage class access.",
      focusTarget: "spell-classes",
    });
  }

  const isEpicRestricted = level >= 10 && !traditionConflict && (divineData || !arcaneData);

  if (isEpicRestricted) {
    out.push({
      field: "spell-school",
      testId: "error-epic-level-arcane-only",
      message: "Levels 10-12 are Arcane (has School) only",
      focusTarget: "spell-school",
    });
  }

  const isQuestRestricted =
    form.isQuestSpell === 1 && !traditionConflict && (arcaneData || !divineData);

  if (isQuestRestricted) {
    out.push({
      field: "spell-sphere",
      testId: "error-quest-spell-divine-only",
      message: "Quest spells are Divine (has Sphere) only",
      focusTarget: "spell-sphere",
    });
  }

  if (level >= 10 && form.isQuestSpell === 1) {
    out.push({
      field: "spell-level",
      testId: "error-epic-quest-conflict",
      message: "Cannot be both Epic and Quest spell.",
      focusTarget: "spell-level",
    });
  }

  if (form.isCantrip === 1 && level !== 0) {
    out.push({
      field: "spell-level",
      testId: "error-cantrip-level",
      message: "Cantrips must be Level 0",
      focusTarget: "spell-level",
    });
  }

  if (tradition === "ARCANE" && level < 10 && !schoolTrimmed(school)) {
    out.push({
      field: "spell-school",
      testId: "error-school-required-arcane-tradition",
      message: "School is required for Arcane tradition.",
      focusTarget: "spell-school",
    });
  }

  if (level >= 10 && !schoolTrimmed(school)) {
    out.push({
      field: "spell-school",
      testId: "error-school-required-arcane",
      message: "School is required for Epic (Arcane) spells.",
      focusTarget: "spell-school",
    });
  }

  if (tradition === "DIVINE" && form.isQuestSpell !== 1 && !sphereTrimmed(sphere)) {
    out.push({
      field: "spell-sphere",
      testId: "error-sphere-required-divine-tradition",
      message: "Sphere is required for Divine tradition.",
      focusTarget: "spell-sphere",
    });
  }

  if (form.isQuestSpell === 1 && !sphereTrimmed(sphere)) {
    out.push({
      field: "spell-sphere",
      testId: "error-sphere-required-divine",
      message: "Sphere is required for Quest (Divine) spells.",
      focusTarget: "spell-sphere",
    });
  }

  validateRangeScalars(input.rangeSpec, out);
  validateDurationScalars(input.durationSpec, out);
  validateCastingTimeScalars(input.castingTimeSpec, out);
  validateAreaScalars(input.areaSpec, out);

  return out;
}
