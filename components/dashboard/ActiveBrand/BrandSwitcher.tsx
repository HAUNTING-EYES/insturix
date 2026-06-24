'use client';

/**
 * Global active-brand switcher. Fixed top-right so it shows on EVERY dashboard service (one placement,
 * zero per-service code). Reads/writes the shared active-brand context. Hidden on public report routes.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useActiveBrand } from './ActiveBrandProvider';

export function BrandSwitcher() {
  const pathname = usePathname();
  const { brands, activeBrand, setActiveBrandId, isLoading } = useActiveBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Stay out of the way on public report embeds and before anything has loaded.
  if (pathname.includes('/report/')) return null;
  if (isLoading && !activeBrand) return null;
  if (!brands.length && !activeBrand) return null;

  const label = activeBrand?.name ?? 'No brand';

  return (
    <div ref={ref} className="fixed top-3 right-4 z-40 hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-[#1C1B19] bg-[#0F0F0E]/90 px-3 py-1.5 text-sm text-[#ECE9E1] shadow-lg backdrop-blur-md transition-colors hover:border-[#D4A652]/40"
        title="Active brand"
      >
        <Building2 size={14} className="text-[#D4A652]" />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown size={14} className="text-[#5F5E5A]" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-[#1C1B19] bg-[#0F0F0E] shadow-2xl">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#5F5E5A]">Active brand</div>
          {brands.length === 0 && (
            <div className="px-3 py-2 text-sm text-[#7A776E]">No brands yet — scan or create one in Brand Vault.</div>
          )}
          <div className="max-h-72 overflow-y-auto pb-1">
            {brands.map((brand) => {
              const active = brand.brandId === activeBrand?.brandId;
              return (
                <button
                  key={brand.brandId}
                  type="button"
                  onClick={() => {
                    setActiveBrandId(brand.brandId);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'bg-[#D4A652]/10 text-[#D4A652]' : 'text-[#ECE9E1] hover:bg-[#1C1B19]/60'
                  }`}
                >
                  <span className="truncate">{brand.name}</span>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
