import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  validateAreaSpec,
  validateDurationSpec,
  validateRangeSpec,
  validateSpellCastingTime,
  validateSpellDamageSpec,
} from "../lib/parserValidation";
import { useNotifications } from "../store/useNotifications";
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
  AreaSpec,
  DurationSpec,
  MagicResistanceSpec,
  MaterialComponentSpec,
  RangeSpec,
  SavingThrowSpec,
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
import ArtifactRow from "./components/ArtifactRow";
import { WarningBanner } from "./components/WarningBanner";
import { spellbookE2EHarness } from "./spellbookE2EHarness";
import {
  emptySpellComponents,
  getParserFallbackLabel,
  getSpellFocusVisibleRing,
  inferSpellComponentsFromLegacy,
  mapLegacyMagicResistance,
  mapLegacySavingThrow,
  toSpecialAreaSpec,
  toSpecialCastingTimeSpec,
  toSpecialDurationSpec,
  toSpecialRangeSpec,
  toV2SpellDamageSpec,
  toV2SavingThrowSpec,
  useSpellParser,
  validateMagicResistanceSpecShape,
  validateSavingThrowSpecShape,
} from "./hooks/useSpellParser";
import { useSpellPersistence } from "./hooks/useSpellPersistence";
import {
  deriveSpellEditorFieldErrors,
  sortFieldErrorsByFocusOrder,
  SPELL_EDITOR_AREA_SCALAR_KEYS,
  type SpellEditorValidatedFieldKey,
} from "./spellEditorValidation";

const spellInputSurface =
  "rounded border bg-white p-2 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100";
const spellInputBorderOk = "border-neutral-500 dark:border-neutral-700";
const spellInputBorderInvalid = "border-red-600 dark:border-red-600";
const spellFocusVisibleRing =
  "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900";
const spellLabelClass = "block text-sm text-neutral-600 dark:text-neutral-400";
const spellErrorText = "text-xs text-red-700 dark:text-red-400 mt-1";
const spellSaveHintClass = "text-right text-xs text-red-700 dark:text-red-400";
const spellConflictBannerClass =
  "mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
const spellHeaderSelectClass =
  "rounded border border-neutral-500 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const spellHeaderSecondaryActionClass =
  "rounded border border-neutral-500 bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";
const spellSaveDisabledContrastClass =
  "disabled:bg-blue-300 disabled:text-blue-950 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400";
const spellSaveDisabledContrastGuard = "save-spell-reviewed-v1";
const spellSectionHeadingClass = "block text-sm text-neutral-500 dark:text-neutral-400";

type DetailTextOverrides = Partial<Pick<SpellDetail, DetailFieldKey>>;

function createEmptySpellForm(): SpellDetail {
  return {
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
  };
}

