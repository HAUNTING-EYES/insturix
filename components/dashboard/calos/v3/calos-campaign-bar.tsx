'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import { type CalosObjective } from '@/lib/calos/campaign-intent';
import { type CadenceRule } from '@/app/dashboard/calos/CadenceEditor';
import TrendMarketSelector, {
  LOCAL_TREND_MARKET,
  useResolvedTrendLocation,
} from '@/app/dashboard/calos/TrendMarketSelector';
import type { ContentCard } from '@/app/dashboard/thinkforge/types';
import { C, MONO, SANS, toItem } from './calos-view-model';
import type { CalItem } from './calos-view-model';
import { Btn } from './calos-atoms';
import { CalosCadenceModal } from './calos-cadence-modal';
import { GenerationReview } from './calos-generation-review';

/* ═══ CalOS v3 · campaign bar ═════════════════════════════════════════
   The founder's calos-v3.jsx campaign strip, wired to the real CalOS
   campaign + generation service.

   PERIOD: Week / Month / Quarter segmented pill (7 / 30 / 90 days) — the
   endpoints take a raw {from,to} ISO window, so no dependency on the backend
   Period enum.

   GENERATION → REVIEW: /auto-fill and /ai-plan persist their drafts
   server-side (no dry-run). So we snapshot the deliverable IDs, generate,
   refetch, and open a review sheet of exactly the new drafts where "remove"
   is a real delete — generate → review → prune, netting to preview → place
   with no backend change. */

interface Campaign {
  _id: string;
  name: string;
  cadenceRules: CadenceRule[];
  objective?: CalosObjective;
  theme?: string;
}

interface Review {
  title: string;
  sub: string;
  items: CalItem[];
}

type Pending = '' | 'create' | 'auto' | 'ai';
type GenPeriod = 'Week' | 'Month' | 'Quarter';

const GEN_PERIODS: GenPeriod[] = ['Week', 'Month', 'Quarter'];
const GEN_DAYS: Record<GenPeriod, number> = { Week: 7, Month: 30, Quarter: 90 };

/** Generation window for a period pill — {from: now, to: now + Nd} as ISO. */
function windowFor(p: GenPeriod): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setDate(now.getDate() + GEN_DAYS[p]);
  return { from: now.toISOString(), to: to.toISOString() };
}

