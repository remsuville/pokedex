const FIELD = 'rounded-md border border-hair bg-panel px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none';

export function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input type="search" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
           className={`w-56 ${FIELD}`} />
  );
}

export function FilterSelect({ value, onChange, options, all, label }: {
  value: string; onChange: (v: string) => void; options: string[]; all: string; label: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} className={`${FIELD} px-2.5`}>
      <option value="">{all}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Title, count line and the filter controls above a list. */
export function ListHeader({ title, count, total, noun, note, children }: {
  title: string; count: number; total: number; noun: string; note?: string; children: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {count === total ? `${total} ${noun}` : `${count} of ${total} ${noun}`}
          {note && <>{' · '}{note}</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}
