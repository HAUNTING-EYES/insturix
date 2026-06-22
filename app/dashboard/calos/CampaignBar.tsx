'use client';

import { useState, useEffect, useCallback } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface Campaign {
  _id: string;
  name: string;
}

// Starter cadence for a new campaign. The cadence EDITOR (per-platform mix UI) is the next
// refinement; the campaigns PATCH API already supports editing cadenceRules.
const DEFAULT_CADENCE = [{ platform: 'linkedin', perWeek: 3, preferredDays: [1, 3, 5] }];

/**
 * Campaign picker + "Auto-fill month" for a client/brand. Selecting a campaign and clicking
 * auto-fill calls the cadence engine to drop DRAFT cards across the current month; the parent
 * refreshes the calendar via onAutoFilled.
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
  const [busy, setBusy] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns)
        ? data.campaigns.map((c: { _id: string; name: string }) => ({ _id: c._id, name: c.name }))
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

  const createCampaign = async () => {
    const name = window.prompt('Campaign name?');
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/services/calos/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, name: name.trim(), cadenceRules: DEFAULT_CADENCE }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      await loadCampaigns();
      if (data?.campaign?._id) setCampaignId(data.campaign._id);
      toast({
        title: 'Campaign created',
        description: 'Starter cadence: 3 LinkedIn/wk (Mon/Wed/Fri). A cadence editor is coming next.',
      });
    } catch (err) {
      toast({
        title: 'Failed to create campaign',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const autoFill = async () => {
    if (!campaignId) {
      toast({ title: 'Pick or create a campaign first', variant: 'destructive' });
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

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
        + Campaign
      </button>
      <button
        onClick={autoFill}
        disabled={busy || !campaignId}
        className={`${btn} bg-[#5CCCB8]/15 border-[#5CCCB8]/40 text-[#5CCCB8] hover:bg-[#5CCCB8]/25`}
      >
        {busy ? 'Working…' : 'Auto-fill month'}
      </button>
    </div>
  );
}
