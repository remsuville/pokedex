import type { DexEntry, SpeciesPayload } from '../types';

/** gen omitted -> latest available; the payload's `gen` says what was served. */
export async function fetchSpecies(id: string, gen?: number): Promise<SpeciesPayload> {
  const r = await fetch(`/api/species/${id}${gen ? `?gen=${gen}` : ''}`);
  if (!r.ok) throw new Error(r.status === 404 ? `No Pokémon called “${id}”` : `Request failed (${r.status})`);
  return r.json();
}

// The dex list is static for the session: fetch once, share the promise so
// concurrent callers (header search + list page) don't double-request.
let dexPromise: Promise<DexEntry[]> | null = null;

export function fetchDex(): Promise<DexEntry[]> {
  if (!dexPromise) {
    dexPromise = fetch('/api/species').then(r => {
      if (!r.ok) { dexPromise = null; throw new Error(`Request failed (${r.status})`); }
      return r.json();
    });
  }
  return dexPromise;
}

export const spriteUrl = (p: string | null) => (p ? `/sprites/${p}` : null);

export const titleCase = (s: string) =>
  s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
