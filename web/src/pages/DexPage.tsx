import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DexEntry, StatKey } from '../types';
import { spriteUrl, ROMAN } from '../lib/api';
import { useDex, matchDex } from '../lib/dex';
import { TypePill } from '../components/TypePill';

type SortKey = 'num' | 'name' | 'bst' | StatKey;

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'num',  label: '#',       numeric: true },
  { key: 'name', label: 'Name',    numeric: false },
  { key: 'bst',  label: 'Total',   numeric: true },
  { key: 'hp',   label: 'HP',      numeric: true },
  { key: 'atk',  label: 'Attack',  numeric: true },
  { key: 'def',  label: 'Defense', numeric: true },
  { key: 'spa',  label: 'Sp. Atk', numeric: true },
  { key: 'spd',  label: 'Sp. Def', numeric: true },
  { key: 'spe',  label: 'Speed',   numeric: true },
];

const value = (e: DexEntry, k: SortKey): number | string =>
  k === 'num' || k === 'name' || k === 'bst' ? e[k] : e.stats[k];

/** The national dex: every species, filterable by name/number/type, sortable by any column. */
export function DexPage() {
  const dex = useDex();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'num', dir: 1 });

  useEffect(() => { document.title = 'Pokédex'; }, []);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const types = useMemo(
    () => dex ? [...new Set(dex.flatMap(e => e.types))].sort() : [],
    [dex],
  );

  const rows = useMemo(() => {
    if (!dex) return [];
    let list = matchDex(dex, q);
    if (type) list = list.filter(e => e.types.includes(type));
    const { key, dir } = sort;
    // matchDex already ranks by relevance; only re-order when the user picked a column
    if (key !== 'num' || dir !== 1 || !q) {
      list = [...list].sort((a, b) => {
        const x = value(a, key), y = value(b, key);
        return (x < y ? -1 : x > y ? 1 : a.num - b.num) * dir;
      });
    }
    return list;
  }, [dex, q, type, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key
      ? { key, dir: s.dir === 1 ? -1 : 1 }
      : { key, dir: key === 'num' || key === 'name' ? 1 : -1 });   // stats: biggest first

  if (!dex) return <p className="py-20 text-center text-muted">Loading…</p>;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">National Pokédex</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length === dex.length ? `${dex.length} Pokémon` : `${rows.length} of ${dex.length} Pokémon`}
            {' · '}stats and types as of each Pokémon's latest generation
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Filter by name or number…"
            value={q}
            onChange={e => setParam('q', e.target.value)}
            className="w-56 rounded-md border border-hair bg-panel px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <select
            value={type}
            onChange={e => setParam('type', e.target.value)}
            aria-label="Filter by type"
            className="rounded-md border border-hair bg-panel px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </header>

      <div className="overflow-x-auto rounded-md border border-hair bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-hair text-xs text-muted">
              {COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  colSpan={c.key === 'num' ? 2 : 1}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  className={`py-2 font-medium ${c.numeric ? 'text-right' : 'text-left'} ${i === 0 ? 'pl-3' : ''} pr-3`}
                >
                  <button onClick={() => toggleSort(c.key)} className="hover:text-ink">
                    {c.label}{sort.key === c.key && <span className="ml-0.5">{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              <th scope="col" className="py-2 pr-3 text-left font-medium">Type</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Gen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id} className="border-t border-hair hover:bg-page">
                <td className="w-14 py-1 pl-3 pr-1 text-right tabular-nums text-muted">{String(e.num).padStart(4, '0')}</td>
                <td className="w-12 py-0.5 pr-3">
                  {e.sprite && (
                    <img src={spriteUrl(e.sprite)!} alt="" width={40} height={40} loading="lazy"
                         className="h-10 w-10" style={{ imageRendering: 'pixelated' }} />
                  )}
                </td>
                <td className="py-1 pr-3">
                  <Link to={`/pokemon/${e.id}`} className="font-medium text-accent hover:underline">{e.name}</Link>
                </td>
                <td className="py-1 pr-3 text-right tabular-nums font-semibold">{e.bst}</td>
                {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatKey[]).map(k => (
                  <td key={k} className="py-1 pr-3 text-right tabular-nums">{e.stats[k]}</td>
                ))}
                <td className="py-1 pr-3">
                  <span className="flex gap-1">{e.types.map(t => <TypePill key={t} type={t} size="sm" />)}</span>
                </td>
                <td className="py-1 pr-3 text-right text-muted">{e.genIntroduced ? ROMAN[e.genIntroduced] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No Pokémon match.</p>}
      </div>
    </>
  );
}
