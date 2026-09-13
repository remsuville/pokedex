import { useEffect, useState } from 'react';
import type { SpeciesPayload } from './types';
import { fetchSpecies, spriteUrl, titleCase } from './lib/api';
import { TypePill } from './components/TypePill';
import { DataTable, Panel } from './components/DataTable';
import { StatBars } from './components/StatBars';
import { MoveTable } from './components/MoveTable';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

export default function App() {
  const [id] = useState('gliscor');
  const [gen, setGen] = useState(9);
  const [data, setData] = useState<SpeciesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetchSpecies(id, gen)
      .then(d => live && setData(d))
      .catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [id, gen]);

  if (error) return <Shell><p className="py-20 text-center text-muted">{error}</p></Shell>;
  if (!data) return <Shell><p className="py-20 text-center text-muted">Loading…</p></Shell>;

  const d = data;
  const usingArtwork = Boolean(d.sprites.artwork);
  const art = spriteUrl(d.sprites.artwork) ?? spriteUrl(d.sprites.front);
  const flavor = d.flavorText[d.flavorText.length - 1];

  return (
    <Shell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-hair pb-5">
        <div>
          <p className="text-sm text-muted tabular-nums">
            #{String(d.num ?? 0).padStart(4, '0')}{d.genus ? ` · ${d.genus}` : ''}
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight">{d.name}</h1>
          <div className="mt-2 flex gap-1.5">{d.types.map(t => <TypePill key={t} type={t} />)}</div>
        </div>

        <nav className="flex flex-wrap gap-1" aria-label="Generation">
          {d.availableGens.map(g => (
            <button
              key={g}
              onClick={() => setGen(g)}
              aria-current={g === gen ? 'true' : undefined}
              className={`rounded-[4px] px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                g === gen
                  ? 'bg-accent text-white'
                  : 'border border-hair bg-panel text-muted hover:border-accent hover:text-accent'
              }`}
            >
              Gen {ROMAN[g]}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid gap-x-10 lg:grid-cols-[280px_1fr]">
        <aside className="mb-8">
          {art && (
            <img src={art} alt={d.name} width={280} height={280}
                 className="mx-auto w-full max-w-[280px]" style={{ imageRendering: usingArtwork ? 'auto' : 'pixelated' }} />
          )}
          {flavor && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {flavor.text}
              <span className="ml-1 text-xs">— {titleCase(flavor.version)}</span>
            </p>
          )}
        </aside>

        <div className="min-w-0">
          <Panel title="Pokédex data">
            <DataTable rows={[
              ['National №', <span className="tabular-nums">{d.num}</span>],
              ['Type', <span className="flex gap-1.5">{d.types.map(t => <TypePill key={t} type={t} size="sm" />)}</span>],
              ['Species', d.genus ?? '—'],
              ['Height', d.dimensions.heightM != null ? `${d.dimensions.heightM} m` : '—'],
              ['Weight', d.dimensions.weightKg != null ? `${d.dimensions.weightKg} kg` : '—'],
              ['Abilities', <ol className="space-y-0.5">
                {d.abilities.map(a => (
                  <li key={a.slot}>
                    {a.name}{a.slot === 'H' && <span className="ml-1 text-xs text-muted">(hidden)</span>}
                  </li>
                ))}
              </ol>],
            ]} />
          </Panel>

          <Panel title="Training">
            <DataTable rows={[
              ['EV yield', d.training.evYield.length
                ? d.training.evYield.map(e => `${e.value} ${titleCase(e.stat)}`).join(', ') : '—'],
              ['Catch rate', <>
                <span className="tabular-nums">{d.training.catchRate ?? '—'}</span>
                {d.training.catchRatePct != null &&
                  <span className="ml-1.5 text-muted">({d.training.catchRatePct}% with PokéBall, full HP)</span>}
              </>],
              ['Base friendship', <span className="tabular-nums">{d.training.baseFriendship ?? '—'}</span>],
              ['Base Exp.', <span className="tabular-nums">{d.training.baseExp ?? '—'}</span>],
              ['Growth rate', d.training.growthRate ? titleCase(d.training.growthRate) : '—'],
            ]} />
          </Panel>

          <Panel title="Breeding">
            <DataTable rows={[
              ['Egg groups', d.breeding.eggGroups.join(', ') || '—'],
              ['Gender', d.breeding.genderless ? 'Genderless' : <>
                <span style={{ color: 'var(--t-water)' }}>{d.breeding.malePct}% male</span>
                <span className="text-muted">, </span>
                <span style={{ color: 'var(--t-fairy)' }}>{d.breeding.femalePct}% female</span>
              </>],
              ['Egg cycles', <>
                <span className="tabular-nums">{d.breeding.eggCycles ?? '—'}</span>
                {d.breeding.eggStepsMin != null &&
                  <span className="ml-1.5 text-muted tabular-nums">
                    ({d.breeding.eggStepsMin.toLocaleString()}–{d.breeding.eggStepsMax!.toLocaleString()} steps)
                  </span>}
              </>],
            ]} />
          </Panel>

          <Panel title="Base stats"><StatBars stats={d.stats} bst={d.bst} /></Panel>
          <Panel title={`Moves learnt by level up (Gen ${ROMAN[gen]})`}>
            <MoveTable moves={d.levelUpMoves} />
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>;
}
