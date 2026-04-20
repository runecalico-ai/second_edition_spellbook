import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback } from "react";
import type { SpellDetail, RangeSpec, DurationSpec, SpellCastingTime, AreaSpec, SpellDamageSpec, SavingThrowSpec, MagicResistanceSpec, MaterialComponentSpec, SpellComponents, LevelBand, ScalingDriver, ScalingKind, ScalingRule, SaveKind, ApplicationScope, DamagePart, SaveOutcome, SaveType, SingleSave, SaveOutcomeEffect, ScalarMode, DicePool, DiceTerm } from "../../types/spell";
import { validateAreaSpec, validateDurationSpec, validateRangeSpec, validateSpellCastingTime, validateSpellDamageSpec } from "../../lib/parserValidation";
import { RANGE_DISTANCE_KINDS } from "../../types/spell";
import { decideCanonicalField } from "../canonicalFieldDecision";
import type { DetailFieldKey } from "../detailDirty";


const spellFocusVisibleRing = "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900";
const spellInvalidFocusVisibleRing = "focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900";


function getSpellFocusVisibleRing(isInvalid: boolean): string {
  return isInvalid ? spellInvalidFocusVisibleRing : spellFocusVisibleRing;
}

function applyPlaywrightRangeDistanceCorruption(spec: RangeSpec): RangeSpec {
  if (typeof window === "undefined" || !window.__IS_PLAYWRIGHT__) return spec;
  const probe = window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE;
  if (
    !probe ||
    probe.consumed === true ||
    !RANGE_DISTANCE_KINDS.includes(spec.kind as (typeof RANGE_DISTANCE_KINDS)[number])
  ) {
    return spec;
  }
  probe.consumed = true;
  return {
    ...spec,
    distance: {
      mode: "fixed",
      value: probe.value,
    },
  };
}

async function sleepPlaywrightSaveInvokeDelay(): Promise<void> {
  if (typeof window === "undefined" || !window.__IS_PLAYWRIGHT__) return;
  const ms = window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS;
  if (typeof ms !== "number" || Number.isNaN(ms) || ms <= 0) return;
  await new Promise((r) => setTimeout(r, Math.min(Math.floor(ms), 30_000)));
}

type DetailTextOverrides = Partial<Pick<SpellDetail, DetailFieldKey>>;

/** Backend dice pool shape (camelCase or snake_case). */
interface RawDicePool {
  terms?: Array<{
    count?: number;
    sides?: number;
    perDieModifier?: number;
    per_die_modifier?: number;
  }>;
  flatModifier?: number;
  flat_modifier?: number;
}

function normalizeDicePool(p: RawDicePool | null | undefined): DicePool {
  if (!p) return { terms: [{ count: 1, sides: 6 }], flatModifier: 0 };
  return {
    terms: p.terms?.map((t) => ({
      count: t.count,
      sides: t.sides,
      perDieModifier: t.perDieModifier ?? t.per_die_modifier,
    })) ?? [{ count: 1, sides: 6 }],
    flatModifier: p.flatModifier ?? p.flat_modifier,
  };
}

function normalizeScalar(
  o: unknown,
): { mode: ScalarMode; value?: number; perLevel?: number } | undefined {
  if (!o || typeof o !== "object") return undefined;
  const s = o as Record<string, unknown>;
  const mode = s.mode as ScalarMode | undefined;
  if (!mode) return undefined;
  const value = s.value as number | undefined;
  const perLevel = (s.perLevel ?? s.per_level) as number | undefined;
  return { mode, value, perLevel };
}

function normalizeAreaSpec(a: Record<string, unknown>): AreaSpec {
  return {
    kind: (a.kind as AreaSpec["kind"]) ?? "point",
    shapeUnit: (a.shapeUnit ?? a.shape_unit) as AreaSpec["shapeUnit"],
    unit: a.unit as AreaSpec["unit"],
    radius: normalizeScalar(a.radius),
    length: normalizeScalar(a.length),
    width: normalizeScalar(a.width),
    height: normalizeScalar(a.height),
    thickness: normalizeScalar(a.thickness),
    edge: normalizeScalar(a.edge),
    surfaceArea: normalizeScalar(a.surfaceArea ?? a.surface_area),
    volume: normalizeScalar(a.volume),
    tileUnit: a.tileUnit ?? a.tile_unit,
    tileCount: normalizeScalar(a.tileCount ?? a.tile_count),
    count: normalizeScalar(a.count),
    countSubject: (a.countSubject ?? a.count_subject) as AreaSpec["countSubject"],
    regionUnit: (a.regionUnit ?? a.region_unit) as string,
    scopeUnit: (a.scopeUnit ?? a.scope_unit) as string,
    rawLegacyValue: (a.rawLegacyValue ?? a.raw_legacy_value) as string,
    text: a.text as string | undefined,
  } as AreaSpec;
}

// biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
function normalizeDamageSpec(d: any): SpellDamageSpec {
  const parts = (d.parts as unknown[] | undefined)?.map((p) => {
    const x = p as Record<string, unknown>;
    const app = x.application as Record<string, unknown> | undefined;
    const sav = x.save as Record<string, unknown> | undefined;
    const scaling = (x.scaling as unknown[] | undefined)?.map((s) => {
      const rs = s as Record<string, unknown>;
      return {
        kind: rs.kind as ScalingKind,
        driver: rs.driver as ScalingDriver,
        step: rs.step as number,
        maxSteps: (rs.maxSteps ?? rs.max_steps) as number,
        diceIncrement: normalizeDicePool({ terms: [rs.diceIncrement ?? rs.dice_increment] })
          .terms[0],
        flatIncrement: (rs.flatIncrement ?? rs.flat_increment) as number,
        levelBands: (rs.levelBands ?? rs.level_bands) as LevelBand[] | undefined,
        notes: rs.notes as string,
      } as ScalingRule;
    });
    const clamp = (x.clampTotal ?? x.clamp_total) as Record<string, unknown> | undefined;

    return {
      id: x.id as string,
      label: x.label as string,
      damageType: (x.damageType ?? x.damage_type) as string,
      base: normalizeDicePool(x.base),
      application: app
        ? {
            scope: app.scope as ApplicationScope,
            ticks: app.ticks as number,
            tickDriver: (app.tickDriver ?? app.tick_driver) as string,
          }
        : undefined,
      save: sav
        ? {
            kind: sav.kind as SaveKind,
            partial: sav.partial as { numerator: number; denominator: number },
          }
        : undefined,
      mrInteraction: (x.mrInteraction ?? x.mr_interaction) as DamagePart["mrInteraction"],
      scaling,
      clampTotal: clamp
        ? {
            minTotal: (clamp.minTotal ?? clamp.min_total) as number,
            maxTotal: (clamp.maxTotal ?? clamp.max_total) as number,
          }
        : undefined,
      notes: x.notes as string,
    } as DamagePart;
  });
  return {
    kind: (d.kind as SpellDamageSpec["kind"]) ?? "none",
    combineMode: (d.combineMode ?? d.combine_mode) as SpellDamageSpec["combineMode"],
    parts: parts as SpellDamageSpec["parts"],
    sourceText: (d.sourceText ?? d.source_text ?? d.rawLegacyValue ?? d.raw_legacy_value) as string,
    dmGuidance: (d.dmGuidance ?? d.dm_guidance) as string | undefined,
    notes: d.notes as string | undefined,
  } as SpellDamageSpec;
}

function normalizeSingleSave(s: unknown): SingleSave | undefined {
  if (!s || typeof s !== "object") return undefined;
  const x = s as Record<string, unknown>;
  const onSuccessRaw = (x.onSuccess ?? x.on_success) as Record<string, unknown> | undefined;
  const onFailureRaw = (x.onFailure ?? x.on_failure) as Record<string, unknown> | undefined;
  return {
    id: x.id as string,
    saveType: (x.saveType ?? x.save_type) as SaveType,
    saveVs: (x.saveVs ?? x.save_vs) as string,
    modifier: (x.modifier as number) ?? 0,
    appliesTo: (x.appliesTo ?? x.applies_to) as string,
    timing: (x.timing ?? x.timing) as string,
    onSuccess: {
      result: (onSuccessRaw?.result as SaveOutcome | undefined) ?? "no_effect",
      notes: (onSuccessRaw?.notes as string | undefined) ?? "",
    },
    onFailure: {
      result: (onFailureRaw?.result as SaveOutcome | undefined) ?? "full_effect",
      notes: (onFailureRaw?.notes as string | undefined) ?? "",
    },
  };
}

