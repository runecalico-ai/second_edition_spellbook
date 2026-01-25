import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useModal } from "../store/useModal";
import type { Character, CharacterBundle, CharacterClass } from "../types/character";
import CharacterImportWizard from "./CharacterImportWizard";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";

export default function CharacterManager() {
  const { alert: modalAlert } = useModal();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [charClasses, setCharClasses] = useState<Record<number, CharacterClass[]>>({});
  const [newCharName, setNewCharName] = useState("");
  const [newCharType, setNewCharType] = useState<"PC" | "NPC">("PC");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PC" | "NPC">("ALL");
  const [showImportWizard, setShowImportWizard] = useState(false);

  // State for export modal
  const [exportTarget, setExportTarget] = useState<{ id: number; name: string } | null>(null);

  const loadCharacters = useCallback(async () => {
    try {
      const list = await invoke<Character[]>("list_characters");
      setCharacters(list);

      // Load classes for all characters in parallel to show primary class information
      const classMap: Record<number, CharacterClass[]> = {};
      await Promise.all(
        list.map(async (char) => {
          try {
            const classes = await invoke<CharacterClass[]>("get_character_classes", {
              characterId: char.id,
            });
            classMap[char.id] = classes;
          } catch (e) {
            console.error(`Failed to load classes for ${char.name}:`, e);
          }
        }),
      );
      setCharClasses(classMap);
    } catch (e) {
      console.error("Failed to load characters:", e);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const createCharacter = async () => {
    if (!newCharName.trim()) return;
    try {
      await invoke("create_character", {
        name: newCharName,
        characterType: newCharType,
        notes: "",
      });
      setNewCharName("");
      setNewCharType("PC");
      loadCharacters();
    } catch (e) {
      console.error(e);
      await modalAlert(`Failed to create character: ${e}`, "Error", "error");
    }
  };

  const deleteCharacter = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault();
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await invoke("delete_character", { id });
      loadCharacters();
    } catch (e) {
      console.error(e);
      await modalAlert(`Failed to delete character: ${e}`, "Error", "error");
    }
  };

  const openExportModal = (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log(`[UI] Opening export modal for ${name} (${id})`);
    setExportTarget({ id, name });
  };

  const doExportJSON = async () => {
    if (!exportTarget) return;
    console.log(`[Export] Starting JSON export for ${exportTarget.name}`);
    try {
      const bundle = await invoke<CharacterBundle>("export_character_bundle", {
        characterId: exportTarget.id,
      });
      console.log(`[Export] Bundle received for ${bundle.name}`);
      const defaultFilename = `${exportTarget.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;

      // Fallback for E2E testing
      if (window.__IS_PLAYWRIGHT__) {
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportTarget(null);
        await modalAlert("Character exported successfully!", "Export Complete", "success");
        return;
      }

      const filePath = await save({
        filters: [
          {
            name: "JSON Character Bundle",
            extensions: ["json"],
          },
        ],
        defaultPath: defaultFilename,
      });

      if (!filePath) return; // User cancelled

      await writeTextFile(filePath, JSON.stringify(bundle, null, 2));

      setExportTarget(null);
      await modalAlert("Character exported successfully!", "Export Complete", "success");
    } catch (e) {
      console.error("[Export] JSON failed:", e);
      await modalAlert(`Failed to export: ${e}`, "Export Error", "error");
    }
  };

  const doExportMarkdown = async () => {
    if (!exportTarget) return;
    console.log(`[Export] Starting Markdown ZIP export for ${exportTarget.name}`);
    try {
      // export_character_markdown_zip returns Vec<u8> which comes as number[] in JS
      const zipBytes = await invoke<number[]>("export_character_markdown_zip", {
        characterId: exportTarget.id,
      });
      console.log(`[Export] ZIP bytes received: ${zipBytes.length}`);
      const defaultFilename = `${exportTarget.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.zip`;

      // Fallback for E2E testing
      if (window.__IS_PLAYWRIGHT__) {
        const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportTarget(null);
        await modalAlert("Character exported successfully!", "Export Complete", "success");
        return;
      }

      const filePath = await save({
        filters: [
          {
            name: "Markdown ZIP Bundle",
            extensions: ["zip"],
          },
        ],
        defaultPath: defaultFilename,
      });

      if (!filePath) return; // User cancelled

      await writeFile(filePath, new Uint8Array(zipBytes));

      setExportTarget(null);
      await modalAlert("Character exported successfully!", "Export Complete", "success");
    } catch (e) {
      console.error("[Export] Markdown failed:", e);
      await modalAlert(`Failed to export: ${e}`, "Export Error", "error");
    }
  };

  const filteredCharacters = characters.filter((c) => {
    if (typeFilter === "ALL") return true;
    return c.characterType === typeFilter;
  });

  const getPrimaryClass = (charId: number) => {
    const classes = charClasses[charId];
    if (!classes || classes.length === 0) return null;
    // For simplicity, first class is "primary" or show multi-class string
    if (classes.length === 1) return `${classes[0].className} ${classes[0].level}`;
    return classes.map((c) => `${c.className.charAt(0)}${c.level}`).join("/");
  };

  return (
    <div className="flex h-full gap-6 p-4">
      <div className="w-80 border-r border-neutral-800 pr-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Characters</h1>
          <div className="flex gap-1" data-testid="character-type-filters">
            {(["ALL", "PC", "NPC"] as const).map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`filter-type-${t.toLowerCase()}`}
                onClick={() => setTypeFilter(t)}
                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                  typeFilter === t
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-500"
                }`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowImportWizard(true)}
              className="ml-2 px-2 py-0.5 text-[10px] bg-neutral-800 text-white rounded border border-neutral-700 hover:bg-neutral-700 hover:border-neutral-600"
              data-testid="btn-open-import-wizard"
            >
              Import
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="w-full bg-neutral-900 border border-neutral-700 p-1 rounded text-sm placeholder-neutral-600"
            placeholder="New Name"
            data-testid="new-character-name-input"
            aria-label="New character name"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
          />
          <button
            type="button"
            data-testid="btn-create-character"
            onClick={createCharacter}
            className="px-3 bg-blue-600 rounded text-sm hover:bg-blue-500 transition-colors"
          >
            +
          </button>
        </div>

        <div
          className="space-y-1 overflow-auto max-h-[calc(100vh-250px)]"
          data-testid="character-list"
        >
          {filteredCharacters.map((c) => (
            <Link
              key={c.id}
              to={`/character/${c.id}/edit`}
              data-testid={`character-item-${c.name.replace(/\s+/g, "-").toLowerCase()}`}
              className="block w-full text-left px-3 py-2 rounded text-neutral-300 hover:bg-neutral-800/50 group relative"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium group-hover:text-white transition-colors"
                    data-testid="character-name-label"
                  >
                    {c.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-1 rounded bg-neutral-800 text-neutral-500 uppercase tracking-tighter"
                      data-testid="character-type-badge"
                    >
                      {c.characterType}
                    </span>
                    <button
                      type="button"
                      data-testid="btn-export-character"
                      onClick={(e) => openExportModal(e, c.id, c.name)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-blue-400 transition-all"
                      title="Export Character"
                    >
                      <svg
                        role="img"
                        aria-label="Export"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      data-testid="btn-delete-character"
                      onClick={(e) => deleteCharacter(e, c.id, c.name)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-500 transition-all"
                      title="Delete Character"
                    >
                      <svg
                        role="img"
                        aria-label="Delete"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span data-testid="character-info-label">
                    {c.race || "No Race"} · {c.alignment || "No Align"}
                  </span>
                  <span className="text-neutral-400 font-mono" data-testid="character-class-label">
                    {getPrimaryClass(c.id) || "No Class"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {filteredCharacters.length === 0 && (
            <div
              className="p-4 text-center text-sm text-neutral-600 italic"
              data-testid="no-characters-found"
            >
              {typeFilter === "ALL" ? "No characters yet." : `No ${typeFilter} characters.`}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-neutral-800">
          <Link
            to="/"
            data-testid="link-back-to-library"
            className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors"
          >
            ← Back to Library
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-neutral-900/30 rounded-lg border border-neutral-800/50 border-dashed">
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="h-12 w-12 bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-neutral-500">
            <svg
              role="img"
              aria-label="User"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-200">Select a Character</h3>
          <p className="text-sm text-neutral-500">
            Select a character from the list to manage their identity, abilities, classes, and
            spellbook.
          </p>
          <div className="pt-2">
            <p className="text-xs text-neutral-600 leading-relaxed">
              Multi-class characters can manage spells for each class independently.
            </p>
          </div>
        </div>
      </div>

      {showImportWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <CharacterImportWizard
            onComplete={() => {
              setShowImportWizard(false);
              loadCharacters();
            }}
            onCancel={() => setShowImportWizard(false)}
          />
        </div>
      )}

      {exportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl w-full max-w-md p-6 relative">
            <h2 className="text-lg font-bold text-neutral-100 mb-4">Export Character</h2>
            <p className="text-sm text-neutral-400 mb-6">
              Choose a format to export <strong>{exportTarget.name}</strong>.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={doExportJSON}
                data-testid="btn-export-json"
                className="w-full flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition-colors"
                id="btn-export-json"
              >
                <div className="text-left">
                  <div className="font-semibold text-neutral-200">JSON Bundle</div>
                  <div className="text-xs text-neutral-500">
                    Full backup, importable by this app.
                  </div>
                </div>
                <div className="text-neutral-400">↓</div>
              </button>

              <button
                type="button"
                onClick={doExportMarkdown}
                data-testid="btn-export-markdown"
                className="w-full flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition-colors"
                id="btn-export-markdown"
              >
                <div className="text-left">
                  <div className="font-semibold text-neutral-200">Markdown + ZIP</div>
                  <div className="text-xs text-neutral-500">Editable folder of markdown files.</div>
                </div>
                <div className="text-neutral-400">↓</div>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                data-testid="btn-export-cancel"
                onClick={() => {
                  console.log("[UI] Cancelling export modal");
                  setExportTarget(null);
                }}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
