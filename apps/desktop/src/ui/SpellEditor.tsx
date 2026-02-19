import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  validateAreaSpec,
  validateDurationSpec,
  validateRangeSpec,
  validateSpellCastingTime,
  validateSpellDamageSpec,
} from "../lib/parserValidation";
import { useModal } from "../store/useModal";
import {
  type SpellComponents,
  areaToText,
  componentsToText,
  damageToText,
  defaultAreaSpec,
  defaultSpellDamageSpec,
  magicResistanceToText,
  savingThrowToText,
} from "../types/spell";
import type {
  ApplicationScope,
  AreaSpec,
  DamagePart,
  DicePool,
  DiceTerm,
  DurationSpec,
  LevelBand,
  MagicResistanceSpec,
  MaterialComponentSpec,
  RangeSpec,
  SaveKind,
  SaveOutcome,
  SaveOutcomeEffect,
  SaveType,
  SavingThrowSpec,
  ScalarMode,
  ScalingDriver,
  ScalingKind,
  ScalingRule,
  SingleSave,
  SpellCastingTime,
  SpellCreate,
  SpellDamageSpec,
  SpellDetail,
} from "../types/spell";
import {
  AreaForm,
  ComponentCheckboxes,
  DamageForm,
  MagicResistanceInput,
  SavingThrowInput,
  StructuredFieldInput,
  castingTimeToText,
  durationToText,
  rangeToText,
} from "./components/structured";
import {
  DETAIL_FIELD_ORDER,
  type DetailFieldKey,
  clearDetailDirtyForFormOverrides,
  createDefaultDetailDirty,
} from "./detailDirty";
import { decideCanonicalField } from "./canonicalFieldDecision";

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
  } as AreaSpec;
}

function normalizeDamageSpec(d: Record<string, unknown>): SpellDamageSpec {
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
    dmGuidance: (d.dmGuidance ?? d.dm_guidance) as string,
    rawLegacyValue: (d.rawLegacyValue ?? d.raw_legacy_value) as string,
    notes: d.notes as string,
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
  return {
    kind: (s.kind as SavingThrowSpec["kind"]) ?? "none",
    single: normalizeSingleSave(s.single),
    multiple: (s.multiple as unknown[] | undefined)
      ?.map(normalizeSingleSave)
      .filter(Boolean) as SingleSave[],
    dmGuidance: (s.dmGuidance ?? s.dm_guidance) as string,
    notes: s.notes as string,
  } as SavingThrowSpec;
}

function normalizeMagicResistanceSpec(m: Record<string, unknown>): MagicResistanceSpec {
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
    notes: m.notes as string,
  } as MagicResistanceSpec;
}

function validateSavingThrowSpecShape(value: unknown): value is SavingThrowSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = value.kind;
  return kind === "none" || kind === "single" || kind === "multiple" || kind === "dm_adjudicated";
}

function validateMagicResistanceSpecShape(value: unknown): value is MagicResistanceSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = value.kind;
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

function toFallbackDamageSpec(rawLegacyValue: string): SpellDamageSpec {
  return { kind: "dm_adjudicated", rawLegacyValue, dmGuidance: rawLegacyValue };
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

  if (hasTokenPattern(normalized, /\bnegat(?:e|es|ed|ing)?\b/)) {
    return {
      kind: "single",
      single: {
        saveType: "spell",
        onSuccess: { result: "no_effect" },
        onFailure: { result: "full_effect" },
      },
    };
  }

  if (hasTokenPattern(normalized, /\bhalf\b|\b1\s*\/\s*2\b/)) {
    return {
      kind: "single",
      single: {
        saveType: "spell",
        onSuccess: { result: "reduced_effect" },
        onFailure: { result: "full_effect" },
      },
    };
  }

  if (hasTokenPattern(normalized, /\bpartial\b/)) {
    return {
      kind: "single",
      single: {
        saveType: "spell",
        onSuccess: { result: "partial_non_damage_only" },
        onFailure: { result: "full_effect" },
      },
    };
  }

  return { kind: "dm_adjudicated", dmGuidance: legacy };
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

  return { kind: "special", appliesTo: "whole_spell", specialRule: legacy };
}

