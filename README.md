# Pokédex

An offline Pokédex for all nine generations, with generation-accurate stats,
typings, abilities, learnsets, evolutions, encounter locations, and a Movedex,
Abilitydex and Itemdex to match. Switch a species to Gen 1 and you get Gen 1's
numbers, not today's.

It runs as a Windows desktop app or as a LAN web app from source. Both are
the same code: a SQLite database built once from two datasets, a small Hono
API that reads it, and a React frontend.

This started as a project to learn SQL and data modelling — the
[SQL guide](docs/SQL_GUIDE.md) and the in-app `/sql` console are as much the
point as the Pokédex itself.

## Download (Windows)

**[Pokedex-Setup-0.2.0.exe](https://github.com/remsuville/pokedex/releases/tag/desktop-v0.2.0)** — ~160 MB, Windows 10/11, 64-bit.

1. Run the installer. Windows SmartScreen will say "Windows protected your PC"
   because the app isn't code-signed — click **More info → Run anyway**. This
   happens once.
2. Pick an install folder (or keep the default) and finish.
3. First launch shows a download screen. The app fetches its sprite packs
   (~265 MB required, then ~435 MB of optional animated sprites in the
   background) into `%APPDATA%\Pokedex\sprites`. A few minutes on a normal
   connection. If it's interrupted, relaunching resumes where it stopped.
4. After that it works fully offline.

Uninstalling through *Apps & features* removes the program but leaves
`%APPDATA%\Pokedex` (the sprites and the database copy) — delete that folder
by hand to get the ~700 MB back.

Keys: `F5` reloads, `F12` opens DevTools.

## Run from source

Requires Node 22+ and git. Three npm projects live in this repo (root =
backend + ETL, `web/` = frontend, `desktop/` = Electron shell); each has its
own `npm install`.

```sh
git clone https://github.com/remsuville/pokedex.git
cd pokedex

# Third-party data — gitignored, cloned into vendor/
git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi.git vendor/pokeapi
git -C vendor/pokeapi sparse-checkout set data/v2/csv
git clone --depth 1 https://github.com/PokeAPI/sprites.git vendor/sprites     # ~1.5 GB

npm install
npm run build:db            # builds data/pokedex.sqlite in about five seconds

npm run dev:api             # API on http://0.0.0.0:3000
cd web && npm install && npm run dev      # UI on http://localhost:5173
```

Open <http://localhost:5173>. The API binds to all interfaces so other
machines on the LAN can use it — don't expose it to the internet.

To try the desktop shell without building an installer: `cd web && npm run
build`, then `cd desktop && npm install && npm start`. Building the installer
itself is done by CI on a tag push; see [PACKAGING.md](docs/PACKAGING.md).

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Why two data sources, the ETL, the schema, the API, the frontend, and the gotchas in the data |
| [docs/SQL_GUIDE.md](docs/SQL_GUIDE.md) | SQL from scratch, taught on this database, with exercises |
| [docs/PACKAGING.md](docs/PACKAGING.md) | The desktop app: how it's built, released and installed; the sprite packs; the CI workflow |
| [docs/layout.md](docs/layout.md) | One-screen file map |
| [docs/next_steps.md](docs/next_steps.md) | Roadmap |

## Data and licensing

- Game mechanics per generation come from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown)
  via `@pkmn/dex` (MIT). Encyclopaedic data (catch rates, egg groups, flavour
  text, locations, items) comes from the [veekun CSVs in PokéAPI](https://github.com/PokeAPI/pokeapi) (BSD).
- Sprites and artwork are from [PokeAPI/sprites](https://github.com/PokeAPI/sprites)
  and are Nintendo / Game Freak / The Pokémon Company assets. They are **not
  committed** here and not bundled in the installer: the desktop app downloads
  them on first run from [pokedex-assets](https://github.com/remsuville/pokedex-assets),
  and the source setup clones them into `vendor/`.
- This is a fan project for personal use, not affiliated with Nintendo.
