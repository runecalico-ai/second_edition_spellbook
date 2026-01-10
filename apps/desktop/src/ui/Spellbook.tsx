import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Character = {
  id?: number
  name: string
  notes?: string | null
}

type Spell = {
  id?: number
  name: string
  school?: string | null
  level: number
}

type SpellbookEntry = {
  character_id: number
  spell_id: number
  prepared: boolean
  known: boolean
  notes?: string | null
  name: string
  school?: string | null
  level: number
}

export default function Spellbook() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const [spells, setSpells] = useState<Spell[]>([])
  const [entries, setEntries] = useState<SpellbookEntry[]>([])
  const [newCharacterName, setNewCharacterName] = useState('')
  const [newCharacterNotes, setNewCharacterNotes] = useState('')
  const [newSpellId, setNewSpellId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [entryLoading, setEntryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([invoke<Character[]>('list_characters'), invoke<Spell[]>('list_spells')])
      .then(([characterRows, spellRows]) => {
        if (!active) return
        setCharacters(characterRows)
        setSpells(spellRows)
        if (characterRows.length && selectedCharacterId === null) {
          setSelectedCharacterId(characterRows[0].id ?? null)
        }
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

  useEffect(() => {
    if (!selectedCharacterId) {
      setEntries([])
      return
    }
    let active = true
    setEntryLoading(true)
    setError(null)
    invoke<SpellbookEntry[]>('list_spellbook_entries', { character_id: selectedCharacterId })
      .then((rows) => {
        if (!active) return
        setEntries(rows)
      })
      .catch((err) => {
        if (!active) return
        setError(String(err))
      })
      .finally(() => {
        if (!active) return
        setEntryLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedCharacterId])

  const handleCreateCharacter = async () => {
    if (!newCharacterName.trim()) return
    setError(null)
    try {
      const id = await invoke<number>('create_character', {
        character: {
          name: newCharacterName.trim(),
          notes: newCharacterNotes.trim() || null,
        },
      })
      const next = { id, name: newCharacterName.trim(), notes: newCharacterNotes.trim() || null }
      setCharacters((prev) => [...prev, next])
      setSelectedCharacterId(id)
      setNewCharacterName('')
      setNewCharacterNotes('')
    } catch (err) {
      setError(String(err))
    }
  }

  const handleAddSpell = async () => {
    if (!selectedCharacterId || !newSpellId) return
    setError(null)
    try {
      await invoke('upsert_spellbook_entry', {
        character_id: selectedCharacterId,
        spell_id: newSpellId,
        prepared: false,
        known: true,
        notes: null,
      })
      const updated = await invoke<SpellbookEntry[]>('list_spellbook_entries', { character_id: selectedCharacterId })
      setEntries(updated)
      setNewSpellId(null)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleToggle = async (entry: SpellbookEntry, field: 'prepared' | 'known', value: boolean) => {
    setError(null)
    try {
      await invoke('upsert_spellbook_entry', {
        character_id: entry.character_id,
        spell_id: entry.spell_id,
        prepared: field === 'prepared' ? value : entry.prepared,
        known: field === 'known' ? value : entry.known,
        notes: entry.notes ?? null,
      })
      setEntries((prev) => prev.map((item) => (item.spell_id === entry.spell_id ? { ...item, [field]: value } : item)))
    } catch (err) {
      setError(String(err))
    }
  }

  const handleNotesChange = async (entry: SpellbookEntry, value: string) => {
    setEntries((prev) => prev.map((item) => (item.spell_id === entry.spell_id ? { ...item, notes: value } : item)))
    try {
      await invoke('upsert_spellbook_entry', {
        character_id: entry.character_id,
        spell_id: entry.spell_id,
        prepared: entry.prepared,
        known: entry.known,
        notes: value.trim() || null,
      })
    } catch (err) {
      setError(String(err))
    }
  }

  const handleRemove = async (entry: SpellbookEntry) => {
    setError(null)
    try {
      await invoke('delete_spellbook_entry', { character_id: entry.character_id, spell_id: entry.spell_id })
      setEntries((prev) => prev.filter((item) => item.spell_id !== entry.spell_id))
    } catch (err) {
      setError(String(err))
    }
  }

  if (loading) {
    return <div className="text-sm text-neutral-400">Loading spellbook…</div>
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Character Spellbooks</h2>
        <p className="text-sm text-neutral-400">Manage prepared and known spells with quick notes.</p>
      </header>

      {error && (
        <div className="border border-red-600/50 bg-red-900/20 text-red-200 px-3 py-2 rounded-md text-sm">{error}</div>
      )}

      <section className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-neutral-400">Characters</h3>
          <div className="space-y-2">
            <select
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={selectedCharacterId ?? ''}
              onChange={(e) => setSelectedCharacterId(e.target.value ? Number(e.target.value) : null)}
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id ?? ''}>
                  {character.name}
                </option>
              ))}
            </select>
            {selectedCharacter && selectedCharacter.notes && (
              <p className="text-xs text-neutral-500">{selectedCharacter.notes}</p>
            )}
          </div>
          <div className="border border-neutral-800 rounded-md p-3 space-y-2">
            <h4 className="text-sm font-semibold">Add Character</h4>
            <input
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              placeholder="Name"
              value={newCharacterName}
              onChange={(e) => setNewCharacterName(e.target.value)}
            />
            <textarea
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 min-h-[80px]"
              placeholder="Notes"
              value={newCharacterNotes}
              onChange={(e) => setNewCharacterNotes(e.target.value)}
            />
            <button className="px-3 py-2 bg-neutral-800 rounded-md text-sm" onClick={handleCreateCharacter}>
              Create Character
            </button>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-neutral-400">Add Spell</h3>
          <div className="flex gap-2">
            <select
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
              value={newSpellId ?? ''}
              onChange={(e) => setNewSpellId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select spell…</option>
              {spells.map((spell) => (
                <option key={spell.id} value={spell.id ?? ''}>
                  {spell.name} (Lv {spell.level})
                </option>
              ))}
            </select>
            <button className="px-3 py-2 bg-emerald-600 rounded-md text-sm" onClick={handleAddSpell}>
              Add
            </button>
          </div>
          <div className="text-xs text-neutral-500">Select a character to manage prepared and known spells.</div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400">Spellbook</h3>
        {entryLoading ? (
          <div className="text-sm text-neutral-500">Loading entries…</div>
        ) : entries.length ? (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.spell_id} className="border border-neutral-800 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{entry.name}</div>
                    <div className="text-xs text-neutral-500">
                      {entry.school ?? 'Unknown'} • Level {entry.level}
                    </div>
                  </div>
                  <button className="text-xs text-red-400" onClick={() => handleRemove(entry)}>
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={entry.prepared}
                      onChange={(e) => handleToggle(entry, 'prepared', e.target.checked)}
                    />
                    Prepared
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={entry.known}
                      onChange={(e) => handleToggle(entry, 'known', e.target.checked)}
                    />
                    Known
                  </label>
                </div>
                <textarea
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 min-h-[80px]"
                  placeholder="Notes"
                  value={entry.notes ?? ''}
                  onChange={(e) => handleNotesChange(entry, e.target.value)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">No spells tracked yet.</div>
        )}
      </section>
    </div>
  )
}
