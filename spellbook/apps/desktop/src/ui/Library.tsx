import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
};

type SearchFilters = {
  school?: string | null;
  level?: number | null;
  class_list?: string | null;
  source?: string | null;
};

export default function Library() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");
  const [spells, setSpells] = useState<SpellSummary[]>([]);
  const [facets, setFacets] = useState<Facets>({ schools: [], sources: [], levels: [] });
  const [schoolFilter, setSchoolFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const loadFacets = async () => {
    const data = await invoke<Facets>("list_facets");
    setFacets(data);
  };

  const search = useCallback(async () => {
    const filters: SearchFilters = {
      school: schoolFilter || null,
      level: levelFilter ? parseInt(levelFilter) : null,
      source: sourceFilter || null,
    };

    if (mode === "semantic") {
      // Semantic search currently doesn't support filters in MVP backend signature (passed as None)
      // Implementation plan said to focus on keyword filters first.
      // We'll call keyword search if filters are present, or warn user?
      // For now, semantic search ignores filters.
      const results = await invoke<SpellSummary[]>("search_semantic", { query });
      setSpells(results);
      return;
    }
    const results = await invoke<SpellSummary[]>("search_keyword", { query, filters });
    setSpells(results);
  }, [query, mode, schoolFilter, levelFilter, sourceFilter]);

  useEffect(() => {
    loadFacets();
    search();
  }, []);

  // Trigger search when filters change? Or just wait for button?
  // Let's wait for button/enter for query, but maybe auto-update for filters?
  // Let's do auto-update for filters for better UX.
  useEffect(() => {
    search();
  }, [schoolFilter, levelFilter, sourceFilter, mode]);

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Library</h2>
        <div className="space-x-2">
          <Link to="/character" className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700">Characters</Link>
          <Link to="/edit/new" className="px-3 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-600">Add Spell</Link>
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
        <button className="px-3 py-2 bg-neutral-800 rounded-md hover:bg-neutral-700" onClick={search} type="button">
          Search
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
        >
          <option value="">All schools</option>
          {facets.schools.map((school) => (
            <option key={school} value={school}>
              {school}
            </option>
          ))}
        </select>
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
        >
          <option value="">All levels</option>
          {facets.levels.map((level) => (
            <option key={level} value={String(level)}>
              {level}
            </option>
          ))}
        </select>
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
                <td className="p-2 space-x-2">
                  <Link to={`/edit/${s.id}`} className="text-blue-400 hover:underline">{s.name}</Link>
                  {/* Placeholder for Add to Character M2, but let's add a log/alert link for now or just visually link it */}
                  <button onClick={() => alert("Add to Character coming in M2 (use Character view to see known spells)")} className="text-xs px-2 py-0.5 bg-neutral-800 rounded text-neutral-400 hover:text-white">+</button>
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
