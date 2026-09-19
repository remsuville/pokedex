# Packaging — the desktop app

One installer to double-click. It opens a window showing the same React UI,
with the Node API running invisibly behind it. No terminal, no Node install,
works offline after first run. The web setup (`dev:api` + `vite`) stays the
development environment; `desktop/` is a build on top of it, not a rewrite.

Shipped: **[desktop-v0.2.0](https://github.com/remsuville/pokedex/releases/tag/desktop-v0.2.0)**,
built by CI, installed and verified on Windows 11.

## How it works

```
Pokedex-Setup-0.2.0.exe  (~160 MB)          first launch downloads
├── Electron runtime                        ┌──────────────────────────┐
├── web/dist        the React app           │ sprites-static.zip   71 MB│ required
├── pokedex.sqlite  the database            │ sprites-artwork.zip 194 MB│ required
├── item sprites    9 MB                    │ sprites-animated.zip 436 MB│ optional
└── manifest.json   what to download        └──────────────────────────┘
                                             from github.com/remsuville/pokedex-assets
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
- **NSIS** — the Windows installer format electron-builder produces. Ours is
  the two-step kind (`oneClick: false`): a page to choose the folder, then
  install. It registers an uninstaller in *Apps & features*.
- **Code signing** — a paid certificate naming the publisher. Without it
  Windows SmartScreen says "unrecognised app" once; click *More info → Run
  anyway*. Not worth buying for a handful of users.

## Files

| Path | Role |
|---|---|
| `desktop/main.ts` | Electron main process: paths, server, window, screenshot test hook |
| `desktop/package.json` | The shell's own dependencies and **the version number the installer is named after** |
| `desktop/electron-builder.yml` | What goes in the installer (`extraResources`) and the NSIS settings |
| `desktop/manifest.json` | Pack sizes, checksums and `baseUrl`. **Committed** — the installer must match the uploaded zips |
| `desktop/resources/icon.png` | Window and installer icon |
| `src/assets.ts` | The downloader; `AssetManager.status()` feeds the UI |
| `web/src/components/AssetGate.tsx` | Progress screen and corner note |
| `scripts/pack-sprites.ts` | Builds the zips into `build/packs/` and rewrites the manifest |
| `scratch/pack-server.ts` | Serves `build/packs/` locally with Range support, for testing |
| `.github/workflows/desktop.yml` | Builds the Windows installer on a tag push and attaches it to a release |

## Releasing a new version — the `.exe` workflow

Nothing is built on this machine. Pushing a tag makes GitHub Actions build
the installer on a Windows runner and publish it.

```fish
# 1. bump the version — the tag and desktop/package.json must agree,
#    nothing checks it and the .exe is named after package.json
sed -i 's/"version": "0.2.0"/"version": "0.3.0"/' desktop/package.json
git commit -am "Desktop 0.3.0"

# 2. push the branch, then the tag (the tag is what triggers the build)
git push
git tag desktop-v0.3.0
git push origin desktop-v0.3.0

# 3. watch it (~3½ minutes), then check the release page
gh run watch
gh release view desktop-v0.3.0
```

What `.github/workflows/desktop.yml` does on `windows-latest`, in order:

1. `actions/checkout` + Node 22.
2. Sparse-clones the two vendor inputs the installer needs: veekun's
   `data/v2/csv` from PokéAPI, and `sprites/items` from PokeAPI/sprites.
   The Pokémon sprites are *not* fetched — they come from the packs at runtime.
3. `npm ci --ignore-scripts` at the root, then `npm run build:db`. The
   `--ignore-scripts` matters — see Snags.
4. `npm ci && npm run build` in `web/` → `web/dist`.
5. `npm ci && npm run pack:win` in `desktop/`. Here `postinstall` runs
   `electron-builder install-app-deps`, which fetches the `better-sqlite3`
   binary for Electron's ABI, then electron-builder produces
   `desktop/dist/Pokedex-Setup-<version>.exe`.
6. Uploads the `.exe` as a workflow artifact (always), and, when the trigger
   was a tag, creates a GitHub Release for it with `softprops/action-gh-release`
   and auto-generated notes.

The workflow can also be started by hand from the Actions tab
(`workflow_dispatch`); that gives an artifact to download but no release.

To re-do a release: delete the release and the tag on GitHub
(`gh release delete desktop-v0.3.0 --cleanup-tag`), then push the tag again.

## Installing — what the user sees

1. Download `Pokedex-Setup-<version>.exe` from the release page.
2. SmartScreen: "Windows protected your PC" → *More info* → *Run anyway*.
3. Choose a folder (default `%LOCALAPPDATA%\Programs\Pokedex`), install,
   launch. A Start-menu entry and desktop shortcut are created.
4. First launch: the download screen, with a bar per pack. The two required
   packs gate the UI; the animated pack continues in the background with a
   corner note. Closing the app mid-download is fine — the `.part` file is
   resumed next time.
5. Then the Pokédex, at a window sized 1280×860, no menu bar. `F5` reloads,
   `F12` opens DevTools.

Where things end up:

| | |
|---|---|
| `%LOCALAPPDATA%\Programs\Pokedex\` | The app: Electron, `resources/app.asar`, and `resources/` with the bundled DB, item sprites, web build and manifest |
| `%APPDATA%\Pokedex\pokedex.sqlite` | The working copy of the database (plus `-wal`/`-shm`). Refreshed when a newer installer's copy is larger or newer |
| `%APPDATA%\Pokedex\sprites\` | The unzipped packs, one `.ready` marker per pack, any `.part` in progress |

Uninstalling (*Apps & features* → Pokedex) removes the program folder only.
`%APPDATA%\Pokedex` stays — that's electron-builder's default
(`deleteAppDataOnUninstall: false`) and it means a reinstall doesn't
re-download 700 MB. Delete it by hand to reclaim the space.

## Commands

```fish
# 1. sprite packs (once, or when vendor/sprites changes)
npm run pack:sprites                                    # PACK_BASE_URL overrides the host
#    upload build/packs/*.zip to that URL, commit desktop/manifest.json

# 2. try the shell without an installer (Linux or Windows)
cd web; npm run build; cd ../desktop; npm install; npm start

# 3. test the first-run download locally
npx tsx scratch/pack-server.ts                          # terminal 1
rm -rf ~/.config/Pokedex                                # fresh "install"
POKEDEX_PACK_URL=http://127.0.0.1:8765/ npm start       # terminal 2, in desktop/
#    THROTTLE=30 slows the server; KILL_AFTER=1 aborts the first download to test resume

# 4. Windows installer
git tag desktop-v0.2.0; git push origin desktop-v0.2.0  # CI builds and releases it
cd desktop; npm run pack:win                            # or locally, on Windows
```

Test hook: `POKEDEX_SCREENSHOTS="dir:/,/pokemon/gliscor"` makes the app
capture each route to `dir` and quit; `POKEDEX_PORT=3456` fixes the port.

## Hosting the packs

The three zips live as release assets on a separate public repo,
[remsuville/pokedex-assets](https://github.com/remsuville/pokedex-assets),
release `sprites-v1`. `desktop/manifest.json` points there and is committed,
so any installer built from this repo knows where to fetch from and what the
hashes should be.

Why a separate repo: release assets on a *private* repo need a token to
download, and at the time the main repo was private. It's public now, so
the packs could equally live on a release here — but keeping data out of
the code repo's release list is tidier, and the URL is baked into every
installer already shipped, so leave it.

When the sprite folders change: `npm run pack:sprites`, create a new
release on `pokedex-assets` (bump to `sprites-v2` so old installers keep
working), upload the zips, set `PACK_BASE_URL` to the new URL and rerun
`pack:sprites` (hashes don't change, only the URL), commit the manifest,
tag a new desktop release. Installed apps don't re-download automatically:
the `.ready` markers are per pack name, not per version. Users would delete
`%APPDATA%\Pokedex\sprites` to refresh.

`POKEDEX_PACK_URL` at runtime overrides `baseUrl` — for the local test
server above.

## Snags

- **CI: `better-sqlite3` tried to compile and failed.** The first tagged
  build died in `npm ci` at the root: `gyp ERR! find VS — Could not find any
  Visual Studio installation`, then `'tsx' is not recognized` because the
  install had aborted before devDependencies landed. The package ships a
  prebuilt Windows binary for Node 22 that node-gyp then ignores; the fix is
  `npm ci --ignore-scripts` for the database build. `desktop/` still runs its
  install scripts, because `install-app-deps` is what fetches the Electron
  ABI build.
- **npm 12 blocks install scripts.** In `desktop/`, `npm install` needs
  `npm install-scripts approve electron better-sqlite3 electron-builder`
  first, or the Electron binary isn't downloaded (`node node_modules/electron/install.js` fixes it after the fact).
- **`NODE_MODULE_VERSION` mismatch** at startup means `better-sqlite3` was
  built for the wrong ABI: `cd desktop; npx electron-builder install-app-deps`.
- **Cross-building** the Windows installer from Linux needs Wine; use the
  workflow or a Windows machine instead. `pack:linux` works anywhere for testing.
- **Tag and version drift.** The tag name is free text; the `.exe` is named
  from `desktop/package.json`. If they disagree the release is titled one
  thing and contains another — there's no check. Bump first, tag second.
- `extract-zip` has an open advisory about symlinks in malicious archives.
  Our archives are self-produced and checksum-verified before extraction.
