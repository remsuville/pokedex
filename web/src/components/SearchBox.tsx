import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDex, matchDex } from '../lib/dex';
import { spriteUrl } from '../lib/api';
import { TypePill } from './TypePill';

const MAX = 8;

/** Header search: type a name or dex number, pick with arrows/Enter or the mouse. */
export function SearchBox({ gen }: { gen?: number }) {
  const dex = useDex();
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const hits = dex && q.trim() ? matchDex(dex, q, MAX) : [];
  const show = open && hits.length > 0;

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (id: string) => {
    setQ('');
    setOpen(false);
    navigate(`/pokemon/${id}${gen ? `?gen=${gen}` : ''}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { if (hits[cursor]) go(hits[cursor].id); }
    else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  return (
    <div ref={root} className="relative w-full max-w-xs">
      <input
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search name or number…"
        value={q}
        onChange={e => { setQ(e.target.value); setCursor(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        className="w-full rounded-md border border-hair bg-panel px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-hair bg-panel shadow-lg"
        >
          {hits.map((e, i) => (
            <li
              key={e.id}
              role="option"
              aria-selected={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={ev => { ev.preventDefault(); go(e.id); }}
              className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm ${i === cursor ? 'bg-page' : ''}`}
            >
              {e.sprite
                ? <img src={spriteUrl(e.sprite)!} alt="" width={32} height={32} loading="lazy"
                       className="h-8 w-8 shrink-0" style={{ imageRendering: 'pixelated' }} />
                : <span className="h-8 w-8 shrink-0" />}
              <span className="w-12 shrink-0 text-xs text-muted tabular-nums">#{String(e.num).padStart(4, '0')}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
              <span className="flex shrink-0 gap-1">{e.types.map(t => <TypePill key={t} type={t} size="sm" />)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
