import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { SpeciesPayload } from '../types';
import { fetchSpecies, spriteUrl, titleCase, ROMAN } from '../lib/api';
import { useDex, fold } from '../lib/dex';
import { TypePill } from '../components/TypePill';
import { DataTable, Panel } from '../components/DataTable';
import { StatBars } from '../components/StatBars';
import { MovesPanel } from '../components/MovesPanel';
import { EncounterPanel } from '../components/EncounterPanel';
import { TypeDefenses } from '../components/TypeDefenses';
import { EvolutionChain } from '../components/EvolutionChain';

const link = (id: string, gen: number) => `/pokemon/${id}?gen=${gen}`;

export function SpeciesPage() {
  const { id: rawId = '' } = useParams();
  const id = fold(rawId);   // /pokemon/Mr-Mime -> mrmime, matching Showdown IDs
  const [params, setParams] = useSearchParams();
  // Omitted -> the API picks the latest generation this form appears in.
  const wantedGen = Number(params.get('gen')) || undefined;

  const dex = useDex();
  const [data, setData] = useState<SpeciesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSpecies(id, wantedGen)
      .then(d => { if (live) { setData(d); setError(null); } })
      .catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [id, wantedGen]);

  useEffect(() => {
    document.title = data ? `${data.name} · Pokédex` : 'Pokédex';
  }, [data]);

  if (error) return <p className="py-20 text-center text-muted">{error}</p>;
  if (!data || data.id !== id) return <p className="py-20 text-center text-muted">Loading…</p>;

  const d = data;
  // Tabs reflect what the API actually served: asking for gen 9 on a species
  // absent from Scarlet/Violet falls back to its nearest generation.
  const gen = d.gen;
  const usingArtwork = Boolean(d.sprites.artwork);
  const art = spriteUrl(d.sprites.artwork) ?? spriteUrl(d.sprites.front);
  const flavor = d.flavorText[d.flavorText.length - 1];

  const idx = dex && d.num != null ? dex.findIndex(e => e.num === d.num) : -1;
  const prev = idx > 0 ? dex![idx - 1] : null;
  const next = idx >= 0 && idx < dex!.length - 1 ? dex![idx + 1] : null;

  return (
    <>
      <nav className="mb-4 flex justify-between text-sm text-muted" aria-label="Adjacent Pokémon">
        <span>{prev && <Link to={link(prev.id, gen)} className="hover:text-accent">← #{String(prev.num).padStart(4, '0')} {prev.name}</Link>}</span>
        <span>{next && <Link to={link(next.id, gen)} className="hover:text-accent">#{String(next.num).padStart(4, '0')} {next.name} →</Link>}</span>
      </nav>

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
              onClick={() => setParams({ gen: String(g) })}
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

      {d.forms.length > 1 && (
        <nav className="-mt-2 mb-6 flex flex-wrap gap-1" aria-label="Forms">
          {d.forms.map(f => (
            <Link
              key={f.id}
              to={link(f.id, gen)}
              aria-current={f.id === d.id ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                f.id === d.id ? 'bg-ink text-white' : 'border border-hair bg-panel text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {f.forme ?? 'Base'}
            </Link>
          ))}
        </nav>
      )}

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

          <Panel title={`Evolution chart (Gen ${ROMAN[gen]})`}>
            <EvolutionChain root={d.evolution} currentId={d.id} gen={gen} />
          </Panel>

          <Panel title="Base stats"><StatBars stats={d.stats} bst={d.bst} /></Panel>

          <Panel title={`Type defenses (Gen ${ROMAN[gen]})`}>
            <p className="pt-3 text-sm text-muted">
              Damage taken by {d.name} from each attacking type. Type-based only — abilities such as Levitate are not applied.
            </p>
            <TypeDefenses defenses={d.typeDefenses} />
          </Panel>
          <EncounterPanel games={d.encounters} via={d.encountersVia} gen={gen} name={d.name} />
          <MovesPanel moves={d.moves} eggMovesVia={d.eggMovesVia} gen={gen} name={d.name} />
        </div>
      </div>
    </>
  );
}
