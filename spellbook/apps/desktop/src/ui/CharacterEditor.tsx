import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import type { Character, CharacterAbilities, CharacterClass, CharacterSpellbookEntry } from "../types/character";

const SPHERES = ["All", "Animal", "Astral", "Charm", "Combat", "Creation", "Divination", "Elemental", "Guardian", "Healing", "Necromantic", "Plant", "Protection", "Summoning", "Sun", "Weather"];

const ALIGNMENTS = [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "True Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil"
];

const CORE_CLASSES = [
    "Fighter", "Paladin", "Ranger",
    "Mage", "Specialist Wizard",
    "Cleric", "Druid", "Priest",
    "Thief", "Bard",
    "Other"
];

export default function CharacterEditor() {
    const { id } = useParams();
    const characterId = Number.parseInt(id || "", 10);

    const [character, setCharacter] = useState<Character | null>(null);
    const [abilities, setAbilities] = useState<CharacterAbilities | null>(null);
    const [classes, setClasses] = useState<CharacterClass[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        if (!Number.isFinite(characterId)) return;
        setLoading(true);
        try {
            const char = await invoke<Character>("get_character", { id: characterId });
            const abs = await invoke<CharacterAbilities | null>("get_character_abilities", {
                characterId,
            });
            const cls = await invoke<CharacterClass[]>("get_character_classes", {
                characterId,
            });

            setCharacter(char);
            setAbilities(abs || {
                id: 0,
                character_id: characterId,
                str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, com: 10,
            });
            setClasses(cls);
        } catch (e) {
            console.error("Failed to load character data:", e);
        } finally {
            setLoading(false);
        }
    }, [characterId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const saveIdentity = async () => {
        if (!character) return;
        setSaving(true);
        try {
            await invoke("update_character_details", {
                id: character.id,
                name: character.name,
                characterType: character.character_type,
                race: character.race,
                alignment: character.alignment,
                comEnabled: character.com_enabled ? 1 : 0,
                notes: character.notes,
            });
        } catch (e) {
            console.error("Save identity failed:", e);
            alert(`Save failed: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    const saveAbilities = async () => {
        if (!abilities) return;
        setSaving(true);
        try {
            await invoke("update_character_abilities", {
                characterId: parseInt(id!),
                ...abilities,
            });
        } catch (e) {
            console.error("Save abilities failed:", e);
            alert(`Save failed: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-neutral-500 italic">
                Loading character profile...
            </div>
        );
    }

    if (!character) {
        return (
            <div className="p-8 text-center text-neutral-500">
                Character not found. <Link to="/character" className="text-blue-500">Back to list</Link>
            </div>
        );
    }

    return (
        <div className="flex h-full gap-6 p-4 overflow-hidden">
            {/* Scrollable Main Area */}
            <div className="flex-1 overflow-auto space-y-8 pr-4 custom-scrollbar">
                <header className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">
                            {character.name}
                        </h2>
                        <p className="text-sm text-neutral-500 font-mono">
                            Profile Foundation — {character.character_type}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <Link to="/character" className="text-neutral-500 hover:text-white transition-colors">
                            ← Back
                        </Link>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-neutral-500 hover:text-white transition-colors"
                        >
                            Reload
                        </button>
                    </div>
                </header>

                {/* Identity Panel */}
                <section className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                            Identity
                        </h3>
                        <button
                            onClick={saveIdentity}
                            disabled={saving}
                            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Identity"}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <label htmlFor="char-name" className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold ml-1">Name</label>
                            <input
                                id="char-name"
                                className="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-600/50 focus:ring-1 focus:ring-blue-600/20 p-2.5 rounded-lg text-sm transition-all outline-none"
                                value={character.name}
                                onChange={e => setCharacter({ ...character, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="char-race" className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold ml-1">Race</label>
                            <input
                                id="char-race"
                                className="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-600/50 focus:ring-1 focus:ring-blue-600/20 p-2.5 rounded-lg text-sm transition-all outline-none"
                                value={character.race || ""}
                                onChange={e => setCharacter({ ...character, race: e.target.value })}
                                placeholder="e.g. Human, Elf, Dwarf"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="char-alignment" className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold ml-1">Alignment</label>
                            <select
                                id="char-alignment"
                                className="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-600/50 focus:ring-1 focus:ring-blue-600/20 p-2.5 rounded-lg text-sm transition-all outline-none appearance-none"
                                value={character.alignment || ""}
                                onChange={e => setCharacter({ ...character, alignment: e.target.value })}
                            >
                                <option value="">Select Alignment</option>
                                {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 pt-2">
                        <label className="flex items-center cursor-pointer group">
                            <input
                                type="checkbox"
                                id="toggle-com"
                                className="sr-only peer"
                                checked={!!character.com_enabled}
                                onChange={(e) => setCharacter({ ...character, com_enabled: e.target.checked })}
                            />
                            <div className="w-10 h-5 bg-neutral-800 rounded-full peer peer-checked:bg-blue-600 relative transition-all">
                                <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-all peer-checked:left-6"></div>
                            </div>
                            <span className="ml-3 text-sm font-medium text-neutral-400 group-hover:text-neutral-200 transition-colors">
                                Enable Comeliness (COM)
                            </span>
                        </label>
                    </div>
                </section>

                {/* Abilities Panel */}
                <section className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                            Abilities
                        </h3>
                        <button
                            onClick={saveAbilities}
                            disabled={saving}
                            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Abilities"}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                        {[
                            { key: 'str', label: 'STR' },
                            { key: 'dex', label: 'DEX' },
                            { key: 'con', label: 'CON' },
                            { key: 'int', label: 'INT' },
                            { key: 'wis', label: 'WIS' },
                            { key: 'cha', label: 'CHA' },
                            { key: 'com', label: 'COM', hidden: !character.com_enabled },
                        ].map(ability => ability.hidden ? null : (
                            <div key={ability.key} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex flex-col items-center gap-2 group hover:border-neutral-700 transition-all">
                                <label
                                    htmlFor={`ability-${ability.key}`}
                                    className="text-[10px] font-bold text-neutral-500 group-hover:text-neutral-400 transition-colors"
                                >
                                    {ability.label}
                                </label>
                                <input
                                    id={`ability-${ability.key}`}
                                    type="number"
                                    className="w-full bg-transparent text-center text-xl font-bold font-mono outline-none border-b border-transparent focus:border-blue-600/30 transition-all"
                                    value={abilities?.[ability.key as keyof CharacterAbilities] || 10}
                                    onChange={e => {
                                        if (!abilities) return;
                                        setAbilities({ ...abilities, [ability.key]: Number.parseInt(e.target.value, 10) });
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </section>
                {/* Classes Panel */}
                <section className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            Classes
                        </h3>
                        <div className="flex gap-2">
                            <select
                                id="new-class-select"
                                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1 text-xs outline-none"
                                defaultValue=""
                                onChange={async (e) => {
                                    const className = e.target.value;
                                    if (!className) return;

                                    let finalName = className;
                                    if (className === "Other") {
                                        const custom = prompt("Enter custom class name:");
                                        if (!custom) {
                                            e.target.value = "";
                                            return;
                                        }
                                        finalName = custom;
                                    }

                                    try {
                                        await invoke("add_character_class", { characterId, className: finalName, level: 1 });
                                        loadData();
                                        e.target.value = "";
                                    } catch (err) {
                                        alert(`Failed to add class: ${err}`);
                                    }
                                }}
                            >
                                <option value="" disabled>Add Class...</option>
                                {CORE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {classes.map(cls => (
                            <ClassRow
                                key={cls.id}
                                cls={cls}
                                onUpdate={() => loadData()}
                            />
                        ))}
                        {classes.length === 0 && (
                            <p className="text-center py-4 text-sm text-neutral-600">No classes assigned yet.</p>
                        )}
                    </div>
                </section>

                {/* Spells by Class */}
                {classes.length > 0 && (
                    <section className="space-y-6 pb-12">
                        <div className="flex items-center gap-2 px-2">
                            <h3 className="text-lg font-semibold">Spell Management</h3>
                            <span className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">Per Class</span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {classes.map(cls => (
                                <ClassSpellList key={cls.id} charClass={cls} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

const CASTER_CLASSES = ["Mage", "Specialist Wizard", "Cleric", "Druid", "Priest", "Bard", "Paladin", "Ranger"];

function canCast(className: string) {
    return CASTER_CLASSES.some(c => className.toLowerCase().includes(c.toLowerCase()));
}

function ClassRow({ cls, onUpdate }: { cls: CharacterClass, onUpdate: () => void }) {
    const [level, setLevel] = useState(cls.level);

    const updateLevel = async (newVal: number) => {
        setLevel(newVal);
        try {
            await invoke("update_character_class_level", { classId: cls.id, level: newVal });
        } catch (e) {
            console.error(e);
        }
    };

    const removeClass = async () => {
        if (!confirm(`Are you sure you want to remove the ${cls.class_name} class? All associated spells will be unlinked.`)) return;
        try {
            await invoke("remove_character_class", { classId: cls.id });
            onUpdate();
        } catch (e) {
            alert(`Failed to remove class: ${e}`);
        }
    };

    return (
        <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 p-4 rounded-xl group hover:border-neutral-700 transition-all">
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-neutral-900 rounded-lg flex items-center justify-center font-bold text-neutral-400 group-hover:text-blue-500 transition-colors">
                    {cls.class_name.charAt(0)}
                </div>
                <div data-testid="class-row">
                    <h4 className="font-semibold text-neutral-200">{cls.class_name}</h4>
                    <span className="text-[10px] text-neutral-600 uppercase font-bold tracking-tighter">Class Identity</span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                    <label className="text-[9px] uppercase font-bold text-neutral-600 mb-1">Level</label>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => updateLevel(Math.max(1, level - 1))}
                            className="h-6 w-6 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-white"
                        >
                            -
                        </button>
                        <span className="w-6 text-center font-mono font-bold text-lg">{level}</span>
                        <button
                            onClick={() => updateLevel(level + 1)}
                            className="h-6 w-6 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-white"
                        >
                            +
                        </button>
                    </div>
                </div>

                <button
                    onClick={removeClass}
                    className="p-2 text-neutral-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove Class"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    );
}

function ClassSpellList({ charClass }: { charClass: CharacterClass }) {
    const [spells, setSpells] = useState<CharacterSpellbookEntry[]>([]);
    const [activeTab, setActiveTab] = useState<"KNOWN" | "PREPARED">("KNOWN");
    const [selectedRemoveIds, setSelectedRemoveIds] = useState<Set<number>>(new Set());
    const [isCollapsed, setIsCollapsed] = useState(!canCast(charClass.class_name));

    const loadSpells = useCallback(async () => {
        try {
            const list = await invoke<CharacterSpellbookEntry[]>("get_character_class_spells", {
                characterClassId: charClass.id
            });
            setSpells(list);
        } catch (e) {
            console.error(e);
        }
    }, [charClass.id]);

    useEffect(() => {
        loadSpells();
    }, [loadSpells]);

    const filteredSpells = spells.filter(s => {
        if (activeTab === "KNOWN") return s.known === 1;
        return s.prepared === 1;
    });

    return (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden flex flex-col" aria-label={`Class section for ${charClass.class_name}`}>
            <div
                className="p-4 bg-neutral-950/50 border-b border-neutral-800 flex items-center justify-between cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-1 h-4 rounded-full ${canCast(charClass.class_name) ? 'bg-blue-500' : 'bg-neutral-700'}`}></div>
                    <div>
                        <h4 className="font-bold text-neutral-200">{charClass.class_name}</h4>
                        {!isCollapsed && (
                            <div className="flex gap-2 mt-1">
                                {(["KNOWN", "PREPARED"] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveTab(tab);
                                            setSelectedRemoveIds(new Set());
                                        }}
                                        className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-all ${activeTab === tab ? "bg-blue-600/20 text-blue-400 border border-blue-600/30" : "text-neutral-600 hover:text-neutral-400"
                                            }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {!isCollapsed && selectedRemoveIds.size > 0 && (
                        <button
                            onClick={async () => {
                                if (!confirm(`Remove ${selectedRemoveIds.size} spells?`)) return;
                                try {
                                    for (const spellId of selectedRemoveIds) {
                                        await invoke("remove_character_spell", {
                                            characterClassId: charClass.id,
                                            spellId,
                                            listType: activeTab
                                        });
                                    }
                                    setSelectedRemoveIds(new Set());
                                    loadSpells();
                                } catch (e) {
                                    alert(`Bulk remove failed: ${e}`);
                                }
                            }}
                            className="px-2 py-1 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-500/30 rounded text-xs transition-all"
                        >
                            REMOVE {selectedRemoveIds.size}
                        </button>
                    )}
                    {!isCollapsed && <SpellPicker charClass={charClass} onAdded={loadSpells} listType={activeTab} knownSpells={spells.filter(s => s.known === 1)} />}
                    <div className={`text-neutral-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </div>
            </div>

            {!isCollapsed && (
                <div className="flex-1 overflow-auto p-4 space-y-2 min-h-[200px]">
                    {filteredSpells.map(spell => (
                        <div key={`${spell.spell_id}-${activeTab}`} data-testid={`spell-row-${spell.spell_name}`} className="flex items-center gap-3 bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/50 group hover:border-neutral-700 transition-all">
                            <input
                                type="checkbox"
                                className="rounded border-neutral-800 bg-neutral-900 text-blue-600 focus:ring-0 h-3.5 w-3.5"
                                checked={selectedRemoveIds.has(spell.spell_id)}
                                onChange={() => {
                                    const next = new Set(selectedRemoveIds);
                                    if (next.has(spell.spell_id)) next.delete(spell.spell_id);
                                    else next.add(spell.spell_id);
                                    setSelectedRemoveIds(next);
                                }}
                            />
                            <div className="flex flex-col flex-1">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] bg-neutral-800 px-1 rounded font-mono text-neutral-500">L{spell.spell_level}</span>
                                        <span className="text-sm font-medium">{spell.spell_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            className="bg-transparent border-b border-neutral-800 text-[10px] text-neutral-400 focus:text-white focus:border-blue-500 outline-none px-1 py-0.5 transition-all w-32 placeholder:text-neutral-700"
                                            placeholder="Add notes..."
                                            value={spell.notes || ""}
                                            onChange={async (e) => {
                                                try {
                                                    await invoke("update_character_spell_notes", {
                                                        characterClassId: charClass.id,
                                                        spellId: spell.spell_id,
                                                        notes: e.target.value
                                                    });
                                                    loadSpells();
                                                } catch (err) {
                                                    console.error(err);
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await invoke("remove_character_spell", {
                                                        characterClassId: charClass.id,
                                                        spellId: spell.spell_id,
                                                        listType: activeTab
                                                    });
                                                    loadSpells();
                                                } catch (e) {
                                                    alert(`Failed: ${e}`);
                                                }
                                            }}
                                            className="text-neutral-700 hover:text-red-500 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredSpells.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-neutral-600 italic text-sm">
                            No {activeTab.toLowerCase()} spells.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SpellPicker({ charClass, onAdded, listType, knownSpells }: { charClass: CharacterClass, onAdded: () => void, listType: "KNOWN" | "PREPARED", knownSpells: CharacterSpellbookEntry[] }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [filters, setFilters] = useState({
        isQuestSpell: false,
        isCantrip: false,
        school: "",
        sphere: "",
        levelMin: undefined as number | undefined,
        levelMax: undefined as number | undefined,
        tags: "",
    });
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const search = async () => {
        if (listType === "PREPARED") {
            // Local search in known spells
            console.log("LOCAL SEARCH START", { query, filters, count: knownSpells.length });
            if (knownSpells.length > 0) console.log("SAMPLE SPELL:", JSON.stringify(knownSpells[0]));

            const lowerQuery = query.toLowerCase();
            const filtered = knownSpells.filter(s => {
                const sName = (s.spell_name || (s as any).name || "").toLowerCase();
                if (query && !sName.includes(lowerQuery)) return false;

                const sSchool = s.spell_school || (s as any).school || "";
                if (filters.school && !sSchool.includes(filters.school)) return false;

                const sSphere = s.spell_sphere || (s as any).sphere || "";
                if (filters.sphere && !sSphere.includes(filters.sphere)) return false;

                const sLevel = s.spell_level ?? (s as any).level ?? 0;
                if (filters.levelMin !== undefined && sLevel < filters.levelMin) return false;
                if (filters.levelMax !== undefined && sLevel > filters.levelMax) return false;

                // Handle BOTH boolean and number flags defensively
                const rawQuest = (s.is_quest_spell || (s as any).isQuestSpell);
                const isQuest = rawQuest === 1 || rawQuest === true || rawQuest === "1";

                const rawCantrip = (s.is_cantrip || (s as any).isCantrip);
                const isCantrip = rawCantrip === 1 || rawCantrip === true || rawCantrip === "1";

                if (filters.isQuestSpell && !isQuest) return false;
                if (filters.isCantrip && !isCantrip) return false;

                const sTags = (s as any).tags || (s as any).spell_tags || "";
                if (filters.tags && !sTags.toLowerCase().includes(filters.tags.toLowerCase())) return false;

                return true;
            }).map(s => {
                const isQuestFlag = s.is_quest_spell || (s as any).isQuestSpell;
                const isCantripFlag = s.is_cantrip || (s as any).isCantrip;

                return {
                    id: s.spell_id || (s as any).id,
                    name: s.spell_name || (s as any).name || "Unknown",
                    level: s.spell_level ?? (s as any).level ?? 0,
                    school: s.spell_school || (s as any).school,
                    sphere: s.spell_sphere || (s as any).sphere,
                    is_quest_spell: (isQuestFlag === 1 || isQuestFlag === true || isQuestFlag === "1") ? 1 : 0,
                    is_cantrip: (isCantripFlag === 1 || isCantripFlag === true || isCantripFlag === "1") ? 1 : 0
                };
            });
            console.log("LOCAL SEARCH END", { resultCount: filtered.length });
            setResults(filtered);
            return;
        }

        try {
            console.log("GLOBAL SEARCH START", { query, filters });
            const res = await invoke<any[]>("search_keyword", {
                query,
                filters: {
                    isQuestSpell: filters.isQuestSpell || undefined,
                    isCantrip: filters.isCantrip || undefined,
                    schools: filters.school ? [filters.school] : undefined,
                    spheres: filters.sphere ? [filters.sphere] : undefined,
                    levelMin: filters.levelMin,
                    levelMax: filters.levelMax,
                    tags: filters.tags || undefined,
                }
            });
            console.log("GLOBAL SEARCH RESULT", { count: res.length, first: res.length > 0 ? JSON.stringify(res[0]) : "none" });
            setResults(res);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (open) search();
    }, [open, query, filters, listType, knownSpells]);

    const toggleId = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const bulkAdd = async () => {
        if (selectedIds.size === 0) return;
        try {
            for (const spellId of selectedIds) {
                await invoke("add_character_spell", {
                    characterClassId: charClass.id,
                    spellId,
                    listType,
                    notes: ""
                });
            }
            await (onAdded() as any); // Await refresh before closing
            setOpen(false);
            setSelectedIds(new Set());
        } catch (e) {
            alert(`Bulk Error: ${e}`);
        }
    };

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="px-3 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg text-[11px] font-bold transition-all"
            >
                + ADD
            </button>

            {open && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" data-testid="spell-picker">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl flex flex-col max-h-full shadow-2xl">
                        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold">Add to {charClass.class_name}</h3>
                                <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mt-1">List: {listType}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="p-6 border-b border-neutral-800 bg-neutral-950/20 space-y-4">
                            <input
                                autoFocus
                                id="spell-search-input"
                                className="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-600/50 focus:ring-1 focus:ring-blue-600/20 p-3 rounded-xl text-sm transition-all outline-none"
                                placeholder="Search spells by name..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />

                            <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="rounded border-neutral-800 bg-neutral-950 text-blue-600 focus:ring-0"
                                        checked={filters.isQuestSpell}
                                        onChange={e => setFilters({ ...filters, isQuestSpell: e.target.checked })}
                                    />
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 group-hover:text-blue-400">Quest</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="rounded border-neutral-800 bg-neutral-950 text-blue-600 focus:ring-0"
                                        checked={filters.isCantrip}
                                        onChange={e => setFilters({ ...filters, isCantrip: e.target.checked })}
                                    />
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 group-hover:text-blue-400">Cantrip</span>
                                </label>

                                <select
                                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] uppercase font-bold text-neutral-400 outline-none"
                                    value={filters.school}
                                    onChange={e => setFilters({ ...filters, school: e.target.value })}
                                >
                                    <option value="">All Schools</option>
                                    <option value="Abjuration">Abjuration</option>
                                    <option value="Alteration">Alteration</option>
                                    <option value="Conjuration/Summoning">Conjuration</option>
                                    <option value="Divination">Divination</option>
                                    <option value="Enchantment/Charm">Enchantment</option>
                                    <option value="Illusion/Phantasm">Illusion</option>
                                    <option value="Invocation/Evocation">Invocation</option>
                                    <option value="Necromancy">Necromancy</option>
                                </select>

                                <select
                                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] uppercase font-bold text-neutral-400 outline-none"
                                    value={filters.sphere}
                                    onChange={e => setFilters({ ...filters, sphere: e.target.value })}
                                >
                                    <option value="">All Spheres</option>
                                    {SPHERES.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase font-bold text-neutral-600">Lvl</span>
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        className="w-12 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-400 outline-none"
                                        value={filters.levelMin ?? ""}
                                        onChange={e => setFilters({ ...filters, levelMin: e.target.value ? parseInt(e.target.value) : undefined })}
                                    />
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        className="w-12 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-400 outline-none"
                                        value={filters.levelMax ?? ""}
                                        onChange={e => setFilters({ ...filters, levelMax: e.target.value ? parseInt(e.target.value) : undefined })}
                                    />
                                </div>

                                <input
                                    type="text"
                                    placeholder="TAGS..."
                                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[10px] uppercase font-bold text-neutral-400 outline-none w-24"
                                    value={filters.tags}
                                    onChange={e => setFilters({ ...filters, tags: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6 space-y-2 custom-scrollbar">
                            {results.map((spell, i) => (
                                <div key={`${spell.id}-${i}`} data-testid={`spell-row-${spell.name}`} className="flex items-center justify-between bg-neutral-950/50 p-3 rounded-xl border border-neutral-800/80 hover:border-blue-600/30 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-neutral-800 bg-neutral-900 text-blue-600 focus:ring-0 h-4 w-4"
                                            checked={selectedIds.has(spell.id)}
                                            onChange={() => toggleId(spell.id)}
                                        />
                                        <span className="text-[11px] bg-neutral-900 px-1.5 py-0.5 rounded font-mono text-neutral-500 border border-neutral-800">L{spell.level}</span>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">{spell.name}</span>
                                                {spell.is_quest_spell === 1 && (
                                                    <span className="px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">Q</span>
                                                )}
                                                {spell.is_cantrip === 1 && (
                                                    <span className="px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">C</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-neutral-600">
                                                {[spell.school, spell.sphere].filter(Boolean).join(" / ") || 'Universal'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await invoke("add_character_spell", {
                                                    characterClassId: charClass.id,
                                                    spellId: spell.id,
                                                    listType,
                                                    notes: ""
                                                });
                                                await (onAdded() as any);
                                                setOpen(false);
                                            } catch (e) {
                                                alert(`Error: ${e}`);
                                            }
                                        }}
                                        className="px-4 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg text-xs font-bold transition-all"
                                    >
                                        ADD
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-neutral-800 bg-neutral-950/50 flex items-center justify-between">
                            <span className="text-xs text-neutral-500 italic">
                                {selectedIds.size} spell(s) selected
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-white transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    disabled={selectedIds.size === 0}
                                    onClick={bulkAdd}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-lg"
                                >
                                    BULK ADD
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
