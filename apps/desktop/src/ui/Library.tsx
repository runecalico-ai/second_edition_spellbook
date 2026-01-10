import { useEffect, useState } from 'react'

type Spell = {
  id?: number
  name: string
  school?: string
  level: number
  class_list?: string
  components?: string
  duration?: string
  source?: string
}

export default function Library() {
  const [query, setQuery] = useState('')
  const [spells, setSpells] = useState<Spell[]>([])

  useEffect(() => {
    // TODO: replace mock with Tauri command call
    setSpells([
      { name: 'Magic Missile', level: 1, school: 'Evocation', class_list: 'Mage', components: 'V,S' },
      { name: 'Cure Light Wounds', level: 1, school: 'Necromancy', class_list: 'Cleric', components: 'V,S' },
    ])
  }, [])

  return (
    <div className='space-y-3'>
      <div className='flex gap-2'>
        <input className='w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2' placeholder='Search…' value={query} onChange={e=>setQuery(e.target.value)} />
        <button className='px-3 py-2 bg-neutral-800 rounded-md'>Search</button>
      </div>
      <table className='w-full text-sm'>
        <thead className='text-neutral-400'>
          <tr><th className='text-left'>Name</th><th className='text-left'>School</th><th>Level</th><th>Classes</th><th>Comp</th></tr>
        </thead>
        <tbody>
          {spells.map((s,i)=>(
            <tr key={i} className='border-t border-neutral-800 hover:bg-neutral-900/60'>
              <td className='py-2'>{s.name}</td>
              <td>{s.school}</td>
              <td className='text-center'>{s.level}</td>
              <td>{s.class_list}</td>
              <td className='text-center'>{s.components}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
