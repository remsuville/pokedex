import { Link } from 'react-router-dom';
import type { EvoNode } from '../types';
import { spriteUrl } from '../lib/api';
import { TypePill } from './TypePill';

interface Props { root: EvoNode; currentId: string; gen: number }

/**
 * The family tree, laid out left to right. A single line of evolutions runs
 * horizontally; a branching stage (Eevee, Tyrogue) stacks its branches.
 */
export function EvolutionChain({ root, currentId, gen }: Props) {
  if (!root.evos.length) {
    return <p className="py-6 text-sm text-muted">{root.name} does not evolve.</p>;
  }
  return (
    <div className="overflow-x-auto py-4">
      <Tree node={root} currentId={currentId} gen={gen} />
    </div>
  );
}

function Tree({ node, currentId, gen }: { node: EvoNode } & Omit<Props, 'root'>) {
  const card = <Card node={node} current={node.id === currentId} gen={gen} />;
  if (!node.evos.length) return card;

  return (
    <div className="flex items-center gap-2">
      {card}
      <div className="flex flex-col gap-4">
        {node.evos.map(child => (
          <div key={child.id} className="flex items-center gap-2">
            <Arrow method={child.method!} />
            <Tree node={child} currentId={currentId} gen={gen} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ node, current, gen }: { node: EvoNode; current: boolean; gen: number }) {
  const img = spriteUrl(node.sprite);
  return (
    <Link
      to={`/pokemon/${node.id}?gen=${gen}`}
      aria-current={current ? 'page' : undefined}
      className={`flex w-36 shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-3 text-center transition-colors hover:border-accent ${
        current ? 'border-accent bg-page' : 'border-hair'
      }`}
    >
      {img
        ? <img src={img} alt="" width={96} height={96} className="h-24 w-24" style={{ imageRendering: 'pixelated' }} />
        : <span className="h-24 w-24" />}
      <span className="text-xs text-muted tabular-nums">#{String(node.num ?? 0).padStart(4, '0')}</span>
      <span className="text-sm font-semibold leading-tight">{node.name}</span>
      <span className="mt-0.5 flex flex-wrap justify-center gap-1">
        {node.types.map(t => <TypePill key={t} type={t} size="sm" />)}
      </span>
    </Link>
  );
}

function Arrow({ method }: { method: string }) {
  return (
    <div className="flex w-32 shrink-0 flex-col items-center text-center">
      <span aria-hidden className="text-xl leading-none text-muted">→</span>
      <span className="mt-1 text-xs leading-snug text-muted">{method}</span>
    </div>
  );
}
