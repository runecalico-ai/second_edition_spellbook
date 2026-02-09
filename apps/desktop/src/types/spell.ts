/**
 * Structured spell types aligned with spell.schema.json and backend IPC (camelCase).
 * Canonical storage uses snake_case; these types match what the frontend receives from parse_spell_*.
 */

export type ScalarMode = "fixed" | "per_level";

export interface SpellScalar {
  mode: ScalarMode;
  value?: number;
  perLevel?: number;
  /** Alias when loading from canonical_data (snake_case). */
  per_level?: number;
  minLevel?: number;
  maxLevel?: number;
  capValue?: number;
  capLevel?: number;
  rounding?: "none" | "floor" | "ceil" | "nearest";
}

export interface SpellDetail {
  id?: number | null;
  name: string;
  tradition?: string; // Legacy/UI field, not in core DB table but often used in UI
  school: string | null;
  sphere: string | null;
  classList?: string | null;
  level: number;
  description: string;
  range: string | null;
  rangeSpec?: RangeSpec;
  components: string | null;
  componentsSpec?: SpellComponents;
  materialComponents: string | null;
  materialComponentsSpec?: MaterialComponentSpec[];
  castingTime: string | null;
  castingTimeSpec?: SpellCastingTime;
  duration: string | null;
  durationSpec?: DurationSpec;
  area: string | null;
  areaSpec?: AreaSpec;
  savingThrow: string | null;
  savingThrowSpec?: SavingThrowSpec;
  damage: string | null;
  damageSpec?: SpellDamageSpec;
  magicResistance: string | null;
  magicResistanceSpec?: MagicResistanceSpec;
  reversible: number | null;
  tags?: string | null;
  source?: string | null;
  edition?: string | null;
  author?: string | null;
  license?: string | null;
  isQuestSpell: number;
  isCantrip: number;
  schemaVersion?: number | null;
  artifacts?: SpellArtifact[] | null;
  canonicalData?: string | null;
  contentHash?: string | null;
}

export interface SpellArtifact {
  id: number;
  spellId: number;
  type: string;
  path: string;
  hash: string;
  importedAt: string;
}

export type SpellUpdate = SpellDetail & {
  id: number;
};

export type SpellCreate = Omit<SpellDetail, "id" | "artifacts" | "contentHash" | "canonicalData" | "schemaVersion">;

/** Range kinds that include distance + unit */
export const RANGE_DISTANCE_KINDS = [
  "distance",
  "distance_los",
  "distance_loe",
] as const;
/** Range kinds that are kind-only (no distance/unit) */
export const RANGE_KIND_ONLY = [
  "personal",
  "touch",
  "los",
  "loe",
  "sight",
  "hearing",
  "voice",
  "senses",
  "same_room",
  "same_structure",
  "same_dungeon_level",
  "wilderness",
  "same_plane",
  "interplanar",
  "anywhere_on_plane",
  "domain",
  "unlimited",
] as const;

export type RangeKind =
  | (typeof RANGE_DISTANCE_KINDS)[number]
  | (typeof RANGE_KIND_ONLY)[number]
  | "special";

export type RangeUnit = "ft" | "yd" | "mi" | "inch";

export interface RangeSpec {
  kind: RangeKind;
  text?: string;
  unit?: RangeUnit;
  distance?: SpellScalar;
  notes?: string;
  rawLegacyValue?: string;
}

export const DURATION_KIND_ONLY = [
  "instant",
  "permanent",
  "until_dispelled",
  "concentration",
] as const;
export const DURATION_CONDITION_KINDS = [
  "conditional",
  "until_triggered",
  "planar",
] as const;

export type DurationKind =
  | (typeof DURATION_KIND_ONLY)[number]
  | "time"
  | (typeof DURATION_CONDITION_KINDS)[number]
  | "usage_limited"
  | "special";

export type DurationUnit =
  | "segment"
  | "round"
  | "turn"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

export interface DurationSpec {
  kind: DurationKind;
  unit?: DurationUnit;
  duration?: SpellScalar;
  condition?: string;
  uses?: SpellScalar;
  notes?: string;
  rawLegacyValue?: string;
}

export type CastingTimeUnit =
  | "segment"
  | "round"
  | "turn"
  | "hour"
  | "minute"
  | "action"
  | "bonus_action"
  | "reaction"
  | "special"
  | "instantaneous";

