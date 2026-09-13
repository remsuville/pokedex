export function TypePill({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-block rounded-[3px] font-semibold text-white leading-none tracking-wide ${
        size === 'sm' ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
      }`}
      style={{ background: `var(--t-${type.toLowerCase()}, #9fa19f)` }}
    >
      {type}
    </span>
  );
}
