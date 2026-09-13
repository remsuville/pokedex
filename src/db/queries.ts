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

const EVO_COLS = `showdown_id, name, base_species, num, type1, type2, prevo,
  evo_level, evo_type, evo_item, evo_move, evo_condition, evo_region`;
const qEvoRow = db.prepare(`SELECT ${EVO_COLS} FROM pokemon_gen WHERE showdown_id = ? AND gen = ?`);
const qEvosOf = db.prepare(`SELECT ${EVO_COLS} FROM pokemon_gen WHERE prevo = ? AND gen = ? ORDER BY num, rowid`);

const qForms = db.prepare(
  `SELECT showdown_id, name, forme FROM pokemon_gen WHERE num = ? AND gen = ?
   ORDER BY (forme IS NOT NULL AND forme != ''), rowid`);

// DISTINCT: Showdown records one 'S' source per event and the ETL drops the
// event index, leaving identical rows.
const qLearnset = db.prepare(`
  SELECT DISTINCT l.method, l.level, l.move_id, l.move_name,
         m.type, m.category, m.power, m.accuracy, m.pp,
         mg.label AS machine
  FROM learnset l
  LEFT JOIN move_gen m ON m.move_id = l.move_id AND m.gen = l.gen
  LEFT JOIN machine_gen mg ON mg.move_id = l.move_id AND mg.gen = l.gen
  WHERE l.showdown_id = ? AND l.gen = ?
`);

const qTypeChart = db.prepare(
  `SELECT attacking, defending, multiplier FROM type_chart WHERE gen = ? ORDER BY rowid`);

/** Canonical display order, as pokemondb lists them. Types absent from a gen are skipped. */
const TYPE_ORDER = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

// attacking -> defending -> multiplier, one chart per gen, built on first use
const chartCache = new Map<number, Map<string, Map<string, number>>>();

function typeChart(gen: number) {
  let chart = chartCache.get(gen);
  if (!chart) {
    chart = new Map();
    for (const r of qTypeChart.all(gen) as any[]) {
      if (!chart.has(r.attacking)) chart.set(r.attacking, new Map());
      chart.get(r.attacking)!.set(r.defending, r.multiplier);
    }
    chartCache.set(gen, chart);
  }
  return chart;
}

/** Multiply each attacking type's effectiveness across the defender's types. */
function typeDefenses(types: string[], gen: number) {
  const chart = typeChart(gen);
  return TYPE_ORDER
    .filter(t => chart.has(t))
    .map(t => ({
      type: t,
      multiplier: types.reduce((m, def) => m * (chart.get(t)!.get(def) ?? 1), 1),
    }));
}

const ENC_COLS = `version, version_order, region, location, area, method,
  min_level, max_level, chance, conditions`;
const qEncByForm = db.prepare(
  `SELECT ${ENC_COLS} FROM encounter WHERE form_id = ? AND gen = ?
   ORDER BY version_order, region, location, area, method, rowid`);
const qEncBySpecies = db.prepare(
  `SELECT ${ENC_COLS} FROM encounter WHERE species_id = ? AND gen = ? AND is_default = 1
   ORDER BY version_order, region, location, area, method, rowid`);
const qDefaultFormName = db.prepare(
  `SELECT name FROM pokemon_gen WHERE num = ? AND gen = ? AND (forme IS NULL OR forme = '') LIMIT 1`);

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

// Showdown's gen mods are game-scoped (gen 9 = Scarlet/Violet), so 292
// species have no gen-9 row. The national dex therefore takes each species'
// base form from the latest generation it appears in.
const qDex = db.prepare(`
  SELECT p.showdown_id, p.name, p.num, p.type1, p.type2, p.gen,
         p.hp, p.atk, p.def, p.spa, p.spd, p.spe, p.bst,
         s.gen_introduced
  FROM pokemon_gen p
  LEFT JOIN species s ON s.species_id = p.species_id
  WHERE (p.forme IS NULL OR p.forme = '')
    AND p.gen = (SELECT MAX(gen) FROM pokemon_gen WHERE showdown_id = p.showdown_id)
  ORDER BY p.num
`);

// ---------------------------------------------------------- evolution