function normalizeSavingThrowSpec(s: Record<string, unknown>): SavingThrowSpec {
  const existingNotes = s.notes as string | undefined;
  const dmGuidanceVal = (s.dmGuidance ?? s.dm_guidance) as string | undefined;
  // Empty dm_guidance is treated as absent — falsy guard is intentional.
  const notes = dmGuidanceVal
    ? existingNotes
      ? `${existingNotes}\n${dmGuidanceVal}`
      : dmGuidanceVal
    : existingNotes;
  return {
    kind: (s.kind as SavingThrowSpec["kind"]) ?? "none",
    single: normalizeSingleSave(s.single),
    multiple: (s.multiple as unknown[] | undefined)
      ?.map(normalizeSingleSave)
      .filter(Boolean) as SingleSave[],
    notes: notes as string | undefined,
    rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value) as string | undefined,
  } as SavingThrowSpec;
}

// biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
function normalizeMagicResistanceSpec(m: any): MagicResistanceSpec {
  return {
    kind: (m.kind as MagicResistanceSpec["kind"]) ?? "unknown",
    appliesTo: (m.appliesTo ?? m.applies_to) as MagicResistanceSpec["appliesTo"],
    partial: m.partial
      ? {
          scope: (m.partial as Record<string, unknown>).scope as string,
          partIds: ((m.partial as Record<string, unknown>).partIds ??
            (m.partial as Record<string, unknown>).part_ids) as string[],
        }
      : undefined,
    specialRule: (m.specialRule ?? m.special_rule) as string,
    sourceText: (m.sourceText ?? m.source_text) as string | undefined,
    notes: m.notes as string,
  } as MagicResistanceSpec;
}

function validateSavingThrowSpecShape(value: unknown): value is SavingThrowSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as Record<string, unknown>).kind;
  return kind === "none" || kind === "single" || kind === "multiple" || kind === "dm_adjudicated";
}

function validateMagicResistanceSpecShape(value: unknown): value is MagicResistanceSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as Record<string, unknown>).kind;
  return (
    kind === "unknown" ||
    kind === "normal" ||
    kind === "ignores_mr" ||
    kind === "partial" ||
    kind === "special"
  );
}

function toSpecialRangeSpec(rawLegacyValue: string): RangeSpec {
  return { kind: "special", rawLegacyValue };
}

function toSpecialDurationSpec(rawLegacyValue: string): DurationSpec {
  return { kind: "special", rawLegacyValue };
}

function toSpecialCastingTimeSpec(rawLegacyValue: string): SpellCastingTime {
  return { text: rawLegacyValue, unit: "special", rawLegacyValue };
}

function toSpecialAreaSpec(rawLegacyValue: string): AreaSpec {
  return { kind: "special", rawLegacyValue } as AreaSpec;
}

function normalizeLegacyText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()\[\],.;:]+/g, " ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function hasTokenPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function mapLegacySavingThrow(legacy: string): SavingThrowSpec {
  const normalized = normalizeLegacyText(legacy);
  if (!normalized || hasTokenPattern(normalized, /^(none|no|n\/a|na|nil|—|-)$|\bno save\b/)) {
    return { kind: "none" };
  }

  // --- 6-row save_type/save_vs matrix (first match wins) ---
  let saveType: SaveType = "spell";
  let saveVs: string | undefined;
  if (hasTokenPattern(normalized, /\bparaly\b|\bpoison\b|\bdeath\b/)) {
    saveType = "paralyzation_poison_death";
    saveVs = hasTokenPattern(normalized, /\bpoison\b/) ? "poison" : "death_magic";
  } else if (hasTokenPattern(normalized, /\bbreath\b/)) {
    saveType = "breath_weapon";
    saveVs = "breath";
  } else if (hasTokenPattern(normalized, /\brod\b|\bstaff\b|\bwand\b/)) {
    saveType = "rod_staff_wand";
    saveVs = "other";
  } else if (hasTokenPattern(normalized, /\bpoly\b|\bpetrif\b/)) {
    saveType = "petrification_polymorph";
    saveVs = hasTokenPattern(normalized, /\bpoly\b/) ? "polymorph" : "petrification";
  } else if (hasTokenPattern(normalized, /\bspecial\b/)) {
    saveType = "special";
  }

  // --- Outcome detection ---
  let onSuccess: SaveOutcomeEffect;
  if (hasTokenPattern(normalized, /\bnegat(?:e|es|ed|ing)?\b/)) {
    onSuccess = { result: "no_effect" };
  } else if (hasTokenPattern(normalized, /\bhalf\b|\b1\s*\/\s*2\b/)) {
    onSuccess = { result: "reduced_effect" };
  } else if (hasTokenPattern(normalized, /\bpartial\b/)) {
    onSuccess = { result: "partial_non_damage_only" };
  } else {
    // No recognizable outcome token → dm_adjudicated
    return { kind: "dm_adjudicated", rawLegacyValue: legacy };
  }

  return {
    kind: "single",
    single: {
      saveType,
      ...(saveVs !== undefined ? { saveVs } : {}),
      onSuccess,
      onFailure: { result: "full_effect" },
    },
    rawLegacyValue: legacy,
  };
}

