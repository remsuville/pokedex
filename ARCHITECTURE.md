# Pokédex — Architecture and Maintenance Guide

A self-hosted, offline Pokédex covering all nine generations, with
generation-accurate stats, typings, abilities and learnsets. Built to
reproduce the depth of pokemondb.net and the generation-switching of
serebii.net, running entirely on local hardware with no external API calls
at runtime.

---

## 1. The problem this solves

Pokémon data is not static across generations. Clefairy was Normal-type
until Gen 6 and Fairy afterwards. Gengar's Special Defense was 130 in Gen 1
and 75 in Gen 2 when the Special stat split. Pikachu gained ten points of
Defense and Special Defense in Gen 6. Base friendship defaulted to 70 until
Gen 8, then 50. Egg hatch steps per cycle differ between Sword/Shield (128),
BDSP (256) and Scarlet/Violet (~257).

A Pokédex that shows only current values is wrong for eight of the nine
generations. The core engineering problem here is **temporal accuracy**:
every displayed value must correspond to the generation being viewed.

This ruled out the obvious approach. PokéAPI — the standard open Pokémon
dataset — stores only *current* base stats, with no history of past values
or typings. It cannot reconstruct a Gen 1 page.

---

## 2. Architecture

```
   SOURCES                 BUILD                  RUNTIME              CLIENT
 ┌──────────────┐      ┌────────────┐        ┌────────────┐      ┌────────────┐
 │ @pkmn/dex    │─────▶│            │        │            │      │            │
 │ (Showdown)   │      │build-db.ts │───────▶│ queries.ts │─────▶│ React SPA  │
 │ gen mods     │      │            │        │            │      │            │
 ├──────────────┤      │  ETL job   │        │ prepared   │      │  Vite      │
 │ veekun CSVs  │─────▶│            │        │ statements │      │  :5173     │
 │ (PokéAPI)    │      └────────────┘        └────────────┘      └────────────┘
 ├──────────────┤            │                     ▲                    │
 │ PokeAPI/     │            ▼                     │                    │
 │ sprites      │      ┌────────────┐         ┌─────────┐               │
 └──────────────┘      │ SQLite     │────────▶│ server  │◀──── /api ────┘
                       │ 44 MB      │         │ Hono    │      /sprites
                       └────────────┘         │ :3000   │
                                              └─────────┘
```

**The central decision:** all joins and merges happen once, at build time,
not per request. The runtime never parses a CSV, never resolves a name
mismatch, never computes a cross-source join. It reads indexed SQLite rows.
This is what makes the app fast enough to feel instant on modest hardware,
and what makes it portable to a desktop binary later.

### Why two data sources

Neither source alone is sufficient.

| | Pokémon Showdown (`@pkmn/dex`) | veekun / PokéAPI CSVs |
|---|---|---|
| Generation-accurate base stats | ✅ | ❌ current only |
| Generation-accurate typings | ✅ | ❌ |
| Learnsets with method + level per gen | ✅ | ✅ |
| Catch rate, base exp, egg cycles | ❌ | ✅ |
| EV yield | ❌ | ✅ |
| Pokédex flavour text per game | ❌ | ✅ |
| Foreign-language names | ❌ | ✅ |
| Encounter locations (gens 1–8) | ❌ | ✅ |

Showdown maintains full per-generation mods because it has to simulate
battles in every generation's ruleset. That makes it the only practical
source of truth for mechanical data over time. veekun supplies the
encyclopaedic layer Showdown has no reason to carry.

The ETL's job is to reconcile the two.

---

## 3. Repository layout

