export interface Tab<K extends string> { key: K; label: string; count?: number }

/** The row of tabs at the top of a panel (learn methods, games). */
export function TabStrip<K extends string>({ tabs, active, onChange, label }: {
  tabs: Tab<K>[]; active: K; onChange: (key: K) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex flex-wrap gap-1 border-b border-hair px-4 pt-3 pb-3">
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`rounded-[4px] px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on ? 'bg-ink text-white' : 'text-muted hover:bg-page hover:text-ink'
            }`}
          >
            {t.label}
            {t.count != null && <span className={`ml-1.5 tabular-nums ${on ? 'text-white/70' : 'text-muted/70'}`}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
