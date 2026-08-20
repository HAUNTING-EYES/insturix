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
 * Selection persists per signed-in account + Clerk organization. The current tab owns a scope pointer in
 * sessionStorage, so two tabs in different organizations cannot redirect each other's brand selection.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

const LEGACY_ACTIVE_BRAND_KEY = 'brand_vault_selected_brand_id';
const ACTIVE_BRAND_SCOPE_POINTER_KEY = 'brand_vault_active_scope_v2';
const ACTIVE_BRAND_SELECTION_PREFIX = 'brand_vault_selected_brand_id_v2:';

export interface ActiveBrandScope {
  userId: string;
  orgId: string | null;
}

export interface ActiveBrandStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createActiveBrandScope(
  userId: string | null | undefined,
  orgId: string | null | undefined,
): ActiveBrandScope | null {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return null;
  return { userId: normalizedUserId, orgId: orgId?.trim() || null };
}

export function getActiveBrandScopeIdentity(scope: ActiveBrandScope | null): string {
  if (!scope) return 'signed-out';
  const account = `user:${encodeURIComponent(scope.userId)}`;
  return scope.orgId ? `${account}:org:${encodeURIComponent(scope.orgId)}` : `${account}:personal`;
}

function getActiveBrandStorageKeyFromIdentity(scopeIdentity: string): string {
  return `${ACTIVE_BRAND_SELECTION_PREFIX}${scopeIdentity}`;
}

export function getActiveBrandStorageKey(scope: ActiveBrandScope): string {
  return getActiveBrandStorageKeyFromIdentity(getActiveBrandScopeIdentity(scope));
}

export function getActiveBrandListQueryKey(scope: ActiveBrandScope | null) {
  return ['active-brand', 'brands', getActiveBrandScopeIdentity(scope)] as const;
}

export function getActiveBrandAccessQueryKey(scope: ActiveBrandScope | null) {
  return ['active-brand', 'access-map', getActiveBrandScopeIdentity(scope)] as const;
}

export function readScopedActiveBrandId(
  storage: ActiveBrandStorageLike,
  scope: ActiveBrandScope,
): string | null {
  return storage.getItem(getActiveBrandStorageKey(scope));
}

export function writeScopedActiveBrandId(
  storage: ActiveBrandStorageLike,
  scope: ActiveBrandScope,
  brandId: string | null,
): void {
  const key = getActiveBrandStorageKey(scope);
  const normalizedBrandId = brandId?.trim() || null;
  if (normalizedBrandId) storage.setItem(key, normalizedBrandId);
  else storage.removeItem(key);
}

export function activateActiveBrandStorageScope(
  persistentStorage: ActiveBrandStorageLike,
  tabStorage: ActiveBrandStorageLike,
  scope: ActiveBrandScope | null,
): string | null {
  // The old unscoped key must never survive a scope transition. Brand Vault still reads it in one legacy
  // view, where its absence safely resolves from the server-filtered brand list.
  persistentStorage.removeItem(LEGACY_ACTIVE_BRAND_KEY);
  if (!scope) {
    tabStorage.removeItem(ACTIVE_BRAND_SCOPE_POINTER_KEY);
    return null;
  }
  tabStorage.setItem(ACTIVE_BRAND_SCOPE_POINTER_KEY, getActiveBrandScopeIdentity(scope));
  return readScopedActiveBrandId(persistentStorage, scope);
}

export function reconcileActiveBrandSelection(
  selectedBrandId: string | null | undefined,
  brands: readonly ActiveBrandOption[],
): string | null {
  const normalized = selectedBrandId?.trim();
  if (!normalized) return null;
  return brands.some((brand) => brand.brandId === normalized) ? normalized : null;
}

/**
 * Read the currently-selected brandId straight from storage (the source the provider writes through).
 * For non-React call sites — event handlers, fetch bodies — that need the freshest selection at call time
 * without subscribing to the context. Returns undefined when nothing is selected, so callers can spread it
 * into a JSON body and have the key omitted (routes then create an unscoped project, exactly as before).
 */
export function getActiveBrandIdFromStorage(scope?: ActiveBrandScope): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const scopeIdentity = scope
    ? getActiveBrandScopeIdentity(scope)
    : window.sessionStorage.getItem(ACTIVE_BRAND_SCOPE_POINTER_KEY);
  if (!scopeIdentity || scopeIdentity === 'signed-out') return undefined;
  return window.localStorage.getItem(getActiveBrandStorageKeyFromIdentity(scopeIdentity)) ?? undefined;
}

/**
 * localStorage fires NO event in the same tab, so a component that wrote the key can't notify other
 * components that read it — the switcher pill would show a stale brand until it remounted. This custom
 * event is the missing signal: any writer dispatches it, every reader listens, so the selection stays in
 * sync live across the pill and the Brand Vault page. (Cross-tab is already covered by the native
 * 'storage' event.) All brand-selection writes MUST go through setActiveBrandIdInStorage.
 */
export const ACTIVE_BRAND_CHANGED_EVENT = 'active-brand-changed';

export function setActiveBrandIdInStorage(brandId: string | null, scope?: ActiveBrandScope): void {
  if (typeof window === 'undefined') return;
  const scopeIdentity = scope
    ? getActiveBrandScopeIdentity(scope)
    : window.sessionStorage.getItem(ACTIVE_BRAND_SCOPE_POINTER_KEY);
  if (!scopeIdentity || scopeIdentity === 'signed-out') return;
  const key = getActiveBrandStorageKeyFromIdentity(scopeIdentity);
  const normalizedBrandId = brandId?.trim() || null;
  if (normalizedBrandId) window.localStorage.setItem(key, normalizedBrandId);
  else window.localStorage.removeItem(key);
  window.localStorage.removeItem(LEGACY_ACTIVE_BRAND_KEY);
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
  isBrandListUnavailable: boolean;
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

function hasSuccessfulBrandListEnvelope(
  value: unknown,
  successField: 'success' | 'ok',
): value is Record<string, unknown> {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as Record<string, unknown>)[successField] === true,
  );
}

