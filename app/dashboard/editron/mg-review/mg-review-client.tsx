'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Accept = 'accept' | 'watchlist' | 'reject';

interface ReviewItem {
  id: string;
  source: string;
  score: number;
  scored: boolean;
  issues: string[];
  dims: Record<string, number | undefined>;
  geometry: { coveredPct?: number; hardVeto?: boolean } | null;
  media: Array<{ kind: 'video' | 'image'; url: string; caption: string }>;
  human: { accept?: Accept; reasonCodes?: string[]; notes?: string } | null;
}

const ACCEPT_OPTIONS: Array<{ value: Accept; className: string }> = [
  { value: 'accept', className: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  { value: 'watchlist', className: 'bg-amber-500 hover:bg-amber-400 text-black' },
  { value: 'reject', className: 'bg-red-600 hover:bg-red-500 text-white' },
];
const REASONS = ['legibility', 'contrast', 'form', 'motion', 'composition', 'contract-fidelity', 'fabrication', 'other'];

export default function MgReviewClient() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [labeled, setLabeled] = useState(0);
  const [minLabels, setMinLabels] = useState(20);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/services/editron/mg-eval/review');
      if (!r.ok) throw new Error(`review API ${r.status}`);
      const data = await r.json();
      setItems(data.items ?? []);
      setLabeled(data.labeled ?? 0);
      setMinLabels(data.min ?? 20);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'failed to load corpus');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const patchItem = useCallback(async (itemId: string, patch: Partial<ReviewItem['human']>) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, human: { ...(i.human ?? {}), ...patch } } : i)));
  }, []);

  const submitLabel = useCallback(async (item: ReviewItem, accept: Accept, reasonCodes: string[], note: string) => {
    await fetch('/api/services/editron/mg-eval/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, accept, reasonCodes, notes: note || undefined }),
    });
    await refresh();
  }, [refresh]);

  const ready = labeled >= minLabels;
  const pct = Math.min(100, Math.round((labeled / Math.max(1, minLabels)) * 100));

  const stats = useMemo(() => {
    const kinds = items.map((i) => i.human?.accept ?? null);
    return {
      accept: kinds.filter((k) => k === 'accept').length,
      watchlist: kinds.filter((k) => k === 'watchlist').length,
      reject: kinds.filter((k) => k === 'reject').length,
    };
  }, [items]);

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">MG judge calibration · review</h1>
          <p className="text-sm text-neutral-500">Label real renders so threshold/watchlist/cover can be calibrated (§13.4).</p>
        </div>
        <div className="w-64">
          <div className="mb-1 flex justify-between text-xs">
            <span>{labeled}/{minLabels} labeled · A{stats.accept} W{stats.watchlist} R{stats.reject}</span>
            <span className={ready ? 'font-bold text-emerald-600' : ''}>{ready ? 'READY for calibration' : 'calibrate locked'}</span>
          </div>
          <div className="h-2 w-full rounded bg-neutral-200">
            <div className={`h-2 rounded transition-all ${ready ? 'bg-emerald-600' : 'bg-neutral-400'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <button onClick={() => void refresh()} className="mb-6 rounded border px-3 py-1 text-sm hover:bg-neutral-100 hover:text-neutral-900">↻ refresh</button>

      <div className="grid gap-4">
        {items.map((item) => {
          const chosen = item.human?.accept ?? null;
          const reasonCodes = item.human?.reasonCodes ?? [];
          return (
            <section key={item.id} className="rounded-lg border p-4 shadow-sm" data-testid={item.id}>
              <div className="flex gap-4">
                <div className="w-72 shrink-0 space-y-2">
                  {item.media.map((m) =>
                    m.kind === 'video'
                      ? <video key={m.url} src={m.url} controls className="w-full rounded border bg-black" />
                      : <img key={m.url} src={m.url} alt={m.caption} className="w-full rounded border bg-black" />,
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-sm font-bold ${!item.scored ? 'bg-neutral-200 text-neutral-600' : chosen === 'accept' ? 'bg-emerald-600 text-white' : chosen === 'watchlist' ? 'bg-amber-500 text-black' : chosen === 'reject' ? 'bg-red-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
                      {item.scored ? `judge ${item.score}/10` : 'judge pending'}
                    </span>
                    <span className="truncate text-sm text-neutral-500">{item.source}</span>
                  </div>
                  {item.scored ? (
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      {Object.entries(item.dims).filter(([, v]) => v != null && v > 0).map(([k, v]) => (
                        <span key={k} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-800">{k} {v}</span>
                      ))}
                      {item.geometry ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">cover {(item.geometry.coveredPct ?? 0).toFixed(3)}</span> : null}
                    </div>
                  ) : null}
                  <ul className="mt-2 list-disc pl-5 text-xs text-neutral-600">
                    {item.issues.filter((issue) => !issue.startsWith('__UNSCORED__')).slice(0, 5).map((issue, idx) => <li key={idx}>{issue}</li>)}
                  </ul>
                  {!item.scored ? <p className="mt-2 text-xs text-neutral-400">No judge verdict yet (Gemini quota today) — your accept/watchlist/reject label IS the ground truth for calibration. Judge verdicts get re-scored later.</p> : null}

                  <div className="mt-3 flex gap-2">
                    {ACCEPT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => void submitLabel(item, opt.value, reasonCodes, notes[item.id] ?? '')}
                        className={`rounded px-3 py-1.5 text-sm font-semibold ${opt.className} ${chosen === opt.value ? 'outline outline-2 outline-offset-2 outline-blue-500' : ''}`}>
                        {opt.value}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {REASONS.map((reason) => {
                      const on = reasonCodes.includes(reason);
                      return (
                        <button key={reason} onClick={() => {
                          const next = on ? reasonCodes.filter((r) => r !== reason) : [...reasonCodes, reason];
                          void patchItem(item.id, { reasonCodes: next });
                          void submitLabel(item, chosen ?? 'watchlist', next, notes[item.id] ?? '');
                        }} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'bg-blue-600 text-white' : 'bg-white text-neutral-900'}`}>
                          {reason}
                        </button>
                      );
                    })}
                  </div>
                  <input value={notes[item.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                    placeholder="optional note (what would fix it / why)" className="mt-2 w-full rounded border px-2 py-1 text-xs" />
                </div>
              </div>
            </section>
          );
        })}
        {loadError ? (
          <div className="rounded border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-300" role="alert">
            Could not load the corpus ({loadError}).{' '}
            <button onClick={() => void refresh()} className="underline underline-offset-2">Retry</button>
          </div>
        ) : loading && items.length === 0 ? (
          <p className="text-neutral-400">Loading corpus…</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-400">No corpus items. Seed `.calibration-temp/mg-eval-seed.jsonl` and reload.</p>
        ) : null}
      </div>

      {ready ? (
        <p className="mt-6 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
          {labeled} labeled — run <code className="rounded bg-white px-1 text-neutral-900">npx tsx scripts/prompt-optimization/eval-mg-calibrate.ts --labels=.calibration-temp/mg-eval-labeled.jsonl</code> to produce the calibration artifact.
        </p>
      ) : null}
    </main>
  );
}