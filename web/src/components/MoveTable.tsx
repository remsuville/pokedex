import type { Move } from '../types';
import { TypePill } from './TypePill';
import { Tooltip } from './Tooltip';

/** First column depends on how the move is learnt: a level, a TM number, or nothing. */
export type MoveTableLead = 'level' | 'machine' | 'none';

export function MoveTable({ moves, lead, empty }: { moves: Move[]; lead: MoveTableLead; empty?: string }) {
  if (!moves.length) {
    return <p className="py-6 text-sm text-muted">{empty ?? 'No moves recorded for this generation.'}</p>;
  }
  const leadLabel = lead === 'level' ? 'Lv.' : lead === 'machine' ? 'TM' : null;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-hair text-xs text-muted">
            {leadLabel
              ? <th className={`py-2 pl-4 pr-3 font-medium ${lead === 'level' ? 'text-right' : 'text-left'}`}>{leadLabel}</th>
              : null}
            <th className={`py-2 pr-3 text-left font-medium ${leadLabel ? '' : 'pl-4'}`}>Move</th>
            <th className="py-2 pr-3 text-left font-medium">Type</th>
            <th className="py-2 pr-3 text-left font-medium">Cat.</th>
            <th className="py-2 pr-3 text-right font-medium">Power</th>
            <th className="py-2 pr-3 text-right font-medium">Acc.</th>
            <th className="py-2 pr-4 text-right font-medium">PP</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => (
            <tr key={`${m.moveId}-${m.level ?? ''}-${i}`} className={i ? 'border-t border-hair' : ''}>
              {lead === 'level' && <td className="py-2 pl-4 pr-3 text-right tabular-nums text-muted">{m.level}</td>}
              {lead === 'machine' && <td className="py-2 pl-4 pr-3 tabular-nums text-muted">{m.machine ?? '—'}</td>}
              <td className={`py-2 pr-3 font-medium ${leadLabel ? '' : 'pl-4'}`}>
                <Tooltip summary={m.shortDesc} detail={m.desc}>{m.name}</Tooltip>
              </td>
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