function mapLegacyMagicResistance(legacy: string): MagicResistanceSpec {
  const normalized = normalizeLegacyText(legacy);
  if (!normalized) return { kind: "unknown" };

  if (hasTokenPattern(normalized, /\byes\b|\bapplies\b|\ballowed\b/)) {
    return { kind: "normal", appliesTo: "whole_spell" };
  }

  if (hasTokenPattern(normalized, /\bno\b|\bdoes not apply\b|\bbypassed\b|\bignore[sd]?\b/)) {
    return { kind: "ignores_mr", appliesTo: "whole_spell" };
  }

  if (hasTokenPattern(normalized, /\bpartial\b/)) {
    return {
      kind: "partial",
      appliesTo: "whole_spell",
      partial: { scope: "damage_only" },
    };
  }

  return { kind: "special", appliesTo: "whole_spell", specialRule: legacy, sourceText: legacy };
}

// ---------------------------------------------------------------------------
// v2-shape save-path helpers (defense-in-depth strip of v1 fields)
// ---------------------------------------------------------------------------

/** Strips any v1 fields from SavingThrowSpec before sending to backend (defense-in-depth). */
function toV2SavingThrowSpec(spec: SavingThrowSpec): SavingThrowSpec {
  const { ...rest } = spec;
  // dmGuidance is the v1 field removed on SavingThrowSpec in v2 schema.
  // It should never appear here (TypeScript enforces this), but strip defensively
  // in case of deserialization from legacy stored data.
  (rest as Record<string, unknown>).dmGuidance = undefined;
  (rest as Record<string, unknown>).dm_guidance = undefined;
  return rest;
}

/** Strips any v1 fields from SpellDamageSpec before sending to backend (defense-in-depth). */
function toV2SpellDamageSpec(spec: SpellDamageSpec): SpellDamageSpec {
  const result = { ...spec };
  // Ensure rawLegacyValue → sourceText migration at save time
  if (!result.sourceText && (result as Record<string, unknown>).rawLegacyValue) {
    result.sourceText = (result as Record<string, unknown>).rawLegacyValue as string;
  }
  (result as Record<string, unknown>).rawLegacyValue = undefined;
  (result as Record<string, unknown>).raw_legacy_value = undefined;
  return result;
}

// ---------------------------------------------------------------------------
// Parser-task helpers (module-level — do not close over component state)
// ---------------------------------------------------------------------------

interface ParserTaskSetters {
  setStructuredRange: (v: RangeSpec) => void;
  setStructuredDuration: (v: DurationSpec) => void;
  setStructuredCastingTime: (v: SpellCastingTime) => void;
  setStructuredArea: (v: AreaSpec) => void;
  setStructuredDamage: (v: SpellDamageSpec) => void;
  setSuppressExpandParse: (
    updater: (
      prev: Partial<Record<DetailFieldKey, boolean>>,
    ) => Partial<Record<DetailFieldKey, boolean>>,
  ) => void;
  /** Called when a field falls back to kind="special" due to a parse failure in this session. */
  addParserFallback: (field: string) => void;
}

/** Build the list of async parser invocations for the five invoke-based fields.
 * Only enqueues a task when the field has content and suppress is not set.
 * Returns the array of promises; caller is responsible for Promise.all. */
