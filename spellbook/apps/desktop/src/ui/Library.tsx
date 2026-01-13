import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
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
  class_list?: string | null;
  source?: string | null;
  components?: string | null;
  tags?: string | null;
};

type Character = {
  id: number;
  name: string;
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
      class_list: classListFilter || null,
      components: componentFilter || null,
      tags: tagFilter || null,
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
  ]);

  useEffect(() => {
    loadFacets();
    loadCharacters();
    search();
  }, [loadFacets, loadCharacters, search]);

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
        <h2 className="text-xl font-bold">Library</h2>
        <div className="space-x-2 flex items-center">
          <Link
            to="/character"
            className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700"
          >
            Characters
          </Link>
          <Link
            to="/edit/new"
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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={mode}
          onChange={(e) => setMode(e.target.value as "keyword" | "semantic")}
        >
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </select>
        <button
          className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700"
          onClick={search}
          type="button"
        >
          Search
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Schools</span>
          <select
            multiple
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
          <span className="text-xs text-neutral-400">Level range</span>
          <div className="flex gap-2">
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
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
              className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
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
        <select
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
      </div>

      <div className="flex-1 overflow-auto bg-neutral-900/30 rounded-md border border-neutral-800">
        <table className="w-full text-sm text-left border-collapse">
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
              <tr key={s.id} className="border-b border-neutral-800/50 hover:bg-neutral-800 group">
                <td className="p-2 space-x-2 flex items-center">
                  <Link to={`/edit/${s.id}`} className="text-blue-400 hover:underline">
                    {s.name}
                  </Link>
                  <select
                    className="ml-2 w-4 h-4 text-xs bg-neutral-800 text-transparent hover:text-white rounded focus:w-auto focus:text-white transition-all"
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
                <td colSpan={5} className="p-8 text-center text-neutral-500">
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
