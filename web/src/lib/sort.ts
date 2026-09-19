import { useState } from 'react';

export type Dir = 1 | -1;

/**
 * Column sort for the list pages. Numeric-looking columns start descending
 * (biggest first); nulls sink to the bottom whichever way you sort.
 */
export function useSort<T, K extends string>(
  value: (row: T, key: K) => number | string | null,
  initial: { key: K; dir: Dir },
  descFirst: (key: K) => boolean = () => false,
) {
  const [sort, setSort] = useState(initial);
  const toggle = (key: K) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: descFirst(key) ? -1 : 1 });
  const apply = (rows: T[]): T[] => {
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = value(a, key), y = value(b, key);
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  };
  return { sort, toggle, apply };
}
