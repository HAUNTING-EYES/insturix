import { auth } from '@clerk/nextjs/server';
import { after, NextResponse } from 'next/server';
import {
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
  startQueuedBrandVaultRefineryJobFromWebsite,
} from '@/lib/shared/brand-vault-refinery-api';
import { createBrandVaultBrowserFallbackFetchFromEnvironment } from '@/lib/shared/brand-vault-browser-fallback';
import { loadBrandVaultConnectedSocialEvidence } from '@/lib/shared/brand-vault-connected-social-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
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
  const start = await startQueuedBrandVaultRefineryJobFromWebsite(
    { userId, actorId: userId, body },
    {
      store,
      fetchOptions: {
        browserFallbackFetchFn: createBrandVaultBrowserFallbackFetchFromEnvironment(),
      },
      sourceEvidenceProvider: ({ socialLinks }) => loadBrandVaultConnectedSocialEvidence(userId, socialLinks),
    },
  );
  if (start.run) {
    after(() => {
      start.run?.().catch((error) => {
        console.error('[BrandVault] queued refinery job failed:', error);
      });
    });
  }
  return NextResponse.json(start.response.body, { status: start.response.status });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  const result = await getBrandVaultRefineryJob(
    { userId, jobId },
    { store: getDefaultBrandVaultRefineryStore() },
  );
  return NextResponse.json(result.body, { status: result.status });
}
