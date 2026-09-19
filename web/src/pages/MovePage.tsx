import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { MoveMethod } from '../types';
import { fetchMove, ROMAN } from '../lib/api';
import { fold } from '../lib/dex';
import { useDetail } from '../lib/useDetail';
import { TypePill } from '../components/TypePill';
import { DataTable, Panel } from '../components/DataTable';
import { GenTabs } from '../components/GenTabs';
import { TabStrip } from '../components/TabStrip';
import { PokemonList } from '../components/PokemonList';
import { FlavorList } from '../components/FlavorList';

const TARGET: Record<string, string> = {
  normal: 'One adjacent Pokémon', any: 'Any Pokémon', adjacentFoe: 'One adjacent foe', randomNormal: 'A random foe',
  allAdjacentFoes: 'All adjacent foes', allAdjacent: 'All adjacent Pokémon', all: 'Entire field',
  self: 'User', adjacentAlly: 'An adjacent ally', adjacentAllyOrSelf: 'User or an adjacent ally',
  allies: 'User and allies', allyTeam: "User's team", allySide: "User's side", foeSide: "Foes' side",
  scripted: 'The last Pokémon to hit the user',
};

/** Showdown flags worth surfacing; the rest are engine plumbing. */
const FLAGS: Record<string, string> = {
  contact: 'Makes contact', sound: 'Sound-based', punch: 'Punching move', bite: 'Biting move', pulse: 'Pulse move',
  bullet: 'Ballistic', powder: 'Powder move', slicing: 'Slicing move', wind: 'Wind move', dance: 'Dance move',
  protect: 'Blocked by Protect', reflectable: 'Bounced by Magic Coat', snatch: 'Stolen by Snatch',
  bypasssub: 'Bypasses Substitute', defrost: 'Thaws a frozen user', gravity: 'Unusable under Gravity',
  heal: 'Healing move', charge: 'Charges for a turn', recharge: 'Recharges next turn', distance: 'Hits non-adjacent Pokémon',
};

const METHOD_LABEL: Record<MoveMethod, (gen: number) => string> = {
  L: () => 'Level up', M: g => (g <= 7 ? 'TM / HM' : g === 8 ? 'TM / TR' : 'TM'), T: () => 'Tutor',
  E: () => 'Egg', S: () => 'Event', V: () => 'Transfer', D: () => 'Dream World', R: () => 'Special',
};
const METHOD_ORDER: MoveMethod[] = ['L', 'M', 'T', 'E', 'S', 'V', 'D', 'R'];

export function MovePage() {
  const { id: rawId = '' } = useParams();
  const id = fold(rawId);
  const [params, setParams] = useSearchParams();
  const wantedGen = Number(params.get('gen')) || undefined;
  const { data, error } = useDetail(fetchMove, id, wantedGen);
  const [method, setMethod] = useState<MoveMethod>('L');

  useEffect(() => { document.title = data ? `${data.name} · Moves` : 'Moves'; }, [data]);

  if (error) return <p className="py-20 text-center text-muted">{error}</p>;
  if (!data || data.id !== id) return <p className="py-20 text-center text-muted">Loading…</p>;

  const d = data;
  const gen = d.gen;
  const tabs = METHOD_ORDER.filter(m => d.learners[m]?.length).map(m => ({ key: m, label: METHOD_LABEL[m](gen), count: d.learners[m]!.length }));
  const current = tabs.find(t => t.key === method)?.key ?? tabs[0]?.key;
  const flags = d.flags.filter(f => FLAGS[f]).map(f => FLAGS[f]);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-hair pb-5">
        <div>
          <p className="text-sm text-muted">Move{d.genIntroduced ? ` · introduced in Gen ${ROMAN[d.genIntroduced]}` : ''}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{d.name}</h1>
          <div className="mt-2 flex items-center gap-1.5">
            {d.type && <TypePill type={d.type} />}
            {d.category && <span className="text-sm text-muted">{d.category}</span>}
          </div>
        </div>
        <GenTabs gens={d.availableGens} current={gen} onChange={g => setParams({ gen: String(g) })} />
      </header>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <Panel title={`Move data (Gen ${ROMAN[gen]})`}>
            <DataTable rows={[
              ['Type', d.type ? <TypePill type={d.type} size="sm" /> : '—'],
              ['Category', d.category ?? '—'],
              ['Power', <span className="tabular-nums">{d.power ?? '—'}</span>],
              ['Accuracy', <span className="tabular-nums">{d.accuracy != null ? `${d.accuracy}%` : 'Never misses'}</span>],
              ['PP', <span className="tabular-nums">{d.pp ?? '—'}{d.pp ? <span className="text-muted"> (max {Math.floor(d.pp * 1.6)})</span> : null}</span>],
              ['Priority', <span className="tabular-nums">{d.priority > 0 ? `+${d.priority}` : d.priority}</span>],
              ['Target', d.target ? TARGET[d.target] ?? d.target : '—'],
              ...(d.machine ? [['Machine', d.machine] as [string, React.ReactNode]] : []),
              ...(d.secondaryChance ? [['Effect chance', `${d.secondaryChance}%`] as [string, React.ReactNode]] : []),
              ...(d.critRatio && d.critRatio > 1 ? [['Critical hits', 'High ratio'] as [string, React.ReactNode]] : []),
              ...(d.zPower ? [['Z-Move power', <span className="tabular-nums">{d.zPower}</span>] as [string, React.ReactNode]] : []),
              ...(d.maxPower ? [['Max Move power', <span className="tabular-nums">{d.maxPower}</span>] as [string, React.ReactNode]] : []),
              ...(flags.length ? [['Properties', flags.join(', ')] as [string, React.ReactNode]] : []),
            ]} />
          </Panel>
        </div>

        <div className="min-w-0">
          <Panel title="Effect">
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
      </div>

      <Panel title={`Learnt by (Gen ${ROMAN[gen]})`}>
        {current ? (
          <>
            <TabStrip tabs={tabs} active={current} onChange={setMethod} label="Learn method" />
            <PokemonList
              rows={d.learners[current]!}
              gen={gen}
              extra={current === 'L'
                ? { label: 'Level', align: 'right', render: r => r.levels.join(', ') || '—' }
                : undefined}
            />
          </>
        ) : <p className="py-6 text-sm text-muted">No Pokémon learns {d.name} in this generation.</p>}
      </Panel>
    </>
  );
}
