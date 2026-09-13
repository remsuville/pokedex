import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { getSpecies, search, listByGen } from './db/queries.js';

const app = new Hono();

app.get('/api/species/:id', (c) => {
  const gen = Number(c.req.query('gen') ?? 9);
  if (!Number.isInteger(gen) || gen < 1 || gen > 9) return c.json({ error: 'bad gen' }, 400);
  const data = getSpecies(c.req.param('id'), gen);
  return data ? c.json(data) : c.json({ error: 'not found' }, 404);
});

app.get('/api/search', (c) => {
  const q = c.req.query('q') ?? '';
  const gen = Number(c.req.query('gen') ?? 9);
  return c.json(search(q, gen, 20));
});

app.get('/api/list/:gen', (c) => c.json(listByGen(Number(c.req.param('gen')))));

app.use('/sprites/*', serveStatic({
  root: './vendor/sprites/sprites/pokemon',
  rewriteRequestPath: (p) => p.replace(/^\/sprites/, ''),
}));

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' }, (i) =>
  console.log(`http://localhost:${i.port}`));
