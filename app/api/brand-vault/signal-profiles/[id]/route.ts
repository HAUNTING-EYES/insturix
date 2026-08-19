import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getBrandVaultSignalProfile,
  getDefaultBrandVaultRefineryStore,
  reviewBrandVaultSignalProfileDraft,
} from '@/lib/shared/brand-vault-refinery-api';
import { emitBrandEvent } from '@/lib/shared/brand-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const result = await getBrandVaultSignalProfile(
    {
      userId,
      orgId: orgId ?? undefined,
      isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
      recordId: id,
    },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId, has } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await reviewBrandVaultSignalProfileDraft(
    {
      userId,
      orgId: orgId ?? undefined,
      isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
      recordId: id,
      actorId: userId,
      body,
    },
    { store: getDefaultBrandVaultRefineryStore() },
  );

  if (result.body.ok && result.body.record.status === 'accepted') {
    await emitBrandEvent({
      userId,
      brandId: result.body.record.profile.brandId,
      service: 'brand_vault',
      type: 'brand_updated',
      payload: {
        source: 'brand_vault_review_acceptance',
        recordId: result.body.record.id,
        orgId: result.body.record.profile.orgId,
        acceptedAt: result.body.record.review.acceptedAt,
        learningEvents: result.body.learningEvents,
      },
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[BrandVault] Review acceptance event emit failed:', message);
    });
  }

  return NextResponse.json(result.body, { status: result.status });
}
