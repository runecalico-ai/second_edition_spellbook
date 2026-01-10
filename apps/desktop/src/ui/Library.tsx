import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

type Spell = {
  id?: number
  name: string
  school?: string
  sphere?: string
  level: number
  class_list?: string
  components?: string
  duration?: string
  tags?: string
  source?: string
}

type FilterInput = {
  search_keyword?: string
  level?: number
  school?: string
  class_list?: string
  components?: string
  tags?: string
  source?: string
}

type FilterState = {
  level: string
  school: string
  class_list: string
  components: string
  tags: string
  source: string
}

const emptyFilters: FilterState = {
  level: '',
  school: '',
  class_list: '',
  components: '',
  tags: '',
  source: '',
}

const splitTokens = (value?: string) =>
  value
    ?.split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0) ?? []

export default function Library() {
  const [query, setQuery] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [spells, setSpells] = useState<Spell[]>([])
  const [allSpells, setAllSpells] = useState<Spell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    invoke<Spell[]>('list_spells_filtered', { filters: {} })
      .then((rows) => {
        if (!active) return
        setAllSpells(rows)
        setSpells(rows)
      })
      .catch((err) => {
        if (!active) return
        setError(String(err))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setInitialized(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!initialized) return
    let active = true
    const fetchSpells = async () => {
      setLoading(true)
      setError(null)
      const normalized: FilterInput = {}
      const trimmedQuery = searchKeyword.trim()
      if (trimmedQuery) normalized.search_keyword = trimmedQuery
      if (filters.level) normalized.level = Number(filters.level)
      if (filters.school) normalized.school = filters.school
      if (filters.class_list) normalized.class_list = filters.class_list
      if (filters.components) normalized.components = filters.components
      if (filters.tags) normalized.tags = filters.tags
      if (filters.source) normalized.source = filters.source
      try {
        const rows = await invoke<Spell[]>('list_spells_filtered', { filters: normalized })
        if (!active) return
        setSpells(rows)
      } catch (err) {
        if (!active) return
        setError(String(err))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    fetchSpells()
    return () => {
      active = false
    }
  }, [filters, searchKeyword, initialized])

  const handleSearch = () => {
    setSearchKeyword(query)
  }

  const levels = useMemo(() => {
    const unique = new Set<number>()
    allSpells.forEach((spell) => {
      if (Number.isFinite(spell.level)) unique.add(spell.level)
    })
    return Array.from(unique).sort((a, b) => a - b)
  }, [allSpells])

  const schools = useMemo(() => {
    const unique = new Set<string>()
    allSpells.forEach((spell) => {
      if (spell.school) unique.add(spell.school)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [allSpells])

  const classOptions = useMemo(() => {
    const unique = new Set<string>()
    allSpells.forEach((spell) => {
      splitTokens(spell.class_list).forEach((token) => unique.add(token))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [allSpells])

  const componentOptions = useMemo(() => {
    const unique = new Set<string>()
    allSpells.forEach((spell) => {
      splitTokens(spell.components).forEach((token) => unique.add(token))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [allSpells])

  const tagOptions = useMemo(() => {
    const unique = new Set<string>()
    allSpells.forEach((spell) => {
      splitTokens(spell.tags).forEach((token) => unique.add(token))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [allSpells])

  const sourceOptions = useMemo(() => {
    const unique = new Set<string>()
    allSpells.forEach((spell) => {
      if (spell.source) unique.add(spell.source)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [allSpells])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col flex-1 min-w-[220px] gap-1">
          <span className="text-xs text-neutral-400">Search</span>
          <input
            className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="px-3 py-2 bg-neutral-800 rounded-md" onClick={handleSearch}>
          Search
        </button>
        <Link to="/spell/new" className="px-3 py-2 bg-emerald-600 rounded-md">
          New Spell
        </Link>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Level
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.level}
              onChange={(event) => setFilters((prev) => ({ ...prev, level: event.target.value }))}
            >
              <option value="">All levels</option>
              {levels.map((level) => (
                <option key={level} value={String(level)}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            School
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.school}
              onChange={(event) => setFilters((prev) => ({ ...prev, school: event.target.value }))}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Class
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.class_list}
              onChange={(event) => setFilters((prev) => ({ ...prev, class_list: event.target.value }))}
            >
              <option value="">All classes</option>
              {classOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Components
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.components}
              onChange={(event) => setFilters((prev) => ({ ...prev, components: event.target.value }))}
            >
              <option value="">All components</option>
              {componentOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Tags
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.tags}
              onChange={(event) => setFilters((prev) => ({ ...prev, tags: event.target.value }))}
            >
              <option value="">All tags</option>
              {tagOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Source
            <select
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-2 text-sm text-neutral-100"
              value={filters.source}
              onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
            >
              <option value="">All sources</option>
              {sourceOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {error && (
        <div className="border border-red-600/50 bg-red-900/20 text-red-200 px-3 py-2 rounded-md text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-sm text-neutral-400">Loading spells…</div>
      ) : spells.length === 0 ? (
        <div className="text-sm text-neutral-400 border border-neutral-800 rounded-md px-3 py-3">
          No spells match your current filters. Try clearing filters or changing the search term.
        </div>
      ) : (
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
            {spells.map((s, i) => (
              <tr key={i} className="border-t border-neutral-800 hover:bg-neutral-900/60">
                <td className="py-2">
                  {s.id ? (
                    <Link className="text-emerald-300 hover:underline" to={`/spell/${s.id}`}>
                      {s.name}
                    </Link>
                  ) : (
                    s.name
                  )}
                </td>
                <td>{s.school}</td>
                <td className="text-center">{s.level}</td>
                <td>{s.class_list}</td>
                <td className="text-center">{s.components}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
