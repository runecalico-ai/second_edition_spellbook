import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

    const loadCharacters = async () => {
        const list = await invoke<Character[]>("list_characters");
        setCharacters(list);
    };

    const loadSpellbook = async (charId: number) => {
        const book = await invoke<CharacterSpellbookEntry[]>("get_character_spellbook", { characterId: charId });
        setSpellbook(book);
    };

    useEffect(() => {
        loadCharacters();
    }, []);

    useEffect(() => {
        if (selectedChar) {
            loadSpellbook(selectedChar.id);
        } else {
            setSpellbook([]);
        }
    }, [selectedChar]);

    const createCharacter = async () => {
        if (!newCharName.trim()) return;
        try {
            await invoke("create_character", { name: newCharName, notes: "" });
            setNewCharName("");
            loadCharacters();
        } catch (e) {
            console.error(e);
            alert("Failed to create character: " + e);
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
            notes: entry.notes
        });
        setSpellbook(prev => prev.map(p => p.spell_id === entry.spell_id ? { ...p, prepared: newPrepared } : p));
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
                        onChange={e => setNewCharName(e.target.value)}
                    />
                    <button onClick={createCharacter} className="px-2 bg-blue-600 rounded">+</button>
                </div>
                <div className="space-y-1">
                    {characters.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedChar(c)}
                            className={`block w-full text-left px-3 py-2 rounded ${selectedChar?.id === c.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800/50'}`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
                <div className="pt-4 border-t border-neutral-800">
                    <Link to="/" className="text-sm text-neutral-500 hover:text-white">← Back to Library</Link>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-auto">
                {!selectedChar ? (
                    <div className="text-neutral-500 flex items-center justify-center h-full">Select a character to view their spellbook</div>
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
                                    <th className="p-2">Name</th>
                                    <th className="p-2">Level</th>
                                    <th className="p-2">School</th>
                                    <th className="p-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {spellbook.map(s => (
                                    <tr key={s.spell_id} className="border-b border-neutral-800/30 hover:bg-neutral-800/30">
                                        <td className="p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={!!s.prepared}
                                                onChange={() => togglePrepared(s)}
                                                className="rounded bg-neutral-900 border-neutral-700"
                                            />
                                        </td>
                                        <td className="p-2">{s.name}</td>
                                        <td className="p-2">{s.level}</td>
                                        <td className="p-2">{s.school}</td>
                                        <td className="p-2 text-neutral-500 italic">{s.notes}</td>
                                    </tr>
                                ))}
                                {spellbook.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-neutral-500">
                                            No spells added. Go to Library and "Add to Character" (Coming Soon in M2).
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
