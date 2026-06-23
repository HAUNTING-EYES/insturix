'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from '@/components/dashboard/ThinkForge/Calendar';
import { useCalosDeliverables } from './hooks/useCalosDeliverables';
import CampaignBar from './CampaignBar';
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

  const { cards, createCard, updateCard, deleteCard, refresh } = useCalosDeliverables(brandId);

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
    void createCard({
      title: 'Untitled content',
      date: iso,
      plannedDates: [iso],
      platform: 'generic',
      status: 'draft',
      tags: [],
      customTags: [],
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0B0B0A]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1B19]/60">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-[#ECE9E1]">Content Calendar</h1>
          {/* Brand switcher only when there's more than one brand (agencies). A single brand
              or a solo user never sees a "pick a client" step. */}
          {brands.length > 1 && (
            <select
              value={brandId ?? ''}
              onChange={(e) => selectBrand(e.target.value)}
              aria-label="Switch brand"
              className="bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5CCCB8]/40"
            >
              {brands.map((b) => (
                <option key={b.brandId} value={b.brandId}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {brandId && <CampaignBar brandId={brandId} onAutoFilled={refresh} />}
        </div>
      </div>

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
            onOpenScript={(sessionId) =>
              router.push(`/dashboard/thinkforge?sessionId=${encodeURIComponent(sessionId)}`)
            }
          />
        )}
      </div>
    </div>
  );
}
