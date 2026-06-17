import { auth } from '@clerk/nextjs/server';
import { after, NextResponse } from 'next/server';
import {
  getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore,
  processNextQueuedBrandVaultRefineryJob,
  startQueuedBrandVaultRefineryJobFromWebsite,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import type { BrandRefineryJob } from '@/lib/shared/brand-website-refinery-types';
import { createBrandVaultBrowserFallbackFetchFromEnvironment } from '@/lib/shared/brand-vault-browser-fallback';
import { loadBrandVaultConnectedSocialEvidence } from '@/lib/shared/brand-vault-connected-social-loader';
import { createBrandVaultTextEvidenceCompilerFromEnvironment } from '@/lib/shared/brand-vault-text-evidence-compiler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let queueRunInFlight = false;

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
      textEvidenceCompiler: createBrandVaultTextEvidenceCompilerFromEnvironment(),
    },
  );
  if (start.run) {
    scheduleQueueRun(() => start.run?.() ?? Promise.resolve(), 'queued refinery job failed');
  }
  return NextResponse.json(start.response.body, { status: start.response.status });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  const store = getDefaultBrandVaultRefineryStore();
  const result = await getBrandVaultRefineryJob(
    { userId, jobId },
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
