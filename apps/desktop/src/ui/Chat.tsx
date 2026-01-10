import { useState } from 'react'

export default function Chat(){
  const [q, setQ] = useState('How many missiles at level 5?')
  const [a, setA] = useState<string>('(Answer will appear here)')

  const ask = async () => {
    // TODO: call Tauri command 'chat_answer'
    setA('Example: At level 5, you typically get 3 bolts (demo text).')
  }

  return (
    <div className='space-y-3'>
      <textarea className='w-full bg-neutral-900 border border-neutral-700 rounded-md p-2' rows={4} value={q} onChange={e=>setQ(e.target.value)} />
      <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={ask}>Ask</button>
      <div className='bg-neutral-900 border border-neutral-800 rounded-md p-3 text-sm whitespace-pre-wrap'>{a}</div>
    </div>
  )
}
