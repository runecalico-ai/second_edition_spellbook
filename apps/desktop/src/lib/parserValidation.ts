/**
 * Strict runtime validators for parser command output.
 * If validation fails, the caller should treat as parse failure and use fallback
 * (e.g. kind: "special" with rawLegacyValue) and add the field to the warning banner.
 */

import {
  type AreaSpec,
  DURATION_CONDITION_KINDS,
  DURATION_KIND_ONLY,
  type DamagePart,
  type DicePool,
  type DurationSpec,
  RANGE_DISTANCE_KINDS,
  RANGE_KIND_ONLY,
  type RangeSpec,
  type SpellCastingTime,
  type SpellDamageSpec,
  type SpellScalar,
} from "../types/spell";

const RANGE_KINDS: Set<string> = new Set([...RANGE_DISTANCE_KINDS, ...RANGE_KIND_ONLY, "special"]);

const RANGE_UNITS: Set<string> = new Set(["ft", "yd", "mi", "inch"]);

const DURATION_KINDS: Set<string> = new Set([
  ...DURATION_KIND_ONLY,
  "time",
  ...DURATION_CONDITION_KINDS,
  "usage_limited",
  "special",
]);

const DURATION_UNITS: Set<string> = new Set([
  "segment",
  "round",
  "turn",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
]);

const CASTING_TIME_UNITS: Set<string> = new Set([
  "segment",
  "round",
  "turn",
  "hour",
  "minute",
  "action",
  "bonus_action",
  "reaction",
  "special",
  "instantaneous",
]);

const AREA_KINDS: Set<string> = new Set([
  "point",
  "radius_circle",
  "radius_sphere",
  "cone",
  "line",
  "rect",
  "rect_prism",
  "cylinder",
  "wall",
  "cube",
  "volume",
  "surface",
  "tiles",
  "creatures",
  "objects",
  "region",
  "scope",
  "special",
]);

const SHAPE_UNITS: Set<string> = new Set(["ft", "yd", "mi", "inch"]);

const DAMAGE_KINDS: Set<string> = new Set(["none", "modeled", "dm_adjudicated"]);

function hasMode(o: unknown): o is { mode: string } {
  return (
    !!o && typeof o === "object" && "mode" in o && typeof (o as { mode: unknown }).mode === "string"
  );
}

function isValidScalar(o: unknown): o is SpellScalar {
  if (!o || typeof o !== "object") return false;
  const s = o as Record<string, unknown>;
  const mode = s.mode as string | undefined;
  if (mode !== "fixed" && mode !== "per_level") return false;
  if (s.value != null && typeof s.value !== "number") return false;
  if (s.perLevel != null && typeof s.perLevel !== "number") return false;
  if (s.per_level != null && typeof s.per_level !== "number") return false;
  return true;
}

function isValidDicePool(o: unknown): o is DicePool {
  if (!o || typeof o !== "object") return false;
  const p = o as Record<string, unknown>;
  const terms = p.terms as unknown[] | undefined;
  if (!Array.isArray(terms) || terms.length === 0) return false;
  for (const t of terms) {
    if (!t || typeof t !== "object") return false;
    const term = t as Record<string, unknown>;
    if (typeof term.count !== "number" || typeof term.sides !== "number") return false;
  }
  if (p.flatModifier != null && typeof p.flatModifier !== "number") return false;
  if (
    p.flat_modifier != null &&
    typeof (p as { flat_modifier?: number }).flat_modifier !== "number"
  )
    return false;
  return true;
}

/**
 * Validates parser output for range. Distance kinds require distance (object with mode) and unit.
 */
export function validateRangeSpec(x: unknown): x is RangeSpec {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  const kind = r.kind as string | undefined;
  if (!kind || !RANGE_KINDS.has(kind)) return false;

  if (RANGE_DISTANCE_KINDS.includes(kind as (typeof RANGE_DISTANCE_KINDS)[number])) {
    const distance = r.distance;
    if (!distance || !hasMode(distance) || !isValidScalar(distance)) return false;
    const unit = r.unit as string | undefined;
    if (!unit || !RANGE_UNITS.has(unit)) return false;
  }

  if (kind === "special") {
    // rawLegacyValue is optional but typically present when coming from fallback
    if (r.rawLegacyValue != null && typeof r.rawLegacyValue !== "string") return false;
  }

  return true;
}

/**
 * Validates parser output for duration. kind=time requires unit and duration (object with mode).
 */
