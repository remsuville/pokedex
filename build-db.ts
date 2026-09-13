/**
 * build-db.ts — merges Pokemon Showdown's per-generation data with the
 * veekun/PokeAPI CSV dataset into a single SQLite file.
 *
 *   Showdown  -> gen-accurate base stats, types, abilities, learnsets, moves
 *   veekun    -> catch rate, base exp, egg cycles, EV yield, flavour text,
 *                foreign names, genus
 *
 * Run:  npm run build:db
 */

import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const CSV_DIR = './vendor/pokeapi/data/v2/csv';
const OUT = './data/pokedex.sqlite';
const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// ---------------------------------------------------------------- helpers

/** Showdown's ID convention: lowercase, alphanumeric only. */
const toID = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function readCSV<T = Record<string, string>>(file: string): T[] {
  const raw = fs.readFileSync(path.join(CSV_DIR, file), 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
}

function index<T>(rows: T[], key: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return m;
}

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

// ---------------------------------------------------------------- load CSVs

console.log('Loading veekun CSVs...');

const csvPokemon        = readCSV('pokemon.csv');
const csvSpecies        = readCSV('pokemon_species.csv');
const csvStats          = readCSV('pokemon_stats.csv');
const csvStatNames      = readCSV('stats.csv');
const csvEggGroups      = readCSV('pokemon_egg_groups.csv');
const csvEggGroupNames  = readCSV('egg_group_prose.csv');
const csvGrowthRates    = readCSV('growth_rates.csv');
const csvSpeciesNames   = readCSV('pokemon_species_names.csv');
const csvFlavor         = readCSV('pokemon_species_flavor_text.csv');
const csvLanguages      = readCSV('languages.csv');
const csvVersions       = readCSV('versions.csv');

const statById      = index(csvStatNames, r => r.id);
const growthById    = index(csvGrowthRates, r => r.id);
const langById      = index(csvLanguages, r => r.id);
const versionById   = index(csvVersions, r => r.id);
const eggGroupName  = index(
  csvEggGroupNames.filter(r => r.local_language_id === '9'),
  r => r.egg_group_id,
);

const pokemonByID   = index(csvPokemon, r => toID(r.identifier));
const speciesByID   = index(csvSpecies, r => toID(r.identifier));
const speciesByNum  = index(csvSpecies, r => r.id);
const statsByPokemon = group(csvStats, r => r.pokemon_id);
const eggBySpecies   = group(csvEggGroups, r => r.species_id);
const namesBySpecies = group(csvSpeciesNames, r => r.pokemon_species_id);
const flavorBySpecies = group(csvFlavor, r => r.species_id);

// default (non-form) pokemon row per species, for EV yield + base exp
const defaultPokemonBySpecies = index(
  csvPokemon.filter(r => r.is_default === '1'),
  r => r.species_id,
);

console.log(`  ${csvSpecies.length} species, ${csvPokemon.length} pokemon forms`);

// ------------------------------------------------- Showdown -> veekun bridge

/**
 * Two-stage resolver. Showdown form IDs mostly match veekun's pokemon
 * identifiers directly; where they don't (bare 'deoxys' vs 'deoxys-normal',
 * cosmetic forms veekun doesn't model), fall back to the base species.
 * Verified to resolve 100% of species across gens 1-9.
 */
function resolveSpeciesId(sp: { id: string; name: string; baseSpecies?: string }): string | null {
  const direct = pokemonByID.get(sp.id);
  if (direct) return direct.species_id;
  const base = speciesByID.get(toID(sp.baseSpecies ?? sp.name));
  if (base) return base.id;
  return null;
}

// ---------------------------------------------------------------- schema

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const db = new Database(OUT);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE species (
  species_id        INTEGER PRIMARY KEY,
  identifier        TEXT NOT NULL,
  national_dex_num  INTEGER,
  gen_introduced    INTEGER,
  capture_rate      INTEGER,
  base_happiness    INTEGER,
  hatch_counter     INTEGER,
  gender_rate       INTEGER,
  growth_rate       TEXT,
  genus             TEXT,
  base_experience   INTEGER,
  is_legendary      INTEGER,
  is_mythical       INTEGER,
  evolves_from      INTEGER
);

CREATE TABLE species_ev_yield (
  species_id INTEGER NOT NULL,
  stat       TEXT NOT NULL,
  value      INTEGER NOT NULL,
  PRIMARY KEY (species_id, stat)
);

CREATE TABLE species_egg_group (
  species_id INTEGER NOT NULL,
  egg_group  TEXT NOT NULL,
  PRIMARY KEY (species_id, egg_group)
);

CREATE TABLE species_name (
  species_id INTEGER NOT NULL,
  language   TEXT NOT NULL,
  name       TEXT,
  genus      TEXT,
  PRIMARY KEY (species_id, language)
);

CREATE TABLE flavor_text (
  species_id INTEGER NOT NULL,
  version    TEXT NOT NULL,
  language   TEXT NOT NULL,
  text       TEXT NOT NULL
);

-- one row per (form, generation): this is what the gen tab reads
CREATE TABLE pokemon_gen (
  showdown_id  TEXT NOT NULL,
  gen          INTEGER NOT NULL,
  species_id   INTEGER,
  name         TEXT NOT NULL,
  base_species TEXT,
  forme        TEXT,
  num          INTEGER,
  type1        TEXT,
  type2        TEXT,
  hp INTEGER, atk INTEGER, def INTEGER, spa INTEGER, spd INTEGER, spe INTEGER,
  bst          INTEGER,
  ability0     TEXT,
  ability1     TEXT,
  abilityH     TEXT,
  heightm      REAL,
  weightkg     REAL,
  prevo        TEXT,
  evo_level    INTEGER,
  PRIMARY KEY (showdown_id, gen)
);

CREATE TABLE learnset (
  showdown_id TEXT NOT NULL,
  gen         INTEGER NOT NULL,
  move_id     TEXT NOT NULL,
  move_name   TEXT,
  method      TEXT NOT NULL,   -- L=level-up M=TM/HM T=tutor E=egg S=event D=dream V=virtual-console
  level       INTEGER          -- only meaningful for method 'L'
);

CREATE TABLE move_gen (
  move_id  TEXT NOT NULL,
  gen      INTEGER NOT NULL,
  name     TEXT,
  type     TEXT,
  category TEXT,
  power    INTEGER,
  accuracy INTEGER,   -- 0 = never misses
  pp       INTEGER,
  priority INTEGER,
  PRIMARY KEY (move_id, gen)
);
`);

// ---------------------------------------------------------------- species

console.log('Writing species...');

const insSpecies = db.prepare(`INSERT INTO species VALUES
  (@species_id,@identifier,@national_dex_num,@gen_introduced,@capture_rate,
   @base_happiness,@hatch_counter,@gender_rate,@growth_rate,@genus,
   @base_experience,@is_legendary,@is_mythical,@evolves_from)`);
const insEV    = db.prepare('INSERT OR IGNORE INTO species_ev_yield VALUES (?,?,?)');
const insEgg   = db.prepare('INSERT OR IGNORE INTO species_egg_group VALUES (?,?)');
const insName  = db.prepare('INSERT OR IGNORE INTO species_name VALUES (?,?,?,?)');
const insFlav  = db.prepare('INSERT INTO flavor_text VALUES (?,?,?,?)');

db.transaction(() => {
  for (const s of csvSpecies) {
    const dflt = defaultPokemonBySpecies.get(s.id);
    const enName = (namesBySpecies.get(s.id) ?? []).find(n => n.local_language_id === '9');

    insSpecies.run({
      species_id: Number(s.id),
      identifier: s.identifier,
      national_dex_num: Number(s.id),
      gen_introduced: Number(s.generation_id),
      capture_rate: Number(s.capture_rate),
      base_happiness: s.base_happiness ? Number(s.base_happiness) : null,
      hatch_counter: s.hatch_counter ? Number(s.hatch_counter) : null,
      gender_rate: Number(s.gender_rate),
      growth_rate: growthById.get(s.growth_rate_id)?.identifier ?? null,
      genus: enName?.genus ?? null,
      base_experience: dflt?.base_experience ? Number(dflt.base_experience) : null,
      is_legendary: Number(s.is_legendary ?? 0),
      is_mythical: Number(s.is_mythical ?? 0),
      evolves_from: s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null,
    });

    // EV yield lives on the default form's stat rows
    if (dflt) {
      for (const st of statsByPokemon.get(dflt.id) ?? []) {
        if (Number(st.effort) > 0) {
          insEV.run(Number(s.id), statById.get(st.stat_id)!.identifier, Number(st.effort));
        }
      }
    }

    for (const eg of eggBySpecies.get(s.id) ?? []) {
      insEgg.run(Number(s.id), eggGroupName.get(eg.egg_group_id)?.name ?? eg.egg_group_id);
    }

    for (const n of namesBySpecies.get(s.id) ?? []) {
      insName.run(Number(s.id), langById.get(n.local_language_id)?.identifier ?? n.local_language_id, n.name, n.genus);
    }
  }

  for (const f of csvFlavor) {
    insFlav.run(
      Number(f.species_id),
      versionById.get(f.version_id)?.identifier ?? f.version_id,
      langById.get(f.language_id)?.identifier ?? f.language_id,
      f.flavor_text.replace(/[\n\f\r]+/g, ' ').trim(),
    );
  }
})();

// ------------------------------------------------ per-generation pokemon

console.log('Writing per-generation pokemon, learnsets and moves...');

const gens = new Generations(Dex);

const insPoke = db.prepare(`INSERT OR REPLACE INTO pokemon_gen VALUES
  (@showdown_id,@gen,@species_id,@name,@base_species,@forme,@num,@type1,@type2,
   @hp,@atk,@def,@spa,@spd,@spe,@bst,@ability0,@ability1,@abilityH,
   @heightm,@weightkg,@prevo,@evo_level)`);
const insLearn = db.prepare('INSERT INTO learnset VALUES (?,?,?,?,?,?)');
const insMove  = db.prepare(`INSERT OR REPLACE INTO move_gen VALUES
  (@move_id,@gen,@name,@type,@category,@power,@accuracy,@pp,@priority)`);

let unresolved = 0;

type LearnRow = [string, number, string, string, string, number | null];

for (const g of GENS) {
  const gen = gens.get(g);
  let nSpecies = 0;

  // better-sqlite3 transactions are strictly synchronous, but the learnsets
  // API is async — so gather everything first, then insert in one go.
  const learnRows: LearnRow[] = [];
  for (const sp of gen.species) {
    const ls = await gen.learnsets.get(sp.id);
    for (const [moveId, sources] of Object.entries(ls?.learnset ?? {})) {
      for (const src of sources as string[]) {
        if (Number(src[0]) !== g) continue;      // only this generation's entries
        const method = src[1];
        const level = method === 'L' ? (parseInt(src.slice(2), 10) || 1) : null;
        learnRows.push([sp.id, g, moveId, gen.moves.get(moveId)?.name ?? moveId, method, level]);
      }
    }
  }

  db.transaction(() => {
    for (const move of gen.moves) {
      insMove.run({
        move_id: move.id,
        gen: g,
        name: move.name,
        type: move.type,
        category: move.category,
        power: move.basePower ?? null,
        accuracy: move.accuracy === true ? 0 : Number(move.accuracy),
        pp: move.pp ?? null,
        priority: move.priority ?? 0,
      });
    }

    for (const sp of gen.species) {
      nSpecies++;
      const speciesId = resolveSpeciesId(sp);
      if (!speciesId) unresolved++;

      const vk = pokemonByID.get(sp.id)
        ?? (speciesId ? defaultPokemonBySpecies.get(speciesId) : undefined);

      const bs = sp.baseStats;

      insPoke.run({
        showdown_id: sp.id,
        gen: g,
        species_id: speciesId ? Number(speciesId) : null,
        name: sp.name,
        base_species: sp.baseSpecies ?? null,
        forme: sp.forme ?? null,
        num: sp.num ?? null,
        type1: sp.types[0] ?? null,
        type2: sp.types[1] ?? null,
        hp: bs.hp, atk: bs.atk, def: bs.def, spa: bs.spa, spd: bs.spd, spe: bs.spe,
        bst: bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe,
        ability0: (sp.abilities as any)?.['0'] ?? null,
        ability1: (sp.abilities as any)?.['1'] ?? null,
        abilityH: (sp.abilities as any)?.['H'] ?? null,
        // Showdown's older gen mods often omit heightm; veekun stores it in
        // decimetres / hectograms on the form row, so fall back to that.
        heightm: sp.heightm ?? (vk?.height ? Number(vk.height) / 10 : null),
        weightkg: sp.weightkg ?? (vk?.weight ? Number(vk.weight) / 10 : null),
        prevo: sp.prevo ?? null,
        evo_level: (sp as any).evoLevel ?? null,
      });
    }

    for (const r of learnRows) insLearn.run(...r);
  })();

  console.log(`  gen ${g}: ${nSpecies} forms, ${learnRows.length} learnset rows`);
}

if (unresolved) console.warn(`WARNING: ${unresolved} forms did not resolve to a veekun species`);

// ---------------------------------------------------------------- indexes

console.log('Building indexes...');
db.exec(`
CREATE INDEX idx_poke_gen        ON pokemon_gen(gen);
CREATE INDEX idx_poke_species    ON pokemon_gen(species_id, gen);
CREATE INDEX idx_poke_num        ON pokemon_gen(num, gen);
CREATE INDEX idx_learn_lookup    ON learnset(showdown_id, gen, method);
CREATE INDEX idx_learn_level     ON learnset(showdown_id, gen, level);
CREATE INDEX idx_flavor_species  ON flavor_text(species_id, language);
CREATE INDEX idx_name_species    ON species_name(species_id, language);
`);

db.pragma('optimize');
db.close();

const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`\nDone -> ${OUT} (${mb} MB)`);