export default function SpellEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<SpellDetail>({
    name: "",
    level: 1,
    description: "",
    school: null,
    sphere: null,
    range: null,
    components: null,
    materialComponents: null,
    castingTime: null,
    duration: null,
    area: null,
    savingThrow: null,
    damage: null,
    magicResistance: null,
    reversible: 0,
    isQuestSpell: 0,
    isCantrip: 0,
  });
  const [printStatus, setPrintStatus] = useState("");
  const [pageSize, setPageSize] = useState<"a4" | "letter">("letter");
  const [structuredRange, setStructuredRange] = useState<RangeSpec | null>(null);
  const [structuredDuration, setStructuredDuration] = useState<DurationSpec | null>(null);
  const [structuredCastingTime, setStructuredCastingTime] = useState<SpellCastingTime | null>(null);
  const [structuredArea, setStructuredArea] = useState<AreaSpec | null>(null);
  const [structuredDamage, setStructuredDamage] = useState<SpellDamageSpec | null>(null);
  const [structuredSavingThrow, setStructuredSavingThrow] = useState<SavingThrowSpec | null>(null);
  const [structuredMagicResistance, setStructuredMagicResistance] =
    useState<MagicResistanceSpec | null>(null);
  const [structuredComponents, setStructuredComponents] = useState<SpellComponents | null>(null);
  const [structuredMaterialComponents, setStructuredMaterialComponents] = useState<
    MaterialComponentSpec[]
  >([]);
  const [hasLoadedMaterialComponentsSpec, setHasLoadedMaterialComponentsSpec] = useState(false);
  const [hasLoadedSavingThrowSpec, setHasLoadedSavingThrowSpec] = useState(false);
  const [hasLoadedMagicResistanceSpec, setHasLoadedMagicResistanceSpec] = useState(false);
  const [hasExpandedComponentsEdit, setHasExpandedComponentsEdit] = useState(false);
  const [hashExpanded, setHashExpanded] = useState(false);
  type Tradition = "ARCANE" | "DIVINE" | "BOTH";
  const [tradition, setTradition] = useState<Tradition>("ARCANE");

  /** Canon-first: which detail field is expanded (only one at a time). */
  const [expandedDetailField, setExpandedDetailField] = useState<DetailFieldKey | null>(null);
  /** Canon-first: per-field dirty since last canonical text edit. */
  const [detailDirty, setDetailDirty] = useState<Record<DetailFieldKey, boolean>>(() =>
    createDefaultDetailDirty(),
  );
  const [suppressExpandParse, setSuppressExpandParse] = useState<Partial<Record<DetailFieldKey, boolean>>>({});
  /** Canon-first: which field is loading (async parse on expand). */
  const [detailLoading, setDetailLoading] = useState<DetailFieldKey | null>(null);
  /** Refs for focus management: expanded panel (focus first focusable on expand); collapse focuses via data-testid query. */
  const expandedPanelRef = useRef<HTMLElement | null>(null);
  /** Ref for parse race guard: only clear loading when completed parse matches currently expanded field. */
  const expandedDetailRef = useRef<DetailFieldKey | null>(null);
  /** Ref for async parse race guard: increment on every expand request; only apply result if matches. */
  const expandRequestId = useRef(0);
  /** Track unsaved changes for navigate/close warning. */
  const unsavedRef = useRef(false);
  const [hasUnsavedState, setHasUnsavedState] = useState(false);

  const isNew = id === "new";

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const blocker = useBlocker(hasUnsavedState);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  /** Focus management: on expand focus first focusable in panel; on collapse focus the expand button. */
  const prevExpandedDetailRef = useRef<DetailFieldKey | null>(null);
  const resetStructuredLoadState = useCallback(() => {
    setStructuredRange(null);
    setStructuredDuration(null);
    setStructuredCastingTime(null);
    setStructuredArea(null);
    setStructuredDamage(null);
    setStructuredSavingThrow(null);
    setStructuredMagicResistance(null);
    setStructuredComponents(null);
    setStructuredMaterialComponents([]);
    setHasLoadedMaterialComponentsSpec(false);
    setHasLoadedSavingThrowSpec(false);
    setHasLoadedMagicResistanceSpec(false);
    setHasExpandedComponentsEdit(false);
    setExpandedDetailField(null);
    setDetailLoading(null);
    setDetailDirty(createDefaultDetailDirty());
    setSuppressExpandParse({});
    expandedDetailRef.current = null;
    prevExpandedDetailRef.current = null;
  }, []);

  const fieldToKebab = useCallback(
    (f: DetailFieldKey) => f.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
    [],
  );
  useEffect(() => {
    expandedDetailRef.current = expandedDetailField;
    if (expandedDetailField !== null) {
      prevExpandedDetailRef.current = expandedDetailField;
      requestAnimationFrame(() => {
        const panel = expandedPanelRef.current;
        if (panel) {
          const focusable = panel.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (focusable) focusable.focus();
          else {
            panel.tabIndex = -1;
            panel.focus();
          }
        }
      });
    } else {
      const justCollapsed = prevExpandedDetailRef.current;
      if (justCollapsed !== null) {
        prevExpandedDetailRef.current = null;
        requestAnimationFrame(() => {
          const kebab = fieldToKebab(justCollapsed);
          const btn = document.querySelector<HTMLButtonElement>(
            `[data-testid="detail-${kebab}-expand"]`,
          );
          btn?.focus();
        });
      }
    }
  }, [expandedDetailField, fieldToKebab]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const b = blockerRef.current;
    // Save (or similar) already cleared the ref before navigate; don't prompt.
    if (!unsavedRef.current) {
      setHasUnsavedState(false);
      b.proceed?.();
      return;
    }
    modalConfirm("You have unsaved changes. Leave and discard?", "Unsaved changes").then((ok) => {
      if (ok) {
        unsavedRef.current = false;
        setHasUnsavedState(false);
        b.proceed?.();
      } else {
        b.reset?.();
      }
    });
  }, [blocker.state, modalConfirm]);

  useEffect(() => {
    if (!isNew && id) {
      let isActive = true;
      resetStructuredLoadState();
      setLoading(true);
      invoke<SpellDetail>("get_spell", { id: Number.parseInt(id) })
        .then((data) => {
          if (!isActive) return;

          // Reset all structured/canon-first expansion state before applying loaded spell.
          resetStructuredLoadState();

          if (data) {
            setForm(data);
            const hasSchool = !!data.school?.trim();
            const hasSphere = !!data.sphere?.trim();
            setTradition(
              hasSchool && hasSphere
                ? "BOTH"
                : hasSchool
                  ? "ARCANE"
                  : hasSphere
                    ? "DIVINE"
                    : "ARCANE",
            );
            if (data.canonicalData) {
              try {
                // canonical_data is always stored in snake_case (see docs/ARCHITECTURE.md).
                const canonicalRaw = JSON.parse(data.canonicalData) as Record<string, unknown>;
                const canonical = canonicalRaw as {
                  range?: RangeSpec & {
                    distance?: { per_level?: number };
                    raw_legacy_value?: string;
                  };
                  duration?: DurationSpec & {
                    duration?: { per_level?: number };
                    raw_legacy_value?: string;
                  };
                  casting_time?: SpellCastingTime & { raw_legacy_value?: string };
                  area?: AreaSpec & { raw_legacy_value?: string };
                  damage?: SpellDamageSpec & { raw_legacy_value?: string; dm_guidance?: string };
                  saving_throw?: SavingThrowSpec & { dm_guidance?: string };
                  magic_resistance?: MagicResistanceSpec & { special_rule?: string };
                  components?: {
                    verbal?: boolean;
                    somatic?: boolean;
                    material?: boolean;
                    focus?: boolean;
                    divine_focus?: boolean;
                    experience?: boolean;
                  };
                  material_components?: MaterialComponentSpec[];
                };
                const canonicalHasMaterialComponentsSpec = Object.prototype.hasOwnProperty.call(
                  canonicalRaw,
                  "material_components",
                );
                setHasLoadedMaterialComponentsSpec(canonicalHasMaterialComponentsSpec);
                const nextSuppressExpandParse: Partial<Record<DetailFieldKey, boolean>> = {};

                const rangeDecision = decideCanonicalField(
                  canonicalRaw,
                  "range",
                  (rawValue): RangeSpec => {
                    const r = rawValue as RangeSpec & {
                      distance?: { per_level?: number };
                      raw_legacy_value?: string;
                    };
                    return {
                      kind: r.kind,
                      text: r.text,
                      unit: r.unit,
                      distance: r.distance
                        ? {
                            mode: r.distance.mode ?? "fixed",
                            value: r.distance.value,
                            perLevel: r.distance.per_level ?? r.distance.perLevel,
                          }
                        : undefined,
                      rawLegacyValue: r.raw_legacy_value ?? r.rawLegacyValue,
                    };
                  },
                  validateRangeSpec,
                );
                if (rangeDecision.structuredValue) {
                  setStructuredRange(rangeDecision.structuredValue);
                }
                if (rangeDecision.suppressExpandParse) {
                  nextSuppressExpandParse.range = true;
                }

                const durationDecision = decideCanonicalField(
                  canonicalRaw,
                  "duration",
                  (rawValue): DurationSpec => {
                    const d = rawValue as DurationSpec & {
                      duration?: { per_level?: number };
                      raw_legacy_value?: string;
                    };
                    return {
                      kind: d.kind,
                      unit: d.unit,
                      duration: d.duration
                        ? {
                            mode: d.duration.mode ?? "fixed",
                            value: d.duration.value,
                            perLevel: d.duration.per_level ?? d.duration.perLevel,
                          }
                        : undefined,
                      condition: d.condition,
                      uses: normalizeScalar(d.uses),
                      rawLegacyValue: d.raw_legacy_value ?? d.rawLegacyValue,
                    };
                  },
                  validateDurationSpec,
                );
                if (durationDecision.structuredValue) {
                  setStructuredDuration(durationDecision.structuredValue);
                }
                if (durationDecision.suppressExpandParse) {
                  nextSuppressExpandParse.duration = true;
                }

                const castingTimeDecision = decideCanonicalField(
                  canonicalRaw,
                  "casting_time",
                  (rawValue): SpellCastingTime => {
                    const c = rawValue as SpellCastingTime & {
                      base_value?: number;
                      per_level?: number;
                      level_divisor?: number;
                      raw_legacy_value?: string;
                    };
                    return {
                      text: c.text ?? "",
                      unit: c.unit,
                      baseValue: c.baseValue ?? c.base_value,
                      perLevel: c.perLevel ?? c.per_level ?? 0,
                      levelDivisor: c.levelDivisor ?? c.level_divisor ?? 1,
                      rawLegacyValue: c.rawLegacyValue ?? c.raw_legacy_value,
                    };
                  },
                  validateSpellCastingTime,
                );
                if (castingTimeDecision.structuredValue) {
                  setStructuredCastingTime(castingTimeDecision.structuredValue);
                }
                if (castingTimeDecision.suppressExpandParse) {
                  nextSuppressExpandParse.castingTime = true;
                }

                const areaDecision = decideCanonicalField(
                  canonicalRaw,
                  "area",
                  normalizeAreaSpec,
                  validateAreaSpec,
                );
                if (areaDecision.structuredValue) {
                  setStructuredArea(areaDecision.structuredValue);
                }
                if (areaDecision.suppressExpandParse) {
                  nextSuppressExpandParse.area = true;
                }

                const damageDecision = decideCanonicalField(
                  canonicalRaw,
                  "damage",
                  normalizeDamageSpec,
                  validateSpellDamageSpec,
                );
                if (damageDecision.structuredValue) {
                  setStructuredDamage(damageDecision.structuredValue);
                }
                if (damageDecision.suppressExpandParse) {
                  nextSuppressExpandParse.damage = true;
                }

                const savingThrowDecision = decideCanonicalField(
                  canonicalRaw,
                  "saving_throw",
                  normalizeSavingThrowSpec,
                  validateSavingThrowSpecShape,
                );
                if (savingThrowDecision.suppressExpandParse) {
                  setHasLoadedSavingThrowSpec(true);
                  nextSuppressExpandParse.savingThrow = true;
                }
                if (savingThrowDecision.structuredValue) {
                  setStructuredSavingThrow(savingThrowDecision.structuredValue);
                }

                const magicResistanceDecision = decideCanonicalField(
                  canonicalRaw,
                  "magic_resistance",
                  normalizeMagicResistanceSpec,
                  validateMagicResistanceSpecShape,
                );
                if (magicResistanceDecision.suppressExpandParse) {
                  setHasLoadedMagicResistanceSpec(true);
                  nextSuppressExpandParse.magicResistance = true;
                }
                if (magicResistanceDecision.structuredValue) {
                  setStructuredMagicResistance(magicResistanceDecision.structuredValue);
                }

                if (
                  canonical.components ||
                  (canonical.material_components && canonical.material_components.length > 0)
                ) {
                  const hasMaterialData = (canonical.material_components?.length ?? 0) > 0;
                  const comp = canonical.components
                    ? {
                        verbal: canonical.components.verbal ?? false,
                        somatic: canonical.components.somatic ?? false,
                        material: (canonical.components.material ?? false) || hasMaterialData,
                        focus: canonical.components.focus ?? false,
                        divineFocus: canonical.components.divine_focus ?? false,
                        experience: canonical.components.experience ?? false,
                      }
                    : {
                        verbal: false,
                        somatic: false,
                        material: true,
                        focus: false,
                        divineFocus: false,
                        experience: false,
                      };
                  setStructuredComponents(comp);
                  const rawMats = (canonical.material_components ?? []) as unknown[];
                  const mats: MaterialComponentSpec[] = rawMats.map((m) => {
                    const x = m as Record<string, unknown>;
                    return {
                      name: (x.name as string) ?? "",
                      quantity: x.quantity as number | undefined,
                      unit: (x.unit as string) ?? undefined,
                      gpValue: (x.gpValue ?? x.gp_value) as number | undefined,
                      isConsumed: (x.isConsumed ?? x.is_consumed) as boolean | undefined,
                      description: (x.description as string) ?? undefined,
                    };
                  });
                  setStructuredMaterialComponents(mats);
                }
                setSuppressExpandParse(nextSuppressExpandParse);
              } catch {
                // ignore parse error, fall back to legacy
              }
            }
            // Canon-first: do not parse on load for fields missing from canonical_data;
            // parse on first expand instead.
            unsavedRef.current = false;
            setHasUnsavedState(false);
          }
        })
        .finally(() => {
          if (isActive) setLoading(false);
        });

      return () => {
        isActive = false;
      };
    }
  }, [id, isNew, resetStructuredLoadState]);

  const handleChange = (field: keyof SpellDetail, value: string | number) => {
    unsavedRef.current = true;
    setHasUnsavedState(true);
    setForm((prev) => ({ ...prev, [field]: value }));

    // If canon line is edited directly, structured spec is stale.
    if (DETAIL_FIELD_ORDER.includes(field as DetailFieldKey)) {
      const detailField = field as DetailFieldKey;
      setSuppressExpandParse((prev) => {
        if (detailField === "components" || detailField === "materialComponents") {
          return {
            ...prev,
            components: false,
            materialComponents: false,
          };
        }
        return {
          ...prev,
          [detailField]: false,
        };
      });
      // Invalide any pending async parse results for this field.
      expandRequestId.current += 1;
      if (expandedDetailField === detailField) {
        setExpandedDetailField(null);
        expandedDetailRef.current = null;
        setDetailLoading(null);
      }
      setDetailDirty((prev) => ({ ...prev, [field]: false }));
      switch (field) {
        case "range":
          setStructuredRange(null);
          break;
        case "duration":
          setStructuredDuration(null);
          break;
        case "castingTime":
          setStructuredCastingTime(null);
          break;
        case "area":
          setStructuredArea(null);
          break;
        case "savingThrow":
          setStructuredSavingThrow(null);
          setHasLoadedSavingThrowSpec(false);
          break;
        case "damage":
          setStructuredDamage(null);
          break;
        case "magicResistance":
          setStructuredMagicResistance(null);
          setHasLoadedMagicResistanceSpec(false);
          break;
        case "components":
        case "materialComponents":
          setStructuredComponents(null);
          setStructuredMaterialComponents([]);
          setHasLoadedMaterialComponentsSpec(false);
          setHasExpandedComponentsEdit(false);
          break;
      }
    }
  };

  /** Serialize current structured value for a detail field to form text (for collapse/save). */
  const serializeDetailField = (field: DetailFieldKey): DetailTextOverrides => {
    const overrides: DetailTextOverrides = {};

    switch (field) {
      case "range":
        if (structuredRange) {
          const text = rangeToText(structuredRange);
          overrides.range = text;
          setForm((prev) => ({ ...prev, range: text }));
        }
        break;
      case "components":
      case "materialComponents": {
        const comp = structuredComponents ?? emptySpellComponents();
        const { components: cs, materialComponents: ms } = componentsToText(
          comp,
          structuredMaterialComponents,
        );
        overrides.components = cs;
        overrides.materialComponents = ms;
        setForm((prev) => ({ ...prev, components: cs, materialComponents: ms }));
        break;
      }
      case "duration":
        if (structuredDuration) {
          const text = durationToText(structuredDuration);
          overrides.duration = text;
          setForm((prev) => ({ ...prev, duration: text }));
        }
        break;
      case "castingTime":
        if (structuredCastingTime) {
          const text = castingTimeToText(structuredCastingTime);
          overrides.castingTime = text;
          setForm((prev) => ({ ...prev, castingTime: text }));
        }
        break;
      case "area":
        if (structuredArea) {
          const text = areaToText(structuredArea);
          overrides.area = text;
          setForm((prev) => ({ ...prev, area: text }));
        }
        break;
      case "savingThrow":
        if (structuredSavingThrow) {
          const text = savingThrowToText(structuredSavingThrow);
          overrides.savingThrow = text;
          setForm((prev) => ({ ...prev, savingThrow: text }));
        }
        break;
      case "damage":
        if (structuredDamage) {
          const text = damageToText(structuredDamage);
          overrides.damage = text;
          setForm((prev) => ({ ...prev, damage: text }));
        }
        break;
      case "magicResistance":
        if (structuredMagicResistance) {
          const text = magicResistanceToText(structuredMagicResistance);
          overrides.magicResistance = text;
          setForm((prev) => ({
            ...prev,
            magicResistance: text,
          }));
        }
        break;
    }

    return overrides;
  };

  const emptySpellComponents = (): SpellComponents => ({
    verbal: false,
    somatic: false,
    material: false,
    focus: false,
    divineFocus: false,
    experience: false,
  });

  const inferSpellComponentsFromLegacy = (
    componentsLegacy: string,
    hasMaterialText: boolean,
  ): SpellComponents => {
    const normalized = componentsLegacy.toUpperCase();
    const tokens = normalized.split(/[^A-Z]+/).filter(Boolean);
    const inferred = emptySpellComponents();

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const nextToken = tokens[index + 1];
      const prevToken = tokens[index - 1];

      if (token === "DIVINE" && nextToken === "FOCUS") {
        inferred.divineFocus = true;
        continue;
      }

      switch (token) {
        case "V":
        case "VERBAL":
          inferred.verbal = true;
          continue;
        case "S":
        case "SOMATIC":
          inferred.somatic = true;
          continue;
        case "M":
        case "MATERIAL":
          inferred.material = true;
          continue;
        case "F":
          inferred.focus = true;
          continue;
        case "FOCUS":
          if (prevToken !== "DIVINE") {
            inferred.focus = true;
          }
          continue;
        case "DF":
          inferred.divineFocus = true;
          continue;
        case "XP":
        case "EXP":
        case "EXPERIENCE":
          inferred.experience = true;
          continue;
      }

      // Support compact shorthand like "VS", "VSM", or "SMF".
      if (/^[VSMF]+$/.test(token)) {
        if (token.includes("V")) inferred.verbal = true;
        if (token.includes("S")) inferred.somatic = true;
        if (token.includes("M")) inferred.material = true;
        if (token.includes("F")) inferred.focus = true;
      }
    }

    inferred.material = inferred.material || hasMaterialText;
    return inferred;
  };

  /** Collapse current expanded field; if dirty, serialize to canon line. */
  const collapseExpandedField = (): DetailTextOverrides => {
    if (expandedDetailField === null) return {};

    let overrides: DetailTextOverrides = {};
    if (detailDirty[expandedDetailField]) {
      overrides = serializeDetailField(expandedDetailField);
      setDetailDirty((prev) => {
        const next = { ...prev, [expandedDetailField]: false };
        if (expandedDetailField === "components") next.materialComponents = false;
        else if (expandedDetailField === "materialComponents" && prev.components)
          next.components = false;
        return next;
      });
    }
    setExpandedDetailField(null);
    return overrides;
  };

  /** Expand a detail field; collapse current first. Populate from canonical_data or parse on first open. */
  const expandDetailField = async (field: DetailFieldKey) => {
    if (expandedDetailField === field) return;
    const serializedOverrides = collapseExpandedField();

    setExpandedDetailField(field);
    expandedDetailRef.current = field;

    // Increment request ID to ignore stale async results
    expandRequestId.current += 1;
    const requestId = expandRequestId.current;

    const getLegacy = (): string => {
      if (Object.prototype.hasOwnProperty.call(serializedOverrides, field)) {
        return serializedOverrides[field] ?? "";
      }

      let stateVal = "";
      switch (field) {
        case "range":
          stateVal = form.range ?? "";
          break;
        case "components":
          stateVal = form.components ?? "";
          break;
        case "duration":
          stateVal = form.duration ?? "";
          break;
        case "castingTime":
          stateVal = form.castingTime ?? "";
          break;
        case "area":
          stateVal = form.area ?? "";
          break;
        case "savingThrow":
          stateVal = form.savingThrow ?? "";
          break;
        case "damage":
          stateVal = form.damage ?? "";
          break;
        case "magicResistance":
          stateVal = form.magicResistance ?? "";
          break;
        case "materialComponents":
          stateVal = form.materialComponents ?? "";
          break;
      }
      if (stateVal) return stateVal;

      // Fallback for E2E/race conditions: read from DOM if state is still lagging
      const domInput = document.getElementById(`detail-${field}-input`) as HTMLInputElement | null;
      if (domInput?.value) {
        return domInput.value;
      }
      return "";
    };

    const hasStructured = (): boolean => {
      if (suppressExpandParse[field]) return true;
      switch (field) {
        case "range":
          return structuredRange != null;
        case "components":
          return structuredComponents != null;
        case "duration":
          return structuredDuration != null;
        case "castingTime":
          return structuredCastingTime != null;
        case "area":
          return structuredArea != null;
        case "savingThrow":
          return structuredSavingThrow != null;
        case "damage":
          return structuredDamage != null;
        case "magicResistance":
          return structuredMagicResistance != null;
        case "materialComponents":
          return structuredComponents != null;
      }
    };

    if (hasStructured()) {
      setDetailLoading(null);
      return;
    }

    setDetailLoading(field);
    const legacy = getLegacy();

    try {
      switch (field) {
        case "range": {
          const parsed = await invoke<RangeSpec>("parse_spell_range", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateRangeSpec(parsed)) {
            setStructuredRange(toSpecialRangeSpec(legacy));
          } else {
            setStructuredRange(parsed);
          }
          break;
        }
        case "duration": {
          const parsed = await invoke<DurationSpec>("parse_spell_duration", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateDurationSpec(parsed)) {
            setStructuredDuration(toSpecialDurationSpec(legacy));
          } else {
            setStructuredDuration(parsed);
          }
          break;
        }
        case "castingTime": {
          const parsed = await invoke<SpellCastingTime>("parse_spell_casting_time", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateSpellCastingTime(parsed)) {
            setStructuredCastingTime(toSpecialCastingTimeSpec(legacy));
          } else {
            setStructuredCastingTime(parsed);
          }
          break;
        }
        case "area": {
          const parsed = await invoke<AreaSpec | null>("parse_spell_area", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (parsed === null || !validateAreaSpec(parsed)) {
            setStructuredArea(toSpecialAreaSpec(legacy));
          } else {
            setStructuredArea(parsed);
          }
          break;
        }
        case "damage": {
          const parsed = await invoke<SpellDamageSpec>("parse_spell_damage", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateSpellDamageSpec(parsed)) {
            setStructuredDamage(toFallbackDamageSpec(legacy));
          } else {
            setStructuredDamage(parsed);
          }
          break;
        }
        case "savingThrow":
          if (requestId !== expandRequestId.current) return;
          setStructuredSavingThrow(mapLegacySavingThrow(legacy));
          break;
        case "magicResistance":
          if (requestId !== expandRequestId.current) return;
          setStructuredMagicResistance(mapLegacyMagicResistance(legacy));
          break;
        case "components":
        case "materialComponents":
          {
            const compLegacy = (
              Object.prototype.hasOwnProperty.call(serializedOverrides, "components")
                ? serializedOverrides.components
                : form.components
            )?.trim();
            const matLegacy = (
              Object.prototype.hasOwnProperty.call(serializedOverrides, "materialComponents")
                ? serializedOverrides.materialComponents
                : form.materialComponents
            )?.trim();
            const hasComponentText = !!compLegacy;
            const hasMaterialText = !!matLegacy;

            if (hasComponentText || hasMaterialText) {
              setDetailLoading(field);
              const combined = await invoke<{
                components: SpellComponents;
                materials: MaterialComponentSpec[];
              }>("parse_spell_components_with_migration", {
                legacyComponents: compLegacy,
                legacyMaterials: hasMaterialText ? matLegacy : null,
              });

              if (requestId !== expandRequestId.current) return;

              // Destructure non-flattened response
              const { materials, components } = combined;

              setStructuredComponents(components);

              if (!hasMaterialText && hasComponentText && materials.length > 0) {
                // Extracted! Mark dirty locally.
                setDetailDirty((prev) => ({ ...prev, materialComponents: true }));
              }
              setStructuredMaterialComponents(materials);
            } else {
              if (requestId !== expandRequestId.current) return;
              setStructuredComponents(null);
              setStructuredMaterialComponents([]);
            }
          }
          break;
      }
    } catch (err) {
      console.error(`[expandDetailField] error field: ${field}, err:`, err);
      if (requestId !== expandRequestId.current) return;
      const leg = getLegacy();
      switch (field) {
        case "range":
          setStructuredRange(toSpecialRangeSpec(leg));
          break;
        case "duration":
          setStructuredDuration(toSpecialDurationSpec(leg));
          break;
        case "castingTime":
          setStructuredCastingTime(toSpecialCastingTimeSpec(leg));
          break;
        case "area":
          setStructuredArea(toSpecialAreaSpec(leg));
          break;
        case "damage":
          setStructuredDamage(toFallbackDamageSpec(leg));
          break;
        case "savingThrow":
          setStructuredSavingThrow(mapLegacySavingThrow(leg));
          break;
        case "magicResistance":
          setStructuredMagicResistance(mapLegacyMagicResistance(leg));
          break;
        case "components":
        case "materialComponents":
          {
            const componentsLegacy = Object.prototype.hasOwnProperty.call(
              serializedOverrides,
              "components",
            )
              ? (serializedOverrides.components ?? "")
              : (form.components ?? "");
            const materialComponentsLegacy = Object.prototype.hasOwnProperty.call(
              serializedOverrides,
              "materialComponents",
            )
              ? (serializedOverrides.materialComponents ?? "")
              : (form.materialComponents ?? "");
            const hasComponentText = !!componentsLegacy.trim();
            const hasMaterialText = !!materialComponentsLegacy.trim();
            if (hasComponentText || hasMaterialText) {
              setStructuredComponents(
                inferSpellComponentsFromLegacy(componentsLegacy, hasMaterialText),
              );
              setStructuredMaterialComponents(
                materialComponentsLegacy ? [{ name: materialComponentsLegacy, quantity: 1.0 }] : [],
              );
            } else {
              setStructuredComponents(null);
              setStructuredMaterialComponents([]);
            }
          }
          break;
      }
    } finally {
      if (expandedDetailRef.current === field) setDetailLoading(null);
    }
  };

  const setDetailDirtyFor = (field: DetailFieldKey) => {
    unsavedRef.current = true;
    setHasUnsavedState(true);
    setDetailDirty((prev) => ({ ...prev, [field]: true }));
    if (field === "components" || field === "materialComponents") {
      setHasExpandedComponentsEdit(true);
    }
  };

  const isNameInvalid = !form.name.trim();
  const isDescriptionInvalid = !form.description.trim();
  const isLevelInvalid = Number.isNaN(form.level) || form.level < 0 || form.level > 12;

  const isArcane = !!form.school?.trim();
  const isDivine = !!form.sphere?.trim();
  const getIsBothTradition = () => isArcane && isDivine;
  const isBothTradition = getIsBothTradition();

  const getLevelDisplay = (level: number) => {
    if (level === 0 && form.isCantrip) return "Cantrip";
    if (level >= 10 && isArcane) {
      const circle = level === 10 ? "10th" : level === 11 ? "11th" : "12th";
      return `${circle} Circle`;
    }
    if (level === 8 && form.isQuestSpell) return "Quest";
    return `Level ${level}`;
  };

  const divineClasses = ["priest", "cleric", "druid", "paladin", "ranger"];
  const classesLower = form.classList?.toLowerCase() || "";
  const hasDivine = divineClasses.some((c) => classesLower.includes(c));

  const isEpicRestricted = form.level >= 10 && (isDivine || !isArcane);
  const isQuestRestricted = form.isQuestSpell === 1 && (isArcane || !isDivine);
  const isConflictRestricted = form.level >= 10 && form.isQuestSpell === 1;
  const isCantripRestricted = form.isCantrip === 1 && form.level !== 0;

  const isArcaneMissingSchool = tradition === "ARCANE" && !form.school?.trim();
  const isDivineMissingSphere = tradition === "DIVINE" && !form.sphere?.trim();
  const isBothMissingSchool = tradition === "BOTH" && !form.school?.trim();
  const isBothMissingSphere = tradition === "BOTH" && !form.sphere?.trim();

  const validationErrors = [
    isNameInvalid && "Name is required",
    isDescriptionInvalid && "Description is required",
    isLevelInvalid && "Level must be between 0 and 12",
    isEpicRestricted && "Levels 10-12 are Arcane (has School) only",
    isQuestRestricted && "Quest spells are Divine (has Sphere) only",
    isConflictRestricted && "A spell cannot be both Epic and Quest",
    isCantripRestricted && "Cantrips must be Level 0",
    isArcaneMissingSchool && "School is required for Arcane tradition",
    isDivineMissingSphere && "Sphere is required for Divine tradition",
    isBothMissingSchool && "School is required for Both tradition",
    isBothMissingSphere && "Sphere is required for Both tradition",
  ].filter(Boolean) as string[];

  const specialFallbackFields = [
    structuredRange?.kind === "special" && "Range",
    structuredDuration?.kind === "special" && "Duration",
    structuredCastingTime?.unit === "special" && "Casting time",
    structuredArea?.kind === "special" && "Area",
    structuredDamage?.rawLegacyValue && "Damage",
  ].filter(Boolean) as string[];
  const hasSpecialFallback = specialFallbackFields.length > 0;
  const specialFallbackMessage = hasSpecialFallback
    ? `${specialFallbackFields.join(" and ")} could not be fully parsed; original text preserved.`
    : "";

  const isInvalid = validationErrors.length > 0;
  const save = async () => {
    try {
      if (isInvalid) {
        await modalAlert(validationErrors, "Validation Errors", "error");
        return;
      }
      setLoading(true);

      // Canon-first: apply serialized values only for structured fields edited since last canon edit.
      const formOverrides: Partial<SpellDetail> = {};
      if (detailDirty.range && structuredRange) {
        formOverrides.range = rangeToText(structuredRange);
      }
      if (detailDirty.duration && structuredDuration) {
        formOverrides.duration = durationToText(structuredDuration);
      }
      if (detailDirty.castingTime && structuredCastingTime) {
        formOverrides.castingTime = castingTimeToText(structuredCastingTime);
      }
      if (detailDirty.area && structuredArea) {
        formOverrides.area = areaToText(structuredArea);
      }
      if (detailDirty.damage && structuredDamage) {
        formOverrides.damage = damageToText(structuredDamage);
      }
      if (detailDirty.savingThrow && structuredSavingThrow) {
        formOverrides.savingThrow = savingThrowToText(structuredSavingThrow);
      }
      if (detailDirty.magicResistance && structuredMagicResistance) {
        formOverrides.magicResistance = magicResistanceToText(structuredMagicResistance);
      }
      const componentsDirty = detailDirty.components;
      const materialComponentsDirty = detailDirty.materialComponents;
      const anyComponentsFieldDirty = componentsDirty || materialComponentsDirty;

      if (anyComponentsFieldDirty && structuredComponents) {
        const { components: cs, materialComponents: ms } = componentsToText(
          structuredComponents,
          structuredMaterialComponents,
        );
        formOverrides.components = cs;
        formOverrides.materialComponents = ms;
      } else if (anyComponentsFieldDirty && !structuredComponents) {
        const { components: cs, materialComponents: ms } = componentsToText(
          emptySpellComponents(),
          structuredMaterialComponents,
        );
        formOverrides.components = cs;
        formOverrides.materialComponents = ms;
      }

      if (Object.keys(formOverrides).length > 0) {
        setForm((prev) => ({ ...prev, ...formOverrides }));
        // Clear dirty for fields we just serialized (spec: SHOULD so view-only collapse does not re-serialize if user stays on editor after save).
        setDetailDirty((prev) => clearDetailDirtyForFormOverrides(prev, formOverrides));
      }

      const comp = structuredComponents ?? {
        verbal: false,
        somatic: false,
        material: false,
        focus: false,
        divineFocus: false,
        experience: false,
      };
      const validRangeSpec =
        structuredRange !== null && validateRangeSpec(structuredRange) ? structuredRange : undefined;
      const validDurationSpec =
        structuredDuration !== null && validateDurationSpec(structuredDuration)
          ? structuredDuration
          : undefined;
      const validCastingTimeSpec =
        structuredCastingTime !== null && validateSpellCastingTime(structuredCastingTime)
          ? structuredCastingTime
          : undefined;
      const validAreaSpec =
        structuredArea !== null && validateAreaSpec(structuredArea) ? structuredArea : undefined;
      const validDamageSpec =
        structuredDamage !== null && validateSpellDamageSpec(structuredDamage)
          ? structuredDamage
          : undefined;
      const validSavingThrowSpec =
        structuredSavingThrow !== null && validateSavingThrowSpecShape(structuredSavingThrow)
          ? structuredSavingThrow
          : undefined;
      const validMagicResistanceSpec =
        structuredMagicResistance !== null &&
        validateMagicResistanceSpecShape(structuredMagicResistance)
          ? structuredMagicResistance
          : undefined;
      const shouldSendSavingThrowSpec =
        validSavingThrowSpec !== undefined &&
        (hasLoadedSavingThrowSpec || detailDirty.savingThrow || !(form.savingThrow ?? "").trim());
      const shouldSendMagicResistanceSpec =
        validMagicResistanceSpec !== undefined &&
        (hasLoadedMagicResistanceSpec ||
          detailDirty.magicResistance ||
          !(form.magicResistance ?? "").trim());

      const spellData: SpellDetail = {
        ...form,
        ...formOverrides,
        range: formOverrides.range ?? form.range,
        rangeSpec: validRangeSpec,
        duration: formOverrides.duration ?? form.duration,
        durationSpec: validDurationSpec,
        castingTime: formOverrides.castingTime ?? form.castingTime,
        castingTimeSpec: validCastingTimeSpec,
        area: formOverrides.area ?? form.area,
        areaSpec: validAreaSpec,
        damage: formOverrides.damage ?? form.damage,
        damageSpec: validDamageSpec,
        savingThrow: formOverrides.savingThrow ?? form.savingThrow,
        savingThrowSpec: shouldSendSavingThrowSpec ? validSavingThrowSpec : undefined,
        magicResistance: formOverrides.magicResistance ?? form.magicResistance,
        magicResistanceSpec: shouldSendMagicResistanceSpec ? validMagicResistanceSpec : undefined,
        components: formOverrides.components ?? form.components,
        materialComponents: formOverrides.materialComponents ?? form.materialComponents,
      };

      const componentsEditedInExpandedMode =
        detailDirty.components || detailDirty.materialComponents || hasExpandedComponentsEdit;
      const shouldSendComponentsSpec =
        structuredComponents !== null || componentsEditedInExpandedMode;
      const shouldSendMaterialComponentsSpec =
        hasLoadedMaterialComponentsSpec ||
        structuredMaterialComponents.length > 0 ||
        componentsEditedInExpandedMode;

      if (shouldSendComponentsSpec) {
        spellData.componentsSpec = comp;
      }
      if (shouldSendMaterialComponentsSpec) {
        spellData.materialComponentsSpec = structuredMaterialComponents;
      }

      if (isNew) {
        const { id, ...createData } = spellData; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("create_spell", { spell: createData });
      } else {
        const { artifacts, ...updateData } = spellData; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("update_spell", { spell: updateData });
      }
      unsavedRef.current = false;
      setHasUnsavedState(false);
      navigate("/");
    } catch (e) {
      await modalAlert(`Failed to save: ${e}`, "Save Error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await modalConfirm(
      "Are you sure you want to delete this spell?",
      "Delete Spell",
    );
    if (!confirmed) return;
    try {
      if (form.id) {
        await invoke("delete_spell", { id: form.id });
        navigate("/");
      }
    } catch (e) {
      await modalAlert(`Failed to delete: ${e}`, "Delete Error", "error");
    }
  };

  const printSpell = async (layout: "compact" | "stat-block") => {
    if (!form.id) return;
    setPrintStatus("Generating print…");
    try {
      const path = await invoke<string>("print_spell", {
        spellId: form.id,
        layout,
        pageSize,
      });
      setPrintStatus(path ? `Print ready: ${path}` : "No output returned");
    } catch (e) {
      setPrintStatus(`Print failed: ${e}`);
    }
  };

  if (loading && !form.name) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 overflow-auto h-full">
      {hasSpecialFallback && (
        <div
          role="alert"
          className="rounded border border-amber-600/50 bg-amber-600/10 px-3 py-2 text-sm text-amber-200"
          data-testid="spell-editor-special-fallback-banner"
        >
          {specialFallbackMessage}
        </div>
      )}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{isNew ? "New Spell" : "Edit Spell"}</h1>
          <div className="flex gap-2">
            {form.isQuestSpell === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">
                Quest
              </span>
            )}
            {form.level >= 10 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                Epic
              </span>
            )}
            {form.level === 0 && form.isCantrip === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                Cantrip
              </span>
            )}
          </div>
        </div>
        <div className="space-x-2">
          {!isNew && (
            <>
              <select
                value={pageSize}
                data-testid="print-page-size-select"
                aria-label="Print page size"
                onChange={(e) => setPageSize(e.target.value as "a4" | "letter")}
                className="bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700"
              >
                <option value="letter">Letter</option>
                <option value="a4">A4</option>
              </select>
              <button
                type="button"
                data-testid="btn-print-compact"
                aria-label="Print compact version"
                onClick={() => printSpell("compact")}
                className="px-3 py-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                Print Compact
              </button>
              <button
                type="button"
                data-testid="btn-print-stat-block"
                aria-label="Print stat-block version"
                onClick={() => printSpell("stat-block")}
                className="px-3 py-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                Print Stat-block
              </button>
            </>
          )}
          {!isNew && (
            <button
              id="btn-delete-spell"
              data-testid="btn-delete-spell"
              type="button"
              onClick={handleDelete}
              className="px-3 py-2 text-red-400 hover:bg-neutral-800 rounded"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            data-testid="btn-cancel-edit"
            onClick={async () => {
              if (hasUnsavedState) {
                const ok = await modalConfirm(
                  "You have unsaved changes. Leave and discard?",
                  "Unsaved changes",
                );
                if (!ok) return;
                setHasUnsavedState(false);
                unsavedRef.current = false;
              }
              navigate("/");
            }}
            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded"
          >
            Cancel
          </button>
          <button
            id="btn-save-spell"
            data-testid="btn-save-spell"
            type="button"
            onClick={save}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold"
          >
            Save Spell
          </button>
        </div>
      </div>
      {printStatus && (
        <div className="text-xs text-neutral-400" data-testid="print-status-message">
          {printStatus}
        </div>
      )}

      {!isNew && form.contentHash && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400">Content hash:</span>
          <code
            className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 font-mono text-xs"
            data-testid="spell-detail-hash-display"
            title={form.contentHash}
          >
            {hashExpanded ? form.contentHash : `${form.contentHash.slice(0, 8)}...`}
          </code>
          <button
            type="button"
            data-testid="spell-detail-hash-copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(form.contentHash ?? "");
                await modalAlert("Hash copied to clipboard.", "Copied", "success");
              } catch {
                await modalAlert("Failed to copy hash.", "Copy Error", "error");
              }
            }}
            className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700"
          >
            Copy
          </button>
          <button
            type="button"
            data-testid="spell-detail-hash-expand"
            onClick={() => setHashExpanded((e) => !e)}
            className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700"
          >
            {hashExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="spell-name" className="block text-sm text-neutral-400">
            Name
          </label>
          <input
            id="spell-name"
            data-testid="spell-name-input"
            className={`w-full bg-neutral-900 border p-2 rounded ${
              isNameInvalid ? "border-red-500" : "border-neutral-700"
            }`}
            placeholder="Spell Name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
          {isNameInvalid && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-name-required">
              Name is required.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="spell-level" className="block text-sm text-neutral-400">
            Level
          </label>
          <input
            id="spell-level"
            data-testid="spell-level-input"
            className={`w-full bg-neutral-900 border p-2 rounded ${
              isLevelInvalid ? "border-red-500" : "border-neutral-700"
            }`}
            type="number"
            value={form.level}
            onChange={(e) => {
              const val = e.target.valueAsNumber;
              const clamped = Math.max(0, Math.min(12, Number.isNaN(val) ? 0 : Math.floor(val)));
              handleChange("level", clamped);
              if (clamped !== 0) handleChange("isCantrip", 0);
              if (clamped !== 8) handleChange("isQuestSpell", 0);
            }}
          />
          <div className="text-xs text-neutral-500 mt-1" data-testid="spell-level-display">
            {getLevelDisplay(form.level)}
          </div>
          <div className="flex gap-4 mt-2">
            <label
              className={`flex items-center gap-2 cursor-pointer group ${form.level !== 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                data-testid="chk-cantrip"
                disabled={form.level !== 0}
                checked={form.isCantrip === 1}
                onChange={(e) => handleChange("isCantrip", e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
              />
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300">Cantrip</span>
            </label>
            <label
              className={`flex items-center gap-2 cursor-pointer group ${form.level !== 8 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                data-testid="chk-quest"
                disabled={form.level !== 8}
                checked={form.isQuestSpell === 1}
                onChange={(e) => handleChange("isQuestSpell", e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
              />
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300">
                Quest Spell
              </span>
            </label>
          </div>
          {isLevelInvalid && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-level-range">
              Level must be 0-12.
            </p>
          )}
          {isEpicRestricted && (
            <p className="text-xs text-yellow-500 mt-1" data-testid="warning-epic-arcane">
              Epic levels (10-12) are Arcane only.
            </p>
          )}
          {isQuestRestricted && (
            <p className="text-xs text-yellow-500 mt-1" data-testid="warning-quest-divine">
              Quest spells are Divine only.
            </p>
          )}
          {isConflictRestricted && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-epic-quest-conflict">
              Cannot be both Epic and Quest spell.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="spell-tradition" className="block text-sm text-neutral-400">
            Tradition
          </label>
          <select
            id="spell-tradition"
            data-testid="spell-tradition-select"
            aria-label="Spell tradition"
            value={tradition}
            onChange={(e) => setTradition(e.target.value as Tradition)}
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
          >
            <option value="ARCANE">Arcane</option>
            <option value="DIVINE">Divine</option>
            <option value="BOTH">Both</option>
          </select>
        </div>
        <div>
          <label htmlFor="spell-school" className="block text-sm text-neutral-400">
            School
          </label>
          <input
            id="spell-school"
            data-testid="spell-school-input"
            className={`w-full bg-neutral-900 border p-2 rounded disabled:opacity-50 disabled:bg-neutral-800 ${(form.level >= 10 && !form.school && !getIsBothTradition()) || isArcaneMissingSchool || isBothMissingSchool ? "border-red-500" : "border-neutral-700"}`}
            value={form.school || ""}
            onChange={(e) => handleChange("school", e.target.value)}
          />
          {form.level >= 10 && !form.school && !getIsBothTradition() && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-school-required-arcane">
              School is required for Epic (Arcane) spells.
            </p>
          )}
          {isArcaneMissingSchool && (
            <p
              className="text-xs text-red-400 mt-1"
              data-testid="error-school-required-arcane-tradition"
            >
              School is required for Arcane tradition.
            </p>
          )}
          {isBothMissingSchool && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-school-required-both">
              School is required for Both tradition.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="spell-sphere" className="block text-sm text-neutral-400">
            Sphere
          </label>
          <input
            id="spell-sphere"
            data-testid="spell-sphere-input"
            className={`w-full bg-neutral-900 border p-2 rounded disabled:opacity-50 disabled:bg-neutral-800 ${(form.isQuestSpell === 1 && !form.sphere && !getIsBothTradition()) || isDivineMissingSphere || isBothMissingSphere ? "border-red-500" : "border-neutral-700"}`}
            value={form.sphere || ""}
            onChange={(e) => handleChange("sphere", e.target.value)}
          />
          {form.isQuestSpell === 1 && !form.sphere && !getIsBothTradition() && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-sphere-required-divine">
              Sphere is required for Quest (Divine) spells.
            </p>
          )}
          {isDivineMissingSphere && (
            <p
              className="text-xs text-red-400 mt-1"
              data-testid="error-sphere-required-divine-tradition"
            >
              Sphere is required for Divine tradition.
            </p>
          )}
          {isBothMissingSphere && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-sphere-required-both">
              Sphere is required for Both tradition.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="spell-classes" className="block text-sm text-neutral-400">
            Classes (e.g. Mage, Cleric)
          </label>
          <input
            id="spell-classes"
            data-testid="spell-classes-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.classList || ""}
            onChange={(e) => handleChange("classList", e.target.value)}
          />
        </div>
        {/* Add more fields as needed for MVP */}
        <div>
          <label htmlFor="spell-source" className="block text-sm text-neutral-400">
            Source
          </label>
          <input
            id="spell-source"
            data-testid="spell-source-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.source || ""}
            onChange={(e) => handleChange("source", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-edition" className="block text-sm text-neutral-400">
            Edition
          </label>
          <input
            id="spell-edition"
            data-testid="spell-edition-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.edition || ""}
            onChange={(e) => handleChange("edition", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-author" className="block text-sm text-neutral-400">
            Author
          </label>
          <input
            id="spell-author"
            data-testid="spell-author-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.author || ""}
            onChange={(e) => handleChange("author", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-license" className="block text-sm text-neutral-400">
            License
          </label>
          <input
            id="spell-license"
            data-testid="spell-license-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.license || ""}
            onChange={(e) => handleChange("license", e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="spell-reversible"
            data-testid="chk-reversible"
            type="checkbox"
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
            checked={Boolean(form.reversible)}
            onChange={(e) => handleChange("reversible", e.target.checked ? 1 : 0)}
          />
          <label htmlFor="spell-reversible" className="text-sm text-neutral-400">
            Reversible
          </label>
        </div>
      </div>

      <div>
        <span className="block text-sm text-neutral-400">Details</span>
        <div className="space-y-3 text-sm">
          {DETAIL_FIELD_ORDER.map((field) => {
            const label =
              field === "area"
                ? "Area of Effect"
                : field === "castingTime"
                  ? "Casting Time"
                  : field === "savingThrow"
                    ? "Saving Throw"
                    : field === "magicResistance"
                      ? "Magic Resistance"
                      : field === "materialComponents"
                        ? "Material Component"
                        : field.charAt(0).toUpperCase() + field.slice(1);
            const kebabField = field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
            const panelId = `detail-${kebabField}-panel`;
            const inputId = `detail-${field}-input`;
            const expandId = `detail-${field}-expand`;
            const value = form[field] ?? "";
            const isExpanded = expandedDetailField === field;
            const isLoading = detailLoading === field;
            const isSpecial =
              (field === "range" && structuredRange?.kind === "special") ||
              (field === "duration" && structuredDuration?.kind === "special") ||
              (field === "castingTime" &&
                (structuredCastingTime?.unit === "special" ||
                  !!structuredCastingTime?.rawLegacyValue)) ||
              (field === "area" && structuredArea?.kind === "special") ||
              (field === "damage" && !!structuredDamage?.rawLegacyValue) ||
              (field === "savingThrow" && structuredSavingThrow?.kind === "dm_adjudicated") ||
              (field === "magicResistance" && structuredMagicResistance?.kind === "special") ||
              (field === "materialComponents" && false); // Reserved: no "special" kind for material row today; shares component state

            return (
              <div key={field} className="flex flex-col gap-1">
                <label htmlFor={inputId} className="text-xs text-neutral-500">
                  {label}
                </label>
                <div className="flex flex-col gap-1">
                  <input
                    id={inputId}
                    data-testid={`detail-${kebabField}-input`}
                    type="text"
                    aria-label={label}
                    className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
                    value={String(value)}
                    onChange={(e) => handleChange(field, e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`detail-${kebabField}-expand`}
                      aria-expanded={isExpanded}
                      aria-controls={isExpanded ? panelId : undefined}
                      onClick={() =>
                        isExpanded ? collapseExpandedField() : expandDetailField(field)
                      }
                      className="text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                    {isSpecial && !isExpanded && (
                      <span
                        className="text-xs text-amber-500"
                        title="Stored as text; not fully structured for hashing"
                      >
                        (special)
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <section
                    ref={expandedPanelRef}
                    id={panelId}
                    aria-label={`Structured ${label}`}
                    tabIndex={-1}
                    className="mt-2 p-3 rounded border border-neutral-700 bg-neutral-900/80"
                  >
                    {isLoading ? (
                      <div
                        className="text-sm text-neutral-500"
                        data-testid={`detail-${kebabField}-loading`}
                      >
                        Loading…
                      </div>
                    ) : (
                      <>
                        {field === "range" && (
                          <StructuredFieldInput
                            fieldType="range"
                            value={structuredRange ?? undefined}
                            onChange={(spec) => {
                              setStructuredRange(spec as RangeSpec);
                              setDetailDirtyFor("range");
                            }}
                          />
                        )}
                        {(field === "components" || field === "materialComponents") && (
                          <ComponentCheckboxes
                            components={structuredComponents}
                            materialComponents={structuredMaterialComponents}
                            onChange={(comp, mats) => {
                              setStructuredComponents(comp);
                              setStructuredMaterialComponents(mats);
                              setDetailDirtyFor("components");
                              setDetailDirtyFor("materialComponents");
                            }}
                            onUncheckMaterialConfirm={() =>
                              modalConfirm("Clear all material component data?", "Uncheck Material")
                            }
                            variant="vsm"
                          />
                        )}
                        {field === "duration" && (
                          <StructuredFieldInput
                            fieldType="duration"
                            value={structuredDuration ?? undefined}
                            onChange={(spec) => {
                              setStructuredDuration(spec as DurationSpec);
                              setDetailDirtyFor("duration");
                            }}
                          />
                        )}
                        {field === "castingTime" && (
                          <StructuredFieldInput
                            fieldType="casting_time"
                            value={structuredCastingTime ?? undefined}
                            onChange={(spec) => {
                              setStructuredCastingTime(spec as SpellCastingTime);
                              setDetailDirtyFor("castingTime");
                            }}
                          />
                        )}
                        {field === "area" && (
                          <AreaForm
                            value={structuredArea ?? undefined}
                            onChange={(spec) => {
                              setStructuredArea(spec);
                              setDetailDirtyFor("area");
                            }}
                          />
                        )}
                        {field === "savingThrow" && (
                          <SavingThrowInput
                            value={structuredSavingThrow ?? undefined}
                            onChange={(spec) => {
                              setStructuredSavingThrow(spec);
                              setDetailDirtyFor("savingThrow");
                            }}
                          />
                        )}
                        {field === "damage" && (
                          <DamageForm
                            value={structuredDamage ?? undefined}
                            onChange={(spec) => {
                              setStructuredDamage(spec);
                              setDetailDirtyFor("damage");
                            }}
                          />
                        )}
                        {field === "magicResistance" && (
                          <MagicResistanceInput
                            value={structuredMagicResistance ?? undefined}
                            onChange={(spec) => {
                              setStructuredMagicResistance(spec);
                              setDetailDirtyFor("magicResistance");
                            }}
                          />
                        )}
                        {isSpecial && (
                          <p
                            className="mt-2 text-xs text-amber-500"
                            data-testid={`detail-${kebabField}-special-hint`}
                          >
                            Could not be fully parsed; original text preserved.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="spell-tags" className="block text-sm text-neutral-400">
          Tags
        </label>
        <textarea
          id="spell-tags"
          data-testid="spell-tags-input"
          className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded min-h-[80px]"
          placeholder="Comma-separated tags"
          value={form.tags || ""}
          onChange={(e) => handleChange("tags", e.target.value)}
        />
      </div>

      <div className="flex-1 flex flex-col">
        <label htmlFor="spell-description" className="block text-sm text-neutral-400">
          Description
        </label>
        <textarea
          id="spell-description"
          data-testid="spell-description-textarea"
          className={`w-full flex-1 bg-neutral-900 border p-2 rounded font-mono min-h-[200px] ${
            isDescriptionInvalid ? "border-red-500" : "border-neutral-700"
          }`}
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          required
        />
        {isDescriptionInvalid && (
          <p className="text-xs text-red-400 mt-1" data-testid="error-description-required">
            Description is required.
          </p>
        )}
      </div>

      {form.artifacts && form.artifacts.length > 0 && (
        <div className="bg-neutral-900/50 p-3 rounded-md border border-neutral-800 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-neutral-300">Provenance (Imports)</h3>
            <button
              type="button"
              data-testid="btn-reparse-artifact"
              aria-label="Reparse spell from artifact"
              onClick={async () => {
                if (!form.artifacts || form.artifacts.length === 0) return;
                const artifactId = form.artifacts[0].id;

                const confirmed = await modalConfirm(
                  "Re-parse this spell from the original artifact file? This will overwrite manual changes.",
                  "Reparse Spell",
                );
                if (!confirmed) return;

                try {
                  setLoading(true);
                  const updated = await invoke<SpellDetail>("reparse_artifact", { artifactId });
                  setForm(updated);
                  await modalAlert("Spell re-parsed successfully!", "Reparse Complete", "success");
                } catch (e) {
                  await modalAlert(`Reparse failed: ${e}`, "Reparse Error", "error");
                } finally {
                  setLoading(false);
                }
              }}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Reparse
            </button>
          </div>
          {form.artifacts?.map((art) => (
            <div key={art.id} className="text-xs space-y-1 text-neutral-500">
              <div className="flex justify-between">
                <span className="font-semibold text-neutral-400">
                  Type: {art.type.toUpperCase()}
                </span>
                <span>Imported: {new Date(art.importedAt).toLocaleString()}</span>
              </div>
              <div className="truncate">Path: {art.path}</div>
              <div className="font-mono text-[10px] opacity-70">SHA256: {art.hash}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
