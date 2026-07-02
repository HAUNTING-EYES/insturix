'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import { type CalosObjective } from '@/lib/calos/campaign-intent';
import { type Period, PERIOD_LABELS, periodRange } from '@/app/dashboard/calos/period';
import CadenceEditor, { type CadenceRule } from '@/app/dashboard/calos/CadenceEditor';
import TrendMarketSelector, {
  LOCAL_TREND_MARKET,
  useResolvedTrendLocation,
} from '@/app/dashboard/calos/TrendMarketSelector';
import { C, MONO, SANS } from './calos-view-model';
import { Btn } from './calos-atoms';

/* ═══ CalOS v3 · campaign bar ═════════════════════════════════════════
   The founder's calos-v3.jsx campaign strip, wired to the real CalOS
   campaign + generation service. Reuses the proven CadenceEditor (create/
   edit campaign), TrendMarketSelector, and period helpers rather than
   re-porting their logic (Rule 3 — no duplicated state).

   NOTE ON GENERATION: /auto-fill and /ai-plan are server-side ONE-SHOT
   generators — they persist deliverables and return a count. The prototype's
   "preview → remove → place" modal isn't backable without a backend dry-run
   mode (out of scope for this UIUX session), so generation here is the real
   one-shot flow: pick period/market → generate → toast count → refresh. */

interface Campaign {
  _id: string;
  name: string;
  cadenceRules: CadenceRule[];
  objective?: CalosObjective;
  theme?: string;
}

type Pending = '' | 'create' | 'auto' | 'ai';

const selectStyle: React.CSSProperties = {
  height: 34, background: C.surface, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 7, padding: '0 10px', fontSize: 12.5, fontWeight: 700, fontFamily: SANS, outline: 'none',
};

export default function CalosCampaignBar({
  brandId,
  onAfterGenerate,
}: {
  brandId: string;
  onAfterGenerate: () => void;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [pending, setPending] = useState<Pending>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestedRules, setSuggestedRules] = useState<CadenceRule[]>(DEFAULT_CADENCE as CadenceRule[]);
  const [period, setPeriod] = useState<Period>('next_30_days');
  const [trendMarket, setTrendMarket] = useState(LOCAL_TREND_MARKET);
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
      const { from, to } = periodRange(period);
      const res = await fetch('/api/services/calos/auto-fill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId, from, to }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const created = data?.created ?? 0;
      toast({ title: `Filled ${created} draft${created === 1 ? '' : 's'}`, description: `${PERIOD_LABELS[period]}, from the campaign cadence.` });
      onAfterGenerate();
    } catch (err) {
      toast({ title: 'Auto-fill failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPending('');
    }
  };

  const aiPlan = async () => {
    setPending('ai');
    try {
      const { from, to } = periodRange(period);
      const res = await fetch('/api/services/calos/ai-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId: campaignId || undefined, from, to, trendLocation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || `AI plan failed (${res.status})`, description: data?.hint, variant: 'destructive' }); return; }
      const created = data?.created ?? 0;
      const trendsUsed = data?.trendsUsed ?? 0;
      const market = typeof data?.trendLocation === 'string' && data.trendLocation ? data.trendLocation : 'global';
      toast({ title: `Drafted ${created} idea${created === 1 ? '' : 's'}`, description: `${PERIOD_LABELS[period]} · ${trendsUsed} trend${trendsUsed === 1 ? '' : 's'} in ${market} via ${data?.provider ?? 'none'}.` });
      onAfterGenerate();
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
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Select campaign" className="calos-fr" style={{ ...selectStyle, maxWidth: 190 }}>
            {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
        <Btn size="sm" onClick={createCampaign} disabled={busy} title="New campaign">{pending === 'create' ? '…' : '+ Campaign'}</Btn>
        <Btn size="sm" onClick={() => setEditorOpen(true)} disabled={busy || !campaignId} title="Edit cadence">Edit cadence</Btn>
        <Btn size="sm" onClick={() => campaignId && router.push(`/dashboard/calos/campaigns/${encodeURIComponent(campaignId)}?brandId=${encodeURIComponent(brandId)}`)} disabled={busy || !campaignId} title="Open campaign workspace">Open</Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} disabled={busy} aria-label="Generation period" title="The window content is generated for" className="calos-fr" style={{ ...selectStyle, fontFamily: MONO, fontSize: 11, letterSpacing: '0.03em' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
        </select>
        <TrendMarketSelector value={trendMarket} onChange={setTrendMarket} disabled={busy} className="calos-fr calos-trend-select" />
        <Btn size="sm" onClick={autoFill} disabled={busy || !campaignId}>{pending === 'auto' ? 'Working…' : '⤢ Auto-fill'}</Btn>
        <Btn size="sm" variant="primary" onClick={aiPlan} disabled={busy || waitingForTrendLocation}>{pending === 'ai' ? 'Working…' : '✨ AI plan'}</Btn>
      </div>

      {editorOpen && selected && (
        <CadenceEditor
          campaignId={selected._id}
          brandId={brandId}
          campaignName={selected.name}
          initialRules={selected.cadenceRules}
          initialObjective={selected.objective}
          initialTheme={selected.theme}
          onClose={() => setEditorOpen(false)}
          onSaved={() => loadCampaigns()}
        />
      )}
      {createOpen && (
        <CadenceEditor
          campaignId=""
          brandId={brandId}
          campaignName=""
          initialRules={suggestedRules}
          isCreate
          onClose={() => setCreateOpen(false)}
          onSaved={(newId) => { void loadCampaigns(); if (newId) setCampaignId(newId); }}
        />
      )}
    </div>
  );
}
