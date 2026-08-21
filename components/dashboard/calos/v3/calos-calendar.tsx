'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCalosDeliverables } from '@/app/dashboard/calos/hooks/useCalosDeliverables';
import { toast } from '@/hooks/use-toast';
import {
  C, MONO, SANS, DOW, PLAT, STAGES,
  toItem, toPlacements, groupPlacementsByDay, monthCells, weekDays, dateKey, sameDay,
  monthTitle, dayTitle, addMonths, addDays, platGlyph, platLabel, stageLabel, stageTick, platformDefaultAspect,
} from './calos-view-model';
import type { CalItem, Placement } from './calos-view-model';
import { Mono, Glyph, StatusMark, Btn, Chip, Confirm } from './calos-atoms';
import { ContentModal } from './calos-content-modal';
import CalosCampaignBar from './calos-campaign-bar';
import { CalosWorkspace, type WorkspaceCampaign } from './calos-workspace';
import { CalosShareScreen } from './calos-share-screen';
import { CalosCadenceModal } from './calos-cadence-modal';
import BrandConnections from '@/app/dashboard/calos/BrandConnections';
import { CalosBrandReferencesModal } from './calos-brand-references-modal';
import { useActiveBrand } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { CalosTrendOpportunityReview } from './calos-trend-opportunity-review';
import type { PublishStatusLoadState } from './calos-delivery-state';

/* ═══ CalOS v3 · calendar (Phase 1 spine) ═════════════════════════════
   The founder's calos-v3.jsx design, wired to the real deliverables service.
   Real month/week/day navigation replaces the prototype's fixed March 2026;
   every mutation flows through useCalosDeliverables + the /decision, /generate,
   and /client-view endpoints. Campaign bar, generation modals, publishing,
   workspace, and the read-only Share screen land in Phases 2–3. */

const DEFAULT_BRAND = 'default'; // personal space when the user has no explicit brand

type View = 'month' | 'week' | 'day';
type PublishState = {
  platform: string;
  status: string;
  postUrl: string | null;
  error: string | null;
  accountRef: string | null;
  canRetry: boolean;
};
type ConnectionHealth = {
  state: 'assigned' | 'attention' | 'reconnect';
  accountRef: string | null;
  displayName: string | null;
  message: string | null;
};

