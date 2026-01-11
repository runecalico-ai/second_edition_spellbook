import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import FieldMapper, { type ParsedSpell } from "./FieldMapper";

type ImportFile = {
  name: string;
  content: number[];
};

type SpellArtifact = {
  id: number;
  spell_id: number;
  type: string;
  path: string;
  hash: string;
  imported_at: string;
};

type ImportArtifact = {
  type: string;
  path: string;
  hash: string;
  imported_at: string;
};

type SpellDetail = {
  id?: number;
  name: string;
  school?: string;
  sphere?: string;
  class_list?: string;
  level: number;
  range?: string;
  components?: string;
  material_components?: string;
  casting_time?: string;
  duration?: string;
  area?: string;
  saving_throw?: string;
  reversible?: number;
  description: string;
  tags?: string;
  source?: string;
  edition?: string;
  author?: string;
  license?: string;
  artifacts?: SpellArtifact[];
};

type ImportConflict = {
  path: string;
  reason: string;
};

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

type ImportStep = "select" | "preview" | "map" | "confirm" | "result";

const STEP_TITLES: Record<ImportStep, string> = {
  select: "1. Select Files",
  preview: "2. Preview",
  map: "3. Review Fields",
  confirm: "4. Confirm",
  result: "5. Complete",
};

export default function ImportWizard() {
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

  const hasLowConfidence = (spells: ParsedSpell[]): boolean => {
    return spells.some((spell) => {
      const conf = spell._confidence || {};
      return (conf.name ?? 1) < 0.5 || (conf.level ?? 1) < 0.5 || (conf.description ?? 1) < 0.5;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
      setStep("select");
    }
  };

  const goToPreview = async () => {
    if (files.length === 0) return;
    setLoading(true);
    try {
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
      setStep("preview");
    } catch (e) {
      console.error("Preview failed:", e);
      alert(`Preview failed: ${e}`);
    } finally {
      setLoading(false);
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
    setLoading(true);
    try {
      const response = await invoke<ImportResult>("import_files", {
        files: filePayloads,
        allowOverwrite,
        spells: mappedSpells,
        artifacts: previewArtifacts,
        conflicts: previewConflicts,
      });
      setResult(response);
      setStep("result");
    } catch (e) {
      console.error("Import failed:", e);
      alert(`Import failed: ${e}`);
    } finally {
      setLoading(false);
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
  };

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <div className="flex gap-2 text-xs">
        {(Object.keys(STEP_TITLES) as ImportStep[]).map((s) => (
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
          <input
            type="file"
            multiple
            accept=".md,.pdf,.docx"
            onChange={handleFileChange}
            className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-neutral-800 file:text-neutral-300 hover:file:bg-neutral-700"
          />
          {files.length > 0 && (
            <>
              <pre className="text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800 text-neutral-500 max-h-32 overflow-auto">
                {files.map((f) => f.name).join("\n")}
              </pre>
              <div className="text-sm text-neutral-400">{files.length} file(s) selected</div>
              <button
                type="button"
                onClick={goToPreview}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Parsing…" : "Preview →"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded">
            <div className="text-sm font-semibold">Parsed {previewSpells.length} spell(s)</div>
            {previewConflicts.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {previewConflicts.length} file(s) could not be parsed
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
              onClick={() => setStep("select")}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={goToMap}
              className="px-3 py-2 bg-yellow-600 rounded hover:bg-yellow-500"
            >
              Review Fields
            </button>
            <button
              type="button"
              onClick={skipMapping}
              className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500"
            >
              Skip Review →
            </button>
          </div>
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
            <div className="text-sm font-semibold">
              Ready to import {mappedSpells.length} spell(s)
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-neutral-900/50 p-3 rounded border border-neutral-800">
            <input
              type="checkbox"
              id="allowOverwrite"
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
              onClick={() => setStep("preview")}
              className="px-3 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={doImport}
              disabled={loading}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-500 disabled:opacity-50 font-semibold"
            >
              {loading ? "Importing…" : "Start Import"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div className="p-3 bg-green-900/20 border border-green-900 rounded text-green-400">
            Imported spells: {result.spells.length}
          </div>

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

          {result.warnings.length > 0 && (
            <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded text-neutral-400">
              <div className="font-semibold">Warnings</div>
              <ul className="list-disc pl-4 text-xs">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {result.conflicts.length > 0 && (
            <div className="p-3 bg-red-900/20 border border-red-900 rounded text-red-400">
              <div className="font-semibold">Conflicts/Errors</div>
              <ul className="list-disc pl-4 text-xs">
                {result.conflicts.map((c) => (
                  <li key={`${c.path}-${c.reason}`}>
                    {c.path}: {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
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