```
~/pokemon/pokedex/
│
├── build-db.ts             ETL — builds the database. Run when data changes.
├── package.json            Backend dependencies and scripts
├── tsconfig.json
├── next_steps.md           Roadmap
├── SQL_GUIDE.md            Learning guide: SQL from scratch on this database, how each script uses it
│
├── data/
│   └── pokedex.sqlite      Build output — 55 MB, gitignored
│
├── vendor/                 Third-party data — gitignored, cloned not committed
│   ├── pokeapi/            veekun CSV dataset (41 MB, sparse checkout)
│   └── sprites/            PokeAPI/sprites (shallow clone)
│
├── scratch/                Throwaway verification scripts, not part of the app
│   ├── gen-check.ts        Proves gen-switching works at the source level
│   └── show.ts             Prints one species payload as JSON
│
├── src/
│   ├── server.ts           Hono HTTP server — API and static sprites
│   └── db/
│       └── queries.ts      ALL SQL lives here. The API boundary.
│
└── web/                    Separate npm project — the frontend
    ├── package.json        Frontend dependencies
    ├── vite.config.ts      Dev server + proxy to the backend
    └── src/
        ├── main.tsx        React entry point, wraps App in BrowserRouter
        ├── App.tsx         Header (logo + search) and the route table
        ├── index.css       Tailwind theme, type colour tokens
        ├── types.ts        Payload interfaces, shared with the backend
        ├── lib/
        │   ├── api.ts      fetch wrappers; the four lists are fetched once and cached
        │   ├── dex.ts      useDex()/useMoves()/useAbilities()/useItems() and name search
        │   ├── sort.ts     useSort() column sorting for the list pages
        │   ├── filters.ts  useUrlFilters() — list filters live in ?q=&type=
        │   └── useDetail.ts fetch-on-change hook shared by the detail pages
        ├── pages/
        │   ├── DexPage.tsx        /              national dex table, filter + sort
        │   ├── SpeciesPage.tsx    /pokemon/:id   the species page
        │   ├── MoveDexPage.tsx    /moves         every move, filter by type/category
        │   ├── MovePage.tsx       /move/:id      stats, effect, game text, who learns it
        │   ├── AbilityDexPage.tsx /abilities     every ability with a Pokémon count
        │   ├── AbilityPage.tsx    /ability/:id   effect, game text, who has it
        │   ├── ItemDexPage.tsx    /items         the bag, filter by pocket/category
        │   ├── ItemPage.tsx       /item/:id      effect, evolutions, wild holders
        │   └── SqlPage.tsx        /sql           read-only SQL console with schema sidebar
        └── components/
            ├── SearchBox.tsx   Header combobox over all four dexes, keyboard-navigable
            ├── GenTabs.tsx     The generation switcher on every detail page
            ├── TabStrip.tsx    Tab row inside a panel (learn methods, games)
            ├── PokemonList.tsx "Pokémon that…" table on move/ability/item pages
            ├── FlavorList.tsx  In-game descriptions per version group, duplicates merged
            ├── Filters.tsx     Filter input/select and the list-page header
            ├── SortTh.tsx      Sortable column header
            ├── PixelSprite.tsx Game sprite at a whole-number scale, bottom-aligned
            ├── Tooltip.tsx     Hover/focus/tap description popup for moves and abilities
            ├── TypeDefenses.tsx Weakness grid, one cell per attacking type
            ├── EvolutionChain.tsx Family tree, cards joined by method arrows
            ├── TypePill.tsx    Coloured type badge
            ├── DataTable.tsx   Label/value table + Panel wrapper
            ├── StatBars.tsx    Base stat bars with min/max columns
            └── MoveTable.tsx   Level-up learnset table
```

Note that `web/` is its own npm project with its own `package.json`. Frontend
dependencies install there; backend dependencies install at the root.
Installing in the wrong place is the single most common mistake when working
on this repo.

---

## 4. File reference — what each file does and when to edit it

### `build-db.ts` — the ETL

Reads both sources, reconciles them, writes SQLite. Takes about five seconds
and is fully idempotent: it deletes and rebuilds the database from scratch
every run, so there is no migration state to manage.

Structure, in order:

1. **Helpers** — `toID()`, `readCSV()`, `index()`, `group()`
2. **CSV loading** — every veekun file is read and indexed into Maps
3. **The resolver** — `resolveSpeciesId()`, described below
4. **Schema** — the `CREATE TABLE` block
5. **Species pass** — writes generation-invariant data
6. **Machines pass** — TM/HM/TR numbers per generation
7. **Encounters pass** — aggregates per-slot rows into per-spot rows
8. **Generation loop** — for each of gens 1–9, writes the type chart, forms
   (with evolution fields), learnsets and moves
