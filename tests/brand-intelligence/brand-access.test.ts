import { describe, expect, it } from 'vitest';
import {
  isBrandAccessible,
  filterAccessibleBrands,
  normalizeBrandAccessUserIds,
} from '@/lib/shared/brand-access';
import { createInMemoryBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { deriveBrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { createBrandSignalProfileDraft } from '@/lib/shared/brand-signal-lifecycle';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';

describe('brand-access (pure engine)', () => {
  const grants = new Map<string, readonly string[]>([['brand_a', ['user_u']]]);

  it('treats a brand with no assignment as open to everyone (backward compat)', () => {
    expect(isBrandAccessible('brand_b', grants, { userId: 'user_v' })).toBe(true);
    expect(isBrandAccessible('brand_b', grants, {})).toBe(true);
  });
  it('treats an empty assignment as open', () => {
    expect(isBrandAccessible('brand_x', new Map([['brand_x', []]]), { userId: 'nobody' })).toBe(true);
  });
  it('restricts an assigned brand to its users', () => {
    expect(isBrandAccessible('brand_a', grants, { userId: 'user_u' })).toBe(true);
    expect(isBrandAccessible('brand_a', grants, { userId: 'user_v' })).toBe(false);
    expect(isBrandAccessible('brand_a', grants, {})).toBe(false);
  });
  it('lets org admins bypass restrictions (no self-lockout)', () => {
    expect(isBrandAccessible('brand_a', grants, { userId: 'user_v', isOrgAdmin: true })).toBe(true);
  });
  it('filters a mixed list', () => {
    const brands = [{ brandId: 'brand_a' }, { brandId: 'brand_b' }];
    expect(filterAccessibleBrands(brands, grants, { userId: 'user_v' }).map((b) => b.brandId)).toEqual(['brand_b']);
    expect(filterAccessibleBrands(brands, grants, { userId: 'user_u' }).map((b) => b.brandId)).toEqual([
      'brand_a',
      'brand_b',
    ]);
  });
  it('normalizes assignment lists (dedupe + drop blanks/non-strings)', () => {
    expect(normalizeBrandAccessUserIds(['a', 'a', ' b ', '', 3, null])).toEqual(['a', 'b']);
    expect(normalizeBrandAccessUserIds('nope')).toEqual([]);
  });
});

describe('brand-access (store enforcement)', () => {
  function seedAcceptedBrand(
    store: ReturnType<typeof createInMemoryBrandVaultRefineryStore>,
    brandId: string,
    orgId: string,
    name: string,
  ): void {
    const brand = {
      brandId,
      userId: 'owner',
      name,
      voice: { killList: [], hookArchetypes: [], structuralHabits: [] },
      visual: { colors: [] },
      learning: { banditProjectCount: 0 },
    } as UnifiedBrand;
    const profile = deriveBrandSignalProfile(brand, { generatedAt: '2026-06-22T11:00:00.000Z', extractor: 'test' });
    profile.brandId = brandId;
    profile.orgId = orgId;
    const record = createBrandSignalProfileDraft(profile, {
      id: `rec_${brandId}`,
      now: '2026-06-22T11:00:00.000Z',
      actorId: 'owner',
    });
    store.saveRecord(record, { now: '2026-06-22T11:00:00.000Z', actorId: 'owner' });
    store.acceptDraft(`rec_${brandId}`, { now: '2026-06-22T11:00:00.000Z', actorId: 'owner' });
  }

  const ids = (store: ReturnType<typeof createInMemoryBrandVaultRefineryStore>, userId: string, isOrgAdmin = false) =>
    store
      .listAcceptedBrands({ orgId: 'org_1', userId, isOrgAdmin })
      .map((b) => b.brandId)
      .sort();

  it('shows all org brands by default, restricts only the assigned one, and reopens on clear', () => {
    const store = createInMemoryBrandVaultRefineryStore();
    seedAcceptedBrand(store, 'brand_a', 'org_1', 'Client A');
    seedAcceptedBrand(store, 'brand_b', 'org_1', 'Client B');

    // Default OPEN: every org member sees both.
    expect(ids(store, 'user_v')).toEqual(['brand_a', 'brand_b']);

    // Assign brand_a to user_u only -> user_v loses it, user_u keeps both, admin bypasses.
    store.setBrandAccess({ orgId: 'org_1', brandId: 'brand_a', userIds: ['user_u'] });
    expect(ids(store, 'user_u')).toEqual(['brand_a', 'brand_b']);
    expect(ids(store, 'user_v')).toEqual(['brand_b']);
    expect(ids(store, 'user_v', true)).toEqual(['brand_a', 'brand_b']);

    // Clearing the assignment reopens the brand to the whole org.
    store.setBrandAccess({ orgId: 'org_1', brandId: 'brand_a', userIds: [] });
    expect(ids(store, 'user_v')).toEqual(['brand_a', 'brand_b']);
  });

  it('scopes assignments per org (one org\'s grant never restricts another)', () => {
    const store = createInMemoryBrandVaultRefineryStore();
    seedAcceptedBrand(store, 'brand_a', 'org_1', 'Client A');
    seedAcceptedBrand(store, 'brand_a', 'org_2', 'Other-org A'); // same brandId, different org
    store.setBrandAccess({ orgId: 'org_1', brandId: 'brand_a', userIds: ['user_u'] });

    // org_2's brand_a is untouched by org_1's grant.
    expect(
      store.listAcceptedBrands({ orgId: 'org_2', userId: 'user_v' }).map((b) => b.brandId),
    ).toEqual(['brand_a']);
  });
});
