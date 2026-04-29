/**
 * POST /api/services/editron/match-edit
 *
 * Match Edit: user footage + optional reference video → AI assembles.
 *
 * Two modes (determined by whether referenceAssetId is provided):
 * - Mode A (reference): Analyze reference → match user footage → fill gaps → assemble
 * - Mode B (no reference): Analyze user footage → auto-edit with detected profile
 *
 * Mode B delegates to /auto-edit/from-asset (already built).
 * Mode A is the new path: reference content extraction + Jaccard matching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface MatchEditRequest {
  userVideoAssetId: string;
  referenceAssetId?: string;
  title?: string;
  aspectRatio?: string;
  userIntent?: string;
  platform?: string;
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: MatchEditRequest = await request.json();
    const { userVideoAssetId, referenceAssetId, title, aspectRatio, userIntent, platform } = body;

    if (!userVideoAssetId) {
      return NextResponse.json({ success: false, error: 'userVideoAssetId required' }, { status: 400 });
    }

    // Mode B: No reference → delegate to from-asset (auto-edit)
    if (!referenceAssetId) {
      console.log(`[match-edit] Mode B (no reference) → delegating to from-asset`);
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

      const res = await fetch(`${baseUrl}/api/services/editron/auto-edit/from-asset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          assetId: userVideoAssetId,
          title,
          aspectRatio,
          userIntent,
          platform,
        }),
      });

      const data = await res.json();
      return NextResponse.json({ ...data, mode: 'auto-edit' });
    }

    // Mode A: Reference-guided edit
    console.log(`[match-edit] Mode A (reference-guided): user=${userVideoAssetId}, ref=${referenceAssetId}`);

    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');

    // 1. Validate both assets
    const userAsset = await assetResolver.getAsset(userVideoAssetId, userId);
    const refAsset = await assetResolver.getAsset(referenceAssetId, userId);
    if (!userAsset || !refAsset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    const userUrl = await assetResolver.resolveAssetUrl(userVideoAssetId, userId);
    const refUrl = await assetResolver.resolveAssetUrl(referenceAssetId, userId);
    if (!userUrl || !refUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve asset URLs' }, { status: 500 });
    }

    // 2. Analyze reference video → SyntheticStoryboard (scene structure)
    const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
    console.log(`[match-edit] Analyzing reference video...`);
    const refStoryboard = await analyzeVideo(refUrl, refAsset.duration || 30, 'reference video for style matching');

    if (!refStoryboard || refStoryboard.scenes.length === 0) {
      return NextResponse.json({ success: false, error: 'Reference video analysis failed' }, { status: 500 });
    }
    console.log(`[match-edit] Reference: ${refStoryboard.scenes.length} scenes, type=${refStoryboard.contentType}`);

    // 3. Transcribe user footage (for Jaccard matching)
    let userTranscript = '';
    try {
      const { getTranscription } = await import('@/lib/editron/services/media/transcription-service');
      const transcription = await getTranscription(userVideoAssetId, userId);
      userTranscript = transcription.words?.map((w: any) => w.word).join(' ') || transcription.transcript || '';
      console.log(`[match-edit] User transcript: ${userTranscript.length} chars`);
    } catch {
      console.warn(`[match-edit] User transcription failed, matching by scene description only`);
    }

    // 4. Match user footage segments to reference scenes (Jaccard)
    const matchResults = refStoryboard.scenes.map((refScene, i) => {
      const refText = `${refScene.descriptor.narration} ${refScene.descriptor.visualDescription}`.toLowerCase();
      const refWords = new Set(refText.split(/\s+/).filter(w => w.length > 3));
      const userWords = new Set(userTranscript.toLowerCase().split(/\s+/).filter(w => w.length > 3));

      let overlap = 0;
      for (const w of refWords) { if (userWords.has(w)) overlap++; }
      const similarity = refWords.size > 0 ? overlap / refWords.size : 0;

      return {
        refSceneIndex: i,
        refDescription: refScene.descriptor.visualDescription,
        matched: similarity > 0.2,
        similarity,
        isGap: similarity <= 0.2,
      };
    });

    const matched = matchResults.filter(r => r.matched).length;
    const gaps = matchResults.filter(r => r.isGap).length;
    console.log(`[match-edit] Matching: ${matched}/${refStoryboard.scenes.length} matched, ${gaps} gaps`);

    // 5. Create project via from-asset (user footage + reference style)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

    const assembleRes = await fetch(`${baseUrl}/api/services/editron/auto-edit/from-asset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        assetId: userVideoAssetId,
        title: title || `Match Edit: ${refAsset.filename}`,
        aspectRatio,
        referenceAssetId,
        userIntent,
        platform: platform || refStoryboard.platform,
      }),
    });

    const assembleData = await assembleRes.json();
    const totalMs = Date.now() - startMs;

    return NextResponse.json({
      ...assembleData,
      mode: 'match-edit',
      matchResults,
      referenceScenes: refStoryboard.scenes.length,
      matchedScenes: matched,
      gapScenes: gaps,
      totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[match-edit] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