export interface SpellCastingTime {
  text: string;
  unit: CastingTimeUnit;
  baseValue?: number;
  perLevel?: number;
  levelDivisor?: number;
  rawLegacyValue?: string;
}

export const RANGE_UNIT_LABELS: Record<RangeUnit, string> = {
  ft: "Feet",
  yd: "Yards",
  mi: "Miles",
  inch: "Inches",
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  segment: "Segments",
  round: "Rounds",
  turn: "Turns",
  minute: "Minutes",
  hour: "Hours",
  day: "Days",
  week: "Weeks",
  month: "Months",
  year: "Years",
};

export const CASTING_TIME_UNIT_LABELS: Record<CastingTimeUnit, string> = {
  segment: "Segment",
  round: "Round",
  turn: "Turn",
  hour: "Hour",
  minute: "Minute",
  action: "Action",
  bonus_action: "Bonus Action",
  reaction: "Reaction",
  special: "Special",
  instantaneous: "Instantaneous",
};

/** Default range for new empty state (per spec). */
export function defaultRangeSpec(): RangeSpec {
  return {
    kind: "distance",
    unit: "ft",
    distance: { mode: "fixed", value: 0 },
  };
}

/** Default duration for new empty state (per spec). */
export function defaultDurationSpec(): DurationSpec {
  return { kind: "instant" };
}

/** Default casting time for new empty state (per spec). */
export function defaultCastingTime(): SpellCastingTime {
  return {
    text: "1 action",
    unit: "action",
    baseValue: 1,
    perLevel: 0,
    levelDivisor: 1,
  };
}

// --- AreaSpec (per spell.schema.json #/$defs/AreaSpec) ---
export type AreaKind =
  | "point"
  | "radius_circle"
  | "radius_sphere"
  | "cone"
  | "line"
  | "rect"
  | "rect_prism"
  | "cylinder"
  | "wall"
  | "cube"
  | "volume"
  | "surface"
  | "tiles"
  | "creatures"
  | "objects"
  | "region"
  | "scope"
  | "special";

export type ShapeUnit = "ft" | "yd" | "mi" | "inch";
export type AreaUnit =
  | "ft"
  | "yd"
  | "mi"
  | "inch"
  | "ft2"
  | "yd2"
  | "square"
  | "ft3"
  | "yd3"
  | "hex"
  | "room"
  | "floor";
export type TileUnit = "hex" | "room" | "floor" | "square";
export type CountSubject =
  | "creature"
  | "undead"
  | "ally"
  | "enemy"
  | "object"
  | "structure";

export interface AreaSpec {
  kind: AreaKind;
  unit?: AreaUnit;
  shapeUnit?: ShapeUnit;
  radius?: SpellScalar;
  diameter?: SpellScalar;
  length?: SpellScalar;
  width?: SpellScalar;
  height?: SpellScalar;
  thickness?: SpellScalar;
  edge?: SpellScalar;
  surfaceArea?: SpellScalar;
  volume?: SpellScalar;
  tileUnit?: TileUnit;
  tileCount?: SpellScalar;
  count?: SpellScalar;
  countSubject?: CountSubject;
  regionUnit?: string;
  scopeUnit?: string;
  notes?: string;
  rawLegacyValue?: string;
}

// --- SpellDamageSpec (per spell.schema.json) ---
export type SpellDamageKind = "none" | "modeled" | "dm_adjudicated";
export type CombineMode = "sum" | "max" | "choose_one" | "sequence";
export type DamageType =
  | "acid"
  | "cold"
  | "electricity"
  | "fire"
  | "sonic"
  | "force"
  | "magic"
  | "negative_energy"
  | "positive_energy"
  | "poison"
  | "psychic"
  | "physical_bludgeoning"
  | "physical_piercing"
  | "physical_slashing"
  | "untyped"
  | "special";
export type ApplicationScope =
  | "per_target"
  | "per_area_target"
  | "per_missile"
  | "per_ray"
  | "per_round"
  | "per_turn"
  | "per_hit"
  | "special";
export type SaveKind = "none" | "half" | "negates" | "partial" | "special";

export interface DiceTerm {
  count: number;
  sides: number;
  perDieModifier?: number;
}