9. **Indexes** — built last, after bulk inserts, which is much faster

**Edit this file when you want to:**

- Add a new column from a veekun CSV → add to the `CREATE TABLE` block and
  the corresponding `INSERT`
- Pull in a CSV not yet loaded (`encounters.csv`, `pokemon_evolution.csv`)
  → add a `readCSV()` call near the top, then a new table and write pass
- Change what counts as a learnset entry (currently all methods are stored;
  the frontend filters to `L`)

After any edit: `npm run build:db`

### `src/db/queries.ts` — the query layer

The only file in the project containing SQL. Everything above it deals in
plain TypeScript objects.

Contains:

- **Type definitions** (`SpeciesPayload`, `StatRow`, `Move`, `EvoNode`, `EncounterGame`, `DexEntry`) — these
  are copied into `web/src/types.ts` so both halves agree on the shape
- **Derived-value functions** — `statRange()`, `eggSteps()`,
  `baseFriendship()`, `genderSplit()`, `catchPct()`, `typeDefenses()`,
  `evolutionChain()`
- **Sprite resolution** — `GEN_SPRITE_DIRS`, `GEN_ANIMATED_DIR`,
  `SHINY_FROM_GEN` and `spritesFor()`
- **Prepared statements** — compiled once at module load, reused per request
- **Public functions** — `getSpecies()`, `search()`, `listByGen()`

**Edit this file when you want to:**

- Change what a species page contains → `getSpecies()` and the
  `SpeciesPayload` interface (then mirror into `web/src/types.ts`)
- Fix a derived value (stat ranges, catch percentage, egg steps) → the
  helper functions near the top
- Add a new endpoint's data → new prepared statement plus a new exported
  function
- Change which sprite set a generation uses → `GEN_SPRITE_DIRS` (static),
  `GEN_ANIMATED_DIR` (GIFs, tried first), `SHINY_FROM_GEN` (shinies are
  hidden below it; currently 3, though Gold/Silver introduced them in gen 2)

**Why prepared statements matter:** SQLite compiles a query plan once and
reuses it. Building SQL strings per request would reparse every time and
opens the door to injection. Here, user input only ever arrives as bound
parameters.

### `src/server.ts` — the HTTP layer

Deliberately thin. The routes:

| Route | Purpose |
|---|---|
| `GET /api/species` | The national dex: all 1,025 species at their latest generation. Built once, cached in memory |
| `GET /api/species/:id?gen=N` | Full payload for one form. `gen` is optional (default: latest available); an unavailable gen resolves to the nearest one and `payload.gen` reports what was served |
| `GET /api/moves`, `/api/abilities`, `/api/items` | The other three dexes, each at its latest generation. Built once, cached |
| `GET /api/moves/:id?gen=N`, `/api/abilities/:id?gen=N`, `/api/items/:id?gen=N` | Detail payloads with the same gen semantics as species. Move and ability ids are Showdown ids (`knockoff`); item ids are veekun identifiers (`sitrus-berry`) because Showdown only knows battle items |
| `GET /api/search?q=&gen=N` | Name search within a generation (the UI filters the cached lists client-side instead) |
| `GET /api/list/:gen` | Every form in a generation |
| `GET /api/schema` | Tables and columns, for the SQL page sidebar |
| `POST /api/query` `{sql}` | Runs one read-only statement, up to 500 rows. See the SQL page note |
| `GET /sprites/*` | Static Pokémon sprites |
| `GET /item-sprites/*` | Static item sprites, keyed by veekun identifier |

Binds to `0.0.0.0`, so other machines on the LAN can reach it.

**Edit this file when you want to:** add a route, add caching headers, or
serve the built frontend for production.

