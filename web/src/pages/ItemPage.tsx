import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PokemonRef } from '../types';
import { fetchItem, itemSpriteUrl, spriteUrl, ROMAN } from '../lib/api';
import { useDetail } from '../lib/useDetail';
import { TypePill } from '../components/TypePill';
import { DataTable, Panel } from '../components/DataTable';
import { GenTabs } from '../components/GenTabs';
import { TabStrip } from '../components/TabStrip';
import { PokemonList } from '../components/PokemonList';
import { FlavorList } from '../components/FlavorList';

export function ItemPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const wantedGen = Number(params.get('gen')) || undefined;
  const { data, error } = useDetail(fetchItem, id, wantedGen);
  const [game, setGame] = useState<string | null>(null);

  useEffect(() => { document.title = data ? `${data.name} · Items` : 'Items'; }, [data]);

  if (error) return <p className="py-20 text-center text-muted">{error}</p>;
  if (!data || data.id !== id) return <p className="py-20 text-center text-muted">Loading…</p>;

  const d = data;
  const gen = d.gen;
  const b = d.battle;
  const img = itemSpriteUrl(d.sprite);
  const held = d.heldBy.find(g => g.version === game) ?? d.heldBy[0];
  const row = (label: string, value: React.ReactNode): [string, React.ReactNode] => [label, value];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-hair pb-5">
        <div className="flex items-center gap-4">
          {img && (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-hair bg-panel">
              <img src={img} alt="" width={48} height={48} className="h-12 w-12" style={{ imageRendering: 'pixelated' }} />
            </span>
          )}
          <div>
            <p className="text-sm text-muted">
              {[d.pocket, d.category].filter(Boolean).join(' · ')}
              {d.genIntroduced ? ` · introduced in Gen ${ROMAN[d.genIntroduced]}` : ''}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">{d.name}</h1>
          </div>
        </div>
        <GenTabs gens={d.availableGens} current={gen} onChange={g => setParams({ gen: String(g) })} />
      </header>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <Panel title="Item data">
            <DataTable rows={[
              row('Category', d.category ?? '—'),
              row('Pocket', d.pocket ?? '—'),
              row('Cost', d.cost ? <span className="tabular-nums">₽{d.cost.toLocaleString()}</span> : <span className="text-muted">Can't be bought</span>),
              row('Fling', d.flingPower
                ? <><span className="tabular-nums">{d.flingPower} power</span>{d.flingEffect && <span className="block text-xs text-muted">{d.flingEffect}</span>}</>
                : '—'),
              ...(b?.naturalGift ? [row('Natural Gift', <span className="flex items-center gap-1.5"><TypePill type={b.naturalGift.type} size="sm" /><span className="tabular-nums">{b.naturalGift.power} power</span></span>)] : []),
              ...(b?.megaEvolves ? [row('Mega Evolution', b.megaEvolves)] : []),
              ...(b?.zMoveType ? [row('Z-Move type', <TypePill type={b.zMoveType} size="sm" />)] : []),
              ...(b?.users.length ? [row('Made for', b.users.join(', '))] : []),
            ]} />
          </Panel>
        </div>

        <div className="min-w-0">
          <Panel title="Effect">
            {d.effect || d.shortEffect || b?.desc ? (
              <div className="py-3 text-sm">
                {d.effect ? <EffectProse text={d.effect} /> : d.shortEffect && <p className="font-medium">{d.shortEffect}</p>}
                {b?.desc && b.desc !== d.shortEffect && (
                  <p className={`leading-relaxed text-muted ${d.effect || d.shortEffect ? 'mt-3 border-t border-hair pt-3' : ''}`}>
                    <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">In battle, Gen {ROMAN[gen]}</span>
                    {b.desc}
                  </p>
                )}
              </div>
            ) : <p className="py-6 text-sm text-muted">No effect text recorded.</p>}
          </Panel>

          <Panel title={`Game descriptions (Gen ${ROMAN[gen]})`}>
            <FlavorList entries={d.flavorText} />
          </Panel>
        </div>
      </div>

      {d.evolves.length > 0 && (
        <Panel title={`Evolutions (Gen ${ROMAN[gen]})`}>
          <ul className="divide-y divide-hair">
            {d.evolves.map(e => (
              <li key={`${e.from.id}-${e.to.id}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <Mon p={e.from} gen={gen} />
                <span className="text-center text-muted">
                  <span aria-hidden className="block text-lg leading-none">→</span>
                  <span className="block text-xs">{e.method}</span>
                </span>
                <Mon p={e.to} gen={gen} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`Held by wild Pokémon (Gen ${ROMAN[gen]})`}>
        {held ? (
          <>
            <TabStrip tabs={d.heldBy.map(g => ({ key: g.version, label: g.version, count: g.rows.length }))} active={held.version} onChange={setGame} label="Game" />
            <PokemonList rows={held.rows} gen={gen} extra={{ label: 'Chance', align: 'right', render: r => `${r.rarity}%` }} />
          </>
        ) : (
          <p className="py-6 text-sm text-muted">
            {gen >= 8 ? 'Wild held-item data for this generation is not in the dataset.' : `No wild Pokémon holds ${d.name} in this generation.`}
          </p>
        )}
      </Panel>
    </>
  );
}

function Mon({ p, gen }: { p: PokemonRef; gen: number }) {
  const img = spriteUrl(p.sprite);
  return (
    <Link to={`/pokemon/${p.id}?gen=${gen}`} className="flex w-44 items-center gap-2 hover:text-accent">
      {img ? <img src={img} alt="" width={40} height={40} className="h-10 w-10" style={{ imageRendering: 'pixelated' }} /> : <span className="h-10 w-10" />}
      <span>
        <span className="block text-xs text-muted tabular-nums">#{String(p.num ?? 0).padStart(4, '0')}</span>
        <span className="block font-medium">{p.name}</span>
      </span>
    </Link>
  );
}

/**
 * veekun's effect prose is a light definition-list markup:
 *   Held in battle
 *   :   Holder restores HP...
 *
 *       A follow-on paragraph, indented.
 */
function EffectProse({ text }: { text: string }) {
  const blocks: { heading: string | null; body: string }[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const lines = raw.split('\n');
    const isDef = lines.length > 1 && lines[1].startsWith(':');
    const heading = isDef ? lines[0].trim() : null;
    const body = (isDef ? lines.slice(1) : lines).map(l => l.replace(/^:?\s*/, '')).join(' ').trim();
    if (body) blocks.push({ heading, body });
  }
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i}>
          {b.heading && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{b.heading}</p>}
          <p className={b.heading ? 'mt-0.5' : ''}>{b.body}</p>
        </div>
      ))}
    </div>
  );
}