function buildParserTasks(
  data: SpellDetail,
  getIsActive: () => boolean,
  setters: ParserTaskSetters,
  suppress: {
    range?: boolean;
    duration?: boolean;
    castingTime?: boolean;
    area?: boolean;
    damage?: boolean;
  },
): Promise<void>[] {
  const tasks: Promise<void>[] = [];

  if (!suppress.range && data.range?.trim()) {
    const legacy = data.range;
    tasks.push(
      invoke<RangeSpec>("parse_spell_range", { legacy })
        .then((parsed) => {
          if (!getIsActive()) return;
          if (!validateRangeSpec(parsed)) {
            setters.setStructuredRange(toSpecialRangeSpec(legacy));
            setters.addParserFallback("Range");
          } else {
            setters.setStructuredRange(parsed);
            setters.setSuppressExpandParse((prev) => ({ ...prev, range: true }));
            if ((parsed as RangeSpec).kind === "special") setters.addParserFallback("Range");
          }
        })
        .catch(() => {
          if (!getIsActive()) return;
          setters.setStructuredRange(toSpecialRangeSpec(legacy));
          setters.addParserFallback("Range");
        }),
    );
  }

  if (!suppress.duration && data.duration?.trim()) {
    const legacy = data.duration;
    tasks.push(
      invoke<DurationSpec>("parse_spell_duration", { legacy })
        .then((parsed) => {
          if (!getIsActive()) return;
          if (!validateDurationSpec(parsed)) {
            setters.setStructuredDuration(toSpecialDurationSpec(legacy));
            setters.addParserFallback("Duration");
          } else {
            setters.setStructuredDuration(parsed);
            setters.setSuppressExpandParse((prev) => ({ ...prev, duration: true }));
            if ((parsed as DurationSpec).kind === "special") setters.addParserFallback("Duration");
          }
        })
        .catch(() => {
          if (!getIsActive()) return;
          setters.setStructuredDuration(toSpecialDurationSpec(legacy));
          setters.addParserFallback("Duration");
        }),
    );
  }

  if (!suppress.castingTime && data.castingTime?.trim()) {
    const legacy = data.castingTime;
    tasks.push(
      invoke<SpellCastingTime>("parse_spell_casting_time", { legacy })
        .then((parsed) => {
          if (!getIsActive()) return;
          if (!validateSpellCastingTime(parsed)) {
            setters.setStructuredCastingTime(toSpecialCastingTimeSpec(legacy));
            setters.addParserFallback("Casting time");
          } else {
            setters.setStructuredCastingTime(parsed);
            setters.setSuppressExpandParse((prev) => ({ ...prev, castingTime: true }));
            if ((parsed as SpellCastingTime).unit === "special")
              setters.addParserFallback("Casting time");
          }
        })
        .catch(() => {
          if (!getIsActive()) return;
          setters.setStructuredCastingTime(toSpecialCastingTimeSpec(legacy));
          setters.addParserFallback("Casting time");
        }),
    );
  }

  if (!suppress.area && data.area?.trim()) {
    const legacy = data.area;
    tasks.push(
      invoke<AreaSpec | null>("parse_spell_area", { legacy })
        .then((parsed) => {
          if (!getIsActive()) return;
          if (parsed === null || !validateAreaSpec(parsed)) {
            setters.setStructuredArea(toSpecialAreaSpec(legacy));
            setters.addParserFallback("Area");
          } else {
            setters.setStructuredArea(parsed);
            setters.setSuppressExpandParse((prev) => ({ ...prev, area: true }));
            if ((parsed as AreaSpec).kind === "special") setters.addParserFallback("Area");
          }
        })
        .catch(() => {
          if (!getIsActive()) return;
          setters.setStructuredArea(toSpecialAreaSpec(legacy));
          setters.addParserFallback("Area");
        }),
    );
  }

  // Damage: parser failure falls back to { kind: "none" } — does NOT trigger warning banner.
  if (!suppress.damage && data.damage?.trim()) {
    const legacy = data.damage;
    tasks.push(
      invoke<SpellDamageSpec>("parse_spell_damage", { legacy })
        .then((parsed) => {
          if (!getIsActive()) return;
          if (!validateSpellDamageSpec(parsed)) {
            setters.setStructuredDamage({ kind: "none", sourceText: legacy });
          } else {
            setters.setStructuredDamage(parsed);
            setters.setSuppressExpandParse((prev) => ({ ...prev, damage: true }));
          }
        })
        .catch(() => {
          if (!getIsActive()) return;
          setters.setStructuredDamage({ kind: "none", sourceText: legacy });
        }),
    );
  }

  return tasks;
}

/** Maps a DetailFieldKey to the display label used in parserFallbackFields. */
function getParserFallbackLabel(field: DetailFieldKey): string {
  switch (field) {
    case "range":
      return "Range";
    case "duration":
      return "Duration";
    case "castingTime":
      return "Casting time";
    case "area":
      return "Area";
    case "savingThrow":
      return "Saving throw";
    case "magicResistance":
      return "Magic resistance";
    case "damage":
      return "Damage"; // damage never added to parserFallbackFields
    default:
      return field;
  }
}




export function emptySpellComponents(): SpellComponents {
  return { verbal: false, somatic: false, material: false, focus: false, divineFocus: false, experience: false };
}

