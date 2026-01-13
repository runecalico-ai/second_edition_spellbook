import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Character = {
  id: number;
  name: string;
  type: "PC" | "NPC";
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
  const [newCharType, setNewCharType] = useState<"PC" | "NPC">("PC");
  const [statusMessage, setStatusMessage] = useState("");

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
      setStatusMessage("");
    } else {
      setSpellbook([]);
      setStatusMessage("");
    }
  }, [selectedChar, loadSpellbook]);

  const createCharacter = async () => {
    if (!newCharName.trim()) return;
    try {
      await invoke("create_character", {
        name: newCharName,
        characterType: newCharType,
        notes: "",
      });
      setNewCharName("");
      setNewCharType("PC");
      loadCharacters();
    } catch (e) {
      console.error(e);
      alert(`Failed to create character: ${e}`);
    }
  };

  const removeSpell = async (entry: CharacterSpellbookEntry) => {
    if (!selectedChar) return;
    try {
      await invoke("remove_character_spell", {
        characterId: selectedChar.id,
        spellId: entry.spell_id,
      });
      setSpellbook((prev) => prev.filter((p) => p.spell_id !== entry.spell_id));
    } catch (e) {
      alert(`Failed to remove spell: ${e}`);
    }
  };

  const printSpellbook = async (layout: "compact" | "stat-block") => {
    if (!selectedChar) return;
    setStatusMessage("Generating spellbook print…");
    try {
      const path = await invoke<string>("print_spellbook", {
        characterId: selectedChar.id,
        layout,
      });
      setStatusMessage(path ? `Print ready: ${path}` : "No output returned");
    } catch (e) {
      setStatusMessage(`Print failed: ${e}`);
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
          <select
            className="bg-neutral-900 border border-neutral-700 p-1 rounded text-sm"
            value={newCharType}
            onChange={(e) => setNewCharType(e.target.value as "PC" | "NPC")}
          >
            <option value="PC">PC</option>
            <option value="NPC">NPC</option>
          </select>
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
              <span className="flex items-center justify-between">
                <span>{c.name}</span>
                <span className="text-xs text-neutral-500">{c.type}</span>
              </span>
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
              <div>
                <h2 className="text-2xl font-bold">{selectedChar.name}</h2>
                <p className="text-xs text-neutral-500">{selectedChar.type} spellbook</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-neutral-500">{spellbook.length} spells known</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => printSpellbook("compact")}
                    className="px-2 py-1 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
                  >
                    Print Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => printSpellbook("stat-block")}
                    className="px-2 py-1 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
                  >
                    Print Stat-block
                  </button>
                </div>
              </div>
            </div>
            {statusMessage && <div className="text-xs text-neutral-400">{statusMessage}</div>}

            <table className="w-full text-left text-sm border-collapse">
              <thead className="text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="p-2 w-10 text-center">Prep</th>
                  <th className="p-2 w-10 text-center">Known</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Level</th>
                  <th className="p-2">School</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2 w-20 text-right">Actions</th>
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
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeSpell(s)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {spellbook.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-neutral-500">
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
