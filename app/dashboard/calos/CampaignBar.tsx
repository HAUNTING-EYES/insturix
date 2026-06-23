'use client';

import { useState, useEffect, useCallback } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import CadenceEditor, { type CadenceRule } from './CadenceEditor';

interface Campaign {
  _id: string;
  name: string;
  cadenceRules: CadenceRule[];
}

type Pending = '' | 'create' | 'auto' | 'ai';

/**
 * Campaign picker + cadence editor + month-fill actions for a brand. Creating a campaign suggests
 * a brand-aware cadence and opens the editor so the user confirms or edits the mix before using it.
 * Auto-fill / AI-plan drop DRAFT cards across the current month; the parent refreshes via onAutoFilled.
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

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns)
        ? data.campaigns.map((c: { _id: string; name: string; cadenceRules?: CadenceRule[] }) => ({
            _id: c._id,
            name: c.name,
            cadenceRules: Array.isArray(c.cadenceRules) ? c.cadenceRules : [],
          }))
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

  const createCampaign = async () => {
    const name = window.prompt('Campaign name?');
    if (!name || !name.trim()) return;
    setPending('create');
    try {
      // Suggest a brand-aware cadence; the user confirms or edits it in the editor that opens next.
      let rules: CadenceRule[] = DEFAULT_CADENCE;
      let rationale = 'Starter cadence — confirm or tweak the mix.';
      try {
        const sres = await fetch(
          `/api/services/calos/suggest-cadence?brandId=${encodeURIComponent(brandId)}`,
          { cache: 'no-store' }
        );
        if (sres.ok) {
          const sdata = await sres.json();
          if (Array.isArray(sdata?.rules) && sdata.rules.length) rules = sdata.rules;
          if (typeof sdata?.rationale === 'string') rationale = sdata.rationale;
        }
      } catch {
        /* suggestion is best-effort — fall back to the default cadence */
      }

      const res = await fetch('/api/services/calos/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, name: name.trim(), cadenceRules: rules }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      await loadCampaigns();
      if (data?.campaign?._id) setCampaignId(data.campaign._id);
      toast({ title: 'Campaign created', description: rationale });
      setEditorOpen(true); // suggested -> then asked: open the editor to confirm or change the mix
    } catch (err) {
      toast({
        title: 'Failed to create campaign',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
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
      const now = new Date();
      const from = startOfMonth(now).toISOString();
      const to = endOfMonth(now).toISOString();
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
        description: `${format(now, 'MMMM yyyy')}, from the campaign cadence.`,
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
      const now = new Date();
      const from = startOfMonth(now).toISOString();
      const to = endOfMonth(now).toISOString();
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
        description: `${format(now, 'MMMM yyyy')} · ${trendsUsed} trend${
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

  return (
    <div className="flex items-center gap-2">
      {campaigns.length > 0 && (
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          aria-label="Select campaign"
          className="bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5CCCB8]/40"
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
      <button
        onClick={autoFill}
        disabled={busy || !campaignId}
        className={`${btn} bg-[#5CCCB8]/15 border-[#5CCCB8]/40 text-[#5CCCB8] hover:bg-[#5CCCB8]/25`}
      >
        {pending === 'auto' ? 'Working…' : 'Auto-fill month'}
      </button>
      <button
        onClick={aiPlan}
        disabled={busy}
        title="Draft a month of on-brand ideas from your cadence + current trends"
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
          onClose={() => setEditorOpen(false)}
          onSaved={loadCampaigns}
        />
      )}
    </div>
  );
}
