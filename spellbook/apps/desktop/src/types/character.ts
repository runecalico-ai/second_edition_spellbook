export type CharacterType = "PC" | "NPC";

export interface Character {
    id: number;
    name: string;
    character_type: CharacterType;
    race?: string | null;
    alignment?: string | null;
    com_enabled: boolean;
    notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface CharacterAbilities {
    id: number;
    character_id: number;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    com: number;
}

export interface CharacterClass {
    id: number;
    character_id: number;
    class_name: string;
    level: number;
}

export interface CharacterClassSpell {
    id: number;
    character_class_id: number;
    spell_id: number;
    list_type: "KNOWN" | "PREPARED";
    notes?: string | null;
}

export interface CharacterSpellbookEntry {
    character_id: number;
    spell_id: number;
    spell_name: string;
    spell_level: number;
    spell_school?: string | null;
    spell_sphere?: string | null;
    is_quest_spell: number;
    is_cantrip: number;
    prepared: number;
    known: number;
    notes?: string | null;
}
