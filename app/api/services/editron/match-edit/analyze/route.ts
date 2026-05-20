/**
 * POST /api/services/editron/match-edit/analyze
 *
 * Step 1 of Match Edit: Analyze reference video + match user footage.
 * Returns MatchPlan for user review BEFORE any generation or assembly.
 *
 * Per EDITRON_MATCH_EDIT_PLAN.md Phase 4:
 * 1. Resolve reference video URL
 * 2. extractReferenceAnalysis() → EditDNA + contentMap (1 Gemini call)
 * 3. matchFootage() → MatchPlan (0 AI calls, Jaccard on transcripts)
 * 4. Return { matchPlan, referenceAnalysis } for frontend to display
 *
 * User reviews gaps → confirms → calls /generate-gap per gap → then /assemble.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface AnalyzeRequest {
  userVideoAssetId: string;
  referenceAssetId: string;
  matchThreshold?: number;
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: AnalyzeRequest = await request.json();
    const { userVideoAssetId, referenceAssetId, matchThreshold = 0.25 } = body;

    if (!userVideoAssetId || !referenceAssetId) {
      return NextResponse.json(
        { success: false, error: 'userVideoAssetId and referenceAssetId required' },
        { status: 400 },
      );
    }

    // 1. Resolve reference video URL
    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
    const refAsset = await assetResolver.getAsset(referenceAssetId, userId);
    if (!refAsset) {
      return NextResponse.json({ success: false, error: 'Reference asset not found' }, { status: 404 });
    }
    const refUrl = await assetResolver.resolveAssetUrl(referenceAssetId, userId);
    if (!refUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve reference URL' }, { status: 500 });
    }

    // 2. Extract EditDNA + contentMap (1 Gemini call)
    const { extractReferenceAnalysis } = await import('@/lib/editron/services/reference-content-extractor');
    console.log(`[match-edit/analyze] Extracting reference analysis from ${refAsset.filename}...`);
    const referenceAnalysis = await extractReferenceAnalysis(refUrl, userId, refAsset.filename);
    console.log(`[match-edit/analyze] Reference: ${referenceAnalysis.contentMap.length} scenes, pacing=${referenceAnalysis.dna.pacing.overall}`);

    // 3. Match user footage segments (0 AI calls)
    const { matchFootage } = await import('@/lib/editron/services/footage-matcher');
    console.log(`[match-edit/analyze] Matching user footage ${userVideoAssetId}...`);
    const matchPlan = await matchFootage(userVideoAssetId, userId, referenceAnalysis.contentMap, matchThreshold);

    const totalMs = Date.now() - startMs;
    console.log(`[match-edit/analyze] Done in ${totalMs}ms: ${matchPlan.matched.length} matched, ${matchPlan.gaps.length} gaps (${matchPlan.coveragePercent}% coverage)`);

    // Estimate gap generation cost
    const gapCost = matchPlan.gaps.length * 0.60; // ~$0.60 per fal.ai video gen

    return NextResponse.json({
      success: true,
      referenceAnalysis: {
        dna: referenceAnalysis.dna,
        contentMap: referenceAnalysis.contentMap,
        sceneCount: referenceAnalysis.contentMap.length,
      },
      matchPlan,
      gapCost: {
        gapCount: matchPlan.gaps.length,
        estimatedUSD: gapCost,
        estimatedCredits: Math.ceil(gapCost * 10), // rough credit conversion
      },
      analysisTimeMs: totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[match-edit/analyze] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
