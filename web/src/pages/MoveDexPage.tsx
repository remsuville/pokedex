import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { MoveDexEntry } from '../types';
import { ROMAN } from '../lib/api';
import { useMoves, matchNames } from '../lib/dex';
import { useSort } from '../lib/sort';
import { TypePill } from '../components/TypePill';
import { SortTh } from '../components/SortTh';
import { useUrlFilters } from '../lib/filters';
import { FilterInput, FilterSelect, ListHeader } from '../components/Filters';

type Key = 'name' | 'type' | 'category' | 'power' | 'accuracy' | 'pp' | 'genIntroduced';
const NUMERIC = new Set<Key>(['power', 'accuracy', 'pp', 'genIntroduced']);
const CATEGORIES = ['Physical', 'Special', 'Status'];

/** Every move, at its latest generation, filterable by name/type/category. */
export function MoveDexPage() {
  const moves = useMoves();
  const { get, set } = useUrlFilters();
  const q = get('q'), type = get('type'), category = get('cat');
  const { sort, toggle, apply } = useSort<MoveDexEntry, Key>((m, k) => m[k], { key: 'name', dir: 1 }, k => NUMERIC.has(k));

  useEffect(() => { document.title = 'Moves · Pokédex'; }, []);

  const types = useMemo(() => moves ? [...new Set(moves.map(m => m.type).filter((t): t is string => !!t))].sort() : [], [moves]);

  const rows = useMemo(() => {
    if (!moves) return [];
    let list = matchNames(moves, q);
    if (type) list = list.filter(m => m.type === type);
    if (category) list = list.filter(m => m.category === category);
    // matchNames already ranks by relevance; only re-order when the user picked a column
    return q && sort.key === 'name' && sort.dir === 1 ? list : apply(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, q, type, category, sort]);

  if (!moves) return <p className="py-20 text-center text-muted">Loading…</p>;

  const th = (col: Key, label: string, align?: 'left' | 'right', first?: boolean) =>
    <SortTh col={col} label={label} sort={sort} onToggle={toggle} align={align} first={first} />;

  return (
    <>
      <ListHeader title="Moves" count={rows.length} total={moves.length} noun="moves" note="as of each move's latest generation">
        <FilterInput value={q} onChange={v => set('q', v)} placeholder="Filter by name…" />
        <FilterSelect value={type} onChange={v => set('type', v)} options={types} all="All types" label="Filter by type" />
        <FilterSelect value={category} onChange={v => set('cat', v)} options={CATEGORIES} all="All categories" label="Filter by category" />
      </ListHeader>

      <div className="overflow-x-auto rounded-md border border-hair bg-panel">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-hair text-xs text-muted">
              {th('name', 'Name', 'left', true)}
              {th('type', 'Type')}
              {th('category', 'Cat.')}
              {th('power', 'Power', 'right')}
              {th('accuracy', 'Acc.', 'right')}
              {th('pp', 'PP', 'right')}
              {th('genIntroduced', 'Gen', 'right')}
              <th scope="col" className="py-2 pr-3 text-left font-medium">Effect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id} className="border-t border-hair hover:bg-page">
                <td className="py-1.5 pl-3 pr-3 whitespace-nowrap">
                  <Link to={`/move/${m.id}`} className="font-medium text-accent hover:underline">{m.name}</Link>
                </td>
                <td className="py-1.5 pr-3">{m.type ? <TypePill type={m.type} size="sm" /> : '—'}</td>
                <td className="py-1.5 pr-3 text-muted">{m.category ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.power ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.accuracy ?? '∞'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.pp ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right text-muted">{m.genIntroduced ? ROMAN[m.genIntroduced] : '—'}</td>
                <td className="py-1.5 pr-3 text-muted">{m.shortDesc ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No moves match.</p>}
      </div>
    </>
  );
}
