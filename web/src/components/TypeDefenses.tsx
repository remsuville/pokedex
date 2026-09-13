/** The weakness grid: one cell per attacking type, the damage multiplier beneath. */

const LABEL: Record<number, string> = { 4: '×4', 2: '×2', 1: '×1', 0.5: '×½', 0.25: '×¼', 0: '×0' };

/** Only the multiplier is coloured: warm for weak, cool for resistant, quiet for neutral. */
function color(m: number): string {
  if (m > 1)   return '#c62828';
  if (m === 1) return 'var(--color-muted)';
  if (m === 0) return '#16181d';
  return '#2e7d32';
}

export function TypeDefenses({ defenses }: { defenses: { type: string; multiplier: number }[] }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-4 py-4 sm:grid-cols-6">
      {defenses.map(({ type, multiplier }) => (
        <div key={type} className="flex flex-col items-center gap-1.5">
          <span
            className="w-full rounded-[3px] py-1.5 text-center text-xs font-semibold leading-none tracking-wide text-white"
            style={{ background: `var(--t-${type.toLowerCase()}, #9fa19f)` }}
          >
            {type}
          </span>
          <span
            className={`text-sm tabular-nums leading-none ${multiplier === 1 ? 'font-normal' : 'font-semibold'}`}
            style={{ color: color(multiplier) }}
          >
            {LABEL[multiplier] ?? `×${multiplier}`}
          </span>
        </div>
      ))}
    </div>
  );
}
