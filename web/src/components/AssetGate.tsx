import { useEffect, useState, type ReactNode } from 'react';
import type { AssetStatus, PackStatus } from '../types';
import { fetchAssetStatus, startAssets } from '../lib/api';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;

const STATE_LABEL: Record<PackStatus['state'], string> = {
  missing: 'Waiting', downloading: 'Downloading', verifying: 'Verifying', extracting: 'Unpacking', ready: 'Ready', error: 'Failed',
};

/**
 * In the desktop app the Pokémon sprites are fetched on first run. This
 * holds the UI behind a progress screen until the required packs are in,
 * then shows a corner note while optional ones finish. In the web build the
 * API reports `managed: false` and this renders straight through.
 */
export function AssetGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AssetStatus | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const s = await fetchAssetStatus();
        if (!live) return;
        setStatus(s);
        // fast while the gate is up, slower for the background pack, stop when done
        if (s.managed && (s.busy || !s.ready)) timer = setTimeout(poll, s.ready ? 2000 : 400);
      } catch {
        if (live) timer = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, []);

  if (!status) return null;
  if (!status.managed || status.ready) {
    const pending = status.managed ? status.packs.filter(p => p.state !== 'ready') : [];
    return (
      <>
        {children}
        {pending.length > 0 && <CornerNote packs={pending} onRetry={() => startAssets().then(setStatus)} />}
      </>
    );
  }
  return <SetupScreen packs={status.packs} onRetry={() => startAssets().then(setStatus)} />;
}

function SetupScreen({ packs, onRetry }: { packs: PackStatus[]; onRetry: () => void }) {
  const failed = packs.some(p => p.required && p.state === 'error');
  const required = packs.filter(p => p.required);
  return (
    <div className="mx-auto max-w-md py-24">
      <h1 className="font-display text-2xl font-bold tracking-tight">Setting up the Pokédex</h1>
      <p className="mt-2 text-sm text-muted">
        Downloading sprites ({mb(required.reduce((n, p) => n + p.size, 0))}). This happens once; after this the app works offline.
      </p>
      <ul className="mt-6 space-y-4">
        {packs.map(p => <PackRow key={p.name} pack={p} />)}
      </ul>
      {failed && (
        <div className="mt-6 rounded-md border border-hair bg-panel p-4 text-sm">
          <p>The download was interrupted. Check your connection and try again — it continues from where it stopped.</p>
          <button onClick={onRetry} className="mt-3 rounded-[4px] bg-accent px-3 py-1.5 text-xs font-semibold text-white">Retry</button>
        </div>
      )}
    </div>
  );
}

function PackRow({ pack: p }: { pack: PackStatus }) {
  const pct = p.state === 'ready' ? 100 : Math.min(100, Math.round((p.received / p.size) * 100));
  const busy = p.state === 'verifying' || p.state === 'extracting';
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">
          {p.description}
          {!p.required && <span className="ml-1.5 text-xs text-muted">optional</span>}
        </span>
        <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${p.state === 'error' ? 'text-red-600' : 'text-muted'}`}>
          {p.state === 'error' ? p.error ?? 'Failed' : `${STATE_LABEL[p.state]} · ${mb(p.received)} / ${mb(p.size)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${p.state === 'error' ? 'bg-red-500' : busy ? 'animate-pulse bg-accent' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

/** Optional packs still arriving after the app is usable. */
function CornerNote({ packs, onRetry }: { packs: PackStatus[]; onRetry: () => void }) {
  const p = packs[0];
  const pct = Math.round((p.received / p.size) * 100);
  return (
    <div className="fixed bottom-4 right-4 z-30 w-64 rounded-md border border-hair bg-panel p-3 text-xs shadow-lg">
      {p.state === 'error' ? (
        <>
          <p className="font-medium">{p.description} failed to download.</p>
          <button onClick={onRetry} className="mt-2 text-accent hover:underline">Retry</button>
        </>
      ) : (
        <>
          <p className="font-medium">{STATE_LABEL[p.state]}: {p.description}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hair">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-muted tabular-nums">{mb(p.received)} / {mb(p.size)}</p>
        </>
      )}
    </div>
  );
}
