import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
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
    return NextResponse.json(
      { ok: false, error: { code: 'brand_required', message: 'brandId is required.' } },
      { status: 400 },
    );
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
