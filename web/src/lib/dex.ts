import { useEffect, useState } from 'react';
import type { AbilityDexEntry, DexEntry, ItemDexEntry, MoveDexEntry } from '../types';
import { fetchAbilities, fetchDex, fetchItems, fetchMoves } from './api';

/** A session-static list, loaded once. `null` until it arrives. */
function useList<T>(load: () => Promise<T[]>): T[] | null {
  const [list, setList] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    load().then(d => live && setList(d)).catch(() => {});
    return () => { live = false; };
  }, [load]);
  return list;
}

export const useDex = () => useList<DexEntry>(fetchDex);
export const useMoves = () => useList<MoveDexEntry>(fetchMoves);
export const useAbilities = () => useList<AbilityDexEntry>(fetchAbilities);
export const useItems = () => useList<ItemDexEntry>(fetchItems);

/** Strip accents/punctuation so "farfetch'd", "Flabébé" and "mr mime" all match. */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Name search over any list. Prefix matches rank above substring matches so
 * typing "char" gives Charmander before Charjabug, Charm before Recharge.
 */
export function matchNames<T extends { name: string }>(list: T[], query: string, limit = Infinity): T[] {
  const q = fold(query);
  if (!q) return list.slice(0, limit);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const e of list) {
    const f = fold(e.name);
    if (f.startsWith(q)) starts.push(e);
    else if (f.includes(q)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Name-or-number search over the national dex: a pure number matches the
 * dex number exactly (or as a prefix, so "25" also offers 250–259).
 */
export function matchDex(dex: DexEntry[], query: string, limit = Infinity): DexEntry[] {
  const q = fold(query);
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const exact = dex.filter(e => e.num === n);
    const prefix = dex.filter(e => e.num !== n && String(e.num).startsWith(q));
    return [...exact, ...prefix].slice(0, limit);
  }
  return matchNames(dex, query, limit);
}
