import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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

export default function Library() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");
  const [spells, setSpells] = useState<SpellSummary[]>([]);
  const [facets, setFacets] = useState<Facets>({ schools: [], sources: [], levels: [] });
  const [schoolFilter, setSchoolFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      const data = await invoke<Facets>("list_facets");
      setFacets(data);
      const results = await invoke<SpellSummary[]>("search_keyword", { query: "" });
      setSpells(results);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    return spells.filter((spell) => {
      if (schoolFilter && spell.school !== schoolFilter) return false;
      if (levelFilter && String(spell.level) !== levelFilter) return false;
      return true;
    });
  }, [spells, schoolFilter, levelFilter]);

  const search = async () => {
    if (mode === "semantic") {
      const results = await invoke<SpellSummary[]>("search_semantic", { query });
      setSpells(results);
      return;
    }
    const results = await invoke<SpellSummary[]>("search_keyword", { query });
    setSpells(results);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={mode}
          onChange={(e) => setMode(e.target.value as "keyword" | "semantic")}
        >
          <option value="keyword">Keyword</option>
          <option value="semantic">Semantic</option>
        </select>
        <button className="px-3 py-2 bg-neutral-800 rounded-md" onClick={search} type="button">
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
      </div>
      <table className="w-full text-sm">
        <thead className="text-neutral-400">
          <tr>
            <th className="text-left">Name</th>
            <th className="text-left">School</th>
            <th>Level</th>
            <th>Classes</th>
            <th>Comp</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id} className="border-t border-neutral-800 hover:bg-neutral-900/60">
              <td className="py-2">{s.name}</td>
              <td>{s.school}</td>
              <td className="text-center">{s.level}</td>
              <td>{s.class_list}</td>
              <td className="text-center">{s.components}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
