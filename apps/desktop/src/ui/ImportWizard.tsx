import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type SpellSummary = {
  id?: number
  name: string
  level?: number
  class_list?: string
  source?: string
  description?: string
}

type ImportConflict = {
  key: {
    name_normalized: string
    class_key: string
    level: number
    source: string
  }
  existing: SpellSummary
  incoming: SpellSummary
}

type ImportResult = {
  preview: SpellSummary[]
  imported: SpellSummary[]
  conflicts: ImportConflict[]
}

type ImportMapping = {
  field_map: Record<string, string>
  defaults: Record<string, string>
}

const DEFAULT_FIELD_OPTIONS = [
  'name',
  'school',
  'sphere',
  'class_list',
  'level',
  'range',
  'components',
  'material_components',
  'casting_time',
  'duration',
  'area',
  'saving_throw',
  'description',
  'source',
  'tags',
  'edition',
  'author',
  'license',
  'reversible',
]

const DEFAULT_MAP_KEYS = ['school', 'sphere', 'class_list', 'range', 'components', 'casting_time', 'duration', 'area', 'saving_throw']

export default function ImportWizard(){
  const [files, setFiles] = useState<FileList | null>(null)
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<SpellSummary[]>([])
  const [conflicts, setConflicts] = useState<ImportConflict[]>([])
  const [imported, setImported] = useState<SpellSummary[]>([])
  const [mapping, setMapping] = useState<ImportMapping>({ field_map: {}, defaults: { source: '', edition: 'AD&D 2e' } })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filePaths = useMemo(() => {
    if (!files) return []
    return Array.from(files).map((file) => {
      const withPath = file as File & { path?: string }
      return withPath.path ?? file.name
    })
  }, [files])

  const canNext = step === 0 ? filePaths.length > 0 : step === 1 ? preview.length > 0 || conflicts.length > 0 : true

  const fieldMapRows = useMemo(() => {
    return DEFAULT_MAP_KEYS.map((key) => ({
      source: key,
      target: mapping.field_map[key] ?? key,
    }))
  }, [mapping])

  const handlePreview = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await invoke<ImportResult>('import_files', {
        request: {
          files: filePaths,
          mapping,
          resolutions: [],
          dry_run: true,
        },
      })
      setPreview(result.preview)
      setConflicts(result.conflicts)
      setStep(1)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await invoke<ImportResult>('import_files', {
        request: {
          files: filePaths,
          mapping,
          resolutions: [],
          dry_run: false,
        },
      })
      setImported(result.imported)
      setConflicts(result.conflicts)
      setStep(result.conflicts.length ? 2 : 2)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResolveConflicts = async () => {
    setError(null)
    setLoading(true)
    try {
      const resolutions = conflicts.map((conflict) => ({
        key: conflict.key,
        action: conflict.incoming?.description ? 'merge' : 'keep_existing',
      }))
      const result = await invoke<ImportResult>('import_files', {
        request: {
          files: filePaths,
          mapping,
          resolutions,
          dry_run: false,
        },
      })
      setImported(result.imported)
      setConflicts(result.conflicts)
      setStep(2)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const updateFieldMap = (source: string, target: string) => {
    setMapping((prev) => ({
      ...prev,
      field_map: {
        ...prev.field_map,
        [source]: target,
      },
    }))
  }

  const updateDefault = (field: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      defaults: {
        ...prev.defaults,
        [field]: value,
      },
    }))
  }

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className='space-y-4'>
          <div>
            <label className='block text-sm text-neutral-400'>Select import files (PDF, DOCX, Markdown).</label>
            <input type='file' multiple onChange={(e)=>setFiles(e.target.files)} />
          </div>
          <div className='text-sm text-neutral-400'>Selected files: {filePaths.length}</div>
          {filePaths.length > 0 && (
            <pre className='text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800'>
              {filePaths.join('\n')}
            </pre>
          )}
          <button
            className='px-3 py-2 bg-neutral-800 rounded-md disabled:opacity-40'
            onClick={handlePreview}
            disabled={!filePaths.length || loading}
          >
            {loading ? 'Parsing…' : 'Preview & Map'}
          </button>
        </div>
      )
    }

    if (step === 1) {
      return (
        <div className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <h3 className='font-semibold'>Field mapping</h3>
              <p className='text-sm text-neutral-400'>Map sidecar fields to spellbook schema fields.</p>
              <div className='space-y-2'>
                {fieldMapRows.map((row) => (
                  <div key={row.source} className='flex items-center gap-2'>
                    <span className='w-32 text-xs text-neutral-400'>{row.source}</span>
                    <select
                      className='bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm'
                      value={row.target}
                      onChange={(event)=>updateFieldMap(row.source, event.target.value)}
                    >
                      {DEFAULT_FIELD_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className='space-y-2'>
              <h3 className='font-semibold'>Defaults</h3>
              <p className='text-sm text-neutral-400'>Fill in missing metadata for all spells.</p>
              <div className='space-y-2'>
                <label className='text-xs text-neutral-400'>Source</label>
                <input
                  className='w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm'
                  value={mapping.defaults.source ?? ''}
                  onChange={(event)=>updateDefault('source', event.target.value)}
                />
                <label className='text-xs text-neutral-400'>Edition</label>
                <input
                  className='w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm'
                  value={mapping.defaults.edition ?? ''}
                  onChange={(event)=>updateDefault('edition', event.target.value)}
                />
              </div>
            </div>
          </div>
          <div>
            <h3 className='font-semibold'>Preview ({preview.length})</h3>
            <div className='max-h-64 overflow-auto border border-neutral-800 rounded-md'>
              <table className='w-full text-xs'>
                <thead className='text-neutral-400 bg-neutral-950'>
                  <tr>
                    <th className='text-left px-2 py-1'>Name</th>
                    <th className='text-left px-2 py-1'>Level</th>
                    <th className='text-left px-2 py-1'>Class</th>
                    <th className='text-left px-2 py-1'>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((spell, index) => (
                    <tr key={`${spell.name}-${index}`} className='border-t border-neutral-800'>
                      <td className='px-2 py-1'>{spell.name}</td>
                      <td className='px-2 py-1'>{spell.level ?? '-'}</td>
                      <td className='px-2 py-1'>{spell.class_list ?? '-'}</td>
                      <td className='px-2 py-1'>{spell.source ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className='flex gap-2'>
            <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={()=>setStep(0)}>Back</button>
            <button className='px-3 py-2 bg-emerald-700 rounded-md disabled:opacity-40' onClick={handleImport} disabled={loading}>
              {loading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className='space-y-4'>
        <h3 className='font-semibold'>Deduplication & Results</h3>
        {conflicts.length > 0 && (
          <div className='space-y-2'>
            <p className='text-sm text-amber-300'>Conflicts detected ({conflicts.length}). Resolve to continue.</p>
            <div className='space-y-3'>
              {conflicts.map((conflict) => (
                <div key={`${conflict.key.name_normalized}-${conflict.key.level}-${conflict.key.source}`} className='border border-neutral-800 rounded-md p-3 space-y-2'>
                  <div className='text-sm font-semibold'>{conflict.incoming.name}</div>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-xs'>
                    <div className='bg-neutral-950 p-2 rounded-md'>
                      <div className='text-neutral-400'>Existing</div>
                      <div>{conflict.existing.name}</div>
                      <div>Level {conflict.existing.level ?? '-'}</div>
                      <div>{conflict.existing.source ?? '-'}</div>
                    </div>
                    <div className='bg-neutral-950 p-2 rounded-md'>
                      <div className='text-neutral-400'>Incoming</div>
                      <div>{conflict.incoming.name}</div>
                      <div>Level {conflict.incoming.level ?? '-'}</div>
                      <div>{conflict.incoming.source ?? '-'}</div>
                    </div>
                  </div>
                  <div className='text-xs text-neutral-400'>Default action: merge fields where missing.</div>
                </div>
              ))}
            </div>
            <button className='px-3 py-2 bg-amber-600 rounded-md' onClick={handleResolveConflicts} disabled={loading}>
              {loading ? 'Resolving…' : 'Resolve Conflicts'}
            </button>
          </div>
        )}
        {conflicts.length === 0 && (
          <div className='space-y-2'>
            <p className='text-sm text-emerald-300'>Import complete! {imported.length} spells added.</p>
            <div className='max-h-48 overflow-auto border border-neutral-800 rounded-md'>
              <ul className='text-xs p-2 space-y-1'>
                {imported.map((spell, index) => (
                  <li key={`${spell.name}-${index}`}>{spell.name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2 text-xs text-neutral-400'>
        <span className={step === 0 ? 'text-white' : ''}>1. Files</span>
        <span>→</span>
        <span className={step === 1 ? 'text-white' : ''}>2. Map</span>
        <span>→</span>
        <span className={step === 2 ? 'text-white' : ''}>3. Deduplicate</span>
      </div>
      {error && (
        <div className='text-sm text-red-400 border border-red-900 bg-red-950/40 p-2 rounded-md'>{error}</div>
      )}
      {renderStep()}
      <div className='text-xs text-neutral-500'>
        Payload: <code>mapping</code> + <code>resolutions</code> JSON is sent to <code>import_files</code>.
      </div>
      <button className='px-3 py-2 bg-neutral-800 rounded-md' onClick={() => invoke('reparse_artifact', { spell_id: 1 })}>
        Reparse last artifact (spell #1)
      </button>
    </div>
  )
}