export default function CalosCalendarV3() {
  const router = useRouter();
  // Brand list + selection come from the GLOBAL ActiveBrandProvider (union of editron + scanned
  // Brand Vault brands, shared across the whole dashboard). CalOS used to fetch only the editron
  // registry, so a scanned brand was invisible here → the "shows Personal despite a scan" bug.
  const { brands, activeBrandId, setActiveBrandId, isLoading: brandLoading } = useActiveBrand();
  const brandId = activeBrandId ?? DEFAULT_BRAND;
  const [brandOpen, setBrandOpen] = useState(false);

  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [selDay, setSelDay] = useState(() => new Date());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    null | { kind: 'clearall' } | { kind: 'deleteday'; date: Date } | { kind: 'retrypublish'; id: string }
  >(null);
  const [screen, setScreen] = useState<'calendar' | 'workspace' | 'share'>('calendar');
  const [wsCampaign, setWsCampaign] = useState<WorkspaceCampaign | null>(null);
  const [wsEditOpen, setWsEditOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [brandRefsOpen, setBrandRefsOpen] = useState(false);
  const [trendOpportunitiesOpen, setTrendOpportunitiesOpen] = useState(false);
  const [pubStatus, setPubStatus] = useState<Record<string, PublishState>>({});
  const [pubStatusLoadState, setPubStatusLoadState] = useState<PublishStatusLoadState>('loading');
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [connectionHealth, setConnectionHealth] = useState<Record<string, ConnectionHealth>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<string | null>(null);
  const pubStatusFailureShownRef = useRef(false);

  // Self-updating "today" so a session left open past midnight rolls over (checks each minute,
  // only re-renders when the calendar day actually changes).
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setToday((prev) => {
        const now = new Date();
        return prev.getDate() === now.getDate() && prev.getMonth() === now.getMonth() && prev.getFullYear() === now.getFullYear()
          ? prev
          : now;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const { cards, loading, error: loadError, createCard, updateCard, deleteCard, deleteCardsForDate, clearAll, refresh } =
    useCalosDeliverables(brandId);

  const items = useMemo(() => cards.map(toItem), [cards]);
  // Search + stage filter apply to the grid (not the review rail, which is the fixed "needs you" queue).
  const q = search.trim().toLowerCase();
  const visibleItems = useMemo(
    () => items.filter((it) => {
      if (filterStage && it.stage !== filterStage) return false;
      if (q && !(it.title.toLowerCase().includes(q) || it.tags.some((t) => t.toLowerCase().includes(q)))) return false;
      return true;
    }),
    [items, filterStage, q],
  );
  const placements = useMemo(() => toPlacements(visibleItems), [visibleItems]);
  const byDay = useMemo(() => groupPlacementsByDay(placements), [placements]);
  const reviews = useMemo(() => items.filter((d) => d.stage === 'in_review'), [items]);
  const openItem = useMemo(() => items.find((d) => d.id === openId) ?? null, [items, openId]);

  const brandName = brands.find((b) => b.brandId === brandId)?.name ?? 'Personal';
  const brandInitials = brandName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const selectBrand = (id: string) => {
    setActiveBrandId(id); // writes the shared context + localStorage (brand_vault_selected_brand_id)
    setBrandOpen(false);
  };

  // Delivery visibility: per-card publish state + which platforms are connected, so an approved
  // card isn't a black box and we can prompt "connect X to publish" instead of failing silently.
  const loadPubStatus = React.useCallback(async (signal?: AbortSignal, background = false) => {
    if (!brandId) return;
    if (!background) setPubStatusLoadState('loading');
    try {
      const res = await fetch(`/api/services/calos/publish-status?brandId=${encodeURIComponent(brandId)}`, {
        cache: 'no-store',
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (signal?.aborted) return;
      if (!res.ok) throw new Error(data?.error || `Publishing status failed (${res.status})`);
      setPubStatus(data?.statuses && typeof data.statuses === 'object' ? data.statuses : {});
      setConnectedPlatforms(Array.isArray(data?.connectedPlatforms) ? data.connectedPlatforms : []);
      setConnectionHealth(data?.connectionHealth && typeof data.connectionHealth === 'object' ? data.connectionHealth : {});
      setPubStatusLoadState('ready');
      pubStatusFailureShownRef.current = false;
    } catch (error) {
      if (signal?.aborted) return;
      setPubStatusLoadState('error');
      if (!pubStatusFailureShownRef.current) {
        pubStatusFailureShownRef.current = true;
        toast({
          title: 'Publishing status unavailable',
          description: error instanceof Error ? error.message : 'Could not verify scheduled posts.',
          variant: 'destructive',
        });
      }
    }
  }, [brandId]);
  useEffect(() => {
    setPubStatus({});
    setPubStatusLoadState('loading');
    setConnectedPlatforms([]);
    setConnectionHealth({});
    pubStatusFailureShownRef.current = false;
    const controller = new AbortController();
    void loadPubStatus(controller.signal);
    return () => controller.abort();
  }, [loadPubStatus]);

  const hasActivePublish = useMemo(
    () => Object.values(pubStatus).some((state) => state.status === 'claimed' || state.status === 'publishing'),
    [pubStatus],
  );
  useEffect(() => {
    if (!hasActivePublish) return;
    const id = setInterval(() => { void loadPubStatus(undefined, true); }, 8_000);
    return () => clearInterval(id);
  }, [hasActivePublish, loadPubStatus]);

  // Auto-refresh while an image job is in flight, so the finished still lands on the card without a
  // manual reload. Polls (every 12s) only while at least one card is 'generating'; stops as soon as
  // none are, so an idle calendar makes no requests.
  const anyImageGenerating = useMemo(
    () => items.some((it) => it.raw.imageStatus === 'generating'),
    [items],
  );
  const refreshRef = React.useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!anyImageGenerating) return;
    const id = setInterval(() => { void refreshRef.current(); }, 12_000);
    return () => clearInterval(id);
  }, [anyImageGenerating]);

  /* ── mutations ── */
  const handleDecision = async (id: string, decision: 'approved' | 'changes_requested') => {
    if (!brandId) return false;
    try {
      const res = await fetch(`/api/services/calos/deliverables/${encodeURIComponent(id)}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error || `Decision failed (${res.status})`, variant: 'destructive' });
        if (data?.card) refresh();
        return false;
      }
      if (decision === 'approved') {
        if (data?.publish?.queued) {
          toast({ title: 'Approved — queued to publish' });
        } else {
          toast({ title: 'Approved', description: 'This content type is not configured for auto-publishing.' });
        }
        void loadPubStatus();
      } else {
        toast({ title: 'Sent back for changes' });
      }
      refresh();
      return true;
    } catch (err) {
      toast({ title: 'Decision failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      return false;
    }
  };

  const handleSaveTitle = (id: string, title: string) => { updateCard(id, { title }); };
  const handleSaveDetails = (id: string, details: string) => { updateCard(id, { details }); };
  const handleSaveTags = (id: string, customTags: string[]) => { updateCard(id, { customTags }); };
  // Multi-date scheduling: keep the primary `date` in sync with the earliest planned date.
  const handleSaveDates = (id: string, plannedDates: string[]) => {
    if (plannedDates.length === 0) return;
    const sorted = [...plannedDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    updateCard(id, { plannedDates: sorted, date: sorted[0] });
  };

  // Drag-to-reschedule (month grid): drag a placement onto another day → move that one
  // planned date to the drop day, keeping its time. Multi-date items only move the dragged date.
  const dragRef = useRef<{ itemId: string; fromISO: string } | null>(null);
  const onChipDragStart = (e: React.DragEvent, pl: Placement) => {
    dragRef.current = { itemId: pl.item.id, fromISO: pl.date.toISOString() };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pl.item.id);
  };
  const onCellDrop = (cell: Date) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const item = items.find((it) => it.id === drag.itemId);
    if (!item) return;
    const from = new Date(drag.fromISO);
    if (Number.isNaN(from.getTime()) || sameDay(from, cell)) return;
    const moved = new Date(cell.getFullYear(), cell.getMonth(), cell.getDate(), from.getHours(), from.getMinutes()).toISOString();
    const next = item.dates.map((d) => d.toISOString()).filter((iso) => iso !== drag.fromISO);
    if (!next.includes(moved)) next.push(moved);
    handleSaveDates(item.id, next);
  };

  const handleGenerate = async (id: string) => {
    if (!brandId) return;
    try {
      const res = await fetch('/api/services/calos/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, deliverableId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || `Generate failed (${res.status})`, variant: 'destructive' }); return; }
      toast(data?.generatorWired
        ? { title: 'Draft generated', description: `via ${data.routedTo}.` }
        : { title: `Routed to ${data.routedTo}`, description: data?.message });
      refresh();
    } catch (err) {
      toast({ title: 'Generate failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleMakeImage = async (id: string, aspectRatio: string) => {
    if (!brandId) return;
    try {
      const res = await fetch('/api/services/calos/make-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, deliverableId: id, aspectRatio }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || `Couldn't start image (${res.status})`, variant: 'destructive' }); return; }
      toast({ title: 'Image generating', description: 'It lands on the card when it’s ready.' });
      refresh();
    } catch (err) {
      toast({ title: 'Image kickoff failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  // Cards whose caption is written + image prompt stashed but no image made yet — the batch target.
  const pendingImageItems = useMemo(
    () => items.filter((it) => it.raw.imageStatus === 'promptReady'),
    [items],
  );
  // Batch: make an image for every promptReady card, one by one (never spikes credits), each at its
  // platform's default aspect. The in-flight poll then surfaces them as they finish.
  const handleMakeAllImages = async () => {
    if (!brandId || !pendingImageItems.length) return;
    let ok = 0;
    for (const it of pendingImageItems) {
      try {
        const res = await fetch('/api/services/calos/make-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, deliverableId: it.id, aspectRatio: platformDefaultAspect(it.platform) }),
        });
        if (res.ok) ok++;
      } catch { /* continue — one card failing must not abort the batch */ }
    }
    refresh();
    toast({
      title: `Started ${ok}/${pendingImageItems.length} image${pendingImageItems.length === 1 ? '' : 's'}`,
      description: ok < pendingImageItems.length ? 'Some couldn’t start — open them to retry.' : 'They’ll appear as they finish.',
      ...(ok === 0 ? { variant: 'destructive' as const } : {}),
    });
  };

  const handleDelete = async (id: string) => { await deleteCard(id); };

  const handleNew = async () => {
    const base = view === 'day' ? selDay : today;
    const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 0);
    const iso = when.toISOString();
    const created = await createCard({
      title: 'Untitled content', date: iso, plannedDates: [iso],
      platform: 'generic', status: 'draft', editorialStatus: 'idea', tags: [], customTags: [],
    });
    if (created) setOpenId(created.id);
  };

  const handleOpenScript = (item: CalItem) => {
    // Deep-link to the deliverable's ThinkForge session when it has one (matches the live
    // CalOS wiring: /dashboard/thinkforge?sessionId=). No session yet → the editor landing.
    const sessionId = item.raw.sessionId;
    router.push(sessionId ? `/dashboard/thinkforge?sessionId=${encodeURIComponent(sessionId)}` : '/dashboard/thinkforge');
  };

  const handleShare = async () => {
    if (!brandId) return;
    try {
      const res = await fetch('/api/services/calos/client-view', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) { toast({ title: data?.error || `Couldn't create link (${res.status})`, variant: 'destructive' }); return; }
      try { await navigator.clipboard.writeText(data.url); toast({ title: 'Client link copied', description: 'Read-only calendar link is on your clipboard.' }); }
      catch { toast({ title: 'Client link ready', description: data.url }); }
    } catch (err) {
      toast({ title: 'Share failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const doClearAll = async () => {
    setConfirm(null);
    const n = await clearAll();
    if (n > 0) toast({ title: `Cleared ${n} item${n === 1 ? '' : 's'}`, description: 'Calendar cleanup complete.' });
    else toast({ title: 'Calendar already clear' });
  };
  const doDeleteDay = async (date: Date) => {
    setConfirm(null);
    const n = await deleteCardsForDate(date);
    if (n > 0) toast({ title: `Cleared ${n} item${n === 1 ? '' : 's'}`, description: dayTitle(date) });
  };
  const doRetryPublish = async (id: string) => {
    if (retryingId) return;
    setConfirm(null);
    setRetryingId(id);
    try {
      const res = await fetch('/api/services/calos/publish-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, deliverableId: id, confirmPossibleDuplicate: true }),
      });
      const data = await res.json().catch(() => ({}));
      await loadPubStatus();
      if (!res.ok) {
        toast({ title: data?.error || `Publish retry failed (${res.status})`, variant: 'destructive' });
        return;
      }
      toast({ title: 'Publish retry queued' });
    } catch (err) {
      toast({
        title: 'Publish retry failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const gotoPrev = () => view === 'month' ? setCursor((c) => addMonths(c, -1)) : setSelDay((d) => addDays(d, view === 'week' ? -7 : -1));
  const gotoNext = () => view === 'month' ? setCursor((c) => addMonths(c, 1)) : setSelDay((d) => addDays(d, view === 'week' ? 7 : 1));
  const gotoToday = () => { setView('day'); setSelDay(today); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); };

  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const wk = useMemo(() => weekDays(selDay), [selDay]);
  const selDayPlacements = byDay.get(dateKey(selDay)) ?? [];
  // A failed load must never read as an empty calendar ("No content yet" on a
  // server error tells an agency their month is gone) — error wins over empty.
  const isEmpty = !loading && !loadError && items.length === 0;

  const controlTitle =
    view === 'day' ? dayTitle(selDay) :
    view === 'week' ? `Week of ${dayTitle(wk[0])}` :
    monthTitle(cursor);

  return (
    <div className="calos" style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        .calos *{box-sizing:border-box}
        .calos-fr:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
        .calos-chip:hover{border-color:${C.bs};background:#181614}
        .calos-ns::-webkit-scrollbar{height:7px;width:7px}.calos-ns::-webkit-scrollbar-thumb{background:${C.bs};border-radius:4px}
        .calos-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
        .calos-tw{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .calos-wrap{display:grid;grid-template-columns:minmax(190px,18%) minmax(0,1fr);gap:16px;align-items:start}
        .calos-trend-select{height:34px;max-width:180px;background:${C.surface};color:${C.soft};border:1px solid ${C.border};border-radius:7px;padding:0 10px;font-family:${MONO};font-size:11px;letter-spacing:0.03em;outline:none;cursor:pointer}
        .calos-trend-select:disabled{opacity:.5;cursor:not-allowed}
        @keyframes calos-tin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @media(max-width:1024px){.calos-min{min-width:820px}.calos-wrap{grid-template-columns:1fr}}
      `}</style>

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '16px clamp(12px,2.5vw,24px) 60px' }}>
        {/* ═ HEADER ═ */}
        <div className="calos-tw" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <button className="calos-fr" onClick={() => setBrandOpen((o) => !o)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px' }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: C.well, border: `1px solid ${C.bs}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{brandInitials || 'ME'}</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{brandName}</div>
                <Mono s={8.5} c={C.dim}>CalOS</Mono>
              </div>
              <span style={{ color: C.muted }}>▾</span>
            </button>
            {brandOpen && brands.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: C.raised, border: `1px solid ${C.bs}`, borderRadius: 10, padding: 6, width: 240 }}>
                {brands.map((b) => (
                  <button key={b.brandId} className="calos-fr" onClick={() => selectBrand(b.brandId)} style={{ cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: b.brandId === brandId ? 'rgba(212,166,82,.08)' : 'transparent', border: `1px solid ${b.brandId === brandId ? 'rgba(212,166,82,.4)' : 'transparent'}`, borderRadius: 7, textAlign: 'left' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: C.well, border: `1px solid ${C.bs}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, color: C.soft }}>{b.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: b.brandId === brandId ? C.text : C.soft }}>{b.name}</span>
                    {b.brandId === brandId && <span style={{ marginLeft: 'auto', color: C.gold }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="calos-fr" title={`${reviews.length} awaiting review`} onClick={() => toast({ title: reviews.length ? `${reviews.length} awaiting your review` : 'Nothing to review' })} style={{ position: 'relative', cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, color: C.soft }}>◔
              {reviews.length > 0 && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: C.gold, color: '#241B08', fontFamily: MONO, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{reviews.length}</span>}
            </button>
            <Btn size="sm" onClick={() => setTrendOpportunitiesOpen(true)}>Trend ideas</Btn>
            <Btn size="sm" onClick={() => setScreen('share')}>Share</Btn>
            <Btn size="sm" onClick={() => setBrandRefsOpen(true)}>References</Btn>
            <Btn size="sm" onClick={() => setConnectionsOpen(true)}>Publishing</Btn>
            <Btn size="sm" variant="danger" onClick={() => setConfirm({ kind: 'clearall' })}>Clear all</Btn>
          </div>
        </div>

        {screen === 'share' ? (
          <CalosShareScreen brandName={brandName} monthLabel={monthTitle(cursor)} cells={cells} byDay={byDay} today={today} onBack={() => setScreen('calendar')} onCopyLink={handleShare} />
        ) : screen === 'workspace' && wsCampaign ? (
          <CalosWorkspace campaign={wsCampaign} items={items.filter((it) => it.raw.campaignId === wsCampaign._id)} onBack={() => setScreen('calendar')} onEditCadence={() => setWsEditOpen(true)} onOpen={(id) => setOpenId(id)} />
        ) : (
        <>
        {/* ═ CAMPAIGN BAR ═ */}
        {brandId && <CalosCampaignBar brandId={brandId} onAfterGenerate={refresh} onOpenWorkspace={(c) => { setWsCampaign(c); setScreen('workspace'); }} />}

        {/* ═ CONTROL BAR ═ */}
        <div className="calos-tw" style={{ padding: 10, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="calos-fr" onClick={gotoPrev} style={{ cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 30, height: 30, color: C.soft }}>‹</button>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', minWidth: 150 }}>{controlTitle}</div>
            <button className="calos-fr" onClick={gotoNext} style={{ cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 30, height: 30, color: C.soft }}>›</button>
            <Btn size="sm" onClick={gotoToday}>Today</Btn>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: 2 }}>
              {(['month', 'week', 'day'] as View[]).map((v) => (
                <button key={v} className="calos-fr" onClick={() => setView(v)} style={{ cursor: 'pointer', border: 'none', borderRadius: 5, padding: '6px 12px', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', background: view === v ? C.gold : 'transparent', color: view === v ? '#241B08' : C.muted, fontWeight: view === v ? 700 : 400 }}>{v}</button>
              ))}
            </div>
            {pendingImageItems.length > 0 && (
              <Btn size="sm" onClick={handleMakeAllImages} title="Make images for every card whose prompt is ready">🎨 All images ({pendingImageItems.length})</Btn>
            )}
            <Btn size="sm" variant="primary" onClick={handleNew}>+ New</Btn>
          </div>
        </div>

        {/* ═ SEARCH + STAGE FILTER ═ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or #tag"
            aria-label="Search content"
            className="calos-fr"
            style={{ height: 32, minWidth: 200, flex: '0 1 240px', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0 10px', fontSize: 12.5, fontFamily: SANS, outline: 'none' }}
          />
          <select
            value={filterStage ?? ''}
            onChange={(e) => setFilterStage(e.target.value || null)}
            aria-label="Filter by stage"
            className="calos-fr"
            style={{ height: 32, background: C.surface, color: filterStage ? C.gold : C.soft, border: `1px solid ${filterStage ? 'rgba(212,166,82,.4)' : C.border}`, borderRadius: 7, padding: '0 10px', fontSize: 12, fontFamily: MONO, outline: 'none' }}
          >
            <option value="">All stages</option>
            {[...STAGES, 'changes_requested'].map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
          {(search || filterStage) && (
            <>
              <Btn size="sm" onClick={() => { setSearch(''); setFilterStage(null); }}>Clear</Btn>
              <Mono s={9} c={C.dim}>{visibleItems.length} shown</Mono>
            </>
          )}
        </div>

        {(brandLoading || loading) && items.length === 0 ? (
          <div style={{ border: `1px dashed ${C.bs}`, borderRadius: 14, padding: '58px 24px', textAlign: 'center' }}>
            <Mono s={11} c={C.dim}>Loading calendar…</Mono>
          </div>
        ) : (
          <>
            {/* Load failure — distinct from empty, with a retry. */}
            {loadError && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '11px 14px', background: 'rgba(212,106,92,0.08)', border: `1px solid rgba(212,106,92,0.35)`, borderRadius: 10, marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.coral }}>Couldn&apos;t load the calendar.</span>
                  <span style={{ color: C.soft, fontSize: 13.5, marginLeft: 8 }}>{loadError} — your content is still there.</span>
                </div>
                <Btn size="sm" variant="ghost" onClick={refresh}>Retry</Btn>
              </div>
            )}

            {/* First-run hint — a slim banner, never replaces the dated grid. */}
            {isEmpty && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '11px 14px', background: C.raised, border: `1px dashed ${C.bs}`, borderRadius: 10, marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>No content for {brandName} yet.</span>
                  <span style={{ color: C.soft, fontSize: 13.5, marginLeft: 8 }}>Add your first deliverable to start building the month.</span>
                </div>
                <Btn size="sm" variant="primary" onClick={handleNew}>+ New content</Btn>
              </div>
            )}

            {/* cadence legend (month) */}
            {view === 'month' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Mono s={9} c={C.muted}>Cadence</Mono>
                <span style={{ display: 'flex', gap: 4 }}>{[0, 1, 2, 3].map((n) => <span key={n} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: C.raised, backgroundImage: n ? `linear-gradient(0deg,rgba(212,166,82,${Math.min(0.18, n * 0.055)}),rgba(212,166,82,${Math.min(0.18, n * 0.055)}))` : 'none', border: `1px solid ${C.border}` }} />)}</span>
                <Mono s={8.5} c={C.dim}>empty → gap · warmer → busier</Mono>
              </div>
            )}

            {/* ═ MONTH ═ */}
            {view === 'month' && (
              <div className="calos-wrap">
                <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}><span style={{ fontWeight: 800, fontSize: 26, color: C.gold, lineHeight: 1 }}>{reviews.length}</span><Mono s={9} c={C.muted}>to review</Mono></div>
                  <Mono s={8.5} c={C.dim} st={{ display: 'block', marginBottom: 12 }}>Needs you now</Mono>
                  <div className="calos-ns" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
                    {reviews.map((d) => (
                      <div key={d.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.gold}`, borderRadius: 7, padding: 9 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><Glyph p={d.platform} act /><Mono s={8} c={C.muted}>{dayTitle(d.date)}</Mono><span style={{ marginLeft: 'auto' }}><Mono s={8.5} c={C.muted}>{d.score}</Mono></span></div>
                        <button className="calos-fr" onClick={() => setOpenId(d.id)} style={{ cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', color: C.text, fontWeight: 700, fontSize: 12.5, padding: 0, marginBottom: 9, lineHeight: 1.25 }}>{d.title}</button>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="calos-fr" onClick={() => handleDecision(d.id, 'approved')} style={{ cursor: 'pointer', flex: 1, padding: '5px 0', borderRadius: 5, background: 'transparent', border: '1px solid rgba(94,201,126,.4)', color: C.green, fontFamily: MONO, fontSize: 9 }}>✓ OK</button>
                          <button className="calos-fr" onClick={() => handleDecision(d.id, 'changes_requested')} style={{ cursor: 'pointer', flex: 1, padding: '5px 0', borderRadius: 5, background: 'transparent', border: '1px solid rgba(212,106,92,.4)', color: C.coral, fontFamily: MONO, fontSize: 9 }}>CHANGES</button>
                        </div>
                      </div>
                    ))}
                    {reviews.length === 0 && <Mono s={10} c={C.dim}>All clear.</Mono>}
                  </div>
                </div>
                <div className="calos-ns" style={{ overflowX: 'auto' }}><div className="calos-min">
                  <div className="calos-grid" style={{ marginBottom: 6 }}>{DOW.map((d) => <div key={d} style={{ padding: '0 4px 6px' }}><Mono s={9} c={C.dim}>{d}</Mono></div>)}</div>
                  <div className="calos-grid" style={{ gap: 6 }}>
                    {cells.map((cell, i) => {
                      const evs = cell ? (byDay.get(dateKey(cell)) ?? []) : [];
                      const isToday = cell ? sameDay(cell, today) : false;
                      const wknd = i % 7 === 0 || i % 7 === 6;
                      const inten = Math.min(0.16, evs.length * 0.05);
                      return (
                        <div key={i} onClick={() => cell && (setView('day'), setSelDay(cell))} onDragOver={(e) => { if (cell) e.preventDefault(); }} onDrop={() => cell && onCellDrop(cell)} style={{ minHeight: 118, borderRadius: 8, padding: 7, cursor: cell ? 'pointer' : 'default', backgroundColor: !cell ? 'transparent' : wknd ? C.bg : C.raised, backgroundImage: evs.length ? `linear-gradient(0deg,rgba(212,166,82,${inten}),rgba(212,166,82,${inten}))` : 'none', border: `1px solid ${isToday ? C.gold : cell ? C.border : 'transparent'}`, opacity: cell ? 1 : 0.3, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {cell && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? C.gold : C.muted }}>{String(cell.getDate()).padStart(2, '0')}</span>{evs.length > 0 && <Mono s={8} c={C.dim}>{evs.length}</Mono>}</div>}
                          {evs.slice(0, 3).map((pl) => <Chip key={`${pl.item.id}-${pl.date.toISOString()}`} d={pl.item} draggable onDragStart={(e) => onChipDragStart(e, pl)} onClick={(e) => { e.stopPropagation(); setOpenId(pl.item.id); }} />)}
                          {evs.length > 3 && cell && <button className="calos-fr" onClick={(e) => { e.stopPropagation(); setView('day'); setSelDay(cell); }} style={{ cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', padding: '1px 4px' }}><Mono s={9} c={C.gold}>+{evs.length - 3} more</Mono></button>}
                        </div>
                      );
                    })}
                  </div>
                </div></div>
              </div>
            )}

            {/* ═ WEEK ═ */}
            {view === 'week' && (
              <div className="calos-ns" style={{ overflowX: 'auto' }}><div style={{ minWidth: 780 }}>
                <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${wk.length},1fr)`, gap: 6, marginBottom: 6 }}><div />{wk.map((dn) => <div key={dateKey(dn)} style={{ textAlign: 'center', padding: '6px 0', borderRadius: 6, border: `1px solid ${sameDay(dn, today) ? C.gold : 'transparent'}` }}><Mono s={8.5} c={C.dim}>{DOW[dn.getDay()]}</Mono><div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: sameDay(dn, today) ? C.gold : C.soft }}>{dn.getDate()}</div></div>)}</div>
                {Object.keys(PLAT).map((p) => {
                  const rowPlacements = placements.filter((pl) => pl.item.platform === p && wk.some((wd) => sameDay(wd, pl.date)));
                  if (rowPlacements.length === 0) return null;
                  return (
                    <div key={p} style={{ display: 'grid', gridTemplateColumns: `60px repeat(${wk.length},1fr)`, gap: 6, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Glyph p={p} /><Mono s={8} c={C.faint}>{platGlyph(p)}</Mono></div>
                      {wk.map((dn) => <div key={dateKey(dn)} style={{ minHeight: 54, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>{rowPlacements.filter((pl) => sameDay(pl.date, dn)).map((pl) => <Chip key={`${pl.item.id}-${pl.date.toISOString()}`} d={pl.item} compact onClick={() => setOpenId(pl.item.id)} />)}</div>)}
                    </div>
                  );
                })}
              </div></div>
            )}

            {/* ═ DAY ═ */}
            {view === 'day' && (
              <div style={{ maxWidth: 640 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>{selDayPlacements.length > 0 && <Btn size="sm" variant="danger" onClick={() => setConfirm({ kind: 'deleteday', date: selDay })}>Delete day</Btn>}</div>
                {selDayPlacements.length === 0 ? (
                  <div style={{ border: `1px dashed ${C.bs}`, borderRadius: 12, padding: '50px 20px', textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 20 }}>Nothing on {dayTitle(selDay)}.</div><div style={{ color: C.soft, marginTop: 6, fontSize: 14 }}>A gap — fill it.</div><div style={{ marginTop: 18 }}><Btn variant="primary" onClick={handleNew}>+ New content</Btn></div></div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 74 }}><div style={{ position: 'absolute', left: 70, top: 8, bottom: 8, width: 1.5, background: C.border }} />
                    {selDayPlacements.map((pl) => { const d = pl.item; return (
                      <div key={`${d.id}-${pl.date.toISOString()}`} style={{ position: 'relative', marginBottom: 12 }}>
                        <span style={{ position: 'absolute', left: -74, top: 14, fontFamily: MONO, fontSize: 11, color: C.dim, width: 40, textAlign: 'right' }}>{pl.time}</span>
                        <span style={{ position: 'absolute', left: -8, top: 15, width: 11, height: 11, borderRadius: '50%', background: d.stage === 'approved' ? C.gold : C.bg, border: `1.5px solid ${d.stage === 'approved' || d.stage === 'in_review' ? C.gold : C.muted}`, zIndex: 2 }} />
                        <button className="calos-fr" onClick={() => setOpenId(d.id)} style={{ cursor: 'pointer', width: '100%', textAlign: 'left', background: C.raised, border: `1px solid ${C.border}`, borderLeft: `2px solid ${stageTick(d.stage)}`, borderRadius: 9, padding: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Glyph p={d.platform} /><Mono s={8.5} c={C.muted}>{platLabel(d.platform)}</Mono><span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}><Mono s={9} c={C.muted}>{d.score}</Mono><StatusMark stage={d.stage} /></span></div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{d.title}</div>
                          <Mono s={8.5} c={C.dim} st={{ display: 'block', marginTop: 6 }}>{stageLabel(d.stage)}</Mono>
                        </button>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      {openItem && (
        <ContentModal
          key={openItem.id}
          item={openItem}
          onClose={() => setOpenId(null)}
          onSaveTitle={handleSaveTitle}
          onSaveDates={handleSaveDates}
          onSaveDetails={handleSaveDetails}
          onSaveTags={handleSaveTags}
          onDecision={handleDecision}
          onGenerate={handleGenerate}
          onMakeImage={handleMakeImage}
          onDelete={handleDelete}
          onOpenScript={handleOpenScript}
          pubState={pubStatus[openItem.id]}
          publishStatusLoadState={pubStatusLoadState}
          connected={connectedPlatforms.includes(openItem.platform)}
          connectionHealth={connectionHealth[openItem.platform]}
          retrying={retryingId === openItem.id}
          onRequestRetry={(id) => setConfirm({ kind: 'retrypublish', id })}
          onRefreshPublishing={() => void loadPubStatus()}
          onOpenPublishing={() => { setOpenId(null); setConnectionsOpen(true); }}
        />
      )}
      {confirm?.kind === 'clearall' && (
        <Confirm title="Clear all" msg={`Remove every deliverable from ${brandName}'s calendar? This can't be undone.`} confirmLabel="Clear all" onClose={() => setConfirm(null)} onConfirm={doClearAll} />
      )}
      {confirm?.kind === 'deleteday' && (
        <Confirm title="Delete day" msg={`Delete all content on ${dayTitle(confirm.date)}?`} confirmLabel="Delete day" onClose={() => setConfirm(null)} onConfirm={() => doDeleteDay(confirm.date)} />
      )}
      {confirm?.kind === 'retrypublish' && (
        <Confirm
          title="Retry publish"
          msg="Retry this failed post? If the platform accepted the earlier request before timing out, retrying can create a duplicate."
          confirmLabel="Retry publish"
          onClose={() => setConfirm(null)}
          onConfirm={() => void doRetryPublish(confirm.id)}
        />
      )}
      {wsEditOpen && wsCampaign && brandId && (
        <CalosCadenceModal campaign={wsCampaign} brandId={brandId} onClose={() => setWsEditOpen(false)} onSaved={() => { setWsEditOpen(false); refresh(); }} />
      )}
      {brandId && (
        <BrandConnections brandId={brandId} brandName={brandName} open={connectionsOpen} onClose={() => setConnectionsOpen(false)} />
      )}
      {brandId && trendOpportunitiesOpen && (
        <CalosTrendOpportunityReview brandId={brandId} brandName={brandName} onClose={() => setTrendOpportunitiesOpen(false)} onAccepted={() => void refresh()} />
      )}

      {brandId && brandRefsOpen && (
        <CalosBrandReferencesModal brandId={brandId} brandName={brandName} onClose={() => setBrandRefsOpen(false)} />
      )}
    </div>
  );
}
