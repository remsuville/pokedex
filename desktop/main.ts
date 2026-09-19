/**
 * main.ts — the Electron main process.
 *
 * Starts the same Hono API the web app uses, bound to localhost on a free
 * port, and opens one window pointed at it. The database and item sprites
 * ship inside the installer; the Pokémon sprites (1.5 GB) are downloaded
 * into the user's data directory on first run by `src/assets.ts`, and the
 * React app shows progress until the required packs are in.
 *
 * Unpackaged (`npm start` in desktop/) it reads the repo's data/, web/dist
 * and build/packs, so the shell can be tested without building an installer.
 */

import { app, BrowserWindow, Menu, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../../..');       // build/desktop -> desktop -> repo

/** Files that ship with the app, read-only. */
const bundled = app.isPackaged
  ? {
      db: path.join(process.resourcesPath, 'data', 'pokedex.sqlite'),
      itemSprites: path.join(process.resourcesPath, 'item-sprites'),
      web: path.join(process.resourcesPath, 'web'),
      manifest: path.join(process.resourcesPath, 'manifest.json'),
    }
  : {
      db: path.join(repo, 'data', 'pokedex.sqlite'),
      itemSprites: path.join(repo, 'vendor', 'sprites', 'sprites', 'items'),
      web: path.join(repo, 'web', 'dist'),
      manifest: path.join(repo, 'desktop', 'manifest.json'),
    };

/** Per-user, writable: %APPDATA%\Pokedex on Windows, ~/.config/Pokedex on Linux. */
const userData = app.getPath('userData');
const paths = {
  db: path.join(userData, 'pokedex.sqlite'),
  sprites: path.join(userData, 'sprites'),
};

/**
 * SQLite wants to create -wal/-shm sidecars next to the file even for a
 * read-only connection, and Program Files isn't writable, so the database
 * lives in the user's data directory. Re-copied whenever the bundled one is
 * newer — that's how an app update ships new data.
 */
function syncDatabase() {
  const src = fs.statSync(bundled.db);
  let dst: fs.Stats | null = null;
  try { dst = fs.statSync(paths.db); } catch {}
  if (dst && dst.size === src.size && dst.mtimeMs >= src.mtimeMs) return;
  for (const f of [paths.db, paths.db + '-wal', paths.db + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  fs.copyFileSync(bundled.db, paths.db);
}

async function main() {
  fs.mkdirSync(paths.sprites, { recursive: true });
  syncDatabase();

  // queries.ts opens the database when imported and checks sprite files
  // against these roots, so they go in before the import
  process.env.POKEDEX_DB = paths.db;
  process.env.SPRITE_ROOT = paths.sprites;
  process.env.ITEM_SPRITE_ROOT = bundled.itemSprites;
  const { start, resetSpriteCaches } = await import('../src/server.js');
  const { AssetManager, readManifest } = await import('../src/assets.js');

  // POKEDEX_PACK_URL overrides where packs come from — used to test against a local server
  const manifest = readManifest(bundled.manifest);
  if (process.env.POKEDEX_PACK_URL) manifest.baseUrl = process.env.POKEDEX_PACK_URL;
  const assets = new AssetManager(manifest, paths.sprites, resetSpriteCaches);
  assets.start();

  const { port } = await start({
    host: '127.0.0.1',
    port: Number(process.env.POKEDEX_PORT ?? 0),   // fixed port only for tests
    spriteRoot: paths.sprites,
    itemSpriteRoot: bundled.itemSprites,
    webDist: bundled.web,
    assets,
  });

  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'Pokédex',
    icon: path.join(here, '../../resources/icon.png'),
    backgroundColor: '#f7f8fa',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5') win.webContents.reload();
  });
  // links out of the app (none today, but the SQL guide may grow some) open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  const base = `http://127.0.0.1:${port}`;
  await win.loadURL(base);

  // Test hook: POKEDEX_SCREENSHOTS="dir:/pokemon/gliscor,/moves" captures each route and quits.
  if (process.env.POKEDEX_SCREENSHOTS) await screenshots(win, base, process.env.POKEDEX_SCREENSHOTS);
}

async function screenshots(win: BrowserWindow, base: string, spec: string) {
  const [dir, routes] = spec.split(':');
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  for (const route of routes.split(',')) {
    await win.loadURL(base + route);
    await wait(Number(process.env.POKEDEX_SCREENSHOT_WAIT ?? 1500));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, route.replace(/[^a-z0-9]+/gi, '_').replace(/^_/, '') || 'home') + '.png', img.toPNG());
  }
  app.quit();
}

app.whenReady().then(main).catch(e => {
  console.error(e);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
