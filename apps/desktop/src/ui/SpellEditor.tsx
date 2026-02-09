import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useModal } from "../store/useModal";
import {
  StructuredFieldInput,
  rangeToText,
  durationToText,
  castingTimeToText,
  AreaForm,
  DamageForm,
  SavingThrowInput,
  MagicResistanceInput,
  ComponentCheckboxes,
} from "./components/structured";
import {
  areaToText,
  damageToText,
  savingThrowToText,
  magicResistanceToText,
  componentsToText,
  defaultAreaSpec,
  defaultSpellDamageSpec,
  defaultSavingThrowSpec,
  defaultMagicResistanceSpec,
  type SpellComponents,
} from "../types/spell";
import type {
  RangeSpec,
  DurationSpec,
  SpellCastingTime,
  AreaSpec,
  SpellDamageSpec,
  DamagePart,
  SavingThrowSpec,
  SingleSave,
  MagicResistanceSpec,
  MaterialComponentSpec,
  SpellDetail,
  SpellCreate,
  DicePool,
  ApplicationScope,
  SaveKind,
  SaveType,
  SaveOutcomeEffect,
  ScalarMode,
} from "../types/spell";

// Mirrors SpellDetail struct from backend
// Scalars are normalized during canonicalization in the backend.

function normalizeScalar(o: unknown): { mode: ScalarMode; value?: number; perLevel?: number } | undefined {
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
    return {
      id: x.id as string,
      label: x.label as string,
      damageType: (x.damageType ?? x.damage_type) as string,
      base: (x.base ?? { terms: [{ count: 1, sides: 6 }], flatModifier: 0 }) as DicePool,
      application: app ? {
        scope: app.scope as ApplicationScope,
        ticks: app.ticks as number,
        tickDriver: (app.tickDriver ?? app.tick_driver) as string,
      } : undefined,
      save: sav ? {
        kind: sav.kind as SaveKind,
        partial: sav.partial as { numerator: number; denominator: number },
      } : undefined,
      mrInteraction: (x.mrInteraction ?? x.mr_interaction) as DamagePart["mrInteraction"],
      notes: x.notes as string,
    } as DamagePart;
  });
  return {
    kind: (d.kind as SpellDamageSpec["kind"]) ?? "none",
    combineMode: (d.combineMode ?? d.combine_mode) as SpellDamageSpec["combineMode"],
    parts: parts as SpellDamageSpec["parts"],
    dmGuidance: (d.dmGuidance ?? d.dm_guidance) as string,
    rawLegacyValue: (d.rawLegacyValue ?? d.raw_legacy_value) as string,
  } as SpellDamageSpec;
}

function normalizeSingleSave(s: unknown): SingleSave | undefined {
  if (!s || typeof s !== "object") return undefined;
  const x = s as Record<string, unknown>;
  return {
    id: x.id as string,
    saveType: (x.saveType ?? x.save_type) as SaveType,
    saveVs: (x.saveVs ?? x.save_vs) as string,
    modifier: (x.modifier as number) ?? 0,
    appliesTo: (x.appliesTo ?? x.applies_to) as string,
    timing: x.timing as string,
    onSuccess: (x.onSuccess ?? x.on_success) as SaveOutcomeEffect,
    onFailure: (x.onFailure ?? x.on_failure) as SaveOutcomeEffect,
  };
}

function normalizeSavingThrowSpec(s: Record<string, unknown>): SavingThrowSpec {
  return {
    kind: (s.kind as SavingThrowSpec["kind"]) ?? "none",
    single: normalizeSingleSave(s.single),
    multiple: (s.multiple as unknown[] | undefined)?.map(normalizeSingleSave).filter(Boolean) as SingleSave[],
    dmGuidance: (s.dmGuidance ?? s.dm_guidance) as string,
    notes: s.notes as string,
  } as SavingThrowSpec;
}

