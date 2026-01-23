import * as Slider from "@radix-ui/react-slider";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

type SpellSummary = {
  id: number;
  name: string;
  school?: string;
  level: number;
  class_list?: string;
  components?: string;
  duration?: string;
  source?: string;
  is_quest_spell: number;
  is_cantrip: number;
};

type Facets = {
  schools: string[];
  sources: string[];
  levels: number[];
  class_list: string[];
  components: string[];
  tags: string[];
};

type SearchFilters = {
  schools?: string[] | null;
  levelMin?: number | null;
  levelMax?: number | null;
  classList?: string | null;
  source?: string | null;
  components?: string | null;
  tags?: string | null;
  isQuestSpell?: boolean | null;
  isCantrip?: boolean | null;
};

type SavedSearchPayload = {
  query: string;
  mode: "keyword" | "semantic";
  filters: SearchFilters;
};

type Character = {
  id: number;
  name: string;
};

type SavedSearch = {
  id: number;
  name: string;
  filter_json: string;
  created_at: string;
};

export default function Library() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");
  const [spells, setSpells] = useState<SpellSummary[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [facets, setFacets] = useState<Facets>({
    schools: [],
    sources: [],
    levels: [],
    class_list: [],
    components: [],
    tags: [],
  });
  const [schoolFilters, setSchoolFilters] = useState<string[]>([]);
  const [levelMin, setLevelMin] = useState("");
  const [levelMax, setLevelMax] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [classListFilter, setClassListFilter] = useState("");
  const [componentFilter, setComponentFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isQuestFilter, setIsQuestFilter] = useState(false);
  const [isCantripFilter, setIsCantripFilter] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newSearchName, setNewSearchName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSaving && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [isSaving]);

  const loadFacets = useCallback(async () => {
    const data = await invoke<Facets>("list_facets");
    setFacets(data);
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const list = await invoke<Character[]>("list_characters");
      setCharacters(list);
    } catch (e) {
      console.error("Failed to load characters", e);
    }
  }, []);

  const loadSavedSearches = useCallback(async () => {
    try {
      const list = await invoke<SavedSearch[]>("list_saved_searches");
      setSavedSearches(list);
    } catch (e) {
      console.error("Failed to load saved searches", e);
    }
  }, []);

  const handleSaveSearch = async () => {
    if (!newSearchName) return;
    try {
      const parsedMin = levelMin ? Number.parseInt(levelMin) : null;
      const parsedMax = levelMax ? Number.parseInt(levelMax) : null;
      const filters: SearchFilters = {
        schools: schoolFilters.length > 0 ? schoolFilters : null,
        levelMin: parsedMin,
        levelMax: parsedMax,
        source: sourceFilter || null,
        classList: classListFilter || null,
        components: componentFilter || null,
        tags: tagFilter || null,
        isQuestSpell: isQuestFilter,
        isCantrip: isCantripFilter,
      };
      const payload: SavedSearchPayload = {
        query,
        mode,
        filters,
      };
      await invoke("save_search", { name: newSearchName, payload });
      setNewSearchName("");
      setIsSaving(false);
      loadSavedSearches();
    } catch (e) {
      alert(`Failed to save search: ${e}`);
    }
  };

  const loadSearch = (saved: SavedSearch) => {
    try {
      const parsed = JSON.parse(saved.filter_json) as Partial<SavedSearchPayload & SearchFilters>;
      const isPayload =
        parsed && typeof parsed === "object" && "filters" in parsed && parsed.filters !== undefined;
      if (isPayload) {
        const payload = parsed as SavedSearchPayload;
        setQuery(payload.query ?? "");
        setMode(payload.mode ?? "keyword");
        const filters = payload.filters ?? {};
        setSchoolFilters(filters.schools || []);
        setLevelMin(filters.levelMin != null ? String(filters.levelMin) : "");
        setLevelMax(filters.levelMax != null ? String(filters.levelMax) : "");
        setSourceFilter(filters.source || "");
        setClassListFilter(filters.classList || "");
        setComponentFilter(filters.components || "");
        setTagFilter(filters.tags || "");
        setIsQuestFilter(filters.isQuestSpell ?? false);
        setIsCantripFilter(filters.isCantrip ?? false);
      } else {
        const filters = parsed as SearchFilters;
        setQuery("");
        setMode("keyword");
        setSchoolFilters(filters.schools || []);
        setLevelMin(filters.levelMin != null ? String(filters.levelMin) : "");
        setLevelMax(filters.levelMax != null ? String(filters.levelMax) : "");
        setSourceFilter(filters.source || "");
        setClassListFilter(filters.classList || "");
        setComponentFilter(filters.components || "");
        setTagFilter(filters.tags || "");
        setIsQuestFilter(filters.isQuestSpell ?? false);
        setIsCantripFilter(filters.isCantrip ?? false);
      }
    } catch (e) {
      console.error("Failed to parse saved search", e);
    }
  };

  const handleDeleteSavedSearch = async (id: number) => {
    if (!confirm("Delete this saved search?")) return;
    try {
      await invoke("delete_saved_search", { id });
      loadSavedSearches();
    } catch (e) {
      alert(`Failed to delete saved search: ${e}`);
    }
  };

  const handleResetFilters = () => {
    setQuery("");
    setMode("keyword");
    setSchoolFilters([]);
    setLevelMin("");
    setLevelMax("");
    setSourceFilter("");
    setClassListFilter("");
    setComponentFilter("");
    setTagFilter("");
    setIsQuestFilter(false);
    setIsCantripFilter(false);
  };

  const search = useCallback(async () => {
    let parsedMin = levelMin ? Number.parseInt(levelMin) : null;
    let parsedMax = levelMax ? Number.parseInt(levelMax) : null;
    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      [parsedMin, parsedMax] = [parsedMax, parsedMin];
    }
    const filters: SearchFilters = {
      schools: schoolFilters.length > 0 ? schoolFilters : null,
      levelMin: parsedMin,
      levelMax: parsedMax,
      source: sourceFilter || null,
      classList: classListFilter || null,
      components: componentFilter || null,
      tags: tagFilter || null,
      isQuestSpell: isQuestFilter || null,
      isCantrip: isCantripFilter || null,
    };

    if (mode === "semantic") {
      const results = await invoke<SpellSummary[]>("search_semantic", { query });
      setSpells(results);
      return;
    }
    const results = await invoke<SpellSummary[]>("search_keyword", { query, filters });
    setSpells(results);
  }, [
    query,
    mode,
    schoolFilters,
    levelMin,
    levelMax,
    sourceFilter,
    classListFilter,
    componentFilter,
    tagFilter,
    isQuestFilter,
    isCantripFilter,
  ]);

  useEffect(() => {
    loadFacets();
    loadCharacters();
    loadSavedSearches();
    search();
  }, [loadFacets, loadCharacters, loadSavedSearches, search]);

  useEffect(() => {
    search();
  }, [search]);

  const addToCharacter = async (spellId: number, charIdStr: string) => {
    if (!charIdStr) return;
    const charId = Number.parseInt(charIdStr);
    try {
      await invoke("update_character_spell", {
        characterId: charId,
        spellId: spellId,
        prepared: 0,
        known: 1,
        notes: "",
      });
      alert("Spell added to character!");
    } catch (e) {
      alert(`Failed to add spell: ${e}`);
    }
  };

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Library</h1>
        <div className="space-x-2 flex items-center">
          <Link
            to="/character"
            data-testid="link-to-characters"
            className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700"
          >
            Characters
          </Link>
          <Link
            to="/edit/new"
            data-testid="link-add-spell"
            id="link-add-spell"
            className="px-3 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-600"
          >
            Add Spell
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          placeholder="Search spells…"
          data-testid="library-search-input"
          aria-label="Search spells"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          data-testid="library-mode-select"
          aria-label="Search mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "keyword" | "semantic")}
        >
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </select>
        <button
          className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700"
          data-testid="library-search-button"
          onClick={search}
          type="button"
        >
          Search
        </button>
        <button
          className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700 border border-neutral-700"
          data-testid="library-reset-button"
          onClick={handleResetFilters}
          type="button"
          title="Reset all search filters to default"
        >
          Reset Filters
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Schools</span>
          <select
            multiple
            aria-label="Schools filter"
            data-testid="filter-school-select"
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1 min-w-[160px]"
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
          <span className="text-xs text-neutral-400 font-medium">
            Level range: {levelMin || 0} - {levelMax || 12}
          </span>
          <div className="pt-2 px-1">
            <Slider.Root
              className="relative flex items-center select-none touch-none w-32 h-5"
              data-testid="filter-level-slider"
              value={[
                levelMin ? Number.parseInt(levelMin) : 0,
                levelMax ? Number.parseInt(levelMax) : 12,
              ]}
              max={12}
              step={1}
              onValueChange={([min, max]) => {
                setLevelMin(String(min));
                setLevelMax(String(max));
              }}
            >
              <Slider.Track className="bg-neutral-800 relative grow rounded-full h-[3px]">
                <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-white shadow-lg rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                aria-label="Min Level"
                data-testid="filter-level-min-thumb"
              />
              <Slider.Thumb
                className="block w-4 h-4 bg-white shadow-lg rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                aria-label="Max Level"
                data-testid="filter-level-max-thumb"
              />
            </Slider.Root>
          </div>
        </div>
        <select
          aria-label="Source filter"
          data-testid="filter-source-select"
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">All sources</option>
          {facets.sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <select
          aria-label="Class filter"
          data-testid="filter-class-select"
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={classListFilter}
          onChange={(e) => setClassListFilter(e.target.value)}
        >
          <option value="">All classes</option>
          {facets.class_list.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
        <select
          aria-label="Component filter"
          data-testid="filter-component-select"
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value)}
        >
          <option value="">All components</option>
          {facets.components.map((component) => (
            <option key={component} value={component}>
              {component}
            </option>
          ))}
        </select>
        <select
          aria-label="Tag filter"
          data-testid="filter-tag-select"
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="">All tags</option>
          {facets.tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 border border-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors">
          <input
            type="checkbox"
            data-testid="filter-quest-checkbox"
            checked={isQuestFilter}
            onChange={(e) => setIsQuestFilter(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-offset-neutral-900"
          />
          <span className="text-xs text-neutral-300">Quest Spells</span>
        </label>
        <label className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 border border-neutral-700 rounded-md cursor-pointer hover:bg-neutral-800 transition-colors">
          <input
            type="checkbox"
            data-testid="filter-cantrip-checkbox"
            checked={isCantripFilter}
            onChange={(e) => setIsCantripFilter(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-offset-neutral-900"
          />
          <span className="text-xs text-neutral-300">Cantrips Only</span>
        </label>

        <div className="border-l border-neutral-800 mx-1 self-stretch" />

        <div className="flex items-center gap-2">
          {savedSearches.length > 0 && (
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1 text-xs"
              data-testid="saved-searches-select"
              aria-label="Saved searches"
              onChange={(e) => {
                const saved = savedSearches.find((s) => s.id === Number.parseInt(e.target.value));
                if (saved) loadSearch(saved);
              }}
              value=""
            >
              <option value="">Saved Searches</option>
              {savedSearches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {isSaving ? (
            <div
              className="flex gap-1 animate-in slide-in-from-right-1 duration-200"
              data-testid="save-search-container"
            >
              <input
                ref={saveInputRef}
                className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-xs w-32"
                placeholder="Name..."
                data-testid="save-search-name-input"
                aria-label="Search name"
                value={newSearchName}
                onChange={(e) => setNewSearchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveSearch();
                  if (e.key === "Escape") setIsSaving(false);
                }}
              />
              <button
                type="button"
                className="px-2 py-1 bg-blue-700 text-white rounded text-xs"
                data-testid="btn-save-search-confirm"
                onClick={handleSaveSearch}
              >
                Save
              </button>
              <button
                type="button"
                className="px-2 py-1 bg-neutral-800 rounded text-xs"
                data-testid="btn-save-search-cancel"
                onClick={() => setIsSaving(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-md text-xs hover:bg-neutral-700 transition-colors"
              data-testid="btn-save-search-trigger"
              onClick={() => setIsSaving(true)}
            >
              Save Current Search
            </button>
          )}

          {savedSearches.length > 0 && (
            <button
              type="button"
              className="text-xs text-neutral-500 hover:text-red-400 ml-1"
              data-testid="btn-delete-saved-search"
              onClick={() => {
                const currentVal = (
                  document.querySelector(
                    'select[data-testid="saved-searches-select"]',
                  ) as HTMLSelectElement
                )?.value;
                if (currentVal) handleDeleteSavedSearch(Number.parseInt(currentVal));
              }}
              title="Delete selected saved search"
            >
              Delete Selected
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-900/30 rounded-md border border-neutral-800">
        <table
          className="w-full text-sm text-left border-collapse"
          data-testid="spell-library-table"
        >
          <thead className="text-neutral-400 bg-neutral-900 sticky top-0">
            <tr>
              <th className="p-2 border-b border-neutral-800">Name</th>
              <th className="p-2 border-b border-neutral-800">School</th>
              <th className="p-2 border-b border-neutral-800 w-16 text-center">Level</th>
              <th className="p-2 border-b border-neutral-800">Classes</th>
              <th className="p-2 border-b border-neutral-800 text-center">Comp</th>
            </tr>
          </thead>
          <tbody>
            {spells.map((s) => (
              <tr
                key={s.id}
                data-testid={`spell-row-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                className="border-b border-neutral-800/50 hover:bg-neutral-800 group"
              >
                <td className="p-2 space-x-2 flex items-center">
                  <Link
                    to={`/edit/${s.id}`}
                    data-testid={`spell-link-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                    className="text-blue-400 hover:underline"
                  >
                    {s.name}
                  </Link>
                  {s.is_quest_spell === 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">
                      Quest
                    </span>
                  )}
                  {s.level >= 10 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                      Epic
                    </span>
                  )}
                  {s.level === 0 && s.is_cantrip === 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                      Cantrip
                    </span>
                  )}
                  <select
                    className="ml-2 w-4 h-4 text-xs bg-neutral-800 text-transparent hover:text-white rounded focus:w-auto focus:text-white transition-all"
                    data-testid={`add-to-char-select-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                    aria-label={`Add ${s.name} to character`}
                    onChange={(e) => addToCharacter(s.id, e.target.value)}
                    value=""
                  >
                    <option value="">+</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">{s.school}</td>
                <td className="p-2 text-center">{s.level}</td>
                <td className="p-2">{s.class_list}</td>
                <td className="p-2 text-center">{s.components}</td>
              </tr>
            ))}
            {spells.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-neutral-500"
                  data-testid="no-spells-found"
                >
                  No spells found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
