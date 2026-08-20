import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Vary: 'Cookie',
};

/**
 * GET /api/brand-vault/brands
 *
 * Returns latest accepted Brand Vault profiles grouped by brand for the active
 * organization. In legacy personal context, it falls back to the signed-in user
 * plus explicit null org scope instead of a global latest/default brand.
 */
export async function GET() {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401, headers: PRIVATE_NO_STORE_HEADERS });

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.listAcceptedBrands) {
    return NextResponse.json(
      { ok: false, error: { code: 'unsupported_store', message: 'Brand Vault store cannot list accepted brands.' } },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  // Pass userId in the org case too: the R5 dual-read fallback needs it to return the user's pre-stack /
  // solo (null-org) brands. Without it, an org member whose brand was accepted as a personal brand sees
  // NOTHING here ("No brand"). isOrgAdmin lets an admin see every brand in the org (they bypass access).
  const brands = await store.listAcceptedBrands(
    orgId ? { orgId, userId, isOrgAdmin: has({ role: 'org:admin' }) } : { orgId: null, userId },
  );
  return NextResponse.json({ ok: true, brands }, { headers: PRIVATE_NO_STORE_HEADERS });
}
