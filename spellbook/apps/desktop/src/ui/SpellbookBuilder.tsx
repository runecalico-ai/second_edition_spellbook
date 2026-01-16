import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
  spell_id: number;
  spell_name: string;
  spell_level: number;
  spell_school?: string;
  prepared: number;
  known: number;
  notes?: string;
};

type SpellSummary = {
  id: number;
  name: string;
  school?: string;
  level: number;
  is_quest_spell: number;
};

type Facets = {
  schools: string[];
  levels: number[];
};

type SearchFilters = {
  schools?: string[] | null;
  levelMin?: number | null;
  levelMax?: number | null;
  is_quest_spell?: boolean | null;
  is_cantrip?: boolean | null;
};

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

  const spellIds = useMemo(() => new Set(spellbook.map((entry) => entry.spell_id)), [spellbook]);

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
    setFacets({ schools: data.schools, levels: data.levels });
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
      is_quest_spell: isQuestFilter || null,
      is_cantrip: isCantripFilter || null,
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
        spellId: entry.spell_id,
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
        spellId: entry.spell_id,
        prepared: entry.prepared,
        known: entry.known,
        notes: entry.notes,
      });
    } catch (e) {
      setStatusMessage(`Failed to update ${entry.spell_name}: ${e}`);
      if (previousEntry) {
        setSpellbook((prev) =>
          prev.map((spell) => (spell.spell_id === previousEntry.spell_id ? previousEntry : spell)),
        );
      }
    }
  };

  const updateNotes = (spellId: number, notes: string) => {
    setSpellbook((prev) =>
      prev.map((spell) => (spell.spell_id === spellId ? { ...spell, notes } : spell)),
    );
  };

  const persistNotes = (spellId: number) => {
    const entry = spellbook.find((spell) => spell.spell_id === spellId);
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

  if (!Number.isFinite(characterId)) {
    return (
      <div className="p-4 space-y-2">
        <h2 className="text-xl font-bold">Spellbook Builder</h2>
        <p className="text-neutral-500">Invalid character selection.</p>
        <Link to="/character" className="text-sm text-neutral-400 hover:text-white">
          ← Back to Characters
        </Link>
      </div>
    );
  }

  if (characterLoaded && !character) {
    return (
      <div className="p-4 space-y-2">
        <h2 className="text-xl font-bold">Spellbook Builder</h2>
        <p className="text-neutral-500">Character not found.</p>
        <Link to="/character" className="text-sm text-neutral-400 hover:text-white">
          ← Back to Characters
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full overflow-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Spellbook Builder</h2>
          {character ? (
            <p className="text-sm text-neutral-400">
              {character.name} · {character.type} spellbook
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Loading character…</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500 text-sm"
          >
            Add Spells
          </button>
          <div className="flex gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as "a4" | "letter")}
              className="bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700"
            >
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
            {PRINT_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                onClick={() => printSpellbook(layout.id)}
                className="px-2 py-1 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                {layout.label}
              </button>
            ))}
          </div>
          <Link to="/character" className="text-sm text-neutral-400 hover:text-white">
            ← Characters
          </Link>
        </div>
      </div>

      {statusMessage && <div className="text-xs text-neutral-400">{statusMessage}</div>}

      <div className="text-sm text-neutral-500">{spellbook.length} spells in spellbook</div>

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
              key={entry.spell_id}
              className="border-b border-neutral-800/30 hover:bg-neutral-800/30"
            >
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={!!entry.prepared}
                  onChange={() => {
                    const newPrepared = entry.prepared ? 0 : 1;
                    const updated = { ...entry, prepared: newPrepared };
                    setSpellbook((prev) =>
                      prev.map((spell) => (spell.spell_id === entry.spell_id ? updated : spell)),
                    );
                    updateSpell(updated, entry);
                  }}
                  aria-label={`Prepared ${entry.spell_name}`}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={!!entry.known}
                  onChange={() => {
                    const newKnown = entry.known ? 0 : 1;
                    const updated = { ...entry, known: newKnown };
                    setSpellbook((prev) =>
                      prev.map((spell) => (spell.spell_id === entry.spell_id ? updated : spell)),
                    );
                    updateSpell(updated, entry);
                  }}
                  aria-label={`Known ${entry.spell_name}`}
                  className="rounded bg-neutral-900 border-neutral-700"
                />
              </td>
              <td className="p-2">
                <div className="flex items-center gap-2">
                  <span>{entry.spell_name}</span>
                  {entry.spell_level >= 10 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                      Epic
                    </span>
                  )}
                  {entry.spell_level === 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                      Cantrip
                    </span>
                  )}
                </div>
              </td>
              <td className="p-2">{entry.spell_level}</td>
              <td className="p-2">{entry.spell_school}</td>
              <td className="p-2">
                <input
                  className="w-full bg-transparent border-none p-0 text-neutral-300 placeholder-neutral-600 focus:ring-0"
                  value={entry.notes || ""}
                  placeholder="Add notes…"
                  onChange={(e) => {
                    updateNotes(entry.spell_id, e.target.value);
                  }}
                  onBlur={() => persistNotes(entry.spell_id)}
                />
              </td>
              <td className="p-2 text-right">
                <button
                  type="button"
                  onClick={() => removeSpell(entry)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {spellbookLoaded && spellbook.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-neutral-500">
                No spells added yet. Use Add Spells to build the spellbook.
              </td>
            </tr>
          )}
          {!spellbookLoaded && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-neutral-500">
                Loading spellbook…
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[80vw] max-w-4xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add spells</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-sm text-neutral-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md px-3 py-2"
                placeholder="Search spells…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPicker()}
              />
              <button
                type="button"
                onClick={searchPicker}
                className="px-3 py-2 bg-neutral-700 rounded hover:bg-neutral-600"
              >
                Search
              </button>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-400">Schools</span>
                <select
                  multiple
                  className="bg-neutral-800 border border-neutral-700 rounded-md px-3 py-1 min-w-[160px]"
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
                <span className="text-xs text-neutral-400">Level range</span>
                <div className="flex gap-2">
                  <select
                    className="bg-neutral-800 border border-neutral-700 rounded-md px-3 py-1"
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
                    className="bg-neutral-800 border border-neutral-700 rounded-md px-3 py-1"
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
                  <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-md cursor-pointer hover:bg-neutral-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={isQuestFilter}
                      onChange={(e) => setIsQuestFilter(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-900 text-blue-600"
                    />
                    <span className="text-xs text-neutral-300">Quest</span>
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-md cursor-pointer hover:bg-neutral-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={isCantripFilter}
                      onChange={(e) => setIsCantripFilter(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-900 text-blue-600"
                    />
                    <span className="text-xs text-neutral-300">Cantrips Only</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-auto border border-neutral-800 rounded">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-neutral-400 bg-neutral-900 sticky top-0">
                  <tr>
                    <th className="p-2 border-b border-neutral-800">Name</th>
                    <th className="p-2 border-b border-neutral-800">School</th>
                    <th className="p-2 border-b border-neutral-800 w-16 text-center">Level</th>
                    <th className="p-2 border-b border-neutral-800 w-24 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pickerResults.map((spell) => {
                    const alreadyAdded = spellIds.has(spell.id);
                    return (
                      <tr
                        key={spell.id}
                        className="border-b border-neutral-800/50 hover:bg-neutral-800"
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span>{spell.name}</span>
                            {spell.is_quest_spell === 1 && (
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
                            onClick={() => addSpell(spell)}
                            className={`text-xs px-2 py-1 rounded ${
                              alreadyAdded
                                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-500"
                            }`}
                            disabled={alreadyAdded}
                          >
                            {alreadyAdded ? "Added" : "Add"}
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
          </div>
        </div>
      )}
    </div>
  );
}
