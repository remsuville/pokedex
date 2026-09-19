import type { Dir } from '../lib/sort';

/** A sortable column header for the list pages. */
export function SortTh<K extends string>({ col, label, sort, onToggle, align = 'left', first }: {
  col: K; label: string; sort: { key: K; dir: Dir }; onToggle: (key: K) => void;
  align?: 'left' | 'right'; first?: boolean;
}) {
  const on = sort.key === col;
  return (
    <th
      scope="col"
      aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      className={`py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${first ? 'pl-3' : ''} pr-3`}
    >
      <button onClick={() => onToggle(col)} className="hover:text-ink">
        {label}{on && <span className="ml-0.5">{sort.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}
