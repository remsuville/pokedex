import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** One-line summary, shown first. */
  summary: string | null;
  /** Full text, shown beneath when it says more than the summary. */
  detail?: string | null;
  children: ReactNode;
}

const GAP = 6;
const WIDTH = 300;

/**
 * Hover / focus / tap tooltip for move and ability names. Rendered in a
 * portal with fixed positioning so it isn't clipped by the tables'
 * `overflow-x: auto`, flipped above the trigger when there's no room below.
 */
export function Tooltip({ summary, detail, children }: Props) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8);
    // go above the trigger when the space below is likely too tight
    const flipped = r.bottom + GAP + 120 > window.innerHeight;
    setPos({ top: flipped ? r.top - GAP : r.bottom + GAP, left, flipped });
  }, [open]);

  // tapping elsewhere or scrolling closes it
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open]);

  if (!summary) return <>{children}</>;

  const showDetail = detail && detail !== summary;

  return (
    <>
      <span
        ref={trigger}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        className="cursor-help underline decoration-hair decoration-dotted underline-offset-4 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
      </span>
      {open && pos && createPortal(
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-md border border-hair bg-panel p-3 text-sm shadow-lg"
          style={{ top: pos.top, left: pos.left, width: WIDTH, transform: pos.flipped ? 'translateY(-100%)' : undefined }}
        >
          <p className="font-medium">{summary}</p>
          {showDetail && <p className="mt-1.5 text-xs leading-relaxed text-muted">{detail}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