export function inferSpellComponentsFromLegacy(componentsLegacy: string, hasMaterialText: boolean): SpellComponents {
  const normalized = componentsLegacy.toUpperCase();
  const tokens = normalized.split(/[^A-Z]+/).filter(Boolean);
  const inferred = emptySpellComponents();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const prevToken = tokens[index - 1];
    if (token === "DIVINE" && nextToken === "FOCUS") { inferred.divineFocus = true; continue; }
    switch (token) {
      case "V": case "VERBAL": inferred.verbal = true; continue;
      case "S": case "SOMATIC": inferred.somatic = true; continue;
      case "M": case "MATERIAL": inferred.material = true; continue;
      case "F": inferred.focus = true; continue;
      case "FOCUS": if (prevToken !== "DIVINE") inferred.focus = true; continue;
      case "DF": inferred.divineFocus = true; continue;
      case "XP": case "EXP": case "EXPERIENCE": inferred.experience = true; continue;
    }
    if (/^[VSMF]+$/.test(token)) {
      if (token.includes("V")) inferred.verbal = true;
      if (token.includes("S")) inferred.somatic = true;
      if (token.includes("M")) inferred.material = true;
      if (token.includes("F")) inferred.focus = true;
    }
  }
  inferred.material = inferred.material || hasMaterialText;
  return inferred;
}

export interface HydrationSetters {
  setStructuredRange: (v: RangeSpec | null) => void;
  setStructuredDuration: (v: DurationSpec | null) => void;
  setStructuredCastingTime: (v: SpellCastingTime | null) => void;
  setStructuredArea: (v: AreaSpec | null) => void;
  setStructuredDamage: (v: SpellDamageSpec | null) => void;
  setStructuredSavingThrow: (v: SavingThrowSpec | null) => void;
  setStructuredMagicResistance: (v: MagicResistanceSpec | null) => void;
  setStructuredComponents: (v: SpellComponents | null) => void;
  setStructuredMaterialComponents: (v: MaterialComponentSpec[]) => void;
  setHasLoadedMaterialComponentsSpec: (v: boolean) => void;
  setHasLoadedSavingThrowSpec: (v: boolean) => void;
  setHasLoadedMagicResistanceSpec: (v: boolean) => void;
  setSuppressExpandParse: (v: React.SetStateAction<Partial<Record<DetailFieldKey, boolean>>>) => void;
}

