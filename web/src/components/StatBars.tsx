import type { StatRow } from '../types';

/** Bar colour tracks how good the value is, the way pokemondb shades them. */
function shade(base: number): string {
  if (base < 50)  return '#f34444';
  if (base < 70)  return '#ff7f0f';
  if (base < 90)  return '#ffdd57';
  if (base < 110) return '#a0e515';
  if (base < 130) return '#23cd5e';
  return '#00c2b8';
}

export function StatBars({ stats, bst }: { stats: StatRow[]; bst: number }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {stats.map((s, i) => (
          <tr key={s.key} className={i ? 'border-t border-hair' : ''}>
            <th className="w-[22%] py-2 pr-3 text-right align-middle font-normal text-muted">{s.label}</th>
            <td className="w-[10%] py-2 pr-3 text-right align-middle tabular-nums font-medium">{s.base}</td>
            <td className="py-2 align-middle">
              <div className="h-3 w-full rounded-[2px] bg-hair/70">
                <div
                  className="h-3 rounded-[2px]"
                  style={{ width: `${Math.min(100, (s.base / 255) * 100)}%`, background: shade(s.base) }}
                />
              </div>
            </td>
            <td className="w-[13%] py-2 pl-3 text-right align-middle tabular-nums text-muted">{s.min}</td>
            <td className="w-[13%] py-2 pl-2 text-right align-middle tabular-nums text-muted">{s.max}</td>
          </tr>
        ))}
        <tr className="border-t border-hair">
          <th className="py-2 pr-3 text-right align-middle font-normal text-muted">Total</th>
          <td className="py-2 pr-3 text-right align-middle tabular-nums font-semibold">{bst}</td>
          <td />
          <td className="py-2 pl-3 text-right text-xs text-muted">Min</td>
          <td className="py-2 pl-2 text-right text-xs text-muted">Max</td>
        </tr>
      </tbody>
    </table>
  );
}
