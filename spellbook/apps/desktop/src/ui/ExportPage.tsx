import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export default function ExportPage(){
  const [ids, setIds] = useState('')
  const [status, setStatus] = useState('')

  const exportSpells = async (format: 'md' | 'pdf') => {
    const list = ids
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => Number(id))
      .filter(id => !Number.isNaN(id))
    const path = await invoke<string>('export_spells', { ids: list, format })
    setStatus(path ? `Exported to ${path}` : 'No output returned')
  }

  return (
    <div className='space-y-3'>
      <p>Select spells or a character’s spellbook and export to Markdown or PDF.</p>
      <input
        className='w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2'
        placeholder='Spell IDs (comma-separated)'
        value={ids}
        onChange={e => setIds(e.target.value)}
      />
      <div className='flex gap-2'>
        <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={() => exportSpells('md')}>Export Markdown</button>
        <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={() => exportSpells('pdf')}>Export PDF</button>
      </div>
      {status && <div className='text-xs text-neutral-400'>{status}</div>}
    </div>
  )
}
