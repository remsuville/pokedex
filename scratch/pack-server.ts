// Serves build/packs over HTTP with Range support, to test the desktop
// app's first-run download locally:
//   npx tsx scratch/pack-server.ts            # http://127.0.0.1:8765/
//   POKEDEX_PACK_URL=http://127.0.0.1:8765/ npm start   (in desktop/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = './build/packs';
const PORT = Number(process.env.PORT ?? 8765);
// THROTTLE=1 sleeps between chunks so progress is visible; KILL_AFTER=n aborts the nth response early
const throttle = process.env.THROTTLE ? Number(process.env.THROTTLE) : 0;
let responses = 0;

http.createServer((req, res) => {
  const file = path.join(DIR, path.basename(req.url ?? ''));
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] ? Number(m[2]) : size - 1;
  res.writeHead(m ? 206 : 200, {
    'Content-Type': 'application/zip',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  console.log(`${req.method} ${req.url} ${req.headers.range ?? ''} -> ${m ? 206 : 200}`);
  const n = ++responses;
  const stream = fs.createReadStream(file, { start, end, highWaterMark: 1 << 20 });
  (async () => {
    let sent = 0;
    for await (const chunk of stream) {
      sent += chunk.length;
      if (process.env.KILL_AFTER && n === Number(process.env.KILL_AFTER) && sent > size / 3) {
        console.log(`  aborting response ${n} after ${sent} bytes`);
        res.destroy(); return;
      }
      if (!res.write(chunk)) await new Promise(r => res.once('drain', r));
      if (throttle) await new Promise(r => setTimeout(r, throttle));
    }
    res.end();
  })().catch(() => res.destroy());
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${DIR} on http://127.0.0.1:${PORT}/`));
