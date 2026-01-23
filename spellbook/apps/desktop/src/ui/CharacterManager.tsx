import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Character, CharacterClass } from "../types/character";

export default function CharacterManager() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [charClasses, setCharClasses] = useState<Record<number, CharacterClass[]>>({});
  const [newCharName, setNewCharName] = useState("");
  const [newCharType, setNewCharType] = useState<"PC" | "NPC">("PC");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PC" | "NPC">("ALL");

  const loadCharacters = useCallback(async () => {
    const list = await invoke<Character[]>("list_characters");
    setCharacters(list);

    // Load classes for all characters to show primary class
    const classMap: Record<number, CharacterClass[]> = {};
    for (const char of list) {
      try {
        const classes = await invoke<CharacterClass[]>("get_character_classes", {
          characterId: char.id,
        });
        classMap[char.id] = classes;
      } catch (e) {
        console.error(`Failed to load classes for ${char.name}:`, e);
      }
    }
    setCharClasses(classMap);
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

  const deleteCharacter = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;

    try {
      await invoke("delete_character", { id });
      loadCharacters();
    } catch (e) {
      console.error(e);
      alert(`Failed to delete character: ${e}`);
    }
  };

  const filteredCharacters = characters.filter((c) => {
    if (typeFilter === "ALL") return true;
    return c.character_type === typeFilter;
  });

  const getPrimaryClass = (charId: number) => {
    const classes = charClasses[charId];
    if (!classes || classes.length === 0) return null;
    // For simplicity, first class is "primary" or show multi-class string
    if (classes.length === 1) return `${classes[0].class_name} ${classes[0].level}`;
    return classes.map((c) => `${c.class_name.charAt(0)}${c.level}`).join("/");
  };

  return (
    <div className="flex h-full gap-6 p-4">
      <div className="w-80 border-r border-neutral-800 pr-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Characters</h1>
          <div className="flex gap-1" data-testid="character-type-filters">
            {(["ALL", "PC", "NPC"] as const).map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`filter-type-${t.toLowerCase()}`}
                onClick={() => setTypeFilter(t)}
                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                  typeFilter === t
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-500"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="w-full bg-neutral-900 border border-neutral-700 p-1 rounded text-sm placeholder-neutral-600"
            placeholder="New Name"
            data-testid="new-character-name-input"
            aria-label="New character name"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
          />
          <button
            type="button"
            data-testid="btn-create-character"
            onClick={createCharacter}
            className="px-3 bg-blue-600 rounded text-sm hover:bg-blue-500 transition-colors"
          >
            +
          </button>
        </div>

        <div
          className="space-y-1 overflow-auto max-h-[calc(100vh-250px)]"
          data-testid="character-list"
        >
          {filteredCharacters.map((c) => (
            <Link
              key={c.id}
              to={`/character/${c.id}/edit`}
              data-testid={`character-item-${c.name.replace(/\s+/g, "-").toLowerCase()}`}
              className="block w-full text-left px-3 py-2 rounded text-neutral-300 hover:bg-neutral-800/50 group relative"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium group-hover:text-white transition-colors"
                    data-testid="character-name-label"
                  >
                    {c.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-1 rounded bg-neutral-800 text-neutral-500 uppercase tracking-tighter"
                      data-testid="character-type-badge"
                    >
                      {c.character_type}
                    </span>
                    <button
                      type="button"
                      data-testid="btn-delete-character"
                      onClick={(e) => deleteCharacter(e, c.id, c.name)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-500 transition-all"
                      title="Delete Character"
                    >
                      <svg
                        role="img"
                        aria-label="Delete"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span data-testid="character-info-label">
                    {c.race || "No Race"} · {c.alignment || "No Align"}
                  </span>
                  <span className="text-neutral-400 font-mono" data-testid="character-class-label">
                    {getPrimaryClass(c.id) || "No Class"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {filteredCharacters.length === 0 && (
            <div
              className="p-4 text-center text-sm text-neutral-600 italic"
              data-testid="no-characters-found"
            >
              {typeFilter === "ALL" ? "No characters yet." : `No ${typeFilter} characters.`}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-neutral-800">
          <Link
            to="/"
            data-testid="link-back-to-library"
            className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors"
          >
            ← Back to Library
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-neutral-900/30 rounded-lg border border-neutral-800/50 border-dashed">
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="h-12 w-12 bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-neutral-500">
            <svg
              role="img"
              aria-label="User"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-200">Select a Character</h3>
          <p className="text-sm text-neutral-500">
            Select a character from the list to manage their identity, abilities, classes, and
            spellbook.
          </p>
          <div className="pt-2">
            <p className="text-xs text-neutral-600 leading-relaxed">
              Multi-class characters can manage spells for each class independently.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
