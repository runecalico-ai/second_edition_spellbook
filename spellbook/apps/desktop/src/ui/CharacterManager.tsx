import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Character = {
  id: number;
  name: string;
  type: "PC" | "NPC";
  notes?: string;
};

export default function CharacterManager() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharType, setNewCharType] = useState<"PC" | "NPC">("PC");

  const loadCharacters = useCallback(async () => {
    const list = await invoke<Character[]>("list_characters");
    setCharacters(list);
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

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

  return (
    <div className="flex h-full gap-6 p-4">
      <div className="w-72 border-r border-neutral-800 pr-4 space-y-4">
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
            <Link
              key={c.id}
              to={`/character/${c.id}/builder`}
              className="block w-full text-left px-3 py-2 rounded text-neutral-300 hover:bg-neutral-800/50"
            >
              <span className="flex items-center justify-between">
                <span>{c.name}</span>
                <span className="text-xs text-neutral-500">{c.type}</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="pt-4 border-t border-neutral-800">
          <Link to="/" className="text-sm text-neutral-500 hover:text-white">
            ← Back to Library
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Spellbook Builder</h3>
          <p className="text-sm text-neutral-500">
            Select a character to manage their spellbook, toggles, and notes.
          </p>
          <p className="text-xs text-neutral-600">
            You can also add or remove spells from each character.
          </p>
        </div>
      </div>
    </div>
  );
}
