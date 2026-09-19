/**
 * assets.ts — downloads the sprite packs the packaged app needs, on first run.
 *
 * The installer ships without Pokémon sprites (1.5 GB); a manifest lists the
 * packs, and this fetches, verifies and unzips each one into the app's data
 * directory. Downloads resume: a partial file is continued with a Range
 * request, and a finished pack leaves a marker so it's never fetched twice.
 * The server exposes `status()` so the UI can show progress.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import extract from 'extract-zip';

export interface Pack {
  name: string;         // 'static'
  file: string;         // 'sprites-static.zip'
  size: number;
  sha256: string;
  required: boolean;    // the UI waits for required packs before showing the app
  description: string;
}

export interface Manifest {
  version: number;
  baseUrl: string;      // where `file` is fetched from
  packs: Pack[];
}

export type PackState = 'missing' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'error';

export interface PackStatus extends Pack {
  state: PackState;
  received: number;     // bytes on disk so far
  error: string | null;
}

export interface AssetStatus {
  managed: true;
  /** All required packs are ready — the app is usable. */
  ready: boolean;
  /** Something is still being fetched (required or not). */
  busy: boolean;
  packs: PackStatus[];
}

export class AssetManager {
  private packs: PackStatus[];
  private running = false;

  constructor(private manifest: Manifest, private dest: string, private onPackReady?: () => void) {
    fs.mkdirSync(dest, { recursive: true });
    this.packs = manifest.packs.map(p => ({
      ...p,
      state: fs.existsSync(this.marker(p)) ? 'ready' : 'missing',
      received: 0,
      error: null,
    }));
    for (const p of this.packs) if (p.state === 'missing') p.received = this.partialSize(p);
  }

  status(): AssetStatus {
    return {
      managed: true,
      ready: this.packs.every(p => !p.required || p.state === 'ready'),
      busy: this.running,
      packs: this.packs.map(p => ({ ...p })),
    };
  }

  /** Fetch every pack that isn't ready, required ones first. Safe to call repeatedly. */
  start(): void {
    if (this.running) return;
    this.running = true;
    (async () => {
      const todo = this.packs.filter(p => p.state !== 'ready').sort((a, b) => Number(b.required) - Number(a.required));
      for (const p of todo) {
        // a dropped connection just resumes; give up after a few tries and let the UI offer a retry
        for (let attempt = 1; ; attempt++) {
          try { await this.fetch(p); break; }
          catch (e: any) {
            const msg = String(e?.message ?? e);
            p.error = /terminated|ECONNRESET|ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg) ? 'Connection lost' : msg;
            if (attempt >= 3) { p.state = 'error'; break; }
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      }
      this.running = false;
    })();
  }

  private marker = (p: Pack) => path.join(this.dest, `.${p.name}.ready`);
  private partial = (p: Pack) => path.join(this.dest, `${p.file}.part`);
  private partialSize = (p: Pack) => { try { return fs.statSync(this.partial(p)).size; } catch { return 0; } };

  private async fetch(p: PackStatus): Promise<void> {
    const part = this.partial(p);
    p.error = null;

    // download, continuing a partial file if the server honours Range
    p.state = 'downloading';
    let have = this.partialSize(p);
    if (have > p.size) { fs.unlinkSync(part); have = 0; }
    if (have < p.size) {
      const res = await globalThis.fetch(`${this.manifest.baseUrl.replace(/\/$/, '')}/${p.file}`, {
        headers: have ? { Range: `bytes=${have}-` } : {},
      });
      if (!res.ok || !res.body) throw new Error(`${p.file}: HTTP ${res.status}`);
      const append = res.status === 206;
      if (!append) have = 0;
      p.received = have;
      const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
      await pipeline(
        res.body as any,
        new Writable({ write: (chunk, _enc, cb) => { p.received += chunk.length; out.write(chunk, cb); } }),
      );
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => err ? reject(err) : resolve()));
    }

    p.state = 'verifying';
    const hash = createHash('sha256');
    await pipeline(fs.createReadStream(part), new Writable({ write: (c, _e, cb) => { hash.update(c); cb(); } }));
    if (hash.digest('hex') !== p.sha256) {
      fs.unlinkSync(part);
      p.received = 0;
      throw new Error(`${p.file}: checksum mismatch, download discarded`);
    }

    p.state = 'extracting';
    await extract(part, { dir: this.dest });
    fs.unlinkSync(part);
    fs.writeFileSync(this.marker(p), new Date().toISOString());
    p.state = 'ready';
    this.onPackReady?.();
  }
}

export function readManifest(file: string): Manifest {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