**The SQL page** (`/sql`) sends user-typed SQL to `POST /api/query`. Three
layers keep that safe: the database connection is opened `readonly`, so
nothing can write; `runQuery()` refuses multiple statements and anything
whose prepared statement isn't flagged read-only (so `PRAGMA`, `ATTACH` and
DDL are rejected before execution); and results are capped at 500 rows.
There is no query timeout — better-sqlite3 doesn't expose one — so a
pathological recursive CTE can hold the process busy. Acceptable for a
LAN tool; don't expose the port to the internet.

### `web/src/App.tsx` — routing

The sticky header (logo, nav, `SearchBox`) and the route table. Each dex
is a list route and a detail route: `/` + `/pokemon/:id`, `/moves` +
`/move/:id`, `/abilities` + `/ability/:id`, `/items` + `/item/:id`. The
generation lives in the URL as `?gen=N`, so pages are linkable and the
header search carries the current gen into whatever it navigates to.

The three newer dexes share one shape: a list page (`useSort` +
`useUrlFilters` + `SortTh`) and a detail page (`useDetail` + `GenTabs` +
panels, ending in a `PokemonList` of the reverse lookup — who learns the
move, who has the ability, who holds or evolves with the item). Move names
in the species page's learnset and ability names in its header link across.

### `web/src/pages/SpeciesPage.tsx` — the species page

Reads `id` and `gen` from the URL, fetches on change, renders the panels.
The `useEffect` has a `live` flag to discard stale responses if the user
switches generations faster than the network responds. The gen tabs
highlight `payload.gen`, not the URL, because the API may have fallen back
to a different generation.

**Edit this file when you want to:** add or reorder panels, change the
header, adjust the layout grid.

### `web/src/pages/DexPage.tsx` — the list

