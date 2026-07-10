import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  buildMediaUploadBatchSummary,
  normalizeUploadBatchId,
  type MediaUploadBatchAssetStatus,
  type MediaUploadBatchAssetStatusInput,
  type MediaUploadBatchIntake,
} from '@/lib/editron/services/media-upload-batch';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { orderStorylineWithLLM, type OrderStorylineResult } from '@/lib/editron/storyline/order-storyline-service';
import { buildAssetContextMap, scenesFromAssetAnalyses } from '@/lib/editron/storyline/multi-asset-compose';
import { intakeSignalsFromProject } from '@/lib/editron/production-brief/intake-adapter';
import { resolveProductionBrief } from '@/lib/editron/production-brief/intake-resolver';
import type { AspectRatio, Platform, ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { readProjectAssetAnalyses } from '@/lib/editron/storyline/asset-analysis-reader';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import { hydrateStorylineAnalysesForBatch } from '@/lib/editron/services/batch-storyline-analysis-bridge';
import { embedScenes, makeEmbeddingScorer } from '@/lib/editron/storyline/scene-embedding';
import { synthesizeImageScenes, type ImageAssetInput, type ImageFacts } from '@/lib/editron/storyline/image-scene';
import { generateEditronEmbedding } from '@/lib/editron/services/gemini-embedding';

export const runtime = 'nodejs';
export const maxDuration = 300;

const FPS = 30;
const DEFAULT_IMAGE_HOLD_SEC = 4;

type BatchDocument = {
  uploadBatchId: string;
  userId: string;
  orgId?: string | null;
  projectId?: string;
  assetIds?: string[];
  productionBriefIntake?: MediaUploadBatchIntake;
};

type BatchMediaAsset = {
  assetId: string;
  userId: string;
  orgId?: string | null;
  filename: string;
  type: 'video' | 'image' | 'audio';
  size?: number;
  duration?: number | string | null;
  dimensions?: { width: number; height: number };
  thumbnail?: string;
  cachedUrl?: string | null;
  gcsPath?: string | null;
  publicUrl?: string | null;
  thumbnailUrl?: string | null;
  dominantColors?: string[] | null;
  tags?: string[] | null;
  transcription?: { language?: string | null } | null;
  uploadedAt?: Date | string | null;
  analysisStatus?: string | null;
  analysisError?: string | null;
  analysisSkipReason?: string | null;
  analysisQueuedAt?: Date | string | null;
  analysisStartedAt?: Date | string | null;
  analysisCompletedAt?: Date | string | null;
};

type FromBatchRequest = MediaUploadBatchIntake & {
  uploadBatchId: string;
  title?: string;
  brandId?: string;
  targetDurationSec?: number | string | null;
};

type MaterializedTimeline = {
  overlays: Array<Record<string, unknown>>;
  durationInFrames: number;
  source: 'storyline' | 'chronological-fallback';
  clipCount: number;
};

function cleanString(value: unknown, limit = 4000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function positiveDurationSec(asset: Pick<BatchMediaAsset, 'duration'>): number | undefined {
  return positiveNumber(asset.duration);
}

function normalizeAspectRatio(value: unknown): AspectRatio | undefined {
  const v = cleanString(value, 16);
  return v === '16:9' || v === '9:16' || v === '1:1' || v === '4:5' ? v : undefined;
}

function normalizePlatform(value: unknown): Platform | undefined {
  const v = cleanString(value, 64)?.toLowerCase().replace(/_/g, '-');
  if (!v) return undefined;
  if (v === 'instagram' || v === 'reels' || v === 'instagram-reel') return 'instagram-reels';
  if (v === 'shorts' || v === 'youtube-short') return 'youtube-shorts';
  if (v === 'feed' || v === 'instagram-post') return 'instagram-feed';
  if (v === 'twitter') return 'x';
  const allowed: Platform[] = ['tiktok', 'instagram-reels', 'youtube-shorts', 'instagram-feed', 'youtube', 'linkedin', 'x', 'unspecified'];
  return allowed.includes(v as Platform) ? v as Platform : undefined;
}

function normalizeDirectorEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const v = cleanString(value, 128);
  return v && allowed.includes(v as T) ? v as T : undefined;
}

function buildDirectorBrief(intake: MediaUploadBatchIntake): ProjectBrief {
  const captionStyle = normalizeDirectorEnum<ProjectBrief['captionStyle'] & string>(intake.captionStyle, ['word_by_word', 'sentence', 'key_phrases', 'none']);
  const transitionPreference = normalizeDirectorEnum<ProjectBrief['transitionPreference'] & string>(intake.transitionPreference, ['minimal', 'subtle', 'dynamic', 'energetic']);
  const zoomBehavior = normalizeDirectorEnum<ProjectBrief['zoomBehavior'] & string>(intake.zoomBehavior, ['none', 'subtle', 'moderate', 'aggressive']);
  const motionGraphics = normalizeDirectorEnum<ProjectBrief['motionGraphics'] & string>(intake.motionGraphics, ['none', 'stats_only', 'full']);
  const pacingFeel = normalizeDirectorEnum<ProjectBrief['pacingFeel'] & string>(intake.pacingFeel, ['calm', 'balanced', 'energetic', 'fast']);
  const musicPreference = normalizeDirectorEnum<ProjectBrief['musicPreference'] & string>(intake.musicPreference, ['none', 'subtle_bed', 'energetic', 'match_video']);

  return {
    modifiers: [],
    ...(cleanString(intake.platform, 64) && { platform: cleanString(intake.platform, 64) }),
    ...(cleanString(intake.userIntent) && { intent: cleanString(intake.userIntent) }),
    ...(captionStyle && { captionStyle }),
    ...(transitionPreference && { transitionPreference }),
    ...(zoomBehavior && { zoomBehavior }),
    ...(motionGraphics && { motionGraphics }),
    ...(pacingFeel && { pacingFeel }),
    ...(musicPreference && { musicPreference }),
  };
}

function mergeIntake(batchIntake: MediaUploadBatchIntake | undefined, body: FromBatchRequest): MediaUploadBatchIntake {
  return {
    ...(batchIntake ?? {}),
    ...(cleanString(body.aspectRatio, 64) && { aspectRatio: cleanString(body.aspectRatio, 64) }),
    ...(cleanString(body.platform, 64) && { platform: cleanString(body.platform, 64) }),
    ...(cleanString(body.userIntent) && { userIntent: cleanString(body.userIntent) }),
    ...(cleanString(body.script, 12000) && { script: cleanString(body.script, 12000) }),
    ...(cleanString(body.captionStyle, 128) && { captionStyle: cleanString(body.captionStyle, 128) }),
    ...(cleanString(body.transitionPreference, 128) && { transitionPreference: cleanString(body.transitionPreference, 128) }),
    ...(cleanString(body.zoomBehavior, 128) && { zoomBehavior: cleanString(body.zoomBehavior, 128) }),
    ...(cleanString(body.motionGraphics, 128) && { motionGraphics: cleanString(body.motionGraphics, 128) }),
    ...(cleanString(body.pacingFeel, 128) && { pacingFeel: cleanString(body.pacingFeel, 128) }),
    ...(cleanString(body.musicPreference, 512) && { musicPreference: cleanString(body.musicPreference, 512) }),
  };
}

function buildBrief(
  analyses: Awaited<ReturnType<typeof readProjectAssetAnalyses>>,
  assets: readonly BatchMediaAsset[],
  intake: MediaUploadBatchIntake,
  body: FromBatchRequest,
): ProductionBrief {
  const requested: NonNullable<Parameters<typeof intakeSignalsFromProject>[2]>['requested'] = {};
  const platform = normalizePlatform(intake.platform);
  const aspectRatio = normalizeAspectRatio(intake.aspectRatio);
  const targetDurationSec = positiveNumber(body.targetDurationSec);
  const intent = cleanString(intake.userIntent);

  if (platform) requested.platform = platform;
  if (aspectRatio) requested.aspectRatio = aspectRatio;
  if (targetDurationSec) requested.targetDurationSec = targetDurationSec;
  if (intent) requested.intent = intent;

  const prompt = [intake.userIntent, intake.script && `Script/outline: ${intake.script}`]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');

  return resolveProductionBrief(intakeSignalsFromProject(
    analyses,
    assets.map((asset) => ({ assetId: asset.assetId, durationSec: positiveDurationSec(asset) })),
    {
      hasBrand: Boolean(cleanString(body.brandId, 128)),
      prompt: prompt || null,
      requested,
    },
  ));
}

function dimensionsForAspect(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
}

async function completeStorylinePrompt(prompt: string): Promise<string> {
  const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getGeneralModel();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      seed: 42,
      responseMimeType: 'application/json',
    },
  });
  return result.response.text();
}

