'use client';

import { useState, useEffect, useCallback } from 'react';
import { startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import { type CalosObjective } from '@/lib/calos/campaign-intent';
import CadenceEditor, { type CadenceRule } from './CadenceEditor';

interface Campaign {
  _id: string;
  name: string;
  cadenceRules: CadenceRule[];
  objective?: CalosObjective;
  theme?: string;
}

type Pending = '' | 'create' | 'auto' | 'ai';

type Period = 'rest_of_month' | 'next_2_weeks' | 'next_30_days' | 'next_month';
const PERIOD_LABELS: Record<Period, string> = {
  rest_of_month: 'Rest of this month',
  next_2_weeks: 'Next 2 weeks',
  next_30_days: 'Next 30 days',
  next_month: 'Next month',
};
// The window content is generated for. Routes clamp the start to "now", so past days are never filled.
function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  if (p === 'next_month') {
    const m = addMonths(now, 1);
    return { from: startOfMonth(m).toISOString(), to: endOfMonth(m).toISOString() };
  }
  const to =
    p === 'rest_of_month' ? endOfMonth(now) : p === 'next_2_weeks' ? addDays(now, 14) : addDays(now, 30);
  return { from: now.toISOString(), to: to.toISOString() };
}

/**
 * Campaign picker + cadence editor + generate actions for a brand. "+ Campaign" opens a New
 * Campaign form (name + objective + platforms + frequency, pre-filled with a brand-aware suggestion)
 * so the user sets the mix up front. The period selector chooses the window content is generated for.
 */
export default function CampaignBar({
  brandId,
  onAutoFilled,
}: {
  brandId: string;
  onAutoFilled: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [pending, setPending] = useState<Pending>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestedRules, setSuggestedRules] = useState<CadenceRule[]>(DEFAULT_CADENCE as CadenceRule[]);
  const [period, setPeriod] = useState<Period>('next_30_days');

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns)
        ? data.campaigns.map(
            (c: {
              _id: string;
              name: string;
              cadenceRules?: CadenceRule[];
              objective?: CalosObjective;
              theme?: string;
            }) => ({
              _id: c._id,
              name: c.name,
              cadenceRules: Array.isArray(c.cadenceRules) ? c.cadenceRules : [],
              objective: c.objective,
              theme: c.theme,
            }),
          )
        : [];
      setCampaigns(list);
      setCampaignId((cur) => (cur && list.some((c) => c._id === cur) ? cur : list[0]?._id ?? ''));
    } catch {
      setCampaigns([]);
    }
  }, [brandId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const selected = campaigns.find((c) => c._id === campaignId) ?? null;

  // "+ Campaign" fetches a brand-aware cadence suggestion, then opens the New Campaign form
  // pre-filled. The form (CadenceEditor in create mode) does the actual POST on save.
  const createCampaign = async () => {
    setPending('create');
    try {
      let rules: CadenceRule[] = DEFAULT_CADENCE;
      try {
        const sres = await fetch(
          `/api/services/calos/suggest-cadence?brandId=${encodeURIComponent(brandId)}`,
          { cache: 'no-store' }
        );
        if (sres.ok) {
          const sdata = await sres.json();
          if (Array.isArray(sdata?.rules) && sdata.rules.length) rules = sdata.rules;
        }
      } catch {
        /* suggestion is best-effort — fall back to the default cadence */
      }
      setSuggestedRules(rules);
      setCreateOpen(true);
    } finally {
      setPending('');
    }
  };

  const autoFill = async () => {
    if (!campaignId) {
      toast({ title: 'Pick or create a campaign first', variant: 'destructive' });
      return;
    }
    setPending('auto');
    try {
      const { from, to } = periodRange(period);
      const res = await fetch('/api/services/calos/auto-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId, from, to }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const created = data?.created ?? 0;
      toast({
        title: `Filled ${created} draft${created === 1 ? '' : 's'}`,
        description: `${PERIOD_LABELS[period]}, from the campaign cadence.`,
      });
      onAutoFilled();
    } catch (err) {
      toast({
        title: 'Auto-fill failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPending('');
    }
  };

  const aiPlan = async () => {
    setPending('ai');
    try {
      const { from, to } = periodRange(period);
      const res = await fetch('/api/services/calos/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, campaignId: campaignId || undefined, from, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surfaces the planner's 422 (no key) with its actionable hint, not a generic failure.
        toast({
          title: data?.error || `AI plan failed (${res.status})`,
          description: data?.hint,
          variant: 'destructive',
        });
        return;
      }
      const created = data?.created ?? 0;
      const trendsUsed = data?.trendsUsed ?? 0;
      toast({
        title: `Drafted ${created} idea${created === 1 ? '' : 's'}`,
        description: `${PERIOD_LABELS[period]} · ${trendsUsed} trend${
          trendsUsed === 1 ? '' : 's'
        } via ${data?.provider ?? 'none'}.`,
      });
      onAutoFilled();
    } catch (err) {
      toast({
        title: 'AI plan failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPending('');
    }
  };

  const busy = pending !== '';
  const btn =
    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50';
  const selectCls =
    'bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5CCCB8]/40 disabled:opacity-50';

  return (
    <div className="flex items-center gap-2">
      {campaigns.length > 0 && (
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          aria-label="Select campaign"
          className={selectCls}
        >
          {campaigns.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={createCampaign}
        disabled={busy}
        className={`${btn} bg-[#1C1B19]/60 border-neutral-700/70 text-neutral-300 hover:bg-[#1C1B19]/90`}
      >
        {pending === 'create' ? 'Working…' : '+ Campaign'}
      </button>
      <button
        onClick={() => setEditorOpen(true)}
        disabled={busy || !campaignId}
        className={`${btn} bg-[#1C1B19]/60 border-neutral-700/70 text-neutral-300 hover:bg-[#1C1B19]/90`}
      >
        Edit cadence
      </button>
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        disabled={busy}
        aria-label="Generation period"
        title="The window content is generated for"
        className={selectCls}
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
      </select>
      <button
        onClick={autoFill}
        disabled={busy || !campaignId}
        className={`${btn} bg-[#5CCCB8]/15 border-[#5CCCB8]/40 text-[#5CCCB8] hover:bg-[#5CCCB8]/25`}
      >
        {pending === 'auto' ? 'Working…' : 'Auto-fill'}
      </button>
      <button
        onClick={aiPlan}
        disabled={busy}
        title="Draft on-brand ideas from your cadence + current trends for the selected period"
        className={`${btn} bg-[#D4A652]/15 border-[#D4A652]/40 text-[#D4A652] hover:bg-[#D4A652]/25`}
      >
        {pending === 'ai' ? 'Working…' : '✨ AI plan'}
      </button>

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
          onSaved={(newId) => {
            void loadCampaigns();
            if (newId) setCampaignId(newId);
          }}
        />
      )}
    </div>
  );
}
