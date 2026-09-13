/**
 * queries.ts — the only place SQL lives.
 *
 * Everything above this file (server, React) deals in plain objects.
 * That boundary is what lets the delivery mechanism change — browser on the
 * LAN today, Tauri .exe later — without touching the Pokedex itself.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH     = process.env.POKEDEX_DB ?? './data/pokedex.sqlite';
const SPRITE_ROOT = process.env.SPRITE_ROOT ?? './vendor/sprites/sprites/pokemon';

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('journal_mode = WAL');

// ---------------------------------------------------------------- types

/** Showdown's ID convention, for turning display names back into links. */
const toID = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

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

// ---------------------------------------------------------------- helpers

const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP', atk: 'Attack', def: 'Defense',
  spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
};

/**
 * Level-100 stat ranges, matching what pokemondb displays.
 *   min = 0 IV,  0 EV,   hindering nature (x0.9)
 *   max = 31 IV, 252 EV, beneficial nature (x1.1)
 * HP uses a different formula and is not nature-affected.
 */
function statRange(key: StatKey, base: number): { min: number; max: number } {
  if (key === 'hp') {
    // Shedinja is the one hard-coded exception in the real games
    if (base === 1) return { min: 1, max: 1 };
    return { min: 2 * base + 110, max: 2 * base + 31 + 63 + 110 };
  }
  return {
    min: Math.floor((2 * base + 5) * 0.9),
    max: Math.floor((2 * base + 31 + 63 + 5) * 1.1),
  };
}

/**
 * Steps per egg cycle are game-dependent, not purely generation-dependent:
 * Sword/Shield uses 128, BDSP uses 256, Scarlet/Violet ~257. These values
 * reproduce what pokemondb displays; adjust if you add per-game switching.
 */
const STEPS_PER_CYCLE: Record<number, number> = {
  1: 255, 2: 255, 3: 255, 4: 255, 5: 255, 6: 255, 7: 255, 8: 128, 9: 257,
};

function eggSteps(cycles: number | null, gen: number) {
  if (cycles == null) return { min: null, max: null };
  const per = STEPS_PER_CYCLE[gen] ?? 255;
  const max = cycles * per;
  return { min: Math.max(0, max - (per - 1)), max };
}

/** Base friendship default changed from 70 to 50 in gen 8. */
function baseFriendship(stored: number | null, gen: number) {
  if (gen >= 8) return 50;
  return stored;
}

/** veekun gender_rate is eighths-female; -1 means genderless. */
function genderSplit(rate: number | null) {
  if (rate == null || rate < 0) return { genderless: true, malePct: null, femalePct: null };
  const femalePct = (rate / 8) * 100;
  return { genderless: false, malePct: 100 - femalePct, femalePct };
}

/**
 * Catch probability at full HP with a plain Poke Ball, no status.
 * Uses the gen 3/4 formula, which is what pokemondb displays — the gen 5+
 * formula gives roughly double (8.8% vs 3.9% for Gliscor).
 */
function catchPct(rate: number | null): number | null {
  if (rate == null) return null;
  const a = rate / 3;                                  // full HP, no status, 1x ball
  const b = 1048560 / Math.pow(16711680 / a, 0.25);
  return Math.round(Math.min(1, Math.pow(b / 65536, 4)) * 1000) / 10;
}

// ------------------------------------------------------------ sprite paths

/**
 * Sprites are keyed by national dex number. Coverage is patchy — a species
 * can't appear in a generation that predates it, and some gen folders are
 * incomplete — so walk a fallback chain and return the first that exists.
 */
const GEN_SPRITE_DIRS: Record<number, string[]> = {
  1: ['versions/generation-i/red-blue'],
  2: ['versions/generation-ii/crystal', 'versions/generation-ii/gold'],
  3: ['versions/generation-iii/emerald', 'versions/generation-iii/ruby-sapphire'],
  4: ['versions/generation-iv/platinum', 'versions/generation-iv/diamond-pearl'],
  5: ['versions/generation-v/black-white'],
  6: ['versions/generation-vi/x-y', 'versions/generation-vi/omegaruby-alphasapphire'],
  7: ['versions/generation-vii/ultra-sun-ultra-moon'],
  8: ['versions/generation-viii/brilliant-diamond-shining-pearl'],
  9: ['versions/generation-ix/scarlet-violet'],
};

function firstExisting(candidates: string[]): string | null {
  for (const rel of candidates) {
    if (fs.existsSync(path.join(SPRITE_ROOT, rel))) return rel;
  }
  return null;
}

function spritesFor(num: number | null, gen: number) {
  if (num == null) return { front: null, shiny: null, artwork: null };

  const dirs = GEN_SPRITE_DIRS[gen] ?? [];
  // gen-specific art first, then the modern default set as a safety net
  const front = firstExisting([...dirs.map(d => `${d}/${num}.png`), `${num}.png`]);
  const shiny = firstExisting([...dirs.map(d => `${d}/shiny/${num}.png`), `shiny/${num}.png`]);
  const artwork = firstExisting([`other/official-artwork/${num}.png`, `other/home/${num}.png`]);

  return { front, shiny, artwork };
}

// ------------------------------------------------------------- statements