async function resolveOverlayUrl(asset: BatchMediaAsset, userId: string): Promise<string> {
  try {
    const { isR2Available, getR2PublicUrl } = await import('@/lib/editron/services/r2-service');
    if (isR2Available()) return getR2PublicUrl(asset.assetId);
  } catch (error) {
    console.warn('[auto-edit/from-batch] R2 public URL failed:', error instanceof Error ? error.message : error);
  }

  const resolved = await assetResolver.resolveAssetUrl(asset.assetId, userId).catch(() => null);
  return resolved || asset.publicUrl || asset.cachedUrl || '';
}

function parseJsonObject(text: string): Record<string, any> | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function cleanStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

function clamp01Number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function firstDominantColor(asset?: BatchMediaAsset, parsed?: Record<string, any>): ImageFacts['dominantColor'] {
  const direct = parsed?.dominantColor;
  if (direct && typeof direct === 'object') {
    const hex = cleanString((direct as { hex?: unknown }).hex, 32);
    const name = cleanString((direct as { name?: unknown }).name, 64) ?? hex;
    if (hex && name) return { hex, name };
  }
  const color = cleanStringArray(parsed?.dominantColors ?? parsed?.colors, 1)[0]
    ?? asset?.dominantColors?.find((item) => typeof item === 'string' && item.trim().length > 0);
  return color ? { hex: color, name: color } : null;
}

