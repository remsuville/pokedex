import type { SpeciesPayload } from '../types';

export async function fetchSpecies(id: string, gen: number): Promise<SpeciesPayload> {
  const r = await fetch(`/api/species/${id}?gen=${gen}`);
  if (!r.ok) throw new Error(r.status === 404 ? `No data for ${id} in gen ${gen}` : `Request failed (${r.status})`);
  return r.json();
}

export async function searchSpecies(q: string, gen: number) {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&gen=${gen}`);
  if (!r.ok) return [];
  return r.json() as Promise<{ showdown_id: string; name: string; num: number; type1: string; type2: string | null }[]>;
}

export const spriteUrl = (p: string | null) => (p ? `/sprites/${p}` : null);

export const titleCase = (s: string) =>
  s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
