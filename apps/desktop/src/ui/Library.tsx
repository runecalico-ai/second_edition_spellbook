import { useEffect, useState } from 'react'
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
  source?: string
}

export default function Library() {
  const [query, setQuery] = useState('')
  const [spells, setSpells] = useState<Spell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    invoke<Spell[]>('list_spells')
      .then((rows) => {
        if (!active) return
        setSpells(rows)
      })
      .catch((err) => {
        if (!active) return
        setError(String(err))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleSearch = async () => {
    setError(null)
    if (!query.trim()) {
      setLoading(true)
      try {
        const rows = await invoke<Spell[]>('list_spells')
        setSpells(rows)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await invoke<Spell[]>('search_keyword', { query })
      setSpells(rows)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-3'>
      <div className='flex gap-2'>
        <input className='w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2' placeholder='Search…' value={query} onChange={e=>setQuery(e.target.value)} />
        <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={handleSearch}>Search</button>
        <Link to='/spell/new' className='px-3 py-2 bg-emerald-600 rounded-md'>New Spell</Link>
      </div>
      {error && (
        <div className='border border-red-600/50 bg-red-900/20 text-red-200 px-3 py-2 rounded-md text-sm'>
          {error}
        </div>
      )}
      {loading ? (
        <div className='text-sm text-neutral-400'>Loading spells…</div>
      ) : (
      <table className='w-full text-sm'>
        <thead className='text-neutral-400'>
          <tr><th className='text-left'>Name</th><th className='text-left'>School</th><th>Level</th><th>Classes</th><th>Comp</th></tr>
        </thead>
        <tbody>
          {spells.map((s,i)=>(
            <tr key={i} className='border-t border-neutral-800 hover:bg-neutral-900/60'>
              <td className='py-2'>
                {s.id ? <Link className='text-emerald-300 hover:underline' to={`/spell/${s.id}`}>{s.name}</Link> : s.name}
              </td>
              <td>{s.school}</td>
              <td className='text-center'>{s.level}</td>
              <td>{s.class_list}</td>
              <td className='text-center'>{s.components}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  )
}
