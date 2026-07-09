import { NextRequest, NextResponse } from 'next/server';
import {
  getDefaultBrandVaultRefineryStore,
  processNextPendingProductUiDecode,
  processNextQueuedBrandVaultRefineryJob,
} from '@/lib/shared/brand-vault-refinery-api';
import { createBrandVaultBrowserFallbackFetchFromEnvironment } from '@/lib/shared/brand-vault-browser-fallback';
import { loadBrandVaultConnectedSocialEvidence } from '@/lib/shared/brand-vault-connected-social-loader';
import { createBrandVaultTextEvidenceCompilerFromEnvironment } from '@/lib/shared/brand-vault-text-evidence-compiler';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const userAgent = request.headers.get('user-agent') || '';
    if (!userAgent.includes('vercel-cron')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const deps = {
      store: getDefaultBrandVaultRefineryStore(),
      fetchOptions: {
        browserFallbackFetchFn: createBrandVaultBrowserFallbackFetchFromEnvironment(),
      },
      sourceEvidenceProvider: ({ userId, socialLinks }: { userId: string; socialLinks: string[] }) =>
        loadBrandVaultConnectedSocialEvidence(userId, socialLinks),
      textEvidenceCompiler: createBrandVaultTextEvidenceCompilerFromEnvironment(),
    };

    const queue = await processNextQueuedBrandVaultRefineryJob(deps);
    // No fresh scan to run this tick? Use the slot to backfill a draft whose vision decode never landed
    // (function killed mid-decode, or a transient GLM error). Best-effort, cooldown-gated in the refinery.
    const decode = queue.processed ? null : await processNextPendingProductUiDecode(deps);

    return NextResponse.json({
      ok: true,
      message: queue.processed
        ? 'Processed Brand Vault refinery job'
        : decode?.processed
          ? 'Backfilled Brand Vault product-UI decode'
          : 'Brand Vault refinery queue empty',
      queue,
      decode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[BrandVaultRefineryQueue] Error:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
