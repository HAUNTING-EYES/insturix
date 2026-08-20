import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/brand-vault/signal-profiles?brandId=...
 *
 * Returns the signed-in user's latest accepted profile for one brand. Generation consumers
 * resolve accepted Vault state by brandId, so the review UI must not reload a global profile.
 */
export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const brandId = new URL(request.url).searchParams.get('brandId')?.trim();
  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: { code: 'missing_brand_id', message: 'Choose a brand before loading its accepted profile.' } },
      { status: 400 },
    );
  }

  const record = await getDefaultBrandVaultRefineryStore().getLatestAcceptedRecord({
    userId,
    orgId: orgId ?? null,
    brandId,
  });
  return NextResponse.json({ ok: true, recordId: record?.id ?? null });
}
