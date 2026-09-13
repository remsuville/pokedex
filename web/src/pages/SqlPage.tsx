import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

interface SchemaTable { name: string; columns: { name: string; type: string }[] }
interface QueryResult { columns: string[]; rows: unknown[][]; truncated: boolean; ms: number }

const EXAMPLES: { label: string; sql: string }[] = [
  { label: 'Top 10 by base stat total, gen 9', sql:
`SELECT num, name, type1, type2, bst
FROM pokemon_gen
WHERE gen = 9
ORDER BY bst DESC
LIMIT 10;` },
  { label: 'Fastest Pokémon per type, gen 4', sql:
`SELECT type1 AS type, name, spe
FROM pokemon_gen
WHERE gen = 4
GROUP BY type1
HAVING spe = MAX(spe)
ORDER BY spe DESC;` },
  { label: 'Species whose typing changed between gens', sql:
`SELECT a.name, a.type1 || COALESCE('/' || a.type2, '') AS before,
       b.type1 || COALESCE('/' || b.type2, '') AS after, b.gen AS changed_in
FROM pokemon_gen a
JOIN pokemon_gen b ON b.showdown_id = a.showdown_id AND b.gen = a.gen + 1
WHERE a.type1 != b.type1 OR COALESCE(a.type2, '') != COALESCE(b.type2, '')
ORDER BY b.gen, a.num;` },
  { label: 'Who learns Earthquake by level up in gen 1', sql:
`SELECT p.num, p.name, l.level
FROM learnset l
JOIN pokemon_gen p ON p.showdown_id = l.showdown_id AND p.gen = l.gen
WHERE l.gen = 1 AND l.move_id = 'earthquake' AND l.method = 'L'
ORDER BY l.level, p.num;` },
  { label: 'Hardest to catch, with flavour text', sql:
`SELECT s.identifier, s.capture_rate, f.text
FROM species s
JOIN flavor_text f ON f.species_id = s.species_id AND f.language = 'en' AND f.version = 'sword'
WHERE s.capture_rate <= 3
ORDER BY s.species_id;` },
  { label: 'Where to find Pikachu in gen 2', sql:
`SELECT version, location, method, min_level, max_level, chance, conditions
FROM encounter
WHERE form_id = 'pikachu' AND gen = 2
ORDER BY version_order, location;` },
];

const STORAGE_KEY = 'pokedex.sql';

/** A read-only SQL console over the built database. */
export function SqlPage() {
  const [schema, setSchema] = useState<SchemaTable[] | null>(null);
  const [sql, setSql] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? EXAMPLES[0].sql; } catch { return EXAMPLES[0].sql; }
  });
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { document.title = 'SQL · Pokédex'; }, []);
  useEffect(() => {
    fetch('/api/schema').then(r => r.json()).then(setSchema).catch(() => setSchema([]));
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, sql); } catch { /* per-viewer convenience only */ } }, [sql]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? `Request failed (${r.status})`); setResult(null); }
      else setResult(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  };

  const insert = (text: string) => {
    const el = editor.current;
    if (!el) { setSql(s => s + text); return; }
    const { selectionStart: a, selectionEnd: b } = el;
    setSql(s => s.slice(0, a) + text + s.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">SQL</h1>
            <p className="mt-1 text-sm text-muted">Read-only. One statement, up to 500 rows. Ctrl+Enter runs it.</p>
          </div>
          <select
            defaultValue=""
            onChange={e => { const ex = EXAMPLES[Number(e.target.value)]; if (ex) setSql(ex.sql); e.target.value = ''; }}
            aria-label="Example queries"
            className="rounded-md border border-hair bg-panel px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
          >
            <option value="" disabled>Examples…</option>
            {EXAMPLES.map((ex, i) => <option key={ex.label} value={i}>{ex.label}</option>)}
          </select>
        </header>

        <textarea
          ref={editor}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          rows={9}
          className="w-full resize-y rounded-md border border-hair bg-panel p-3 font-mono text-sm leading-relaxed focus:border-accent focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={run}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Run'}
          </button>
          {result && (
            <span className="text-sm text-muted tabular-nums">
              {result.rows.length}{result.truncated ? '+' : ''} row{result.rows.length === 1 ? '' : 's'} · {result.ms} ms
              {result.truncated && ' · truncated to 500'}
            </span>
          )}
        </div>

        {error && <pre className="mt-4 whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 p-3 font-mono text-sm text-red-700">{error}</pre>}

        {result && (
          <div className="mt-4 overflow-x-auto rounded-md border border-hair bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs text-muted">
                  {result.columns.map((c, i) => <th key={i} className="px-3 py-2 font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t border-hair hover:bg-page">
                    {row.map((v, j) => <td key={j} className="px-3 py-1.5 align-top"><Cell column={result.columns[j]} value={v} row={row} columns={result.columns} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length === 0 && <p className="py-8 text-center text-sm text-muted">No rows.</p>}
          </div>
        )}
      </div>

      <aside className="text-sm">
        <h2 className="mb-2 font-display text-[17px] font-semibold tracking-tight">Tables</h2>
        <p className="mb-3 text-xs text-muted">Click a name to insert it at the cursor.</p>
        {!schema && <p className="text-muted">Loading…</p>}
        {schema?.map(t => (
          <details key={t.name} className="mb-1.5">
            <summary className="cursor-pointer font-mono text-[13px] font-medium">
              <button onClick={e => { e.preventDefault(); insert(t.name); }} className="hover:text-accent">{t.name}</button>
            </summary>
            <ul className="mb-2 ml-3 mt-1 border-l border-hair pl-3">
              {t.columns.map(c => (
                <li key={c.name} className="font-mono text-xs leading-6">
                  <button onClick={() => insert(c.name)} className="hover:text-accent">{c.name}</button>
                  <span className="ml-1.5 text-muted/70">{c.type.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </aside>
    </div>
  );
}

/** Values in a showdown_id / form_id column link to that species, carrying a gen column if the row has one. */
function Cell({ column, value, row, columns }: { column: string; value: unknown; row: unknown[]; columns: string[] }) {
  if (value == null) return <span className="text-muted/60">null</span>;
  if ((column === 'showdown_id' || column === 'form_id') && typeof value === 'string') {
    const g = columns.indexOf('gen');
    const gen = g >= 0 && typeof row[g] === 'number' ? `?gen=${row[g]}` : '';
    return <Link to={`/pokemon/${value}${gen}`} className="text-accent hover:underline">{value}</Link>;
  }
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>;
  return <>{String(value)}</>;
}
