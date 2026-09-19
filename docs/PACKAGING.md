# Packaging — the desktop app

One installer you and your friend double-click. It opens a window showing
the same React UI, with the Node API running invisibly behind it. No
terminal, no Node install, works offline after first run. The web setup
(`dev:api` + `vite`) stays the development environment; `desktop/` is a
build on top of it, not a rewrite.

## How it works

```
Pokedex-Setup-0.2.0.exe  (~160 MB)          first launch downloads
├── Electron runtime                        ┌──────────────────────────┐
├── web/dist        the React app           │ sprites-static.zip   68 MB│ required
├── pokedex.sqlite  the database            │ sprites-artwork.zip 185 MB│ required
├── item sprites    9 MB                    │ sprites-animated.zip 416 MB│ optional
└── manifest.json   what to download        └──────────────────────────┘
                                             → %APPDATA%\Pokedex\sprites
```

**Launch:** `desktop/main.ts` copies the database into the user's data
folder (Program Files is read-only and SQLite wants sidecar files), sets
the sprite paths, starts `src/server.ts` on `127.0.0.1:<free port>` and
opens one window at it.

**First run:** the React app asks `/api/assets/status`. `src/assets.ts`
is fetching the packs from `manifest.json`: download to a `.part` file
(resumable with a `Range` request), verify SHA-256, unzip, write a `.ready`
marker. `AssetGate` shows a progress screen until the two required packs
are in (~4 minutes at 10 Mbit/s), then the app, with a corner note while
the animated pack finishes. `spritesFor()` already falls back GIF → static,
so nothing breaks while it's still arriving. Later launches skip all this.

**Updates:** a new installer replaces the app and database; the sprites in
AppData are untouched. Packs only need re-uploading if the sprite folders
change.

## Terms

- **Electron** — bundles Chromium (the window) and Node (the backend). Tauri
  is smaller but Rust-only, and would mean porting `queries.ts`.
- **Native module** — an npm package with compiled C++. `better-sqlite3` is
  one, compiled against a specific Node ABI. `desktop/` is a separate npm
  project so its copy is built for Electron's ABI (Electron 42 ↔
  better-sqlite3 12.11.1, which has prebuilt binaries) without breaking the
  root copy used by `dev:api`.
- **Code signing** — a paid certificate naming the publisher. Without it
  Windows SmartScreen says "unrecognised app" once; click *More info → Run
  anyway*. Not worth buying for two people.

## Files

| Path | Role |
|---|---|
| `desktop/main.ts` | Electron main process: paths, server, window, screenshot test hook |
| `desktop/electron-builder.yml` | What goes in the installer (`extraResources`) and the NSIS settings |
| `desktop/manifest.json` | Pack sizes, checksums and `baseUrl`. **Committed** — the installer must match the uploaded zips |
| `src/assets.ts` | The downloader; `AssetManager.status()` feeds the UI |
| `web/src/components/AssetGate.tsx` | Progress screen and corner note |
| `scripts/pack-sprites.ts` | Builds the zips into `build/packs/` and rewrites the manifest |
| `scratch/pack-server.ts` | Serves `build/packs/` locally with Range support, for testing |
| `.github/workflows/desktop.yml` | Builds the Windows installer on a tag push and attaches it to a release |

## Commands

```fish
# 1. sprite packs (once, or when vendor/sprites changes)
PACK_BASE_URL=https://.../releases/download/sprites-v1/ npm run pack:sprites
#    upload build/packs/*.zip to that URL, commit desktop/manifest.json

# 2. try the shell without an installer (Linux or Windows)
cd web; npm run build; cd ../desktop; npm install; npm start

# 3. test the first-run download locally
npx tsx scratch/pack-server.ts                          # terminal 1
rm -rf ~/.config/Pokedex                                # fresh "install"
POKEDEX_PACK_URL=http://127.0.0.1:8765/ npm start       # terminal 2, in desktop/
#    THROTTLE=30 slows the server; KILL_AFTER=1 aborts the first download to test resume

# 4. Windows installer
git tag desktop-v0.2.0; git push --tags                 # CI builds and releases it
cd desktop; npm run pack:win                            # or locally, on Windows
```

Test hook: `POKEDEX_SCREENSHOTS="dir:/,/pokemon/gliscor"` makes the app
capture each route to `dir` and quit; `POKEDEX_PORT=3456` fixes the port.

## Hosting the packs — still to decide

`desktop/manifest.json` currently points at
`github.com/remsuville/pokedex-assets/releases/download/sprites-v1/`, which
doesn't exist yet. Release assets on a **private** repo need a token to
download, so the options are a separate public repo holding only the zips,
making `pokedex` public, or any static host. Whatever it is: upload the
three zips, set `PACK_BASE_URL`, rerun `pack:sprites` (the hashes don't
change, only the URL), commit the manifest. The whole set is 670 MB, so
baking it into the installer is also viable if hosting is a nuisance.

## Snags

- **npm 12 blocks install scripts.** In `desktop/`, `npm install` needs
  `npm install-scripts approve electron better-sqlite3 electron-builder`
  first, or the Electron binary isn't downloaded (`node node_modules/electron/install.js` fixes it after the fact).
- **`NODE_MODULE_VERSION` mismatch** at startup means `better-sqlite3` was
  built for the wrong ABI: `cd desktop; npx electron-builder install-app-deps`.
- **Cross-building** the Windows installer from Linux needs Wine; use the
  workflow or a Windows machine instead. `pack:linux` works anywhere for testing.
- `extract-zip` has an open advisory about symlinks in malicious archives.
  Our archives are self-produced and checksum-verified before extraction.
