# Learning SQL with the Pokédex

A hands-on guide to how this project stores and pulls its data, written for
someone learning SQL. Every query below runs as-is on the `/sql` page in the
app (or in the `sqlite3` CLI), and every one has been checked against the
real database. `ARCHITECTURE.md` explains *why* the project is built this
way; this document explains *how it works*, line by line, and teaches SQL
along the way.

Contents

1. [The journey of one page load](#1-the-journey-of-one-page-load)
2. [What a database is, using this one](#2-what-a-database-is-using-this-one)
3. [SQL from the ground up](#3-sql-from-the-ground-up)
   - SELECT, WHERE, ORDER BY, LIMIT
   - Operators, NULL, LIKE
   - Expressions, aliases, CASE
   - Aggregates and GROUP BY
   - JOIN — the one idea that unlocks this database
   - Subqueries and WITH
   - Window functions
   - Indexes and EXPLAIN QUERY PLAN
4. [Gotchas specific to this database](#4-gotchas-specific-to-this-database)
5. [How the scripts use SQL](#5-how-the-scripts-use-sql)
   - `build-db.ts` — writing the database
   - `queries.ts` — reading it
   - `server.ts` — exposing it over HTTP
   - The SQL page — how your typed query runs
   - The React side — from JSON to pixels
6. [Worked example: adding a field end to end](#6-worked-example-adding-a-field-end-to-end)
7. [Exercises](#7-exercises)
8. [Cheat sheet](#8-cheat-sheet)

---

## 1. The journey of one page load

Open `http://localhost:5173/pokemon/gliscor?gen=9`. Here is everything that
happens, and which file does it.

```
 browser                 Vite (:5173)            Hono (:3000)             SQLite
 ───────                 ────────────            ────────────             ──────
 GET /pokemon/gliscor ─▶ serves index.html
 React Router matches
 /pokemon/:id
 SpeciesPage mounts
 fetch('/api/species/gliscor?gen=9')
                     ─▶ proxies /api/* ────────▶ server.ts route
                                                 getSpecies('gliscor', 9)
                                                   queries.ts runs ~10
                                                   prepared statements ──▶ index lookups
                                                   builds one JSON object ◀── rows
                     ◀──────────────────────────◀ c.json(payload)
 setData(payload)
 panels render
 <img src="/sprites/…"> ─▶ proxies /sprites/* ──▶ serveStatic reads the PNG/GIF
```

Three things to notice:

- **The browser never touches SQL.** It asks for a URL and gets JSON. All SQL
  is in one file, `src/db/queries.ts`.
- **The database was built earlier**, once, by `build-db.ts`. At runtime
  nothing is computed from CSVs; rows are just read.
- **The generation is a column.** "Show me Gliscor in gen 9" is literally
  `WHERE showdown_id = 'gliscor' AND gen = 9`. That is the whole trick.

---

## 2. What a database is, using this one

A SQLite database is one file (`data/pokedex.sqlite`, ~45 MB) containing
**tables**. A table is a grid: named **columns** across the top, one **row**
per thing. Here are the first few rows and columns of `pokemon_gen`:

| showdown_id | gen | name      | type1 | type2  | hp | atk | … |
|-------------|-----|-----------|-------|--------|----|-----|---|
| bulbasaur   | 1   | Bulbasaur | Grass | Poison | 45 | 49  | … |
| ivysaur     | 1   | Ivysaur   | Grass | Poison | 60 | 62  | … |
| …           |     |           |       |        |    |     |   |
| bulbasaur   | 2   | Bulbasaur | Grass | Poison | 45 | 49  | … |

Bulbasaur appears nine times — once per generation — because its stats or
typing *could* differ between them (they don't for Bulbasaur; they do for
Clefairy, whose `type1` is `Normal` in gen 5 and `Fairy` in gen 6).

Every column has a **type**: `TEXT`, `INTEGER` or `REAL` (decimal). A cell
can also be **NULL**, which means "no value" — Charmander's `type2` is NULL
because it has one type.

### The tables

Twelve tables, grouped by what they describe. The full column lists are in
the sidebar of the `/sql` page; here is what each one is *for*.

**Per generation** — these have a `gen` column and are the heart of the app:

| Table | One row per | Use it for |
|---|---|---|
| `pokemon_gen` | form × generation | stats, types, abilities, evolution method |
| `learnset` | form × generation × move × method | what a Pokémon can learn |
| `move_gen` | move × generation | move power/accuracy/type/description |
| `ability_gen` | ability × generation | ability descriptions |
| `type_chart` | attacking × defending × generation | weakness grid |
| `machine_gen` | move × generation | TM/HM/TR number |
| `encounter` | form × game × area × method | where to catch it (gens 1–8) |

**Per species** — no `gen`; one row per national dex number:

| Table | One row per | Use it for |
|---|---|---|
| `species` | species | catch rate, base exp, egg cycles, genus, legendary flag |
| `species_ev_yield` | species × stat | EV yield |
| `species_egg_group` | species × egg group | breeding groups |
| `species_name` | species × language | names in 12 languages |
| `flavor_text` | species × game version | Pokédex entries |

### Two kinds of key

Rows in different tables point at each other through **keys**.

- `species_id` is the national dex number. `pokemon_gen.species_id = 472`
  points at the `species` row for Gliscor, and at all of Gliscor's names,
  egg groups and flavour text.
- `showdown_id` is a text slug (`gliscor`, `rotomwash`, `mrmime`) that
  identifies a **form**. `learnset` and `encounter` use it because Rotom-Wash
  learns different moves from Rotom, and Alolan Rattata lives somewhere
  different from Kanto Rattata.

`pokemon_gen` has both, which is why it's the table you'll join through most
often.

---

## 3. SQL from the ground up

Open the `/sql` page and type along. Ctrl+Enter runs the query.

### SELECT, FROM, WHERE

The minimum query names columns and a table:

```sql
SELECT name, hp, atk
FROM pokemon_gen
WHERE gen = 1 AND name = 'Pikachu';
```

| name | hp | atk |
|---|---|---|
| Pikachu | 35 | 55 |

Read it as: *from the `pokemon_gen` table, keep rows where gen is 1 and name
is Pikachu, and show me these three columns.* `SELECT *` means every column.

Text values go in **single quotes**. Numbers don't. The statement ends with
`;` (optional on the SQL page, required in the CLI).

### ORDER BY and LIMIT

"Top 5" is an `ORDER BY … DESC` plus `LIMIT`:

```sql
SELECT name, bst
FROM pokemon_gen
WHERE gen = 9 AND type1 = 'Dragon'
ORDER BY bst DESC
LIMIT 5;
```

| name | bst |
|---|---|
| Arceus-Dragon | 720 |
| Kyurem-Black | 700 |
| Kyurem-White | 700 |
| Rayquaza | 680 |
| Reshiram | 680 |

`ASC` (ascending, the default) sorts small to large; `DESC` large to small.
You can sort by several columns: `ORDER BY bst DESC, name` breaks ties
alphabetically.

Clauses always go in this order: `SELECT → FROM → WHERE → GROUP BY → HAVING →
ORDER BY → LIMIT`. SQL won't accept them shuffled.

### Operators, LIKE, IN, BETWEEN

`WHERE` accepts `=`, `<>` (or `!=`), `<`, `<=`, `>`, `>=`, combined with
`AND`, `OR`, `NOT` and parentheses.

`LIKE` matches patterns. `%` means "any characters", `_` means "one
character". It's case-insensitive for ASCII letters in SQLite:

```sql
SELECT name, type1, type2
FROM pokemon_gen
WHERE gen = 9 AND name LIKE 'char%';
```

| name | type1 | type2 |
|---|---|---|
| Charmander | Fire | |
| Charmeleon | Fire | |
| Charizard | Fire | Flying |
| Charjabug | Bug | Electric |
| Charcadet | Fire | |

`IN` tests membership in a list, `BETWEEN` an inclusive range:

```sql
WHERE num IN (149, 448, 25)
WHERE num BETWEEN 1 AND 151
```

### NULL — the value that isn't one

NULL means missing. It's not `0` and not `''`, and `= NULL` never matches
anything. Use `IS NULL` / `IS NOT NULL`:

```sql
-- pure Ice types: a second type that is missing
SELECT name FROM pokemon_gen
WHERE gen = 9 AND type1 = 'Ice' AND type2 IS NULL;
```

`COALESCE(a, b)` returns the first non-NULL argument — handy for display:

```sql
SELECT name,
       type1 || COALESCE('/' || type2, '') AS typing,
       hp + atk AS bulk
FROM pokemon_gen
WHERE gen = 9 AND num BETWEEN 1 AND 9;
```

| name | typing | bulk |
|---|---|---|
| Bulbasaur | Grass/Poison | 94 |
| Ivysaur | Grass/Poison | 122 |
| Venusaur | Grass/Poison | 162 |
| Charmander | Fire | 91 |
| … | | |

Three new things there: `||` glues text together; `hp + atk` is arithmetic
on columns; `AS typing` gives the computed column a name (an **alias**).
Note that `'/' || NULL` is NULL, which is why `COALESCE` is needed —
otherwise every single-typed Pokémon would show a blank typing.

### CASE — if/else in a query

```sql
SELECT name,
       CASE
         WHEN bst >= 600 THEN 'pseudo/legendary tier'
         WHEN bst >= 500 THEN 'strong'
         ELSE 'ordinary'
       END AS tier
FROM pokemon_gen
WHERE gen = 9 AND num IN (149, 448, 25);
```

| name | tier |
|---|---|
| Pikachu | ordinary |
| Dragonite | pseudo/legendary tier |
| Lucario | strong |

(You'll also get nine Pikachu cap forms — see the gotchas section.)

### Aggregates and GROUP BY

An **aggregate** collapses many rows into one value: `COUNT(*)`, `SUM()`,
`AVG()`, `MIN()`, `MAX()`.

```sql
SELECT COUNT(*) FROM learnset WHERE gen = 9 AND showdown_id = 'pikachu';
-- 79
```

`GROUP BY` runs the aggregate once per group instead of once overall.
"Average base stat total per type" is one query:

```sql
SELECT type1,
       COUNT(*)           AS n,
       ROUND(AVG(bst), 1) AS avg_bst,
       MAX(spe)           AS fastest
FROM pokemon_gen
WHERE gen = 9
GROUP BY type1
ORDER BY avg_bst DESC
LIMIT 5;
```

| type1 | n | avg_bst | fastest |
|---|---|---|---|
| Steel | 28 | 509.4 | 120 |
| Dragon | 40 | 503.0 | 142 |
| Psychic | 55 | 493.9 | 180 |
| Flying | 13 | 475.0 | 123 |
| Fighting | 37 | 465.6 | 138 |

Rule: every column in `SELECT` must be either in the `GROUP BY` or wrapped
in an aggregate. `type1` is grouped; the rest are aggregates.

`WHERE` filters rows *before* grouping; `HAVING` filters groups *after*:

```sql
SELECT type1, COUNT(*) AS n
FROM pokemon_gen
WHERE gen = 1
GROUP BY type1
HAVING n >= 15
ORDER BY n DESC;
```

| type1 | n |
|---|---|
| Water | 28 |
| Normal | 24 |

`DISTINCT` is the simplest grouping — unique values only:

```sql
SELECT DISTINCT method FROM learnset WHERE gen = 9;
```

### JOIN — the one idea that unlocks this database

Data is split across tables on purpose (it's called normalisation: store
each fact once). A `JOIN` stitches tables back together on a matching key.

Catch rate lives in `species`; stats live in `pokemon_gen`. To see both:

```sql
SELECT p.name, p.bst, s.capture_rate, s.genus
FROM pokemon_gen p
JOIN species s ON s.species_id = p.species_id
WHERE p.gen = 9 AND s.is_legendary = 1
ORDER BY p.bst DESC
LIMIT 5;
```

| name | bst | capture_rate | genus |
|---|---|---|---|
| Kyurem-Black | 700 | 3 | Boundary Pokémon |
| Kyurem-White | 700 | 3 | Boundary Pokémon |
| Zacian-Crowned | 700 | 10 | Warrior Pokémon |
| Zamazenta-Crowned | 700 | 10 | Warrior Pokémon |
| Terapagos-Stellar | 700 | 255 | Tera Pokémon |

How to read it:

- `FROM pokemon_gen p` — use `pokemon_gen`, and call it `p` for short.
- `JOIN species s ON s.species_id = p.species_id` — for each `p` row, find
  the `s` row whose `species_id` matches, and glue them side by side.
- Now `p.bst` and `s.capture_rate` are both available.

The `ON` condition is the join key. Get it wrong and you get either nothing
or every row paired with every other row (a "cross join" — if a result is
suspiciously huge, check your `ON`).

**Joining two per-gen tables needs `gen` in the ON.** A move's power
differs by generation, so a learnset row must join the `move_gen` row *for
the same gen*:

```sql
SELECT l.level, m.name, m.type, m.power
FROM learnset l
JOIN move_gen m ON m.move_id = l.move_id AND m.gen = l.gen
WHERE l.showdown_id = 'charizard' AND l.gen = 1 AND l.method = 'L'
ORDER BY l.level;
```

| level | name | type | power |
|---|---|---|---|
| 1 | Ember | Fire | 40 |
| 1 | Growl | Normal | 0 |
| … | | | |
| 46 | Flamethrower | Fire | 95 |
| 55 | Fire Spin | Fire | 15 |

Flamethrower shows 95 because that's its gen 1 power; it became 90 in gen 6.
Drop `AND m.gen = l.gen` and you'd get nine copies of every row.

**`JOIN` vs `LEFT JOIN`.** Plain `JOIN` keeps only rows that match on both
sides. `LEFT JOIN` keeps every row from the left table and fills the right
side with NULLs when there's no match. `queries.ts` uses `LEFT JOIN` for
`move_gen` so a learnset row is never silently lost if a move is missing.

**Self-join: comparing a table with itself.** Which Pokémon lost the most
Special Defense when gen 2 split the Special stat?

```sql
SELECT a.name, a.spd AS gen1_spd, b.spd AS gen2_spd
FROM pokemon_gen a
JOIN pokemon_gen b ON b.showdown_id = a.showdown_id AND b.gen = 2
WHERE a.gen = 1 AND a.spd <> b.spd
ORDER BY a.spd - b.spd DESC
LIMIT 5;
```

| name | gen1_spd | gen2_spd |
|---|---|---|
| Gastly | 100 | 35 |
| Mewtwo | 154 | 90 |
| Haunter | 115 | 55 |
| Exeggutor | 125 | 65 |
| Tangela | 100 | 40 |

Same table, two aliases (`a` = gen 1 row, `b` = gen 2 row), joined on the
form ID. This is the pattern for any "what changed between gens" question.

**Three tables.** Names in Japanese and French side by side:

```sql
SELECT s.identifier, ja.name AS japanese, fr.name AS french
FROM species s
JOIN species_name ja ON ja.species_id = s.species_id AND ja.language = 'ja'
JOIN species_name fr ON fr.species_id = s.species_id AND fr.language = 'fr'
WHERE s.species_id <= 3;
```

| identifier | japanese | french |
|---|---|---|
| bulbasaur | フシギダネ | Bulbizarre |
| ivysaur | フシギソウ | Herbizarre |
| venusaur | フシギバナ | Florizarre |

### Subqueries and WITH

A query can be used inside another. "Fully-evolved Pokémon above the
average BST" needs the average first:

```sql
SELECT name, bst
FROM pokemon_gen
WHERE gen = 9
  AND bst > (SELECT AVG(bst) FROM pokemon_gen WHERE gen = 9)
  AND showdown_id NOT IN (SELECT prevo FROM pokemon_gen WHERE gen = 9 AND prevo IS NOT NULL)
ORDER BY bst DESC;
```

The first subquery returns one number; the second returns a list (every
`prevo` — i.e. everything that evolves into something) and `NOT IN`
excludes them.

`WITH` names a subquery so the main query reads top-down. It's the same
thing, just tidier — `queries.ts` doesn't use it, but the examples on the
SQL page do:

```sql
WITH avg9 AS (SELECT AVG(bst) AS v FROM pokemon_gen WHERE gen = 9)
SELECT name, bst FROM pokemon_gen, avg9 WHERE gen = 9 AND bst > avg9.v;
```

### Window functions — "top N per group"

`GROUP BY` gives one row per group. When you want the top *two* per group,
you need a **window function**, which computes a value across related rows
without collapsing them:

```sql
WITH ranked AS (
  SELECT name, type1, spe,
         ROW_NUMBER() OVER (PARTITION BY type1 ORDER BY spe DESC) AS rn
  FROM pokemon_gen
  WHERE gen = 9 AND forme = ''
)
SELECT type1, name, spe
FROM ranked
WHERE rn <= 2
ORDER BY type1, rn;
```

| type1 | name | spe |
|---|---|---|
| Bug | Ribombee | 124 |
| Bug | Galvantula | 108 |
| Dark | Chien-Pao | 135 |
| Dark | Weavile | 125 |
| … | | |

`PARTITION BY type1` restarts the numbering for each type; `ORDER BY spe
DESC` says what "first" means. `RANK()` is the same but gives ties the same
number.

### Indexes and EXPLAIN QUERY PLAN

An **index** is a sorted lookup structure on one or more columns. Without
one, finding `showdown_id = 'gliscor'` means reading all 5,479 rows; with
one, it's a few steps. Prefix any query with `EXPLAIN QUERY PLAN` to see
which happens:

```sql
EXPLAIN QUERY PLAN
SELECT * FROM pokemon_gen WHERE showdown_id = 'gliscor' AND gen = 9;
-- SEARCH pokemon_gen USING INDEX sqlite_autoindex_pokemon_gen_1 (showdown_id=? AND gen=?)

EXPLAIN QUERY PLAN
SELECT * FROM pokemon_gen WHERE name = 'Gliscor';
-- SCAN pokemon_gen
```

`SEARCH … USING INDEX` is fast; `SCAN` reads everything. The first query
uses the primary key `(showdown_id, gen)`, which SQLite indexes
automatically. `name` has no index, so it's a scan — fine for 5k rows, and
a good illustration of why `queries.ts` looks things up by ID, not name.

The ETL creates eleven more indexes at the end of `build-db.ts`, each
matching a `WHERE` clause in `queries.ts`. Building them *after* the bulk
inserts is much faster than maintaining them during.

---

## 4. Gotchas specific to this database

Things that will trip you up, in order of how often they bite.

**Base forms have `forme = ''`, not NULL.** Showdown stores an empty string.
`WHERE forme IS NULL` returns nothing; use `WHERE forme = ''`.

**Cosmetic forms are separate rows.** Gen 9 has nine Pikachu rows (caps).
`COUNT(*)` on `pokemon_gen` counts forms, not species; use
`COUNT(DISTINCT num)` for species.

```sql
SELECT gen, COUNT(*) AS forms, COUNT(DISTINCT num) AS species
FROM pokemon_gen GROUP BY gen;
```

**Gen 1 has one Special stat.** It's stored as both `spa` and `spd`, so gen
1 `bst` double-counts it — Mewtwo is 744, not 680.

**Not every species is in every gen.** Showdown's gen 8 and 9 data cover
Sword/Shield and Scarlet/Violet only. 292 species have no gen 9 row; ask
for Caterpie in gen 9 and you get nothing. The app handles this by falling
back to the nearest gen; your queries won't.

**`prevo` is a `showdown_id`.** Join it to `pokemon_gen.showdown_id`, and
remember to include `gen`:

```sql
SELECT name, evo_type, evo_item, evo_condition
FROM pokemon_gen WHERE gen = 9 AND prevo = 'eevee';
```

**Text comparison is case-sensitive** for `=` (`'pikachu' <> 'Pikachu'`) but
`LIKE` isn't. IDs are all lowercase; names are capitalised.

**`accuracy = 0` means "never misses"**, not 0%.

**Egg moves live on the basic stage.** `learnset` has `E` rows for Gligar,
none for Gliscor. The app inherits them; a raw query won't.

**`learnset` has duplicate rows** for event moves (`S`) — one per
distribution event with the distinguishing index dropped. Use `DISTINCT`.

**Encounters stop at gen 8.** No BDSP, Legends: Arceus or Scarlet/Violet
data exists in the source.

---

## 5. How the scripts use SQL

### `build-db.ts` — writing the database

Run with `npm run build:db`. It deletes the old file and rebuilds from
scratch in about five seconds, so there is never a half-migrated state.

**Step 1: read the CSVs into lookup maps.** `readCSV()` parses a file into
an array of objects (one per row, keyed by header). Two helpers turn arrays
into maps because "find the row with id X" in an array is a linear search,
and the ETL does that hundreds of thousands of times:

```ts
function index<T>(rows: T[], key: (r: T) => string): Map<string, T>    // one row per key
function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]>  // many rows per key

const speciesByNum   = index(csvSpecies, r => r.id);           // '472' -> Gliscor's row
const flavorBySpecies = group(csvFlavor, r => r.species_id);   // '472' -> [entry, entry, …]
```

**Step 2: create the tables.** One `db.exec()` with the whole schema. This
is the same `CREATE TABLE` you'd type in a SQL console:

```sql
CREATE TABLE pokemon_gen (
  showdown_id  TEXT NOT NULL,
  gen          INTEGER NOT NULL,
  …
  PRIMARY KEY (showdown_id, gen)
);
```

`PRIMARY KEY (showdown_id, gen)` says the *pair* is unique — the same form
can't appear twice in one gen — and gives you the index seen in the
`EXPLAIN` example for free.

**Step 3: prepare the INSERTs.** A **prepared statement** is a query
compiled once with placeholders, then executed many times with different
values:

```ts
const insSpecies = db.prepare(`INSERT INTO species VALUES
  (@species_id, @identifier, @national_dex_num, …)`);

insSpecies.run({ species_id: 472, identifier: 'gliscor', … });
```

`@name` placeholders are filled from an object; `?` placeholders (used for
the smaller tables) from positional arguments. The values are **bound**,
not pasted into the SQL text — so a name like `Farfetch'd` can't break the
query, and nothing a data file contains can be mistaken for SQL.

**Step 4: transactions.** Every write pass is wrapped:

```ts
db.transaction(() => {
  for (const s of csvSpecies) insSpecies.run(…);
})();
```

Without this, SQLite would flush to disk after *every* row — 300,000 tiny
writes for the learnset. Inside a transaction it's one write at the end.
This is the difference between five seconds and several minutes.

There's one wrinkle: `better-sqlite3` transactions are synchronous, but
Showdown's learnset API is asynchronous (`await gen.learnsets.get(id)`).
The generation loop therefore collects all rows into an array *first*, then
inserts them inside a transaction.

**Step 5: reconciling two sources.** Showdown calls a form `mrmime`;
veekun calls it `mr-mime`. `toID()` normalises both to `mrmime`.
`resolveSpeciesId()` tries the form name, then the base species, and finds
a match for 100% of forms. This is where `pokemon_gen.species_id` comes
from — the bridge that lets `getSpecies()` join Showdown's stats to
veekun's catch rate.

**Step 6: aggregation before insert.** The encounters pass shows a pattern
worth knowing: veekun has 117k rows, one per encounter *slot*; the app
wants one row per *spot*. The ETL groups them in a `Map` keyed by
`version|area|method|conditions|form`, keeping the min/max level and
summing the slot rarity, then inserts the 54k aggregated rows. Doing this
at build time means the runtime query is a plain indexed read.

**Step 7: indexes last.**

```sql
CREATE INDEX idx_learn_lookup ON learnset(showdown_id, gen, method);
```

Every index here corresponds to a `WHERE` in `queries.ts`. If you add a
query that filters on something new, check `EXPLAIN QUERY PLAN` and add an
index if it says `SCAN` on a big table.

### `queries.ts` — reading the database

This file is the only one with SQL in it. The pattern throughout:

```ts
// 1. open once, read-only
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

// 2. prepare once, at module load
const qPokemon = db.prepare(`
  SELECT p.*, s.genus, s.capture_rate, …
  FROM pokemon_gen p
  LEFT JOIN species s ON s.species_id = p.species_id
  WHERE p.showdown_id = ? AND p.gen = ?
`);

// 3. execute per request, with bound parameters
const row = qPokemon.get(id, gen);        // .get() -> one row or undefined
const evos = qEvosOf.all(id, gen);        // .all() -> array of rows
```

`readonly: true` is a real guarantee: SQLite will refuse any write on this
connection, which is what makes the SQL page safe.

**Why prepared statements and not template strings.** You could write
``db.prepare(`… WHERE showdown_id = '${id}'`)``. Don't. Besides re-parsing
the SQL on every call, it means a URL like `/api/species/x' OR 1=1--`
becomes part of the query. With `?` placeholders the value is sent
separately and can only ever be a value.

**`getSpecies()` is a builder.** It runs about ten statements and assembles
one object. Roughly:

```
qPokemon           -> the main row (stats, types, abilities, species columns)
qAvailableGens     -> which gens this form exists in (the tabs)
qEvYield, qEggGroups, qNames, qFlavor   -> species-level extras
qForms             -> sibling forms in this gen
qAbility ×3        -> descriptions for each ability slot
evolutionChain()   -> qEvoRow / qEvosOf, walked up then down
learnset()         -> qLearnset, then grouped by method in JS
encountersFor()    -> qEncByForm (or qEncBySpecies), grouped by game in JS
spritesFor()       -> no SQL; checks the filesystem
```

**Where the line between SQL and JavaScript is.** SQL does filtering and
joining; JavaScript does shaping and arithmetic that would be awkward in
SQL. Examples:

- Stat min/max at level 100 (`statRange()`) — a formula, so JS.
- Type defenses — the chart rows are fetched with SQL, cached per gen in a
  `Map`, and multiplied in JS (`typeDefenses()`).
- Evolution tree — SQL can't easily return a tree, so `evolutionChain()`
  runs a "who has prevo = X" query recursively.
- Learnset grouping — one query returns all methods; JS splits into
  `{ L: [...], M: [...], E: [...] }` and sorts each.
- Egg move inheritance — walks `prevo` links with repeated small queries.

**Caching.** Two things never change while the server runs, so they're
computed once: the national dex list (`dexCache`, 1,025 rows for the list
page and search) and the type chart per generation (`chartCache`).
Everything else is cheap enough to query per request — a full species page
takes ~1 ms of database time.

### `server.ts` — exposing it over HTTP

Hono maps URLs to functions. Each route pulls parameters out of the URL,
calls one function from `queries.ts`, and returns JSON:

```ts
app.get('/api/species/:id', (c) => {
  const raw = c.req.query('gen');                  // ?gen=9  -> '9'
  const gen = raw == null ? undefined : Number(raw);
  const data = getSpecies(c.req.param('id'), gen); // :id     -> 'gliscor'
  return data ? c.json(data) : c.json({ error: 'not found' }, 404);
});
```

There's deliberately nothing else here — no SQL, no business logic — so
that the same `queries.ts` could sit behind a different server (or inside a
desktop app) unchanged.

### The SQL page — how your typed query runs

1. `SqlPage.tsx` POSTs `{ sql }` to `/api/query`.
2. `server.ts` passes it to `runQuery()` in `queries.ts`.
3. `runQuery()` strips a trailing `;`, refuses a second statement, and
   calls `db.prepare(text)`. If the SQL is invalid, SQLite throws and the
   message comes back to you as the red error box.
4. It checks `stmt.readonly` — SQLite's own verdict on whether the compiled
   statement writes anything. `DROP`, `PRAGMA`, `CREATE` fail here, before
   execution. (The connection is read-only anyway; this is the belt to that
   brace.)
5. `stmt.raw().iterate()` streams rows as arrays; it stops at 500 and flags
   the result as truncated.
6. The page renders `columns` and `rows`, and turns `showdown_id` cells
   into links.

`GET /api/schema` runs `PRAGMA table_info(...)` for every table to fill the
sidebar — `PRAGMA` is allowed *there* because it's the server's own code,
not user input.

### The React side — from JSON to pixels

`web/src/types.ts` is a copy of the payload interfaces in `queries.ts`. If
the backend adds a field and the frontend doesn't know about it, TypeScript
fails the build — that's the contract.

`lib/api.ts` has the `fetch` wrappers. `pages/SpeciesPage.tsx` calls
`fetchSpecies(id, gen)` in a `useEffect`, stores the result in state, and
hands slices of it to components: `d.stats` to `StatBars`, `d.moves` to
`MovesPanel`, `d.evolution` to `EvolutionChain`. Components don't fetch;
they render what they're given.

The dex list (`GET /api/species`) is fetched once and shared through
`useDex()`, so the header search, the list page and the prev/next links
all filter the same 1,025 rows in memory rather than asking the server.

---

## 6. Worked example: adding a field end to end

Goal: show whether a Pokémon is legendary on the species page. The data
already exists (`species.is_legendary`), so this touches the query layer,
the types, and one component — the most common kind of change.

**1. Check the data.**

```sql
SELECT identifier, is_legendary, is_mythical FROM species WHERE species_id IN (150, 151, 472);
```

**2. Fetch it.** `qPokemon` in `queries.ts` already joins `species`; add
the column to its `SELECT` list:

```ts
SELECT p.*, s.genus, s.capture_rate, s.base_happiness, s.base_experience,
       s.growth_rate, s.gender_rate, s.hatch_counter,
       s.is_legendary, s.is_mythical          -- new
```

**3. Put it in the payload.** Add to `SpeciesPayload` in `queries.ts`:

```ts
legendary: boolean;
mythical: boolean;
```

and in `getSpecies()`'s return object:

```ts
legendary: row.is_legendary === 1,
mythical: row.is_mythical === 1,
```

**4. Mirror the type.** Copy the two fields into `web/src/types.ts`.
Until you do, `npm run build` in `web/` fails — which is the point.

**5. Render it.** In `SpeciesPage.tsx`, the Pokédex-data panel is a list of
`[label, value]` pairs. Add one:

```tsx
['Category', d.legendary ? 'Legendary' : d.mythical ? 'Mythical' : 'Ordinary'],
```

**6. Restart `dev:api`** (it holds prepared statements from the old code)
and reload.

If the field had needed a *new column* — say, something from a CSV not yet
loaded — there'd be two more steps at the front: a `readCSV()` call and a
column in the `CREATE TABLE` plus its `INSERT` in `build-db.ts`, then
`npm run build:db` with the API stopped.

---

## 7. Exercises

Try each before opening the answer. All use the `/sql` page.

<details>
<summary><b>1.</b> The five heaviest Pokémon in gen 9.</summary>

```sql
SELECT name, weightkg FROM pokemon_gen
WHERE gen = 9 ORDER BY weightkg DESC LIMIT 5;
```
</details>

<details>
<summary><b>2.</b> How many Pokémon of each generation-of-introduction exist? (Hint: <code>species.gen_introduced</code>.)</summary>

```sql
SELECT gen_introduced, COUNT(*) AS n FROM species
GROUP BY gen_introduced ORDER BY gen_introduced;
```
</details>

<details>
<summary><b>3.</b> Every move that changed base power between gen 5 and gen 6.</summary>

```sql
SELECT a.name, a.power AS gen5, b.power AS gen6
FROM move_gen a
JOIN move_gen b ON b.move_id = a.move_id AND b.gen = 6
WHERE a.gen = 5 AND a.power <> b.power
ORDER BY a.name;
```
Self-join on `move_id`, fixing each alias to a gen.
</details>

<details>
<summary><b>4.</b> Which HMs exist in gen 3, and what moves are they?</summary>

```sql
SELECT mg.label, m.name
FROM machine_gen mg
JOIN move_gen m ON m.move_id = mg.move_id AND m.gen = mg.gen
WHERE mg.gen = 3 AND mg.label LIKE 'HM%'
ORDER BY mg.label;
```
Cut, Fly, Surf, Strength, Flash, Rock Smash, Waterfall, Dive.
</details>

<details>
<summary><b>5.</b> The most widely learnt level-up move in gen 9.</summary>

```sql
SELECT m.name, COUNT(*) AS learners
FROM learnset l
JOIN move_gen m ON m.move_id = l.move_id AND m.gen = l.gen
WHERE l.gen = 9 AND l.method = 'L'
GROUP BY l.move_id
ORDER BY learners DESC LIMIT 5;
```
Tackle (275), Leer, Growl, Bite, Crunch.
</details>

<details>
<summary><b>6.</b> What is Fairy weak to and resistant to in gen 9?</summary>

```sql
SELECT attacking, multiplier FROM type_chart
WHERE gen = 9 AND defending = 'Fairy' AND multiplier <> 1;
```
Weak to Poison and Steel; resists Bug, Dark, Fighting; immune to Dragon.
</details>

<details>
<summary><b>7.</b> Where can you get Abra in Red?</summary>

```sql
SELECT location, method, min_level, max_level, chance
FROM encounter
WHERE form_id = 'abra' AND version = 'Red'
ORDER BY location;
```
</details>

<details>
<summary><b>8.</b> Every Pokémon that evolves by trading in gen 4, with the item if any.</summary>

```sql
SELECT p.name, p.prevo, p.evo_item
FROM pokemon_gen p
WHERE p.gen = 4 AND p.evo_type = 'trade'
ORDER BY p.num;
```
</details>

<details>
<summary><b>9.</b> Species with a Pokédex entry in Sword but not in Scarlet.</summary>

```sql
SELECT s.identifier
FROM species s
WHERE EXISTS (SELECT 1 FROM flavor_text f WHERE f.species_id = s.species_id AND f.version = 'sword')
  AND NOT EXISTS (SELECT 1 FROM flavor_text f WHERE f.species_id = s.species_id AND f.version = 'scarlet')
ORDER BY s.species_id;
```
`EXISTS` is a subquery that asks "is there at least one such row?".
</details>

<details>
<summary><b>10. (harder)</b> For each type, the Pokémon with the biggest BST gain between its first and last generation.</summary>

```sql
WITH first_last AS (
  SELECT showdown_id, MIN(gen) AS g0, MAX(gen) AS g1
  FROM pokemon_gen GROUP BY showdown_id
),
delta AS (
  SELECT a.name, a.type1, b.bst - a.bst AS gain
  FROM first_last fl
  JOIN pokemon_gen a ON a.showdown_id = fl.showdown_id AND a.gen = fl.g0
  JOIN pokemon_gen b ON b.showdown_id = fl.showdown_id AND b.gen = fl.g1
  WHERE fl.g0 > 1              -- skip gen 1, whose double-counted Special skews it
)
SELECT type1, name, gain
FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY type1 ORDER BY gain DESC) AS rn FROM delta)
WHERE rn = 1 AND gain > 0
ORDER BY gain DESC;
```
Two CTEs, two joins back to the same table, and a window function to pick
one per type.
</details>

---

## 8. Cheat sheet

```sql
-- shape
SELECT cols FROM table [JOIN t2 ON …] [WHERE …] [GROUP BY …] [HAVING …] [ORDER BY …] [LIMIT n];

-- filtering
=  <>  <  <=  >  >=      AND  OR  NOT      IS NULL  IS NOT NULL
x IN (1, 2, 3)           x BETWEEN 1 AND 9   name LIKE 'char%'

-- text & numbers
a || b                   COALESCE(x, fallback)   ROUND(x, 1)   CAST(x AS INTEGER)
LOWER(s)  UPPER(s)       LENGTH(s)               SUBSTR(s, 1, 3)

-- aggregates
COUNT(*)  COUNT(DISTINCT c)  SUM(c)  AVG(c)  MIN(c)  MAX(c)

-- windows
ROW_NUMBER() OVER (PARTITION BY g ORDER BY c DESC)     RANK()   SUM(c) OVER (…)

-- structure
WITH name AS (SELECT …) SELECT … FROM name;
SELECT … WHERE c > (SELECT AVG(c) FROM …);
SELECT … WHERE EXISTS (SELECT 1 FROM … WHERE …);

-- inspection
EXPLAIN QUERY PLAN SELECT …;
```

**Keys in this database**

| To join… | …use |
|---|---|
| `pokemon_gen` ↔ `species` | `species_id` |
| `pokemon_gen` ↔ `learnset` / `encounter` | `showdown_id` (+ `gen` for learnset) |
| `learnset` ↔ `move_gen` / `machine_gen` | `move_id` **and** `gen` |
| `pokemon_gen` ↔ its pre-evolution | `prevo = other.showdown_id` **and** same `gen` |
| `species` ↔ names / flavour / egg groups / EVs | `species_id` |

**CLI equivalents** (`sqlite3 data/pokedex.sqlite`)

```
.tables                 list tables
.schema pokemon_gen     show CREATE TABLE
.mode column            aligned output
.headers on             column names
.quit
```
