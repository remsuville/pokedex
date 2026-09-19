import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getSpecies, search, listByGen, listAll, schema, runQuery,
  listMoves, getMove, listAbilities, getAbility, listItems, getItem,
} from './db/queries.js';
export { resetSpriteCaches } from './db/queries.js';
import type { AssetManager } from './assets.js';

export interface ServerOptions {
  host: string;
  /** 0 picks a free port; `start()` reports the one in use. */
  port: number;
  spriteRoot: string;
  itemSpriteRoot: string;
  /** Built React app to serve at `/`. Omit in dev, where Vite serves it. */
  webDist?: string;
  /** Sprite-pack downloader, only in the packaged app. */
  assets?: AssetManager;
}

const DEFAULTS = {
  spriteRoot: process.env.SPRITE_ROOT ?? './vendor/sprites/sprites/pokemon',
  itemSpriteRoot: process.env.ITEM_SPRITE_ROOT ?? './vendor/sprites/sprites/items',
};

/** Build the Hono app. Everything here is a thin wrapper over `queries.ts`. */
export function createApp(opts: ServerOptions): Hono {
  const app = new Hono();

  // The lists are static for the life of the process, so the browser may
  // keep them — except while sprites are still arriving, when the paths in
  // them are incomplete.
  const cacheable = () => !opts.assets || opts.assets.status().ready;
  const list = (build: () => unknown) => (c: any) => {
    if (cacheable()) c.header('Cache-Control', 'public, max-age=3600');
    else c.header('Cache-Control', 'no-store');
    return c.json(build());
  };
  app.get('/api/species', list(listAll));
  app.get('/api/moves', list(listMoves));
  app.get('/api/abilities', list(listAbilities));
  app.get('/api/items', list(listItems));

  // gen is optional: omitted -> the latest generation this form appears in;
  // unavailable -> the nearest one (payload.gen reports what was used).
  app.get('/api/species/:id', (c) => {
    const gen = parseGen(c.req.query('gen'));
    if (gen === null) return c.json({ error: 'bad gen' }, 400);
    const data = getSpecies(c.req.param('id'), gen);
    return data ? c.json(data) : c.json({ error: 'not found' }, 404);
  });

  // The other three dexes follow the same shape: a cached list, and a detail
  // endpoint that takes an optional gen and reports which one it served.
  for (const [route, get] of [
    ['/api/moves/:id', getMove],
    ['/api/abilities/:id', getAbility],
    ['/api/items/:id', getItem],
  ] as const) {
    app.get(route, (c) => {
      const gen = parseGen(c.req.query('gen'));
      if (gen === null) return c.json({ error: 'bad gen' }, 400);
      const data = get(c.req.param('id'), gen);
      return data ? c.json(data) : c.json({ error: 'not found' }, 404);
    });
  }

  app.get('/api/search', (c) => {
    const q = c.req.query('q') ?? '';
    const gen = Number(c.req.query('gen') ?? 9);
    return c.json(search(q, gen, 20));
  });

  app.get('/api/list/:gen', (c) => c.json(listByGen(Number(c.req.param('gen')))));

  // The SQL page. The database connection is read-only and runQuery() rejects
  // anything but a single SELECT-shaped statement.
  app.get('/api/schema', (c) => c.json(schema()));

  app.post('/api/query', async (c) => {
    const body = await c.req.json().catch(() => null);
    const sql = typeof body?.sql === 'string' ? body.sql : '';
    if (sql.length > 10_000) return c.json({ error: 'Query too long.' }, 400);
    try {
      return c.json(runQuery(sql));
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // Sprite packs: the packaged app downloads them on first run and the UI
  // shows progress. In dev they're on disk already and this reports as such.
  app.get('/api/assets/status', (c) => c.json(opts.assets ? opts.assets.status() : { managed: false }));
  app.post('/api/assets/start', (c) => {
    opts.assets?.start();
    return c.json(opts.assets ? opts.assets.status() : { managed: false });
  });

  app.use('/item-sprites/*', serveStatic({
    root: opts.itemSpriteRoot,
    rewriteRequestPath: (p) => p.replace(/^\/item-sprites/, ''),
  }));

  app.use('/sprites/*', serveStatic({
    root: opts.spriteRoot,
    rewriteRequestPath: (p) => p.replace(/^\/sprites/, ''),
  }));

  // The built frontend, with the SPA fallback so /pokemon/gliscor deep-links work.
  if (opts.webDist) {
    const index = fs.readFileSync(path.join(opts.webDist, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: opts.webDist }));
    app.get('/*', (c) => c.html(index));
  }

  return app;
}

/** Listen, resolving with the port actually bound. */
export function start(opts: ServerOptions): Promise<{ port: number; close: () => void }> {
  const app = createApp(opts);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: opts.port, hostname: opts.host }, (info) => {
      resolve({ port: info.port, close: () => server.close() });
    });
  });
}

const parseGen = (raw: string | undefined): number | undefined | null => {
  if (raw == null) return undefined;
  const gen = Number(raw);
  return Number.isInteger(gen) && gen >= 1 && gen <= 9 ? gen : null;
};

// `npm run dev:api` — the LAN-visible dev server. The packaged app imports
// start() instead and binds to localhost on a free port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start({ host: '0.0.0.0', port: 3000, ...DEFAULTS })
    .then(({ port }) => console.log(`http://localhost:${port}`));
}
