export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface StatRow {
  key: StatKey;
  label: string;
  base: number;
  min: number;   // level 100, 0 IV, 0 EV, hindering nature
  max: number;   // level 100, 31 IV, 252 EV, beneficial nature
}

export interface LevelUpMove {
  level: number;
  moveId: string;
  name: string;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;   // null = never misses
  pp: number | null;
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
  abilities: { slot: string; name: string }[];
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
  evolution: { prevo: string | null; evoLevel: number | null; evos: string[] };
  names: Record<string, string>;
  flavorText: { version: string; text: string }[];
  sprites: { front: string | null; shiny: string | null; artwork: string | null };
  levelUpMoves: LevelUpMove[];
}
