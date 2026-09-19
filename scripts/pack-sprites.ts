/**
 * pack-sprites.ts — zips the sprite folders the app reads into downloadable
 * packs, and writes the manifest the desktop app fetches them from.
 *
 *   build/packs/sprites-static.zip     per-gen sprites, thumbnails, shinies   (required)
 *   build/packs/sprites-artwork.zip    official artwork, the species hero      (required)
 *   build/packs/sprites-animated.zip   Black/White and Showdown GIFs           (optional)
 *   build/packs/manifest.json
 *
 * The folder list mirrors GEN_SPRITE_DIRS, GEN_ANIMATED_DIR and spritesFor()
 * in src/db/queries.ts — change one, change the other. Entries are stored
 * uncompressed (PNG and GIF don't shrink) so extraction is a straight copy.
 *
 * Run:  npm run pack:sprites          (PACK_BASE_URL sets where they'll be hosted)
 */

import { ZipArchive } from 'archiver';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SPRITE_ROOT = process.env.SPRITE_ROOT ?? './vendor/sprites/sprites/pokemon';
const OUT = './build/packs';
const BASE_URL = process.env.PACK_BASE_URL ?? 'https://github.com/remsuville/pokedex-assets/releases/download/sprites-v1/';

const GEN_DIRS = [
  'versions/generation-i/red-blue',
  'versions/generation-ii/crystal', 'versions/generation-ii/gold',
  'versions/generation-iii/emerald', 'versions/generation-iii/ruby-sapphire',
  'versions/generation-iv/platinum', 'versions/generation-iv/diamond-pearl',
  'versions/generation-v/black-white',
  'versions/generation-vi/x-y', 'versions/generation-vi/omegaruby-alphasapphire',
  'versions/generation-vii/ultra-sun-ultra-moon',
  'versions/generation-viii/brilliant-diamond-shining-pearl',
  'versions/generation-ix/scarlet-violet',
];
const ANIMATED_DIRS = ['versions/generation-v/black-white/animated', 'other/showdown'];

interface PackSpec { name: string; required: boolean; description: string; files: () => string[] }

/** Files directly in `dir` (no recursion) with the given extension, as sprite-root-relative paths. */
function filesIn(dir: string, ext: string): string[] {
  const abs = path.join(SPRITE_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => f.endsWith(ext)).map(f => path.posix.join(dir, f));
}

const PACKS: PackSpec[] = [
  {
    name: 'static', required: true,
    description: 'Game sprites for every generation, shinies and list thumbnails',
    files: () => [
      ...filesIn('', '.png'), ...filesIn('shiny', '.png'),
      ...GEN_DIRS.flatMap(d => [...filesIn(d, '.png'), ...filesIn(path.posix.join(d, 'shiny'), '.png')]),
    ],
  },
  {
    name: 'artwork', required: true,
    description: 'Official artwork shown on each species page',
    files: () => {
      const art = filesIn('other/official-artwork', '.png');
      // HOME renders only matter where there's no official artwork
      const have = new Set(art.map(f => path.basename(f)));
      return [...art, ...filesIn('other/home', '.png').filter(f => !have.has(path.basename(f)))];
    },
  },
  {
    name: 'animated', required: false,
    description: 'Animated sprites for gens V–IX',
    files: () => ANIMATED_DIRS.flatMap(d => [...filesIn(d, '.gif'), ...filesIn(path.posix.join(d, 'shiny'), '.gif')]),
  },
];

async function zip(files: string[], out: string): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(out);
    const archive = new ZipArchive({ store: true });
    stream.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(stream);
    for (const f of files) archive.file(path.join(SPRITE_ROOT, f), { name: f });
    archive.finalize();
  });
  return fs.statSync(out).size;
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = { version: 1, baseUrl: BASE_URL, packs: [] as any[] };

for (const p of PACKS) {
  const files = p.files();
  const file = `sprites-${p.name}.zip`;
  process.stdout.write(`${file}: ${files.length} files... `);
  const size = await zip(files, path.join(OUT, file));
  const hash = await sha256(path.join(OUT, file));
  console.log(`${(size / 1024 / 1024).toFixed(0)} MB`);
  manifest.packs.push({ name: p.name, file, size, sha256: hash, required: p.required, description: p.description });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${OUT}/manifest.json -> ${BASE_URL}`);
