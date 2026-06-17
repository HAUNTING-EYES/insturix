import { NextRequest, NextResponse } from 'next/server';
import {
  getDefaultBrandVaultRefineryStore,
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
    const result = await processNextQueuedBrandVaultRefineryJob({
      store: getDefaultBrandVaultRefineryStore(),
      fetchOptions: {
        browserFallbackFetchFn: createBrandVaultBrowserFallbackFetchFromEnvironment(),
      },
      sourceEvidenceProvider: ({ userId, socialLinks }) =>
        loadBrandVaultConnectedSocialEvidence(userId, socialLinks),
      textEvidenceCompiler: createBrandVaultTextEvidenceCompilerFromEnvironment(),
    });

    return NextResponse.json({
      ok: true,
      message: result.processed ? 'Processed Brand Vault refinery job' : 'Brand Vault refinery queue empty',
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[BrandVaultRefineryQueue] Error:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
