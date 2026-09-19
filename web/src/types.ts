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

/** A Pokémon in a list on a move, ability or item page. */
export interface PokemonRef {
  id: string;
  name: string;
  num: number | null;
  forme: string | null;
  types: string[];
  sprite: string | null;
}

export interface FlavorEntry {
  versionGroup: string;   // 'Ultra Sun/Ultra Moon'
  text: string;
}

export interface MoveDexEntry {
  id: string;
  name: string;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;   // null = never misses
  pp: number | null;
  genIntroduced: number | null;
  latestGen: number;
  shortDesc: string | null;
}

export interface MovePayload {
  id: string;
  gen: number;
  name: string;
  availableGens: number[];
  genIntroduced: number | null;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  target: string | null;
  flags: string[];
  secondaryChance: number | null;
  critRatio: number | null;
  zPower: number | null;       // gen 7 only
  maxPower: number | null;     // gen 8 only
  machine: string | null;      // 'TM26' in this generation
  shortDesc: string | null;
  desc: string | null;
  flavorText: FlavorEntry[];   // this generation's games
  /** Pokémon that learn it in this generation, grouped by method. */
  learners: Partial<Record<MoveMethod, Learner[]>>;
}

export interface Learner extends PokemonRef {
  levels: number[];   // method 'L' only; a Pokémon can learn a move at several levels
}

export interface AbilityDexEntry {
  id: string;
  name: string;
  genIntroduced: number | null;
  latestGen: number;
  shortDesc: string | null;
  pokemonCount: number;   // at its latest generation
}

export interface AbilityPayload {
  id: string;
  gen: number;
  name: string;
  availableGens: number[];
  genIntroduced: number | null;
  shortDesc: string | null;
  desc: string | null;
  flavorText: FlavorEntry[];
  pokemon: (PokemonRef & { slot: '0' | '1' | 'H' })[];
}

export interface ItemDexEntry {
  id: string;             // veekun identifier: 'sitrus-berry'
  name: string;
  category: string | null;
  pocket: string | null;
  cost: number | null;
  genIntroduced: number | null;
  shortDesc: string | null;   // veekun's short effect, else Showdown's latest battle text
  sprite: string | null;
}

export interface ItemPayload {
  id: string;
  gen: number;
  name: string;
  availableGens: number[];
  category: string | null;
  pocket: string | null;
  cost: number | null;
  flingPower: number | null;
  flingEffect: string | null;
  genIntroduced: number | null;
  sprite: string | null;
  shortEffect: string | null;   // veekun, generation-independent
  effect: string | null;        // veekun's long prose; sections as "Heading\n:   text"
  /** Showdown's in-battle behaviour in this generation; null for items that don't matter in battle. */
  battle: {
    shortDesc: string | null;
    desc: string | null;
    isBerry: boolean;
    naturalGift: { type: string; power: number } | null;
    megaEvolves: string | null;
    zMoveType: string | null;
    users: string[];
  } | null;
  flavorText: FlavorEntry[];
  /** Wild Pokémon that can hold it, per game of this generation. */
  heldBy: { version: string; rows: (PokemonRef & { rarity: number })[] }[];
  /** Evolutions this item triggers in this generation. */
  evolves: { from: PokemonRef; to: PokemonRef; method: string }[];
}

// ------------------------------------------------------------ sprite packs

export type PackState = 'missing' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'error';

export interface PackStatus {
  name: string;
  file: string;
  size: number;
  sha256: string;
  required: boolean;
  description: string;
  state: PackState;
  received: number;
  error: string | null;
}

/** `managed: false` in the web build, where sprites are already on disk. */
export type AssetStatus =
  | { managed: false }
  | { managed: true; ready: boolean; busy: boolean; packs: PackStatus[] };