/** Turn Showdown's evolution fields into one readable phrase. */
function evoMethod(r: any): string {
  const parts: string[] = [];
  switch (r.evo_type) {
    case 'useItem':         parts.push(`Use ${r.evo_item}`); break;
    case 'trade':           parts.push(r.evo_item ? `Trade holding ${r.evo_item}` : 'Trade'); break;
    case 'levelHold':       parts.push(`Level up holding ${r.evo_item}`); break;
    case 'levelMove':       parts.push(`Level up knowing ${r.evo_move}`); break;
    case 'levelFriendship': parts.push('Level up with high friendship'); break;
    case 'other':           return r.evo_condition ?? 'Special';
    // levelExtra and plain level-ups; Showdown sometimes carries a stale
    // evo_item on levelExtra rows (gen 4 Magnezone), so the item is ignored
    default:                parts.push(r.evo_level ? `Level ${r.evo_level}` : 'Level up');
  }
  if (r.evo_condition) parts.push(r.evo_condition);
  if (r.evo_region) parts.push(`in ${r.evo_region}`);
  return parts.join(' ');
}

/**
 * The family tree containing `id`, as it exists in `gen`: climb prevo links
 * to the root, then expand every branch. Cosmetic forms (Pikachu-Hoenn,
 * Vivillon patterns) carry no evolution data of their own, so an isolated
 * form borrows its base species' tree.
 */
function evolutionChain(id: string, gen: number): EvoNode {
  let root = qEvoRow.get(id, gen) as any;

  const isolated = !root.prevo && !(qEvosOf.get(root.showdown_id, gen));
  if (isolated && root.base_species && toID(root.base_species) !== root.showdown_id) {
    root = qEvoRow.get(toID(root.base_species), gen) ?? root;
  }

  const seen = new Set<string>([root.showdown_id]);
  while (root.prevo) {
    const parent = qEvoRow.get(root.prevo, gen) as any;
    if (!parent || seen.has(parent.showdown_id)) break;
    seen.add(parent.showdown_id);
    root = parent;
  }

  const build = (r: any, depth: number): EvoNode => ({
    id: r.showdown_id,
    name: r.name,
    num: r.num,
    types: [r.type1, r.type2].filter(Boolean),
    sprite: spritesFor(r.num, gen).front,
    method: depth === 0 ? null : evoMethod(r),
    evos: depth < 8 ? (qEvosOf.all(r.showdown_id, gen) as any[]).map(c => build(c, depth + 1)) : [],
  });
  return build(root, 0);
}

// ------------------------------------------------------------ learnset

function learnset(id: string, gen: number): Partial<Record<MoveMethod, Move[]>> {
  const out: Partial<Record<MoveMethod, Move[]>> = {};
  for (const m of qLearnset.all(id, gen) as any[]) {
    (out[m.method as MoveMethod] ??= []).push({
      moveId: m.move_id,
      name: m.move_name,
      type: m.type,
      category: m.category,
      power: m.power || null,
      accuracy: m.accuracy === 0 ? null : m.accuracy,
      pp: m.pp,
      level: m.level,
      machine: m.machine,
    });
  }
  // level-up by level, machines by number, everything else alphabetically
  const byName = (a: Move, b: Move) => a.name.localeCompare(b.name);
  for (const [method, list] of Object.entries(out) as [MoveMethod, Move[]][]) {
    if (method === 'L')      list.sort((a, b) => (a.level! - b.level!) || byName(a, b));
    else if (method === 'M') list.sort((a, b) => (a.machine ?? '~').localeCompare(b.machine ?? '~') || byName(a, b));
    else                     list.sort(byName);
  }
  return out;
}

/**
 * Showdown lists egg moves on the basic stage only (Gligar, not Gliscor),
 * since an evolution hatches as its prevo. Walk the prevo chain and borrow
 * the first egg list found, naming where it came from.
 */
function withInheritedEggMoves(id: string, gen: number, moves: Partial<Record<MoveMethod, Move[]>>) {
  if (moves.E) return { moves, via: null };
  const seen = new Set([id]);
  let row = qEvoRow.get(id, gen) as any;
  while (row?.prevo && !seen.has(row.prevo)) {
    seen.add(row.prevo);
    row = qEvoRow.get(row.prevo, gen) as any;
    if (!row) break;
    const eggs = learnset(row.showdown_id, gen).E;
    if (eggs) return { moves: { ...moves, E: eggs }, via: row.name as string };
  }
  return { moves, via: null };
}

// ----------------------------------------------------------- encounters

/**
 * Group the stored rows by game, merging condition variants of the same
 * spot: "Morning" and "Night" become "Morning / Night"; a spot that is also
 * reachable unconditionally, or under more than four variants, is simply
 * shown without conditions.
 */
