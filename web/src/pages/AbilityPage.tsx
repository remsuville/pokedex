import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchAbility, ROMAN } from '../lib/api';
import { fold } from '../lib/dex';
import { useDetail } from '../lib/useDetail';
import { Panel } from '../components/DataTable';
import { GenTabs } from '../components/GenTabs';
import { PokemonList } from '../components/PokemonList';
import { FlavorList } from '../components/FlavorList';

const SLOT: Record<string, string> = { '0': '1st', '1': '2nd', H: 'Hidden' };

export function AbilityPage() {
  const { id: rawId = '' } = useParams();
  const id = fold(rawId);
  const [params, setParams] = useSearchParams();
  const wantedGen = Number(params.get('gen')) || undefined;
  const { data, error } = useDetail(fetchAbility, id, wantedGen);

  useEffect(() => { document.title = data ? `${data.name} · Abilities` : 'Abilities'; }, [data]);

  if (error) return <p className="py-20 text-center text-muted">{error}</p>;
  if (!data || data.id !== id) return <p className="py-20 text-center text-muted">Loading…</p>;

  const d = data;
  const gen = d.gen;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-hair pb-5">
        <div>
          <p className="text-sm text-muted">Ability{d.genIntroduced ? ` · introduced in Gen ${ROMAN[d.genIntroduced]}` : ''}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{d.name}</h1>
        </div>
        <GenTabs gens={d.availableGens} current={gen} onChange={g => setParams({ gen: String(g) })} />
      </header>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Panel title={`Effect (Gen ${ROMAN[gen]})`}>
          {d.shortDesc || d.desc ? (
            <div className="py-3 text-sm">
              <p className="font-medium">{d.shortDesc ?? d.desc}</p>
              {d.desc && d.desc !== d.shortDesc && <p className="mt-2 leading-relaxed text-muted">{d.desc}</p>}
            </div>
          ) : <p className="py-6 text-sm text-muted">No effect text for this generation.</p>}
        </Panel>

        <Panel title={`Game descriptions (Gen ${ROMAN[gen]})`}>
          <FlavorList entries={d.flavorText} />
        </Panel>
      </div>

      <Panel title={`Pokémon with ${d.name} (Gen ${ROMAN[gen]}) · ${d.pokemon.length}`}>
        <PokemonList
          rows={d.pokemon}
          gen={gen}
          extra={{ label: 'Slot', render: r => r.slot === 'H' ? <span className="text-muted">Hidden</span> : SLOT[r.slot] }}
          empty={`No Pokémon has ${d.name} in this generation.`}
        />
      </Panel>
    </>
  );
}