One table, 1,025 rows, no virtualisation (it's fast enough). Filter text and
type live in the URL (`?q=&type=`); sort is local state. `matchDex()` ranks
prefix matches above substring matches and understands dex numbers.

### `web/src/components/` — presentational pieces

None of these fetch or hold state. They take props and render.

- **`DataTable.tsx`** — takes `[label, value][]`. Adding a row to any info
  panel is one line here. `Panel` is the section wrapper with the heading.
- **`StatBars.tsx`** — the `shade()` function sets bar colour by value band.
  Bars are scaled against 255 so they're comparable between species.
- **`PixelSprite.tsx`** — every game sprite on the page goes through this.
  It reads the image's natural size on load and draws it at the largest
  whole-number scale (in *device* pixels) that fits its box, so
  `image-rendering: pixelated` never produces uneven pixels. See the
  sprite-size gotcha.
- **`Tooltip.tsx`** — wraps move and ability names. Opens on hover, focus
  or tap, closes on Escape, outside tap or scroll; rendered through a portal
  with fixed positioning so the move tables' `overflow-x: auto` can't clip
  it, and flips above the trigger near the bottom of the viewport.
- **`TypePill.tsx`** — reads `var(--t-<type>)` from `index.css`.
- **`MovesPanel.tsx`** — one tab per learn method present in the payload,
  with a count. The machine tab is labelled TM/HM, TM/TR or TM by generation.
- **`MoveTable.tsx`** — the move table. Accuracy renders as `∞` when
  null, which is how "never misses" is stored.

### `web/src/index.css` — theming

Tailwind v4 keeps theme tokens in CSS, not a JS config file. The `@theme`
block defines colours and fonts usable as Tailwind classes (`text-muted`,
`border-hair`). The `:root` block defines the eighteen type colours.

**Edit this file when you want to:** change the palette, fonts, or type
colours.

---

## 5. Database schema

Thirteen tables. The design principle is that **generation is a first-class
column**, so switching generations is a `WHERE` clause rather than
application logic.

### `species` — generation-invariant data (1,025 rows)

One row per species. Things that don't change across generations.

| Column | Notes |
|---|---|
| `species_id` | Primary key, matches national dex number |
| `identifier` | veekun slug, e.g. `gliscor` |
| `gen_introduced` | Which generation added it |
| `capture_rate` | 3–255; higher is easier |
| `base_happiness` | **Stale** — see gotchas |
| `hatch_counter` | Egg cycles, not steps |
| `gender_rate` | Eighths female; `-1` means genderless |
| `growth_rate` | `medium-slow`, `erratic`, etc. |
| `base_experience` | Experience yield on defeat |
| `genus` | "Fang Scorpion Pokémon" |

### `pokemon_gen` — the heart of the database (5,479 rows)

One row per **(form, generation)** pair. This is what the generation tab
reads. A species present in six generations has six rows; a species with
alternate forms has more.

Holds `type1`, `type2`, the six base stats, `bst`, three ability slots,
`heightm`, `weightkg`, `species_id` linking back to the invariant data,
`sprite_id` (the PokeAPI/sprites file stem — the dex number, or veekun's
form id such as 10009 for Rotom-Wash, so forms get their own art), and
the evolution fields describing how this form evolves *from* its
pre-evolution: `prevo` (a showdown_id), `evo_level`, `evo_type`, `evo_item`,
`evo_move`, `evo_condition`, `evo_region`. These come from Showdown rather
than veekun's `pokemon_evolution.csv` because Showdown's are form-aware
(Exeggutor-Alola: Leaf Stone in Alola) and gen-aware (Magnezone: magnetic
field in gen 4, Thunder Stone from gen 8). `evolutionChain()` in
`queries.ts` climbs `prevo` to the root and expands every branch to build
the family tree for one generation.

Primary key `(showdown_id, gen)`.

### `learnset` — 317,855 rows

One row per **(form, generation, move, method)**.

| `method` | Meaning |
|---|---|
| `L` | Level-up — `level` column is populated |
| `M` | TM / HM |
| `T` | Move tutor |
| `E` | Egg move |
| `S` | Event-only |
| `D` | Dream World |
| `V` | Virtual Console transfer |

All methods are surfaced as tabs on the species page. Two wrinkles handled
in `queries.ts`: rows are `DISTINCT`ed (Showdown records one `S` source per
event), and egg moves are inherited down the prevo chain because Showdown
lists them on the basic stage only (`eggMovesVia` names the source).

### `machine_gen` — 1,008 rows

TM/HM/TR numbers per generation, from veekun's `machines.csv`. veekun keys
machines by *version group*, so `MACHINE_GROUPS` in the ETL picks one
priority list per generation (Crystal over Gold/Silver, USUM over Sun/Moon,
all three Scarlet/Violet groups). Numbers change between generations —
Earthquake is TM26 through gen 7, TR10 in gen 8, TM149 in gen 9.

### `move_gen` — 4,473 rows

Move stats per generation, since moves are rebalanced between games.
`accuracy = 0` means "never misses" (stored as 0, rendered as ∞).
`short_desc` and `desc` are Showdown's one-line and full effect text, also
per generation (Bite: "10% chance to flinch" in gen 1, 30% from gen 2).

Also per generation: Showdown's `target`, `flags` (space-separated:
`contact protect sound…`), `secondary_chance`, `crit_ratio`, and the Z-Move
(gen 7) and Max Move (gen 8) power.

### `ability_gen` — 1,364 rows

Every ability that exists in each generation (gen 3 onward), with the same
two description fields. Looked up by name when assembling a species page;
`pokemon_gen` stores ability *names*, so the ability page queries by name too.

### `item` — 1,482 rows, plus `item_gen`, `item_avail`, `wild_held_item`

Items come from both sources because neither is complete. veekun has the
whole bag (`item`: category, pocket, cost, Fling, English effect prose) but
no per-generation behaviour; Showdown has only the ~350 items that matter in
battle, but per generation (`item_gen`: held effect, Natural Gift, Mega
Stone target, Z-Move type, `item_user`). They join on `item.showdown_id`,
derived from the identifier or, failing that, the English name (`stick` →
Leek; `firium-z--held` → `firiumz`). A gen-8 rename (Stick → Leek) is
aliased in the ETL so one row covers both.