function normalizeMagicResistanceSpec(m: Record<string, unknown>): MagicResistanceSpec {
  return {
    kind: (m.kind as MagicResistanceSpec["kind"]) ?? "unknown",
    appliesTo: (m.appliesTo ?? m.applies_to) as MagicResistanceSpec["appliesTo"],
    partial: m.partial ? {
      scope: (m.partial as Record<string, unknown>).scope as string,
      partIds: ((m.partial as Record<string, unknown>).partIds ?? (m.partial as Record<string, unknown>).part_ids) as string[],
    } : undefined,
    specialRule: (m.specialRule ?? m.special_rule) as string,
    notes: m.notes as string,
  } as MagicResistanceSpec;
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
  const [structuredDuration, setStructuredDuration] =
    useState<DurationSpec | null>(null);
  const [structuredCastingTime, setStructuredCastingTime] =
    useState<SpellCastingTime | null>(null);
  const [structuredArea, setStructuredArea] = useState<AreaSpec | null>(null);
  const [structuredDamage, setStructuredDamage] =
    useState<SpellDamageSpec | null>(null);
  const [structuredSavingThrow, setStructuredSavingThrow] =
    useState<SavingThrowSpec | null>(null);
  const [structuredMagicResistance, setStructuredMagicResistance] =
    useState<MagicResistanceSpec | null>(null);
  const [structuredComponents, setStructuredComponents] =
    useState<SpellComponents | null>(null);
  const [structuredMaterialComponents, setStructuredMaterialComponents] =
    useState<MaterialComponentSpec[]>([]);
  const [hashExpanded, setHashExpanded] = useState(false);

  const isNew = id === "new";

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      invoke<SpellDetail>("get_spell", { id: Number.parseInt(id) })
        .then((data) => {
          if (data) {
            setForm(data);
            const fromCanonical = {
              range: false,
              duration: false,
              castingTime: false,
              area: false,
              damage: false,
              savingThrow: false,
              magicResistance: false,
              components: false,
            };
            if (data.canonicalData) {
              try {
                const canonical = JSON.parse(data.canonicalData) as {
                  range?: RangeSpec & { distance?: { per_level?: number }; raw_legacy_value?: string };
                  duration?: DurationSpec & { duration?: { per_level?: number }; raw_legacy_value?: string };
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
                if (canonical.range) {
                  const r = canonical.range;
                  setStructuredRange({
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
                  });
                  fromCanonical.range = true;
                }
                if (canonical.duration) {
                  const d = canonical.duration;
                  setStructuredDuration({
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
                  });
                  fromCanonical.duration = true;
                }
                if (canonical.casting_time) {
                  const c = canonical.casting_time as SpellCastingTime & {
                    base_value?: number;
                    per_level?: number;
                    level_divisor?: number;
                    raw_legacy_value?: string;
                  };
                  setStructuredCastingTime({
                    text: c.text ?? "",
                    unit: c.unit,
                    baseValue: c.baseValue ?? c.base_value,
                    perLevel: c.perLevel ?? c.per_level ?? 0,
                    levelDivisor: c.levelDivisor ?? c.level_divisor ?? 1,
                    rawLegacyValue: c.rawLegacyValue ?? c.raw_legacy_value,
                  });
                  fromCanonical.castingTime = true;
                }
                if (canonical.area) {
                  setStructuredArea(normalizeAreaSpec(canonical.area as unknown as Record<string, unknown>));
                  fromCanonical.area = true;
                }
                if (canonical.damage) {
                  setStructuredDamage(normalizeDamageSpec(canonical.damage as unknown as Record<string, unknown>));
                  fromCanonical.damage = true;
                }
                if (canonical.saving_throw) {
                  setStructuredSavingThrow(normalizeSavingThrowSpec(canonical.saving_throw as unknown as Record<string, unknown>));
                  fromCanonical.savingThrow = true;
                }
                if (canonical.magic_resistance) {
                  setStructuredMagicResistance(normalizeMagicResistanceSpec(canonical.magic_resistance as unknown as Record<string, unknown>));
                  fromCanonical.magicResistance = true;
                }
                if (canonical.components || (canonical.material_components && canonical.material_components.length > 0)) {
                  const comp = canonical.components
                    ? {
                      verbal: canonical.components.verbal ?? false,
                      somatic: canonical.components.somatic ?? false,
                      material: canonical.components.material ?? false,
                      focus: canonical.components.focus ?? false,
                      divineFocus: canonical.components.divine_focus ?? false,
                      experience: canonical.components.experience ?? false,
                    }
                    : { verbal: false, somatic: false, material: true, focus: false, divineFocus: false, experience: false };
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
                  fromCanonical.components = true;
                }
              } catch {
                // ignore parse error, fall back to legacy
              }
            }
            if (!fromCanonical.range) {
              if (data.range) {
                invoke<RangeSpec>("parse_spell_range", { legacy: data.range })
                  .then((parsed) => setStructuredRange(parsed as RangeSpec))
                  .catch(() => setStructuredRange(null));
              } else {
                setStructuredRange(null);
              }
            }
            if (!fromCanonical.duration) {
              if (data.duration) {
                invoke<DurationSpec>("parse_spell_duration", { legacy: data.duration })
                  .then((parsed) => setStructuredDuration(parsed as DurationSpec))
                  .catch(() => setStructuredDuration(null));
              } else {
                setStructuredDuration(null);
              }
            }
            if (!fromCanonical.castingTime) {
              if (data.castingTime) {
                invoke<SpellCastingTime>("parse_spell_casting_time", {
                  legacy: data.castingTime,
                })
                  .then((parsed) => setStructuredCastingTime(parsed as SpellCastingTime))
                  .catch(() => setStructuredCastingTime(null));
              } else {
                setStructuredCastingTime(null);
              }
            }
            if (!fromCanonical.area) {
              if (data.area) {
                invoke<AreaSpec | null>("parse_spell_area", { legacy: data.area })
                  .then((parsed) => setStructuredArea(parsed ?? defaultAreaSpec()))
                  .catch(() => setStructuredArea(null));
              } else {
                setStructuredArea(null);
              }
            }
            if (!fromCanonical.damage) {
              if (data.damage) {
                invoke<SpellDamageSpec>("parse_spell_damage", { legacy: data.damage })
                  .then((parsed) => setStructuredDamage(parsed as SpellDamageSpec))
                  .catch(() => setStructuredDamage(null));
              } else {
                setStructuredDamage(defaultSpellDamageSpec());
              }
            }
            if (!fromCanonical.savingThrow) {
              if (data.savingThrow) {
                setStructuredSavingThrow({
                  kind: "dm_adjudicated",
                  dmGuidance: data.savingThrow,
                });
              } else {
                setStructuredSavingThrow(defaultSavingThrowSpec());
              }
            }
            if (!fromCanonical.magicResistance) {
              if (data.magicResistance) {
                setStructuredMagicResistance({
                  kind: "special",
                  specialRule: data.magicResistance,
                });
              } else {
                setStructuredMagicResistance(defaultMagicResistanceSpec());
              }
            }
            if (!fromCanonical.components) {
              if (data.components) {
                invoke<SpellComponents>("parse_spell_components", {
                  legacy: data.components,
                })
                  .then((parsed) => {
                    setStructuredComponents({
                      verbal: parsed.verbal ?? false,
                      somatic: parsed.somatic ?? false,
                      material: parsed.material ?? false,
                      focus: parsed.focus ?? false,
                      divineFocus: parsed.divineFocus ?? false,
                      experience: parsed.experience ?? false,
                    });
                    if (data.materialComponents && parsed.material) {
                      setStructuredMaterialComponents([
                        { name: data.materialComponents, quantity: 1 },
                      ]);
                    } else {
                      setStructuredMaterialComponents([]);
                    }
                  })
                  .catch(() => {
                    setStructuredComponents(null);
                    setStructuredMaterialComponents([]);
                  });
              } else {
                setStructuredComponents(null);
                setStructuredMaterialComponents([]);
              }
            }
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const handleChange = (field: keyof SpellDetail, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isNameInvalid = !form.name.trim();
  const isDescriptionInvalid = !form.description.trim();
  const isLevelInvalid = Number.isNaN(form.level) || form.level < 0 || form.level > 12;

  const isArcane = !!form.school?.trim();
  const isDivine = !!form.sphere?.trim();
  const isBothTradition = isArcane && isDivine;

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

  // BOTH tradition validation: when tradition = BOTH (both fields non-empty), require both to be non-empty
  // This validates that if a spell has BOTH tradition, both school and sphere must be present
  const schoolTrimmed = form.school?.trim() || "";
  const sphereTrimmed = form.sphere?.trim() || "";

  // Check if both fields exist in form (user has interacted with both, indicating potential BOTH tradition)
  const schoolExists = form.school !== undefined;
  const sphereExists = form.sphere !== undefined;
  const bothFieldsExist = schoolExists && sphereExists;

  // Validate: if both fields exist in form and one is non-empty while the other is empty,
  // that's invalid for BOTH tradition (user has entered both but one is missing)
  // This handles the case where user starts with BOTH tradition but clears one field
  const isBothTraditionMissingSchool = bothFieldsExist && schoolTrimmed === "" && sphereTrimmed !== "";
  const isBothTraditionMissingSphere = bothFieldsExist && sphereTrimmed === "" && schoolTrimmed !== "";

  const validationErrors = [
    isNameInvalid && "Name is required",
    isDescriptionInvalid && "Description is required",
    isLevelInvalid && "Level must be between 0 and 12",
    isEpicRestricted && "Levels 10-12 are Arcane (has School) only",
    isQuestRestricted && "Quest spells are Divine (has Sphere) only",
    isConflictRestricted && "A spell cannot be both Epic and Quest",
    isCantripRestricted && "Cantrips must be Level 0",
    isBothTraditionMissingSchool && "School is required for BOTH tradition spells",
    isBothTraditionMissingSphere && "Sphere is required for BOTH tradition spells",
  ].filter(Boolean) as string[];

  const specialFallbackFields = [
    structuredRange?.kind === "special" && "Range",
    structuredDuration?.kind === "special" && "Duration",
    structuredCastingTime?.rawLegacyValue && "Casting time",
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

      const comp = structuredComponents ?? {
        verbal: false, somatic: false, material: false,
        focus: false, divineFocus: false, experience: false
      };
      const { components: compStrBase, materialComponents: matStr } = componentsToText(
        comp,
        structuredMaterialComponents,
      );

      // Preserve experience cost from original string if present but not in structured text
      let compStr = compStrBase;
      if (comp.experience && form.components && !compStr.toLowerCase().includes("xp")) {
        const xpMatch = form.components.match(/(\d+\s*(?:xp|gp|exp|gold))/i);
        if (xpMatch) {
          compStr = `${compStr}, ${xpMatch[0]}`;
        }
      }

      const spellData: SpellDetail = {
        ...form,
        range: structuredRange ? rangeToText(structuredRange) : form.range,
        rangeSpec: structuredRange ?? undefined,
        duration: structuredDuration ? durationToText(structuredDuration) : form.duration,
        durationSpec: structuredDuration ?? undefined,
        castingTime: structuredCastingTime ? castingTimeToText(structuredCastingTime) : form.castingTime,
        castingTimeSpec: structuredCastingTime ?? undefined,
        area: structuredArea ? areaToText(structuredArea) : form.area,
        areaSpec: structuredArea ?? undefined,
        damage: structuredDamage ? damageToText(structuredDamage) : form.damage,
        damageSpec: structuredDamage ?? undefined,
        savingThrow: structuredSavingThrow ? savingThrowToText(structuredSavingThrow) : form.savingThrow,
        savingThrowSpec: structuredSavingThrow ?? undefined,
        magicResistance: structuredMagicResistance
          ? magicResistanceToText(structuredMagicResistance)
          : form.magicResistance,
        magicResistanceSpec: structuredMagicResistance ?? undefined,
        components: compStr || form.components,
        componentsSpec: comp,
        materialComponents: matStr || form.materialComponents,
        materialComponentsSpec: structuredMaterialComponents,
      };

      if (isNew) {
        const { id, ...createData } = spellData; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("create_spell", { spell: createData });
      } else {
        const { artifacts, ...updateData } = spellData; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("update_spell", { spell: updateData });
      }
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
                onClick={() => printSpell("compact")}
                className="px-3 py-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                Print Compact
              </button>
              <button
                type="button"
                data-testid="btn-print-stat-block"
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
            onClick={() => navigate("/")}
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

      {hasSpecialFallback && (
        <div
          role="alert"
          className="rounded border border-amber-600/50 bg-amber-600/10 px-3 py-2 text-sm text-amber-200"
          data-testid="spell-editor-special-fallback-banner"
        >
          {specialFallbackMessage}
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
            className={`w-full bg-neutral-900 border p-2 rounded ${isNameInvalid ? "border-red-500" : "border-neutral-700"
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
            className={`w-full bg-neutral-900 border p-2 rounded ${isLevelInvalid ? "border-red-500" : "border-neutral-700"
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
          <label htmlFor="spell-school" className="block text-sm text-neutral-400">
            School
          </label>
          <input
            id="spell-school"
            data-testid="spell-school-input"
            className={`w-full bg-neutral-900 border p-2 rounded disabled:opacity-50 disabled:bg-neutral-800 ${isBothTraditionMissingSchool ? "border-red-500" : "border-neutral-700"
              }`}
            value={form.school || ""}
            disabled={sphereTrimmed !== "" && schoolTrimmed === "" && form.school === undefined}
            onChange={(e) => handleChange("school", e.target.value)}
          />
          {sphereTrimmed !== "" && schoolTrimmed === "" && form.school === undefined && (
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">Disabled for Divine-only spells (enter School to enable BOTH tradition)</p>
          )}
          {form.level >= 10 && !form.school && !isBothTradition && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-school-required-arcane">
              School is required for Epic (Arcane) spells.
            </p>
          )}
          {isBothTraditionMissingSchool && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-school-required-both">
              School is required for BOTH tradition spells.
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
            className={`w-full bg-neutral-900 border p-2 rounded disabled:opacity-50 disabled:bg-neutral-800 ${isBothTraditionMissingSphere ? "border-red-500" : "border-neutral-700"
              }`}
            value={form.sphere || ""}
            disabled={schoolTrimmed !== "" && sphereTrimmed === "" && form.sphere === undefined}
            onChange={(e) => handleChange("sphere", e.target.value)}
          />
          {schoolTrimmed !== "" && sphereTrimmed === "" && form.sphere === undefined && (
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">Disabled for Arcane-only spells (enter Sphere to enable BOTH tradition)</p>
          )}
          {form.isQuestSpell === 1 && !form.sphere && !isBothTradition && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-sphere-required-divine">
              Sphere is required for Quest (Divine) spells.
            </p>
          )}
          {isBothTraditionMissingSphere && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-sphere-required-both">
              Sphere is required for BOTH tradition spells.
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
      </div>

      <div>
        <span className="block text-sm text-neutral-400">Details</span>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Range</span>
            <StructuredFieldInput
              fieldType="range"
              value={structuredRange ?? undefined}
              onChange={(spec) => {
                const r = spec as RangeSpec;
                setStructuredRange(r);
                handleChange("range", rangeToText(r));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Components</span>
            <ComponentCheckboxes
              components={structuredComponents}
              materialComponents={structuredMaterialComponents}
              onChange={(comp, mats) => {
                setStructuredComponents(comp);
                setStructuredMaterialComponents(mats);
                const { components: cs, materialComponents: ms } = componentsToText(comp, mats);
                handleChange("components", cs);
                handleChange("materialComponents", ms);
              }}
              onUncheckMaterialConfirm={() =>
                modalConfirm(
                  "Clear all material component data?",
                  "Uncheck Material",
                )
              }
            />
          </div>
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 p-2 rounded">
            <input
              id="spell-reversible"
              data-testid="chk-reversible"
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(form.reversible)}
              onChange={(e) => handleChange("reversible", e.target.checked ? 1 : 0)}
            />
            <label htmlFor="spell-reversible" className="text-xs text-neutral-400">
              Reversible
            </label>
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Duration</span>
            <StructuredFieldInput
              fieldType="duration"
              value={structuredDuration ?? undefined}
              onChange={(spec) => {
                const d = spec as DurationSpec;
                setStructuredDuration(d);
                handleChange("duration", durationToText(d));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Casting Time</span>
            <StructuredFieldInput
              fieldType="casting_time"
              value={structuredCastingTime ?? undefined}
              onChange={(spec) => {
                const c = spec as SpellCastingTime;
                setStructuredCastingTime(c);
                handleChange("castingTime", castingTimeToText(c));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Area</span>
            <AreaForm
              value={structuredArea ?? undefined}
              onChange={(spec) => {
                setStructuredArea(spec);
                handleChange("area", areaToText(spec));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Saving Throw</span>
            <SavingThrowInput
              value={structuredSavingThrow ?? undefined}
              onChange={(spec) => {
                setStructuredSavingThrow(spec);
                handleChange("savingThrow", savingThrowToText(spec));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Damage</span>
            <DamageForm
              value={structuredDamage ?? undefined}
              onChange={(spec) => {
                setStructuredDamage(spec);
                handleChange("damage", damageToText(spec));
              }}
            />
          </div>
          <div className="col-span-1 flex flex-col">
            <span className="text-xs text-neutral-500 mb-0.5">Magic Resistance</span>
            <MagicResistanceInput
              value={structuredMagicResistance ?? undefined}
              onChange={(spec) => {
                setStructuredMagicResistance(spec);
                handleChange("magicResistance", magicResistanceToText(spec));
              }}
            />
          </div>
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
          className={`w-full flex-1 bg-neutral-900 border p-2 rounded font-mono min-h-[200px] ${isDescriptionInvalid ? "border-red-500" : "border-neutral-700"
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
