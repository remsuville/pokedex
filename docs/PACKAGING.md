# Packaging — shipping the Pokédex as a Windows app

Goal: one installer you and your friend double-click. It opens a window
showing the same React UI, with the Node API running invisibly behind it.
No terminal, no Node install, works offline. The web setup (`dev:api` +
`vite`) stays as the development environment; packaging is a build step
on top, not a rewrite.

## Terms

- **Runtime** — the thing that executes your code. In dev that's Node on
  your machine; a packaged app has to carry its own.
- **Electron** — a runtime that bundles Chromium (the window) and Node
  (the backend) into one program. ~100 MB before your data.
- **Tauri** — the small alternative (~5 MB). Uses the OS's built-in
  browser view and a **Rust** backend. Rust can't run TypeScript.
- **Sidecar** — a separate executable shipped alongside the app and
  started by it. How you'd run Node under Tauri.
- **Native module** — an npm package with compiled C++ inside.
  `better-sqlite3` is one. It's compiled against a specific Node version,
  so a packager must rebuild it for the runtime it ships.
- **Installer** — an `.exe`/`.msi` that copies files into Program Files and
  adds a Start menu entry. Produced by the packager, not written by hand.
- **Code signing** — a paid certificate that tells Windows who made the
  program. Without it, SmartScreen shows "unrecognised app" once; the user
  clicks *More info → Run anyway*. Not worth buying for two people.

## Electron vs Tauri

| | Electron | Tauri |
|---|---|---|
| Runs `server.ts` + `queries.ts` unchanged | Yes | No — needs a Node sidecar or a Rust port |
| Runtime size | ~100 MB | ~5 MB |
| Build complexity | One known step (rebuild `better-sqlite3`) | Two runtimes to manage |

**Choice: Electron.** The 95 MB difference is nothing next to the sprites,
and it means zero code is ported.

## What ships

| Part | Size | Notes |
|---|---|---|
| Electron runtime | ~100 MB | |
| `web/dist` (built UI) | <1 MB | `vite build` |
| `data/pokedex.sqlite` | 55 MB | |
| Item sprites | 9 MB | |
| Pokémon sprites | **see below** | the only real decision |

`vendor/sprites/sprites/pokemon` is 2.1 GB, but the app reads only the
folders listed in `queries.ts` (`GEN_SPRITE_DIRS`, `GEN_ANIMATED_DIR`,
the artwork paths in `spritesFor`, the top-level thumbnails). Of those:

| Set | Size | Keep? |
|---|---|---|
| Per-gen static sprites, thumbnails, shinies | ~300 MB | Yes — this is the core |
| Official artwork (species hero image) | 343 MB | Yes; re-encoding to WebP would cut it to ~80 MB |
| Showdown animated GIFs (gens 6–9) | 594 MB | Optional — without them the tabs fall back to static |
| Black/White animated GIFs (gen 5) | 289 MB | Optional, same fallback |
| HOME renders | 396 MB | No — only a fallback behind artwork |

Static + artwork ≈ **350 MB installer**. Keep the GIFs ≈ 1.2 GB.

## Dev vs packaged — what actually differs

Only two things, both already parametrised:

1. **Paths.** `queries.ts` reads `POKEDEX_DB`, `SPRITE_ROOT`,
   `ITEM_SPRITE_ROOT`. The Electron main process sets them to the install
   directory before starting the server.
2. **Network.** Dev binds `0.0.0.0:3000` so the LAN can reach it. Packaged,
   bind `127.0.0.1` on a random free port — no collisions on your friend's
   machine, nothing exposed to his network. The window is told the port.

Everything else — routes, queries, React — is identical.

## Build pipeline

```
vite build                → web/dist
npm run build:db          → data/pokedex.sqlite   (only if data changed)
copy pruned sprite set    → a staging folder
electron-builder          → Pokedex-Setup-x.y.z.exe
```

One script (`npm run build:app`) chains these. Build on Windows or in a
GitHub Actions Windows runner; cross-building from Linux is possible but
flakier. Releasing an update = run it again, send the new installer.

## Known snags

- **`better-sqlite3` rebuild.** `electron-builder` runs `electron-rebuild`
  automatically; if it doesn't, the app fails at startup with a
  `NODE_MODULE_VERSION` mismatch. The fix is `npx electron-rebuild`.
- **SmartScreen warning** on first run (unsigned). Expected.
- **WAL sidecars.** The packaged DB is read-only, but SQLite still wants to
  create `-wal`/`-shm` next to it. Program Files isn't writable, so either
  open with `journal_mode = DELETE` in the packaged build or copy the DB to
  the user's AppData on first launch.

## Order of work

1. Add an `electron/` folder: `main.ts` (start server, open window) and a
   `preload` (empty for now).
2. Make `server.ts` export a `start(port, host)` instead of calling
   `serve()` at import time, so both dev and Electron can call it.
3. Sprite prune script that copies the used folders to `build/sprites`.
4. `electron-builder` config: files to include, Windows target, icon.
5. Build on Windows, fix the `better-sqlite3` step, send to your friend.
