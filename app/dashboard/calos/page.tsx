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

export default function CalosPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandId, setBrandId] = useState<string | null>(null);

  // Load the user's client brands once; restore the last-selected one.
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
        const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_SELECTED_BRAND) : null;
        const initial = saved && list.some((b) => b.brandId === saved) ? saved : list[0]?.brandId ?? null;
        setBrandId(initial);
      } catch {
        if (active) setBrands([]);
      } finally {
        if (active) setBrandsLoading(false);
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
      {/* Header: client/brand switcher */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1B19]/60">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-[#ECE9E1]">Content Calendar</h1>
          {brands.length > 0 && (
            <select
              value={brandId ?? ''}
              onChange={(e) => selectBrand(e.target.value)}
              aria-label="Select client"
              className="bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40"
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

      {/* Body */}
      <div className="flex-1 min-h-0">
        {brandsLoading ? (
          <div className="h-full flex items-center justify-center text-[#7A776E] text-sm">
            Loading clients…
          </div>
        ) : brands.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
            <p className="text-[#ECE9E1] text-sm font-medium">No client brands yet</p>
            <p className="text-[#7A776E] text-xs max-w-sm">
              Create a client in the Brand Vault, then plan its content here.
            </p>
            <button
              onClick={() => router.push('/dashboard/brand-vault')}
              className="px-4 py-2 rounded-lg bg-[#D4A652]/20 border border-[#D4A652]/40 text-[#D4A652] text-xs font-medium hover:bg-[#D4A652]/30 transition-colors"
            >
              Go to Brand Vault
            </button>
          </div>
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
              void updateCard(id, { plannedDates: [iso], date: iso });
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