export interface DicePool {
  terms: DiceTerm[];
  flatModifier?: number;
}

export interface ApplicationSpec {
  scope: ApplicationScope;
  ticks?: number;
  tickDriver?: string;
}

export interface SaveSpec {
  kind: SaveKind;
  partial?: { numerator: number; denominator: number };
}

export interface DamagePart {
  id: string;
  damageType: DamageType;
  base: DicePool;
  application?: ApplicationSpec;
  save?: SaveSpec;
  label?: string;
  scaling?: unknown[];
  mrInteraction?: "normal" | "ignores_mr" | "special" | "unknown";
  notes?: string;
}

export interface SpellDamageSpec {
  kind: SpellDamageKind;
  combineMode?: CombineMode;
  parts?: DamagePart[];
  dmGuidance?: string;
  notes?: string;
  rawLegacyValue?: string;
}

// --- SavingThrowSpec ---
export type SavingThrowKind = "none" | "single" | "multiple" | "dm_adjudicated";
export type SaveType =
  | "paralyzation_poison_death"
  | "rod_staff_wand"
  | "petrification_polymorph"
  | "breath_weapon"
  | "spell"
  | "special";
export type SaveOutcome = "no_effect" | "reduced_effect" | "full_effect" | "partial_damage_only" | "partial_non_damage_only" | "special";

export interface SaveOutcomeEffect {
  result: SaveOutcome;
  notes?: string;
}

export interface SingleSave {
  saveType: SaveType;
  appliesTo?: string;
  onSuccess: SaveOutcomeEffect;
  onFailure: SaveOutcomeEffect;
  id?: string;
  saveVs?: string;
  modifier?: number;
  timing?: string;
}

export interface SavingThrowSpec {
  kind: SavingThrowKind;
  single?: SingleSave;
  multiple?: SingleSave[];
  dmGuidance?: string;
  notes?: string;
}

// --- MagicResistanceSpec ---
export type MagicResistanceKind = "unknown" | "normal" | "ignores_mr" | "partial" | "special";
export type AppliesTo = "whole_spell" | "harmful_effects_only" | "beneficial_effects_only" | "dm";

export interface MagicResistancePartial {
  scope: string;
  partIds?: string[];
}

export interface MagicResistanceSpec {
  kind: MagicResistanceKind;
  appliesTo?: AppliesTo;
  partial?: MagicResistancePartial;
  specialRule?: string;
  notes?: string;
}

// --- MaterialComponentSpec ---
export interface MaterialComponentSpec {
  name: string;
  quantity?: number;
  unit?: string;
  gpValue?: number;
  isConsumed?: boolean;
  description?: string;
}

// --- Components (V/S/M) ---
export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  focus: boolean;
  divineFocus: boolean;
  experience: boolean;
}

/** Generate a stable part ID per schema pattern ^[a-z][a-z0-9_]{0,31}$ */
export function generateDamagePartId(): string {
  const ts = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `part_${ts}_${r}`.slice(0, 32);
}

/** Default SpellDamageSpec for new empty state. */
export function defaultSpellDamageSpec(): SpellDamageSpec {
  return { kind: "none" };
}

/** Default AreaSpec for new empty state. */
export function defaultAreaSpec(): AreaSpec {
  return { kind: "point" };
}

/** Default SavingThrowSpec. */
export function defaultSavingThrowSpec(): SavingThrowSpec {
  return { kind: "none" };
}

/** Default MagicResistanceSpec. */
export function defaultMagicResistanceSpec(): MagicResistanceSpec {
  return { kind: "unknown" };
}

/** Default DamagePart with schema-required fields. */
export function defaultDamagePart(): DamagePart {
  return {
    id: generateDamagePartId(),
    damageType: "fire",
    base: { terms: [{ count: 1, sides: 6 }], flatModifier: 0 },
    application: { scope: "per_target" },
    save: { kind: "half" },
  };
}

/** Format dice pool as string (e.g. "2d6+3"). */
export function formatDicePool(pool: DicePool): string {
  const terms = pool.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = pool.flatModifier ?? 0;
  return mod === 0 ? terms : `${terms}+${mod}`;
}

