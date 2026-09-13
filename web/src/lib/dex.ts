import { useEffect, useState } from 'react';
import type { DexEntry } from '../types';
import { fetchDex } from './api';

/** The national dex list, loaded once per session. `null` until it arrives. */
export function useDex(): DexEntry[] | null {
  const [dex, setDex] = useState<DexEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchDex().then(d => live && setDex(d)).catch(() => {});
    return () => { live = false; };
  }, []);
  return dex;
}

/** Strip accents/punctuation so "farfetch'd", "Flabébé" and "mr mime" all match. */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Name-or-number search. Prefix matches rank above substring matches so
 * typing "char" gives Charmander before Charjabug; a pure number matches the
 * dex number exactly (or as a prefix, so "25" also offers 250–259).
 */
export function matchDex(dex: DexEntry[], query: string, limit = Infinity): DexEntry[] {
  const q = fold(query);
  if (!q) return dex.slice(0, limit);

  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const exact = dex.filter(e => e.num === n);
    const prefix = dex.filter(e => e.num !== n && String(e.num).startsWith(q));
    return [...exact, ...prefix].slice(0, limit);
  }

  const starts: DexEntry[] = [];
  const contains: DexEntry[] = [];
  for (const e of dex) {
    const f = fold(e.name);
    if (f.startsWith(q)) starts.push(e);
    else if (f.includes(q)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}
