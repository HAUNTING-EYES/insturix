'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Calendar, { type CalendarEvent } from '@/components/dashboard/ThinkForge/Calendar';
import { useCalosDeliverables } from './hooks/useCalosDeliverables';
import CampaignBar from './CampaignBar';
import { toast } from '@/hooks/use-toast';
import { EDITORIAL_STAGE_META } from '@/lib/calos/stages';
import BrandConnections from './BrandConnections';
import CommandBrief from './CommandBrief';
import { Linkedin, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import type { ContentCard } from '@/app/dashboard/thinkforge/types';

interface BrandOption {
  brandId: string;
  name: string;
}

const LS_SELECTED_BRAND = 'calos_selected_brand';
const DEFAULT_BRAND = 'default'; // personal space when the user has no explicit brand

export default function CalosPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/services/editron/brands', { cache: 'no-store' });
        const data = await res.json();
        const list: BrandOption[] = Array.isArray(data?.brands)
          ? data.brands.map((b: { brandId: string; name: string }) => ({ brandId: b.brandId, name: b.name }))
          : [];
        if (!active) return;
        setBrands(list);
        // Works for a single brand AND an agency: 0 brands -> personal default; exactly 1 -> that
        // brand; many -> last-selected or first. No "pick a client" step is ever forced.
        let effective = DEFAULT_BRAND;
        if (list.length === 1) {
          effective = list[0].brandId;
        } else if (list.length > 1) {
          const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_SELECTED_BRAND) : null;
          effective = saved && list.some((b) => b.brandId === saved) ? saved : list[0].brandId;
        }
        setBrandId(effective);
      } catch {
        if (active) {
          setBrands([]);
          setBrandId(DEFAULT_BRAND);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest('[data-calos-calendar-actions]')) setActionsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionsMenuOpen]);
  const { cards, createCard, updateCard, deleteCard, deleteCardsForDate, clearAll, refresh } = useCalosDeliverables(brandId);

  const selectBrand = (id: string) => {
    setBrandId(id);
    try {
      localStorage.setItem(LS_SELECTED_BRAND, id);
    } catch {
      /* localStorage unavailable — selection is in-memory only */
    }
  };

  const handleCreateCard = (date: Date) => {
    const iso = date.toISOString();
    return createCard({
      title: 'Untitled content',
      date: iso,
      plannedDates: [iso],
      platform: 'generic',
      status: 'draft',
      tags: [],
      customTags: [],
    });
  };

  const handleGenerate = async (id: string) => {
    if (!brandId) return;
    try {
      const res = await fetch('/api/services/calos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, deliverableId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error || `Generate failed (${res.status})`, variant: 'destructive' });
        return;
      }
      if (data?.generatorWired) {
        toast({ title: 'Draft generated', description: `via ${data.routedTo}.` });
      } else {
        // Honest: routed to a service that has no automated generator yet.
        toast({ title: `Routed to ${data.routedTo}`, description: data?.message });
      }
      refresh();
    } catch (err) {
      toast({
        title: 'Generate failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDecision = async (
    id: string,
    decision: 'approved' | 'rejected' | 'changes_requested'
  ) => {
    if (!brandId) return;
    try {
      const res = await fetch(
        `/api/services/calos/deliverables/${encodeURIComponent(id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, decision }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error || `Decision failed (${res.status})`, variant: 'destructive' });
        return;
      }
      toast({ title: decision === 'approved' ? 'Approved' : 'Sent back for changes' });
      refresh();
    } catch (err) {
      toast({
        title: 'Decision failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteDay = async (date: Date, eventsOnDay: Array<ContentCard | CalendarEvent>) => {
    const count = eventsOnDay.length;
    if (count === 0) return false;
    const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const ok = window.confirm(
      `Delete all ${count} item${count === 1 ? '' : 's'} on ${label}? This removes them from the calendar.`
    );
    if (!ok) return false;
    const deleted = await deleteCardsForDate(date);
    if (deleted > 0) {
      toast({ title: `Cleared ${deleted} item${deleted === 1 ? '' : 's'}`, description: label });
    }
    return deleted > 0;
  };

  const handleClearAll = async () => {
    if (cards.length === 0) {
      toast({ title: 'Calendar already clear' });
      return;
    }
    const ok = window.confirm(
      `Clear all ${cards.length} item${cards.length === 1 ? '' : 's'} from ${brandName}? This removes every calendar card for this brand.`
    );
    if (!ok) return;
    const deleted = await clearAll();
    if (deleted > 0) {
      toast({ title: `Cleared ${deleted} item${deleted === 1 ? '' : 's'}`, description: 'Calendar cleanup complete.' });
    }
  };

  const handleShare = async () => {
    if (!brandId) return;
    try {
      const res = await fetch('/api/services/calos/client-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        toast({ title: data?.error || `Couldn't create link (${res.status})`, variant: 'destructive' });
        return;
      }
      // Copy to clipboard when available; otherwise surface the URL so the user can copy it manually.
      try {
        await navigator.clipboard.writeText(data.url);
        toast({ title: 'Client link copied', description: 'Read-only calendar link is on your clipboard.' });
      } catch {
        toast({ title: 'Client link ready', description: data.url });
      }
    } catch (err) {
      toast({
        title: 'Share failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const brandName =
    brands.find((b) => b.brandId === brandId)?.name ??
    (brandId === DEFAULT_BRAND ? 'Personal' : brandId ?? '');

  return (
    <div className="w-full h-full flex flex-col bg-[#0B0B0A]">
      <div className="sticky top-0 z-30 border-b border-[#1C1B19]/60 bg-[#0B0B0A]/95 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex min-w-[210px] shrink-0 items-center gap-3">
            <h1 className="text-sm font-semibold text-[#ECE9E1]">Content Calendar</h1>
            {/* Brand switcher only when there's more than one brand (agencies). A single brand
                or a solo user never sees a "pick a client" step. */}
            {brands.length > 1 && (
              <select
                value={brandId ?? ''}
                onChange={(e) => selectBrand(e.target.value)}
                aria-label="Switch brand"
                className="h-9 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 text-xs text-[#ECE9E1] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40"
              >
                {brands.map((b) => (
                  <option key={b.brandId} value={b.brandId}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="min-w-[320px] flex-1">
            {brandId && <CampaignBar brandId={brandId} onAutoFilled={refresh} />}
          </div>

          {!loading && brandId && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleShare}
                title="Copy a read-only calendar link to share with this client"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1C1B19] px-3 text-[11px] font-medium text-[#ECE9E1] hover:bg-[#1C1B19]/60"
              >
                <Share2 className="h-3.5 w-3.5 text-[#D4A652]" />
                Share
              </button>
              <button
                onClick={() => setConnectionsOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1C1B19] px-3 text-[11px] font-medium text-[#ECE9E1] hover:bg-[#1C1B19]/60"
              >
                <Linkedin className="h-3.5 w-3.5 text-[#D4A652]" />
                Publishing
              </button>
              <div className="relative" data-calos-calendar-actions>
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((open) => !open)}
                  aria-label="Calendar actions"
                  aria-expanded={actionsMenuOpen}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#1C1B19] text-[#7A776E] hover:bg-[#1C1B19]/60 hover:text-[#ECE9E1]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {actionsMenuOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-[#1C1B19] bg-[#0B0B0A] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        void handleClearAll();
                      }}
                      disabled={cards.length === 0}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#D46A5C] transition-colors hover:bg-[#D46A5C]/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear all content
                    </button>
                    <div className="mt-1 border-t border-[#1C1B19]/80 pt-1">
                      <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-[#7A776E]">Stage key</div>
                      <div className="flex flex-wrap gap-1.5 px-2 py-2">
                        {Object.values(EDITORIAL_STAGE_META).map((m) => (
                          <span key={m.label} className="inline-flex items-center gap-1 rounded-full border border-[#1C1B19] px-2 py-1 text-[10px] text-[#8E8A80]">
                            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                            {m.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!loading && brandId && (
        <CommandBrief cards={cards} brandId={brandId} onDecision={handleDecision} />
      )}

      <div className="flex-1 min-h-0">
        {loading || !brandId ? (
          <div className="h-full flex items-center justify-center text-[#7A776E] text-sm">Loading…</div>
        ) : (
          <Calendar
            events={cards}
            onCreateCard={handleCreateCard}
            onEventUpdate={(id, patch) => {
              // Cards here are always ContentCard; Calendar types the patch as a union.
              void updateCard(id, patch as Partial<ContentCard>);
            }}
            onEventDrop={(id, newDate) => {
              const iso = newDate.toISOString();
              const existing = cards.find((c) => c.id === id)?.plannedDates ?? [];
              // Single-date card: move it. Multi-date card: add the new date without dropping the
              // others — Calendar doesn't say which instance was dragged, so never delete a date.
              const next = existing.length > 1 ? Array.from(new Set([...existing, iso])) : [iso];
              void updateCard(id, { plannedDates: next, date: iso });
            }}
            onDeleteCard={(id) => {
              void deleteCard(id);
            }}
            onDeleteDate={handleDeleteDay}
            onGenerate={handleGenerate}
            onDecision={handleDecision}
            onOpenScript={(sessionId) =>
              router.push(`/dashboard/thinkforge?sessionId=${encodeURIComponent(sessionId)}`)
            }
          />
        )}
      </div>

      {brandId && (
        <BrandConnections
          brandId={brandId}
          brandName={brandName}
          open={connectionsOpen}
          onClose={() => setConnectionsOpen(false)}
        />
      )}
    </div>
  );
}