function groupEncounters(rows: any[]): EncounterGame[] {
  const games = new Map<string, Map<string, EncounterRow & { variants: Set<string | null> }>>();
  for (const r of rows) {
    const spots = games.get(r.version) ?? new Map();
    games.set(r.version, spots);
    const key = `${r.location}|${r.area}|${r.method}`;
    const spot = spots.get(key);
    if (spot) {
      spot.minLevel = Math.min(spot.minLevel!, r.min_level);
      spot.maxLevel = Math.max(spot.maxLevel!, r.max_level);
      spot.chance = Math.max(spot.chance!, r.chance);
      spot.variants.add(r.conditions);
    } else {
      spots.set(key, {
        region: r.region, location: r.location, area: r.area, method: r.method,
        minLevel: r.min_level, maxLevel: r.max_level, chance: r.chance,
        conditions: null, variants: new Set([r.conditions]),
      });
    }
  }
  return [...games].map(([version, spots]) => ({
    version,
    rows: [...spots.values()].map(({ variants, ...row }) => ({
      ...row,
      conditions: variants.has(null) || variants.size > 4 ? null : [...variants].join(' / '),
    })),
  }));
}

function encountersFor(row: any, gen: number): { encounters: EncounterGame[]; via: string | null } {
  let rows = qEncByForm.all(row.showdown_id, gen) as any[];
  if (rows.length || row.species_id == null) return { encounters: groupEncounters(rows), via: null };

  // cosmetic and battle-only forms have no entries of their own
  rows = qEncBySpecies.all(row.species_id, gen) as any[];
  if (!rows.length) return { encounters: [], via: null };
  const dflt = qDefaultFormName.get(row.num, gen) as any;
  const via = dflt && dflt.name !== row.name ? dflt.name : null;
  return { encounters: groupEncounters(rows), via };
}

// ------------------------------------------------------------ public API

/**
 * Pick the generation to show. Prefer what was asked for; failing that the
 * nearest earlier generation, then the earliest later one. Lets links carry a
 * gen across species that don't share it (gen-9 Bulbasaur -> Caterpie, absent
 * from Scarlet/Violet) without 404ing.
 */
function resolveGen(available: number[], wanted?: number): number | null {
  if (!available.length) return null;
  if (wanted == null) return available[available.length - 1];
  if (available.includes(wanted)) return wanted;
  const earlier = available.filter(g => g < wanted);
  return earlier.length ? earlier[earlier.length - 1] : available[0];
}

/** Assemble everything a species page needs, for one generation. */
export function getSpecies(rawId: string, wantedGen?: number): SpeciesPayload | null {
  const id = toID(rawId);
  const availableGens = getAvailableGens(id);
  const gen = resolveGen(availableGens, wantedGen);
  if (gen == null) return null;
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
  const eggs   = withInheritedEggMoves(id, gen, learnset(id, gen));
  const enc    = encountersFor(row, gen);
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
    availableGens,
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
    evolution: evolutionChain(id, gen),
    forms: row.num != null
      ? (qForms.all(row.num, gen) as any[]).map(f => ({ id: f.showdown_id, name: f.name, forme: f.forme || null }))
      : [],
    names,
    flavorText: row.species_id != null ? (qFlavor.all(row.species_id) as any[]) : [],
    sprites: spritesFor(row.num, gen),
    typeDefenses: typeDefenses([row.type1, row.type2].filter(Boolean), gen),
    moves: eggs.moves,
    eggMovesVia: eggs.via,
    encounters: enc.encounters,
    encountersVia: enc.via,
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

let dexCache: DexEntry[] | null = null;

/** The full national dex, 1,025 rows. Static for the life of the process, so built once. */
export function listAll(): DexEntry[] {
  if (dexCache) return dexCache;
  dexCache = (qDex.all() as any[]).map(r => ({
    id: r.showdown_id,
    name: r.name,
    num: r.num,
    types: [r.type1, r.type2].filter(Boolean),
    genIntroduced: r.gen_introduced,
    latestGen: r.gen,
    stats: { hp: r.hp, atk: r.atk, def: r.def, spa: r.spa, spd: r.spd, spe: r.spe },
    bst: r.bst,
    sprite: firstExisting([`${r.num}.png`]),
  }));
  return dexCache;
}

export function close() {
  db.close();
}
