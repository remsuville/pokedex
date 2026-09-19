import type { FlavorEntry } from '../types';

/** In-game descriptions, one per version group, with identical texts merged. */
export function FlavorList({ entries }: { entries: FlavorEntry[] }) {
  if (!entries.length) return <p className="py-6 text-sm text-muted">No in-game description for this generation.</p>;
  const merged = new Map<string, string[]>();
  for (const e of entries) merged.set(e.text, [...(merged.get(e.text) ?? []), e.versionGroup]);
  return (
    <dl className="divide-y divide-hair text-sm">
      {[...merged].map(([text, groups]) => (
        <div key={text} className="grid gap-x-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
          <dt className="text-muted">{groups.join(', ')}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}
