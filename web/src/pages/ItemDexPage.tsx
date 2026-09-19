import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ItemDexEntry } from '../types';
import { itemSpriteUrl, ROMAN } from '../lib/api';
import { useItems, matchNames } from '../lib/dex';
import { useSort } from '../lib/sort';
import { SortTh } from '../components/SortTh';
import { useUrlFilters } from '../lib/filters';
import { FilterInput, FilterSelect, ListHeader } from '../components/Filters';

type Key = 'name' | 'category' | 'cost' | 'genIntroduced';

/** Every item in the bag, filterable by name, pocket and category. */
export function ItemDexPage() {
  const items = useItems();
  const { get, set } = useUrlFilters();
  const q = get('q'), pocket = get('pocket'), category = get('cat');
  const { sort, toggle, apply } = useSort<ItemDexEntry, Key>((i, k) => i[k], { key: 'name', dir: 1 }, k => k === 'cost' || k === 'genIntroduced');

  useEffect(() => { document.title = 'Items · Pokédex'; }, []);

  const pockets = useMemo(() => items ? [...new Set(items.map(i => i.pocket).filter((p): p is string => !!p))].sort() : [], [items]);
  // categories narrow to the chosen pocket
  const categories = useMemo(() => items
    ? [...new Set(items.filter(i => !pocket || i.pocket === pocket).map(i => i.category).filter((c): c is string => !!c))].sort()
    : [], [items, pocket]);

  const rows = useMemo(() => {
    if (!items) return [];
    let list = matchNames(items, q);
    if (pocket) list = list.filter(i => i.pocket === pocket);
    if (category) list = list.filter(i => i.category === category);
    return q && sort.key === 'name' && sort.dir === 1 ? list : apply(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, pocket, category, sort]);

  if (!items) return <p className="py-20 text-center text-muted">Loading…</p>;

  return (
    <>
      <ListHeader title="Items" count={rows.length} total={items.length} noun="items">
        <FilterInput value={q} onChange={v => set('q', v)} placeholder="Filter by name…" />
        <FilterSelect value={pocket} onChange={v => { set('pocket', v); if (category) set('cat', ''); }} options={pockets} all="All pockets" label="Filter by bag pocket" />
        <FilterSelect value={category} onChange={v => set('cat', v)} options={categories} all="All categories" label="Filter by category" />
      </ListHeader>

      <div className="overflow-x-auto rounded-md border border-hair bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-hair text-xs text-muted">
              <th scope="col" className="w-12 py-2 pl-3" />
              <SortTh col="name" label="Name" sort={sort} onToggle={toggle} />
              <SortTh col="category" label="Category" sort={sort} onToggle={toggle} />
              <SortTh col="cost" label="Cost" sort={sort} onToggle={toggle} align="right" />
              <SortTh col="genIntroduced" label="Gen" sort={sort} onToggle={toggle} align="right" />
              <th scope="col" className="py-2 pr-3 text-left font-medium">Effect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(i => {
              const img = itemSpriteUrl(i.sprite);
              return (
                <tr key={i.id} className="border-t border-hair hover:bg-page">
                  <td className="py-0.5 pl-3 pr-1">
                    {img && <img src={img} alt="" width={30} height={30} loading="lazy" className="h-[30px] w-[30px]" style={{ imageRendering: 'pixelated' }} />}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <Link to={`/item/${i.id}`} className="font-medium text-accent hover:underline">{i.name}</Link>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{i.category ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{i.cost ? `₽${i.cost.toLocaleString()}` : '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-muted">{i.genIntroduced ? ROMAN[i.genIntroduced] : '—'}</td>
                  <td className="py-1.5 pr-3 text-muted">{i.shortDesc ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No items match.</p>}
      </div>
    </>
  );
}
