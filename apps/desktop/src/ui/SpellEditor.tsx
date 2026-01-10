import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import clsx from 'classnames'

type SpellForm = {
  id?: number
  name: string
  school: string
  sphere: string
  class_list: string
  level: number
  range: string
  components: string
  material_components: string
  casting_time: string
  duration: string
  area: string
  saving_throw: string
  reversible: boolean
  description: string
  tags: string
  source: string
  edition: string
  author: string
  license: string
}

type SpellRecord = SpellForm & {
  created_at?: string | null
  updated_at?: string | null
}

type SpellHistoryEntry = {
  changed_at: string
  field: string
  old_value?: string | null
  new_value?: string | null
  actor: string
}

const emptySpell = (): SpellForm => ({
  name: '',
  school: '',
  sphere: '',
  class_list: '',
  level: 1,
  range: '',
  components: '',
  material_components: '',
  casting_time: '',
  duration: '',
  area: '',
  saving_throw: '',
  reversible: false,
  description: '',
  tags: '',
  source: '',
  edition: 'AD&D 2e',
  author: '',
  license: '',
})

const toNullable = (value: string) => (value.trim().length ? value : null)

export default function SpellEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<SpellForm>(emptySpell)
  const [history, setHistory] = useState<SpellHistoryEntry[]>([])
  const [timestamps, setTimestamps] = useState<{ created_at?: string | null; updated_at?: string | null }>({})
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const isEditing = useMemo(() => Boolean(id), [id])

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      invoke<SpellRecord>('get_spell', { id: Number(id) }),
      invoke<SpellHistoryEntry[]>('get_spell_history', { spell_id: Number(id) }),
    ])
      .then(([spell, historyEntries]) => {
        if (!active) return
        setForm({
          id: spell.id,
          name: spell.name ?? '',
          school: spell.school ?? '',
          sphere: spell.sphere ?? '',
          class_list: spell.class_list ?? '',
          level: spell.level ?? 1,
          range: spell.range ?? '',
          components: spell.components ?? '',
          material_components: spell.material_components ?? '',
          casting_time: spell.casting_time ?? '',
          duration: spell.duration ?? '',
          area: spell.area ?? '',
          saving_throw: spell.saving_throw ?? '',
          reversible: Boolean(spell.reversible),
          description: spell.description ?? '',
          tags: spell.tags ?? '',
          source: spell.source ?? '',
          edition: spell.edition ?? 'AD&D 2e',
          author: spell.author ?? '',
          license: spell.license ?? '',
        })
        setTimestamps({ created_at: spell.created_at ?? null, updated_at: spell.updated_at ?? null })
        setHistory(historyEntries)
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
  }, [id])

  const updateField = <K extends keyof SpellForm>(key: K, value: SpellForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const validate = () => {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = 'Name is required.'
    if (!form.description.trim()) errors.description = 'Description is required.'
    if (!Number.isFinite(form.level)) errors.level = 'Level is required.'
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setError(null)
    const payload = {
      id: form.id,
      name: form.name.trim(),
      school: toNullable(form.school),
      sphere: toNullable(form.sphere),
      class_list: toNullable(form.class_list),
      level: Number(form.level),
      range: toNullable(form.range),
      components: toNullable(form.components),
      material_components: toNullable(form.material_components),
      casting_time: toNullable(form.casting_time),
      duration: toNullable(form.duration),
      area: toNullable(form.area),
      saving_throw: toNullable(form.saving_throw),
      reversible: form.reversible,
      description: form.description.trim(),
      tags: toNullable(form.tags),
      source: toNullable(form.source),
      edition: toNullable(form.edition) ?? 'AD&D 2e',
      author: toNullable(form.author),
      license: toNullable(form.license),
    }
    try {
      if (isEditing) {
        await invoke('update_spell', { spell: payload })
        if (form.id) {
          const refreshed = await invoke<SpellRecord>('get_spell', { id: form.id })
          setTimestamps({ created_at: refreshed.created_at ?? null, updated_at: refreshed.updated_at ?? null })
          const historyEntries = await invoke<SpellHistoryEntry[]>('get_spell_history', { spell_id: form.id })
          setHistory(historyEntries)
        }
      } else {
        const newId = await invoke<number>('create_spell', { spell: payload })
        navigate(`/spell/${newId}`)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-neutral-400">Loading spell…</div>
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit Spell' : 'New Spell'}</h2>
          <p className="text-sm text-neutral-400">Fill every field from the schema and save to persist it.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="px-3 py-2 bg-neutral-800 rounded-md text-sm">
            Back to Library
          </Link>
          <button className="px-3 py-2 bg-emerald-600 rounded-md text-sm" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Spell'}
          </button>
        </div>
      </header>

      {error && (
        <div className="border border-red-600/50 bg-red-900/20 text-red-200 px-3 py-2 rounded-md text-sm">{error}</div>
      )}

      <section className="grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-neutral-400">Name</label>
            <input
              className={clsx(
                'w-full bg-neutral-900 border rounded-md px-3 py-2',
                validationErrors.name ? 'border-red-500' : 'border-neutral-700',
              )}
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            {validationErrors.name && <p className="text-xs text-red-400">{validationErrors.name}</p>}
          </div>
          <div>
            <label className="text-sm text-neutral-400">School</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.school}
              onChange={(e) => updateField('school', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Sphere</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.sphere}
              onChange={(e) => updateField('sphere', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Class List (JSON)</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.class_list}
              onChange={(e) => updateField('class_list', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Level</label>
            <input
              type="number"
              className={clsx(
                'w-full bg-neutral-900 border rounded-md px-3 py-2',
                validationErrors.level ? 'border-red-500' : 'border-neutral-700',
              )}
              value={Number.isFinite(form.level) ? form.level : ''}
              onChange={(e) => updateField('level', e.target.value === '' ? Number.NaN : Number(e.target.value))}
            />
            {validationErrors.level && <p className="text-xs text-red-400">{validationErrors.level}</p>}
          </div>
          <div>
            <label className="text-sm text-neutral-400">Range</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.range}
              onChange={(e) => updateField('range', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Components</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.components}
              onChange={(e) => updateField('components', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Material Components</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.material_components}
              onChange={(e) => updateField('material_components', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Casting Time</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.casting_time}
              onChange={(e) => updateField('casting_time', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-neutral-400">Duration</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.duration}
              onChange={(e) => updateField('duration', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Area</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.area}
              onChange={(e) => updateField('area', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Saving Throw</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.saving_throw}
              onChange={(e) => updateField('saving_throw', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="reversible"
              type="checkbox"
              checked={form.reversible}
              onChange={(e) => updateField('reversible', e.target.checked)}
            />
            <label htmlFor="reversible" className="text-sm text-neutral-300">
              Reversible
            </label>
          </div>
          <div>
            <label className="text-sm text-neutral-400">Tags (JSON)</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.tags}
              onChange={(e) => updateField('tags', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Source</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.source}
              onChange={(e) => updateField('source', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Edition</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.edition}
              onChange={(e) => updateField('edition', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Author</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.author}
              onChange={(e) => updateField('author', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">License</label>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={form.license}
              onChange={(e) => updateField('license', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-sm text-neutral-400">Description</label>
        <textarea
          className={clsx(
            'w-full bg-neutral-900 border rounded-md px-3 py-2 min-h-[160px]',
            validationErrors.description ? 'border-red-500' : 'border-neutral-700',
          )}
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
        />
        {validationErrors.description && <p className="text-xs text-red-400">{validationErrors.description}</p>}
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <h3 className="text-sm uppercase tracking-wide text-neutral-400">History</h3>
          {isEditing ? (
            history.length ? (
              <div className="space-y-2">
                {history.map((entry, index) => (
                  <div
                    key={`${entry.changed_at}-${index}`}
                    className="border border-neutral-800 rounded-md p-3 text-sm"
                  >
                    <div className="flex items-center justify-between text-neutral-400 text-xs">
                      <span>{entry.field}</span>
                      <span>{entry.changed_at}</span>
                    </div>
                    <div className="mt-1">
                      <span className="line-through text-red-300/80">{entry.old_value ?? '∅'}</span>
                      <span className="mx-2">→</span>
                      <span className="text-emerald-300">{entry.new_value ?? '∅'}</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">Actor: {entry.actor}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">No changes recorded yet.</div>
            )
          ) : (
            <div className="text-sm text-neutral-500">History is available after saving a spell.</div>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm uppercase tracking-wide text-neutral-400">Metadata</h3>
          <div className="text-xs text-neutral-500">Changes are logged per field whenever you update a spell.</div>
          <div className="text-xs text-neutral-500">
            Use JSON strings for tags and class lists until structured editors are added.
          </div>
          {timestamps.created_at && <div className="text-xs text-neutral-500">Created: {timestamps.created_at}</div>}
          {timestamps.updated_at && <div className="text-xs text-neutral-500">Updated: {timestamps.updated_at}</div>}
        </div>
      </section>
    </div>
  )
}
