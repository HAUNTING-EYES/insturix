import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/brand-vault/brands
 *
 * Returns latest accepted Brand Vault profiles grouped by brand for the active
 * organization. In legacy personal context, it falls back to the signed-in user
 * plus explicit null org scope instead of a global latest/default brand.
 */
export async function GET() {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.listAcceptedBrands) {
    return NextResponse.json(
      { ok: false, error: { code: 'unsupported_store', message: 'Brand Vault store cannot list accepted brands.' } },
      { status: 500 },
    );
  }

  // Self-heal a legacy accepted record that lost its brandId. summarizeAcceptedBrandRecords drops any
  // record without a brandId, so an accepted brand with an empty brandId is invisible here FOREVER — the
  // "accepted but no brand in the switcher" bug. Mint one for the user's latest such record so it
  // surfaces; idempotent (a no-op once a brandId is set), fail-soft (never blocks the list).
  try {
    const latest = await store.getLatestAcceptedRecord({ userId, orgId: orgId ?? null });
    if (latest && latest.status === 'accepted' && !latest.profile.brandId?.trim()) {
      latest.profile.brandId = `brand_${globalThis.crypto.randomUUID()}`;
      await store.saveRecord(latest);
    }
  } catch (error) {
    console.warn('[BrandVault:brands] brandId self-heal skipped:', error instanceof Error ? error.message : String(error));
  }

  // Pass userId in the org case too: the R5 dual-read fallback needs it to return the user's pre-stack /
  // solo (null-org) brands. Without it, an org member whose brand was accepted as a personal brand sees
  // NOTHING here ("No brand"). isOrgAdmin lets an admin see every brand in the org (they bypass access).
  const brands = await store.listAcceptedBrands(
    orgId ? { orgId, userId, isOrgAdmin: has({ role: 'org:admin' }) } : { orgId: null, userId },
  );
  return NextResponse.json({ ok: true, brands });
}