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
                       │ 37 MB      │         │ Hono    │      /sprites
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
| Encounter locations | ❌ | ✅ |

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
│
├── data/
│   └── pokedex.sqlite      Build output — 37 MB, gitignored
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
        ├── main.tsx        React entry point
        ├── App.tsx         The species page
        ├── index.css       Tailwind theme, type colour tokens
        ├── types.ts        Payload interfaces, shared with the backend
        ├── lib/api.ts      fetch wrappers
        └── components/
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
6. **Generation loop** — for each of gens 1–9, writes forms, learnsets, moves
7. **Indexes** — built last, after bulk inserts, which is much faster

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

- **Type definitions** (`SpeciesPayload`, `StatRow`, `LevelUpMove`) — these
  are copied into `web/src/types.ts` so both halves agree on the shape
- **Derived-value functions** — `statRange()`, `eggSteps()`,
  `baseFriendship()`, `genderSplit()`, `catchPct()`
- **Sprite resolution** — `GEN_SPRITE_DIRS` and `spritesFor()`
- **Prepared statements** — compiled once at module load, reused per request
- **Public functions** — `getSpecies()`, `search()`, `listByGen()`

**Edit this file when you want to:**

- Change what a species page contains → `getSpecies()` and the
  `SpeciesPayload` interface (then mirror into `web/src/types.ts`)
- Fix a derived value (stat ranges, catch percentage, egg steps) → the
  helper functions near the top
- Add a new endpoint's data → new prepared statement plus a new exported
  function
- Change which sprite set a generation uses → `GEN_SPRITE_DIRS`

**Why prepared statements matter:** SQLite compiles a query plan once and
reuses it. Building SQL strings per request would reparse every time and
opens the door to injection. Here, user input only ever arrives as bound
parameters.

### `src/server.ts` — the HTTP layer

Deliberately thin, about twenty lines. Four routes:

| Route | Purpose |
|---|---|
| `GET /api/species/:id?gen=N` | Full payload for one species in one generation |
| `GET /api/search?q=&gen=N` | Name search within a generation |
| `GET /api/list/:gen` | Every species in a generation |
| `GET /sprites/*` | Static sprite files |

Binds to `0.0.0.0`, so other machines on the LAN can reach it.

**Edit this file when you want to:** add a route, add caching headers, or
serve the built frontend for production.

### `web/src/App.tsx` — the species page

Holds the page state (`id`, `gen`), fetches on change, renders the panels.
The `useEffect` has a `live` flag to discard stale responses if the user
switches generations faster than the network responds.

**Edit this file when you want to:** add or reorder panels, change the
header, adjust the layout grid.

### `web/src/components/` — presentational pieces

None of these fetch or hold state. They take props and render.

- **`DataTable.tsx`** — takes `[label, value][]`. Adding a row to any info
  panel is one line here. `Panel` is the section wrapper with the heading.
- **`StatBars.tsx`** — the `shade()` function sets bar colour by value band.
  Bars are scaled against 255 so they're comparable between species.
- **`TypePill.tsx`** — reads `var(--t-<type>)` from `index.css`.
- **`MoveTable.tsx`** — the learnset table. Accuracy renders as `∞` when
  null, which is how "never misses" is stored.

### `web/src/index.css` — theming

Tailwind v4 keeps theme tokens in CSS, not a JS config file. The `@theme`
block defines colours and fonts usable as Tailwind classes (`text-muted`,
`border-hair`). The `:root` block defines the eighteen type colours.

**Edit this file when you want to:** change the palette, fonts, or type
colours.

---

## 5. Database schema

Nine tables. The design principle is that **generation is a first-class
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
`heightm`, `weightkg`, `prevo`, `evo_level`, and `species_id` linking back
to the invariant data.

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

Currently only `L` is surfaced in the UI. The rest are already stored, so
adding TM/tutor/egg tabs is a frontend change, not an ETL change.

### `move_gen` — 4,473 rows

Move stats per generation, since moves are rebalanced between games.
`accuracy = 0` means "never misses" (stored as 0, rendered as ∞).

### Supporting tables

| Table | Rows | Contents |
|---|---|---|
| `species_ev_yield` | 1,120 | EV points awarded, by stat |
| `species_egg_group` | 1,304 | Breeding compatibility groups |
| `species_name` | 12,300 | Names in 13 languages |
| `flavor_text` | 68,220 | Pokédex entries per game version |

### Indexes

Seven, all on the lookup paths the API actually uses. Built after bulk
insert rather than before, which is significantly faster.

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
| **`prevo` is a display name** | Showdown returns `"Gligar"`, not `"gligar"` | Normalised through `toID()` |
| **Gen 8 gaps** | Showdown's Gen 8 mod is Sword/Shield, which excludes many species | `availableGens` drives the tabs, so missing generations simply don't render |
| **Dataset ends at 1,025** | Scarlet/Violet base is covered; nothing newer | Known limit |
| **Sprite coverage is patchy** | Not every generation has art for every species | `spritesFor()` walks a fallback chain |

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

**Add a row to an info panel**

Edit the relevant `DataTable` array in `App.tsx`:
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
| Sprites | `PokeAPI/sprites` | Per-generation art |
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
