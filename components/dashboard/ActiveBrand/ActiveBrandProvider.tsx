'use client';

/**
 * Global active-brand (active "client") context for the whole dashboard.
 *
 * One source of truth that every service reads via useActiveBrand(), so the brand a user picks in the
 * switcher is the same brand Brand Vault / Editron / ThinkForge / CalOS / Clickatron / Alyzitron use.
 *
 * Brand list = UNION of the editron brand registry (/api/services/editron/brands, CRUD-created clients)
 * and accepted Brand Vault profiles (/api/brand-vault/brands, scanned+accepted), deduped by brandId — so
 * a brand you scanned shows up even if it was never manually created.
 *
 * ponytail: selection persists in localStorage under the SAME key Brand Vault already uses, so the two
 * stay in sync with zero extra plumbing. Upgrade path: Clerk user metadata for cross-device persistence.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

const ACTIVE_BRAND_KEY = 'brand_vault_selected_brand_id';

/**
 * Read the currently-selected brandId straight from storage (the source the provider writes through).
 * For non-React call sites — event handlers, fetch bodies — that need the freshest selection at call time
 * without subscribing to the context. Returns undefined when nothing is selected, so callers can spread it
 * into a JSON body and have the key omitted (routes then create an unscoped project, exactly as before).
 */
export function getActiveBrandIdFromStorage(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(ACTIVE_BRAND_KEY) ?? undefined;
}

/**
 * localStorage fires NO event in the same tab, so a component that wrote the key can't notify other
 * components that read it — the switcher pill would show a stale brand until it remounted. This custom
 * event is the missing signal: any writer dispatches it, every reader listens, so the selection stays in
 * sync live across the pill and the Brand Vault page. (Cross-tab is already covered by the native
 * 'storage' event.) All brand-selection writes MUST go through setActiveBrandIdInStorage.
 */
export const ACTIVE_BRAND_CHANGED_EVENT = 'active-brand-changed';

export function setActiveBrandIdInStorage(brandId: string | null): void {
  if (typeof window === 'undefined') return;
  if (brandId) window.localStorage.setItem(ACTIVE_BRAND_KEY, brandId);
  else window.localStorage.removeItem(ACTIVE_BRAND_KEY);
  window.dispatchEvent(new Event(ACTIVE_BRAND_CHANGED_EVENT));
}

export interface ActiveBrandOption {
  brandId: string;
  name: string;
}

interface ActiveBrandContextValue {
  brands: ActiveBrandOption[];
  activeBrandId: string | null;
  activeBrand: ActiveBrandOption | null;
  setActiveBrandId: (brandId: string | null) => void;
  isLoading: boolean;
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

export function useActiveBrand(): ActiveBrandContextValue {
  const ctx = useContext(ActiveBrandContext);
  if (!ctx) throw new Error('useActiveBrand must be used within <ActiveBrandProvider>.');
  return ctx;
}

/** Optional reader for places that may render outside the provider — returns null instead of throwing. */
export function useActiveBrandOptional(): ActiveBrandContextValue | null {
  return useContext(ActiveBrandContext);
}

function normalizeBrands(value: unknown): ActiveBrandOption[] {
  if (!Array.isArray(value)) return [];
  const out: ActiveBrandOption[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { brandId?: unknown; name?: unknown };
    const brandId = typeof raw.brandId === 'string' ? raw.brandId.trim() : '';
    if (!brandId || seen.has(brandId)) continue;
    seen.add(brandId);
    out.push({ brandId, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : brandId });
  }
  return out;
}

async function fetchAllBrands(): Promise<ActiveBrandOption[]> {
  const [editron, vault] = await Promise.all([
    // FAILLOUD: remove after brand-vault verify (revert to `.catch(() => null)`). These were TRULY
    // silent — a failed brand-list fetch showed an empty switcher with zero log trail.
    fetch('/api/services/editron/brands', { credentials: 'include' }).then((r) => r.json()).catch((err) => { console.error('[FAILLOUD][ActiveBrand] editron brands fetch failed', err); return null; }),
    fetch('/api/brand-vault/brands', { credentials: 'include' }).then((r) => r.json()).catch((err) => { console.error('[FAILLOUD][ActiveBrand] vault brands fetch failed', err); return null; }),
  ]);
  const editronBrands = editron && editron.success ? normalizeBrands(editron.brands) : [];
  const vaultBrands = vault && vault.ok ? normalizeBrands(vault.brands) : [];
  const merged = new Map<string, ActiveBrandOption>();
  for (const brand of [...editronBrands, ...vaultBrands]) {
    if (!merged.has(brand.brandId)) merged.set(brand.brandId, brand);
  }
  return Array.from(merged.values());
}

export function ActiveBrandProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setActiveBrandIdState(window.localStorage.getItem(ACTIVE_BRAND_KEY));
    sync();
    // Same-tab writes signal via the custom event; cross-tab writes via the native 'storage' event.
    window.addEventListener(ACTIVE_BRAND_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_BRAND_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['active-brand', 'brands'],
    queryFn: fetchAllBrands,
    enabled: Boolean(isSignedIn),
    staleTime: 60 * 1000,
  });

  const setActiveBrandId = useCallback((brandId: string | null) => {
    setActiveBrandIdState(brandId);
    setActiveBrandIdInStorage(brandId);
  }, []);

  // Default to the first brand when none is selected, or the stored one no longer exists.
  useEffect(() => {
    if (!brands.length) return;
    if (!activeBrandId || !brands.some((b) => b.brandId === activeBrandId)) {
      setActiveBrandId(brands[0].brandId);
    }
  }, [brands, activeBrandId, setActiveBrandId]);

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      brands,
      activeBrandId,
      activeBrand: brands.find((b) => b.brandId === activeBrandId) ?? null,
      setActiveBrandId,
      isLoading,
    }),
    [brands, activeBrandId, setActiveBrandId, isLoading],
  );

  return <ActiveBrandContext.Provider value={value}>{children}</ActiveBrandContext.Provider>;
}
