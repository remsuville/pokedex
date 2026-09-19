import { useState } from 'react';
import type { Move, MoveMethod } from '../types';
import { ROMAN } from '../lib/api';
import { Panel } from './DataTable';
import { TabStrip } from './TabStrip';
import { MoveTable, type MoveTableLead } from './MoveTable';

interface Props {
  moves: Partial<Record<MoveMethod, Move[]>>;
  eggMovesVia: string | null;
  gen: number;
  name: string;
}

/** Tab order and labels. The machine label tracks what the games called them. */
const METHODS: { key: MoveMethod; label: (gen: number) => string; lead: MoveTableLead; note?: (p: Props) => string | null }[] = [
  { key: 'L', label: () => 'Level up', lead: 'level' },
  { key: 'M', label: g => (g <= 7 ? 'TM / HM' : g === 8 ? 'TM / TR' : 'TM'), lead: 'machine' },
  { key: 'T', label: () => 'Tutor', lead: 'none' },
  { key: 'E', label: () => 'Egg', lead: 'none',
    note: p => p.eggMovesVia ? `${p.name} learns these as an egg move of ${p.eggMovesVia}.` : null },
  { key: 'S', label: () => 'Event', lead: 'none',
    note: () => 'Only available from event distributions.' },
  { key: 'V', label: () => 'Transfer', lead: 'none',
    note: () => 'Learnt in an earlier game and carried over by transfer.' },
  { key: 'D', label: () => 'Dream World', lead: 'none' },
  { key: 'R', label: () => 'Special', lead: 'none',
    note: () => 'Form-specific moves learnt outside the usual methods.' },
];

export function MovesPanel(props: Props) {
  const { moves, gen } = props;
  const tabs = METHODS.filter(m => moves[m.key]?.length);
  const [active, setActive] = useState<MoveMethod>('L');
  const current = tabs.find(t => t.key === active) ?? tabs[0];

  if (!current) {
    return (
      <Panel title={`Moves (Gen ${ROMAN[gen]})`}>
        <p className="py-6 text-sm text-muted">No moves recorded for this generation.</p>
      </Panel>
    );
  }

  const note = current.note?.(props);

  return (
    <Panel title={`Moves (Gen ${ROMAN[gen]})`}>
      <TabStrip
        tabs={tabs.map(t => ({ key: t.key, label: t.label(gen), count: moves[t.key]!.length }))}
        active={current.key}
        onChange={setActive}
        label="Learn method"
      />
      {note && <p className="pt-3 text-sm text-muted">{note}</p>}
      <MoveTable moves={moves[current.key]!} lead={current.lead} gen={gen} />
    </Panel>
  );
}
