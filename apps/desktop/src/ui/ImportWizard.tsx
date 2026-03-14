import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useImportActivity } from "../store/useImportActivity";
import { useModal } from "../store/useModal";
import type { SourceRefUrlPolicy } from "../types/vault";
import FieldMapper, { type ParsedSpell } from "./FieldMapper";
import BulkConflictSummaryDialog from "./components/BulkConflictSummaryDialog";
import SpellConflictDiffDialog from "./components/SpellConflictDiffDialog";
import {
  getVaultSettings,
  setImportSourceRefUrlPolicy,
} from "./components/VaultMaintenanceDialog";
import type {
  BulkConflictAction,
  ConflictAction,
  HashConflictResolution,
  HashImportConflict,
  HashImportResult,
  HashPreviewResult,
} from "../types/import-types";

type ImportFile = {
  name: string;
  content: number[];
};

type SpellArtifact = {
  id: number;
  spellId: number;
  type: string;
  path: string;
  hash: string;
  importedAt: string;
};

type ImportArtifact = {
  type: string;
  path: string;
  hash: string;
  importedAt: string;
};

type ImportConflictField = {
  field: string;
  existing?: string;
  incoming?: string;
};

type SpellDetail = {
  id?: number;
  name: string;
  school?: string;
  sphere?: string;
  classList?: string;
  level: number;
  range?: string;
  components?: string;
  materialComponents?: string;
  castingTime?: string;
  duration?: string;
  area?: string;
  savingThrow?: string;
  reversible?: number;
  description: string;
  tags?: string;
  source?: string;
  edition?: string;
  author?: string;
  license?: string;
  isQuestSpell?: number;
  isCantrip?: number;
  artifacts?: SpellArtifact[];
};

type SpellUpdate = {
  id: number;
  name: string;
  school?: string;
  sphere?: string;
  classList?: string;
  level: number;
  range?: string;
  components?: string;
  materialComponents?: string;
  castingTime?: string;
  duration?: string;
  area?: string;
  savingThrow?: string;
  reversible?: number;
  description: string;
  tags?: string;
  source?: string;
  edition?: string;
  author?: string;
  license?: string;
  isQuestSpell: number;
  isCantrip: number;
};

type ParseConflict = {
  type: "parse";
  path: string;
  reason: string;
};

type SpellConflict = {
  type: "spell";
  existing: SpellDetail;
  incoming: SpellDetail;
  fields: ImportConflictField[];
  artifact?: ImportArtifact;
};

type ImportConflict = ParseConflict | SpellConflict;

type ImportResult = {
  spells: SpellDetail[];
  artifacts: SpellArtifact[];
  conflicts: ImportConflict[];
  warnings: string[];
  skipped: string[];
};

type PreviewResult = {
  spells: ParsedSpell[];
  artifacts: ImportArtifact[];
  conflicts: ImportConflict[];
};

type ImportStep =
  | "select"
  | "preview"
  | "map"
  | "confirm"
  | "resolve"
  | "result"
  | "json-preview"
  | "resolve-json";

const JSON_IMPORT_WARNING_THRESHOLD_BYTES = 10 * 1024 * 1024;

const STEP_TITLES: Record<ImportStep, string> = {
  select: "1. Select Files",
  preview: "2. Preview",
  map: "3. Review Fields",
  confirm: "4. Confirm",
  resolve: "5. Resolve Conflicts",
  result: "6. Complete",
  "json-preview": "2. JSON Preview",
  "resolve-json": "3. Resolve Conflicts",
};

type ConflictSelection = {
  action: "merge" | "overwrite" | "skip";
  fields: Record<string, "existing" | "incoming">;
};

type ResolveImportResult = {
  resolved: string[];
  skipped: string[];
  warnings: string[];
};

const conflictFieldLabels: Record<string, string> = {
  name: "Name",
  school: "School",
  sphere: "Sphere",
  classList: "Classes",
  level: "Level",
  range: "Range",
  components: "Components",
  materialComponents: "Material Components",
  castingTime: "Casting Time",
  duration: "Duration",
  area: "Area",
  savingThrow: "Saving Throw",
  reversible: "Reversible",
  description: "Description",
  tags: "Tags",
  source: "Source",
  edition: "Edition",
  author: "Author",
  license: "License",
};

const getConflictKey = (conflict: SpellConflict, index: number) =>
  conflict.existing.id ? `${conflict.existing.id}-${index}` : `${conflict.incoming.name}-${index}`;

export async function runWithImportActivity<T>(work: () => Promise<T>): Promise<T> {
  useImportActivity.getState().beginImportActivity();
  try {
    return await work();
  } finally {
    useImportActivity.getState().endImportActivity();
  }
}

