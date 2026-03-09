import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useModal } from "../store/useModal";
import type { Character, CharacterBundle } from "../types/character";

export default function CharacterImportWizard({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { alert: modalAlert } = useModal();
  const [step, setStep] = useState<"select" | "preview" | "importing">("select");
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<CharacterBundle | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [existingCharacters, setExistingCharacters] = useState<Character[]>([]);
  const [collision, setCollision] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Character[]>("list_characters")
      .then(setExistingCharacters)
      .catch((e) => console.error("Failed to list characters:", e));
  }, []);

  useEffect(() => {
    if (bundle) {
      const exists = existingCharacters.some(
        (c) => c.name.toLowerCase() === bundle.name.toLowerCase(),
      );
      setCollision(exists);
    }
  }, [bundle, existingCharacters]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);

      try {
        let parsed: CharacterBundle;
        if (selectedFile.name.endsWith(".zip")) {
          const bytes = await selectedFile.arrayBuffer();
          parsed = await invoke<CharacterBundle>("preview_character_markdown_zip", {
            bytes: Array.from(new Uint8Array(bytes)),
          });
        } else {
          const text = await selectedFile.text();
          parsed = JSON.parse(text) as CharacterBundle;
        }

        if (!parsed.formatVersion || !parsed.name || !parsed.classes) {
          throw new Error("Invalid character bundle: missing required fields.");
        }

        if (parsed.format && parsed.format !== "adnd2e-character") {
          throw new Error(
            `Invalid bundle format: expected 'adnd2e-character', got '${parsed.format}'`,
          );
        }

        setBundle(parsed);

        const exists = existingCharacters.some(
          (c) => c.name.toLowerCase() === parsed.name.toLowerCase(),
        );
        setCollision(exists);

        setStep("preview");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to parse file: ${message}`);
        setFile(null);
      }
    }
  };

  const doImport = async () => {
    if (!bundle || !file) return;
    setStep("importing");
    try {
      if (file.name.endsWith(".zip")) {
        const bytes = await file.arrayBuffer();
        await invoke("import_character_markdown_zip", {
          bytes: Array.from(new Uint8Array(bytes)),
          options: { overwrite },
        });
      } else {
        await invoke("import_character_bundle", {
          bundle,
          options: { overwrite },
        });
      }
      await modalAlert("Character imported successfully!", "Import Complete", "success");
      onComplete();
    } catch (e: unknown) {
      console.error("Import error:", e);
      await modalAlert(`Import failed: ${e}`, "Error", "error");
      setStep("preview");
    }
  };

  const totalSpells = bundle?.classes.reduce((acc, c) => acc + c.spells.length, 0) || 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg w-[500px] max-w-full flex flex-col max-h-[90vh]">
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
        <h2 className="text-lg font-bold text-white">Import Character</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-neutral-500 hover:text-white"
          data-testid="btn-close-import-wizard"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {step === "select" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-neutral-800 rounded-lg p-8 text-center hover:border-blue-600 transition-colors">
              <input
                type="file"
                accept=".json,.zip"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                data-testid="import-file-input"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <div className="h-10 w-10 bg-neutral-800 rounded-full flex items-center justify-center text-blue-500">
                  📂
                </div>
                <span className="text-sm font-medium text-neutral-300">
                  Click to select a JSON or ZIP file
                </span>
                <span className="text-xs text-neutral-500">
                  Supports JSON bundles or Markdown ZIP bundles
                </span>
              </label>
            </div>
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {step === "preview" && bundle && (
          <div className="space-y-4">
            <div className="p-4 bg-neutral-800 rounded-lg space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-white" data-testid="preview-char-name">
                    {bundle.name}
                  </h3>
                  <div className="text-xs text-neutral-400">
                    {bundle.race || "Unknown Race"} · {bundle.alignment || "Unaligned"} ·{" "}
                    {bundle.characterType}
                  </div>
                </div>
                {collision && !overwrite ? (
                  <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 text-xs rounded border border-yellow-900">
                    Exists
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded border border-green-900">
                    New
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-neutral-700/50 grid grid-cols-2 gap-2 text-sm text-neutral-300">
                <div>
                  <span className="text-neutral-500 text-xs block">Classes</span>
                  {bundle.classes.map((c, i) => (
                    <div key={`${c.className}-${c.level}-${i}`}>
                      {c.className} (Lvl {c.level})
                    </div>
                  ))}
                </div>
                <div>
                  <span className="text-neutral-500 text-xs block">Stats</span>
                  <div>{totalSpells} Spells</div>
                  <div>Comeliness: {bundle.comEnabled ? "Yes" : "No"}</div>
                </div>
              </div>
            </div>

            {collision && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-900/50 rounded">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="overwrite-check"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="mt-1 rounded bg-neutral-900 border-neutral-700 text-yellow-600 focus:ring-yellow-500"
                    data-testid="overwrite-checkbox"
                  />
                  <label
                    htmlFor="overwrite-check"
                    className="text-sm text-yellow-200 cursor-pointer"
                  >
                    Starting a new journey? Overwrite existing character data.
                    <div className="text-xs text-yellow-500/80 mt-0.5">
                      Unchecked: Creates a copy "{bundle.name} (Imported)"
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="text-neutral-400 text-sm">Importing character data...</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex justify-end gap-2">
        {step === "select" && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
            data-testid="btn-cancel-import"
          >
            Cancel
          </button>
        )}

        {step === "preview" && (
          <>
            <button
              type="button"
              onClick={() => {
                setStep("select");
                setFile(null);
                setBundle(null);
              }}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              data-testid="btn-back-import"
            >
              Back
            </button>
            <button
              type="button"
              onClick={doImport}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 transition-colors"
              data-testid="btn-confirm-import"
            >
              Import Character
            </button>
          </>
        )}
      </div>
    </div>
  );
}