export default function SpellEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const isVisualContractMode = spellbookE2EHarness.spellEditor.isVisualContractMode();
  const pushNotification = useNotifications((state) => state.pushNotification);
  const [form, setForm] = useState<SpellDetail>(() => createEmptySpellForm());
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
  type Tradition = "ARCANE" | "DIVINE";
  const [tradition, setTradition] = useState<Tradition>("ARCANE");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldValidationVisible, setFieldValidationVisible] = useState(() => new Set<string>());
  const [reparsePending, setReparsePending] = useState(false);

  const revealFieldValidation = useCallback((...keys: SpellEditorValidatedFieldKey[]) => {
    setFieldValidationVisible((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }, []);

  const revealRangeScalarValidation = useCallback(() => {
    revealFieldValidation("range-base-value", "range-per-level");
  }, [revealFieldValidation]);

  const revealDurationScalarValidation = useCallback(() => {
    revealFieldValidation(
      "duration-base-value",
      "duration-per-level",
      "duration-uses-value",
      "duration-uses-per-level",
    );
  }, [revealFieldValidation]);

  const revealCastingTimeScalarValidation = useCallback(() => {
    revealFieldValidation("casting-time-base-value", "casting-time-per-level");
  }, [revealFieldValidation]);

  const revealAreaScalarValidation = useCallback(() => {
    revealFieldValidation(...SPELL_EDITOR_AREA_SCALAR_KEYS);
  }, [revealFieldValidation]);

  /** Canon-first: which detail field is expanded (only one at a time unless the visual contract hook is active). */
  const [expandedDetailField, setExpandedDetailField] = useState<DetailFieldKey | null>(null);
  /** Canon-first: per-field dirty since last canonical text edit. */
  const [detailDirty, setDetailDirty] = useState<Record<DetailFieldKey, boolean>>(() =>
    createDefaultDetailDirty(),
  );
  const [suppressExpandParse, setSuppressExpandParse] = useState<
    Partial<Record<DetailFieldKey, boolean>>
  >({});
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
  const {
    hydrateSpell,
    parsersPending,
    setParsersPending,
    parserFallbackFields,
    setParserFallbackFields,
  } = useSpellParser();
  const parserFallbackFieldsRef = useRef<Set<string>>(new Set());
  parserFallbackFieldsRef.current = parserFallbackFields;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsavedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const blocker = useBlocker(hasUnsavedState);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  /** Focus management: on expand focus first focusable in panel; on collapse focus the expand button. */
  const prevExpandedDetailRef = useRef<DetailFieldKey | null>(null);
  const resetEditorUiState = useCallback(() => {
    setHashExpanded(false);
    setHasExpandedComponentsEdit(false);
    setExpandedDetailField(null);
    setDetailLoading(null);
    setDetailDirty(createDefaultDetailDirty());
    setSuppressExpandParse({});
    setParsersPending(false);
    setParserFallbackFields(new Set());
    setHasAttemptedSubmit(false);
    setFieldValidationVisible(new Set());
    setHasUnsavedState(false);
    unsavedRef.current = false;
    expandedDetailRef.current = null;
    prevExpandedDetailRef.current = null;
  }, [setParserFallbackFields, setParsersPending]);

  const resetStructuredLoadState = useCallback(() => {
    setForm(createEmptySpellForm());
    setTradition("ARCANE");
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
    resetEditorUiState();
  }, [resetEditorUiState]);

  const handleLoadSuccess = useCallback(
    (data: SpellDetail, isActive: () => boolean) => {
      setForm(data);
      const hasSchool = !!data.school?.trim();
      const hasSphere = !!data.sphere?.trim();
      setTradition(hasSchool ? "ARCANE" : hasSphere ? "DIVINE" : "ARCANE");
      hydrateSpell(data, isActive, {
        setStructuredRange,
        setStructuredDuration,
        setStructuredCastingTime,
        setStructuredArea,
        setStructuredDamage,
        setStructuredSavingThrow,
        setStructuredMagicResistance,
        setStructuredComponents,
        setStructuredMaterialComponents,
        setHasLoadedMaterialComponentsSpec,
        setHasLoadedSavingThrowSpec,
        setHasLoadedMagicResistanceSpec,
        setSuppressExpandParse,
      });

      unsavedRef.current = false;
      setHasUnsavedState(false);
    },
    [hydrateSpell],
  );

  const {
    loading,
    showLoading,
    loadError,
    requestedSpellId,
    savePending,
    saveShowsDelayedLabel,
    saveSpell,
    deleteSpell,
  } = useSpellPersistence({
    id,
    isNew,
    resetEditorUiState,
    resetStructuredLoadState,
    onLoadSuccess: handleLoadSuccess,
  });
  const hasRequestedSpellLoaded = requestedSpellId === null || form.id === requestedSpellId;

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
    const hasBannerActive = parserFallbackFieldsRef.current.size > 0;
    const message = hasBannerActive
      ? "You have unparsed fields. Navigating away will discard your current editor state. Continue?"
      : "You have unsaved changes. Leave and discard?";
    const title = hasBannerActive ? "Unparsed fields" : "Unsaved changes";
    modalConfirm(message, title).then((ok) => {
      if (ok) {
        unsavedRef.current = false;
        setHasUnsavedState(false);
        b.proceed?.();
      } else {
        b.reset?.();
      }
    });
  }, [blocker.state, modalConfirm]);

  const handleChange = (field: keyof SpellDetail, value: string | number) => {
    if (savePending) return;
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
      setDetailDirty((prev) => {
        if (field === "components" || field === "materialComponents") {
          return {
            ...prev,
            components: false,
            materialComponents: false,
          };
        }
        return { ...prev, [field]: false };
      });
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
      // Dismiss parser fallback when user edits the field directly
      const fallbackLabel = getParserFallbackLabel(detailField);
      setParserFallbackFields((prev) => {
        const next = new Set(prev);
        next.delete(fallbackLabel);
        return next;
      });
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
    setParsersPending(true);
    const legacy = getLegacy();

    try {
      switch (field) {
        case "range": {
          const parsed = await invoke<RangeSpec>("parse_spell_range", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateRangeSpec(parsed)) {
            setStructuredRange(toSpecialRangeSpec(legacy));
            setParserFallbackFields((prev) => new Set([...prev, "Range"]));
          } else {
            setStructuredRange(parsed);
            if (parsed.kind === "special")
              setParserFallbackFields((prev) => new Set([...prev, "Range"]));
          }
          break;
        }
        case "duration": {
          const parsed = await invoke<DurationSpec>("parse_spell_duration", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateDurationSpec(parsed)) {
            setStructuredDuration(toSpecialDurationSpec(legacy));
            setParserFallbackFields((prev) => new Set([...prev, "Duration"]));
          } else {
            setStructuredDuration(parsed);
            if (parsed.kind === "special")
              setParserFallbackFields((prev) => new Set([...prev, "Duration"]));
          }
          break;
        }
        case "castingTime": {
          const parsed = await invoke<SpellCastingTime>("parse_spell_casting_time", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateSpellCastingTime(parsed)) {
            setStructuredCastingTime(toSpecialCastingTimeSpec(legacy));
            setParserFallbackFields((prev) => new Set([...prev, "Casting time"]));
          } else {
            setStructuredCastingTime(parsed);
            if (parsed.unit === "special")
              setParserFallbackFields((prev) => new Set([...prev, "Casting time"]));
          }
          break;
        }
        case "area": {
          const parsed = await invoke<AreaSpec | null>("parse_spell_area", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (parsed === null || !validateAreaSpec(parsed)) {
            setStructuredArea(toSpecialAreaSpec(legacy));
            setParserFallbackFields((prev) => new Set([...prev, "Area"]));
          } else {
            setStructuredArea(parsed);
            if (parsed.kind === "special")
              setParserFallbackFields((prev) => new Set([...prev, "Area"]));
          }
          break;
        }
        case "damage": {
          const parsed = await invoke<SpellDamageSpec>("parse_spell_damage", { legacy });
          if (requestId !== expandRequestId.current) return;
          if (!validateSpellDamageSpec(parsed)) {
            // Parser failure: kind "none" with sourceText; does NOT trigger warning banner.
            setStructuredDamage({ kind: "none", sourceText: legacy });
          } else {
            setStructuredDamage(parsed);
          }
          break;
        }
        case "savingThrow":
          if (requestId !== expandRequestId.current) return;
          {
            const stResult = mapLegacySavingThrow(legacy);
            setStructuredSavingThrow(stResult);
            if (stResult.kind === "dm_adjudicated") {
              setParserFallbackFields((prev) => new Set([...prev, "Saving throw"]));
            }
          }
          break;
        case "magicResistance":
          if (requestId !== expandRequestId.current) return;
          {
            const mrResult = mapLegacyMagicResistance(legacy);
            setStructuredMagicResistance(mrResult);
            if (mrResult.kind === "special") {
              setParserFallbackFields((prev) => new Set([...prev, "Magic resistance"]));
            }
          }
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
          setParserFallbackFields((prev) => new Set([...prev, "Range"]));
          break;
        case "duration":
          setStructuredDuration(toSpecialDurationSpec(leg));
          setParserFallbackFields((prev) => new Set([...prev, "Duration"]));
          break;
        case "castingTime":
          setStructuredCastingTime(toSpecialCastingTimeSpec(leg));
          setParserFallbackFields((prev) => new Set([...prev, "Casting time"]));
          break;
        case "area":
          setStructuredArea(toSpecialAreaSpec(leg));
          setParserFallbackFields((prev) => new Set([...prev, "Area"]));
          break;
        case "damage":
          // Parser failure: kind "none" with sourceText; does NOT trigger warning banner.
          setStructuredDamage({ kind: "none", sourceText: leg });
          break;
        case "savingThrow": {
          const stResult = mapLegacySavingThrow(leg);
          setStructuredSavingThrow(stResult);
          if (stResult.kind === "dm_adjudicated") {
            setParserFallbackFields((prev) => new Set([...prev, "Saving throw"]));
          }
          break;
        }
        case "magicResistance": {
          const mrResult = mapLegacyMagicResistance(leg);
          setStructuredMagicResistance(mrResult);
          if (mrResult.kind === "special") {
            setParserFallbackFields((prev) => new Set([...prev, "Magic resistance"]));
          }
          break;
        }
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
      setParsersPending(false);
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

  const isArcane = !!form.school?.trim();
  const isDivine = !!form.sphere?.trim();

  const getLevelDisplay = (level: number) => {
    if (level === 0 && form.isCantrip) return "Cantrip";
    if (level >= 10 && isArcane) {
      const circle = level === 10 ? "10th" : level === 11 ? "11th" : "12th";
      return `${circle} Circle`;
    }
    if (level === 8 && form.isQuestSpell) return "Quest";
    return `Level ${level}`;
  };

  const fieldErrors = deriveSpellEditorFieldErrors({
    form: {
      name: form.name,
      description: form.description,
      level: form.level,
      school: form.school,
      sphere: form.sphere,
      classList: form.classList,
      isQuestSpell: form.isQuestSpell,
      isCantrip: form.isCantrip,
    },
    tradition,
    rangeSpec: structuredRange,
    durationSpec: structuredDuration,
    castingTimeSpec: structuredCastingTime,
    areaSpec: structuredArea,
  });
  const isInvalid = fieldErrors.length > 0;

  const visibleFieldErrors = useMemo(() => {
    if (hasAttemptedSubmit) return fieldErrors;
    return fieldErrors.filter((e) => {
      if (e.testId === "error-tradition-conflict") return true;
      return fieldValidationVisible.has(e.field);
    });
  }, [fieldErrors, fieldValidationVisible, hasAttemptedSubmit]);

  const hasFieldError = (testId: string) => visibleFieldErrors.some((e) => e.testId === testId);
  const isNameInvalid = hasFieldError("spell-name-error");
  const isDescriptionInvalid = hasFieldError("error-description-required");
  const isLevelInvalid = hasFieldError("error-level-range");
  const hasLevelColumnSchoolSphereMessages =
    hasFieldError("error-epic-level-arcane-only") || hasFieldError("error-quest-spell-divine-only");
  const isArcaneMissingSchool = hasFieldError("error-school-required-arcane-tradition");
  const isDivineMissingSphere = hasFieldError("error-sphere-required-divine-tradition");
  const isFieldInvalid = (field: SpellEditorValidatedFieldKey) =>
    visibleFieldErrors.some((e) => e.field === field);
  const isLevelControlInvalid = isFieldInvalid("spell-level") || hasLevelColumnSchoolSphereMessages;
  const showSchoolField = tradition === "ARCANE" || isFieldInvalid("spell-school");
  const showSphereField = tradition === "DIVINE" || isFieldInvalid("spell-sphere");

  const describedByByField = useMemo(() => {
    const m = new Map<SpellEditorValidatedFieldKey, string>();
    for (const e of visibleFieldErrors) {
      const prev = m.get(e.field);
      m.set(e.field, prev ? `${prev} ${e.testId}` : e.testId);
    }
    const levelParts: string[] = [];
    const levelBase = m.get("spell-level");
    if (levelBase) levelParts.push(...levelBase.split(" "));
    if (visibleFieldErrors.some((e) => e.testId === "error-epic-level-arcane-only")) {
      levelParts.push("error-epic-level-arcane-only");
    }
    if (visibleFieldErrors.some((e) => e.testId === "error-quest-spell-divine-only")) {
      levelParts.push("error-quest-spell-divine-only");
    }
    levelParts.push("spell-level-display");
    m.set("spell-level", levelParts.join(" "));
    return m;
  }, [visibleFieldErrors]);

  const ariaInvalidForField = (field: SpellEditorValidatedFieldKey) =>
    isFieldInvalid(field) ? ("true" as const) : undefined;

  const detailFieldForFocusTarget = useCallback((focusTarget: string): DetailFieldKey | null => {
    if (focusTarget.startsWith("range-")) return "range";
    if (focusTarget.startsWith("duration-")) return "duration";
    if (focusTarget.startsWith("casting-time-")) return "castingTime";
    if (focusTarget.startsWith("area-form-")) return "area";
    if (focusTarget.startsWith("damage-form-")) return "damage";
    if (focusTarget.startsWith("saving-throw-")) return "savingThrow";
    if (focusTarget.startsWith("magic-resistance-")) return "magicResistance";
    return null;
  }, []);

  const save = async () => {
    if (loadError || (!isNew && !hasRequestedSpellLoaded)) return;
    if (isInvalid) {
      setHasAttemptedSubmit(true);
      const sorted = sortFieldErrorsByFocusOrder(fieldErrors);
      const firstError = sorted[0];
      const needsPanelExpansion =
        firstError && !(document.getElementById(firstError.focusTarget) instanceof HTMLElement);
      const detailField = firstError ? detailFieldForFocusTarget(firstError.focusTarget) : null;

      if (needsPanelExpansion && detailField) {
        await expandDetailField(detailField);
      }

      requestAnimationFrame(() => {
        for (const err of sorted) {
          const el = document.getElementById(err.focusTarget);
          if (el instanceof HTMLElement) {
            el.focus({ preventScroll: false });
            break;
          }
        }
      });
      return;
    }
    if (loading || parsersPending || savePending) return;

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

    // Save path always emits v2-shaped canonical_data:
    // - SavingThrowSpec: no dm_guidance field (removed in v2 schema)
    // - SpellDamageSpec: sourceText not rawLegacyValue
    const v2DamageSpec = validDamageSpec ? toV2SpellDamageSpec(validDamageSpec) : undefined;
    const v2SavingThrowSpec =
      shouldSendSavingThrowSpec && validSavingThrowSpec
        ? toV2SavingThrowSpec(validSavingThrowSpec)
        : undefined;

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
      damageSpec: v2DamageSpec,
      savingThrow: formOverrides.savingThrow ?? form.savingThrow,
      savingThrowSpec: v2SavingThrowSpec,
      magicResistance: formOverrides.magicResistance ?? form.magicResistance,
      magicResistanceSpec: shouldSendMagicResistanceSpec ? validMagicResistanceSpec : undefined,
      components: formOverrides.components ?? form.components,
      materialComponents: formOverrides.materialComponents ?? form.materialComponents,
    };

    const normalizedSchool = (spellData.school ?? "").trim();
    const normalizedSphere = (spellData.sphere ?? "").trim();
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

    const normalizedSpellData: SpellDetail = {
      ...spellData,
      school: normalizedSchool || null,
      sphere: normalizedSphere || null,
    };

    await saveSpell(normalizedSpellData, () => {
      // Dismiss all parser fallback fields after successful save (data is now durably stored)
      setParserFallbackFields(new Set());
      unsavedRef.current = false;
      setHasUnsavedState(false);
    });
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    // Guard: multi-line inputs use Enter for newlines, not submission
    if (target.tagName === "TEXTAREA") return;
    // Guard: interactive controls handle their own Enter activation
    // (BUTTON activates onClick; SELECT opens/confirms dropdown)
    if (target.tagName === "BUTTON" || target.tagName === "SELECT") return;
    // Guard: checkbox and radio inputs use Space for toggle; Enter should not submit
    // Note: other INPUT types (text, number) intentionally fall through to save
    if (target.tagName === "INPUT") {
      const inputType = (target as HTMLInputElement).type;
      if (inputType === "checkbox" || inputType === "radio") return;
    }
    event.preventDefault();
    void save();
  };

  const handleDelete = async () => {
    await deleteSpell(form.id);
  };

  const printSpell = async (layout: "compact" | "stat-block") => {
    if (savePending || !form.id) return;
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

  const structuredDetailFields = DETAIL_FIELD_ORDER.filter(
    (field) => field !== "components" && field !== "materialComponents",
  );
  const componentDetailFields: DetailFieldKey[] = ["components", "materialComponents"];
  const renderDetailField = (field: DetailFieldKey) => {
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
    const isExpanded = isVisualContractMode || expandedDetailField === field;
    const isLoading = detailLoading === field;
    const isSpecial =
      (field === "range" && structuredRange?.kind === "special") ||
      (field === "duration" && structuredDuration?.kind === "special") ||
      (field === "castingTime" &&
        (structuredCastingTime?.unit === "special" || !!structuredCastingTime?.rawLegacyValue)) ||
      (field === "area" && structuredArea?.kind === "special") ||
      (field === "damage" && !!structuredDamage?.sourceText) ||
      (field === "savingThrow" && structuredSavingThrow?.kind === "dm_adjudicated") ||
      (field === "magicResistance" && structuredMagicResistance?.kind === "special") ||
      (field === "materialComponents" && false);

    return (
      <div
        key={field}
        className="rounded-xl border border-neutral-200 bg-white/70 p-2 text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-950/30 dark:text-neutral-100"
      >
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
        >
          {label}
        </label>
        <div className="flex flex-col gap-0.5">
          <input
            id={inputId}
            data-testid={`detail-${kebabField}-input`}
            type="text"
            className={`w-full rounded border border-neutral-500 bg-white p-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${spellFocusVisibleRing}`}
            value={String(value)}
            onChange={(e) => handleChange(field, e.target.value)}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              id={expandId}
              data-testid={`detail-${kebabField}-expand`}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? panelId : undefined}
              onClick={() => {
                if (isVisualContractMode) return;
                if (isExpanded) {
                  collapseExpandedField();
                } else {
                  expandDetailField(field);
                }
              }}
              className={`rounded px-1 text-xs text-blue-700 hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200 ${spellFocusVisibleRing}`}
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
            {isSpecial && !isExpanded && (
              <span
                className="text-xs text-amber-800 dark:text-amber-400"
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
            data-testid={`structured-panel-${kebabField}`}
            aria-label={`Structured ${label}`}
            tabIndex={-1}
            className="mt-1 rounded-lg border border-neutral-200 bg-white/70 p-2 dark:border-neutral-700 dark:bg-neutral-950/40"
          >
            {/* Task 6: inner panel border-neutral-200 is grouping-only; primary inputs use border-neutral-500 */}
            {isLoading ? (
              <div
                className="text-sm text-neutral-500 dark:text-neutral-400"
                data-testid={`detail-${kebabField}-loading`}
              >
                Loading…
              </div>
            ) : (
              <>
                {field === "range" && (
                  <StructuredFieldInput
                    fieldType="range"
                    visibleFieldErrors={visibleFieldErrors}
                    onValidationBlur={revealRangeScalarValidation}
                    value={structuredRange ?? undefined}
                    onChange={(spec) => {
                      const nextSpec = spellbookE2EHarness.spellEditor.applyRangeDistanceCorruption(
                        spec as RangeSpec,
                      );
                      setStructuredRange(nextSpec);
                      setDetailDirtyFor("range");
                      setForm((prev) => ({
                        ...prev,
                        range: rangeToText(nextSpec),
                      }));
                      if (nextSpec.kind !== "special") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Range");
                          return next;
                        });
                      }
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
                    visibleFieldErrors={visibleFieldErrors}
                    onValidationBlur={revealDurationScalarValidation}
                    value={structuredDuration ?? undefined}
                    onChange={(spec) => {
                      setStructuredDuration(spec as DurationSpec);
                      setDetailDirtyFor("duration");
                      setForm((prev) => ({
                        ...prev,
                        duration: durationToText(spec as DurationSpec),
                      }));
                      if ((spec as DurationSpec).kind !== "special") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Duration");
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {field === "castingTime" && (
                  <StructuredFieldInput
                    fieldType="casting_time"
                    visibleFieldErrors={visibleFieldErrors}
                    onValidationBlur={revealCastingTimeScalarValidation}
                    value={structuredCastingTime ?? undefined}
                    onChange={(spec) => {
                      setStructuredCastingTime(spec as SpellCastingTime);
                      setDetailDirtyFor("castingTime");
                      setForm((prev) => ({
                        ...prev,
                        castingTime: castingTimeToText(spec as SpellCastingTime),
                      }));
                      if ((spec as SpellCastingTime).unit !== "special") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Casting time");
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {field === "area" && (
                  <AreaForm
                    visibleFieldErrors={visibleFieldErrors}
                    onValidationBlur={revealAreaScalarValidation}
                    value={structuredArea ?? defaultAreaSpec()}
                    onChange={(spec) => {
                      setStructuredArea(spec);
                      setDetailDirtyFor("area");
                      setForm((prev) => ({ ...prev, area: areaToText(spec) }));
                      if (spec.kind !== "special") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Area");
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {field === "savingThrow" && (
                  <SavingThrowInput
                    value={structuredSavingThrow ?? undefined}
                    onChange={(spec) => {
                      setStructuredSavingThrow(spec);
                      setDetailDirtyFor("savingThrow");
                      setForm((prev) => ({
                        ...prev,
                        savingThrow: savingThrowToText(spec),
                      }));
                      if (spec.kind !== "dm_adjudicated") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Saving throw");
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {field === "damage" && (
                  <DamageForm
                    visibleFieldErrors={visibleFieldErrors}
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
                    damageKind={structuredDamage?.kind}
                    onChange={(spec) => {
                      setStructuredMagicResistance(spec);
                      setDetailDirtyFor("magicResistance");
                      setForm((prev) => ({
                        ...prev,
                        magicResistance: magicResistanceToText(spec),
                      }));
                      if (spec.kind !== "special") {
                        setParserFallbackFields((prev) => {
                          const next = new Set(prev);
                          next.delete("Magic resistance");
                          return next;
                        });
                      }
                    }}
                  />
                )}
                {isSpecial && (
                  <p
                    className="mt-2 text-xs text-amber-700 dark:text-amber-400"
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
  };

  if (showLoading) return <div className="p-4">Loading...</div>;
  if (!hasRequestedSpellLoaded && !loadError) return null;
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div
          role="alert"
          data-testid="spell-load-error"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
        >
          <h1 className="text-lg font-semibold">Spell unavailable</h1>
          <p className="mt-2 text-sm">{loadError}</p>
          <div className="mt-4">
            <button
              type="button"
              data-testid="spell-load-error-back"
              onClick={() => navigate("/")}
              className={`px-3 py-2 text-sm ${spellHeaderSecondaryActionClass} ${spellFocusVisibleRing}`}
            >
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 max-w-2xl mx-auto space-y-4 overflow-auto h-full"
      onKeyDown={handleEditorKeyDown}
    >
      {parsersPending && (
        <div
          className="rounded border border-blue-600/50 bg-blue-600/10 px-3 py-2 text-sm text-blue-800 dark:text-blue-300"
          data-testid="parsers-pending-indicator"
          aria-live="polite"
        >
          Parsing fields…
        </div>
      )}
      <WarningBanner fields={[...parserFallbackFields]} />
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{isNew ? "New Spell" : "Edit Spell"}</h1>
          <div className="flex gap-2">
            {form.isQuestSpell === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-700 dark:text-yellow-400">
                Quest
              </span>
            )}
            {form.level >= 10 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-700 dark:text-purple-400">
                Epic
              </span>
            )}
            {form.level === 0 && form.isCantrip === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-500 dark:text-neutral-400">
                Cantrip
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="space-x-2">
            {!isNew && (
              <>
                <label htmlFor="print-page-size-select" className="sr-only">
                  Print page size
                </label>
                <select
                  id="print-page-size-select"
                  value={pageSize}
                  data-testid="print-page-size-select"
                  disabled={savePending}
                  onChange={(e) => setPageSize(e.target.value as "a4" | "letter")}
                  className={`${spellHeaderSelectClass} ${spellFocusVisibleRing}`}
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
                <button
                  type="button"
                  data-testid="btn-print-compact"
                  disabled={savePending}
                  onClick={() => printSpell("compact")}
                  className={`px-3 py-2 text-xs ${spellHeaderSecondaryActionClass} ${spellFocusVisibleRing}`}
                >
                  Print Compact
                </button>
                <button
                  type="button"
                  data-testid="btn-print-stat-block"
                  disabled={savePending}
                  onClick={() => printSpell("stat-block")}
                  className={`px-3 py-2 text-xs ${spellHeaderSecondaryActionClass} ${spellFocusVisibleRing}`}
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
                disabled={parsersPending || savePending}
                onClick={handleDelete}
                className={`px-3 py-2 text-red-600 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-neutral-800 dark:hover:text-red-200 rounded ${spellFocusVisibleRing}`}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              data-testid="btn-cancel-edit"
              disabled={savePending}
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
              className={`px-3 py-2 ${spellHeaderSecondaryActionClass} ${spellFocusVisibleRing}`}
            >
              Cancel
            </button>
            <button
              id="btn-save-spell"
              data-testid="btn-save-spell"
              data-disabled-contrast-guard={spellSaveDisabledContrastGuard}
              type="button"
              onClick={save}
              disabled={parsersPending || savePending || (hasAttemptedSubmit && isInvalid)}
              aria-busy={savePending ? true : undefined}
              aria-describedby={
                hasAttemptedSubmit && isInvalid ? "spell-save-validation-hint" : undefined
              }
              className={`rounded bg-blue-600 px-3 py-2 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed ${spellSaveDisabledContrastClass} ${spellFocusVisibleRing}`}
            >
              {saveShowsDelayedLabel ? "Saving…" : "Save Spell"}
            </button>
          </div>
          {hasAttemptedSubmit && isInvalid && (
            <div className={`animate-in fade-in duration-200 ${spellSaveHintClass}`}>
              <p id="spell-save-validation-hint" data-testid="spell-save-validation-hint">
                Fix the errors above to save
              </p>
            </div>
          )}
        </div>
      </div>
      {printStatus && (
        <div
          className="text-xs text-neutral-500 dark:text-neutral-400"
          data-testid="print-status-message"
        >
          {printStatus}
        </div>
      )}

      {!isNew && form.contentHash && (
        <div
          className="p-3 rounded-lg border bg-neutral-100 border-neutral-500 dark:bg-neutral-800 dark:border-neutral-700"
          data-testid="spell-detail-hash-card"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Content hash:
            </span>
            <code
              id="spell-detail-hash-value"
              className="px-2 py-0.5 rounded border bg-white border-neutral-500 text-neutral-700 font-mono text-xs dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300"
              data-testid="spell-detail-hash-display"
            >
              {hashExpanded ? form.contentHash : `${form.contentHash.slice(0, 16)}...`}
            </code>
            <button
              type="button"
              data-testid="spell-detail-hash-copy"
              disabled={savePending}
              aria-label="Copy canonical content hash"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(form.contentHash ?? "");
                  pushNotification("success", "Hash copied to clipboard.");
                } catch {
                  pushNotification("error", "Failed to copy hash.");
                }
              }}
              className={`px-2 py-1 text-xs rounded border bg-white border-neutral-500 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 ${spellFocusVisibleRing}`}
            >
              Copy
            </button>
            <button
              type="button"
              data-testid="spell-detail-hash-expand"
              disabled={savePending}
              aria-expanded={hashExpanded}
              aria-controls="spell-detail-hash-value"
              onClick={() => setHashExpanded((e) => !e)}
              className={`px-2 py-1 text-xs rounded border bg-white border-neutral-500 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 ${spellFocusVisibleRing}`}
            >
              {hashExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
      )}

      <fieldset
        disabled={parsersPending || savePending}
        data-testid="spell-editor-visual-contract"
        className="m-0 min-h-0 min-w-0 w-full border-0 p-0"
      >
        <legend className="sr-only">{isNew ? "New spell" : "Edit spell"}</legend>
        <section aria-labelledby="spell-editor-basic-information-heading" className="space-y-3">
          <h2 id="spell-editor-basic-information-heading" className={spellSectionHeadingClass}>
            Basic Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="spell-name" className={spellLabelClass}>
                Name
              </label>
              <input
                id="spell-name"
                data-testid="spell-name-input"
                className={`w-full border p-2 ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-name"))} ${
                  isNameInvalid ? spellInputBorderInvalid : spellInputBorderOk
                }`}
                placeholder="Spell Name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                onBlur={() => revealFieldValidation("spell-name")}
                aria-invalid={ariaInvalidForField("spell-name")}
                aria-describedby={describedByByField.get("spell-name")}
                required
              />
              {isNameInvalid && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="spell-name-error"
                    className={spellErrorText}
                    data-testid="spell-name-error"
                  >
                    Name is required.
                  </p>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="spell-level" className={spellLabelClass}>
                Level
              </label>
              <input
                id="spell-level"
                data-testid="spell-level-input"
                className={`w-full border p-2 ${spellInputSurface} ${getSpellFocusVisibleRing(isLevelControlInvalid)} ${
                  isLevelControlInvalid ? spellInputBorderInvalid : spellInputBorderOk
                }`}
                type="number"
                value={form.level}
                onChange={(e) => {
                  const val = e.target.valueAsNumber;
                  const clamped = Math.max(
                    0,
                    Math.min(12, Number.isNaN(val) ? 0 : Math.floor(val)),
                  );
                  handleChange("level", clamped);
                  if (clamped !== 0) handleChange("isCantrip", 0);
                  if (clamped !== 8) handleChange("isQuestSpell", 0);
                  // H-002: immediately reveal dependent fields so errors like
                  // error-school-required-arcane and error-epic-arcane-class-restriction
                  // appear as soon as the controlling level value changes.
                  revealFieldValidation(
                    "spell-level",
                    "spell-school",
                    "spell-sphere",
                    "spell-classes",
                  );
                }}
                onBlur={() => revealFieldValidation("spell-level")}
                aria-invalid={isLevelControlInvalid ? "true" : undefined}
                aria-describedby={describedByByField.get("spell-level")}
              />
              <div
                id="spell-level-display"
                className="mt-1 text-xs text-neutral-600 dark:text-neutral-400"
                data-testid="spell-level-display"
              >
                {getLevelDisplay(form.level)}
              </div>
              <div className="flex gap-4 mt-2">
                <label
                  className={`flex items-center gap-2 ${form.level !== 0 ? "cursor-not-allowed" : "cursor-pointer group"}`}
                >
                  <input
                    type="checkbox"
                    data-testid="chk-cantrip"
                    disabled={form.level !== 0}
                    checked={form.isCantrip === 1}
                    onChange={(e) => {
                      handleChange("isCantrip", e.target.checked ? 1 : 0);
                      // H-002: cantrip change can gate school/sphere/class errors.
                      revealFieldValidation(
                        "spell-level",
                        "spell-school",
                        "spell-sphere",
                        "spell-classes",
                      );
                    }}
                    className={`h-4 w-4 rounded border-neutral-500 bg-white text-blue-600 dark:border-neutral-700 dark:bg-neutral-900 ${spellFocusVisibleRing}`}
                  />
                  <span
                    className={`text-sm ${
                      form.level !== 0
                        ? "text-neutral-600 dark:text-neutral-500"
                        : "text-neutral-500 group-hover:text-neutral-600 dark:text-neutral-400 dark:group-hover:text-neutral-300"
                    }`}
                  >
                    Cantrip
                  </span>
                </label>
                <label
                  className={`flex items-center gap-2 ${form.level !== 8 ? "cursor-not-allowed" : "cursor-pointer group"}`}
                >
                  <input
                    type="checkbox"
                    data-testid="chk-quest"
                    disabled={form.level !== 8}
                    checked={form.isQuestSpell === 1}
                    onChange={(e) => {
                      handleChange("isQuestSpell", e.target.checked ? 1 : 0);
                      // H-002: quest-spell toggles gating sphere and class dependent errors.
                      revealFieldValidation("spell-level", "spell-sphere", "spell-classes");
                    }}
                    className={`h-4 w-4 rounded border-neutral-500 bg-white text-blue-600 dark:border-neutral-700 dark:bg-neutral-900 ${spellFocusVisibleRing}`}
                  />
                  <span
                    className={`text-sm ${
                      form.level !== 8
                        ? "text-neutral-600 dark:text-neutral-500"
                        : "text-neutral-500 group-hover:text-neutral-600 dark:text-neutral-400 dark:group-hover:text-neutral-300"
                    }`}
                  >
                    Quest Spell
                  </span>
                </label>
              </div>
              {isLevelInvalid && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-level-range"
                    className={spellErrorText}
                    data-testid="error-level-range"
                  >
                    Level must be 0-12.
                  </p>
                </div>
              )}
              {hasFieldError("error-epic-level-arcane-only") && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-epic-level-arcane-only"
                    className={spellErrorText}
                    data-testid="error-epic-level-arcane-only"
                  >
                    Levels 10-12 are Arcane (has School) only
                  </p>
                </div>
              )}
              {hasFieldError("error-quest-spell-divine-only") && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-quest-spell-divine-only"
                    className={spellErrorText}
                    data-testid="error-quest-spell-divine-only"
                  >
                    Quest spells are Divine (has Sphere) only
                  </p>
                </div>
              )}
              {hasFieldError("error-epic-quest-conflict") && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-epic-quest-conflict"
                    className={spellErrorText}
                    data-testid="error-epic-quest-conflict"
                  >
                    Cannot be both Epic and Quest spell.
                  </p>
                </div>
              )}
              {hasFieldError("error-cantrip-level") && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-cantrip-level"
                    className={spellErrorText}
                    data-testid="error-cantrip-level"
                  >
                    Cantrips must be Level 0
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="spell-tradition" className={spellLabelClass}>
                Tradition
              </label>
              <select
                id="spell-tradition"
                data-testid="spell-tradition-select"
                value={tradition}
                onChange={(e) => {
                  const next = e.target.value as Tradition;
                  setTradition(next);
                  if (next === "ARCANE") {
                    handleChange("sphere", null);
                  } else {
                    handleChange("school", null);
                  }
                  revealFieldValidation("spell-tradition", "spell-school", "spell-sphere");
                }}
                className={`w-full border p-2 ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-tradition"))} ${
                  isFieldInvalid("spell-tradition")
                    ? "border-amber-400 dark:border-amber-600"
                    : spellInputBorderOk
                }`}
                aria-invalid={ariaInvalidForField("spell-tradition")}
                aria-describedby={describedByByField.get("spell-tradition")}
              >
                <option value="ARCANE">Arcane</option>
                <option value="DIVINE">Divine</option>
              </select>
              {hasFieldError("error-tradition-conflict") && (
                <div
                  id="error-tradition-conflict"
                  role="alert"
                  className={`animate-in fade-in duration-200 ${spellConflictBannerClass}`}
                  data-testid="error-tradition-conflict"
                >
                  This spell has both a School and a Sphere set \u2014 school and sphere are
                  mutually exclusive. Remove one before saving.
                </div>
              )}
            </div>
            {showSchoolField && (
              <div
                key="spell-school-field"
                data-testid="spell-school-field"
                className="animate-in fade-in duration-200"
              >
                <label htmlFor="spell-school" className={spellLabelClass}>
                  School
                </label>
                <input
                  id="spell-school"
                  data-testid="spell-school-input"
                  className={`w-full border p-2 disabled:bg-neutral-100 disabled:text-neutral-600 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400 ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-school"))} ${
                    isFieldInvalid("spell-school") ? spellInputBorderInvalid : spellInputBorderOk
                  }`}
                  value={form.school || ""}
                  onChange={(e) => handleChange("school", e.target.value)}
                  onBlur={() => revealFieldValidation("spell-school")}
                  aria-invalid={ariaInvalidForField("spell-school")}
                  aria-describedby={describedByByField.get("spell-school")}
                />
                {hasFieldError("error-school-required-arcane") && (
                  <div className="animate-in fade-in duration-200">
                    <p
                      id="error-school-required-arcane"
                      className={spellErrorText}
                      data-testid="error-school-required-arcane"
                    >
                      School is required for Epic (Arcane) spells.
                    </p>
                  </div>
                )}
                {isArcaneMissingSchool && (
                  <div className="animate-in fade-in duration-200">
                    <p
                      id="error-school-required-arcane-tradition"
                      className={spellErrorText}
                      data-testid="error-school-required-arcane-tradition"
                    >
                      School is required for Arcane tradition.
                    </p>
                  </div>
                )}
              </div>
            )}
            {showSphereField && (
              <div
                key="spell-sphere-field"
                data-testid="spell-sphere-field"
                className="animate-in fade-in duration-200"
              >
                <label htmlFor="spell-sphere" className={spellLabelClass}>
                  Sphere
                </label>
                <input
                  id="spell-sphere"
                  data-testid="spell-sphere-input"
                  className={`w-full border p-2 disabled:bg-neutral-100 disabled:text-neutral-600 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400 ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-sphere"))} ${
                    isFieldInvalid("spell-sphere") ? spellInputBorderInvalid : spellInputBorderOk
                  }`}
                  value={form.sphere || ""}
                  onChange={(e) => handleChange("sphere", e.target.value)}
                  onBlur={() => revealFieldValidation("spell-sphere")}
                  aria-invalid={ariaInvalidForField("spell-sphere")}
                  aria-describedby={describedByByField.get("spell-sphere")}
                />
                {hasFieldError("error-sphere-required-divine") && (
                  <div className="animate-in fade-in duration-200">
                    <p
                      id="error-sphere-required-divine"
                      className={spellErrorText}
                      data-testid="error-sphere-required-divine"
                    >
                      Sphere is required for Quest (Divine) spells.
                    </p>
                  </div>
                )}
                {isDivineMissingSphere && (
                  <div className="animate-in fade-in duration-200">
                    <p
                      id="error-sphere-required-divine-tradition"
                      className={spellErrorText}
                      data-testid="error-sphere-required-divine-tradition"
                    >
                      Sphere is required for Divine tradition.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div>
              <label htmlFor="spell-classes" className={spellLabelClass}>
                Classes (e.g. Mage, Cleric)
              </label>
              <input
                id="spell-classes"
                data-testid="spell-classes-input"
                className={`w-full border p-2 ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-classes"))} ${
                  isFieldInvalid("spell-classes") ? spellInputBorderInvalid : spellInputBorderOk
                }`}
                value={form.classList || ""}
                onChange={(e) => {
                  handleChange("classList", e.target.value);
                  // H-002: reveal classList's own field immediately on change so
                  // error-epic-arcane-class-restriction is not hidden until blur.
                  revealFieldValidation("spell-classes");
                }}
                onBlur={() => revealFieldValidation("spell-classes")}
                aria-invalid={ariaInvalidForField("spell-classes")}
                aria-describedby={describedByByField.get("spell-classes")}
              />
              {hasFieldError("error-epic-arcane-class-restriction") && (
                <div className="animate-in fade-in duration-200">
                  <p
                    id="error-epic-arcane-class-restriction"
                    className={spellErrorText}
                    data-testid="error-epic-arcane-class-restriction"
                  >
                    Epic spells are Arcane only and require Wizard/Mage class access.
                  </p>
                </div>
              )}
            </div>
            {/* Add more fields as needed for MVP */}
            <div>
              <label
                htmlFor="spell-source"
                className="block text-sm text-neutral-500 dark:text-neutral-400"
              >
                Source
              </label>
              <input
                id="spell-source"
                data-testid="spell-source-input"
                className={`w-full ${spellInputSurface} ${spellInputBorderOk} ${spellFocusVisibleRing}`}
                value={form.source || ""}
                onChange={(e) => handleChange("source", e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="spell-edition"
                className="block text-sm text-neutral-500 dark:text-neutral-400"
              >
                Edition
              </label>
              <input
                id="spell-edition"
                data-testid="spell-edition-input"
                className={`w-full ${spellInputSurface} ${spellInputBorderOk} ${spellFocusVisibleRing}`}
                value={form.edition || ""}
                onChange={(e) => handleChange("edition", e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="spell-author"
                className="block text-sm text-neutral-500 dark:text-neutral-400"
              >
                Author
              </label>
              <input
                id="spell-author"
                data-testid="spell-author-input"
                className={`w-full ${spellInputSurface} ${spellInputBorderOk} ${spellFocusVisibleRing}`}
                value={form.author || ""}
                onChange={(e) => handleChange("author", e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="spell-license"
                className="block text-sm text-neutral-500 dark:text-neutral-400"
              >
                License
              </label>
              <input
                id="spell-license"
                data-testid="spell-license-input"
                className={`w-full ${spellInputSurface} ${spellInputBorderOk} ${spellFocusVisibleRing}`}
                value={form.license || ""}
                onChange={(e) => handleChange("license", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="spell-reversible"
                data-testid="chk-reversible"
                type="checkbox"
                className={`h-4 w-4 rounded border-neutral-500 bg-white text-blue-600 dark:border-neutral-700 dark:bg-neutral-900 ${spellFocusVisibleRing}`}
                checked={Boolean(form.reversible)}
                onChange={(e) => handleChange("reversible", e.target.checked ? 1 : 0)}
              />
              <label
                htmlFor="spell-reversible"
                className="text-sm text-neutral-500 dark:text-neutral-400"
              >
                Reversible
              </label>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="spell-editor-structured-fields-heading"
          data-testid="spell-editor-structured-fields-section"
          className="space-y-3"
        >
          <h2 id="spell-editor-structured-fields-heading" className={spellSectionHeadingClass}>
            Structured Fields
          </h2>
          <div className="space-y-3 text-sm">{structuredDetailFields.map(renderDetailField)}</div>
        </section>

        <section aria-labelledby="spell-editor-components-heading" className="space-y-3">
          <h2 id="spell-editor-components-heading" className={spellSectionHeadingClass}>
            Components
          </h2>
          <div className="space-y-3 text-sm">{componentDetailFields.map(renderDetailField)}</div>
        </section>

        <div>
          <label
            htmlFor="spell-tags"
            className="block text-sm text-neutral-500 dark:text-neutral-400"
          >
            Tags
          </label>
          <textarea
            id="spell-tags"
            data-testid="spell-tags-input"
            className={`w-full min-h-[80px] ${spellInputSurface} ${spellInputBorderOk} ${spellFocusVisibleRing}`}
            placeholder="Comma-separated tags"
            aria-describedby="spell-tags-hint"
            value={form.tags || ""}
            onChange={(e) => handleChange("tags", e.target.value)}
          />
          <p id="spell-tags-hint" className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Separate multiple tags with commas.
          </p>
        </div>

        <div className="flex flex-1 flex-col">
          <label htmlFor="spell-description" className={spellLabelClass}>
            Description
          </label>
          <textarea
            id="spell-description"
            data-testid="spell-description-textarea"
            className={`min-h-[200px] w-full flex-1 border p-2 font-mono ${spellInputSurface} ${getSpellFocusVisibleRing(isFieldInvalid("spell-description"))} ${
              isDescriptionInvalid ? spellInputBorderInvalid : spellInputBorderOk
            }`}
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            onBlur={() => revealFieldValidation("spell-description")}
            aria-invalid={ariaInvalidForField("spell-description")}
            aria-describedby={describedByByField.get("spell-description")}
            required
          />
          {isDescriptionInvalid && (
            <div className="animate-in fade-in duration-200">
              <p
                id="error-description-required"
                className={spellErrorText}
                data-testid="error-description-required"
              >
                Description is required.
              </p>
            </div>
          )}
        </div>

        {form.artifacts && form.artifacts.length > 0 && (
          <div className="rounded-md border border-neutral-700 bg-neutral-900 p-3 space-y-2 dark:border-neutral-600">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-neutral-100">Provenance (Imports)</h3>
              <button
                type="button"
                data-testid="btn-reparse-artifact"
                aria-label="Reparse spell from artifact"
                disabled={savePending || reparsePending}
                onClick={async () => {
                  if (!form.artifacts || form.artifacts.length === 0) return;
                  const artifactId = form.artifacts[0].id;

                  const confirmed = await modalConfirm(
                    "Re-parse this spell from the original artifact file? This will overwrite manual changes.",
                    "Reparse Spell",
                  );
                  if (!confirmed) return;

                  try {
                    setReparsePending(true);
                    const updated = await invoke<SpellDetail>("reparse_artifact", { artifactId });
                    setForm(updated);
                    await modalAlert(
                      "Spell re-parsed successfully!",
                      "Reparse Complete",
                      "success",
                    );
                  } catch (e) {
                    await modalAlert(`Reparse failed: ${e}`, "Reparse Error", "error");
                  } finally {
                    setReparsePending(false);
                  }
                }}
                className={`text-xs text-neutral-100 px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700 ${spellFocusVisibleRing}`}
              >
                Reparse
              </button>
            </div>
            {form.artifacts?.map((art) => (
              <ArtifactRow key={art.id} artifact={art} />
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
