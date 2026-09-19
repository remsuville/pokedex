import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAbilities, useDex, useItems, useMoves, matchDex, matchNames } from '../lib/dex';
import { itemSpriteUrl, spriteUrl } from '../lib/api';
import { TypePill } from './TypePill';

type Kind = 'pokemon' | 'move' | 'ability' | 'item';

interface Hit {
  kind: Kind;
  id: string;
  name: string;
  icon: ReactNode;
  lead: ReactNode;    // dex number, or the kind for the others
  trail: ReactNode;   // type pills, or a short description
}

const SECTION: Record<Kind, string> = { pokemon: 'Pokémon', move: 'Moves', ability: 'Abilities', item: 'Items' };
const PATH: Record<Kind, string> = { pokemon: '/pokemon', move: '/move', ability: '/ability', item: '/item' };

const Img = ({ src }: { src: string | null }) => src
  ? <img src={src} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 object-contain" style={{ imageRendering: 'pixelated' }} />
  : <span className="h-8 w-8 shrink-0" />;

/** Header search across all four dexes: type a name (or dex number), pick with arrows/Enter or the mouse. */
export function SearchBox({ gen }: { gen?: number }) {
  const dex = useDex(), moves = useMoves(), abilities = useAbilities(), items = useItems();
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const hits: Hit[] = [];
  if (q.trim()) {
    // Pokémon get the most rows; a dex-number query is Pokémon-only
    const numeric = /^\d+$/.test(q.trim());
    for (const e of dex ? matchDex(dex, q, numeric ? 8 : 5) : []) hits.push({
      kind: 'pokemon', id: e.id, name: e.name, icon: <Img src={spriteUrl(e.sprite)} />,
      lead: `#${String(e.num).padStart(4, '0')}`,
      trail: e.types.map(t => <TypePill key={t} type={t} size="sm" />),
    });
    if (!numeric) {
      for (const m of moves ? matchNames(moves, q, 3) : []) hits.push({
        kind: 'move', id: m.id, name: m.name, icon: <span className="h-8 w-8 shrink-0" />, lead: 'Move',
        trail: m.type ? <TypePill type={m.type} size="sm" /> : null,
      });
      for (const a of abilities ? matchNames(abilities, q, 3) : []) hits.push({
        kind: 'ability', id: a.id, name: a.name, icon: <span className="h-8 w-8 shrink-0" />, lead: 'Ability',
        trail: <span className="truncate text-xs text-muted">{a.shortDesc}</span>,
      });
      for (const i of items ? matchNames(items, q, 3) : []) hits.push({
        kind: 'item', id: i.id, name: i.name, icon: <Img src={itemSpriteUrl(i.sprite)} />, lead: 'Item',
        trail: <span className="truncate text-xs text-muted">{i.category}</span>,
      });
    }
  }
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

  const go = (h: Hit) => {
    setQ('');
    setOpen(false);
    navigate(`${PATH[h.kind]}/${h.id}${gen ? `?gen=${gen}` : ''}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { if (hits[cursor]) go(hits[cursor]); }
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
        placeholder="Search Pokémon, moves, items…"
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
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}`} role="presentation">
              {(i === 0 || hits[i - 1].kind !== h.kind) && (
                <div className={`px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ${i ? 'border-t border-hair' : ''}`}>
                  {SECTION[h.kind]}
                </div>
              )}
              <div
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={ev => { ev.preventDefault(); go(h); }}
                className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm ${i === cursor ? 'bg-page' : ''}`}
              >
                {h.icon}
                <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{h.lead}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                <span className="flex min-w-0 max-w-[45%] shrink-0 gap-1">{h.trail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
