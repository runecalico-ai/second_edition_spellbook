import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ImportFile = {
  name: string;
  content: string;
};

type ImportResult = {
  spells: any[];
  artifacts: any[];
  conflicts: any[];
  warnings: string[];
  skipped: string[];
};

export default function ImportWizard() {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
    }
  };

  const doImport = async () => {
    if (files.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const filePayloads = await Promise.all(
        files.map(async (f) => {
          const buf = await f.arrayBuffer();
          const content = Array.from(new Uint8Array(buf));
          return {
            name: f.name,
            content: content,
          };
        })
      );
      const response = await invoke<ImportResult>("import_files", {
        files: filePayloads,
        allowOverwrite
      });
      setResult(response);
    } catch (e) {
      console.error("Import failed:", e);
      alert("Import failed: " + e);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-neutral-800 file:text-neutral-300 hover:file:bg-neutral-700"
      />
      <div className="flex items-center space-x-2 bg-neutral-900/50 p-2 rounded border border-neutral-800">
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

      <button
        className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700 disabled:opacity-50"
        onClick={doImport}
        disabled={files.length === 0 || importing}
        type="button"
      >
        {importing ? "Importing…" : "Start Import"}
      </button>

      {files.length > 0 && (
        <pre className="text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800 text-neutral-500">
          {files.map((f) => f.name).join("\n")}
        </pre>
      )}

      {result && (
        <div className="text-sm space-y-2 mt-4">
          <div className="p-3 bg-green-900/20 border border-green-900 rounded text-green-400">
            Imported spells: {result.spells.length}
          </div>

          {result.skipped && result.skipped.length > 0 && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-900 rounded text-yellow-400">
              <div className="font-semibold">Skipped (Duplicate)</div>
              <div>{result.skipped.length} spells skipped.</div>
              <details>
                <summary className="cursor-pointer text-xs opacity-70">View Names</summary>
                <ul className="list-disc pl-4 text-xs mt-1">
                  {result.skipped.slice(0, 10).map(name => <li key={name}>{name}</li>)}
                  {result.skipped.length > 10 && <li>...and {result.skipped.length - 10} more</li>}
                </ul>
              </details>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-md p-2 text-neutral-400">
              <div className="font-semibold">Warnings</div>
              <ul className="list-disc pl-4 text-xs">
                {result.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.conflicts.length > 0 && (
            <div className="bg-red-900/20 border border-red-900 rounded-md p-2 text-red-400">
              <div className="font-semibold">Conflicts/Errors</div>
              <ul className="list-disc pl-4 text-xs">
                {result.conflicts.map((c, i) => (
                  <li key={i}>
                    {c.path}: {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
