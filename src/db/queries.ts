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
const ITEM_SPRITE_ROOT = process.env.ITEM_SPRITE_ROOT ?? './vendor/sprites/sprites/items';

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
 * Static sprite folders per generation, keyed by national dex number or
 * veekun form id. Coverage is patchy — a species can't appear in a
 * generation that predates it, and some folders are incomplete — so every
 * lookup walks a fallback chain and returns the first file that exists.
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

/**
 * Animated sprites take priority where the animation is era-appropriate:
 * Black/White's own GIFs for gen 5, and Showdown's (drawn from the gen 6+
 * 3D models) from gen 6 on. Earlier generations stay static.
 */
const GEN_ANIMATED_DIR: Record<number, string> = {
  5: 'versions/generation-v/black-white/animated',
  6: 'other/showdown', 7: 'other/showdown', 8: 'other/showdown', 9: 'other/showdown',
};

/** Shinies are shown from this generation on. (They exist from gen 2; set to 2 to include Gold/Silver/Crystal.) */
const SHINY_FROM_GEN = 3;

function firstExisting(candidates: string[]): string | null {
  for (const rel of candidates) {
    if (fs.existsSync(path.join(SPRITE_ROOT, rel))) return rel;
  }
  return null;
}

/**
 * Front, shiny and artwork paths for one form in one generation. `spriteId`
 * is the form's file stem (10009 for Rotom-Wash); `num` is the species'
 * dex number, tried second so a form without its own art still shows
 * something.
 */
function spritesFor(spriteId: number | null, num: number | null, gen: number) {
  if (spriteId == null && num == null) return { front: null, shiny: null, artwork: null };

  const ids = [...new Set([spriteId, num].filter((n): n is number => n != null))];
  const anim = GEN_ANIMATED_DIR[gen];
  const dirs = GEN_SPRITE_DIRS[gen] ?? [];

  // per id: animated, then this generation's static art, then the modern default set
  const chain = (sub: string, ext = 'png') => ids.flatMap(id => [
    ...(anim ? [`${anim}${sub}/${id}.gif`] : []),
    ...dirs.map(d => `${d}${sub}/${id}.${ext}`),
    `${sub ? sub.slice(1) + '/' : ''}${id}.${ext}`,
  ]);

  return {
    front: firstExisting(chain('')),
    shiny: gen >= SHINY_FROM_GEN ? firstExisting(chain('/shiny')) : null,
    artwork: firstExisting(ids.flatMap(id => [`other/official-artwork/${id}.png`, `other/home/${id}.png`])),
  };
}

// static thumbnails for lists; the same few hundred files are asked for over and over
const thumbCache = new Map<string, string | null>();

function thumbnail(spriteId: number | null, num: number | null): string | null {
  const key = `${spriteId}/${num}`;
  if (!thumbCache.has(key)) {
    const ids = [...new Set([spriteId, num].filter((n): n is number => n != null))];
    thumbCache.set(key, firstExisting(ids.map(id => `${id}.png`)));
  }
  return thumbCache.get(key)!;
}

const pokemonRef = (r: any): PokemonRef => ({
  id: r.showdown_id,
  name: r.name,
  num: r.num,
  forme: r.forme || null,
  types: [r.type1, r.type2].filter(Boolean),
  sprite: thumbnail(r.sprite_id, r.num),
});