const qPokemon = db.prepare(`
  SELECT p.*, s.genus, s.capture_rate, s.base_happiness, s.base_experience,
         s.growth_rate, s.gender_rate, s.hatch_counter
  FROM pokemon_gen p
  LEFT JOIN species s ON s.species_id = p.species_id
  WHERE p.showdown_id = ? AND p.gen = ?
`);

const qAvailableGens = db.prepare(
  `SELECT gen FROM pokemon_gen WHERE showdown_id = ? ORDER BY gen`);

const qEvYield = db.prepare(
  `SELECT stat, value FROM species_ev_yield WHERE species_id = ? ORDER BY value DESC`);

const qEggGroups = db.prepare(
  `SELECT egg_group FROM species_egg_group WHERE species_id = ? ORDER BY egg_group`);

const qNames = db.prepare(
  `SELECT language, name FROM species_name WHERE species_id = ? AND name IS NOT NULL`);

const qFlavor = db.prepare(`
  SELECT version, text FROM flavor_text
  WHERE species_id = ? AND language = 'en'
  GROUP BY text
  ORDER BY rowid
`);

const qEvos = db.prepare(
  `SELECT DISTINCT showdown_id FROM pokemon_gen WHERE prevo = ? AND gen = ?`);

const qLevelUp = db.prepare(`
  SELECT l.level, l.move_id, l.move_name,
         m.type, m.category, m.power, m.accuracy, m.pp
  FROM learnset l
  LEFT JOIN move_gen m ON m.move_id = l.move_id AND m.gen = l.gen
  WHERE l.showdown_id = ? AND l.gen = ? AND l.method = 'L'
  ORDER BY l.level, l.move_name
`);

const qSearch = db.prepare(`
  SELECT showdown_id, name, num, type1, type2
  FROM pokemon_gen
  WHERE gen = ? AND name LIKE ?
  ORDER BY num, name
  LIMIT ?
`);

const qListByGen = db.prepare(`
  SELECT showdown_id, name, num, type1, type2, bst
  FROM pokemon_gen WHERE gen = ? ORDER BY num, name
`);

// ------------------------------------------------------------ public API

/** Assemble everything a species page needs, for one generation. */
export function getSpecies(id: string, gen: number): SpeciesPayload | null {
  const row = qPokemon.get(id, gen) as any;
  if (!row) return null;

  const statKeys: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const stats: StatRow[] = statKeys.map(k => ({
    key: k,
    label: STAT_LABELS[k],
    base: row[k],
    ...statRange(k, row[k]),
  }));

  const abilities = [
    { slot: '0', name: row.ability0 },
    { slot: '1', name: row.ability1 },
    { slot: 'H', name: row.abilityH },
  ].filter(a => a.name) as { slot: string; name: string }[];

  const gender = genderSplit(row.gender_rate);
  const steps  = eggSteps(row.hatch_counter, gen);

  const names: Record<string, string> = {};
  if (row.species_id != null) {
    for (const n of qNames.all(row.species_id) as any[]) names[n.language] = n.name;
  }

  return {
    id: row.showdown_id,
    gen,
    name: row.name,
    num: row.num,
    genus: row.genus,
    baseSpecies: row.base_species,
    forme: row.forme,
    availableGens: (qAvailableGens.all(id) as any[]).map(r => r.gen),
    types: [row.type1, row.type2].filter(Boolean),
    abilities,
    dimensions: { heightM: row.heightm, weightKg: row.weightkg },
    stats,
    bst: row.bst,
    training: {
      evYield: row.species_id != null ? (qEvYield.all(row.species_id) as any[]) : [],
      catchRate: row.capture_rate,
      catchRatePct: catchPct(row.capture_rate),
      baseFriendship: baseFriendship(row.base_happiness, gen),
      baseExp: row.base_experience,
      growthRate: row.growth_rate,
    },
    breeding: {
      eggGroups: row.species_id != null
        ? (qEggGroups.all(row.species_id) as any[]).map(r => r.egg_group) : [],
      ...gender,
      eggCycles: row.hatch_counter,
      eggStepsMin: steps.min,
      eggStepsMax: steps.max,
    },
    evolution: {
      prevo: row.prevo ? toID(row.prevo) : null,
      evoLevel: row.evo_level,
      evos: (qEvos.all(row.showdown_id, gen) as any[]).map(r => r.showdown_id),
    },
    names,
    flavorText: row.species_id != null ? (qFlavor.all(row.species_id) as any[]) : [],
    sprites: spritesFor(row.num, gen),
    levelUpMoves: (qLevelUp.all(id, gen) as any[]).map(m => ({
      level: m.level,
      moveId: m.move_id,
      name: m.move_name,
      type: m.type,
      category: m.category,
      power: m.power || null,
      accuracy: m.accuracy === 0 ? null : m.accuracy,
      pp: m.pp,
    })),
  };
}

/** Which generations this form exists in — drives the gen tabs. */
export function getAvailableGens(id: string): number[] {
  return (qAvailableGens.all(id) as any[]).map(r => r.gen);
}

export function search(query: string, gen: number, limit = 20) {
  return qSearch.all(gen, `%${query}%`, limit);
}

export function listByGen(gen: number) {
  return qListByGen.all(gen);
}

export function close() {
  db.close();
}
