import { auth } from '@clerk/nextjs/server';
import { after, NextResponse } from 'next/server';
import {
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
  processNextQueuedBrandVaultRefineryJob,
  startQueuedBrandVaultRefineryJobFromWebsite,
  type BrandVaultRefineryStore,
  type QueuedBrandVaultRefineryJobStart,
} from '@/lib/shared/brand-vault-refinery-api';
import type { BrandRefineryJob } from '@/lib/shared/brand-website-refinery-types';
import { createBrandVaultBrowserFallbackFetchFromEnvironment } from '@/lib/shared/brand-vault-browser-fallback';
import { loadBrandVaultConnectedSocialEvidence } from '@/lib/shared/brand-vault-connected-social-loader';
import { createBrandVaultTextEvidenceCompilerFromEnvironment } from '@/lib/shared/brand-vault-text-evidence-compiler';
import { authorizeBrandVaultScanRequest } from '@/lib/shared/brand-vault-scan-authorization';
import { BrandClientRegistryError, ensureBrandVaultClient } from '@/lib/shared/brand-client-registry';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let queueRunInFlight = false;

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

  const store = getDefaultBrandVaultRefineryStore();
  const authorization = await authorizeBrandVaultScanRequest({
    body,
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
  const authorizedBody = authorization.body;
  body = authorizedBody;

  const scanRequestType = getBrandVaultScanRequestType(body);
  const creditCheck = await checkCredits(userId, 'brand_vault', 'brand_scan', {
    requestType: scanRequestType,
  });
  if (!creditCheck.allowed) {
    return creditCheck.errorResponse!;
  }

  try {
    await creditCheck.deduct();
  } catch (error) {
    console.error('[BrandVault] brand scan credit deduction failed:', error);
    return NextResponse.json(
      { ok: false, error: { code: 'credit_deduction_failed', message: 'Unable to deduct credits for Brand Vault scan.' } },
      { status: 402 },
    );
  }

  if (authorization.source === 'server_minted_new_client') {
    try {
      await ensureBrandVaultClient({
        brandId: authorization.brandId,
        userId,
        orgId: orgId ?? null,
        websiteUrl: typeof authorizedBody.websiteUrl === 'string' ? authorizedBody.websiteUrl : '',
        companyName: authorizedBody.companyName,
        source: 'brand_vault_scan',
      });
    } catch (error) {
      await refundBrandScanCredits(creditCheck, 'Brand Vault client provisioning failed');
      const invalidWebsite = error instanceof BrandClientRegistryError && error.code === 'invalid_website_url';
      console.error('[BrandVault] client provisioning failed:', error);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: invalidWebsite ? 'invalid_url' : 'client_provision_failed',
            message: invalidWebsite
              ? 'Enter a valid client website before scanning.'
              : 'Could not create this client. Please retry.',
          },
        },
        { status: invalidWebsite ? 400 : 503 },
      );
    }
  }

  let start: QueuedBrandVaultRefineryJobStart;
  try {
    start = await startQueuedBrandVaultRefineryJobFromWebsite(
      { userId, orgId: orgId ?? undefined, actorId: userId, body },
      {
        store,
        fetchOptions: {
          browserFallbackFetchFn: createBrandVaultBrowserFallbackFetchFromEnvironment(),
        },
        sourceEvidenceProvider: ({ userId: sourceUserId, socialLinks }) =>
          loadBrandVaultConnectedSocialEvidence(sourceUserId, socialLinks),
        textEvidenceCompiler: createBrandVaultTextEvidenceCompilerFromEnvironment(),
      },
    );
  } catch (error) {
    await refundBrandScanCredits(creditCheck, 'Brand Vault scan failed before queue start');
    throw error;
  }

  if (start.response.status !== 202 || !start.run) {
    await refundBrandScanCredits(creditCheck, 'Brand Vault scan was not queued');
    return NextResponse.json(start.response.body, { status: start.response.status });
  }

  const runQueuedScan = start.run;
  scheduleQueueRun(() => runQueuedScan(), 'queued refinery job failed');
  return NextResponse.json(start.response.body, { status: start.response.status });
}

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  const store = getDefaultBrandVaultRefineryStore();
  const result = await getBrandVaultRefineryJob(
    { userId, orgId: orgId ?? undefined, jobId },
    { store },
  );
  if (result.body.ok && isActiveRefineryJobStatus(result.body.job.status)) {
    scheduleQueueRun(() => processNextQueuedBrandVaultRefineryJob(queueProcessorDependencies(store)), 'poll-time queue nudge failed');
  }
  return NextResponse.json(result.body, { status: result.status });
}

function scheduleQueueRun(run: () => Promise<unknown>, label: string): void {
  if (queueRunInFlight) return;
  queueRunInFlight = true;
  after(async () => {
    try {
      await run();
    } catch (error) {
      console.error(`[BrandVault] ${label}:`, error);
    } finally {
      queueRunInFlight = false;
    }
  });
}

function queueProcessorDependencies(store: BrandVaultRefineryStore) {
  return {
    store,
    fetchOptions: {
      browserFallbackFetchFn: createBrandVaultBrowserFallbackFetchFromEnvironment(),
    },
    sourceEvidenceProvider: ({ userId, socialLinks }: { userId: string; socialLinks: string[] }) =>
      loadBrandVaultConnectedSocialEvidence(userId, socialLinks),
    textEvidenceCompiler: createBrandVaultTextEvidenceCompilerFromEnvironment(),
  };
}

function isActiveRefineryJobStatus(status: BrandRefineryJob['status']): boolean {
  return status === 'queued' || status === 'running';
}

function getBrandVaultScanRequestType(body: unknown): 'base' | 'deep' {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'base';
  const input = body as Record<string, unknown>;
  const socialLinks = Array.isArray(input.socialLinks) ? input.socialLinks : [];
  const sourceEvidence = Array.isArray(input.sourceEvidence) ? input.sourceEvidence : [];
  return socialLinks.length > 0 || sourceEvidence.length > 0 ? 'deep' : 'base';
}

async function refundBrandScanCredits(creditCheck: CreditCheckResult, reason: string): Promise<void> {
  try {
    await creditCheck.refund(reason);
  } catch (error) {
    console.error('[BrandVault] brand scan credit refund failed:', error);
  }
}
