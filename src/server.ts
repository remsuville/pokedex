import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import {
  getSpecies, search, listByGen, listAll, schema, runQuery,
  listMoves, getMove, listAbilities, getAbility, listItems, getItem,
} from './db/queries.js';

const app = new Hono();

// Static for the life of the process; let the browser keep it.
app.get('/api/species', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(listAll());
});

// gen is optional: omitted -> the latest generation this form appears in;
// unavailable -> the nearest one (payload.gen reports what was used).
app.get('/api/species/:id', (c) => {
  const raw = c.req.query('gen');
  const gen = raw == null ? undefined : Number(raw);
  if (gen !== undefined && (!Number.isInteger(gen) || gen < 1 || gen > 9)) return c.json({ error: 'bad gen' }, 400);
  const data = getSpecies(c.req.param('id'), gen);
  return data ? c.json(data) : c.json({ error: 'not found' }, 404);
});

// The other three dexes follow the same shape: a cached list, and a detail
// endpoint that takes an optional gen and reports which one it served.
const parseGen = (raw: string | undefined): number | undefined | null => {
  if (raw == null) return undefined;
  const gen = Number(raw);
  return Number.isInteger(gen) && gen >= 1 && gen <= 9 ? gen : null;
};

app.get('/api/moves', (c) => { c.header('Cache-Control', 'public, max-age=3600'); return c.json(listMoves()); });
app.get('/api/abilities', (c) => { c.header('Cache-Control', 'public, max-age=3600'); return c.json(listAbilities()); });
app.get('/api/items', (c) => { c.header('Cache-Control', 'public, max-age=3600'); return c.json(listItems()); });

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

app.use('/item-sprites/*', serveStatic({
  root: './vendor/sprites/sprites/items',
  rewriteRequestPath: (p) => p.replace(/^\/item-sprites/, ''),
}));

app.use('/sprites/*', serveStatic({
  root: './vendor/sprites/sprites/pokemon',
  rewriteRequestPath: (p) => p.replace(/^\/sprites/, ''),
}));

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' }, (i) =>
  console.log(`http://localhost:${i.port}`));
