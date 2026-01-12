import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Character = {
  id: number;
  name: string;
  notes?: string;
};

type CharacterSpellbookEntry = {
  spell_id: number;
  name: string;
  level: number;
  school?: string;
  prepared: number;
  known: number;
  notes?: string;
};

export default function CharacterManager() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [spellbook, setSpellbook] = useState<CharacterSpellbookEntry[]>([]);
  const [newCharName, setNewCharName] = useState("");

  const loadCharacters = useCallback(async () => {
    const list = await invoke<Character[]>("list_characters");
    setCharacters(list);
  }, []);

  const loadSpellbook = useCallback(async (charId: number) => {
    const book = await invoke<CharacterSpellbookEntry[]>("get_character_spellbook", {
      characterId: charId,
    });
    setSpellbook(book);
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (selectedChar) {
      loadSpellbook(selectedChar.id);
    } else {
      setSpellbook([]);
    }
  }, [selectedChar, loadSpellbook]);

  const createCharacter = async () => {
    if (!newCharName.trim()) return;
    try {
      await invoke("create_character", { name: newCharName, notes: "" });
      setNewCharName("");
      loadCharacters();
    } catch (e) {
      console.error(e);
      alert(`Failed to create character: ${e}`);
    }
  };

  const togglePrepared = async (entry: CharacterSpellbookEntry) => {
    if (!selectedChar) return;
    const newPrepared = entry.prepared ? 0 : 1;
    await invoke("update_character_spell", {
      characterId: selectedChar.id,
      spellId: entry.spell_id,
      prepared: newPrepared,
      known: entry.known,
      notes: entry.notes,
    });
    setSpellbook((prev) =>
      prev.map((p) => (p.spell_id === entry.spell_id ? { ...p, prepared: newPrepared } : p)),
    );
  };

  const toggleKnown = async (entry: CharacterSpellbookEntry) => {
    if (!selectedChar) return;
    const newKnown = entry.known ? 0 : 1;
    await invoke("update_character_spell", {
      characterId: selectedChar.id,
      spellId: entry.spell_id,
      prepared: entry.prepared,
      known: newKnown,
      notes: entry.notes,
    });
    setSpellbook((prev) =>
      prev.map((p) => (p.spell_id === entry.spell_id ? { ...p, known: newKnown } : p)),
    );
  };

  return (
    <div className="flex h-full gap-4">
      <div className="w-64 border-r border-neutral-800 p-4 space-y-4">
        <h2 className="text-xl font-bold">Characters</h2>
        <div className="flex gap-2">
          <input
            className="w-full bg-neutral-900 border border-neutral-700 p-1 rounded"
            placeholder="New Name"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
          />
          <button type="button" onClick={createCharacter} className="px-2 bg-blue-600 rounded">
            +
          </button>
        </div>
        <div className="space-y-1">
          {characters.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelectedChar(c)}
              className={`block w-full text-left px-3 py-2 rounded ${selectedChar?.id === c.id ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="pt-4 border-t border-neutral-800">
          <Link to="/" className="text-sm text-neutral-500 hover:text-white">
            ← Back to Library
          </Link>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {!selectedChar ? (
          <div className="text-neutral-500 flex items-center justify-center h-full">
            Select a character to view their spellbook
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">{selectedChar.name}</h2>
              <span className="text-neutral-500">{spellbook.length} spells known</span>
            </div>

            <table className="w-full text-left text-sm border-collapse">
              <thead className="text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="p-2 w-10 text-center">Prep</th>
                  <th className="p-2 w-10 text-center">Known</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Level</th>
                  <th className="p-2">School</th>
                  <th className="p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {spellbook.map((s) => (
                  <tr
                    key={s.spell_id}
                    className="border-b border-neutral-800/30 hover:bg-neutral-800/30"
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!s.prepared}
                        onChange={() => togglePrepared(s)}
                        aria-label={`Prepared ${s.name}`}
                        className="rounded bg-neutral-900 border-neutral-700"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!s.known}
                        onChange={() => toggleKnown(s)}
                        aria-label={`Known ${s.name}`}
                        className="rounded bg-neutral-900 border-neutral-700"
                      />
                    </td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2">{s.level}</td>
                    <td className="p-2">{s.school}</td>
                    <td className="p-2">
                      <input
                        className="w-full bg-transparent border-none p-0 text-neutral-300 placeholder-neutral-600 focus:ring-0"
                        value={s.notes || ""}
                        placeholder="Add notes…"
                        onChange={(e) => {
                          const val = e.target.value;
                          setSpellbook((prev) =>
                            prev.map((p) => (p.spell_id === s.spell_id ? { ...p, notes: val } : p)),
                          );
                        }}
                        onBlur={async () => {
                          if (!selectedChar) return;
                          await invoke("update_character_spell", {
                            characterId: selectedChar.id,
                            spellId: s.spell_id,
                            prepared: s.prepared,
                            known: s.known,
                            notes: s.notes,
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {spellbook.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-500">
                      No spells added. Go to Library and use the "+" menu to add spells.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