export default function ImportWizard() {
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const [step, setStep] = useState<ImportStep>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [filePayloads, setFilePayloads] = useState<ImportFile[]>([]);
  const [previewSpells, setPreviewSpells] = useState<ParsedSpell[]>([]);
  const [mappedSpells, setMappedSpells] = useState<ParsedSpell[]>([]);
  const [previewConflicts, setPreviewConflicts] = useState<ImportConflict[]>([]);
  const [previewArtifacts, setPreviewArtifacts] = useState<ImportArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [spellConflicts, setSpellConflicts] = useState<SpellConflict[]>([]);
  const [conflictSelections, setConflictSelections] = useState<Record<string, ConflictSelection>>(
    {},
  );
  const [resolveResult, setResolveResult] = useState<ResolveImportResult | null>(null);
  const [showHighLevelWarning, setShowHighLevelWarning] = useState(false);
  const [suppressWarning, setSuppressWarning] = useState(false);

  // ── JSON import state ───────────────────────────────────────────────────
  const [isJsonImport, setIsJsonImport] = useState(false);
  const [jsonPayload, setJsonPayload] = useState<string>("");
  const [jsonPreviewResult, setJsonPreviewResult] = useState<HashPreviewResult | null>(null);
  const [jsonImportResult, setJsonImportResult] = useState<HashImportResult | null>(null);
  const [jsonConflicts, setJsonConflicts] = useState<HashImportConflict[]>([]);
  const [jsonConflictIndex, setJsonConflictIndex] = useState(0);
  const [jsonResolutions, setJsonResolutions] = useState<HashConflictResolution[]>([]);
  const [sourceRefUrlPolicy, setSourceRefUrlPolicy] = useState<SourceRefUrlPolicy>("drop-ref");
  const [isSourceRefUrlPolicySaving, setIsSourceRefUrlPolicySaving] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkConflictAction | null>(null);
  const loadingRef = useRef(false);

  const hasLowConfidence = (spells: ParsedSpell[]): boolean => {
    return spells.some((spell) => {
      const conf = spell._confidence || {};
      return (conf.name ?? 1) < 0.5 || (conf.level ?? 1) < 0.5 || (conf.description ?? 1) < 0.5;
    });
  };

  const parseConflicts = (conflicts: ImportConflict[]) =>
    conflicts.filter((conflict): conflict is ParseConflict => conflict.type === "parse");

  const spellConflictsOnly = (conflicts: ImportConflict[]) =>
    conflicts.filter((conflict): conflict is SpellConflict => conflict.type === "spell");

  useEffect(() => {
    if (spellConflicts.length === 0) {
      setConflictSelections({});
      return;
    }
    const selections: Record<string, ConflictSelection> = {};
    for (const [index, conflict] of spellConflicts.entries()) {
      const fields: Record<string, "existing" | "incoming"> = {};
      for (const field of conflict.fields) {
        fields[field.field] = "incoming";
      }
      selections[getConflictKey(conflict, index)] = {
        action: "merge",
        fields,
      };
    }
    setConflictSelections(selections);
  }, [spellConflicts]);

  useEffect(() => {
    let cancelled = false;

    void getVaultSettings()
      .then((settings) => {
        if (!cancelled) {
          setSourceRefUrlPolicy(settings.importSourceRefUrlPolicy);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceRefUrlPolicy("drop-ref");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setConflictAction = (key: string, action: ConflictSelection["action"]) => {
    setConflictSelections((prev) => {
      const selection = prev[key];
      if (!selection) return prev;
      const nextFields = { ...selection.fields };
      if (action === "overwrite") {
        for (const field of Object.keys(nextFields)) {
          nextFields[field] = "incoming";
        }
      }
      return {
        ...prev,
        [key]: {
          action,
          fields: nextFields,
        },
      };
    });
  };

  const setFieldChoice = (
    key: string,
    field: string,
    choice: ConflictSelection["fields"][string],
  ) => {
    setConflictSelections((prev) => {
      const selection = prev[key];
      if (!selection) return prev;
      return {
        ...prev,
        [key]: {
          ...selection,
          action: "merge",
          fields: {
            ...selection.fields,
            [field]: choice,
          },
        },
      };
    });
  };

  const spellDetailToUpdate = (spell: SpellDetail, id: number): SpellUpdate => ({
    id,
    name: spell.name,
    school: spell.school,
    sphere: spell.sphere,
    classList: spell.classList,
    level: spell.level,
    range: spell.range,
    components: spell.components,
    materialComponents: spell.materialComponents,
    castingTime: spell.castingTime,
    duration: spell.duration,
    area: spell.area,
    savingThrow: spell.savingThrow,
    reversible: spell.reversible,
    description: spell.description,
    tags: spell.tags,
    source: spell.source,
    edition: spell.edition,
    author: spell.author,
    license: spell.license,
    isQuestSpell: spell.isQuestSpell || 0,
    isCantrip: spell.isCantrip || 0,
  });

  const applyFieldFromSpell = (target: SpellUpdate, field: string, source: SpellDetail) => {
    switch (field) {
      case "name":
        target.name = source.name;
        break;
      case "school":
        target.school = source.school;
        break;
      case "sphere":
        target.sphere = source.sphere;
        break;
      case "classList":
        target.classList = source.classList;
        break;
      case "level":
        target.level = source.level;
        break;
      case "range":
        target.range = source.range;
        break;
      case "components":
        target.components = source.components;
        break;
      case "materialComponents":
        target.materialComponents = source.materialComponents;
        break;
      case "castingTime":
        target.castingTime = source.castingTime;
        break;
      case "duration":
        target.duration = source.duration;
        break;
      case "area":
        target.area = source.area;
        break;
      case "savingThrow":
        target.savingThrow = source.savingThrow;
        break;
      case "reversible":
        target.reversible = source.reversible;
        break;
      case "description":
        target.description = source.description;
        break;
      case "tags":
        target.tags = source.tags;
        break;
      case "source":
        target.source = source.source;
        break;
      case "edition":
        target.edition = source.edition;
        break;
      case "author":
        target.author = source.author;
        break;
      case "license":
        target.license = source.license;
        break;
      case "isQuestSpell":
        target.isQuestSpell = source.isQuestSpell || 0;
        break;
      case "isCantrip":
        target.isCantrip = source.isCantrip || 0;
        break;
      default:
        break;
    }
  };

  const mergeConflictSpell = (
    conflict: SpellConflict,
    selection: ConflictSelection,
  ): SpellUpdate => {
    const existingId = conflict.existing.id;
    if (!existingId) {
      throw new Error("Missing existing spell id for conflict resolution.");
    }
    const merged = spellDetailToUpdate(conflict.existing, existingId);
    for (const field of conflict.fields) {
      if (selection.fields[field.field] === "incoming") {
        applyFieldFromSpell(merged, field.field, conflict.incoming);
      }
    }
    return merged;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      setResult(null);
      setStep("select");
      // Detect JSON import mode
      const hasJson = selectedFiles.some((f) => f.name.toLowerCase().endsWith(".json"));
      setIsJsonImport(hasJson);
      // Reset JSON state on new selection
      setJsonPayload("");
      setJsonPreviewResult(null);
      setJsonImportResult(null);
      setJsonConflicts([]);
      setJsonConflictIndex(0);
      setJsonResolutions([]);
      setBulkAction(null);
    }
  };

  const withLoadingGuard = async (work: () => Promise<void>) => {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    try {
      await work();
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const handleSourceRefUrlPolicyChange = async (nextPolicy: SourceRefUrlPolicy) => {
    const previousPolicy = sourceRefUrlPolicy;
    setSourceRefUrlPolicy(nextPolicy);
    setIsSourceRefUrlPolicySaving(true);

    try {
      const settings = await setImportSourceRefUrlPolicy(nextPolicy);
      setSourceRefUrlPolicy(settings.importSourceRefUrlPolicy);
    } catch (error) {
      setSourceRefUrlPolicy(previousPolicy);
      await modalAlert(`Import URL policy update failed: ${error}`, "Settings Error", "error");
    } finally {
      setIsSourceRefUrlPolicySaving(false);
    }
  };

  const confirmLargeJsonPreview = async (file: File): Promise<boolean> => {
    if (file.size <= JSON_IMPORT_WARNING_THRESHOLD_BYTES) {
      return true;
    }

    const sizeInMegabytes = (file.size / (1024 * 1024)).toFixed(2);
    return modalConfirm(
      [
        `${file.name} is ${sizeInMegabytes} MB and exceeds the 10 MB preview warning threshold.`,
        "Previewing a large JSON import may take longer.",
        "Files over 100 MB are still rejected by the backend.",
      ],
      "Large Import Warning",
    );
  };

  const goToJsonPreview = async () => {
    if (files.length === 0) return;
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const jsonFile = files.find((f) => f.name.toLowerCase().endsWith(".json"));
          if (!jsonFile) return;
          const shouldContinue = await confirmLargeJsonPreview(jsonFile);
          if (!shouldContinue) {
            return;
          }
          const text = await jsonFile.text();
          setJsonPayload(text);
          const preview = await invoke<HashPreviewResult>("preview_import_spell_json", {
            payload: text,
            sourceRefUrlPolicy,
          });
          setJsonPreviewResult(preview);
          setStep("json-preview");
        });
      });
    } catch (e) {
      console.error("JSON preview failed:", e);
      await modalAlert(`JSON preview failed: ${e}`, "Preview Error", "error");
    }
  };

  const doJsonImport = async () => {
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const result = await invoke<HashImportResult>("import_spell_json", {
            payload: jsonPayload,
              sourceRefUrlPolicy,
          });
          setJsonImportResult(result);
          if (result.conflicts.length === 0) {
            setStep("result");
          } else {
            setJsonConflicts(result.conflicts);
            setJsonConflictIndex(0);
            setJsonResolutions([]);
            setBulkAction(null);
            setStep("resolve-json");
          }
        });
      });
    } catch (e) {
      console.error("JSON import failed:", e);
      await modalAlert(`JSON import failed: ${e}`, "Import Error", "error");
    }
  };

  const handleBulkAction = async (action: BulkConflictAction) => {
    if (action === "review_each") {
      // setState for 'review_each' is already set by the JSX onAction handler.
      // Just reset conflict traversal state so per-conflict dialog starts at index 0.
      setJsonConflictIndex(0);
      setJsonResolutions([]);
      return;
    }
    const conflictActionMap: Record<string, ConflictAction> = {
      skip_all: "keep_existing",
      replace_all: "replace_with_new",
      keep_all: "keep_both",
    };
    const mappedAction = conflictActionMap[action];
    if (!mappedAction) return;
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const resolutions: HashConflictResolution[] = jsonConflicts.map((c) => ({
            existingId: c.existingId,
            incomingContentHash: c.incomingContentHash,
            action: mappedAction,
          }));
          const result = await invoke<HashImportResult>("resolve_import_spell_json", {
            payload: jsonPayload,
            sourceRefUrlPolicy,
            resolveOptions: {
              resolutions,
              defaultAction: null,
            },
          });
          setJsonImportResult(result);
          setStep("result");
        });
      });
    } catch (e) {
      console.error("Bulk conflict resolution failed:", e);
      await modalAlert(`Bulk resolution failed: ${e}`, "Resolution Error", "error");
    }
  };

  const handleConflictResolve = async (resolution: HashConflictResolution, applyToAll: boolean) => {
    let allResolutions: HashConflictResolution[];
    if (applyToAll) {
      // Apply same action to current and all remaining conflicts
      const remainingConflicts = jsonConflicts.slice(jsonConflictIndex);
      allResolutions = [
        ...jsonResolutions,
        ...remainingConflicts.map((c) => ({
          existingId: c.existingId,
          incomingContentHash: c.incomingContentHash,
          action: resolution.action,
        })),
      ];
    } else {
      allResolutions = [...jsonResolutions, resolution];
      const nextIndex = jsonConflictIndex + 1;
      if (nextIndex < jsonConflicts.length) {
        setJsonResolutions(allResolutions);
        setJsonConflictIndex(nextIndex);
        return; // Wait for next conflict
      }
    }
    // All conflicts resolved — submit
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const result = await invoke<HashImportResult>("resolve_import_spell_json", {
            payload: jsonPayload,
            sourceRefUrlPolicy,
            resolveOptions: {
              resolutions: allResolutions,
              defaultAction: null,
            },
          });
          setJsonImportResult(result);
          setStep("result");
        });
      });
    } catch (e) {
      console.error("Conflict resolution failed:", e);
      await modalAlert(`Conflict resolution failed: ${e}`, "Resolution Error", "error");
    }
  };

  const goToPreview = async () => {
    if (files.length === 0) return;
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const payloads = await Promise.all(
            files.map(async (f) => {
              const buf = await f.arrayBuffer();
              return { name: f.name, content: Array.from(new Uint8Array(buf)) };
            }),
          );
          setFilePayloads(payloads);

          const response = await invoke<PreviewResult>("preview_import", { files: payloads });
          setPreviewSpells(response.spells);
          setPreviewArtifacts(response.artifacts);
          setPreviewConflicts(response.conflicts);

          const hasHighLevel = response.spells.some((s) => (s.level || 0) >= 10 || s.isQuestSpell);
          if (hasHighLevel && !suppressWarning) {
            setShowHighLevelWarning(true);
          }

          setStep("preview");
        });
      });
    } catch (e) {
      console.error("Preview failed:", e);
      await modalAlert(`Preview failed: ${e}`, "Preview Error", "error");
    }
  };

  const goToMap = () => {
    setStep("map");
  };

  const goToConfirm = (spells: ParsedSpell[]) => {
    setMappedSpells(spells);
    setStep("confirm");
  };

  const skipMapping = () => {
    setMappedSpells(previewSpells);
    setStep("confirm");
  };

  const doImport = async () => {
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          setResolveResult(null);
          const response = await invoke<ImportResult>("import_files", {
            files: filePayloads,
            allowOverwrite,
            spells: mappedSpells,
            artifacts: previewArtifacts,
            conflicts: previewConflicts,
          });
          setResult(response);
          const conflicts = spellConflictsOnly(response.conflicts);
          setSpellConflicts(conflicts);
          if (conflicts.length > 0) {
            setStep("resolve");
          } else {
            setStep("result");
          }
        });
      });
    } catch (e) {
      console.error("Import failed:", e);
      await modalAlert(`Import failed: ${e}`, "Import Error", "error");
    }
  };

  const resolveConflicts = async () => {
    try {
      await withLoadingGuard(async () => {
        await runWithImportActivity(async () => {
          const resolutions = spellConflicts.map((conflict, index) => {
            const key = getConflictKey(conflict, index);
            const selection = conflictSelections[key];
            const existingId = conflict.existing.id;
            if (!existingId) {
              throw new Error("Missing existing spell id.");
            }
            if (!selection || selection.action === "skip") {
              return { action: "skip", existingId: existingId };
            }
            const resolvedSpell =
              selection.action === "overwrite"
                ? spellDetailToUpdate(conflict.incoming, existingId)
                : mergeConflictSpell(conflict, selection);
            return {
              action: selection.action,
              existingId: existingId,
              spell: resolvedSpell,
              artifact: conflict.artifact,
            };
          });

          const response = await invoke<ResolveImportResult>("resolve_import_conflicts", {
            resolutions,
          });
          setResolveResult(response);
          setStep("result");
        });
      });
    } catch (e) {
      console.error("Conflict resolution failed:", e);
      await modalAlert(`Conflict resolution failed: ${e}`, "Resolution Error", "error");
    }
  };

  const reset = () => {
    setStep("select");
    setFiles([]);
    setFilePayloads([]);
    setPreviewSpells([]);
    setMappedSpells([]);
    setPreviewConflicts([]);
    setPreviewArtifacts([]);
    setResult(null);
    setSpellConflicts([]);
    setConflictSelections({});
    setResolveResult(null);
    // Reset JSON state
    setIsJsonImport(false);
    setJsonPayload("");
    setJsonPreviewResult(null);
    setJsonImportResult(null);
    setJsonConflicts([]);
    setJsonConflictIndex(0);
    setJsonResolutions([]);
    setBulkAction(null);
  };

  const previewParseConflicts = parseConflicts(previewConflicts);
  const resultParseConflicts = result ? parseConflicts(result.conflicts) : [];
  const combinedWarnings = result ? [...result.warnings, ...(resolveResult?.warnings ?? [])] : [];

  return (
    <div className="space-y-4">
      {/* Step Indicator — only show steps relevant to current import mode */}
      <div className="flex gap-2 text-xs flex-wrap">
        {(Object.keys(STEP_TITLES) as ImportStep[])
          .filter((s) =>
            isJsonImport
              ? ["select", "json-preview", "resolve-json", "result"].includes(s)
              : !["json-preview", "resolve-json"].includes(s),
          )
          .map((s) => (
            <div
              key={s}
              className={`px-2 py-1 rounded ${
                s === step ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-500"
              }`}
            >
              {STEP_TITLES[s]}
            </div>
          ))}
      </div>

      {/* Step 1: Select Files */}
      {step === "select" && (
        <div className="space-y-4">
          <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
            <label
              className="mb-2 block text-sm font-medium text-neutral-200"
              htmlFor="source-ref-url-policy"
            >
              Invalid SourceRef URL handling
            </label>
            <select
              id="source-ref-url-policy"
              data-testid="select-source-ref-url-policy"
              value={sourceRefUrlPolicy}
              disabled={loading || isSourceRefUrlPolicySaving}
              onChange={(event) => {
                void handleSourceRefUrlPolicyChange(event.target.value as SourceRefUrlPolicy);
              }}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
            >
              <option value="drop-ref">Drop invalid SourceRef entries and continue</option>
              <option value="reject-spell">Reject the spell if any SourceRef URL is invalid</option>
            </select>
            <p className="mt-2 text-xs text-neutral-500" data-testid="source-ref-url-policy-help">
              Saved to vault settings and reused for future JSON imports.
            </p>
          </div>

          <input
            type="file"
            multiple
            accept=".md,.pdf,.docx,.json"
            data-testid="import-file-input"
            aria-label="Select files to import"
            onChange={handleFileChange}
            disabled={loading}
            className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-neutral-800 file:text-neutral-300 hover:file:bg-neutral-700"
          />
          {files.length > 0 && (
            <>
              <pre
                className="text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800 text-neutral-500 max-h-32 overflow-auto"
                data-testid="selected-files-list"
              >
                {files.map((f) => f.name).join("\n")}
              </pre>
              <div className="text-sm text-neutral-400" data-testid="file-count-label">
                {files.length} file(s) selected
              </div>
              <button
                type="button"
                data-testid="btn-preview-import"
                onClick={isJsonImport ? goToJsonPreview : goToPreview}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Parsing…" : "Preview →"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step JSON-2: JSON Preview (only for .json files) */}
      {step === "json-preview" && (
        <div className="space-y-4">
          <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded">
            <div className="text-sm font-semibold">
              Found {jsonPreviewResult?.spells.length ?? 0} spell(s) in JSON
            </div>
            {jsonPreviewResult && jsonPreviewResult.failures.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {jsonPreviewResult.failures.length} spell(s) failed validation
              </div>
            )}
          </div>

          {jsonPreviewResult && jsonPreviewResult.warnings.length > 0 && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-900 rounded text-yellow-400 text-sm">
              ⚠️ {jsonPreviewResult.warnings.join("; ")}
            </div>
          )}

          {jsonPreviewResult && jsonPreviewResult.failures.length > 0 && (
            <div className="max-h-32 overflow-auto bg-neutral-950 border border-red-900/50 rounded p-2">
              <div className="text-xs text-red-400 font-semibold mb-1">Validation failures:</div>
              {jsonPreviewResult.failures.map((f, i) => (
                <div key={`${i}-${f.spellName}`} className="text-xs text-red-300">
                  <span className="font-medium">{f.spellName}</span>: {f.reason}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="btn-back-to-select-json"
              onClick={() => setStep("select")}
              disabled={loading}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              data-testid="btn-import-json"
              onClick={doJsonImport}
              disabled={loading || (jsonPreviewResult?.spells.length ?? 0) === 0}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-500 disabled:opacity-50 font-semibold"
            >
              {loading ? "Importing…" : `Import ${jsonPreviewResult?.spells.length ?? 0} Spell(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview (legacy – md/pdf/docx) */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded">
            <div className="text-sm font-semibold">Parsed {previewSpells.length} spell(s)</div>
            {previewParseConflicts.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {previewParseConflicts.length} file(s) could not be parsed
              </div>
            )}
          </div>

          {hasLowConfidence(previewSpells) && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-900 rounded text-yellow-400 text-sm">
              ⚠️ Some spells have low-confidence field extraction. We recommend reviewing them before
              import.
            </div>
          )}

          <div className="max-h-48 overflow-auto bg-neutral-950 border border-neutral-800 rounded p-2">
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="text-left p-1">Name</th>
                  <th className="text-left p-1">Level</th>
                  <th className="text-left p-1">Source</th>
                  <th className="text-left p-1">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {previewSpells.slice(0, 20).map((spell, i) => {
                  const avgConf =
                    Object.values(spell._confidence || {}).reduce((a, b) => a + b, 0) /
                    Math.max(Object.keys(spell._confidence || {}).length, 1);
                  return (
                    <tr
                      key={`${spell._source_file}-${spell.name}`}
                      className="border-t border-neutral-800/50"
                    >
                      <td className="p-1 text-neutral-300">{spell.name}</td>
                      <td className="p-1">{spell.level}</td>
                      <td className="p-1">{spell.source || "-"}</td>
                      <td className="p-1">
                        <span
                          className={`px-1 rounded text-[10px] ${
                            avgConf > 0.7
                              ? "bg-green-900/50 text-green-400"
                              : avgConf > 0.4
                                ? "bg-yellow-900/50 text-yellow-400"
                                : "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {Math.round(avgConf * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {previewSpells.length > 20 && (
                  <tr>
                    <td colSpan={4} className="p-1 text-neutral-500 text-center">
                      ...and {previewSpells.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="btn-back-to-select"
              onClick={() => setStep("select")}
              disabled={loading}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              data-testid="btn-review-fields"
              onClick={goToMap}
              className="px-3 py-2 bg-yellow-600 rounded hover:bg-yellow-500"
            >
              Review Fields
            </button>
            <button
              type="button"
              data-testid="btn-skip-review"
              onClick={skipMapping}
              className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500"
            >
              Skip Review →
            </button>
          </div>

          {showHighLevelWarning && (
            <div className="p-4 bg-purple-900/20 border border-purple-900 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-purple-200 font-semibold">
                <span className="text-xl">✨</span>
                High-Level Magic Detected
              </div>
              <p className="text-sm text-neutral-300">
                This import contains Epic (10th-12th Circle) or Quest spells. These spells are
                extremely powerful and may require specific character levels or divine intervention.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="suppressWarning"
                  checked={suppressWarning}
                  onChange={(e) => setSuppressWarning(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-purple-500"
                />
                <label
                  htmlFor="suppressWarning"
                  className="text-xs text-neutral-400 cursor-pointer"
                >
                  Don't show this warning again this session
                </label>
                <button
                  type="button"
                  onClick={() => setShowHighLevelWarning(false)}
                  className="ml-auto px-2 py-1 bg-purple-900/40 text-purple-200 rounded text-xs hover:bg-purple-900/60"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Map Fields */}
      {step === "map" && (
        <FieldMapper
          spells={previewSpells}
          onConfirm={goToConfirm}
          onCancel={() => setStep("preview")}
        />
      )}

      {/* Step 4: Confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded">
            <div className="text-sm font-semibold" data-testid="import-ready-label">
              Ready to import {mappedSpells.length} spell(s)
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-neutral-900/50 p-3 rounded border border-neutral-800">
            <input
              type="checkbox"
              id="allowOverwrite"
              data-testid="overwrite-existing-checkbox"
              checked={allowOverwrite}
              onChange={(e) => setAllowOverwrite(e.target.checked)}
              className="rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="allowOverwrite" className="text-sm text-neutral-300 cursor-pointer">
              Overwrite existing spells (matching name, level, and source)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="btn-back-to-preview"
              onClick={() => setStep("preview")}
              disabled={loading}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              data-testid="btn-start-import"
              onClick={doImport}
              disabled={loading}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-500 disabled:opacity-50 font-semibold"
            >
              {loading ? "Importing…" : "Start Import"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Resolve Conflicts */}
      {step === "resolve" && (
        <div className="space-y-4">
          <div className="p-3 bg-yellow-900/20 border border-yellow-900 rounded text-yellow-400">
            <div className="text-sm font-semibold text-yellow-200">Resolve Conflicts</div>
            {spellConflicts.length} spell(s) already exist. Choose how to merge them before
            finishing the import.
          </div>

          {spellConflicts.map((conflict, index) => {
            const key = getConflictKey(conflict, index);
            const selection = conflictSelections[key];
            const action = selection?.action ?? "merge";
            const isMerge = action === "merge";
            return (
              <div key={key} className="border border-neutral-800 rounded bg-neutral-900/50 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">
                      {conflict.incoming.name} (Level {conflict.incoming.level})
                    </div>
                    <div className="text-xs text-neutral-500">
                      Source: {conflict.incoming.source || conflict.existing.source || "Unknown"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      data-testid="btn-custom-merge"
                      onClick={() => setConflictAction(key, "merge")}
                      className={`px-2 py-1 rounded border ${
                        action === "merge"
                          ? "border-blue-500 bg-blue-900/40 text-blue-200"
                          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                      }`}
                    >
                      Custom Merge
                    </button>
                    <button
                      type="button"
                      data-testid="btn-use-incoming"
                      onClick={() => setConflictAction(key, "overwrite")}
                      className={`px-2 py-1 rounded border ${
                        action === "overwrite"
                          ? "border-green-500 bg-green-900/40 text-green-200"
                          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                      }`}
                    >
                      Use Incoming
                    </button>
                    <button
                      type="button"
                      data-testid="btn-keep-existing"
                      onClick={() => setConflictAction(key, "skip")}
                      className={`px-2 py-1 rounded border ${
                        action === "skip"
                          ? "border-red-500 bg-red-900/40 text-red-200"
                          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                      }`}
                    >
                      Keep Existing
                    </button>
                  </div>
                </div>

                {conflict.fields.length > 0 ? (
                  <div className="mt-3 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="text-neutral-500">
                        <tr>
                          <th className="text-left p-1">Field</th>
                          <th className="text-left p-1">Existing</th>
                          <th className="text-left p-1">Incoming</th>
                          <th className="text-left p-1">Use</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conflict.fields.map((field) => {
                          const existingValue = field.existing || "-";
                          const incomingValue = field.incoming || "-";
                          const selectionValue = selection?.fields[field.field] ?? "incoming";
                          return (
                            <tr
                              key={`${key}-${field.field}`}
                              className="border-t border-neutral-800/50"
                            >
                              <td className="p-1 text-neutral-400">
                                {conflictFieldLabels[field.field] ?? field.field}
                              </td>
                              <td className="p-1 whitespace-pre-wrap text-neutral-300">
                                {existingValue}
                              </td>
                              <td className="p-1 whitespace-pre-wrap text-neutral-300">
                                {incomingValue}
                              </td>
                              <td className="p-1">
                                <div className="flex gap-2">
                                  <label className="flex items-center gap-1 text-[10px] text-neutral-400">
                                    <input
                                      type="radio"
                                      name={`${key}-${field.field}`}
                                      value="existing"
                                      checked={selectionValue === "existing"}
                                      disabled={!isMerge}
                                      onChange={() => setFieldChoice(key, field.field, "existing")}
                                    />
                                    Existing
                                  </label>
                                  <label className="flex items-center gap-1 text-[10px] text-neutral-400">
                                    <input
                                      type="radio"
                                      name={`${key}-${field.field}`}
                                      value="incoming"
                                      checked={selectionValue === "incoming"}
                                      disabled={!isMerge}
                                      onChange={() => setFieldChoice(key, field.field, "incoming")}
                                    />
                                    Incoming
                                  </label>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-500">
                    No field differences detected.
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("confirm")}
              disabled={loading}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              data-testid="btn-apply-resolutions"
              onClick={resolveConflicts}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50 font-semibold"
            >
              {loading ? "Applying…" : "Apply Resolutions"}
            </button>
          </div>
        </div>
      )}

      {/* Step resolve-json: Hash-based conflict resolution */}
      {step === "resolve-json" &&
        (() => {
          const BULK_THRESHOLD = 10;
          const showBulk =
            jsonConflicts.length >= BULK_THRESHOLD &&
            bulkAction === null &&
            jsonConflictIndex === 0 &&
            jsonResolutions.length === 0;

          if (showBulk) {
            return (
              <BulkConflictSummaryDialog
                conflictCount={jsonConflicts.length}
                disabled={loading}
                onAction={(action) => {
                  setBulkAction(action);
                  void handleBulkAction(action);
                }}
              />
            );
          }

          const currentConflict = jsonConflicts[jsonConflictIndex];
          if (!currentConflict) return null;

          return (
            <SpellConflictDiffDialog
              conflict={currentConflict}
              conflictIndex={jsonConflictIndex}
              totalConflicts={jsonConflicts.length}
              disabled={loading}
              onResolve={handleConflictResolve}
            />
          );
        })()}

      {/* Step 6a: Result — JSON import */}
      {step === "result" && isJsonImport && jsonImportResult && (
        <div className="space-y-4">
          <div className="p-3 bg-green-900/20 border border-green-900 rounded">
            <div className="text-sm font-semibold text-green-200">Import Complete</div>
            <div className="text-xs text-neutral-400 mt-2 space-y-1">
              <div>✅ Imported: {jsonImportResult.importedCount} spell(s)</div>
              <div>
                ⏭️ Duplicates skipped: {jsonImportResult.duplicatesSkipped.total}
                {jsonImportResult.duplicatesSkipped.mergedCount > 0 &&
                  ` (${jsonImportResult.duplicatesSkipped.mergedCount} with metadata merged)`}
              </div>
              {jsonImportResult.conflictsResolved && (
                <div>
                  🔀 Conflicts resolved: {jsonImportResult.conflictsResolved.keepExistingCount}{" "}
                  kept, {jsonImportResult.conflictsResolved.replaceCount} replaced,{" "}
                  {jsonImportResult.conflictsResolved.keepBothCount} kept both
                </div>
              )}
              {jsonImportResult.failures.length > 0 && (
                <div>❌ Failures: {jsonImportResult.failures.length}</div>
              )}
              {jsonImportResult.warnings.length > 0 && (
                <div>⚠️ Warnings: {jsonImportResult.warnings.length}</div>
              )}
            </div>
          </div>

          {jsonImportResult.failures.length > 0 && (
            <div className="max-h-32 overflow-auto bg-neutral-950 border border-red-900/50 rounded p-2">
              <div className="text-xs text-red-400 font-semibold mb-1">Failures:</div>
              {jsonImportResult.failures.map((f, i) => (
                <div key={`${i}-${f.spellName}`} className="text-xs text-red-300">
                  <span className="font-medium">{f.spellName}</span>: {f.reason}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            data-testid="btn-import-more"
            onClick={reset}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
          >
            Import More Files
          </button>
        </div>
      )}

      {/* Step 6b: Result — legacy import (md/pdf/docx) */}
      {step === "result" && !isJsonImport && result && (
        <div className="space-y-4">
          <div className="p-3 bg-green-900/20 border border-green-900 rounded text-green-400">
            Imported spells: {result.spells.length}
          </div>

          {resolveResult && (
            <div className="p-3 bg-blue-900/20 border border-blue-900 rounded text-blue-200">
              <div className="font-semibold">Conflict resolutions</div>
              <div className="text-sm">
                Updated {resolveResult.resolved.length} spell(s)
                {resolveResult.skipped.length > 0 && `, skipped ${resolveResult.skipped.length}`}
              </div>
              {resolveResult.resolved.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-xs opacity-70">
                    View Updated Names
                  </summary>
                  <ul className="list-disc pl-4 text-xs mt-1">
                    {resolveResult.resolved.slice(0, 10).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                    {resolveResult.resolved.length > 10 && (
                      <li>...and {resolveResult.resolved.length - 10} more</li>
                    )}
                  </ul>
                </details>
              )}
              {resolveResult.skipped.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-xs opacity-70">
                    View Skipped Names
                  </summary>
                  <ul className="list-disc pl-4 text-xs mt-1">
                    {resolveResult.skipped.slice(0, 10).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                    {resolveResult.skipped.length > 10 && (
                      <li>...and {resolveResult.skipped.length - 10} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          {result.skipped && result.skipped.length > 0 && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-900 rounded text-yellow-400">
              <div className="font-semibold">
                {result.skipped.length} spells skipped (duplicates)
              </div>
              <details>
                <summary className="cursor-pointer text-xs opacity-70">View Names</summary>
                <ul className="list-disc pl-4 text-xs mt-1">
                  {result.skipped.slice(0, 10).map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                  {result.skipped.length > 10 && <li>...and {result.skipped.length - 10} more</li>}
                </ul>
              </details>
            </div>
          )}

          {combinedWarnings.length > 0 && (
            <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded text-neutral-400">
              <div className="font-semibold">Warnings</div>
              <ul className="list-disc pl-4 text-xs">
                {combinedWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {resultParseConflicts.length > 0 && (
            <div className="p-3 bg-red-900/20 border border-red-900 rounded text-red-400">
              <div className="font-semibold">Conflicts/Errors</div>
              <ul className="list-disc pl-4 text-xs">
                {resultParseConflicts.map((c) => (
                  <li key={`${c.path}-${c.reason}`}>
                    {c.path}: {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            data-testid="btn-import-more"
            onClick={reset}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
          >
            Import More Files
          </button>
        </div>
      )}
    </div>
  );
}
