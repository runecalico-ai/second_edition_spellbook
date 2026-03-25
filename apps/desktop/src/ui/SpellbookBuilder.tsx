import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, EmptyStateLiveRegion } from "./components/EmptyState";

const PRINT_LAYOUTS = [
  { id: "compact", label: "Print Compact" },
  { id: "stat-block", label: "Print Stat-block" },
] as const;

type Character = {
  id: number;
  name: string;
  type: "PC" | "NPC";
  notes?: string;
};

type CharacterSpellbookEntry = {
  spellId: number;
  spellName: string;
  spellLevel: number;
  spellSchool?: string;
  prepared: number;
  known: number;
  notes?: string;
};

type SpellSummary = {
  id: number;
  name: string;
  school?: string;
  level: number;
  isQuestSpell: number;
};

type Facets = {
  schools: string[];
  levels: number[];
};

type SearchFilters = {
  schools?: string[] | null;
  levelMin?: number | null;
  levelMax?: number | null;
  isQuestSpell?: boolean | null;
  isCantrip?: boolean | null;
};

const builderMutedTextClass = "text-neutral-600 dark:text-neutral-400";
const builderHeaderSelectClass =
  "rounded border border-neutral-500 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const builderHeaderSecondaryActionClass =
  "rounded border border-neutral-500 bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";
const builderBackLinkClass =
  "text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white";

