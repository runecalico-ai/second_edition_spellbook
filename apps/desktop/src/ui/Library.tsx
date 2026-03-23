import * as Slider from "@radix-ui/react-slider";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNotifications } from "../store/useNotifications";
import { EmptyState } from "./components/EmptyState";

type SpellSummary = {
  id: number;
  name: string;
  school?: string;
  level: number;
  classList?: string;
  components?: string;
  duration?: string;
  source?: string;
  isQuestSpell: number;
  isCantrip: number;
};

type Facets = {
  schools: string[];
  sources: string[];
  levels: number[];
  classList: string[];
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
  filterJson: string;
  createdAt: string;
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
    classList: [],
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
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<number | null>(null);
  const [resultsSettledForCurrentSearch, setResultsSettledForCurrentSearch] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const searchRequestIdRef = useRef(0);
  const pushNotification = useNotifications((state) => state.pushNotification);

  useEffect(() => {
    if (isSaving && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [isSaving]);

  useEffect(() => {
    if (
      selectedSavedSearchId !== null &&
      !savedSearches.some((s) => s.id === selectedSavedSearchId)
    ) {
      setSelectedSavedSearchId(null);
    }
  }, [savedSearches, selectedSavedSearchId]);

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
      pushNotification("error", `Failed to save search: ${e}`);
    }
  };

  const loadSearch = (saved: SavedSearch) => {
    try {
      const parsed = JSON.parse(saved.filterJson) as Partial<SavedSearchPayload & SearchFilters>;
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
      setSelectedSavedSearchId(null);
      loadSavedSearches();
    } catch (e) {
      pushNotification("error", `Failed to delete saved search: ${e}`);
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
    setSelectedSavedSearchId(null); // NEW: also clear saved search selection
  };

  const search = useCallback(async () => {
    const requestId = ++searchRequestIdRef.current;
    setResultsSettledForCurrentSearch(false);

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

    try {
      const results =
        mode === "semantic"
          ? await invoke<SpellSummary[]>("search_semantic", { query })
          : await invoke<SpellSummary[]>("search_keyword", { query, filters });

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setSpells(results);
    } catch (e) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      console.error("Failed to search library", e);
      setSpells([]);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setResultsSettledForCurrentSearch(true);
      }
    }
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
  }, [loadFacets, loadCharacters, loadSavedSearches]);

  useEffect(() => {
    search();
  }, []);

  const hasActiveFilters = Boolean(
    query.trim() ||
      mode !== "keyword" ||
      schoolFilters.length > 0 ||
      levelMin ||
      levelMax ||
      sourceFilter ||
      classListFilter ||
      componentFilter ||
      tagFilter ||
      isQuestFilter ||
      isCantripFilter ||
      selectedSavedSearchId !== null,
  );

  const focusVisibleRingClassName =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900";
  const secondaryActionClassName = `${focusVisibleRingClassName} rounded-md border border-neutral-300 bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700`;
  const filterControlClassName = `${focusVisibleRingClassName} rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100`;
  const compactFilterControlClassName = `${focusVisibleRingClassName} rounded-md border border-neutral-300 bg-white px-3 py-1 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100`;
  const filterChipClassName =
    "cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800";

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
      pushNotification("success", "Spell added to character!");
    } catch (e) {
      pushNotification("error", `Failed to add spell: ${e}`);
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
            className={`px-3 py-2 ${secondaryActionClassName}`}
          >
            Characters
          </Link>
          <Link
            to="/edit/new"
            data-testid="link-add-spell"
            id="link-add-spell"
            className={`${focusVisibleRingClassName} px-3 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-600`}
          >
            Add Spell
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label
            htmlFor="library-search-input"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Search
          </label>
          <input
            id="library-search-input"
            className={filterControlClassName}
            placeholder="Keywords or spell name…"
            data-testid="library-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="library-mode-select"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Mode
          </label>
          <select
            id="library-mode-select"
            className={filterControlClassName}
            data-testid="library-mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as "keyword" | "semantic")}
          >
            <option value="keyword">Keyword</option>
            <option value="semantic">Semantic</option>
          </select>
        </div>
        <button
          className={`px-3 py-2 ${secondaryActionClassName}`}
          data-testid="library-search-button"
          onClick={search}
          type="button"
        >
          Search
        </button>
        <button
          className={`px-3 py-2 ${secondaryActionClassName}`}
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
          <label
            htmlFor="library-filter-schools"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Schools
          </label>
          <select
            id="library-filter-schools"
            multiple
            data-testid="filter-school-select"
            className={`min-w-[160px] ${compactFilterControlClassName}`}
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
          <span
            id="library-level-range-label"
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
          >
            Level range: {levelMin || 0} - {levelMax || 12}
          </span>
          <div className="pt-2 px-1">
            <Slider.Root
              className="relative flex items-center select-none touch-none w-32 h-5"
              aria-labelledby="library-level-range-label"
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
              <Slider.Track className="relative grow rounded-full h-[3px] bg-neutral-300 dark:bg-neutral-800">
                <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className={`${focusVisibleRingClassName} block h-4 w-4 cursor-pointer rounded-full border border-neutral-300 bg-white shadow-lg hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-100 dark:hover:bg-white`}
                aria-label="Min Level"
                data-testid="filter-level-min-thumb"
              />
              <Slider.Thumb
                className={`${focusVisibleRingClassName} block h-4 w-4 cursor-pointer rounded-full border border-neutral-300 bg-white shadow-lg hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-100 dark:hover:bg-white`}
                aria-label="Max Level"
                data-testid="filter-level-max-thumb"
              />
            </Slider.Root>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="library-filter-source"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Source
          </label>
          <select
            id="library-filter-source"
            data-testid="filter-source-select"
            className={compactFilterControlClassName}
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
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="library-filter-class"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Class
          </label>
          <select
            id="library-filter-class"
            data-testid="filter-class-select"
            className={compactFilterControlClassName}
            value={classListFilter}
            onChange={(e) => setClassListFilter(e.target.value)}
          >
          <option value="">All classes</option>
          {facets.classList.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="library-filter-component"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Component filter
          </label>
          <select
            id="library-filter-component"
            data-testid="filter-component-select"
            className={compactFilterControlClassName}
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
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="library-filter-tag"
            className="text-xs text-neutral-600 dark:text-neutral-400"
          >
            Tags
          </label>
          <select
            id="library-filter-tag"
            data-testid="filter-tag-select"
            className={compactFilterControlClassName}
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
        </div>
        <label className={`flex items-center gap-1.5 ${filterChipClassName}`}>
          <input
            type="checkbox"
            data-testid="filter-quest-checkbox"
            checked={isQuestFilter}
            onChange={(e) => setIsQuestFilter(e.target.checked)}
            className={`${focusVisibleRingClassName} h-3.5 w-3.5 rounded border-neutral-400 bg-white text-blue-600 dark:border-neutral-700 dark:bg-neutral-800`}
          />
          <span className="text-xs text-neutral-700 dark:text-neutral-300">Quest Spells</span>
        </label>
        <label className={`flex items-center gap-1.5 ${filterChipClassName}`}>
          <input
            type="checkbox"
            data-testid="filter-cantrip-checkbox"
            checked={isCantripFilter}
            onChange={(e) => setIsCantripFilter(e.target.checked)}
            className={`${focusVisibleRingClassName} h-3.5 w-3.5 rounded border-neutral-400 bg-white text-blue-600 dark:border-neutral-700 dark:bg-neutral-800`}
          />
          <span className="text-xs text-neutral-700 dark:text-neutral-300">Cantrips Only</span>
        </label>

        <div className="mx-1 self-stretch border-l border-neutral-300 dark:border-neutral-800" />

        <div className="flex items-center gap-2">
          {savedSearches.length > 0 && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="library-saved-searches-select"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Saved searches
              </label>
              <select
                id="library-saved-searches-select"
                className={`text-xs ${compactFilterControlClassName}`}
                data-testid="saved-searches-select"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) {
                    setSelectedSavedSearchId(null);
                    return;
                  }
                  const id = Number.parseInt(raw, 10);
                  const saved = savedSearches.find((s) => s.id === id);
                  if (saved) loadSearch(saved);
                  setSelectedSavedSearchId(id);
                }}
                value={selectedSavedSearchId !== null ? String(selectedSavedSearchId) : ""}
              >
              <option value="">Saved Searches</option>
              {savedSearches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              </select>
            </div>
          )}

          {isSaving ? (
            <div
              className="flex items-end gap-1 animate-in slide-in-from-right-1 duration-200"
              data-testid="save-search-container"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="save-search-name-input"
                  className="text-xs text-neutral-600 dark:text-neutral-400"
                >
                  Save as
                </label>
                <input
                  ref={saveInputRef}
                  id="save-search-name-input"
                  className={`${focusVisibleRingClassName} w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100`}
                  placeholder="Name…"
                  data-testid="save-search-name-input"
                  value={newSearchName}
                  onChange={(e) => setNewSearchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveSearch();
                    if (e.key === "Escape") setIsSaving(false);
                  }}
                />
              </div>
              <button
                type="button"
                className={`${focusVisibleRingClassName} px-2 py-1 bg-blue-700 text-white rounded text-xs`}
                data-testid="btn-save-search-confirm"
                onClick={handleSaveSearch}
              >
                Save
              </button>
              <button
                type="button"
                className={`${focusVisibleRingClassName} rounded border border-neutral-300 bg-neutral-200 px-2 py-1 text-xs text-neutral-900 hover:bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700`}
                data-testid="btn-save-search-cancel"
                aria-label="Cancel saving search"
                onClick={() => setIsSaving(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`px-3 py-1 text-xs transition-colors ${secondaryActionClassName}`}
              data-testid="btn-save-search-trigger"
              onClick={() => setIsSaving(true)}
            >
              Save Current Search
            </button>
          )}

          {savedSearches.length > 0 && (
            <button
              type="button"
              className={`${focusVisibleRingClassName} ml-1 text-xs text-neutral-600 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:text-red-400`}
              data-testid="btn-delete-saved-search"
              disabled={selectedSavedSearchId === null}
              onClick={() => {
                if (selectedSavedSearchId !== null) handleDeleteSavedSearch(selectedSavedSearchId);
              }}
              title="Delete selected saved search"
            >
              Delete Selected
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-md border border-neutral-300 bg-white/80 dark:border-neutral-800 dark:bg-neutral-900/30">
        <table
          className="w-full text-sm text-left border-collapse"
          data-testid="spell-library-table"
        >
          <caption className="sr-only">Spell library results</caption>
          <thead className="sticky top-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th scope="col" className="border-b border-neutral-300 p-2 dark:border-neutral-800">
                Name
              </th>
              <th scope="col" className="border-b border-neutral-300 p-2 dark:border-neutral-800">
                School
              </th>
              <th
                scope="col"
                className="w-16 border-b border-neutral-300 p-2 text-center dark:border-neutral-800"
              >
                Level
              </th>
              <th scope="col" className="border-b border-neutral-300 p-2 dark:border-neutral-800">
                Classes
              </th>
              <th
                scope="col"
                className="border-b border-neutral-300 p-2 text-center dark:border-neutral-800"
              >
                Components
              </th>
            </tr>
          </thead>
          <tbody>
            {spells.map((s) => (
              <tr
                key={s.id}
                data-testid={`spell-row-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                className="group border-b border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800/50 dark:hover:bg-neutral-800"
              >
                <td className="p-2 space-x-2 flex items-center">
                  <Link
                    to={`/edit/${s.id}`}
                    data-testid={`spell-link-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`${focusVisibleRingClassName} text-blue-700 hover:underline dark:text-blue-400`}
                  >
                    {s.name}
                  </Link>
                  {s.isQuestSpell === 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">
                      Quest
                    </span>
                  )}
                  {s.level >= 10 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                      Epic
                    </span>
                  )}
                  {s.level === 0 && s.isCantrip === 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                      Cantrip
                    </span>
                  )}
                  <select
                    className={`${focusVisibleRingClassName} ml-2 h-4 w-4 rounded bg-neutral-200 text-transparent transition-all hover:text-neutral-700 dark:bg-neutral-800 dark:text-transparent dark:hover:text-white`}
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
                <td className="p-2">{s.classList}</td>
                <td className="p-2 text-center">{s.components}</td>
              </tr>
            ))}
            {resultsSettledForCurrentSearch && spells.length === 0 && !hasActiveFilters && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    heading="No Spells Yet"
                    description="Your spell library is empty. Create your first spell or import spells from a file."
                    testId="empty-library-state"
                  >
                    <Link
                      to="/edit/new"
                      data-testid="empty-library-create-button"
                      className={`${focusVisibleRingClassName} px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm`}
                    >
                      Create Spell
                    </Link>
                    <Link
                      to="/import"
                      data-testid="empty-library-import-button"
                      className={`${focusVisibleRingClassName} px-4 py-2 bg-neutral-200 text-neutral-900 rounded-md hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 text-sm`}
                    >
                      Import Spells
                    </Link>
                  </EmptyState>
                </td>
              </tr>
            )}
            {resultsSettledForCurrentSearch && spells.length === 0 && hasActiveFilters && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    heading="No Results"
                    description="No spells match your current search or filters."
                    testId="empty-search-state"
                  >
                    <button
                      type="button"
                      data-testid="empty-search-reset-button"
                      onClick={handleResetFilters}
                      className={`${focusVisibleRingClassName} px-4 py-2 bg-neutral-200 text-neutral-900 rounded-md hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 text-sm`}
                    >
                      Reset Filters
                    </button>
                  </EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
