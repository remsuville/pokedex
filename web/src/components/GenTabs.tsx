import { ROMAN } from '../lib/api';

/** The generation switcher on every detail page. `current` is what the API actually served. */
export function GenTabs({ gens, current, onChange }: { gens: number[]; current: number; onChange: (gen: number) => void }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Generation">
      {gens.map(g => (
        <button
          key={g}
          onClick={() => onChange(g)}
          aria-current={g === current ? 'true' : undefined}
          className={`rounded-[4px] px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            g === current
              ? 'bg-accent text-white'
              : 'border border-hair bg-panel text-muted hover:border-accent hover:text-accent'
          }`}
        >
          Gen {ROMAN[g]}
        </button>
      ))}
    </nav>
  );
}
