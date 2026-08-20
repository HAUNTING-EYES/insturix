'use client';

/**
 * Global active-brand switcher. Fixed top-right so it shows on EVERY dashboard service (one placement,
 * zero per-service code). Reads/writes the shared active-brand context. Hidden on public report routes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, CircleAlert, Globe, Loader2, Lock } from 'lucide-react';
import {
  createActiveBrandScope,
  getActiveBrandAccessQueryKey,
  getActiveBrandScopeIdentity,
  useActiveBrand,
} from './ActiveBrandProvider';
import { BrandAccessEditor } from './BrandAccessEditor';

export function BrandSwitcher() {
  const pathname = usePathname();
  const { brands, activeBrand, setActiveBrandId, isLoading } = useActiveBrand();
  const { userId, orgId, orgRole } = useAuth();
  const isAdmin = orgRole === 'org:admin';
  const scope = useMemo(() => createActiveBrandScope(userId, orgId), [orgId, userId]);
  const scopeIdentity = getActiveBrandScopeIdentity(scope);
  const [open, setOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<{ brandId: string; name: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Access chips (#3 — option C): the org's restricted-brand map. Admin-only data; the endpoint returns
  // an empty map for non-admins, and chips render only when isAdmin, so members never see them.
  const {
    data: accessData,
    isError: accessMapUnavailable,
    isFetching: accessMapLoading,
  } = useQuery({
    queryKey: getActiveBrandAccessQueryKey(scope),
    queryFn: async (): Promise<{ ok: boolean; grants: Record<string, string[]> }> => {
      const res = await fetch('/api/brand-vault/brands/access', { credentials: 'include' });
      const payload = await res.json().catch(() => null) as {
        error?: { message?: unknown };
        grants?: Record<string, string[]>;
        ok?: unknown;
      } | null;
      if (!res.ok || payload?.ok !== true) {
        throw new Error(typeof payload?.error?.message === 'string'
          ? payload.error.message
          : 'Failed to load brand access map');
      }
      return { ok: true, grants: payload.grants ?? {} };
    },
    enabled: Boolean(scope && open && isAdmin),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const accessMapReady = accessData?.ok === true;
  const accessGrants = accessMapReady ? accessData.grants : {};

  useEffect(() => {
    // A modal or access map opened under one organization is never valid in another authority scope.
    setOpen(false);
    setEditingBrand(null);
  }, [scopeIdentity]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Stay out of the way on public report embeds and before anything has loaded. NOTE: we intentionally
  // do NOT hide when the brand list is empty — a switcher that vanishes with zero brands is
  // undiscoverable (you can't find the thing that tells you to scan a brand). Show "No brand" instead.
  // If the list is unexpectedly empty, the brand-list fetch FAILLOUD-logs in ActiveBrandProvider.
  if (pathname.includes('/report/')) return null;
  if (isLoading && !activeBrand && !brands.length) return null;

  const label = activeBrand?.name ?? 'No brand';

  return (
    <>
      <div ref={ref} className="relative">
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
          <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-[#1C1B19] bg-[#0F0F0E] shadow-2xl">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#5F5E5A]">Active brand</div>
            {isAdmin && accessMapUnavailable && (
              <div role="alert" className="mx-3 mb-2 rounded border border-[#8B5A26] bg-[#2A2115] px-2 py-1.5 text-[11px] text-[#E0B266]">
                Brand access settings are temporarily unavailable.
              </div>
            )}
            {brands.length === 0 && (
              <div className="px-3 py-2 text-sm text-[#7A776E]">No brands yet — scan or create one in Brand Vault.</div>
            )}
            <div className="max-h-72 overflow-y-auto pb-1">
              {brands.map((brand) => {
                const active = brand.brandId === activeBrand?.brandId;
                const grant = accessGrants[brand.brandId];
                const restricted = Array.isArray(grant) && grant.length > 0;
                return (
                  <div
                    key={brand.brandId}
                    className={`flex items-center gap-1 pr-1.5 transition-colors ${
                      active ? 'bg-[#D4A652]/10' : 'hover:bg-[#1C1B19]/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBrandId(brand.brandId);
                        setOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm ${
                        active ? 'text-[#D4A652]' : 'text-[#ECE9E1]'
                      }`}
                    >
                      {active && <Check size={14} className="shrink-0" />}
                      <span className="truncate">{brand.name}</span>
                    </button>
                    {isAdmin && accessMapReady && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBrand({ brandId: brand.brandId, name: brand.name });
                          setOpen(false);
                        }}
                        title="Manage access"
                        aria-label={`Manage access for ${brand.name}`}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                          restricted
                            ? 'border border-[#D4A652]/40 bg-[#D4A652]/10 text-[#D4A652]'
                            : 'border border-[#1C1B19] text-[#7A776E] hover:text-[#ECE9E1]'
                        }`}
                      >
                        {restricted ? <Lock size={11} /> : <Globe size={11} />}
                        {restricted ? grant.length : 'All'}
                      </button>
                    )}
                    {isAdmin && !accessMapReady && (
                      <span
                        title={accessMapUnavailable ? 'Brand access settings are unavailable' : 'Checking brand access settings'}
                        aria-label={accessMapUnavailable ? 'Brand access settings are unavailable' : 'Checking brand access settings'}
                        className="flex h-6 w-7 shrink-0 items-center justify-center text-[#7A776E]"
                      >
                        {accessMapUnavailable
                          ? <CircleAlert size={14} className="text-[#E0B266]" />
                          : <Loader2 size={14} className={accessMapLoading ? 'animate-spin' : ''} />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editingBrand && (
        <BrandAccessEditor
          brandId={editingBrand.brandId}
          brandName={editingBrand.name}
          open
          onClose={() => setEditingBrand(null)}
        />
      )}
    </>
  );
}
