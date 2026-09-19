import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AbilityDexEntry } from '../types';
import { ROMAN } from '../lib/api';
import { useAbilities, matchNames } from '../lib/dex';
import { useSort } from '../lib/sort';
import { SortTh } from '../components/SortTh';
import { useUrlFilters } from '../lib/filters';
import { FilterInput, FilterSelect, ListHeader } from '../components/Filters';

type Key = 'name' | 'pokemonCount' | 'genIntroduced';
const GENS = ['3', '4', '5', '6', '7', '8', '9'];

/** Every ability, with how many Pokémon carry it in its latest generation. */
export function AbilityDexPage() {
  const abilities = useAbilities();
  const { get, set } = useUrlFilters();
  const q = get('q'), gen = get('gen');
  const { sort, toggle, apply } = useSort<AbilityDexEntry, Key>((a, k) => a[k], { key: 'name', dir: 1 }, k => k !== 'name');

  useEffect(() => { document.title = 'Abilities · Pokédex'; }, []);

  const rows = useMemo(() => {
    if (!abilities) return [];
    let list = matchNames(abilities, q);
    if (gen) list = list.filter(a => a.genIntroduced === Number(gen));
    return q && sort.key === 'name' && sort.dir === 1 ? list : apply(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abilities, q, gen, sort]);

  if (!abilities) return <p className="py-20 text-center text-muted">Loading…</p>;

  return (
    <>
      <ListHeader title="Abilities" count={rows.length} total={abilities.length} noun="abilities" note="Pokémon counted in each ability's latest generation">
        <FilterInput value={q} onChange={v => set('q', v)} placeholder="Filter by name…" />
        <FilterSelect value={gen} onChange={v => set('gen', v)} options={GENS} all="Any generation" label="Filter by generation introduced" />
      </ListHeader>

      <div className="overflow-x-auto rounded-md border border-hair bg-panel">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hair text-xs text-muted">
              <SortTh col="name" label="Name" sort={sort} onToggle={toggle} first />
              <SortTh col="pokemonCount" label="Pokémon" sort={sort} onToggle={toggle} align="right" />
              <SortTh col="genIntroduced" label="Gen" sort={sort} onToggle={toggle} align="right" />
              <th scope="col" className="py-2 pr-3 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} className="border-t border-hair hover:bg-page">
                <td className="py-1.5 pl-3 pr-3 whitespace-nowrap">
                  <Link to={`/ability/${a.id}`} className="font-medium text-accent hover:underline">{a.name}</Link>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.pokemonCount}</td>
                <td className="py-1.5 pr-3 text-right text-muted">{a.genIntroduced ? ROMAN[a.genIntroduced] : '—'}</td>
                <td className="py-1.5 pr-3 text-muted">{a.shortDesc ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No abilities match.</p>}
      </div>
    </>
  );
}