Three veekun categories are dropped: per-game `TM01`–`TM221` item rows (the
Movedex covers machines), 300 unnamed Dynamax crystals, and `unused` — except
for the real Z-Crystals veekun misfiles there. Gen 2's berries and bows,
which veekun lacks entirely, get synthetic rows (`item_id ≥ 100000`) from
Showdown so they're still searchable.

`item_avail` lists the generations an item exists in (from veekun's game
indices and flavour text; Showdown's gens are unioned at query time).
`wild_held_item` (5,448 rows) is veekun's per-game held-item table, keyed by
form like `encounter`; it stops at gen 7.

### `move_flavor_text`, `ability_flavor_text`, `item_flavor_text`

veekun's in-game descriptions, one row per English version group, labelled
`'Ultra Sun/Ultra Moon'` with a `vg_order` for sorting. Identical texts
across games are merged in the UI, not the database.

### `type_chart` — 2,677 rows

The damage chart per generation: `(gen, attacking, defending) → multiplier`.
Gen 1 has 15 types, gens 2–5 have 17, gen 6+ have 18. `???` and Stellar are
excluded since no Pokémon defends as them. `queries.ts` builds one in-memory
map per generation on first use and multiplies across a form's types to
produce `typeDefenses`; abilities are deliberately not applied.

### `encounter` — 54,233 rows

Where each form can be found, one row per (game, area, method, condition
set), aggregated at build time from veekun's 117k per-slot `encounters.csv`
rows: level range is the min/max across slots, `chance` the summed slot
rarity. Keyed by `form_id` (a showdown_id — `rattataalola`, not species 19)
so regional forms get their own locations; cosmetic forms fall back to the
species' default form at query time (`encountersVia`). `queries.ts` further
merges condition variants of one spot ("Morning / Night").

Coverage is gens 1–8 main games plus Colosseum/XD and Let's Go. **No BDSP,
Legends: Arceus or Scarlet/Violet** — gen 9 shows a placeholder. Max Raid
tier conditions are dropped in the ETL (they'd multiply every den by ten);
weather and story-progress conditions are kept.

### Supporting tables

| Table | Rows | Contents |
|---|---|---|
| `species_ev_yield` | 1,120 | EV points awarded, by stat |
| `species_egg_group` | 1,304 | Breeding compatibility groups |
| `species_name` | 12,300 | Names in 13 languages |
| `flavor_text` | 68,220 | Pokédex entries per game version |
| `item_avail` | 5,174 | Generations each item exists in |
| `item_flavor_text` | 6,515 | Item descriptions per version group |
| `move_flavor_text` | 9,635 | Move descriptions per version group |
| `ability_flavor_text` | 2,542 | Ability descriptions per version group |

### Indexes

Twenty-one, all on the lookup paths the API actually uses — `pokemon_gen` by
gen, species, number, prevo, abilities and `evo_item_id`; `learnset` by form
and level and, for the move page's reverse lookup, by move; the flavour and
held-item tables by their join keys. Built after bulk insert rather than
before, which is significantly faster.

---

## 6. The hard parts, and how they were solved

### Species name reconciliation

The two datasets identify species differently. Showdown uses a normalised ID
(`mrmime`, `nidoranf`, `deoxys`); veekun uses hyphenated slugs
(`mr-mime`, `nidoran-f`, `deoxys-normal`). A naive join matched 794 of 876
Gen 9 forms — 91%, with 82 silent failures.

The misses fell into two patterns: bare names where veekun stores an
explicit default form (`deoxys` vs `deoxys-normal`), and cosmetic forms
veekun doesn't model separately (Pikachu's caps, Vivillon patterns, Arceus
types).

`resolveSpeciesId()` handles both with a two-stage fallback: try the direct
form match, then fall back to the base species. This resolves **100% of
forms across all nine generations**, verified explicitly.

The wider lesson: when joining datasets from different projects, a naive key
match that looks like it mostly works is more dangerous than one that
obviously fails, because the failures are silent.

### Synchronous transactions vs asynchronous data

`better-sqlite3` transactions are strictly synchronous — they reject any
function returning a promise. The Showdown learnsets API is asynchronous.
The ETL resolves this by gathering all learnset rows for a generation into
an array first, then inserting them inside the synchronous transaction.

This is also faster: one transaction per generation rather than per species.

### Stat range formulas

pokemondb shows minimum and maximum level-100 values beside each base stat.
HP uses a different formula from the other five and is not affected by
nature.

```
HP:     min = 2·base + 110
        max = 2·base + 31 + 63 + 110

Others: min = floor((2·base + 5) × 0.9)      0 IV, 0 EV, hindering nature
        max = floor((2·base + 31 + 63 + 5) × 1.1)   31 IV, 252 EV, beneficial
```

Verified against Gliscor: 260/354, 175/317, 229/383, 85/207, 139/273,
175/317 — exact match.

### Catch rate percentage

The displayed figure didn't match the reference. Testing both candidate
formulas showed the modern Gen 5+ formula gives 8.8% for Gliscor, while the
Gen 3/4 formula gives 3.9% — which is what pokemondb shows. The older
formula is used.

---

## 7. Data gotchas

Things that are wrong or surprising in the source data, and how they're
handled.

| Issue | Detail | Handling |
|---|---|---|
| **Base friendship is stale** | veekun stores 70; Gen 8 changed the default to 50 | Derived at query time: `gen >= 8 → 50` |
| **Egg steps are game-specific** | SWSH 128/cycle, BDSP 256, SV ~257 — not a clean per-generation rule | `STEPS_PER_CYCLE` lookup table in `queries.ts` |
| **Height missing in old gen mods** | Showdown omits `heightm` for gens 1–8 | ETL falls back to veekun's decimetre column |
| **`prevo` is a display name in Showdown** | `"Farfetch’d-Galar"`, not `"farfetchdgalar"` | Normalised through `toID()` in the ETL, so the column is a join key |
| **One evolution method per form** | Showdown stores a single method; Milotic shows "Trade holding Prism Scale" in gen 5+ but not the older max-Beauty route | Known limit |
| **Rebuilding while the API runs** | The ETL deletes the DB file, but a running reader's `-wal`/`-shm` sidecars would corrupt the new one | ETL removes all three; stop `dev:api` before `build:db` |
| **Gen 8 and 9 gaps** | Showdown's mods are game-scoped: gen 8 is Sword/Shield (664 species), gen 9 is Scarlet/Violet (733). 292 species have no gen-9 row at all | `availableGens` drives the tabs; the dex list and default species view use each species' *latest available* gen; a requested gen that doesn't exist resolves to the nearest one |
| **`R` learnset method** | Showdown's form-specific moves (Rotom appliance moves, Shedinja's inherited Nincada moves) | Shown under a "Special" tab |
| **Duplicate learnset rows** | 677 `S` rows (one per event, `9S0`/`9S1`, index dropped) and 2 genuine `L` duplicates from Showdown | `DISTINCT` in the learnset query |
| **Egg moves live on the basic stage** | Showdown lists `E` sources on Gligar, not Gliscor | Inherited down the prevo chain at query time; `eggMovesVia` names the source |
| **Dataset ends at 1,025** | Scarlet/Violet base is covered; nothing newer | Known limit |
| **Sprite coverage is patchy** | Not every generation has art for every species or form | `spritesFor()` walks a fallback chain: animated → this gen's static folder → default set, first by form id then by dex number |
| **Sprite canvases differ per set** | Gen I/II are 40×40, III 64, IV 80, V 96, USUM 128, BDSP 256; GIFs are tight-cropped (37–146px, non-square) | Never drawn into a fixed `<img>` size. `PixelSprite` scales by whole device pixels and bottom-aligns; on a 1× display some generations sit smaller than others — that's the price of crisp pixels |
| **Animated sprites are era-bound** | Black/White GIFs are authentic for gen 5; Showdown's GIFs come from the gen 6+ models | Gen 5 uses BW, gens 6–9 use Showdown, gens 1–4 stay static |

