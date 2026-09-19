import type {
  AbilityDexEntry, AbilityPayload, DexEntry, ItemDexEntry, ItemPayload,
  MoveDexEntry, MovePayload, SpeciesPayload,
} from '../types';

async function getJson<T>(url: string, notFound: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 404 ? notFound : `Request failed (${r.status})`);
  return r.json();
}

const withGen = (gen?: number) => (gen ? `?gen=${gen}` : '');

/** gen omitted -> latest available; the payload's `gen` says what was served. */
export const fetchSpecies = (id: string, gen?: number) =>
  getJson<SpeciesPayload>(`/api/species/${id}${withGen(gen)}`, `No Pokémon called “${id}”`);
export const fetchMove = (id: string, gen?: number) =>
  getJson<MovePayload>(`/api/moves/${id}${withGen(gen)}`, `No move called “${id}”`);
export const fetchAbility = (id: string, gen?: number) =>
  getJson<AbilityPayload>(`/api/abilities/${id}${withGen(gen)}`, `No ability called “${id}”`);
export const fetchItem = (id: string, gen?: number) =>
  getJson<ItemPayload>(`/api/items/${id}${withGen(gen)}`, `No item called “${id}”`);

// The lists are static for the session: fetch once, share the promise so
// concurrent callers (header search + list page) don't double-request.
function cachedList<T>(url: string): () => Promise<T[]> {
  let promise: Promise<T[]> | null = null;
  return () => promise ??= fetch(url).then(r => {
    if (!r.ok) { promise = null; throw new Error(`Request failed (${r.status})`); }
    return r.json();
  });
}

export const fetchDex = cachedList<DexEntry>('/api/species');
export const fetchMoves = cachedList<MoveDexEntry>('/api/moves');
export const fetchAbilities = cachedList<AbilityDexEntry>('/api/abilities');
export const fetchItems = cachedList<ItemDexEntry>('/api/items');

export const spriteUrl = (p: string | null) => (p ? `/sprites/${p}` : null);
export const itemSpriteUrl = (p: string | null) => (p ? `/item-sprites/${p}` : null);

export const titleCase = (s: string) =>
  s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
