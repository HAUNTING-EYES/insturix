import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  createBrandVaultDomainVerificationInstruction,
  verifyBrandVaultDomainDnsRecord,
} from '@/lib/shared/brand-vault-domain-verification';
import { getDefaultBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';
import { authorizeBrandVaultScanRequest } from '@/lib/shared/brand-vault-scan-authorization';
import { bindVerifiedBrandVaultDomain, BrandClientRegistryError } from '@/lib/shared/brand-client-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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

  const websiteUrl = isRecord(body) && typeof body.websiteUrl === 'string' ? body.websiteUrl : '';
  const action = isRecord(body) && body.action === 'verify' ? 'verify' : 'instructions';
  const brandId = isRecord(body) && typeof body.brandId === 'string' ? body.brandId.trim() : '';
  if (!websiteUrl.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: 'missing_website_url', message: 'websiteUrl is required.' } },
      { status: 400 },
    );
  }

  try {
    if (action === 'verify') {
      if (!brandId) {
        return NextResponse.json(
          { ok: false, error: { code: 'missing_brand_id', message: 'Start or select a client before verifying its domain.' } },
          { status: 400 },
        );
      }

      const store = getDefaultBrandVaultRefineryStore();
      const authorization = await authorizeBrandVaultScanRequest({
        body: { websiteUrl, brandId },
        userId,
        orgId: orgId ?? null,
        isOrgAdmin: Boolean(orgId && has({ role: 'org:admin' })),
        store,
      });
      if (!authorization.ok) {
        return NextResponse.json(
          { ok: false, error: { code: authorization.code, message: authorization.message } },
          { status: authorization.status },
        );
      }

      const result = await verifyBrandVaultDomainDnsRecord({ userId, websiteUrl });
      if (!result.verified) {
        return NextResponse.json({ ok: true, verification: result }, { status: 200 });
      }

      try {
        const binding = await bindVerifiedBrandVaultDomain({
          brandId: authorization.brandId,
          userId,
          orgId: orgId ?? null,
          websiteUrl,
          recordName: result.recordName,
          verifiedAt: result.checkedAt,
        });
        return NextResponse.json({ ok: true, verification: result, binding }, { status: 200 });
      } catch (error) {
        const isKnownError = error instanceof BrandClientRegistryError;
        const status = isKnownError && error.code === 'domain_bound_elsewhere'
          ? 409
          : isKnownError && error.code === 'invalid_website_url'
            ? 400
            : 503;
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: isKnownError ? error.code : 'domain_binding_unavailable',
              message: isKnownError ? error.message : 'Could not bind the verified domain to this client. Please retry.',
            },
          },
          { status },
        );
      }
    }
    const instruction = createBrandVaultDomainVerificationInstruction({ userId, websiteUrl });
    return NextResponse.json({ ok: true, verification: instruction }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'domain_verification_unavailable',
          message: error instanceof Error ? error.message : 'Domain verification is unavailable.',
        },
      },
      { status: 400 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
