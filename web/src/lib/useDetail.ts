import { useEffect, useState } from 'react';

/**
 * Load one detail payload, re-fetching when the id or wanted generation
 * changes. `data` keeps the previous page's payload until the new one
 * arrives; callers compare `data.id` to avoid flashing stale content.
 */
export function useDetail<T>(load: (id: string, gen?: number) => Promise<T>, id: string, gen?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load(id, gen)
      .then(d => { if (live) { setData(d); setError(null); } })
      .catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [load, id, gen]);
  return { data, error };
}