---

## 8. Common tasks

**Rebuild the database after changing the ETL**
```fish
npm run build:db
```

**Run the stack**
```fish
npm run dev:api                    # pane 1 — backend on :3000
cd web; npm run dev                # pane 2 — frontend on :5173
```
Stop `dev:api` before `build:db` — the ETL replaces the file the server has
open. Or build elsewhere and swap: `POKEDEX_DB=/tmp/next.sqlite npm run build:db`,
then stop the server, copy the file over `data/pokedex.sqlite` (deleting any
`-wal`/`-shm` sidecars) and restart.
Open `http://localhost:5173`. Vite proxies `/api` and `/sprites` to the
backend, so there's no CORS to configure.

**Inspect a payload without the browser**
```fish
npx tsx scratch/show.ts gliscor 9
npx tsx scratch/show.ts clefairy 5
```

**Query the database directly**
```fish
sqlitebrowser data/pokedex.sqlite
```
or open the `/sql` page in the app. `SQL_GUIDE.md` teaches SQL against this
schema, with runnable examples and exercises.

**Add a row to an info panel**

Edit the relevant `DataTable` array in `pages/SpeciesPage.tsx`:
```tsx
['Base Exp.', <span className="tabular-nums">{d.training.baseExp}</span>],
```
If the value isn't in the payload yet, add it to `getSpecies()` in
`queries.ts` and to `SpeciesPayload` in both `types.ts` files.

