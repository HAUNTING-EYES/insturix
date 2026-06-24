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
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const store = getDefaultBrandVaultRefineryStore();
  if (!store.listAcceptedBrands) {
    return NextResponse.json(
      { ok: false, error: { code: 'unsupported_store', message: 'Brand Vault store cannot list accepted brands.' } },
      { status: 500 },
    );
  }

  const brands = await store.listAcceptedBrands(
    orgId ? { orgId } : { orgId: null, userId },
  );
  return NextResponse.json({ ok: true, brands });
}