import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { getTranscription } from '@/lib/editron/services/media/transcription-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

type AssetTranscriptionPayload = {
  assetId: string;
  userId: string;
  orgId?: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  filename: string;
  creditTransactionId?: string;
  chargedCredits?: number;
};

const STALE_CLAIM_MS = 10 * 60 * 1000;

async function dispatchAssetAnalysis(payload: AssetTranscriptionPayload): Promise<string | undefined> {
  const qstashToken = process.env.QSTASH_TOKEN;
  if (!qstashToken) throw new Error('QSTASH_TOKEN is required for durable asset analysis');
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const response = await fetch(
    `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/asset-analysis`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '2',
        'Upstash-Timeout': '300s',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => 'no body');
    throw new Error(`Asset analysis dispatch failed: HTTP ${response.status} - ${detail}`);
  }
  const data = await response.json().catch(() => ({}));
  return typeof data.messageId === 'string' ? data.messageId : undefined;
}

async function handler(request: NextRequest) {
  let payload: AssetTranscriptionPayload | null = null;
  try {
    payload = await request.json() as AssetTranscriptionPayload;
    const { assetId, userId, type, url, filename } = payload;
    if (!assetId || !userId || !url || !filename || (type !== 'video' && type !== 'audio')) {
      return NextResponse.json({ success: false, error: 'Invalid asset transcription payload' }, { status: 400 });
    }
    // Missing/invalid duration is NOT fatal — a clip we can't time is still valid visual-only content. Do NOT
    // throw (a 500 here makes QStash retry and stalls the whole batch); just skip the transcription attempt.
    const hasVerifiedDuration = type !== 'video'
      || (typeof payload.duration === 'number' && Number.isFinite(payload.duration) && payload.duration > 0);

    const db = await getDatabase();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    const claim = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      {
        assetId,
        userId,
        $or: [
          { batchTranscriptionStatus: { $exists: false } },
          { batchTranscriptionStatus: null },
          { batchTranscriptionStatus: { $in: ['queued', 'failed'] } },
          { batchTranscriptionStatus: 'analyzing', batchTranscriptionStartedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          batchTranscriptionStatus: 'analyzing',
          batchTranscriptionStartedAt: now,
        },
        $unset: { batchTranscriptionError: '' },
      },
    );
    if (claim.matchedCount === 0) {
      const current = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        { projection: { batchTranscriptionStatus: 1, analysisStatus: 1 } },
      );
      return NextResponse.json({
        success: true,
        assetId,
        skipped: current?.batchTranscriptionStatus === 'complete' ? 'already-complete' : 'duplicate-delivery',
        batchTranscriptionStatus: current?.batchTranscriptionStatus ?? null,
      });
    }

    // Transcription is BEST-EFFORT. A silent product shot / b-roll clip — or one whose audio can't be decoded —
    // has NO speech, and that is valid content, not a failure. NEVER throw/500 for "no transcript": a 500 makes
    // QStash retry, which re-claims the asset and stalls the ENTIRE batch so the Director never runs. An empty
    // transcript → the clip is a visual-only asset the composer still uses (with the user's script as narration).
    let words: Awaited<ReturnType<typeof getTranscription>>['words'] = [];
    let language: string | null = null;
    let skipReason: string | undefined;
    if (!hasVerifiedDuration) {
      skipReason = 'missing-duration';
    } else {
      try {
        const transcription = await getTranscription(assetId, userId, { preferWordLevel: true });
        words = transcription.words;
        language = transcription.language || null;
        if (words.length === 0) skipReason = 'no-speech';
      } catch (transcriptionError) {
        const m = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
        console.warn(`[AssetTranscription] No usable transcript for ${assetId} (${m.slice(0, 140)}) — treating as silent/visual-only.`);
        skipReason = 'no-speech';
      }
    }

    const completedAt = new Date();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      {
        $set: {
          batchTranscriptionStatus: 'complete',
          batchTranscriptionCompletedAt: completedAt,
          batchTranscriptionWordCount: words.length,
          batchTranscriptionLanguage: language,
          ...(skipReason ? { batchTranscriptionSkipReason: skipReason } : {}),
          analysisStatus: 'queued',
          analysisQueuedAt: completedAt,
        },
        $unset: { batchTranscriptionError: '' },
      },
    );

    const messageId = await dispatchAssetAnalysis(payload);

    return NextResponse.json({ success: true, assetId, wordCount: words.length, language, skipReason, messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AssetTranscription] Worker failed:', message);
    if (payload?.assetId && payload.userId) {
      try {
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: payload.assetId, userId: payload.userId },
          {
            $set: {
              batchTranscriptionStatus: 'failed',
              batchTranscriptionError: message.slice(0, 500),
              batchTranscriptionCompletedAt: new Date(),
              analysisStatus: 'failed',
              analysisError: `Transcription prerequisite failed: ${message}`.slice(0, 500),
            },
          },
        );
      } catch (persistError) {
        console.warn('[AssetTranscription] Could not persist failure:', persistError);
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'asset-transcription');
