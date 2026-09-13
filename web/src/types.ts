export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface StatRow {
  key: StatKey;
  label: string;
  base: number;
  min: number;   // level 100, 0 IV, 0 EV, hindering nature
  max: number;   // level 100, 31 IV, 252 EV, beneficial nature
}

/** Showdown's learnset source codes. */
export type MoveMethod = 'L' | 'M' | 'T' | 'E' | 'S' | 'D' | 'V' | 'R';

export interface Move {
  moveId: string;
  name: string;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;   // null = never misses
  pp: number | null;
  level: number | null;      // method 'L' only
  machine: string | null;    // method 'M' only, e.g. 'TM26', 'HM03', 'TR10'
  shortDesc: string | null;  // one line, per generation
  desc: string | null;       // full rules text
}

/** One member of an evolution family, as it exists in one generation. */
export interface EvoNode {
  id: string;
  name: string;
  num: number | null;
  types: string[];
  sprite: string | null;
  /** How this form evolves from its parent, e.g. "Level 36", "Use Leaf Stone in Alola". Null on the root. */
  method: string | null;
  evos: EvoNode[];
}

export interface SpeciesPayload {
  id: string;
  gen: number;
  name: string;
  num: number | null;
  genus: string | null;
  baseSpecies: string | null;
  forme: string | null;
  availableGens: number[];
  types: string[];
  abilities: { slot: string; name: string; shortDesc: string | null; desc: string | null }[];
  dimensions: { heightM: number | null; weightKg: number | null };
  stats: StatRow[];
  bst: number;
  training: {
    evYield: { stat: string; value: number }[];
    catchRate: number | null;
    catchRatePct: number | null;
    baseFriendship: number | null;
    baseExp: number | null;
    growthRate: string | null;
  };
  breeding: {
    eggGroups: string[];
    genderless: boolean;
    malePct: number | null;
    femalePct: number | null;
    eggCycles: number | null;
    eggStepsMin: number | null;
    eggStepsMax: number | null;
  };
  /** The whole family tree in this generation, rooted at the earliest stage. A lone node means no evolution. */
  evolution: EvoNode;
  /** Every form of this species present in this generation, including this one. */
  forms: { id: string; name: string; forme: string | null }[];
  names: Record<string, string>;
  flavorText: { version: string; text: string }[];
  sprites: { front: string | null; shiny: string | null; artwork: string | null };
  /** Damage taken from each attacking type in this generation's chart, types only (no abilities). */
  typeDefenses: { type: string; multiplier: number }[];
  /** Learnset for this generation, grouped by method. Absent methods are absent keys. */
  moves: Partial<Record<MoveMethod, Move[]>>;
  /** Egg moves are inherited from the basic stage; this names it when it isn't this form. */
  eggMovesVia: string | null;
  /** Where to find it, per game of this generation. Empty for gens veekun doesn't cover (9). */
  encounters: EncounterGame[];
  /** Set when a form has no encounter data of its own and the species' default form is shown. */
  encountersVia: string | null;
}

export interface EncounterRow {
  region: string | null;
  location: string;
  area: string | null;        // sub-area, only when the location has several
  method: string;             // veekun identifier: walk, surf, old-rod, gift...
  minLevel: number | null;
  maxLevel: number | null;
  chance: number | null;      // summed slot rarity, roughly a percentage
  conditions: string | null;  // 'Morning / Night', 'Emerald in slot 2'; null = always
}

export interface EncounterGame {
  version: string;            // 'Ultra Sun'
  rows: EncounterRow[];
}

/** One row of the national dex list — a species' base form at its latest generation. */
export interface DexEntry {
  id: string;
  name: string;
  num: number;
  types: string[];
  genIntroduced: number | null;
  latestGen: number;
  stats: Record<StatKey, number>;
  bst: number;
  sprite: string | null;
}