export default function SpellbookBuilder() {
  const { id } = useParams();
  const characterId = Number.parseInt(id || "", 10);
  const [character, setCharacter] = useState<Character | null>(null);
  const [characterLoaded, setCharacterLoaded] = useState(false);
  const [spellbook, setSpellbook] = useState<CharacterSpellbookEntry[]>([]);
  const [facets, setFacets] = useState<Facets>({ schools: [], levels: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<SpellSummary[]>([]);
  const [schoolFilters, setSchoolFilters] = useState<string[]>([]);
  const [levelMin, setLevelMin] = useState("");
  const [levelMax, setLevelMax] = useState("");
  const [isQuestFilter, setIsQuestFilter] = useState(false);
  const [isCantripFilter, setIsCantripFilter] = useState(false);
  const [spellbookLoaded, setSpellbookLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pageSize, setPageSize] = useState<"a4" | "letter">("letter");
  const headerPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const backLinkRef = useRef<HTMLAnchorElement | null>(null);
  const pickerDialogRef = useRef<HTMLDialogElement | null>(null);
  const pickerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastPickerTriggerRef = useRef<HTMLElement | null>(null);
  const wasPickerOpenRef = useRef(false);

  const spellIds = useMemo(() => new Set(spellbook.map((entry) => entry.spellId)), [spellbook]);
  const spellbookIsPendingInitialLoad = !spellbookLoaded && spellbook.length === 0;
  const showEmptySpellbook = spellbookLoaded && spellbook.length === 0;

  const loadCharacter = useCallback(async () => {
    if (!Number.isFinite(characterId)) return;
    const list = await invoke<Character[]>("list_characters");
    setCharacter(list.find((item) => item.id === characterId) ?? null);
    setCharacterLoaded(true);
  }, [characterId]);

  const loadSpellbook = useCallback(async () => {
    if (!Number.isFinite(characterId)) return;
    setSpellbookLoaded(false);
    const book = await invoke<CharacterSpellbookEntry[]>("get_character_spellbook", {
      characterId: characterId,
    });
    setSpellbook(book);
    setSpellbookLoaded(true);
  }, [characterId]);

  const loadFacets = useCallback(async () => {
    const data = await invoke<{ schools: string[]; levels: number[] }>("list_facets");
    // Ensure 10, 11, 12 are always available in facets
    const allLevels = Array.from(new Set([...data.levels, 10, 11, 12])).sort((a, b) => a - b);
    setFacets({ schools: data.schools, levels: allLevels });
  }, []);

  const searchPicker = useCallback(async () => {
    let parsedMin = levelMin ? Number.parseInt(levelMin, 10) : null;
    let parsedMax = levelMax ? Number.parseInt(levelMax, 10) : null;
    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      [parsedMin, parsedMax] = [parsedMax, parsedMin];
    }
    const filters: SearchFilters = {
      schools: schoolFilters.length > 0 ? schoolFilters : null,
      levelMin: parsedMin,
      levelMax: parsedMax,
      isQuestSpell: isQuestFilter || null,
      isCantrip: isCantripFilter || null,
    };
    const results = await invoke<SpellSummary[]>("search_keyword", {
      query: pickerQuery,
      filters,
    });
    setPickerResults(results);
  }, [levelMin, levelMax, pickerQuery, schoolFilters, isQuestFilter, isCantripFilter]);

  useEffect(() => {
    loadCharacter();
    loadSpellbook();
    loadFacets();
  }, [loadCharacter, loadSpellbook, loadFacets]);

  useEffect(() => {
    if (!pickerOpen) return;
    searchPicker();
  }, [pickerOpen, searchPicker]);

  useEffect(() => {
    if (pickerOpen && characterLoaded && !character) {
      setPickerOpen(false);
    }
  }, [pickerOpen, characterLoaded, character]);

  useEffect(() => {
    if (!pickerOpen) {
      if (wasPickerOpenRef.current) {
        if (lastPickerTriggerRef.current?.isConnected) {
          lastPickerTriggerRef.current.focus();
        } else if (headerPickerButtonRef.current?.isConnected) {
          headerPickerButtonRef.current?.focus();
        } else {
          backLinkRef.current?.focus();
        }
      }
      wasPickerOpenRef.current = false;
      return;
    }

    wasPickerOpenRef.current = true;
    pickerSearchInputRef.current?.focus();
  }, [pickerOpen]);

  const addSpell = async (spell: SpellSummary) => {
    if (!character) return;
    if (spellIds.has(spell.id)) return;
    try {
      await invoke("update_character_spell", {
        characterId: character.id,
        spellId: spell.id,
        prepared: 0,
        known: 1,
        notes: "",
      });
      await loadSpellbook();
    } catch (e) {
      alert(`Failed to add spell: ${e}`);
    }
  };

  const removeSpell = async (entry: CharacterSpellbookEntry) => {
    if (!character) return;
    try {
      await invoke("remove_character_spell", {
        characterId: character.id,
        spellId: entry.spellId,
      });
      await loadSpellbook();
    } catch (e) {
      alert(`Failed to remove spell: ${e}`);
    }
  };

  const updateSpell = async (
    entry: CharacterSpellbookEntry,
    previousEntry?: CharacterSpellbookEntry,
  ) => {
    if (!character) return;
    try {
      await invoke("update_character_spell", {
        characterId: character.id,
        spellId: entry.spellId,
        prepared: entry.prepared,
        known: entry.known,
        notes: entry.notes,
      });
    } catch (e) {
      setStatusMessage(`Failed to update ${entry.spellName}: ${e}`);
      if (previousEntry) {
        setSpellbook((prev) =>
          prev.map((spell) => (spell.spellId === previousEntry.spellId ? previousEntry : spell)),
        );
      }
    }
  };

  const updateNotes = (spellId: number, notes: string) => {
    setSpellbook((prev) =>
      prev.map((spell) => (spell.spellId === spellId ? { ...spell, notes } : spell)),
    );
  };

  const persistNotes = (spellId: number) => {
    const entry = spellbook.find((spell) => spell.spellId === spellId);
    if (entry) {
      updateSpell(entry);
    }
  };

  const printSpellbook = async (layout: "compact" | "stat-block") => {
    if (!character) return;
    setStatusMessage("Generating spellbook print…");
    try {
      const path = await invoke<string>("print_spellbook", {
        characterId: character.id,
        layout,
        pageSize,
      });
      setStatusMessage(path ? `Print ready: ${path}` : "No output returned");
    } catch (e) {
      setStatusMessage(`Print failed: ${e}`);
    }
  };

  const openPicker = (event?: React.MouseEvent<HTMLButtonElement>) => {
    lastPickerTriggerRef.current =
      event?.currentTarget ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // TODO(chunk-5): picker overlay still needs a hardened focus trap and full modal parity review in the Chunk 5 accessibility pass.
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
  };

  const handlePickerKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }

    if (event.key !== "Tab" || !pickerDialogRef.current) {
      return;
    }

    const focusableElements = Array.from(
      pickerDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!Number.isFinite(characterId)) {
    return (
      <div className="p-4 space-y-2">
        <h2 className="text-xl font-bold">Spellbook Builder</h2>
        <p className={builderMutedTextClass}>Invalid character selection.</p>
        <Link
          ref={backLinkRef}
          to="/character"
          className={builderBackLinkClass}
        >
          ← Back to Characters
        </Link>
      </div>
    );
  }

  if (characterLoaded && !character) {
    return (
      <div className="p-4 space-y-2">
        <h2 className="text-xl font-bold">Spellbook Builder</h2>
        <p className={builderMutedTextClass}>Character not found.</p>
        <Link
          ref={backLinkRef}
          to="/character"
          className={builderBackLinkClass}
        >
          ← Back to Characters
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full overflow-auto">
      <EmptyStateLiveRegion
        heading="No Spells Added"
        description="This character's spellbook is empty."
        testId="empty-character-spellbook-state"
        active={showEmptySpellbook}
      />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Spellbook Builder</h1>
          {character ? (
            <p className={`text-sm ${builderMutedTextClass}`} data-testid="character-summary-label">
              {character.name} · {character.type} spellbook
            </p>
          ) : (
            <p className={`text-sm ${builderMutedTextClass}`}>Loading character…</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            ref={headerPickerButtonRef}
            data-testid="btn-open-picker"
            onClick={openPicker}
            className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500 text-sm"
          >
            Add Spells
          </button>
          <div className="flex gap-2">
            <select
              value={pageSize}
              data-testid="print-page-size-select"
              aria-label="Print page size"
              onChange={(e) => setPageSize(e.target.value as "a4" | "letter")}
              className={builderHeaderSelectClass}
            >
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
            {PRINT_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                data-testid={`btn-print-spellbook-${layout.id}`}
                onClick={() => printSpellbook(layout.id)}
                className={`px-2 py-1 text-xs ${builderHeaderSecondaryActionClass}`}
              >
                {layout.label}
              </button>
            ))}
          </div>
          <Link
            ref={backLinkRef}
            to="/character"
            data-testid="link-back-to-characters"
            className={builderBackLinkClass}
          >
            ← Characters
          </Link>
        </div>
      </div>

      {statusMessage && <div className="text-xs text-neutral-400">{statusMessage}</div>}

      <div data-testid="spellbook-count-label" aria-live="polite" className="text-sm text-neutral-500">
        {spellbookIsPendingInitialLoad ? "Loading spellbook…" : `${spellbook.length} spells in spellbook`}
      </div>

      <table className="w-full text-left text-sm border-collapse">
        <thead className="text-neutral-400 border-b border-neutral-800">
          <tr>
            <th className="p-2 w-10 text-center">Prep</th>
            <th className="p-2 w-10 text-center">Known</th>
            <th className="p-2">Name</th>
            <th className="p-2">Level</th>
            <th className="p-2">School</th>
            <th className="p-2">Notes</th>
            <th className="p-2 w-20 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {spellbook.map((entry) => (
            <tr
              key={entry.spellId}
              data-testid={`spellbook-row-${entry.spellName.replace(/\s+/g, "-").toLowerCase()}`}
              className="border-b border-neutral-800/30 hover:bg-neutral-800/30"
            >
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  data-testid={`chk-prepared-${entry.spellName.replace(/\s+/g, "-").toLowerCase()}`}
                  checked={!!entry.prepared}
                  onChange={() => {
                    const newPrepared = entry.prepared ? 0 : 1;
                    const updated = { ...entry, prepared: newPrepared };
                    setSpellbook((prev) =>
                      prev.map((spell) => (spell.spellId === entry.spellId ? updated : spell)),
                    );
                    updateSpell(updated, entry);
                  }}
                  aria-label={`Prepared ${entry.spellName}`}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  data-testid={`chk-known-${entry.spellName.replace(/\s+/g, "-").toLowerCase()}`}
                  checked={!!entry.known}
                  onChange={() => {
                    const newKnown = entry.known ? 0 : 1;
                    const updated = { ...entry, known: newKnown };
                    setSpellbook((prev) =>
                      prev.map((spell) => (spell.spellId === entry.spellId ? updated : spell)),
                    );
                    updateSpell(updated, entry);
                  }}
                  aria-label={`Known ${entry.spellName}`}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
              </td>
              <td className="p-2">
                <div className="flex items-center gap-2">
                  <span>{entry.spellName}</span>
                  {entry.spellLevel >= 10 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                      Epic
                    </span>
                  )}
                  {entry.spellLevel === 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                      Cantrip
                    </span>
                  )}
                </div>
              </td>
              <td className="p-2">{entry.spellLevel}</td>
              <td className="p-2">{entry.spellSchool}</td>
              <td className="p-2">
                <input
                  className="w-full bg-transparent border-none p-0 text-neutral-300 placeholder-neutral-600 focus:ring-0"
                  data-testid={`input-notes-${entry.spellName.replace(/\s+/g, "-").toLowerCase()}`}
                  value={entry.notes || ""}
                  placeholder="Add notes…"
                  onChange={(e) => {
                    updateNotes(entry.spellId, e.target.value);
                  }}
                  onBlur={() => persistNotes(entry.spellId)}
                />
              </td>
              <td className="p-2 text-right">
                <button
                  type="button"
                  data-testid={`btn-remove-${entry.spellName.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => removeSpell(entry)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {showEmptySpellbook && (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  heading="No Spells Added"
                  description="This character's spellbook is empty."
                  testId="empty-character-spellbook-state"
                >
                  <button
                    type="button"
                    data-testid="empty-character-add-spell-button"
                    onClick={openPicker}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm"
                  >
                    Add Spell from Library
                  </button>
                </EmptyState>
              </td>
            </tr>
          )}
          {spellbookIsPendingInitialLoad && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-neutral-500">
                Loading spellbook…
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close spell picker"
            data-testid="spellbook-picker-backdrop"
            tabIndex={-1}
            className="absolute inset-0 bg-black/70 border-none p-0 m-0 w-full h-full cursor-default"
            onClick={closePicker}
          />
          <dialog
            open
            aria-modal="true"
            aria-labelledby="spellbook-picker-heading"
            data-testid="spellbook-picker-dialog"
            ref={pickerDialogRef}
            onKeyDown={handlePickerKeyDown}
            className="relative bg-white border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded-lg w-[80vw] max-w-4xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="spellbook-picker-heading" className="text-lg font-semibold">
                Add spells
              </h3>
              <button
                type="button"
                onClick={closePicker}
                className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                data-testid="spellbook-picker-search-input"
                ref={pickerSearchInputRef}
                className="flex-1 bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md px-3 py-2 text-neutral-900 dark:text-neutral-100"
                placeholder="Search spells…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPicker()}
              />
              <button
                type="button"
                onClick={searchPicker}
                className="px-3 py-2 bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
              >
                Search
              </button>
            </div>

            {!character && (
              <output className="text-xs text-neutral-400">
                Character details are still loading. Spell add actions will unlock shortly.
              </output>
            )}

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">Schools</span>
                <select
                  multiple
                  className="bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md px-3 py-1 min-w-[160px] text-neutral-900 dark:text-neutral-100"
                  value={schoolFilters}
                  onChange={(e) =>
                    setSchoolFilters(Array.from(e.target.selectedOptions).map((opt) => opt.value))
                  }
                >
                  {facets.schools.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">Level range</span>
                <div className="flex gap-2">
                  <select
                    className="bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md px-3 py-1 text-neutral-900 dark:text-neutral-100"
                    value={levelMin}
                    onChange={(e) => setLevelMin(e.target.value)}
                  >
                    <option value="">Min</option>
                    {facets.levels.map((level) => (
                      <option key={`min-${level}`} value={String(level)}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <select
                    className="bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md px-3 py-1 text-neutral-900 dark:text-neutral-100"
                    value={levelMax}
                    onChange={(e) => setLevelMax(e.target.value)}
                  >
                    <option value="">Max</option>
                    {facets.levels.map((level) => (
                      <option key={`max-${level}`} value={String(level)}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1 justify-end">
                <div className="flex gap-2 mb-1">
                  <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={isQuestFilter}
                      onChange={(e) => setIsQuestFilter(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-blue-600"
                    />
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">Quest</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 border border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors">
                    <input
                      type="checkbox"
                      checked={isCantripFilter}
                      onChange={(e) => setIsCantripFilter(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-blue-600"
                    />
                    <span className="text-xs text-neutral-700 dark:text-neutral-300">
                      Cantrips Only
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-auto border border-neutral-300 dark:border-neutral-700 rounded">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-700 sticky top-0">
                  <tr>
                    <th className="p-2 border-b border-neutral-300 dark:border-neutral-600">
                      Name
                    </th>
                    <th className="p-2 border-b border-neutral-300 dark:border-neutral-600">
                      School
                    </th>
                    <th className="p-2 border-b border-neutral-300 dark:border-neutral-600 w-16 text-center">
                      Level
                    </th>
                    <th className="p-2 border-b border-neutral-300 dark:border-neutral-600 w-24 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pickerResults.map((spell) => {
                    const alreadyAdded = spellIds.has(spell.id);
                    const canAddSpell = character !== null && !alreadyAdded;
                    return (
                      <tr
                        key={spell.id}
                        data-testid={`picker-spell-row-${spell.name.replace(/\s+/g, "-").toLowerCase()}`}
                        className="border-b border-neutral-200 dark:border-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span>{spell.name}</span>
                            {spell.isQuestSpell === 1 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">
                                Quest
                              </span>
                            )}
                            {spell.level >= 10 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                                Epic
                              </span>
                            )}
                            {spell.level === 0 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                                Cantrip
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">{spell.school}</td>
                        <td className="p-2 text-center">{spell.level}</td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            data-testid={`btn-add-picker-${spell.name.replace(/\s+/g, "-").toLowerCase()}`}
                            onClick={() => addSpell(spell)}
                            className={`text-xs px-2 py-1 rounded ${
                              canAddSpell
                                ? "bg-blue-600 hover:bg-blue-500"
                                : alreadyAdded
                                  ? "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 cursor-not-allowed"
                                  : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 cursor-not-allowed"
                            }`}
                            disabled={!canAddSpell}
                          >
                            {alreadyAdded ? "Added" : canAddSpell ? "Add" : "Loading..."}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {pickerResults.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-neutral-500">
                        No spells found for the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}