**Update after a new Pokémon game releases**
```fish
npm update @pkmn/dex @pkmn/data
cd vendor/pokeapi; git pull; cd ../..
npm run build:db
```

---

## 9. Design decisions worth defending

**Build-time joins over runtime joins.** Every cross-source reconciliation
happens once in the ETL. Runtime does indexed reads only. This is what makes
the same codebase viable both as a LAN server and as a packaged desktop
binary — there is no server-side computation to replicate.

**All SQL behind one module.** `queries.ts` is the only file with SQL in it.
The frontend requests `/api/species/gliscor?gen=9` and receives JSON. That
boundary means the delivery mechanism can change — browser today, Tauri
`.exe` later — without touching the Pokédex logic.

**Generation as a schema column, not application logic.** Putting `gen` in
the primary key of `pokemon_gen` and `learnset` means generation switching
is a query parameter. The alternative — storing current values and applying
a patch list of historical changes — would have been far more code and far
more fragile.

**Shared types across the boundary.** `SpeciesPayload` is defined once and
copied to the frontend. If the ETL adds a column and `getSpecies()` returns
it, TypeScript fails the build until the frontend acknowledges it.

**Idempotent rebuilds over migrations.** The database is a build artefact,
not a system of record. It's gitignored and regenerated in five seconds.
There is no migration tooling because there is no state worth migrating.

---

## 10. Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript | Type safety across the ETL/API/UI boundary |
| Runtime | Node.js | Only runtime with first-class access to both data sources |
| Database | SQLite via `better-sqlite3` | Zero-config, embeddable, synchronous API suits build-time work |
| Game data | `@pkmn/dex`, `@pkmn/data` | Only source with per-generation accuracy |
| Reference data | veekun / PokéAPI CSVs | Encyclopaedic depth |
| Sprites | `PokeAPI/sprites` | Per-generation art, shinies, BW and Showdown GIFs |
| API | Hono | Minimal, portable, runs unchanged inside Tauri |
| Frontend | React 19 + Vite | Component reuse across dense repeated tables |
| Styling | Tailwind v4 | Utility classes suit dense tabular layouts |
| Tooling | oxlint, Prettier, tsx | Fast feedback |

---

## 11. Licensing

Sprites and artwork are Nintendo / Game Freak / The Pokémon Company assets.
They are cloned at build time from a public repository and are **not
committed** to this repository.

Smogon competitive set data, if added later, splits by provenance: sets
derived from Showdown ladder usage statistics are MIT-licensed; sets scraped
from Smogon's written analyses are copyrighted by Smogon and its
contributors and require permission before use in an application. Only the
former should be bundled.

Any distributable build should fetch assets on first run rather than bundle
them, so the binary contains only original code and openly-licensed data.
