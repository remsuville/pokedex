import { useState } from 'react';
import type { EncounterGame } from '../types';
import { ROMAN, titleCase } from '../lib/api';
import { Panel } from './DataTable';

interface Props { games: EncounterGame[]; via: string | null; gen: number; name: string }

/** Friendlier names for veekun's method identifiers; anything else is title-cased. */
const METHOD_LABEL: Record<string, string> = {
  'walk': 'Walking', 'surf': 'Surfing', 'old-rod': 'Old Rod', 'good-rod': 'Good Rod', 'super-rod': 'Super Rod',
  'rock-smash': 'Rock Smash', 'headbutt': 'Headbutt', 'headbutt-low': 'Headbutt', 'headbutt-normal': 'Headbutt',
  'headbutt-high': 'Headbutt', 'dark-grass': 'Dark grass', 'grass-spots': 'Rustling grass', 'cave-spots': 'Dust cloud',
  'bridge-spots': 'Bridge shadow', 'surf-spots': 'Rippling water', 'super-rod-spots': 'Rippling water (Super Rod)',
  'gift': 'Gift', 'gift-egg': 'Gift egg', 'static': 'Stationary', 'npc-trade': 'In-game trade', 'sos': 'SOS call',
  'island-scan': 'Island Scan', 'horde': 'Horde', 'hidden-grotto': 'Hidden Grotto', 'honey-tree': 'Honey tree',
  'overworld': 'Overworld', 'overworld-water': 'Overworld (water)', 'overworld-flying': 'Overworld (flying)',
  'overworld-special': 'Overworld (rare)', 'overworld-water-special': 'Overworld (water, rare)',
  'overworld-flying-special': 'Overworld (flying, rare)', 'max-raid': 'Max Raid', 'dynamax-adventure': 'Dynamax Adventure',
  'roaming-grass': 'Roaming', 'roaming-water': 'Roaming (water)', 'wanderer': 'Wandering', 'wanderer-water': 'Wandering (water)',
  'pokeflute': 'Poké Flute', 'devon-scope': 'Devon Scope', 'squirt-bottle': 'Squirt Bottle', 'wailmer-pail': 'Wailmer Pail',
};
const method = (id: string) => METHOD_LABEL[id] ?? titleCase(id);

const levels = (min: number | null, max: number | null) =>
  min == null ? '—' : min === max ? `${min}` : `${min}–${max}`;

export function EncounterPanel({ games, via, gen, name }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const game = games.find(g => g.version === active) ?? games[0];
  const title = `Where to find ${name} (Gen ${ROMAN[gen]})`;

  if (!game) {
    return (
      <Panel title={title}>
        <p className="py-6 text-sm text-muted">
          {gen === 9 ? 'Location data for Scarlet/Violet is not in the dataset yet.' : `${name} cannot be found in the wild in this generation.`}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={title}>
      <div role="tablist" aria-label="Game" className="-mx-4 flex flex-wrap gap-1 border-b border-hair px-4 pt-3 pb-3">
        {games.map(g => {
          const on = g.version === game.version;
          return (
            <button
              key={g.version}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(g.version)}
              className={`rounded-[4px] px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                on ? 'bg-ink text-white' : 'text-muted hover:bg-page hover:text-ink'
              }`}
            >
              {g.version}
              <span className={`ml-1.5 tabular-nums ${on ? 'text-white/70' : 'text-muted/70'}`}>{g.rows.length}</span>
            </button>
          );
        })}
      </div>
      {via && <p className="pt-3 text-sm text-muted">Showing locations for {via}; this form has no entries of its own.</p>}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-hair text-xs text-muted">
              <th className="py-2 pl-4 pr-3 text-left font-medium">Location</th>
              <th className="py-2 pr-3 text-left font-medium">Method</th>
              <th className="py-2 pr-3 text-right font-medium">Levels</th>
              <th className="py-2 pr-3 text-right font-medium">Chance</th>
              <th className="py-2 pr-4 text-left font-medium">Conditions</th>
            </tr>
          </thead>
          <tbody>
            {game.rows.map((r, i) => {
              const prev = game.rows[i - 1];
              const sameSpot = prev && prev.location === r.location && prev.area === r.area;
              return (
                <tr key={`${r.location}|${r.area}|${r.method}`} className={i ? 'border-t border-hair' : ''}>
                  <td className={`py-2 pl-4 pr-3 ${sameSpot ? 'text-transparent select-none' : 'font-medium'}`}>
                    {r.location}
                    {r.area && <span className={`block text-xs ${sameSpot ? '' : 'text-muted'}`}>{r.area}</span>}
                  </td>
                  <td className="py-2 pr-3">{method(r.method)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{levels(r.minLevel, r.maxLevel)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">{r.chance != null ? `${r.chance}%` : '—'}</td>
                  <td className="py-2 pr-4 text-muted">{r.conditions ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