export function useSpellParser() {
  const [parsersPending, setParsersPending] = useState(false);
  const [parserFallbackFields, setParserFallbackFields] = useState<Set<string>>(new Set());

  const hydrateSpell = useCallback((data: SpellDetail, isActive: () => boolean, setters: HydrationSetters) => {
    let shouldLoadLegacyFallbacks = true;
    if (data.canonicalData) {
      try {
        const canonicalRaw = JSON.parse(data.canonicalData) as Record<string, unknown>;
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
        const canonical = canonicalRaw as any;
        const canonicalHasMaterialComponentsSpec = canonicalRaw.material_components != null;
        setters.setHasLoadedMaterialComponentsSpec(canonicalHasMaterialComponentsSpec);
        const nextSuppressExpandParse: Partial<Record<DetailFieldKey, boolean>> = {};

        const rangeDecision = decideCanonicalField<RangeSpec>(
          canonicalRaw, "range",
          // biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
          (r: any) => ({
            kind: r.kind, text: r.text, unit: r.unit, rawLegacyValue: r.raw_legacy_value ?? r.rawLegacyValue,
            distance: r.distance ? { mode: r.distance.mode ?? "fixed", value: r.distance.value, perLevel: r.distance.per_level ?? r.distance.perLevel } : undefined,
          }), validateRangeSpec
        );
        if (rangeDecision.structuredValue) setters.setStructuredRange(rangeDecision.structuredValue);
        if (rangeDecision.suppressExpandParse) nextSuppressExpandParse.range = true;

        const durationDecision = decideCanonicalField<DurationSpec>(
          canonicalRaw, "duration",
          // biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
          (d: any) => ({
            kind: d.kind, unit: d.unit, text: d.text, condition: d.condition, uses: normalizeScalar(d.uses), rawLegacyValue: d.raw_legacy_value ?? d.rawLegacyValue,
            duration: d.duration ? { mode: d.duration.mode ?? "fixed", value: d.duration.value, perLevel: d.duration.per_level ?? d.duration.perLevel } : undefined,
          }), validateDurationSpec
        );
        if (durationDecision.structuredValue) setters.setStructuredDuration(durationDecision.structuredValue);
        if (durationDecision.suppressExpandParse) nextSuppressExpandParse.duration = true;

        const castingTimeDecision = decideCanonicalField<SpellCastingTime>(
          canonicalRaw, "casting_time",
          // biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
          (c: any) => ({ text: c.text ?? "", unit: c.unit, baseValue: c.baseValue ?? c.base_value, perLevel: c.perLevel ?? c.per_level ?? 0, levelDivisor: c.levelDivisor ?? c.level_divisor ?? 1, rawLegacyValue: c.rawLegacyValue ?? c.raw_legacy_value }),
          validateSpellCastingTime
        );
        if (castingTimeDecision.structuredValue) setters.setStructuredCastingTime(castingTimeDecision.structuredValue);
        if (castingTimeDecision.suppressExpandParse) nextSuppressExpandParse.castingTime = true;

        const areaDecision = decideCanonicalField<AreaSpec>(canonicalRaw, "area", normalizeAreaSpec, validateAreaSpec);
        if (areaDecision.structuredValue) setters.setStructuredArea(areaDecision.structuredValue);
        if (areaDecision.suppressExpandParse) nextSuppressExpandParse.area = true;

        const damageDecision = decideCanonicalField<SpellDamageSpec>(canonicalRaw, "damage", normalizeDamageSpec, validateSpellDamageSpec);
        if (damageDecision.structuredValue) setters.setStructuredDamage(damageDecision.structuredValue);
        if (damageDecision.suppressExpandParse) nextSuppressExpandParse.damage = true;

        const savingThrowDecision = decideCanonicalField<SavingThrowSpec>(canonicalRaw, "saving_throw", normalizeSavingThrowSpec, validateSavingThrowSpecShape);
        if (savingThrowDecision.suppressExpandParse) { setters.setHasLoadedSavingThrowSpec(true); nextSuppressExpandParse.savingThrow = true; }
        if (savingThrowDecision.structuredValue) setters.setStructuredSavingThrow(savingThrowDecision.structuredValue);

        const magicResistanceDecision = decideCanonicalField<MagicResistanceSpec>(canonicalRaw, "magic_resistance", normalizeMagicResistanceSpec, validateMagicResistanceSpecShape);
        if (magicResistanceDecision.suppressExpandParse) { setters.setHasLoadedMagicResistanceSpec(true); nextSuppressExpandParse.magicResistance = true; }
        if (magicResistanceDecision.structuredValue) setters.setStructuredMagicResistance(magicResistanceDecision.structuredValue);

        if (canonical.components || (canonical.material_components && canonical.material_components.length > 0)) {
          const hasMaterialData = (canonical.material_components?.length ?? 0) > 0;
          const comp = canonical.components ? {
            verbal: canonical.components.verbal ?? false, somatic: canonical.components.somatic ?? false, material: (canonical.components.material ?? false) || hasMaterialData,
            focus: canonical.components.focus ?? false, divineFocus: canonical.components.divine_focus ?? false, experience: canonical.components.experience ?? false,
          } : { verbal: false, somatic: false, material: true, focus: false, divineFocus: false, experience: false };
          setters.setStructuredComponents(comp);
          const rawMats = (canonical.material_components ?? []) as unknown[];
          const mats: MaterialComponentSpec[] = rawMats.map(// biome-ignore lint/suspicious/noExplicitAny: Legacy untyped
          (m: any) => ({
            name: (m.name as string) ?? "", quantity: m.quantity as number | undefined, unit: (m.unit as string) ?? undefined, gpValue: (m.gpValue ?? m.gp_value) as number | undefined,
            isConsumed: (m.isConsumed ?? m.is_consumed) as boolean | undefined, description: (m.description as string) ?? undefined,
          }));
          setters.setStructuredMaterialComponents(mats);
        }
        setters.setSuppressExpandParse(nextSuppressExpandParse);

        const parserTasks = buildParserTasks(data, () => isActive(), {
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setStructuredRange: setters.setStructuredRange as any,
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setStructuredDuration: setters.setStructuredDuration as any,
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setStructuredCastingTime: setters.setStructuredCastingTime as any,
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setStructuredArea: setters.setStructuredArea as any,
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setStructuredDamage: setters.setStructuredDamage as any,
// biome-ignore lint/suspicious/noExplicitAny: Required for parsing untyped JSON from legacy canonical_data string
          setSuppressExpandParse: setters.setSuppressExpandParse as any,
          addParserFallback: (f) => setParserFallbackFields((prev) => new Set([...prev, f])),
        }, {
          range: rangeDecision.suppressExpandParse, duration: durationDecision.suppressExpandParse, castingTime: castingTimeDecision.suppressExpandParse,
          area: areaDecision.suppressExpandParse, damage: damageDecision.suppressExpandParse,
        });

        if (!savingThrowDecision.suppressExpandParse && data.savingThrow?.trim()) {
          const stResult = mapLegacySavingThrow(data.savingThrow);
          setters.setStructuredSavingThrow(stResult);
          setters.setHasLoadedSavingThrowSpec(true);
          setters.setSuppressExpandParse((prev) => ({ ...prev, savingThrow: true }));
          if (stResult.kind === "dm_adjudicated") setParserFallbackFields((prev) => new Set([...prev, "Saving throw"]));
        }

        if (!magicResistanceDecision.suppressExpandParse && data.magicResistance?.trim()) {
          const mrResult = mapLegacyMagicResistance(data.magicResistance);
          setters.setStructuredMagicResistance(mrResult);
          setters.setHasLoadedMagicResistanceSpec(true);
          setters.setSuppressExpandParse((prev) => ({ ...prev, magicResistance: true }));
          if (mrResult.kind === "special") setParserFallbackFields((prev) => new Set([...prev, "Magic resistance"]));
        }

        if (parserTasks.length > 0) {
          setParsersPending(true);
          Promise.all(parserTasks).finally(() => { if (isActive()) setParsersPending(false); });
        }
        shouldLoadLegacyFallbacks = false;
      } catch { }
    }

    if (shouldLoadLegacyFallbacks) {
      const parserTasks: Promise<unknown>[] = [];
      if (data.range?.trim()) {
        const legacyRange = data.range;
        parserTasks.push(
          invoke<RangeSpec>("parse_range_to_spec", { input: legacyRange })
            .then((r) => {
              if (!r) { setters.setStructuredRange(toSpecialRangeSpec(legacyRange)); setParserFallbackFields((prev) => new Set([...prev, "Range"])); return; }
              const spec = applyPlaywrightRangeDistanceCorruption(r);
              setters.setStructuredRange(spec);
              setters.setSuppressExpandParse((prev) => ({ ...prev, range: true }));
              if (spec.kind === "special") setParserFallbackFields((prev) => new Set([...prev, "Range"]));
            })
            .catch(() => { setters.setStructuredRange(toSpecialRangeSpec(legacyRange)); setParserFallbackFields((prev) => new Set([...prev, "Range"])); })
        );
      }

      if (data.savingThrow?.trim()) {
        const stResult = mapLegacySavingThrow(data.savingThrow);
        setters.setStructuredSavingThrow(stResult);
        setters.setHasLoadedSavingThrowSpec(true);
        setters.setSuppressExpandParse((prev) => ({ ...prev, savingThrow: true }));
        if (stResult.kind === "dm_adjudicated") setParserFallbackFields((prev) => new Set([...prev, "Saving throw"]));
      }

      if (data.magicResistance?.trim()) {
        const mrResult = mapLegacyMagicResistance(data.magicResistance);
        setters.setStructuredMagicResistance(mrResult);
        setters.setHasLoadedMagicResistanceSpec(true);
        setters.setSuppressExpandParse((prev) => ({ ...prev, magicResistance: true }));
        if (mrResult.kind === "special") setParserFallbackFields((prev) => new Set([...prev, "Magic resistance"]));
      }

      if (parserTasks.length > 0) {
        setParsersPending(true);
        Promise.all(parserTasks).finally(() => { if (isActive()) setParsersPending(false); });
      }
    }
  }, []);

  return { hydrateSpell, parsersPending, setParsersPending, parserFallbackFields, setParserFallbackFields };
}

export {
  getSpellFocusVisibleRing,
  applyPlaywrightRangeDistanceCorruption,
  sleepPlaywrightSaveInvokeDelay,
  getParserFallbackLabel,
  toSpecialRangeSpec,
  toSpecialDurationSpec,
  toSpecialCastingTimeSpec,
  toSpecialAreaSpec,
  mapLegacySavingThrow,
  mapLegacyMagicResistance,
  toV2SpellDamageSpec,
  toV2SavingThrowSpec,
  buildParserTasks,
  validateSavingThrowSpecShape,
  validateMagicResistanceSpecShape
};
