export type CharacterType = "PC" | "NPC";

export interface Character {
  id: number;
  name: string;
  characterType: CharacterType;
  race?: string | null;
  alignment?: string | null;
  comEnabled: boolean;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CharacterAbilities {
  id: number;
  characterId: number;
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
  characterId: number;
  className: string;
  classLabel?: string | null;
  level: number;
}

export interface CharacterClassSpell {
  id: number;
  characterClassId: number;
  spellId: number;
  listType: "KNOWN" | "PREPARED";
  notes?: string | null;
}

export interface CharacterSpellbookEntry {
  characterId: number;
  spellId: number;
  spellName: string;
  spellLevel: number;
  spellSchool?: string | null;
  spellSphere?: string | null;
  isQuestSpell: number;
  isCantrip: number;
  prepared: number;
  known: number;
  notes?: string | null;
  tags?: string | null;
}

export interface BundleClassSpell {
  spell: {
    name: string;
    level: number;
    source?: string | null;
  };
  listType: string;
  notes?: string | null;
}

export interface BundleClass {
  className: string;
  classLabel?: string | null;
  level: number;
  spells: BundleClassSpell[];
}

export interface CharacterBundle {
  format: string;
  formatVersion: string;
  name: string;
  characterType: string;
  race?: string | null;
  alignment?: string | null;
  comEnabled: number;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  abilities?: CharacterAbilities | null;
  classes: BundleClass[];
}
