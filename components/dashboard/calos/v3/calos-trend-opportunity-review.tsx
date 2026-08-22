'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { C, SANS } from './calos-view-model';
import { Btn, Mono, Sheet } from './calos-atoms';
import { Select } from '@/components/primitives';

type TrendOpportunity = {
  id: string;
  candidate: { title: string; summary?: string; url?: string; platform: string; capturedAt?: string; score?: number };
  relevanceScore: number | null;
  reasonCodes: string[];
  recommendation: 'add' | 'adapt' | null;
  calendarWindowEndsAt: string | null;
  expiresAt: string;
};

type ReviewAction = 'accept' | 'dismiss' | 'snooze';

type WatchState = {
  enabled: boolean;
  publicNiche: string;
  platforms: string[];
  location: string | null;
  intervalHours: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
};

const REASON_LABELS: Record<string, string> = {
  industry_or_category: 'Industry fit',
  product_or_service: 'Product fit',
  audience: 'Audience fit',
  audience_need: 'Audience need',
  trend_momentum: 'Momentum',
  planned_card_alignment: 'Planned draft fit',
};

export function CalosTrendOpportunityReview({ brandId, brandName, onClose, onAccepted }: { brandId: string; brandName: string; onClose: () => void; onAccepted?: (deliverableId: string) => void }) {
  const [items, setItems] = useState<TrendOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snoozeDays, setSnoozeDays] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/services/calos/trend-opportunities?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Unable to load (${response.status})`);
      setItems(Array.isArray(data?.opportunities) ? data.opportunities.filter(isOpportunity) : []);
    } catch (error) {
      toast({ title: 'Trend ideas unavailable', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  // Trend-watch enrollment — the on-ramp. Without an enabled watch policy, the queue above never fills
  // (nothing feeds the watch cron), so this is what turns the whole pipeline on for the brand.
  const [watch, setWatch] = useState<WatchState | null>(null);
  const [nicheInput, setNicheInput] = useState('');
  const [savingWatch, setSavingWatch] = useState(false);

  const loadWatch = useCallback(async () => {
    try {
      const response = await fetch(`/api/services/calos/trend-watch?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const next: WatchState | null = data?.watch ?? null;
      setWatch(next);
      // Prefill from the saved policy, else the Brand-Vault-derived suggestion — the user never types it.
      setNicheInput(next?.publicNiche || (typeof data?.suggestedNiche === 'string' ? data.suggestedNiche : ''));
    } catch { /* best-effort — the toggle just starts empty */ }
  }, [brandId]);
  useEffect(() => { void loadWatch(); }, [loadWatch]);

  const saveWatch = async (enabled: boolean) => {
    setSavingWatch(true);
    try {
      // Empty niche is fine — the server fills it from the Brand Vault (only errors if the vault is empty).
      const response = await fetch('/api/services/calos/trend-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, enabled, publicNiche: nicheInput.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Failed (${response.status})`);
      setWatch(data.watch ?? null);
      toast({
        title: enabled ? 'Trend watching on' : 'Trend watching off',
        ...(enabled ? { description: 'New trends will surface here within a few hours.' } : {}),
      });
    } catch (error) {
      toast({ title: "Couldn't update trend watching", description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingWatch(false);
    }
  };

  const review = async (item: TrendOpportunity, action: ReviewAction) => {
    setBusyId(item.id);
    try {
      const response = await fetch('/api/services/calos/trend-opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          opportunityId: item.id,
          action,
          ...(action === 'snooze' ? { snoozeDays: snoozeDays[item.id] ?? 3 } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Unable to update (${response.status})`);
      if (action === 'accept') {
        const deliverableId = typeof data?.deliverableId === 'string' ? data.deliverableId : '';
        if (!deliverableId) throw new Error('Trend acceptance did not create a draft');
        onAccepted?.(deliverableId);
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      toast({ title: action === 'accept' ? 'Trend draft added' : action === 'dismiss' ? 'Trend idea dismissed' : 'Trend idea snoozed' });
    } catch (error) {
      toast({ title: 'Trend idea update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet title="Trend ideas" sub={brandName} onClose={onClose} w={760}>
      {/* Trend-watch enrollment — turns the whole pipeline on for the brand. */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, background: C.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Mono s={9} c={watch?.enabled ? C.gold : C.muted}>{watch?.enabled ? '● Trend watching ON' : 'Trend watching OFF'}</Mono>
          {watch?.enabled && <Mono s={8.5} c={C.dim}>{watch.lastScanAt ? 'scanning every few hours' : 'first scan due shortly'}</Mono>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={nicheInput}
            onChange={(event) => setNicheInput(event.target.value)}
            placeholder='From your brand vault — edit only to override'
            aria-label="Trend watch niche (from brand vault)"
            style={{ flex: 1, minWidth: 220, height: 32, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 10px', fontFamily: SANS, fontSize: 13, outline: 'none' }}
          />
          {watch?.enabled ? (
            <>
              <Btn size="sm" disabled={savingWatch} onClick={() => void saveWatch(true)}>Update</Btn>
              <Btn size="sm" variant="danger" disabled={savingWatch} onClick={() => void saveWatch(false)}>Turn off</Btn>
            </>
          ) : (
            <Btn size="sm" variant="approve" disabled={savingWatch} onClick={() => void saveWatch(true)}>Turn on</Btn>
          )}
        </div>
        {!watch?.enabled && (
          <Mono s={8.5} c={C.dim} st={{ display: 'block', marginTop: 8 }}>
            Turn on to auto-surface trends for {brandName} every few hours — matched to your brand vault. Accepted ones become draft cards.
          </Mono>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className="calos-fr"
          type="button"
          title="Refresh trend ideas"
          aria-label="Refresh trend ideas"
          onClick={() => void load()}
          disabled={loading}
          style={{ width: 30, height: 30, cursor: loading ? 'not-allowed' : 'pointer', color: C.soft, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '42px 0', textAlign: 'center' }}><Mono s={10} c={C.dim}>Loading</Mono></div>
      ) : items.length === 0 ? (
        <div style={{ padding: '42px 8px', textAlign: 'center' }}><Mono s={10} c={C.dim}>No current opportunities</Mono></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            const busy = busyId === item.id;
            const score = item.relevanceScore === null ? null : Math.round(item.relevanceScore * 100);
            const expires = expiryLabel(item.expiresAt);
            return (
              <article key={item.id} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${item.recommendation === 'adapt' ? C.gold : C.green}`, borderRadius: 8, padding: 14, background: C.surface }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <Mono s={8.5} c={C.gold}>{item.recommendation === 'adapt' ? 'Adapt draft' : 'Add idea'}</Mono>
                      <Mono s={8.5} c={C.muted}>{item.candidate.platform}</Mono>
                      {score !== null && <Mono s={8.5} c={C.muted}>{score}% fit</Mono>}
                      <Mono s={8.5} c={C.dim}>{expires}</Mono>
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{item.candidate.title}</div>
                    {item.candidate.summary && <div style={{ marginTop: 6, color: C.soft, fontSize: 13, lineHeight: 1.45 }}>{item.candidate.summary}</div>}
                    {item.reasonCodes.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{item.reasonCodes.map((reason) => <span key={reason} style={{ color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 6px', fontFamily: 'monospace', fontSize: 9 }}>{REASON_LABELS[reason] ?? reason}</span>)}</div>}
                  </div>
                  {item.candidate.url && <a href={item.candidate.url} target="_blank" rel="noreferrer" title="Open trend source" aria-label="Open trend source" style={{ color: C.gold, display: 'inline-flex', padding: 3 }}><ExternalLink size={15} aria-hidden="true" /></a>}
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 13, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="approve" disabled={busy} onClick={() => void review(item, 'accept')}><Check size={13} aria-hidden="true" />Accept</Btn>
                  <div style={{ width: 104 }}>
                    <Select size="sm" aria-label={`Snooze ${item.candidate.title}`} disabled={busy}
                      value={String(snoozeDays[item.id] ?? 3)}
                      onChange={(v) => setSnoozeDays((current) => ({ ...current, [item.id]: Number(v) }))}
                      options={[{ value: '1', label: '1 day' }, { value: '3', label: '3 days' }, { value: '7', label: '7 days' }]} />
                  </div>
                  <Btn size="sm" disabled={busy} onClick={() => void review(item, 'snooze')}><Clock3 size={13} aria-hidden="true" />Snooze</Btn>
                  <Btn size="sm" variant="danger" disabled={busy} onClick={() => void review(item, 'dismiss')}><XCircle size={13} aria-hidden="true" />Dismiss</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function isOpportunity(value: unknown): value is TrendOpportunity {
  if (!value || typeof value !== 'object') return false;
  const item = value as TrendOpportunity;
  return typeof item.id === 'string' && typeof item.candidate?.title === 'string' && typeof item.candidate?.platform === 'string';
}

function expiryLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Current';
  const days = Math.max(0, Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1_000)));
  return days === 0 ? 'Today' : `${days}d left`;
}