function imageMimeType(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

function assetCreatedAtMs(asset: BatchMediaAsset): number | undefined {
  if (asset.uploadedAt instanceof Date) return asset.uploadedAt.getTime();
  if (asset.uploadedAt) {
    const ms = new Date(asset.uploadedAt).getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

function sourceLanguageFromAssets(assets: readonly BatchMediaAsset[]): string | null {
  for (const asset of assets) {
    const language = asset.transcription?.language;
    if (typeof language === 'string' && language.trim()) return language.trim();
  }
  return null;
}

function storylineIntentText(intake: MediaUploadBatchIntake, body: FromBatchRequest): string | null {
  return cleanString(intake.userIntent, 2000)
    ?? cleanString(body.title, 500)
    ?? cleanString(intake.script, 4000)
    ?? null;
}

async function embedStorylineDocument(text: string): Promise<number[]> {
  return await generateEditronEmbedding(text, { taskType: 'RETRIEVAL_DOCUMENT' }) ?? [];
}

async function embedStorylineIntent(text: string | null): Promise<number[] | null> {
  if (!text) return null;
  return await generateEditronEmbedding(text, { taskType: 'RETRIEVAL_QUERY', title: 'Edit intent' });
}

function imageSceneInputs(assets: readonly BatchMediaAsset[]): ImageAssetInput[] {
  return assets
    .filter((asset) => asset.type === 'image')
    .map((asset) => ({
      assetId: asset.assetId,
      source: asset.assetId,
      createdAt: assetCreatedAtMs(asset),
    }));
}

async function analyzeImageFacts(assetInput: ImageAssetInput, assetsById: ReadonlyMap<string, BatchMediaAsset>, userId: string): Promise<ImageFacts> {
  const asset = assetsById.get(assetInput.assetId);
  if (!asset) throw new Error(`Image asset not found: ${assetInput.assetId}`);
  const source = await resolveOverlayUrl(asset, userId);
  if (!/^https?:\/\//i.test(source)) throw new Error(`Image asset has no public URL: ${asset.assetId}`);

  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent([
    { fileData: { fileUri: source, mimeType: imageMimeType(source) } },
    { text: `Analyze this still image for a video editor. Return JSON only: {"visualMode":"photo|product-shot|screenshot|text-card|chart|document|other","detectedText":["ocr text"],"description":"one concise visual description","dominantColor":{"hex":"#RRGGBB","name":"color name"},"salience":0.0,"importance":0.0}. Do not invent text that is not visible.` },
  ]);
  const parsed = parseJsonObject(result.response.text()) ?? {};
  const detectedText = cleanStringArray(parsed.detectedText ?? parsed.ocrText ?? parsed.text);
  const tags = asset.tags?.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) ?? [];
  return {
    visualMode: cleanString(parsed.visualMode, 64) ?? cleanString(parsed.shotType, 64) ?? tags[0] ?? null,
    detectedText,
    description: cleanString(parsed.description, 500) ?? cleanString(parsed.summary, 500) ?? (tags.length > 0 ? tags.slice(0, 5).join(', ') : null),
    dominantColor: firstDominantColor(asset, parsed),
    salience: clamp01Number(parsed.salience ?? parsed.energy ?? parsed.importance) ?? null,
    importance: clamp01Number(parsed.importance ?? parsed.salience) ?? null,
  };
}
function buildStatusInput(asset: BatchMediaAsset): MediaUploadBatchAssetStatusInput {
  return {
    assetId: asset.assetId,
    filename: asset.filename,
    type: asset.type,
    size: asset.size ?? 0,
    duration: positiveDurationSec(asset),
    dimensions: asset.dimensions,
    thumbnail: asset.thumbnail,
    uploadedAt: asset.uploadedAt,
    analysisStatus: asset.analysisStatus,
    analysisError: asset.analysisError,
    analysisSkipReason: asset.analysisSkipReason,
    analysisQueuedAt: asset.analysisQueuedAt,
    analysisStartedAt: asset.analysisStartedAt,
    analysisCompletedAt: asset.analysisCompletedAt,
  };
}

function isUsableVisualAsset(asset: BatchMediaAsset, readiness?: MediaUploadBatchAssetStatus): boolean {
  if (asset.type !== 'video' && asset.type !== 'image') return false;
  if (readiness?.readiness === 'failed') return false;
  return true;
}

function findAssetForStorylineClip(
  clip: OrderStorylineResult['storyline']['clips'][number],
  assets: readonly BatchMediaAsset[],
): BatchMediaAsset | undefined {
  return assets.find((asset) => (
    asset.assetId === clip.source ||
    asset.cachedUrl === clip.source ||
    asset.gcsPath === clip.source ||
    asset.publicUrl === clip.source
  ));
}

async function materializeStoryline(
  result: OrderStorylineResult,
  assets: readonly BatchMediaAsset[],
  userId: string,
  uploadBatchId: string,
  dims: { width: number; height: number },
): Promise<MaterializedTimeline | null> {
  const clips = [...result.storyline.clips].sort((a, b) => a.order - b.order);
  if (clips.length === 0) return null;

  const overlays: Array<Record<string, unknown>> = [];
  let cursor = 0;
  let overlayId = Date.now();

  for (const clip of clips) {
    const asset = findAssetForStorylineClip(clip, assets);
    if (!asset || (asset.type !== 'video' && asset.type !== 'image')) continue;

    const durationFrames = Math.max(1, Math.round(clip.durationSec * FPS));
    const sourceStartFrame = Math.max(0, Math.round(clip.in * FPS));
    const src = await resolveOverlayUrl(asset, userId);
    overlays.push({
      id: overlayId++,
      type: asset.type,
      from: cursor,
      durationInFrames: durationFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: dims.width,
      height: dims.height,
      isDragging: false,
      rotation: 0,
      content: asset.type === 'image' ? src : (asset.thumbnail || ''),
      src,
      assetId: asset.assetId,
      styles: { opacity: 1, objectFit: clip.fit === 'contain' || clip.fit === 'pad' ? 'contain' : 'cover' },
      storyline: {
        uploadBatchId,
        source: 'storyline',
        planApplied: result.planApplied,
        fallbackReason: result.fallbackReason,
        sourceRef: clip.sourceRef,
        order: clip.order,
        role: clip.role,
        fit: clip.fit,
        inSec: clip.in,
        outSec: clip.out,
      },
      ...(asset.type === 'video' ? { videoStartTime: sourceStartFrame, sourceStartFrame } : {}),
    });
    cursor += durationFrames;
  }

  if (overlays.length === 0) return null;
  return { overlays, durationInFrames: cursor, source: 'storyline', clipCount: overlays.length };
}

async function materializeChronologicalFallback(
  assets: readonly BatchMediaAsset[],
  userId: string,
  uploadBatchId: string,
  dims: { width: number; height: number },
): Promise<MaterializedTimeline> {
  const visualAssets = [...assets]
    .filter((asset) => asset.type === 'video' || asset.type === 'image')
    .sort((a, b) => new Date(a.uploadedAt ?? 0).getTime() - new Date(b.uploadedAt ?? 0).getTime());

  const overlays: Array<Record<string, unknown>> = [];
  let cursor = 0;
  let overlayId = Date.now();

  for (const [index, asset] of visualAssets.entries()) {
    const durationSec = asset.type === 'video'
      ? (positiveDurationSec(asset) ?? DEFAULT_IMAGE_HOLD_SEC)
      : DEFAULT_IMAGE_HOLD_SEC;
    const durationFrames = Math.max(1, Math.round(durationSec * FPS));
    const src = await resolveOverlayUrl(asset, userId);
    const base = {
      id: overlayId++,
      type: asset.type,
      from: cursor,
      durationInFrames: durationFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: dims.width,
      height: dims.height,
      isDragging: false,
      rotation: 0,
      content: asset.type === 'image' ? src : (asset.thumbnail || ''),
      src,
      assetId: asset.assetId,
      styles: { opacity: 1, objectFit: 'cover' },
      storyline: {
        uploadBatchId,
        source: 'chronological-fallback',
        order: index,
        role: index === 0 ? 'hook' : index === visualAssets.length - 1 ? 'outro' : 'body',
      },
    };

    overlays.push(asset.type === 'video'
      ? { ...base, videoStartTime: 0, sourceStartFrame: 0 }
      : { ...base, styles: { objectFit: 'cover', animation: { enter: 'fadeIn', exit: 'fadeOut' } } });
    cursor += durationFrames;
  }

  return { overlays, durationInFrames: cursor, source: 'chronological-fallback', clipCount: overlays.length };
}

function getBillableAutoEditMinutes(assets: readonly BatchMediaAsset[]): number {
  const seconds = assets.reduce((sum, asset) => sum + (positiveDurationSec(asset) ?? 0), 0);
  return Math.max(1, Math.ceil(Math.max(seconds, DEFAULT_IMAGE_HOLD_SEC) / 60 * 100) / 100);
}

async function dispatchDirector(params: {
  baseUrl: string;
  projectId: string;
  userId: string;
  orgId?: string;
  title: string;
  intake: MediaUploadBatchIntake;
}): Promise<{ queued: boolean; messageId?: string }> {
  const qstashToken = process.env.QSTASH_TOKEN;
  const workerUrl = `${params.baseUrl}/api/internal/workers/director`;
  const payload = {
    projectId: params.projectId,
    userId: params.userId,
    orgId: params.orgId || undefined,
    profileId: 'A-01',
    title: params.title,
    platform: params.intake.platform,
    userIntent: params.intake.userIntent,
    captionStyle: params.intake.captionStyle,
    transitionPreference: params.intake.transitionPreference,
    zoomBehavior: params.intake.zoomBehavior,
    motionGraphics: params.intake.motionGraphics,
    pacingFeel: params.intake.pacingFeel,
    musicPreference: params.intake.musicPreference,
  };

  if (!qstashToken) {
    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    await executeDirectorPlan(params.projectId, params.userId, 'A-01', buildDirectorBrief(params.intake));
    return { queued: false };
  }

  const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${workerUrl}`;
  const res = await fetch(qstashUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '0',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'no body');
    throw new Error(`QStash dispatch failed: HTTP ${res.status} - ${body}`);
  }

  const json = await res.json().catch(() => ({}));
  return { queued: true, messageId: typeof json.messageId === 'string' ? json.messageId : undefined };
}

export async function POST(request: NextRequest) {
  let creditCheck: CreditCheckResult | null = null;
  let queuedOrRanDirector = false;

  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: FromBatchRequest = await request.json();
    const uploadBatchId = normalizeUploadBatchId(body.uploadBatchId ?? '');
    const brandId = cleanString(body.brandId, 128);

    const db = await getDatabase();
    const batch = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({ uploadBatchId, userId }) as BatchDocument | null;
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Upload batch not found' }, { status: 404 });
    }
    if (batch.projectId) {
      return NextResponse.json({ success: true, projectId: batch.projectId, status: 'existing' });
    }

    const assetIds = Array.isArray(batch.assetIds) ? batch.assetIds.filter(Boolean) : [];
    const assetFilter = assetIds.length > 0
      ? { userId, $or: [{ uploadBatchId }, { assetId: { $in: assetIds } }] }
      : { userId, uploadBatchId };
    const mediaAssets = await db.collection(COLLECTIONS.MEDIA_ASSETS)
      .find(assetFilter, {
        projection: {
          _id: 0,
          assetId: 1,
          userId: 1,
          orgId: 1,
          filename: 1,
          type: 1,
          size: 1,
          duration: 1,
          dimensions: 1,
          thumbnail: 1,
          cachedUrl: 1,
          gcsPath: 1,
          publicUrl: 1,
          thumbnailUrl: 1,
          dominantColors: 1,
          tags: 1,
          transcription: 1,
          uploadedAt: 1,
          analysisStatus: 1,
          analysisError: 1,
          analysisSkipReason: 1,
          analysisQueuedAt: 1,
          analysisStartedAt: 1,
          analysisCompletedAt: 1,
        },
      })
      .sort({ uploadedAt: 1 })
      .toArray() as unknown as BatchMediaAsset[];

    const summary = buildMediaUploadBatchSummary(mediaAssets.map(buildStatusInput));
    const readinessByAsset = new Map(summary.assets.map((asset) => [asset.assetId, asset]));
    const inProgress = summary.counts.uploaded + summary.counts.queued + summary.counts.analyzing;
    if (inProgress > 0) {
      return NextResponse.json({
        success: false,
        error: 'Upload batch is still analyzing. Try again when analysis completes.',
        batch: summary,
      }, { status: 409 });
    }

    const visualAssets = mediaAssets.filter((asset) => isUsableVisualAsset(asset, readinessByAsset.get(asset.assetId)));
    if (visualAssets.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Upload batch has no usable video or image assets.',
        batch: summary,
      }, { status: 400 });
    }

    const creditOptions = {
      durationMinutes: getBillableAutoEditMinutes(visualAssets),
      requestType: visualAssets.length > 1 ? 'reference_guided' as const : 'standard' as const,
    };
    creditCheck = await checkCredits(userId, 'editron', 'auto_edit_analysis', creditOptions);
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse!;
    }
    await creditCheck.deduct();

    const intake = mergeIntake(batch.productionBriefIntake, body);
    const projectName = cleanString(body.title, 160)
      || cleanString(intake.userIntent, 80)
      || `Auto-Edit Batch: ${uploadBatchId}`;
    const project = await projectService.createProject(userId, projectName, { brandId, orgId: orgId ?? batch.orgId ?? null });
    const projectId = project.projectId;

    const analysisBridge = await hydrateStorylineAnalysesForBatch(db as any, {
      projectId,
      userId,
      assets: visualAssets,
    });
    const analyses = await readProjectAssetAnalyses(db as any, projectId);
    const brief = buildBrief(analyses, visualAssets, intake, body);
    const dims = dimensionsForAspect(brief.output.aspectRatio ?? '16:9');
    const assetContexts = buildAssetContextMap(visualAssets.map((asset) => ({
      assetId: asset.assetId,
      cachedUrl: asset.cachedUrl,
      gcsPath: asset.gcsPath,
      thumbnailUrl: asset.thumbnailUrl ?? asset.thumbnail,
      createdAt: asset.uploadedAt instanceof Date ? asset.uploadedAt : asset.uploadedAt ? new Date(asset.uploadedAt) : undefined,
      dominantColors: asset.dominantColors,
    })));

    const videoScenes = scenesFromAssetAnalyses(analyses, { assetContexts });
    const imageAssetsById = new Map(visualAssets.filter((asset) => asset.type === 'image').map((asset) => [asset.assetId, asset]));
    const imageScenes = await synthesizeImageScenes(
      imageSceneInputs(visualAssets),
      (image) => analyzeImageFacts(image, imageAssetsById, userId),
    );
    const scenes = [...videoScenes, ...imageScenes];
    const embeddedScenes = await embedScenes(scenes, embedStorylineDocument);
    const intentEmbedding = await embedStorylineIntent(storylineIntentText(intake, body));
    const ordering = await orderStorylineWithLLM(embeddedScenes, brief, completeStorylinePrompt, {
      ctx: {
        platform: brief.output.platform,
        targetDurationSec: brief.output.targetDurationSec,
        language: sourceLanguageFromAssets(visualAssets),
      },
      compose: { scorer: makeEmbeddingScorer(intentEmbedding) },
    });
    const storylineTimeline = await materializeStoryline(ordering, visualAssets, userId, uploadBatchId, dims);
    const timeline = storylineTimeline ?? await materializeChronologicalFallback(visualAssets, userId, uploadBatchId, dims);

    if (timeline.overlays.length === 0) {
      return NextResponse.json({ success: false, error: 'No usable clips could be materialized from this batch.' }, { status: 400 });
    }

    await projectService.saveProject(userId, projectId, {
      overlays: timeline.overlays as any,
      aspectRatio: brief.output.aspectRatio ?? '16:9',
      playerDimensions: dims,
      fps: FPS,
      durationInFrames: timeline.durationInFrames,
    });

    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId },
      {
        $set: {
          autoEditMode: 'batch',
          autoEditStatus: 'directing_queued',
          sourceUploadBatchId: uploadBatchId,
          sourceAssetIds: visualAssets.map((asset) => asset.assetId),
          productionBrief: brief,
          storylinePlan: {
            source: timeline.source,
            planApplied: ordering.planApplied,
            fallbackReason: ordering.fallbackReason ?? (storylineTimeline ? undefined : 'no_materialized_storyline_clips'),
            rationale: ordering.rationale,
            clipCount: timeline.clipCount,
            composerClipCount: ordering.storyline.clips.length,
            analysisBridge,
          },
          updatedAt: new Date(),
        },
      },
    );

    await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
      { uploadBatchId, userId },
      { $set: { projectId, updatedAt: new Date() } },
    );

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const dispatch = await dispatchDirector({
      baseUrl,
      projectId,
      userId,
      orgId: orgId || batch.orgId || undefined,
      title: projectName,
      intake,
    });
    queuedOrRanDirector = true;

    return NextResponse.json({
      success: true,
      projectId,
      status: dispatch.queued ? 'processing' : 'complete',
      storylinePlan: {
        source: timeline.source,
        planApplied: ordering.planApplied,
        fallbackReason: ordering.fallbackReason ?? (storylineTimeline ? undefined : 'no_materialized_storyline_clips'),
        rationale: ordering.rationale,
        clipCount: timeline.clipCount,
        analysisBridge,
      },
      messageId: dispatch.messageId,
    });
  } catch (error) {
    if (creditCheck && !queuedOrRanDirector) {
      await creditCheck.refund('Multi-upload auto-edit failed before Director dispatch').catch((refundError) => {
        console.error('[auto-edit/from-batch] credit refund failed:', refundError);
      });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[auto-edit/from-batch] failed:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
