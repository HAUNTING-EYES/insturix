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
import type { CalosCampaignReference } from '@/schemas/calos-campaign';
import { C, MONO, toItem } from './calos-view-model';
import type { CalItem } from './calos-view-model';
import { Btn } from './calos-atoms';
import { Select } from '@/components/primitives';
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
  references?: CalosCampaignReference[];
}

interface Review {
  title: string;
  sub: string;
  items: CalItem[];
}

type Pending = '' | 'create' | 'auto' | 'ai' | 'dist';
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
        ? data.campaigns.map((c: { _id: string; name: string; cadenceRules?: CadenceRule[]; objective?: CalosObjective; theme?: string; references?: CalosCampaignReference[] }) => ({
            _id: c._id, name: c.name,
            cadenceRules: Array.isArray(c.cadenceRules) ? c.cadenceRules : [],
            objective: c.objective, theme: c.theme,
            references: Array.isArray(c.references) ? c.references : [],
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
        await reviewNew(beforeIds, 'AI plan · review', `${created} idea${created === 1 ? '' : 's'} · ${trendsUsed} trend${trendsUsed === 1 ? '' : 's'} in ${market}`, { campaignId: campaignId || undefined, expectedCount: created });
      } else {
        toast({ title: 'No ideas drafted', description: data?.note || 'Try a wider window or a different market.' });
      }
    } catch (err) {
      toast({ title: 'AI plan failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPending('');
    }
  };

  /** Accept-and-generate: sequentially generate a script/post for each kept idea (one by one so we
      never spike credits or the writer's rate limit). Best-effort per card — one failure doesn't abort
      the batch; the calendar refreshes after each so drafts appear as they land. */
  const generateAll = async (ids: string[]) => {
    if (!ids.length) return;
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/services/calos/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, deliverableId: id }),
        });
        if (res.ok) ok++;
      } catch { /* continue — a single failure must not abort the whole batch */ }
      onAfterGenerate();
    }
    toast({
      title: `Generated ${ok}/${ids.length}`,
      description: ok < ids.length ? 'Some failed — open them to retry.' : 'Scripts are ready.',
      ...(ok === 0 ? { variant: 'destructive' as const } : {}),
    });
  };

  // Auto-distribute: spread the campaign's schedulable (not-yet-approved) cards across its cadence's
  // preferred days, one card per slot per platform, starting tomorrow. Re-dates cards, so it's guarded
  // by a two-click confirm on the button. (auto-fill/ai-plan already place cards at creation — this is
  // for re-spreading a pile, e.g. manually-made or clustered cards.)
  const [distArmed, setDistArmed] = useState(false);
  const distributeAcrossCadence = async () => {
    if (!selected) { toast({ title: 'Pick a campaign first', variant: 'destructive' }); return; }
    if (!selected.cadenceRules.length) { toast({ title: 'This campaign has no cadence to distribute across', variant: 'destructive' }); return; }
    setPending('dist');
    try {
      const SCHEDULABLE = new Set(['idea', 'drafting', 'generated', 'changes_requested']);
      const cards = (await fetchCards()).filter(
        (c) => c.campaignId === selected._id && SCHEDULABLE.has(c.editorialStatus ?? 'idea'),
      );
      if (!cards.length) { toast({ title: 'No schedulable cards', description: 'Generate or accept some ideas first.' }); return; }

      const ruleByPlatform = new Map(selected.cadenceRules.map((r) => [r.platform, r]));
      const byPlatform = new Map<string, ContentCard[]>();
      for (const c of cards) {
        const p = c.platform ?? 'generic';
        const bucket = byPlatform.get(p);
        if (bucket) bucket.push(c); else byPlatform.set(p, [c]);
      }

      const start = new Date();
      start.setHours(10, 0, 0, 0);
      start.setDate(start.getDate() + 1); // begin tomorrow

      const updates: { id: string; iso: string }[] = [];
      for (const [platform, pcards] of byPlatform) {
        const rule = ruleByPlatform.get(platform);
        if (!rule?.preferredDays?.length) continue; // no cadence for this platform → leave as-is
        const days = new Set(rule.preferredDays);
        const cursor = new Date(start);
        let placed = 0, guard = 0;
        while (placed < pcards.length && guard < 730) { // 2-year guard against an empty day set
          if (days.has(cursor.getDay())) { updates.push({ id: pcards[placed].id, iso: new Date(cursor).toISOString() }); placed++; }
          cursor.setDate(cursor.getDate() + 1);
          guard++;
        }
      }
      if (!updates.length) { toast({ title: 'Nothing distributed', description: 'No cards match the cadence platforms.' }); return; }

      let ok = 0;
      for (const u of updates) {
        try {
          const res = await fetch(`/api/services/calos/deliverables/${encodeURIComponent(u.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, updates: { plannedDates: [u.iso], date: u.iso } }),
          });
          if (res.ok) ok++;
        } catch { /* continue — one failure must not abort the batch */ }
      }
      onAfterGenerate();
      toast({ title: `Distributed ${ok}/${updates.length} across the cadence` });
    } finally {
      setPending('');
    }
  };

  return (
    <div className="calos-tw" style={{ padding: 10, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {campaigns.length > 0 && (
          <div style={{ width: 190 }}>
            <Select size="sm" aria-label="Select campaign" value={campaignId} onChange={setCampaignId}
              options={campaigns.map((c) => ({ value: c._id, label: c.name }))} />
          </div>
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
        <Btn
          size="sm"
          onClick={() => { if (distArmed) { setDistArmed(false); void distributeAcrossCadence(); } else { setDistArmed(true); } }}
          disabled={busy || !campaignId}
          title="Spread this campaign's un-approved cards across its cadence days"
        >
          {pending === 'dist' ? 'Distributing…' : distArmed ? 'Confirm · re-dates cards' : '📆 Distribute'}
        </Btn>
      </div>

      {editorOpen && selected && (
        <CalosCadenceModal campaign={selected} brandId={brandId} onClose={() => setEditorOpen(false)} onSaved={() => loadCampaigns()} />
      )}
      {createOpen && (
        <CalosCadenceModal campaign={null} brandId={brandId} initialRules={suggestedRules} onClose={() => setCreateOpen(false)} onSaved={(newId) => { void loadCampaigns(); if (newId) setCampaignId(newId); }} />
      )}
      {review && (
        <GenerationReview title={review.title} sub={review.sub} items={review.items} onRemove={removeDraft} onClose={() => setReview(null)} onGenerateAll={generateAll} />
      )}
    </div>
  );
}
