import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { runAssetDeepAnalysis, type AssetDeepAnalysisSource } from '@/lib/editron/services/asset-deep-analysis';

export const runtime = 'nodejs';
export const maxDuration = 300;

type AssetDeepAnalysisPayload = {
  assetId: string;
  userId: string;
  url: string;
  duration?: number;
};

async function handler(request: NextRequest) {
  let payload: AssetDeepAnalysisPayload | null = null;
  try {
    payload = await request.json();
    const parsedPayload = payload as AssetDeepAnalysisPayload;
    const { assetId, userId, url } = parsedPayload;
    if (!assetId || !userId || !url) {
      return NextResponse.json({ success: false, error: 'Missing assetId, userId, or url' }, { status: 400 });
    }

    const db = await getDatabase();
    const claimedAt = new Date();
    const claim = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId, deepAnalysisStatus: { $nin: ['analyzing', 'complete', 'degraded'] } },
      {
        $set: {
          analysisStatus: 'analyzing',
          deepAnalysisStatus: 'analyzing',
          deepAnalysisStartedAt: claimedAt,
        },
        $unset: { deepAnalysisError: '' },
      },
    );
    if (claim.matchedCount === 0) {
      const current = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        { projection: { deepAnalysisStatus: 1, analysisStatus: 1 } },
      );
      return NextResponse.json({
        success: true,
        assetId,
        skipped: 'duplicate-or-complete',
        deepAnalysisStatus: current?.deepAnalysisStatus ?? null,
      });
    }

    const sourceAnalysis = await db.collection('asset_analyses').findOne({ assetId, userId }) as AssetDeepAnalysisSource | null;
    const durationMs = Math.max(
      0,
      Math.round((typeof parsedPayload.duration === 'number' ? parsedPayload.duration : 0) * 1000),
      typeof sourceAnalysis?.durationMs === 'number' ? sourceAnalysis.durationMs : 0,
    );
    const result = await runAssetDeepAnalysis({ videoUrl: url, durationMs, sourceAnalysis });
    const completedAt = new Date();

    await db.collection('asset_analyses').updateOne(
      { assetId, userId },
      {
        $set: {
          assetId,
          userId,
          rawFootageAnalysis: result.rawFootageAnalysis,
          vjepaAnalysis: result.vjepaAnalysis,
          wav2vecAnalysis: result.wav2vecAnalysis,
          musicAnalysis: result.musicAnalysis,
          momentWeightMap: result.momentWeightMap,
          segmentAnalysis: result.segmentAnalysis,
          deepAnalysis: result.diagnostics,
          deepAnalysisUpdatedAt: completedAt,
        },
        $setOnInsert: { createdAt: completedAt },
      },
      { upsert: true },
    );
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      {
        $set: {
          analysisStatus: 'complete',
          analysisCompletedAt: completedAt,
          deepAnalysisStatus: result.diagnostics.status,
          deepAnalysisCompletedAt: completedAt,
          deepAnalysisDiagnostics: result.diagnostics,
        },
      },
    );

    return NextResponse.json({
      success: true,
      assetId,
      deepAnalysisStatus: result.diagnostics.status,
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AssetDeepAnalysis] Worker failed:', message);
    if (payload?.assetId && payload.userId) {
      try {
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: payload.assetId, userId: payload.userId },
          {
            $set: {
              analysisStatus: 'failed',
              analysisError: message.slice(0, 500),
              deepAnalysisStatus: 'failed',
              deepAnalysisError: message.slice(0, 500),
              deepAnalysisCompletedAt: new Date(),
            },
          },
        );
      } catch (persistError) {
        console.warn('[AssetDeepAnalysis] Could not persist failure:', persistError);
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