async function fetchBrandListSource(
  url: string,
  sourceName: string,
  successField: 'success' | 'ok',
): Promise<ActiveBrandOption[]> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !hasSuccessfulBrandListEnvelope(payload, successField)) {
    throw new Error(`[ActiveBrand] ${sourceName} brand list unavailable (${response.status}).`);
  }
  return normalizeBrands(payload.brands);
}

/**
 * The client-side union is a display preference, never an authorization shortcut. Both sources must be
 * fresh and valid before the provider may conclude that a persisted selection is no longer available.
 */
export async function fetchAuthorizedActiveBrands(): Promise<ActiveBrandOption[]> {
  const [editronBrands, vaultBrands] = await Promise.all([
    fetchBrandListSource('/api/services/editron/brands', 'Editron', 'success'),
    fetchBrandListSource('/api/brand-vault/brands', 'Brand Vault', 'ok'),
  ]);
  const merged = new Map<string, ActiveBrandOption>();
  for (const brand of [...editronBrands, ...vaultBrands]) {
    if (!merged.has(brand.brandId)) merged.set(brand.brandId, brand);
  }
  return Array.from(merged.values());
}

export function shouldClearUnauthorizedActiveBrandSelection({
  hasScope,
  hasAuthoritativeBrandList,
  selectedBrandId,
  resolvedBrandId,
}: {
  hasScope: boolean;
  hasAuthoritativeBrandList: boolean;
  selectedBrandId: string | null;
  resolvedBrandId: string | null;
}): boolean {
  return hasScope && hasAuthoritativeBrandList && Boolean(selectedBrandId) && !resolvedBrandId;
}

export function ActiveBrandProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId, orgId } = useAuth();
  const queryClient = useQueryClient();
  const scope = useMemo(() => createActiveBrandScope(userId, orgId), [orgId, userId]);
  const scopeIdentity = getActiveBrandScopeIdentity(scope);
  const previousScopeIdentityRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<{ scopeIdentity: string; brandId: string | null }>({
    scopeIdentity: 'signed-out',
    brandId: null,
  });
  const selectedForCurrentScope = selection.scopeIdentity === scopeIdentity ? selection.brandId : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousScopeIdentity = previousScopeIdentityRef.current;
    if (previousScopeIdentity && previousScopeIdentity !== scopeIdentity) {
      queryClient.removeQueries({
        queryKey: ['active-brand', 'brands', previousScopeIdentity],
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: ['active-brand', 'access-map', previousScopeIdentity],
        exact: true,
      });
    }
    previousScopeIdentityRef.current = scopeIdentity;

    const sync = () => {
      const brandId = activateActiveBrandStorageScope(window.localStorage, window.sessionStorage, scope);
      setSelection({ scopeIdentity, brandId });
    };
    sync();
    // Same-tab writes signal via the custom event; cross-tab writes via the native 'storage' event.
    window.addEventListener(ACTIVE_BRAND_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_BRAND_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [queryClient, scope, scopeIdentity]);

  const {
    data: brands = [],
    isError: isBrandListUnavailable,
    isFetching,
    isLoading,
    isSuccess,
  } = useQuery({
    queryKey: getActiveBrandListQueryKey(scope),
    queryFn: fetchAuthorizedActiveBrands,
    enabled: Boolean(isSignedIn && scope),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const activeBrandId = reconcileActiveBrandSelection(selectedForCurrentScope, brands);

  const setActiveBrandId = useCallback((brandId: string | null) => {
    if (!scope) return;
    const authorizedBrandId = reconcileActiveBrandSelection(brandId, brands);
    setSelection({ scopeIdentity, brandId: authorizedBrandId });
    setActiveBrandIdInStorage(authorizedBrandId, scope);
  }, [brands, scope, scopeIdentity]);

  // A stored brand is only a preference. If the server-authorized list no longer contains it, erase it.
  // Never guess another brand: an explicit selection is required in the new account/org scope. A failed
  // or in-flight refresh is not proof that the brand was revoked, so it must never erase the preference.
  useEffect(() => {
    if (!scope) return;
    const hasAuthoritativeBrandList = isSuccess && !isFetching && !isBrandListUnavailable;
    if (!shouldClearUnauthorizedActiveBrandSelection({
      hasScope: true,
      hasAuthoritativeBrandList,
      selectedBrandId: selectedForCurrentScope,
      resolvedBrandId: activeBrandId,
    })) return;
    setSelection({ scopeIdentity, brandId: null });
    setActiveBrandIdInStorage(null, scope);
  }, [activeBrandId, isBrandListUnavailable, isFetching, isSuccess, scope, scopeIdentity, selectedForCurrentScope]);

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      brands,
      activeBrandId,
      activeBrand: brands.find((b) => b.brandId === activeBrandId) ?? null,
      setActiveBrandId,
      isLoading,
      isBrandListUnavailable,
    }),
    [brands, activeBrandId, setActiveBrandId, isBrandListUnavailable, isLoading],
  );

  return <ActiveBrandContext.Provider value={value}>{children}</ActiveBrandContext.Provider>;
}