export default function CalosCampaignBar({
  brandId,
  onAfterGenerate,
  onOpenWorkspace,
}: {
  brandId: string;
  onAfterGenerate: () => void;
  onOpenWorkspace: (campaign: Campaign) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [pending, setPending] = useState<Pending>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestedRules, setSuggestedRules] = useState<CadenceRule[]>(DEFAULT_CADENCE as CadenceRule[]);
  const [period, setPeriod] = useState<GenPeriod>('Month');
  const [trendMarket, setTrendMarket] = useState(LOCAL_TREND_MARKET);
  const [review, setReview] = useState<Review | null>(null);
  const { trendLocation, isLoading: trendLocationLoading } = useResolvedTrendLocation(trendMarket);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns)
        ? data.campaigns.map((c: { _id: string; name: string; cadenceRules?: CadenceRule[]; objective?: CalosObjective; theme?: string }) => ({
            _id: c._id, name: c.name,
            cadenceRules: Array.isArray(c.cadenceRules) ? c.cadenceRules : [],
            objective: c.objective, theme: c.theme,
          }))
        : [];
      setCampaigns(list);
      setCampaignId((cur) => (cur && list.some((c) => c._id === cur) ? cur : list[0]?._id ?? ''));
    } catch {
      setCampaigns([]);
    }
  }, [brandId]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  const selected = campaigns.find((c) => c._id === campaignId) ?? null;
  const busy = pending !== '';
  const waitingForTrendLocation = trendMarket === LOCAL_TREND_MARKET && trendLocationLoading;

  /** Current deliverables for this brand — used to diff out just-generated drafts. */
  const fetchCards = useCallback(async (): Promise<ContentCard[]> => {
    try {
      const r = await fetch(`/api/services/calos/deliverables?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d?.cards) ? d.cards : [];
    } catch {
      return [];
    }
  }, [brandId]);

  /** Open the review sheet with the drafts this generation just created. Safety: only attribute
      cards to this review when they belong to the campaign we generated for (so a teammate's
      concurrently-created card for another campaign can't be shown here and deleted), and never
      show more than the server reported creating (newest first) to bound any remaining slop. */
  const reviewNew = async (
    beforeIds: Set<string>,
    title: string,
    sub: string,
    opts: { campaignId?: string; expectedCount: number },
  ) => {
    const after = await fetchCards();
    let fresh = after.filter((c) => !beforeIds.has(c.id));
    if (opts.campaignId) fresh = fresh.filter((c) => c.campaignId === opts.campaignId);
    fresh.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    const items = fresh.slice(0, Math.max(0, opts.expectedCount)).map(toItem);
    setReview({ title, sub, items });
  };

  const removeDraft = async (id: string) => {
    try {
      const r = await fetch(`/api/services/calos/deliverables/${encodeURIComponent(id)}?brandId=${encodeURIComponent(brandId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      setReview((rv) => (rv ? { ...rv, items: rv.items.filter((it) => it.id !== id) } : rv));
      onAfterGenerate();
    } catch (err) {
      toast({ title: "Couldn't remove draft", description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const createCampaign = async () => {
    setPending('create');
    try {
      let rules: CadenceRule[] = DEFAULT_CADENCE as CadenceRule[];
      try {
        const sres = await fetch(`/api/services/calos/suggest-cadence?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
        if (sres.ok) {
          const sdata = await sres.json();
          if (Array.isArray(sdata?.rules) && sdata.rules.length) rules = sdata.rules;
        }
      } catch { /* suggestion is best-effort — fall back to the default cadence */ }
      setSuggestedRules(rules);
      setCreateOpen(true);
    } finally {
      setPending('');
    }
  };

  const autoFill = async () => {
    if (!campaignId) { toast({ title: 'Pick or create a campaign first', variant: 'destructive' }); return; }
    setPending('auto');
    try {
      const beforeIds = new Set((await fetchCards()).map((c) => c.id));
      const { from, to } = windowFor(period);
      const res = await fetch('/api/services/calos/auto-fill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId, from, to }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const created = data?.created ?? 0;
      onAfterGenerate();
      if (created > 0) {
        await reviewNew(beforeIds, 'Auto-fill · review', `${created} draft${created === 1 ? '' : 's'} from the ${period.toLowerCase()} cadence`, { campaignId, expectedCount: created });
      } else {
        toast({ title: 'Nothing to fill', description: data?.note || 'The cadence is already met in this window.' });
      }
    } catch (err) {
      toast({ title: 'Auto-fill failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPending('');
    }
  };

  const aiPlan = async () => {
    setPending('ai');
    try {
      const beforeIds = new Set((await fetchCards()).map((c) => c.id));
      const { from, to } = windowFor(period);
      const res = await fetch('/api/services/calos/ai-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId: campaignId || undefined, from, to, trendLocation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || `AI plan failed (${res.status})`, description: data?.hint, variant: 'destructive' }); return; }
      const created = data?.created ?? 0;
      const trendsUsed = data?.trendsUsed ?? 0;
      const market = typeof data?.trendLocation === 'string' && data.trendLocation ? data.trendLocation : 'global';
      onAfterGenerate();
      if (created > 0) {
        await reviewNew(beforeIds, 'AI plan · review', `${created} idea${created === 1 ? '' : 's'} · ${trendsUsed} trend${trendsUsed === 1 ? '' : 's'} in ${market} via ${data?.provider ?? 'none'}`, { campaignId: campaignId || undefined, expectedCount: created });
      } else {
        toast({ title: 'No ideas drafted', description: data?.note || 'Try a wider window or a different market.' });
      }
    } catch (err) {
      toast({ title: 'AI plan failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPending('');
    }
  };

  return (
    <div className="calos-tw" style={{ padding: 10, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {campaigns.length > 0 && (
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Select campaign" className="calos-fr" style={{ height: 34, maxWidth: 190, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0 10px', fontSize: 12.5, fontWeight: 700, fontFamily: SANS, outline: 'none' }}>
            {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
        <Btn size="sm" onClick={createCampaign} disabled={busy} title="New campaign">{pending === 'create' ? '…' : '+ Campaign'}</Btn>
        <Btn size="sm" onClick={() => setEditorOpen(true)} disabled={busy || !campaignId} title="Edit cadence">Edit cadence</Btn>
        <Btn size="sm" onClick={() => selected && onOpenWorkspace(selected)} disabled={busy || !campaignId} title="Open campaign workspace">Open</Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* period — segmented pill (Week / Month / Quarter), matches calos-v3.jsx */}
        <div style={{ display: 'inline-flex', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: 2 }}>
          {GEN_PERIODS.map((p) => (
            <button key={p} type="button" className="calos-fr" onClick={() => setPeriod(p)} disabled={busy} style={{ cursor: busy ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 5, padding: '6px 10px', fontFamily: MONO, fontSize: 10, background: period === p ? C.gold : 'transparent', color: period === p ? '#241B08' : C.muted, fontWeight: period === p ? 700 : 400 }}>{p.toUpperCase()}</button>
          ))}
        </div>
        <TrendMarketSelector value={trendMarket} onChange={setTrendMarket} disabled={busy} className="calos-fr calos-trend-select" />
        <Btn size="sm" onClick={autoFill} disabled={busy || !campaignId}>{pending === 'auto' ? 'Working…' : '⤢ Auto-fill'}</Btn>
        <Btn size="sm" variant="primary" onClick={aiPlan} disabled={busy || waitingForTrendLocation}>{pending === 'ai' ? 'Working…' : '✨ AI plan'}</Btn>
      </div>

      {editorOpen && selected && (
        <CalosCadenceModal campaign={selected} brandId={brandId} onClose={() => setEditorOpen(false)} onSaved={() => loadCampaigns()} />
      )}
      {createOpen && (
        <CalosCadenceModal campaign={null} brandId={brandId} initialRules={suggestedRules} onClose={() => setCreateOpen(false)} onSaved={(newId) => { void loadCampaigns(); if (newId) setCampaignId(newId); }} />
      )}
      {review && (
        <GenerationReview title={review.title} sub={review.sub} items={review.items} onRemove={removeDraft} onClose={() => setReview(null)} />
      )}
    </div>
  );
}
