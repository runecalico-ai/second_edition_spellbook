import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type ImportFile = {
  name: string
  content: string
}

type ImportResult = {
  spells: { name: string; level: number; school?: string }[]
  conflicts: { path: string; reason: string }[]
}

export default function ImportWizard(){
  const [files, setFiles] = useState<FileList | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  const startImport = async () => {
    if (!files) return
    setLoading(true)
    const payload: ImportFile[] = []
    for (const file of Array.from(files)) {
      payload.push({ name: file.name, content: await file.text() })
    }
    const response = await invoke<ImportResult>('import_files', { files: payload })
    setResult(response)
    setLoading(false)
  }

  return (
    <div className='space-y-3'>
      <input type='file' multiple onChange={(e)=>setFiles(e.target.files)} />
      <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={startImport} disabled={!files || loading}>
        {loading ? 'Importing…' : 'Start Import'}
      </button>
      <pre className='text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800'>
        {files && Array.from(files).map(f=>f.name).join('\n')}
      </pre>
      {result && (
        <div className='text-sm space-y-2'>
          <div>Imported spells: {result.spells.length}</div>
          {result.conflicts.length > 0 && (
            <div className='bg-neutral-950 border border-neutral-800 rounded-md p-2'>
              <div className='font-semibold'>Conflicts</div>
              <ul className='list-disc pl-4'>
                {result.conflicts.map((c, idx) => (
                  <li key={idx}>{c.path}: {c.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
