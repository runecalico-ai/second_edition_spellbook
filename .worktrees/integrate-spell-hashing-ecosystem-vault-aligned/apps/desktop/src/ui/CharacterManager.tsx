import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce"; // Assuming this exists or I'll implement a simple one
import { useModal } from "../store/useModal";
import type {
  Character,
  CharacterBundle,
  CharacterClass,
  CharacterSearchResult,
} from "../types/character";
import CharacterImportWizard from "./CharacterImportWizard";

export default function CharacterManager() {
  const { alert: modalAlert } = useModal();
  const [characters, setCharacters] = useState<CharacterSearchResult[]>([]);
  // const [charClasses, setCharClasses] = useState<Record<number, CharacterClass[]>>({}); // No longer needed
  const [newCharName, setNewCharName] = useState("");
  const [newCharType, setNewCharType] = useState<"PC" | "NPC">("PC");

  // Search Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PC" | "NPC">("ALL");
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Advanced filters (toggleable?)
  const [showFilters, setShowFilters] = useState(false);
  const [raceFilter, setRaceFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [minLevel, setMinLevel] = useState<string>("");
  const [maxLevel, setMaxLevel] = useState<string>("");
  const [minStr, setMinStr] = useState<string>("");
  const [minDex, setMinDex] = useState<string>("");
  const [minCon, setMinCon] = useState<string>("");
  const [minInt, setMinInt] = useState<string>("");
  const [minWis, setMinWis] = useState<string>("");
  const [minCha, setMinCha] = useState<string>("");
  const [minCom, setMinCom] = useState<string>("");

  const [showImportWizard, setShowImportWizard] = useState(false);

  // State for export modal
  const [exportTarget, setExportTarget] = useState<{ id: number; name: string } | null>(null);

  const loadCharacters = useCallback(async () => {
    setSearching(true);
    try {
      const results = await invoke<CharacterSearchResult[]>("search_characters", {
        filters: {
          query: debouncedQuery || null,
          characterType: typeFilter === "ALL" ? null : typeFilter,
          race: raceFilter || null,
          className: classFilter || null,
          minLevel: minLevel ? Number.parseInt(minLevel, 10) : null,
          maxLevel: maxLevel ? Number.parseInt(maxLevel, 10) : null,
          minStr: minStr ? Number.parseInt(minStr, 10) : null,
          minDex: minDex ? Number.parseInt(minDex, 10) : null,
          minCon: minCon ? Number.parseInt(minCon, 10) : null,
          minInt: minInt ? Number.parseInt(minInt, 10) : null,
          minWis: minWis ? Number.parseInt(minWis, 10) : null,
          minCha: minCha ? Number.parseInt(minCha, 10) : null,
          minCom: minCom ? Number.parseInt(minCom, 10) : null,
        },
      });
      setCharacters(results);
    } catch (e) {
      console.error("Failed to load characters:", e);
    } finally {
      setSearching(false);
    }
  }, [
    debouncedQuery,
    typeFilter,
    raceFilter,
    classFilter,
    minLevel,
    maxLevel,
    minStr,
    minDex,
    minCon,
    minInt,
    minWis,
    minCha,
    minCom,
  ]);

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

  // No Client-side filtering needed anymore
  // getPrimaryClass is not needed, using levelSummary

  return (
    <div className="flex h-full gap-6 p-4">
      <div className="w-80 border-r border-neutral-800 pr-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Characters</h1>
          <div className="flex gap-1" data-testid="character-type-filters">
            <button
              type="button"
              data-testid="btn-toggle-filters"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1 rounded text-neutral-400 hover:text-white ${showFilters ? "bg-neutral-800 text-white" : ""}`}
              title="Toggle Search Filters"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                className="w-full bg-neutral-900 border border-neutral-700 p-1.5 pl-7 rounded text-sm placeholder-neutral-600 outline-none focus:border-blue-600/50"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="character-search-input"
                aria-label="Search characters"
              />
              <div className="absolute left-2 top-1.5 text-neutral-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>
            <div className="flex bg-neutral-900 rounded border border-neutral-700 p-0.5">
              {(["ALL", "PC", "NPC"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`filter-type-${t.toLowerCase()}`}
                  onClick={() => setTypeFilter(t)}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    typeFilter === t
                      ? "bg-blue-600 text-white font-medium"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {showFilters && (
            <div
              className="bg-neutral-900/50 border border-neutral-800 rounded p-2 grid grid-cols-2 gap-2 text-xs"
              data-testid="character-advanced-filters"
            >
              <input
                className="bg-neutral-950 border border-neutral-800 rounded p-1"
                placeholder="Race..."
                data-testid="filter-race-input"
                value={raceFilter}
                onChange={(e) => setRaceFilter(e.target.value)}
                aria-label="Filter by race"
              />
              <input
                className="bg-neutral-950 border border-neutral-800 rounded p-1"
                placeholder="Class..."
                data-testid="filter-class-input"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                aria-label="Filter by class"
              />
              <div className="col-span-2 flex gap-2 items-center">
                <span className="text-neutral-600 uppercase text-[9px] font-bold">Level</span>
                <input
                  className="bg-neutral-950 border border-neutral-800 rounded p-1 w-full"
                  placeholder="Min"
                  type="number"
                  min="0"
                  data-testid="filter-level-min-input"
                  value={minLevel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") setMinLevel("");
                    else {
                      const num = Number.parseInt(val, 10);
                      if (!Number.isNaN(num)) setMinLevel(Math.max(0, num).toString());
                    }
                  }}
                  aria-label="Minimum level"
                />
                <span className="text-neutral-600">-</span>
                <input
                  className="bg-neutral-950 border border-neutral-800 rounded p-1 w-full"
                  placeholder="Max"
                  type="number"
                  min="0"
                  data-testid="filter-level-max-input"
                  value={maxLevel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") setMaxLevel("");
                    else {
                      const num = Number.parseInt(val, 10);
                      if (!Number.isNaN(num)) setMaxLevel(Math.max(0, num).toString());
                    }
                  }}
                  aria-label="Maximum level"
                />
              </div>

              <div className="col-span-2 flex flex-wrap gap-2 items-center pt-2 border-t border-neutral-800">
                <span className="text-neutral-500 w-full text-[9px] uppercase font-bold tracking-wider">
                  Minimum Abilities
                </span>
                {(["Str", "Dex", "Con", "Int", "Wis", "Cha", "Com"] as const).map((ab) => {
                  const val =
                    ab === "Str"
                      ? minStr
                      : ab === "Dex"
                        ? minDex
                        : ab === "Con"
                          ? minCon
                          : ab === "Int"
                            ? minInt
                            : ab === "Wis"
                              ? minWis
                              : ab === "Cha"
                                ? minCha
                                : minCom;
                  const setVal =
                    ab === "Str"
                      ? setMinStr
                      : ab === "Dex"
                        ? setMinDex
                        : ab === "Con"
                          ? setMinCon
                          : ab === "Int"
                            ? setMinInt
                            : ab === "Wis"
                              ? setMinWis
                              : ab === "Cha"
                                ? setMinCha
                                : setMinCom;
                  return (
                    <div key={ab} className="flex flex-col w-12">
                      <label
                        htmlFor={`filter-min-${ab.toLowerCase()}`}
                        className="text-[10px] text-neutral-500 text-center"
                      >
                        {ab.toUpperCase()}
                      </label>
                      <input
                        id={`filter-min-${ab.toLowerCase()}`}
                        className="bg-neutral-950 border border-neutral-800 rounded p-1 text-center text-xs"
                        placeholder="-"
                        type="number"
                        min="0"
                        value={val}
                        onChange={(e) => {
                          const v = e.target.value;
                          const num = Number.parseInt(v, 10);
                          if (v === "" || Number.isNaN(num)) setVal("");
                          else setVal(Math.max(0, num).toString());
                        }}
                        aria-label={`Minimum ${ab}`}
                        data-testid={`filter-min-${ab.toLowerCase()}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
          {searching && characters.length === 0 && (
            <div className="p-4 flex flex-col items-center gap-2 animate-pulse">
              <div className="h-10 w-full bg-neutral-800 rounded-lg" />
              <div className="h-10 w-full bg-neutral-800 rounded-lg" />
              <div className="h-10 w-full bg-neutral-800 rounded-lg" />
            </div>
          )}
          {characters.map((c) => (
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
                    {c.levelSummary || "Level 1"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {characters.length === 0 && (
            <div
              className="p-4 text-center text-sm text-neutral-600 italic"
              data-testid="no-characters-found"
            >
              No characters found matching logic.
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
