/**
 * POST /api/internal/workers/asset-analysis
 *
 * QStash worker that runs 5-Track analysis on a newly uploaded asset.
 * Triggered after media upload completes. Runs in background — doesn't
 * block the upload response.
 *
 * Generates:
 * - 5-Track analysis (speech, visual, music, motion, subjects)
 * - Auto-tags (content type, shot type, energy level, subjects)
 * - Semantic embedding (Gemini textEmbedding for search)
 *
 * Results stored in asset_analyses collection (same as Director uses)
 * + tags/embedding stored on the MediaAsset document itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { EDITRON_EMBEDDING_MODEL, generateEditronEmbedding } from '@/lib/editron/services/gemini-embedding';
import { ANALYSIS_MODEL_NAME } from '@/lib/editron/utils/gemini-model-factory';
import {
  buildAssetAnalysisClaimFilter,
  buildAssetAnalysisClaimUpdate,
  resolveAssetVideoAnalysisPolicy,
} from '@/lib/editron/services/asset-analysis-worker-policy';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { ProviderCostBasis, ProviderCostUnits } from '@/lib/financials/provider-cost-estimates';
import type { TranscriptionData } from '@/lib/editron/services/media/types';
import { buildAssetDeepAnalysisTimeline } from '@/lib/editron/services/asset-deep-analysis';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AssetAnalysisPayload {
  assetId: string;
  userId: string;
  orgId?: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  filename: string;
  creditTransactionId?: string;
  chargedCredits?: number;
}

async function handler(request: NextRequest) {
  console.log('[AssetAnalysis] Worker started');
  let payload: AssetAnalysisPayload | null = null;

  try {
    payload = await request.json() as AssetAnalysisPayload;
    const { assetId, userId, type, url, duration, filename } = payload as AssetAnalysisPayload;

    if (!assetId || !userId || !url) {
      console.error('[AssetAnalysis] Missing required fields');
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    const db = await getDatabase();

    const claimNow = new Date();
    const claim = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      buildAssetAnalysisClaimFilter({ assetId, userId, now: claimNow }),
      buildAssetAnalysisClaimUpdate(claimNow),
    );
    if (claim.matchedCount === 0) {
      const existing = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        { projection: { analysisStatus: 1, analysisStartedAt: 1, analysisCompletedAt: 1 } },
      );
      const skipped = existing?.analysisStatus === 'complete' ? 'already-complete' : 'duplicate-delivery';
      console.log(`[AssetAnalysis] ${assetId}: ${skipped}; current status=${existing?.analysisStatus ?? 'missing'}`);
      return NextResponse.json({
        success: true,
        assetId,
        skipped,
        analysisStatus: existing?.analysisStatus ?? null,
      });
    }

    const mediaAsset = type === 'video'
      ? await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        {
          projection: {
            transcription: 1,
            batchTranscriptionStatus: 1,
            batchTranscriptionSkipReason: 1,
          },
        },
      ) as {
        transcription?: TranscriptionData | null;
        batchTranscriptionStatus?: string | null;
        batchTranscriptionSkipReason?: string | null;
      } | null
      : null;
    const transcriptionCandidate = mediaAsset?.transcription ?? null;
    const transcription = transcriptionCandidate
      && Array.isArray(transcriptionCandidate.words)
      && typeof transcriptionCandidate.language === 'string'
      ? transcriptionCandidate
      : null;
    const visualOnlyReason = typeof mediaAsset?.batchTranscriptionSkipReason === 'string'
      ? mediaAsset.batchTranscriptionSkipReason.trim() || null
      : null;
    if (type === 'video' && !transcription && (
      mediaAsset?.batchTranscriptionStatus !== 'complete'
      || !visualOnlyReason
    )) {
      throw new Error(`Transcription stage incomplete for video asset ${assetId}`);
    }

    const analysisInputMode = type !== 'video'
      ? 'not-applicable' as const
      : transcription
        ? 'speech-and-visual' as const
        : 'visual-only' as const;
    const durationMs = Math.round((duration || 0) * 1000);
    if (type === 'video') {
      let speechSegments: Array<{ startMs: number; endMs: number; text: string }> = [];
      if (transcription) {
        const transcriptTimeline = buildAssetDeepAnalysisTimeline({
          videoUrl: url,
          durationMs,
          sourceAnalysis: { durationMs, transcription },
        });
        speechSegments = (transcriptTimeline.rawFootageAnalysis.segments ?? [])
          .filter((segment) => segment.text.trim().length > 0)
          .map((segment) => ({ startMs: segment.startMs, endMs: segment.endMs, text: segment.text }));
      }
      await db.collection('asset_analyses').updateOne(
        { assetId, userId },
        {
          $set: {
            durationMs,
            analysisInputMode,
            transcriptionSkipReason: visualOnlyReason,
            status: 'complete',
            ...(transcription ? { transcription, speechSegments } : {}),
          },
          ...(transcription ? {} : { $unset: { transcription: '', speechSegments: '' } }),
        },
        { upsert: true },
      );
    }

    const tags: string[] = analysisInputMode === 'visual-only' ? ['video', 'visual-only'] : [];
    let embedding: number[] | null = null;

    // ─── Video Analysis (full 5-Track) ──────────────────────────
    if (type === 'video') {
      const videoPolicy = resolveAssetVideoAnalysisPolicy({ type, durationSeconds: duration });
      try {
        let analysis: any = null;

        if (videoPolicy.shouldRunFullAnalysis) {
          const { runFullAnalysis } = await import('@/lib/editron/services/five-track-analysis');
          const durationMs = (duration || 5) * 1000;

          analysis = await runFullAnalysis(assetId, userId, {
            videoUrl: url,
            audioUrl: url,
            durationMs,
            transcript: transcription?.transcript,
            words: transcription?.words,
            sourceType: 'real-footage',
          });
        } else {
          tags.push('video', 'metadata-only', 'full-analysis-deferred');
          console.log(
            `[AssetAnalysis] ${assetId}: skipping full 5-Track at ingest (${videoPolicy.reason}, ` +
            `duration=${videoPolicy.durationSeconds ?? 'unknown'}s, max=${videoPolicy.maxDurationSeconds}s)`,
          );
        }

        if (analysis) {
          // Extract tags from analysis
          // Layer 4 (keyframes): shot types, subjects, moods
          if (analysis.keyframeAnalyses) {
            for (const kf of analysis.keyframeAnalyses) {
              if (kf.shotType && kf.shotType !== 'unknown' && !tags.includes(kf.shotType)) tags.push(kf.shotType);
              if (kf.subjects) {
                for (const s of kf.subjects) {
                  const tag = s.label;
                  if (tag && !tags.includes(tag)) tags.push(tag);
                }
              }
            }
          }

          // Layer 2 (motion): dominant motion type
          if (analysis.motionSegments?.length) {
            const motionTypes = analysis.motionSegments.map((s: { cameraMotion?: string }) => s.cameraMotion).filter(Boolean);
            const dominant = mostFrequent(motionTypes);
            if (dominant && !tags.includes(dominant)) tags.push(dominant);
          }

          // Energy level tag from motion segments
          if (analysis.motionSegments?.length) {
            const avgIntensity = analysis.motionSegments.reduce((sum: number, s: { motionIntensity?: number }) => sum + (s.motionIntensity || 0), 0) / analysis.motionSegments.length;
            tags.push(avgIntensity > 0.7 ? 'high-energy' : avgIntensity > 0.3 ? 'medium-energy' : 'calm');
          }

          // Layer 5 (subjects): subject categories
          if (analysis.subjectTracks) {
            for (const subj of analysis.subjectTracks) {
              const cat = subj.category || subj.label;
              if (cat && !tags.includes(cat)) tags.push(cat);
            }
          }

          console.log(`[AssetAnalysis] ${assetId}: 5-Track complete, ${tags.length} tags extracted`);
        }

        const analysisCacheHit = Boolean(analysis?._analysisCacheHit);
        const fiveTrackProviderUsage = analysisCacheHit ? null : readFiveTrackProviderUsage(analysis);

        await recordAssetAnalysisCostEvent(payload, {
          stage: 'video_5_track',
          status: videoPolicy.shouldRunFullAnalysis ? 'success' : 'skipped',
          provider: 'google-gemini',
          model: ANALYSIS_MODEL_NAME,
          operation: 'video_analysis',
          includeRevenue: true,
          units: buildFiveTrackProviderCostUnits(duration, fiveTrackProviderUsage),
          metadata: {
            durationSeconds: duration || null,
            analysisReturned: !!analysis,
            tagsCount: tags.length,
            fullVideoAnalysisPolicy: videoPolicy,
            analysisPipeline: 'five-track-analysis',
            analysisCacheHit,
            geminiUsageRequestCount: fiveTrackProviderUsage?.requestCount ?? null,
            geminiUsageMissingResponses: fiveTrackProviderUsage?.missingUsageCount ?? null,
            geminiUsageCaptured: Boolean(fiveTrackProviderUsage?.inputTokens || fiveTrackProviderUsage?.outputTokens),
          },
        });
      } catch (analysisErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: 5-Track failed: ${analysisErr.message}`);
        tags.push('analysis-failed');
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'video_5_track',
          status: 'failed',
          provider: 'google-gemini',
          model: ANALYSIS_MODEL_NAME,
          operation: 'video_analysis',
          includeRevenue: true,
          units: buildFiveTrackProviderCostUnits(duration, null),
          metadata: {
            durationSeconds: duration || null,
            errorClass: analysisErr?.name || 'Error',
            fullVideoAnalysisPolicy: videoPolicy,
            analysisPipeline: 'five-track-analysis',
          },
        });
      }
    }

    // ─── Image Analysis (Gemini Vision) ─────────────────────────
    if (type === 'image') {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // For images, use URL-based analysis instead
        const urlResult = await model.generateContent([
          `Analyze the image at this URL: ${url}
Return JSON only:
{
  "subjects": ["list of main subjects"],
  "shotType": "wide|medium|close-up|extreme-close-up|overhead",
  "mood": "energetic|calm|dramatic|playful|professional|dark|bright",
  "colors": ["dominant colors"],
  "tags": ["5-10 descriptive tags"]
}`,
        ]);

        const text = urlResult.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tags) tags.push(...parsed.tags.filter((t: string) => !tags.includes(t)));
          if (parsed.shotType) tags.push(parsed.shotType);
          if (parsed.mood) tags.push(parsed.mood);
          if (parsed.subjects) tags.push(...parsed.subjects.filter((s: string) => !tags.includes(s)));
        }

        console.log(`[AssetAnalysis] ${assetId}: image analysis complete, ${tags.length} tags`);
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'image_gemini_vision',
          status: 'success',
          provider: 'google-gemini',
          model: 'gemini-2.5-flash',
          operation: 'image_analysis',
          includeRevenue: true,
          units: { requestCount: 1, imageCount: 1 },
          metadata: { tagsCount: tags.length },
        });
      } catch (imgErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: image analysis failed: ${imgErr.message}`);
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'image_gemini_vision',
          status: 'failed',
          provider: 'google-gemini',
          model: 'gemini-2.5-flash',
          operation: 'image_analysis',
          includeRevenue: true,
          units: { requestCount: 1, imageCount: 1 },
          metadata: { errorClass: imgErr?.name || 'Error' },
        });
      }
    }

    // ─── Audio Analysis (basic metadata) ────────────────────────
    if (type === 'audio') {
      tags.push('audio');
      if (filename.match(/music|bgm|track|song/i)) tags.push('music');
      if (filename.match(/voice|narrat|speech|vo\b/i)) tags.push('voiceover');
      if (filename.match(/sfx|effect|sound/i)) tags.push('sound-effect');
      if (filename.match(/ambient|atmosphere/i)) tags.push('ambient');
      await recordAssetAnalysisCostEvent(payload, {
        stage: 'audio_metadata',
        status: 'success',
        provider: 'local',
        model: 'filename-metadata-rules',
        operation: 'metadata_analysis',
        includeRevenue: true,
        estimatedCostUsd: 0,
        costBasis: 'provider_usage',
        units: { requestCount: 1 },
        metadata: { tagsCount: tags.length },
      });
    }

    // ─── Generate Semantic Embedding ────────────────────────────
    try {
      // Build a text description from tags + filename for embedding
      const embeddingText = `${filename} ${type} ${tags.join(' ')}`;
      embedding = await generateEditronEmbedding(embeddingText, {
        taskType: 'RETRIEVAL_DOCUMENT',
        title: filename,
      });

      if (embedding) {
        console.log(`[AssetAnalysis] ${assetId}: embedding generated (${embedding.length} dims)`);
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'gemini_embedding',
          status: 'success',
          provider: 'google-gemini',
          model: EDITRON_EMBEDDING_MODEL,
          operation: 'embedding',
          units: { requestCount: 1 },
          metadata: { embeddingDimensions: embedding.length, tagsCount: tags.length },
        });
      } else {
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'gemini_embedding',
          status: 'skipped',
          provider: 'google-gemini',
          model: EDITRON_EMBEDDING_MODEL,
          operation: 'embedding',
          estimatedCostUsd: 0,
          costBasis: 'provider_usage',
          units: { requestCount: 0 },
          metadata: { reason: 'no_embedding_returned', tagsCount: tags.length },
        });
      }
    } catch (embErr: any) {
      console.warn(`[AssetAnalysis] ${assetId}: embedding failed: ${embErr.message}`);
      await recordAssetAnalysisCostEvent(payload, {
        stage: 'gemini_embedding',
        status: 'failed',
        provider: 'google-gemini',
        model: EDITRON_EMBEDDING_MODEL,
        operation: 'embedding',
        units: { requestCount: 1 },
        metadata: { errorClass: embErr?.name || 'Error', tagsCount: tags.length },
      });
    }

    // ─── Update MediaAsset with tags + embedding + status ───────
    const qstashToken = process.env.QSTASH_TOKEN;
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const shouldQueueDeepAnalysis = type === 'video' && Boolean(qstashToken);

    const updateDoc: any = {
      analysisStatus: shouldQueueDeepAnalysis ? 'analyzing' : 'complete',
      ...(type === 'video' ? {
        analysisInputMode,
        ...(analysisInputMode === 'visual-only' ? { visualOnlyReason } : {}),
      } : {}),

      ...(shouldQueueDeepAnalysis
        ? { deepAnalysisStatus: 'queued', deepAnalysisQueuedAt: new Date() }
        : type === 'video'
          ? { deepAnalysisStatus: 'skipped_no_qstash' }
          : {}),
      ...(!shouldQueueDeepAnalysis && { analysisCompletedAt: new Date() }),
      tags: [...new Set(tags)].slice(0, 30), // Dedupe, cap at 30 tags
    };
    if (embedding) {
      updateDoc.semanticEmbedding = embedding;
      updateDoc.semanticEmbeddingModel = EDITRON_EMBEDDING_MODEL;
      updateDoc.semanticEmbeddingUpdatedAt = new Date();
    }

    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId, userId },
      {
        $set: updateDoc,
        ...(type === 'video' && analysisInputMode !== 'visual-only' ? { $unset: { visualOnlyReason: '' } } : {}),
      },
    );

    let deepAnalysisQueued = false;
    if (shouldQueueDeepAnalysis && qstashToken) {
      const deepAnalysisRes = await fetch(
        `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/asset-deep-analysis`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '2',
            'Upstash-Timeout': '300s',
          },
          body: JSON.stringify({ assetId, userId, url, duration }),
        },
      );
      if (!deepAnalysisRes.ok) {
        const body = await deepAnalysisRes.text().catch(() => 'no body');
        throw new Error(`Deep asset analysis dispatch failed: HTTP ${deepAnalysisRes.status} - ${body}`);
      }
      deepAnalysisQueued = true;
      console.log(`[AssetAnalysis] ${assetId}: base analysis complete; deep multimodal analysis queued`);
    } else {
      console.log(`[AssetAnalysis] ${assetId}: complete. ${tags.length} tags, embedding: ${!!embedding}`);
    }

    // ─── Enrich Neo4j Asset node via graph-sync worker ─────────
    if (embedding) {
      try {
        if (qstashToken) {
          const { compressAnalysisToBriefing } = await import('@/lib/editron/services/asset-briefing');
          const analysisDoc = await db.collection('asset_analyses').findOne({ assetId });
          const briefing = analysisDoc ? compressAnalysisToBriefing(analysisDoc as any) : null;

          const dedupedTags = [...new Set(tags)];
          const subjects = dedupedTags.filter(t =>
            !['wide', 'medium', 'close-up', 'extreme-close-up', 'high-energy', 'medium-energy', 'calm', 'analysis-failed'].includes(t)
          );
          const shotTag = dedupedTags.find(t => ['wide', 'medium', 'close-up', 'extreme-close-up'].includes(t));
          const energyTag = dedupedTags.find(t => ['high-energy', 'medium-energy', 'calm'].includes(t));
          const energyLevel = energyTag === 'high-energy' ? 'high' : energyTag === 'medium-energy' ? 'medium' : 'low';

          // Extract visual attributes from raw 5-Track keyframe data
          const keyframes = (analysisDoc as any)?.keyframeAnalyses ?? [];
          let colorTemp: 'warm' | 'neutral' | 'cold' | null = null;
          let lighting: string | null = null;
          let dominantColors: string[] = [];

          if (keyframes.length > 0) {
            // Color temperature: median Kelvin across keyframes → warm/neutral/cold
            const kelvins = keyframes.map((kf: any) => kf.colorTemperatureK).filter(Boolean) as number[];
            if (kelvins.length > 0) {
              kelvins.sort((a: number, b: number) => a - b);
              const medianK = kelvins[Math.floor(kelvins.length / 2)];
              colorTemp = medianK < 4000 ? 'warm' : medianK > 6500 ? 'cold' : 'neutral';
            }

            // Lighting: derive from brightness distribution
            const brightnesses = keyframes.map((kf: any) => kf.brightness ?? 0.5) as number[];
            const avgBrightness = brightnesses.reduce((s: number, b: number) => s + b, 0) / brightnesses.length;
            if (avgBrightness > 0.7) lighting = 'natural';
            else if (avgBrightness > 0.5) lighting = 'studio';
            else if (avgBrightness > 0.3) lighting = 'dramatic';
            else lighting = 'low-key';

            // Dominant colors: collect across keyframes, dedupe, take top 5
            const allColors: string[] = [];
            for (const kf of keyframes) {
              if (kf.dominantColors) allColors.push(...(kf.dominantColors as string[]));
            }
            const colorCounts: Record<string, number> = {};
            for (const c of allColors) colorCounts[c] = (colorCounts[c] || 0) + 1;
            dominantColors = Object.entries(colorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([c]) => c);
          }

          const graphRes = await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '3',
            },
            body: JSON.stringify({
              action: 'asset_enriched',
              data: {
                assetId,
                enrichment: {
                  briefing: briefing?.visualSummary ?? `${type} asset: ${filename}`,
                  embedding,
                  colorTemp,
                  composition: shotTag ?? null,
                  lighting,
                  dominantColors,
                  mood: briefing?.mood ?? null,
                  energyLevel,
                  subjects,
                  hasAudio: briefing?.audioContent ?? null,
                  qualityScore: briefing?.quality === 'high' ? 80 : briefing?.quality === 'medium' ? 60 : 40,
                  slopFlags: briefing?.slopFlags?.map((f: any) => f.description) ?? [],
                },
              },
            }),
          });
          await recordAssetAnalysisCostEvent(payload, {
            stage: 'graph_sync_qstash',
            status: graphRes.ok ? 'success' : 'failed',
            provider: 'upstash-qstash',
            operation: 'queue_message',
            units: { queueMessages: 1, requestCount: 1 },
            metadata: { httpStatus: graphRes.status },
          });
          console.log(`[AssetAnalysis] ${assetId}: dispatched graph enrichment`);
        }
      } catch (graphErr: any) {
        console.warn(`[AssetAnalysis] ${assetId}: graph enrichment dispatch failed: ${graphErr.message}`);
        await recordAssetAnalysisCostEvent(payload, {
          stage: 'graph_sync_qstash',
          status: 'failed',
          provider: 'upstash-qstash',
          operation: 'queue_message',
          units: { queueMessages: 1, requestCount: 1 },
          metadata: { errorClass: graphErr?.name || 'Error' },
        });
      }
    }

    return NextResponse.json({
      success: true,
      assetId,
      analysisInputMode,
      tags: updateDoc.tags,
      hasEmbedding: !!embedding,
      deepAnalysisQueued,
    });
  } catch (error: any) {
    console.error('[AssetAnalysis] Worker error:', error);

    // Try to mark as failed
    try {
      if (payload?.assetId && payload.userId) {
        const db = await getDatabase();
        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId: payload.assetId, userId: payload.userId },
          {
            $set: {
              analysisStatus: 'failed',
              analysisError: error.message,
              ...(payload.type === 'video' && {
                deepAnalysisStatus: 'failed',
                deepAnalysisError: error.message,
              }),
            },
          },
        );
      }
    } catch (err: unknown) { console.warn('[AssetAnalysis] best-effort failure mark failed:', err instanceof Error ? err.message : err); }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

interface FiveTrackProviderUsageForCost {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requestCount?: number;
  missingUsageCount?: number;
}

function readFiveTrackProviderUsage(analysis: any): FiveTrackProviderUsageForCost | null {
  const usage = analysis?.providerUsage;
  if (!usage || typeof usage !== 'object') return null;
  return {
    inputTokens: cleanProviderUsageNumber(usage.inputTokens),
    outputTokens: cleanProviderUsageNumber(usage.outputTokens),
    totalTokens: cleanProviderUsageNumber(usage.totalTokens),
    requestCount: cleanProviderUsageNumber(usage.requestCount),
    missingUsageCount: cleanProviderUsageNumber(usage.missingUsageCount),
  };
}

function buildFiveTrackProviderCostUnits(
  durationSeconds: number | undefined,
  usage: FiveTrackProviderUsageForCost | null,
): ProviderCostUnits {
  return {
    mediaSeconds: durationSeconds || undefined,
    requestCount: usage?.requestCount ?? 1,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
  };
}

function cleanProviderUsageNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function recordAssetAnalysisCostEvent(
  payload: AssetAnalysisPayload,
  event: {
    stage: string;
    status: ProviderCostEventStatus;
    provider: string;
    operation: string;
    model?: string;
    includeRevenue?: boolean;
    estimatedCostUsd?: number;
    costBasis?: ProviderCostBasis;
    units?: ProviderCostUnits;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordProviderCostEvent({
    idempotencyKey: `editron:asset-analysis:${payload.assetId}:${event.stage}:${event.status}`,
    status: event.status,
    userId: payload.userId,
    orgId: payload.orgId,
    assetId: payload.assetId,
    creditTransactionId: payload.creditTransactionId,
    service: 'editron',
    action: 'asset_analysis',
    route: '/api/internal/workers/asset-analysis',
    provider: event.provider,
    model: event.model,
    operation: event.operation,
    chargedCredits: event.includeRevenue ? payload.chargedCredits : undefined,
    estimatedCostUsd: event.estimatedCostUsd,
    costBasis: event.costBasis,
    units: event.units,
    metadata: {
      stage: event.stage,
      assetType: payload.type,
      ...event.metadata,
    },
  });
}

// Helper: find most frequent string in array
function mostFrequent(arr: string[]): string | null {
  if (!arr.length) return null;
  const counts: Record<string, number> = {};
  for (const s of arr) counts[s] = (counts[s] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export const POST = withInternalQStashWorkerAuth(handler, 'asset-analysis');