export function validateDurationSpec(x: unknown): x is DurationSpec {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  const kind = d.kind as string | undefined;
  if (!kind || !DURATION_KINDS.has(kind)) return false;

  if (kind === "time") {
    const unit = d.unit as string | undefined;
    if (!unit || !DURATION_UNITS.has(unit)) return false;
    const duration = d.duration;
    if (!duration || !hasMode(duration) || !isValidScalar(duration)) return false;
  }

  if (DURATION_CONDITION_KINDS.includes(kind as (typeof DURATION_CONDITION_KINDS)[number])) {
    if (d.condition != null && typeof d.condition !== "string") return false;
  }

  if (kind === "usage_limited") {
    if (d.uses != null && !isValidScalar(d.uses)) return false;
  }

  if (kind === "special") {
    if (d.rawLegacyValue != null && typeof d.rawLegacyValue !== "string") return false;
  }

  return true;
}

/**
 * Validates parser output for casting time. unit is required.
 */
export function validateSpellCastingTime(x: unknown): x is SpellCastingTime {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  const unit = c.unit as string | undefined;
  if (!unit || !CASTING_TIME_UNITS.has(unit)) return false;
  if (c.text != null && typeof c.text !== "string") return false;
  if (c.baseValue != null && typeof c.baseValue !== "number") return false;
  if (c.base_value != null && typeof (c as { base_value?: number }).base_value !== "number")
    return false;
  if (c.perLevel != null && typeof c.perLevel !== "number") return false;
  if (c.per_level != null && typeof (c as { per_level?: number }).per_level !== "number")
    return false;
  if (c.levelDivisor != null && typeof c.levelDivisor !== "number") return false;
  if (
    c.level_divisor != null &&
    typeof (c as { level_divisor?: number }).level_divisor !== "number"
  )
    return false;
  if (c.rawLegacyValue != null && typeof c.rawLegacyValue !== "string") return false;
  return true;
}

/**
 * Validates parser output for area. kind-specific required fields per schema (e.g. radius_circle → radius, shapeUnit).
 */
export function validateAreaSpec(x: unknown): x is AreaSpec {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  const kind = a.kind as string | undefined;
  if (!kind || !AREA_KINDS.has(kind)) return false;

  const shapeUnit = (a.shapeUnit ?? a.shape_unit) as string | undefined;

  switch (kind) {
    case "radius_circle":
    case "radius_sphere":
      if (!a.radius || !hasMode(a.radius) || !isValidScalar(a.radius)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "cone":
    case "line":
      if (!a.length || !hasMode(a.length) || !isValidScalar(a.length)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "rect":
      if (!a.length || !hasMode(a.length) || !isValidScalar(a.length)) return false;
      if (!a.width || !hasMode(a.width) || !isValidScalar(a.width)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "rect_prism":
      if (!a.length || !hasMode(a.length) || !isValidScalar(a.length)) return false;
      if (!a.width || !hasMode(a.width) || !isValidScalar(a.width)) return false;
      if (!a.height || !hasMode(a.height) || !isValidScalar(a.height)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "cylinder":
      if (!a.radius || !hasMode(a.radius) || !isValidScalar(a.radius)) return false;
      if (!a.height || !hasMode(a.height) || !isValidScalar(a.height)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "cube":
      if (!a.edge || !hasMode(a.edge) || !isValidScalar(a.edge)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "wall":
      if (!a.length || !hasMode(a.length) || !isValidScalar(a.length)) return false;
      if (!a.thickness || !hasMode(a.thickness) || !isValidScalar(a.thickness)) return false;
      if (!shapeUnit || !SHAPE_UNITS.has(shapeUnit)) return false;
      break;
    case "special":
      if (a.rawLegacyValue != null && typeof a.rawLegacyValue !== "string") return false;
      break;
    default:
      break;
  }

  return true;
}

/**
 * Validates a single damage part (id, damageType, base required).
 */
function isValidDamagePart(p: unknown): p is DamagePart {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  if (typeof x.id !== "string" || x.id.length === 0 || x.id.length > 32) return false;
  if (
    typeof x.damageType !== "string" &&
    typeof (x as { damage_type?: string }).damage_type !== "string"
  )
    return false;
  const base = x.base ?? (x as { base?: unknown }).base;
  if (!base || !isValidDicePool(base)) return false;
  return true;
}

/**
 * Validates parser output for damage. kind=modeled requires parts array with valid parts.
 */
export function validateSpellDamageSpec(x: unknown): x is SpellDamageSpec {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  const kind = d.kind as string | undefined;
  if (!kind || !DAMAGE_KINDS.has(kind)) return false;

  if (kind === "modeled") {
    const parts = d.parts as unknown[] | undefined;
    if (!Array.isArray(parts) || parts.length === 0) return false;
    for (const part of parts) {
      if (!isValidDamagePart(part)) return false;
    }
  }

  if (kind === "dm_adjudicated") {
    if (d.rawLegacyValue != null && typeof d.rawLegacyValue !== "string") return false;
  }

  return true;
}
