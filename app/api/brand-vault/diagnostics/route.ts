import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import {
  brandVaultSourceEnabled,
  brandVaultSourceFlagName,
  type BrandVaultSourceService,
} from '@/lib/shared/brand-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICES: BrandVaultSourceService[] = ['editron', 'thinkforge', 'clickatron'];

/**
 * GET /api/brand-vault/diagnostics?brandId=...
 *
 * Ops visibility: for the signed-in user's brand, report which source each generation service actually
 * resolves (brand_vault | legacy | none) and whether its flag is on. Answers "is the rich vault really
 * driving generation, or is it silently falling back to legacy?" without grepping logs.
 */
export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const brandId = new URL(request.url).searchParams.get('brandId')?.trim();
  if (!brandId) {
    // No brandId -> ground-truth dump of the user's latest accepted record, so we can see whether it has
    // a brandId at all (an accepted record with an empty brandId is dropped from the brand list).
    const record = await getDefaultBrandVaultRefineryStore().getLatestAcceptedRecord({
      userId,
      orgId: orgId ?? null,
    });
    const recordBrandId = record?.profile.brandId?.trim() || null;
    return NextResponse.json({
      ok: true,
      mode: 'latest-accepted-record',
      orgId: orgId ?? null,
      record: record
        ? {
            recordId: record.id,
            status: record.status,
            brandId: recordBrandId,
            brandName: record.profile.identity?.brandName?.value ?? null,
            recordOrgId: record.profile.orgId ?? null,
          }
        : null,
      diagnosis: !record
        ? 'No accepted record found for this user — accept never persisted.'
        : recordBrandId
          ? 'Accepted record HAS a brandId. If the switcher is still empty it is a stale-cache/refetch issue.'
          : 'Accepted record has NO brandId, so the brand list drops it. This is the bug — needs a brandId backfill.',
    });
  }

  const services = await Promise.all(
    SERVICES.map(async (service) => {
      const resolution = await resolveEffectiveBrandWithProfile(userId, brandId, {
        service,
        orgId: orgId ?? null,
      });
      return {
        service,
        flag: brandVaultSourceFlagName(service),
        flagEnabled: brandVaultSourceEnabled(service),
        source: resolution.source,
        brandName: resolution.brand?.name ?? null,
        hasAcceptedProfile: resolution.acceptedProfile != null,
      };
    }),
  );

  return NextResponse.json({ ok: true, brandId, orgId: orgId ?? null, services });
}
