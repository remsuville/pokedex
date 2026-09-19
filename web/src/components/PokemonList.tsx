import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PokemonRef } from '../types';
import { spriteUrl } from '../lib/api';
import { TypePill } from './TypePill';

interface Props<T extends PokemonRef> {
  rows: T[];
  gen: number;
  /** An optional trailing column: level learnt, ability slot, hold chance. */
  extra?: { label: string; align?: 'left' | 'right'; render: (row: T) => ReactNode };
  empty?: string;
}

/** The "Pokémon that…" table shared by the move, ability and item pages. */
export function PokemonList<T extends PokemonRef>({ rows, gen, extra, empty }: Props<T>) {
  if (!rows.length) return <p className="py-6 text-sm text-muted">{empty ?? 'None in this generation.'}</p>;
  const right = extra?.align === 'right';
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-hair text-xs text-muted">
            <th colSpan={2} className="py-2 pl-4 pr-3 text-right font-medium">#</th>
            <th className="py-2 pr-3 text-left font-medium">Name</th>
            <th className="py-2 pr-3 text-left font-medium">Type</th>
            {extra && <th className={`py-2 pr-4 font-medium ${right ? 'text-right' : 'text-left'}`}>{extra.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const img = spriteUrl(r.sprite);
            return (
              <tr key={r.id} className={i ? 'border-t border-hair' : ''}>
                <td className="w-14 py-1 pl-4 pr-1 text-right tabular-nums text-muted">
                  {r.num != null ? String(r.num).padStart(4, '0') : '—'}
                </td>
                <td className="w-12 py-0.5 pr-3">
                  {img && <img src={img} alt="" width={40} height={40} loading="lazy"
                               className="h-10 w-10" style={{ imageRendering: 'pixelated' }} />}
                </td>
                <td className="py-1 pr-3">
                  <Link to={`/pokemon/${r.id}?gen=${gen}`} className="font-medium text-accent hover:underline">{r.name}</Link>
                </td>
                <td className="py-1 pr-3">
                  <span className="flex gap-1">{r.types.map(t => <TypePill key={t} type={t} size="sm" />)}</span>
                </td>
                {extra && <td className={`py-1 pr-4 ${right ? 'text-right tabular-nums' : ''}`}>{extra.render(r)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