/** Format damage spec for display/storage. */
export function damageToText(spec: SpellDamageSpec): string {
  if (spec.kind === "none") return "";
  if (spec.kind === "dm_adjudicated") return spec.dmGuidance ?? spec.rawLegacyValue ?? "DM adjudicated";
  if (spec.kind === "modeled" && spec.parts?.length) {
    return spec.parts
      .map((p) => {
        const formula = formatDicePool(p.base);
        const save = p.save?.kind && p.save.kind !== "none" ? ` (${p.save.kind} save)` : "";
        return `${formula} ${p.damageType.replace(/_/g, " ")}${save}`;
      })
      .join(" + ");
  }
  return spec.rawLegacyValue ?? "";
}

/** Format area spec for display/storage. */
export function areaToText(spec: AreaSpec): string {
  if (spec.rawLegacyValue) return spec.rawLegacyValue;
  if (spec.kind === "point") return "Point";
  if (spec.kind === "special") return spec.rawLegacyValue ?? "Special";
  const unit = spec.shapeUnit ?? spec.unit ?? "ft";
  if (["radius_circle", "radius_sphere"].includes(spec.kind)) {
    const r = spec.radius;
    const v = r?.mode === "per_level" ? r.perLevel ?? r.per_level : r?.value ?? 0;
    return `${v}-${unit} ${spec.kind === "radius_sphere" ? "radius (sphere)" : "radius"}`;
  }
  if (spec.kind === "cone" && spec.length) {
    const v = spec.length.mode === "per_level" ? spec.length.perLevel ?? spec.length.per_level : spec.length.value ?? 0;
    return `Cone ${v} ${unit}`;
  }
  if (spec.kind === "line" && spec.length) {
    const v = spec.length.mode === "per_level" ? spec.length.perLevel ?? spec.length.per_level : spec.length.value ?? 0;
    return `Line ${v} ${unit}`;
  }
  if (spec.kind === "cube" && spec.edge) {
    const v = spec.edge.mode === "per_level" ? spec.edge.perLevel ?? spec.edge.per_level : spec.edge.value ?? 0;
    return `${v}-${unit} cube`;
  }
  return spec.kind.replace(/_/g, " ");
}

/** Format saving throw spec for display/storage. */
export function savingThrowToText(spec: SavingThrowSpec): string {
  if (spec.kind === "none") return "";
  if (spec.kind === "dm_adjudicated") return spec.dmGuidance ?? "DM adjudicated";
  if (spec.kind === "single" && spec.single) {
    const s = spec.single;
    const onFail = s.onFailure?.result ?? "full_effect";
    return `${s.saveType.replace(/_/g, " ")} (${onFail.replace(/_/g, " ")} on fail)`;
  }
  if (spec.kind === "multiple" && spec.multiple?.length) {
    return spec.multiple
      .map((s) => `${s.saveType.replace(/_/g, " ")} (${(s.onFailure?.result ?? "full_effect").replace(/_/g, " ")} on fail)`)
      .join("; ");
  }
  return "";
}

/** Format magic resistance spec for display/storage. */
export function magicResistanceToText(spec: MagicResistanceSpec): string {
  if (spec.kind === "unknown") return "";
  if (spec.kind === "special") return spec.specialRule ?? "Special";
  if (spec.kind === "normal") return "Yes";
  if (spec.kind === "ignores_mr") return "No";
  if (spec.kind === "partial") {
    const scope = spec.partial?.scope ?? "damage_only";
    return `Partial (${String(scope).replace(/_/g, " ")})`;
  }
  return "";
}

/** Format components and material for display/storage. */
export function componentsToText(
  comp: SpellComponents,
  materials: MaterialComponentSpec[],
): { components: string; materialComponents: string } {
  const parts: string[] = [];
  if (comp.verbal) parts.push("V");
  if (comp.somatic) parts.push("S");
  if (comp.material) parts.push("M");
  if (comp.focus) parts.push("F");
  if (comp.divineFocus) parts.push("DF");
  if (comp.experience) parts.push("XP");
  const components = parts.join(", ");
  const materialComponents = materials
    .map((m) => {
      const q = m.quantity ?? 1;
      const gp = m.gpValue != null ? ` (${m.gpValue} gp)` : "";
      const consumed = m.isConsumed ? " (consumed)" : "";
      return `${m.name}${q !== 1 ? ` x${q}` : ""}${gp}${consumed}`;
    })
    .join("; ");
  return { components, materialComponents };
}
