import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateActiveBrandStorageScope,
  createActiveBrandScope,
  fetchAuthorizedActiveBrands,
  getActiveBrandAccessQueryKey,
  getActiveBrandListQueryKey,
  getActiveBrandScopeIdentity,
  getActiveBrandStorageKey,
  readScopedActiveBrandId,
  reconcileActiveBrandSelection,
  shouldClearUnauthorizedActiveBrandSelection,
  writeScopedActiveBrandId,
  type ActiveBrandStorageLike,
} from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { filterAccessibleBrands } from '@/lib/shared/brand-access';
import { resolveThinkForgeBrowserTenantFixture } from '../e2e/thinkforge-browser-fixtures';

class MemoryStorage implements ActiveBrandStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('active brand account and organization scope', () => {
  const personal = createActiveBrandScope('user_admin', null)!;
  const organization = createActiveBrandScope('user_admin', 'org_agency')!;
  const otherAccount = createActiveBrandScope('user_restricted', 'org_agency')!;

  it('derives distinct cache and persistence identities for every account authority scope', () => {
    expect(getActiveBrandScopeIdentity(personal)).not.toBe(getActiveBrandScopeIdentity(organization));
    expect(getActiveBrandScopeIdentity(organization)).not.toBe(getActiveBrandScopeIdentity(otherAccount));
    expect(getActiveBrandStorageKey(personal)).not.toBe(getActiveBrandStorageKey(organization));
    expect(getActiveBrandStorageKey(organization)).not.toBe(getActiveBrandStorageKey(otherAccount));
    expect(getActiveBrandListQueryKey(personal)).not.toEqual(getActiveBrandListQueryKey(organization));
    expect(getActiveBrandListQueryKey(organization)).not.toEqual(getActiveBrandListQueryKey(otherAccount));
    expect(getActiveBrandAccessQueryKey(personal)).not.toEqual(getActiveBrandAccessQueryKey(organization));
    expect(getActiveBrandAccessQueryKey(organization)).not.toEqual(getActiveBrandAccessQueryKey(otherAccount));
  });

  it('clears the unscoped legacy value and restores only the new scope selection', () => {
    const persistent = new MemoryStorage();
    const tab = new MemoryStorage();
    persistent.setItem('brand_vault_selected_brand_id', 'brand_from_prior_scope');

    expect(activateActiveBrandStorageScope(persistent, tab, personal)).toBeNull();
    expect(persistent.getItem('brand_vault_selected_brand_id')).toBeNull();

    writeScopedActiveBrandId(persistent, personal, 'brand_personal');
    expect(activateActiveBrandStorageScope(persistent, tab, personal)).toBe('brand_personal');
    expect(activateActiveBrandStorageScope(persistent, tab, organization)).toBeNull();
    expect(readScopedActiveBrandId(persistent, personal)).toBe('brand_personal');

    writeScopedActiveBrandId(persistent, organization, 'brand_organization');
    expect(activateActiveBrandStorageScope(persistent, tab, personal)).toBe('brand_personal');
    expect(activateActiveBrandStorageScope(persistent, tab, organization)).toBe('brand_organization');
    expect(activateActiveBrandStorageScope(persistent, tab, otherAccount)).toBeNull();
  });

  it('removes a persisted selection once the server-authorized list excludes it', () => {
    const persistent = new MemoryStorage();
    const grants = new Map([['brand_organization', ['user_admin']]]);
    const restrictedVisibleBrands = filterAccessibleBrands(
      [{ brandId: 'brand_organization', name: 'Restricted client' }],
      grants,
      { userId: 'user_restricted', isOrgAdmin: false },
    );

    writeScopedActiveBrandId(persistent, otherAccount, 'brand_organization');
    const stored = readScopedActiveBrandId(persistent, otherAccount);
    const resolved = reconcileActiveBrandSelection(stored, restrictedVisibleBrands);
    expect(restrictedVisibleBrands).toEqual([]);
    expect(resolved).toBeNull();

    writeScopedActiveBrandId(persistent, otherAccount, resolved);
    expect(readScopedActiveBrandId(persistent, otherAccount)).toBeNull();
  });

  it('does not treat an unavailable or in-flight list as evidence to erase a selected brand', () => {
    expect(shouldClearUnauthorizedActiveBrandSelection({
      hasScope: true,
      hasAuthoritativeBrandList: false,
      selectedBrandId: 'brand_canary',
      resolvedBrandId: null,
    })).toBe(false);

    expect(shouldClearUnauthorizedActiveBrandSelection({
      hasScope: true,
      hasAuthoritativeBrandList: true,
      selectedBrandId: 'brand_canary',
      resolvedBrandId: null,
    })).toBe(true);
  });

  it('reads both authorized sources without cache and rejects an unavailable source', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        brands: [{ brandId: 'brand_registry', name: 'Registry Brand' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        brands: [{ brandId: 'brand_canary', name: 'Canary Brand' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAuthorizedActiveBrands()).resolves.toEqual([
      { brandId: 'brand_registry', name: 'Registry Brand' },
      { brandId: 'brand_canary', name: 'Canary Brand' },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/services/editron/brands', {
      credentials: 'include',
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/brand-vault/brands', {
      credentials: 'include',
      cache: 'no-store',
    });

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, brands: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 500 }));

    await expect(fetchAuthorizedActiveBrands()).rejects.toThrow('Brand Vault brand list unavailable');
  });

  it('defines two opposite accepted-brand fixtures and a separate restricted identity', () => {
    const fixture = resolveThinkForgeBrowserTenantFixture({
      runId: 'scope1',
      adminEmail: 'thinkforge.qa@example.com',
      personalBrandId: 'brand_personal',
    });

    expect(fixture.personalBrand.scope).toBe('personal');
    expect(fixture.organizationBrand.scope).toBe('organization');
    expect(fixture.personalBrand.brandId).not.toBe(fixture.organizationBrand.brandId);
    expect(fixture.personalBrand.voice.voiceLock).toContain('Formal, direct');
    expect(fixture.organizationBrand.voice.voiceLock).toContain('Warm, casual, playful');
    expect(fixture.personalBrand.visual.colors).not.toEqual(fixture.organizationBrand.visual.colors);
    expect(fixture.restrictedMember.email).not.toBe(fixture.admin.email);
  });
});
