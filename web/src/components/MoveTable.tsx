import type { LevelUpMove } from '../types';
import { TypePill } from './TypePill';

export function MoveTable({ moves }: { moves: LevelUpMove[] }) {
  if (!moves.length) {
    return <p className="py-6 text-sm text-muted">No level-up moves recorded for this generation.</p>;
  }
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-hair text-xs text-muted">
            <th className="py-2 pl-4 pr-3 text-right font-medium">Lv.</th>
            <th className="py-2 pr-3 text-left font-medium">Move</th>
            <th className="py-2 pr-3 text-left font-medium">Type</th>
            <th className="py-2 pr-3 text-left font-medium">Cat.</th>
            <th className="py-2 pr-3 text-right font-medium">Power</th>
            <th className="py-2 pr-3 text-right font-medium">Acc.</th>
            <th className="py-2 pr-4 text-right font-medium">PP</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => (
            <tr key={`${m.moveId}-${m.level}-${i}`} className={i ? 'border-t border-hair' : ''}>
              <td className="py-2 pl-4 pr-3 text-right tabular-nums text-muted">{m.level}</td>
              <td className="py-2 pr-3 font-medium">{m.name}</td>
              <td className="py-2 pr-3">{m.type ? <TypePill type={m.type} size="sm" /> : '—'}</td>
              <td className="py-2 pr-3 text-muted">{m.category ?? '—'}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{m.power ?? '—'}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{m.accuracy ?? '∞'}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{m.pp ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
