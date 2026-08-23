/**
 * POST /api/services/editron/match-edit/analyze
 *
 * Legacy, review-only Match Edit compatibility path.
 * Returns a MatchPlan before any separately authorized generation.
 *
 * 1. Resolve and register exact owned reference bytes.
 * 2. Extract schema-valid EditDNA/content-map observations plus measured cuts.
 * 3. Build a non-mutating Jaccard MatchPlan for user review.
 *
 * This is not the canonical EditFingerprint producer and does not assemble or
 * mutate a project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

const AnalyzeRequestSchema = z.object({
  userVideoAssetId: z.string().trim().min(1).max(160),
  referenceAssetId: z.string().trim().min(1).max(160),
  // Legacy Jaccard matching is uncalibrated; callers must make the policy
  // explicit instead of inheriting the old hidden 0.25 assumption.
  matchThreshold: z.number().finite().min(0).max(1),
}).strict();

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid match-edit analysis request.' },
        { status: 400 },
      );
    }
    const parsed = AnalyzeRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid match-edit analysis request.' },
        { status: 400 },
      );
    }
    const { userVideoAssetId, referenceAssetId, matchThreshold } = parsed.data;

    // 1. Resolve and canonicalize the owned reference before any analysis.
    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
    const { resolveReferenceVideoSource } = await import('@/lib/editron/reference-video/reference-video-source');
    const resolved = await resolveReferenceVideoSource({ userId, referenceAssetId, assetResolver });
    if (!resolved.ok) {
      const status = resolved.reason === 'reference_asset_not_found' ? 404 : 422;
      return NextResponse.json({ success: false, error: resolved.reason }, { status });
    }
    const { canonicalizeReferenceVideo } = await import('@/lib/editron/reference-video/canonicalize-reference');
    const canonical = await canonicalizeReferenceVideo({
      userId,
      orgId: orgId ?? undefined,
      source: resolved.source,
      audioUsageMode: 'preview-waveform-only',
    });
    if (!canonical.sourceRegistration) throw new Error('MATCH_EDIT_CANONICAL_RECEIPT_MISSING');

    // 2. Extract review-only EditDNA + contentMap from exact registered bytes.
    const { extractReferenceAnalysis } = await import('@/lib/editron/services/reference-content-extractor');
    const referenceAnalysis = await extractReferenceAnalysis({
      userId,
      orgId: orgId ?? undefined,
      source: {
        referenceAssetId: canonical.referenceAssetId,
        videoUrl: canonical.videoUrl,
        sourceName: canonical.sourceLabel ?? resolved.source.sourceLabel,
        durationSec: canonical.durationSec ?? resolved.source.durationSec,
        registration: canonical.sourceRegistration,
      },
    });

    // 3. Match user footage segments (0 AI calls)
    const { matchFootage } = await import('@/lib/editron/services/footage-matcher');
    console.log(`[match-edit/analyze] Matching user footage ${userVideoAssetId}...`);
    const matchPlan = await matchFootage(userVideoAssetId, userId, referenceAnalysis.contentMap, matchThreshold);

    const totalMs = Date.now() - startMs;
    console.log(`[match-edit/analyze] Done in ${totalMs}ms: ${matchPlan.matched.length} matched, ${matchPlan.gaps.length} gaps (${matchPlan.coveragePercent}% coverage)`);

    return NextResponse.json({
      success: true,
      referenceAnalysis: {
        dna: referenceAnalysis.dna,
        contentMap: referenceAnalysis.contentMap,
        sceneCount: referenceAnalysis.contentMap.length,
        source: referenceAnalysis.source,
      },
      matchPlan,
      generationQuote: {
        status: 'required',
        gapCount: matchPlan.gaps.length,
      },
      analysisTimeMs: totalMs,
    });

  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : 'match_edit_analysis_failed';
    const status = code === 'model_response_invalid'
      ? 502
      : code === 'source_too_large'
        ? 413
        : ['canonical_identity_invalid', 'source_too_small', 'content_type_unsupported'].includes(code)
          ? 422
          : 503;
    console.error('[match-edit/analyze] Failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ success: false, error: code }, { status });
  }
}