/** Item art is keyed by veekun identifier; Z-Crystals and a few others only have a '--held' or '--bag' variant. */
function itemSprite(identifier: string): string | null {
  for (const f of [`${identifier}.png`, `${identifier}--held.png`, `${identifier}--bag.png`]) {
    if (fs.existsSync(path.join(ITEM_SPRITE_ROOT, f))) return f;
  }
  return null;
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

const EVO_COLS = `showdown_id, name, base_species, num, sprite_id, type1, type2, prevo,
  evo_level, evo_type, evo_item, evo_move, evo_condition, evo_region`;
const qEvoRow = db.prepare(`SELECT ${EVO_COLS} FROM pokemon_gen WHERE showdown_id = ? AND gen = ?`);
const qEvosOf = db.prepare(`SELECT ${EVO_COLS} FROM pokemon_gen WHERE prevo = ? AND gen = ? ORDER BY num, rowid`);

const qAbility = db.prepare(
  `SELECT short_desc, desc FROM ability_gen WHERE name = ? AND gen = ?`);

const qForms = db.prepare(
  `SELECT showdown_id, name, forme FROM pokemon_gen WHERE num = ? AND gen = ?
   ORDER BY (forme IS NOT NULL AND forme != ''), rowid`);

// DISTINCT: Showdown records one 'S' source per event and the ETL drops the
// event index, leaving identical rows.
const qLearnset = db.prepare(`
  SELECT DISTINCT l.method, l.level, l.move_id, l.move_name,
         m.type, m.category, m.power, m.accuracy, m.pp, m.short_desc, m.desc,
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
    sprite: spritesFor(r.sprite_id, r.num, gen).front,
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
      shortDesc: m.short_desc,
      desc: m.desc,
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
  ].filter(a => a.name).map(a => {
    const text = qAbility.get(a.name, gen) as any;
    return { ...a, shortDesc: text?.short_desc ?? null, desc: text?.desc ?? null };
  });

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
    sprites: spritesFor(row.sprite_id, row.num, gen),
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
    sprite: firstExisting([`${r.num}.png`]),   // static thumbnail; the table is 1,025 rows
  }));
  return dexCache;
}

// ---------------------------------------------------------------- moves

const REF_COLS = 'p.showdown_id, p.name, p.num, p.forme, p.sprite_id, p.type1, p.type2';

const qMoveDex = db.prepare(`
  SELECT move_id, name, type, category, power, accuracy, pp, gen_introduced, gen, short_desc
  FROM move_gen m
  WHERE gen = (SELECT MAX(gen) FROM move_gen WHERE move_id = m.move_id)
  ORDER BY name
`);
const qMoveGens = db.prepare('SELECT gen FROM move_gen WHERE move_id = ? ORDER BY gen');
const qMove = db.prepare(`
  SELECT m.*, mg.label AS machine FROM move_gen m
  LEFT JOIN machine_gen mg ON mg.move_id = m.move_id AND mg.gen = m.gen
  WHERE m.move_id = ? AND m.gen = ?
`);
const qMoveFlavor = db.prepare(`
  SELECT version_group, text FROM move_flavor_text
  WHERE move_id = ? AND gen = ? GROUP BY version_group ORDER BY MIN(vg_order)
`);
const qLearners = db.prepare(`
  SELECT DISTINCT l.method, l.level, ${REF_COLS}
  FROM learnset l JOIN pokemon_gen p ON p.showdown_id = l.showdown_id AND p.gen = l.gen
  WHERE l.move_id = ? AND l.gen = ?
  ORDER BY p.num, p.rowid, l.level
`);

let moveDexCache: MoveDexEntry[] | null = null;

/** Every move at the latest generation it appears in. */
export function listMoves(): MoveDexEntry[] {
  return moveDexCache ??= (qMoveDex.all() as any[]).map(r => ({
    id: r.move_id,
    name: r.name,
    type: r.type,
    category: r.category,
    power: r.power || null,
    accuracy: r.accuracy === 0 ? null : r.accuracy,
    pp: r.pp,
    genIntroduced: r.gen_introduced,
    latestGen: r.gen,
    shortDesc: r.short_desc,
  }));
}

export function getMove(rawId: string, wantedGen?: number): MovePayload | null {
  const id = toID(rawId);
  const availableGens = (qMoveGens.all(id) as any[]).map(r => r.gen);
  const gen = resolveGen(availableGens, wantedGen);
  if (gen == null) return null;
  const m = qMove.get(id, gen) as any;
  if (!m) return null;

  // one entry per Pokémon per method; level-up collects every level
  const learners: Partial<Record<MoveMethod, Learner[]>> = {};
  const seen = new Map<string, Learner>();
  for (const r of qLearners.all(id, gen) as any[]) {
    const key = `${r.method}|${r.showdown_id}`;
    let entry = seen.get(key);
    if (!entry) {
      entry = { ...pokemonRef(r), levels: [] };
      seen.set(key, entry);
      (learners[r.method as MoveMethod] ??= []).push(entry);
    }
    if (r.method === 'L' && r.level != null && !entry.levels.includes(r.level)) entry.levels.push(r.level);
  }

  return {
    id: m.move_id,
    gen,
    name: m.name,
    availableGens,
    genIntroduced: m.gen_introduced,
    type: m.type,
    category: m.category,
    power: m.power || null,
    accuracy: m.accuracy === 0 ? null : m.accuracy,
    pp: m.pp,
    priority: m.priority ?? 0,
    target: m.target,
    flags: m.flags ? m.flags.split(' ') : [],
    secondaryChance: m.secondary_chance,
    critRatio: m.crit_ratio,
    zPower: m.z_power,
    maxPower: m.max_power,
    machine: m.machine,
    shortDesc: m.short_desc,
    desc: m.desc,
    flavorText: (qMoveFlavor.all(id, gen) as any[]).map(r => ({ versionGroup: r.version_group, text: r.text })),
    learners,
  };
}

// ------------------------------------------------------------- abilities

const qAbilityDex = db.prepare(`
  SELECT ability_id, name, gen_introduced, gen, short_desc FROM ability_gen a
  WHERE gen = (SELECT MAX(gen) FROM ability_gen WHERE ability_id = a.ability_id)
  ORDER BY name
`);
const qAbilityGens = db.prepare('SELECT gen FROM ability_gen WHERE ability_id = ? ORDER BY gen');
const qAbilityRow = db.prepare('SELECT * FROM ability_gen WHERE ability_id = ? AND gen = ?');
const qAbilityFlavor = db.prepare(`
  SELECT version_group, text FROM ability_flavor_text
  WHERE ability_id = ? AND gen = ? GROUP BY version_group ORDER BY MIN(vg_order)
`);
// pokemon_gen stores ability display names, not ids
const qAbilityPokemon = db.prepare(`
  SELECT ${REF_COLS},
         CASE WHEN p.ability0 = @name THEN '0' WHEN p.ability1 = @name THEN '1' ELSE 'H' END AS slot
  FROM pokemon_gen p
  WHERE p.gen = @gen AND (p.ability0 = @name OR p.ability1 = @name OR p.abilityH = @name)
  ORDER BY p.num, p.rowid
`);
const qAbilitySlots = db.prepare('SELECT gen, ability0, ability1, abilityH FROM pokemon_gen');

let abilityDexCache: AbilityDexEntry[] | null = null;

export function listAbilities(): AbilityDexEntry[] {
  if (abilityDexCache) return abilityDexCache;
  // ability name -> gen -> number of forms carrying it, in one pass over pokemon_gen
  const counts = new Map<string, Map<number, number>>();
  for (const r of qAbilitySlots.all() as any[]) {
    for (const name of new Set([r.ability0, r.ability1, r.abilityH].filter(Boolean) as string[])) {
      const byGen = counts.get(name) ?? new Map<number, number>();
      counts.set(name, byGen);
      byGen.set(r.gen, (byGen.get(r.gen) ?? 0) + 1);
    }
  }
  return abilityDexCache = (qAbilityDex.all() as any[]).map(r => {
    // Showdown's gen-9 data lists every ability, including ones no Pokémon in
    // Scarlet/Violet has (Aerilate); count where it was last actually used
    const byGen = counts.get(r.name);
    const gens = byGen ? [...byGen.keys()].sort((a, b) => b - a) : [];
    return {
      id: r.ability_id,
      name: r.name,
      genIntroduced: r.gen_introduced,
      latestGen: gens[0] ?? r.gen,
      shortDesc: r.short_desc,
      pokemonCount: gens.length ? byGen!.get(gens[0])! : 0,
    };
  });
}

export function getAbility(rawId: string, wantedGen?: number): AbilityPayload | null {
  const id = toID(rawId);
  const availableGens = (qAbilityGens.all(id) as any[]).map(r => r.gen);
  const gen = resolveGen(availableGens, wantedGen);
  if (gen == null) return null;
  const a = qAbilityRow.get(id, gen) as any;
  if (!a) return null;
  return {
    id: a.ability_id,
    gen,
    name: a.name,
    availableGens,
    genIntroduced: a.gen_introduced,
    shortDesc: a.short_desc,
    desc: a.desc,
    flavorText: (qAbilityFlavor.all(id, gen) as any[]).map(r => ({ versionGroup: r.version_group, text: r.text })),
    pokemon: (qAbilityPokemon.all({ gen, name: a.name }) as any[]).map(r => ({ ...pokemonRef(r), slot: r.slot })),
  };
}

// ----------------------------------------------------------------- items

const qItemDex = db.prepare(`
  SELECT i.*, (SELECT short_desc FROM item_gen g WHERE g.showdown_id = i.showdown_id ORDER BY gen DESC LIMIT 1) AS battle_desc
  FROM item i ORDER BY i.name, i.item_id
`);
const qItem = db.prepare('SELECT * FROM item WHERE identifier = ?');
const qItemGens = db.prepare(`
  SELECT gen FROM item_avail WHERE item_id = @item_id
  UNION SELECT gen FROM item_gen WHERE showdown_id = @showdown_id
  ORDER BY gen
`);
const qItemGen = db.prepare('SELECT * FROM item_gen WHERE showdown_id = ? AND gen = ?');
const qItemFlavor = db.prepare(`
  SELECT version_group, text FROM item_flavor_text
  WHERE item_id = ? AND gen = ? GROUP BY version_group ORDER BY MIN(vg_order)
`);
const qHeldBy = db.prepare(`
  SELECT w.version, w.version_order, w.rarity, ${REF_COLS}
  FROM wild_held_item w JOIN pokemon_gen p ON p.showdown_id = w.form_id AND p.gen = w.gen
  WHERE w.item_id = ? AND w.gen = ?
  ORDER BY w.version_order, p.num, p.rowid
`);
const qEvolvesWith = db.prepare(`
  SELECT ${REF_COLS}, p.evo_type, p.evo_item, p.evo_level, p.evo_move, p.evo_condition, p.evo_region,
         q.showdown_id AS from_id, q.name AS from_name, q.num AS from_num, q.forme AS from_forme,
         q.sprite_id AS from_sprite_id, q.type1 AS from_type1, q.type2 AS from_type2
  FROM pokemon_gen p JOIN pokemon_gen q ON q.showdown_id = p.prevo AND q.gen = p.gen
  WHERE p.evo_item_id = ? AND p.gen = ? AND p.evo_type IN ('useItem', 'trade', 'levelHold')
  ORDER BY p.num, p.rowid
`);

let itemDexCache: ItemDexEntry[] | null = null;

export function listItems(): ItemDexEntry[] {
  return itemDexCache ??= (qItemDex.all() as any[]).map(r => ({
    id: r.identifier,
    name: r.name,
    category: r.category,
    pocket: r.pocket,
    cost: r.cost,
    genIntroduced: r.gen_introduced,
    shortDesc: r.short_effect ?? r.battle_desc ?? null,
    sprite: itemSprite(r.identifier),
  }));
}

export function getItem(identifier: string, wantedGen?: number): ItemPayload | null {
  const i = qItem.get(identifier) as any;
  if (!i) return null;
  const availableGens = (qItemGens.all({ item_id: i.item_id, showdown_id: i.showdown_id }) as any[]).map(r => r.gen);
  const gen = resolveGen(availableGens, wantedGen) ?? 9;
  const b = qItemGen.get(i.showdown_id, gen) as any;

  const heldBy = new Map<string, (PokemonRef & { rarity: number })[]>();
  for (const r of qHeldBy.all(i.item_id, gen) as any[]) {
    if (!heldBy.has(r.version)) heldBy.set(r.version, []);
    heldBy.get(r.version)!.push({ ...pokemonRef(r), rarity: r.rarity });
  }

  return {
    id: i.identifier,
    gen,
    name: i.name,
    availableGens,
    category: i.category,
    pocket: i.pocket,
    cost: i.cost,
    flingPower: i.fling_power ?? b?.fling_power ?? null,
    flingEffect: i.fling_effect,
    genIntroduced: i.gen_introduced,
    sprite: itemSprite(i.identifier),
    shortEffect: i.short_effect,
    effect: i.effect,
    battle: b ? {
      shortDesc: b.short_desc,
      desc: b.desc,
      isBerry: Boolean(b.is_berry),
      naturalGift: b.natural_gift_type ? { type: b.natural_gift_type, power: b.natural_gift_power } : null,
      megaEvolves: b.mega_evolves,
      zMoveType: b.z_move_type,
      users: b.item_user ? JSON.parse(b.item_user) : [],
    } : null,
    flavorText: (qItemFlavor.all(i.item_id, gen) as any[]).map(r => ({ versionGroup: r.version_group, text: r.text })),
    heldBy: [...heldBy].map(([version, rows]) => ({ version, rows })),
    evolves: (qEvolvesWith.all(i.showdown_id, gen) as any[]).map(r => ({
      from: pokemonRef({ showdown_id: r.from_id, name: r.from_name, num: r.from_num, forme: r.from_forme,
                         sprite_id: r.from_sprite_id, type1: r.from_type1, type2: r.from_type2 }),
      to: pokemonRef(r),
      method: evoMethod(r),
    })),
  };
}

// -------------------------------------------------------------- SQL page

export interface SchemaTable { name: string; columns: { name: string; type: string }[] }

let schemaCache: SchemaTable[] | null = null;

/** Tables and columns, for the SQL page's sidebar. */
export function schema(): SchemaTable[] {
  if (schemaCache) return schemaCache;
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[];
  schemaCache = tables.map(t => ({
    name: t.name,
    columns: (db.prepare(`PRAGMA table_info("${t.name}")`).all() as any[]).map(c => ({ name: c.name, type: c.type })),
  }));
  return schemaCache;
}

export const QUERY_ROW_LIMIT = 500;

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  ms: number;
}

/**
 * Run one user-supplied read-only statement. The connection itself is
 * read-only, so this is belt and braces: reject anything that isn't a
 * single SELECT-shaped statement before it gets near the file.
 */
export function runQuery(sql: string): QueryResult {
  const text = sql.trim().replace(/;\s*$/, '');
  if (!text) throw new Error('Empty query.');
  if (/;/.test(text.replace(/'[^']*'/g, ''))) throw new Error('One statement at a time.');

  let stmt;
  try { stmt = db.prepare(text); }
  catch (e: any) { throw new Error(e.message); }
  if (!stmt.readonly) throw new Error('Only read-only queries are allowed.');
  if (!stmt.reader) throw new Error('That statement returns no rows.');

  const t0 = performance.now();
  const columns = stmt.columns().map(c => c.name);
  const rows: unknown[][] = [];
  let truncated = false;
  for (const row of stmt.raw().iterate()) {
    if (rows.length >= QUERY_ROW_LIMIT) { truncated = true; break; }
    rows.push(row as unknown[]);
  }
  return { columns, rows, truncated, ms: Math.round((performance.now() - t0) * 10) / 10 };
}

export function close() {
  db.close();
}
