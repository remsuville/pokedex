import { useSearchParams } from 'react-router-dom';

/** Filter state lives in the URL so a filtered list can be linked and survives back/forward. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  return { get, set };
}
