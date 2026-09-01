import { NextRequest, NextResponse } from 'next/server';
import { SchemaType, type GenerationConfig } from '@google/generative-ai';
import { auth } from '@clerk/nextjs/server';
import { Receiver } from '@upstash/qstash';
import { projectService } from '@/lib/editron/services/project-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  buildMediaUploadBatchSummary,
  DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
  normalizeUploadBatchId,
  type MediaUploadAnalysisRequirements,
  type MediaUploadBatchAssetStatus,
  type MediaUploadBatchAssetStatusInput,
  type MediaUploadBatchIntake,
} from '@/lib/editron/services/media-upload-batch';
import { ASSET_DEEP_ANALYSIS_VERSION } from '@/lib/editron/services/asset-deep-analysis';
import { queueSemanticVisualRetries } from '@/lib/editron/services/semantic-visual-retry';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { orderStorylineWithLLM, type OrderStorylineResult } from '@/lib/editron/storyline/order-storyline-service';
import { buildAssetContextMap, scenesFromAssetAnalyses } from '@/lib/editron/storyline/multi-asset-compose';
import { intakeSignalsFromProject } from '@/lib/editron/production-brief/intake-adapter';
import { resolveProductionBrief } from '@/lib/editron/production-brief/intake-resolver';
import { brandDefaultsFromProfile } from '@/lib/editron/production-brief/brand-adapter';
import type { AspectRatio, Platform, ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  completeStorylineJsonPrompt,
  type StorylineResponseSchema,
} from '@/lib/editron/storyline/storyline-llm';
import { readProjectAssetAnalyses } from '@/lib/editron/storyline/asset-analysis-reader';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';
import { resolveBillingOwner, resolveCreationVisibility } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import { hydrateStorylineAnalysesForBatch } from '@/lib/editron/services/batch-storyline-analysis-bridge';
import { buildMultiAssetDirectorContext } from '@/lib/editron/services/multi-asset-director-context';
import { embedScenes, makeEmbeddingScorer } from '@/lib/editron/storyline/scene-embedding';
import { synthesizeImageScenes, type ImageAssetInput, type ImageFacts } from '@/lib/editron/storyline/image-scene';
import { generateEditronEmbedding } from '@/lib/editron/services/gemini-embedding';
import { narrativeSourceFromTimeline, type NarrativeSignalSource } from '@/lib/editron/storyline/signal-enricher';
import { buildSignalTimeline, buildSignalTimelineFromAnalysis, type RawFootageAnalysis } from '@/lib/editron/services/signal-registry';
import type { SegmentAnalysis } from '@/lib/editron/types/segment-analysis';
import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import { normalizeEditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import type { CoverageVerify } from '@/lib/editron/storyline/coverage';
import type { Scene } from '@/lib/editron/storyline/scene';
import type { ScriptBeatFailureKind } from '@/lib/editron/storyline/script-beat-planner';
import {
  DEFAULT_IMAGE_HOLD_SEC,
  FPS,
  materializeChronologicalFallback,
  positiveDurationSec,
  resolveOverlayUrl,
  type MaterializedTimeline,
} from '@/lib/editron/services/timeline-materializer';
import {
  ASSIST_STATUS_READY,
  buildAssistHydration,
  isAssistIntakeEnabled,
  isAssistProject,
  parseEditMode,
  partitionAssistAssets,
  registerAssistScanCharge,
  settleAssistScanFailure,
} from '@/lib/editron/services/assist-lane';
import { readStoredNativeVideoAudioRights } from '@/lib/editron/services/native-video-audio-rights';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import {
  isInternalQStashDispatchConfigured,
  isInternalWorkerInlineFallbackAllowed,
} from '@/lib/editron/security/internal-worker-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
const BATCH_ANALYSIS_REQUIREMENTS: MediaUploadAnalysisRequirements = {
  semanticVisual: {
    version: ASSET_DEEP_ANALYSIS_VERSION,
    maxRetries: DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT,
  },
};

type BatchDocument = {
  uploadBatchId: string;
  userId: string;
  orgId?: string | null;
  projectId?: string;
  orchestrationStatus?: 'initializing' | 'requested' | 'waiting_analysis' | 'composing' | 'retryable_error' | 'needs_input' | 'director_queued' | 'assist_ready' | 'failed';
  orchestrationRequestedAt?: Date | string;
  orchestrationLeaseUntil?: Date | string;
  orchestrationLastDispatchedAt?: Date | string;
  orchestrationRecoveryLeaseUntil?: Date | string;
  orchestrationMessageId?: string;
  orchestrationAttempt?: number;
  assetIds?: string[];
  productionBriefIntake?: MediaUploadBatchIntake & Record<string, unknown>;
  autoEditRequest?: { title?: string; brandId?: string | null; targetDurationSec?: number | string | null };
  scriptCoverage?: Record<string, unknown> | null;
};

type BatchMediaAsset = {
  assetId: string;
  userId: string;
  orgId?: string | null;
  filename: string;
  type: 'video' | 'image' | 'audio';
  source?: string | null;
  audioRights?: AudioRightsContract | null;
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
  deepAnalysisStatus?: string | null;
  deepAnalysisVersion?: number | null;
  deepAnalysisTargetVersion?: number | null;
  deepAnalysisRetryVersion?: number | null;
  deepAnalysisRetryCount?: number | null;
  deepAnalysisDiagnostics?: {
    semanticVisualWindowCount?: number | null;
    providers?: { semanticVisual?: string | null } | null;
  } | null;
  batchTranscriptionStatus?: string | null;
  batchTranscriptionError?: string | null;
  batchTranscriptionStartedAt?: Date | string | null;
  batchTranscriptionCompletedAt?: Date | string | null;
};

type FromBatchRequest = MediaUploadBatchIntake & {
  uploadBatchId: string;
  title?: string;
  brandId?: string;
  targetDurationSec?: number | string | null;
  resumeCoverage?: boolean;
  _orchestration?: {
    userId?: string;
    orgId?: string | null;
    pollAttempt?: number;
    failureCount?: number;
  };
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

const MULTI_OUTPUT_FIELDS = ['deliverableSpecs', 'requestedOutputs', 'outputs', 'deliverables'] as const;

function hasMultiOutputRequest(source: unknown): boolean {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  const record = source as Record<string, unknown>;
  return MULTI_OUTPUT_FIELDS.some((field) => {
    const value = record[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
  });
}

type BatchCaller = {
  userId: string;
  orgId?: string | null;
  internal: boolean;
  pollAttempt: number;
  failureCount: number;
};

class ScriptGroundingError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly coverageAudit: Record<string, unknown> | null,
    readonly failureKind: ScriptBeatFailureKind,
  ) {
    super(message);
    this.name = 'ScriptGroundingError';
  }
}

const DEFAULT_ORCHESTRATION_DELAY_SECONDS = 10;
const DEFAULT_ORCHESTRATION_DEADLINE_MS = 30 * 60 * 1000;
const DEFAULT_ORCHESTRATION_FAILURE_LIMIT = 3;
const DEFAULT_ORCHESTRATION_RECOVERY_STALE_MS = 60 * 1000;

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function orchestrationDelaySeconds(): number {
  return boundedEnvInt('EDITRON_BATCH_ORCHESTRATION_DELAY_SECONDS', DEFAULT_ORCHESTRATION_DELAY_SECONDS, 5, 60);
}

function orchestrationDeadlineMs(): number {
  return boundedEnvInt('EDITRON_BATCH_ORCHESTRATION_DEADLINE_MS', DEFAULT_ORCHESTRATION_DEADLINE_MS, 5 * 60 * 1000, 2 * 60 * 60 * 1000);
}

function orchestrationFailureLimit(): number {
  return boundedEnvInt('EDITRON_BATCH_ORCHESTRATION_FAILURE_LIMIT', DEFAULT_ORCHESTRATION_FAILURE_LIMIT, 1, 8);
}
function orchestrationRecoveryStaleMs(): number {
  return boundedEnvInt('EDITRON_BATCH_ORCHESTRATION_RECOVERY_STALE_MS', DEFAULT_ORCHESTRATION_RECOVERY_STALE_MS, 30 * 1000, 15 * 60 * 1000);
}


function orchestrationRequestBody(body: FromBatchRequest, caller: BatchCaller): FromBatchRequest {
  return {
    uploadBatchId: body.uploadBatchId,
    title: body.title,
    brandId: body.brandId,
    targetDurationSec: body.targetDurationSec,
    _orchestration: {
      userId: caller.userId,
      orgId: caller.orgId,
      pollAttempt: caller.pollAttempt,
      failureCount: caller.failureCount,
    },
  };
}

async function resolveBatchCaller(request: NextRequest, rawBody: string, body: FromBatchRequest): Promise<BatchCaller> {
  const signature = request.headers.get('upstash-signature');
  if (signature) {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) throw new Error('QStash signing keys are required for batch orchestration');
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    await receiver.verify({ signature, body: rawBody });
    const userId = cleanString(body._orchestration?.userId, 128);
    if (!userId) throw new Error('Signed batch orchestration payload is missing userId');
    return {
      userId,
      orgId: cleanString(body._orchestration?.orgId, 128) ?? null,
      internal: true,
      pollAttempt: Math.max(0, Math.round(Number(body._orchestration?.pollAttempt) || 0)),
      failureCount: Math.max(0, Math.round(Number(body._orchestration?.failureCount) || 0)),
    };
  }

  const identity = await auth();
  if (!identity.userId) throw new Error('Unauthorized');
  return { userId: identity.userId, orgId: identity.orgId, internal: false, pollAttempt: 0, failureCount: 0 };
}

async function dispatchBatchOrchestration(params: {
  baseUrl: string;
  body: FromBatchRequest;
  caller: BatchCaller;
  delaySeconds?: number;
}): Promise<string | undefined> {
  if (!isInternalQStashDispatchConfigured()) {
    throw new Error('QStash publisher token and signing keys are required for durable batch orchestration');
  }
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable batch orchestration');
  const target = `${params.baseUrl}/api/services/editron/auto-edit/from-batch`;
  const response = await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${target}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '2',
      'Upstash-Timeout': '300s',
      ...(params.delaySeconds ? { 'Upstash-Delay': `${params.delaySeconds}s` } : {}),
    },
    body: JSON.stringify(orchestrationRequestBody(params.body, params.caller)),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => 'no body');
    throw new Error(`Batch orchestration dispatch failed: HTTP ${response.status} - ${detail}`);
  }
  const json = await response.json().catch(() => ({}));
  return typeof json.messageId === 'string' ? json.messageId : undefined;
}

const RECOVERABLE_ORCHESTRATION_STATUSES = new Set<NonNullable<BatchDocument['orchestrationStatus']>>([
  'requested',
  'waiting_analysis',
  'retryable_error',
  'composing',
]);

async function recoverStaleExistingBatch(params: {
  db: Awaited<ReturnType<typeof getDatabase>>;
  batch: BatchDocument;
  body: FromBatchRequest;
  caller: BatchCaller;
  baseUrl: string;
}): Promise<NextResponse> {
  const { db, batch, body, caller, baseUrl } = params;
  const projectId = batch.projectId;
  if (!projectId) {
    return NextResponse.json({ success: false, error: 'Batch orchestration has no project to resume.' }, { status: 409 });
  }
  if (batch.orchestrationStatus === 'director_queued') {
    return NextResponse.json({ success: true, projectId, status: 'processing' });
  }
  if (batch.orchestrationStatus === 'failed') {
    return NextResponse.json({ success: false, projectId, status: 'failed' }, { status: 409 });
  }
  if (!batch.orchestrationStatus || !RECOVERABLE_ORCHESTRATION_STATUSES.has(batch.orchestrationStatus)) {
    return NextResponse.json({ success: true, projectId, status: 'existing' });
  }

  const now = new Date();
  const activeComposeLease = batch.orchestrationStatus === 'composing'
    && new Date(batch.orchestrationLeaseUntil ?? 0).getTime() > now.getTime();
  const activeRecoveryLease = new Date(batch.orchestrationRecoveryLeaseUntil ?? 0).getTime() > now.getTime();
  const lastDispatchMs = new Date(
    batch.orchestrationLastDispatchedAt
      ?? batch.orchestrationRequestedAt
      ?? now,
  ).getTime();
  const staleMs = orchestrationRecoveryStaleMs();
  const isStale = Number.isFinite(lastDispatchMs) && now.getTime() - lastDispatchMs >= staleMs;
  if (activeComposeLease || activeRecoveryLease || !isStale) {
    return NextResponse.json({ success: true, projectId, status: 'existing' });
  }

  const staleBefore = new Date(now.getTime() - staleMs);
  const recoveryLeaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
  const claim = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
    {
      uploadBatchId: batch.uploadBatchId,
      userId: batch.userId,
      projectId,
      orchestrationStatus: batch.orchestrationStatus,
      $and: [
        {
          $or: [
            { orchestrationRecoveryLeaseUntil: { $exists: false } },
            { orchestrationRecoveryLeaseUntil: { $lte: now } },
          ],
        },
        {
          $or: [
            { orchestrationLastDispatchedAt: { $lte: staleBefore } },
            {
              orchestrationLastDispatchedAt: { $exists: false },
              orchestrationRequestedAt: { $lte: staleBefore },
            },
          ],
        },
      ],
    },
    {
      $set: {
        orchestrationRecoveryLeaseUntil: recoveryLeaseUntil,
        orchestrationRecoveryClaimedAt: now,
        updatedAt: now,
      },
    },
  );
  if (claim.matchedCount === 0) {
    return NextResponse.json({ success: true, projectId, status: 'processing' });
  }

  const recoveryBody: FromBatchRequest = {
    ...body,
    title: body.title ?? batch.autoEditRequest?.title,
    brandId: body.brandId ?? batch.autoEditRequest?.brandId ?? undefined,
    targetDurationSec: body.targetDurationSec ?? batch.autoEditRequest?.targetDurationSec,
  };
  try {
    const messageId = await dispatchBatchOrchestration({
      baseUrl,
      body: recoveryBody,
      caller: {
        ...caller,
        pollAttempt: Math.max(0, batch.orchestrationAttempt ?? 0),
        failureCount: 0,
      },
    });
    await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
      { uploadBatchId: batch.uploadBatchId, userId: batch.userId, projectId },
      {
        $set: {
          orchestrationLastDispatchedAt: new Date(),
          ...(messageId ? { orchestrationMessageId: messageId } : {}),
          updatedAt: new Date(),
        },
        $unset: { orchestrationRecoveryLeaseUntil: '', orchestrationRecoveryError: '' },
      },
    );
    return NextResponse.json({
      success: true,
      projectId,
      status: 'processing',
      recoveryDispatched: true,
      messageId,
    }, { status: 202 });
  } catch (error) {
    await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
      { uploadBatchId: batch.uploadBatchId, userId: batch.userId, projectId },
      {
        $set: {
          orchestrationRecoveryError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        },
        $unset: { orchestrationRecoveryLeaseUntil: '' },
      },
    );
    throw error;
  }
}

function directorNarrativeContext(intake: MediaUploadBatchIntake): string | undefined {
  const intent = cleanString(intake.userIntent, 4000);
  const script = cleanString(intake.script, 12000);
  const context = [
    intent,
    script ? 'User-provided script or outline:\n' + script : undefined,
  ].filter((part): part is string => Boolean(part));
  return context.length > 0 ? context.join('\n\n') : undefined;
}

function mergeIntake(batchIntake: MediaUploadBatchIntake | undefined, body: FromBatchRequest): MediaUploadBatchIntake {
  const editorialPreferences = normalizeEditorialPreferences(body.editorialPreferences)
    ?? normalizeEditorialPreferences(batchIntake?.editorialPreferences);
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
    ...(editorialPreferences && { editorialPreferences }),
  };
}

async function buildBrief(
  analyses: Awaited<ReturnType<typeof readProjectAssetAnalyses>>,
  assets: readonly BatchMediaAsset[],
  intake: MediaUploadBatchIntake,
  body: FromBatchRequest,
  caller: Pick<BatchCaller, 'userId' | 'orgId'>,
): Promise<ProductionBrief> {
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

  const brandId = cleanString(body.brandId, 128);
  const brandResolution = brandId
    ? await resolveEffectiveBrandWithProfile(caller.userId, brandId, {
        service: 'editron',
        orgId: caller.orgId,
      })
    : null;
  const brand = brandResolution?.acceptedProfile
    ? brandDefaultsFromProfile(brandResolution.acceptedProfile)
    : null;

  const signals = intakeSignalsFromProject(
    analyses,
    assets.map((asset) => ({ assetId: asset.assetId, durationSec: positiveDurationSec(asset) })),
    {
      hasBrand: Boolean(brandId),
      brand,
      prompt: prompt || null,
      requested,
    },
  );
  return resolveProductionBrief({ ...signals, brandId });
}

function dimensionsForAspect(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
}

async function completeStorylinePrompt(
  prompt: string,
  responseSchema?: StorylineResponseSchema,
): Promise<string> {
  const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getGeneralModel();
  return completeStorylineJsonPrompt(
    prompt,
    (request) => model.generateContent(request),
    responseSchema,
  );
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
  const parts = [
    cleanString(intake.userIntent, 2000),
    cleanString(body.title, 500),
    cleanString(intake.script, 12000),
  ].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join('\n\n') || null;
}

async function embedStorylineDocument(text: string): Promise<number[]> {
  return await generateEditronEmbedding(text, { taskType: 'RETRIEVAL_DOCUMENT' }) ?? [];
}

async function embedStorylineIntent(text: string | null): Promise<number[] | null> {
  if (!text) return null;
  return await generateEditronEmbedding(text, { taskType: 'RETRIEVAL_QUERY' });
}

function storylineScriptPlanAudit(result: OrderStorylineResult): Record<string, unknown> | null {
  const scriptPlan = result.scriptPlan;
  if (!scriptPlan) return null;
  return {
    status: scriptPlan.status,
    failureKind: scriptPlan.failureKind,
    attempts: scriptPlan.attempts,
    unitCount: scriptPlan.units.length,
    retrieval: scriptPlan.retrieval,
    selectedSceneIds: scriptPlan.selectedSceneIds,
    beats: scriptPlan.beats.map((beat) => ({
      id: beat.id,
      unitIds: beat.unitIds,
      scriptText: beat.scriptText.slice(0, 500),
      visualIntent: beat.visualIntent,
      relationFromPrevious: beat.relationFromPrevious,
    })),
    assignments: scriptPlan.assignments,
    errors: scriptPlan.errors.slice(0, 20),
    validation: scriptPlan.validation
      ? {
          valid: scriptPlan.validation.valid,
          issues: scriptPlan.validation.issues.slice(0, 20),
          warnings: scriptPlan.validation.warnings.slice(0, 20),
        }
      : null,
  };
}

async function imageSceneInputs(assets: readonly BatchMediaAsset[], userId: string): Promise<ImageAssetInput[]> {
  return await Promise.all(assets
    .filter((asset) => asset.type === 'image')
    .map(async (asset) => ({
      assetId: asset.assetId,
      source: await resolveOverlayUrl(asset, userId),
      createdAt: assetCreatedAtMs(asset),
    })));
}

function hasFullSegmentAnalysis(value: unknown): value is SegmentAnalysis {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { segments?: unknown }).segments) &&
    (value as { globalContext?: unknown }).globalContext,
  );
}

function rawFootageAnalysis(value: unknown): RawFootageAnalysis | null {
  return value && typeof value === 'object' ? value as RawFootageAnalysis : null;
}

function narrativeSourcesFromAnalyses(
  analyses: Awaited<ReturnType<typeof readProjectAssetAnalyses>>,
  assetContexts: ReadonlyMap<string, { source?: string | null }>,
): ReadonlyMap<string, NarrativeSignalSource> | undefined {
  const sources = new Map<string, NarrativeSignalSource>();
  for (const analysis of analyses) {
    const raw = rawFootageAnalysis(analysis.rawFootageAnalysis);
    const timeline = hasFullSegmentAnalysis(analysis.segmentAnalysis)
      ? buildSignalTimelineFromAnalysis(analysis.segmentAnalysis, [], raw, [], FPS, analysis.musicAnalysis as never)
      : buildSignalTimeline([], raw, [], FPS, undefined, undefined, analysis.musicAnalysis as never);
    const source = narrativeSourceFromTimeline(timeline);
    if (source.events.length === 0 && !source.pressureAt && !source.durationMs) continue;
    sources.set(analysis.assetId, source);
    const resolvedSource = assetContexts.get(analysis.assetId)?.source;
    if (resolvedSource) sources.set(resolvedSource, source);
  }
  return sources.size > 0 ? sources : undefined;
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
  const transcriptionFailed = asset.analysisStatus !== 'complete'
    && ['failed', 'dispatch_failed', 'orchestration_timed_out'].includes(asset.batchTranscriptionStatus ?? '');
  const analysisFailed = ['failed', 'dispatch_failed', 'orchestration_timed_out']
    .includes(asset.analysisStatus ?? '');
  const terminalFailure = analysisFailed || transcriptionFailed;
  return {
    assetId: asset.assetId,
    filename: asset.filename,
    type: asset.type,
    size: asset.size ?? 0,
    duration: positiveDurationSec(asset),
    dimensions: asset.dimensions,
    thumbnail: asset.thumbnail,
    uploadedAt: asset.uploadedAt,
    analysisStatus: terminalFailure ? 'failed' : asset.analysisStatus,
    analysisError: asset.analysisError || (transcriptionFailed ? asset.batchTranscriptionError || 'transcription_failed' : null),
    analysisSkipReason: asset.analysisSkipReason,
    analysisQueuedAt: asset.analysisQueuedAt,
    analysisStartedAt: asset.analysisStartedAt,
    analysisCompletedAt: asset.analysisCompletedAt,
    deepAnalysisStatus: asset.deepAnalysisStatus,
    deepAnalysisVersion: asset.deepAnalysisVersion,
    deepAnalysisTargetVersion: asset.deepAnalysisTargetVersion,
    deepAnalysisRetryVersion: asset.deepAnalysisRetryVersion,
    deepAnalysisRetryCount: asset.deepAnalysisRetryCount,
    deepAnalysisDiagnostics: asset.deepAnalysisDiagnostics,
  };
}

function coverageMimeType(source: string): string {
  const path = source.toLowerCase().split('?')[0];
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

function createBatchScriptCoverageVerifier(): CoverageVerify {
  let modelPromise: ReturnType<typeof import('@/lib/editron/utils/gemini-model-factory')['getAnalysisModel']> | undefined;
  return async (query, scene: Scene) => {
    if (!/^(?:https?:\/\/|gs:\/\/)/iu.test(scene.source)) {
      return { confirmed: false, note: 'scene_source_not_remotely_readable' };
    }
    const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
    modelPromise ??= getAnalysisModel();
    const model = await modelPromise;
    const mimeType = coverageMimeType(scene.source);
    const mediaPart: {
      fileData: { fileUri: string; mimeType: string };
      videoMetadata?: { startOffset: string; endOffset: string };
    } = { fileData: { fileUri: scene.source, mimeType } };
    if (!mimeType.startsWith('image/')) {
      const startSec = Math.max(0, scene.startTime);
      const endSec = Math.max(startSec + 0.001, scene.endTime);
      mediaPart.videoMetadata = {
        startOffset: `${startSec.toFixed(3)}s`,
        endOffset: `${endSec.toFixed(3)}s`,
      };
    }
    const visualScope = mimeType.startsWith('image/')
      ? 'Inspect this image.'
      : `Inspect only ${scene.startTime.toFixed(2)}s-${scene.endTime.toFixed(2)}s of this source.`;
    const generationConfig: GenerationConfig & {
      seed: number;
      thinkingConfig: { thinkingBudget: number };
    } = {
      temperature: 0,
      seed: 42,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          confirmed: { type: SchemaType.BOOLEAN },
          note: { type: SchemaType.STRING },
        },
        required: ['confirmed', 'note'],
      },
      // This is a binary pixel-grounding check. Gemini 2.5 Flash's default
      // thinking can consume the output budget and truncate otherwise-valid JSON.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 256,
    };
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          mediaPart,
          { text: `${visualScope}\nDetermine whether the pixels visibly depict this requested moment. Transcript, filename, tags, and the request itself are not proof. Return JSON only.\n${JSON.stringify({ requestedMoment: query.text, responseSchema: { confirmed: 'boolean', note: 'short visible evidence' } })}` },
        ],
      }],
      generationConfig,
    });
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`Coverage verifier response did not finish cleanly (${finishReason})`);
    }
    const parsed = parseJsonObject(result.response.text());
    if (!parsed || typeof parsed.confirmed !== 'boolean') {
      throw new Error('Coverage verifier response omitted boolean confirmed');
    }
    return { confirmed: parsed.confirmed, note: cleanString(parsed.note, 240) };
  };
}

function isUsableVisualAsset(asset: BatchMediaAsset, readiness?: MediaUploadBatchAssetStatus): boolean {
  if (asset.type !== 'video' && asset.type !== 'image') return false;
  if (readiness?.readiness === 'failed' || readiness?.readiness === 'skipped') return false;
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
    const nativeVideoAudioRights = asset.type === 'video'
      ? readStoredNativeVideoAudioRights(asset)
      : null;
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
      ...(nativeVideoAudioRights && { audioRights: nativeVideoAudioRights }),
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
        linkFromPrev: clip.linkFromPrev,
        transitionIn: clip.transitionIn,
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
  pipelineDirectorDispatchToken: string;
}): Promise<{ queued: boolean; messageId?: string }> {
  const qstashToken = process.env.QSTASH_TOKEN;
  const workerUrl = `${params.baseUrl}/api/internal/workers/director`;
  const failureCallbackUrl = `${params.baseUrl}/api/internal/workers/director/failure`;
  const payload = {
    projectId: params.projectId,
    userId: params.userId,
    orgId: params.orgId || undefined,
    profileId: 'A-01',
    title: params.title,
    platform: params.intake.platform,
    userIntent: directorNarrativeContext(params.intake),
    captionStyle: params.intake.captionStyle,
    transitionPreference: params.intake.transitionPreference,
    zoomBehavior: params.intake.zoomBehavior,
    motionGraphics: params.intake.motionGraphics,
    pacingFeel: params.intake.pacingFeel,
    musicPreference: params.intake.musicPreference,
    editorialPreferences: normalizeEditorialPreferences(params.intake.editorialPreferences),
    pipelineDirectorDispatchToken: params.pipelineDirectorDispatchToken,
  };

  if (!isInternalQStashDispatchConfigured()) {
    if (!isInternalWorkerInlineFallbackAllowed()) {
      throw new Error('QStash publisher token and signing keys are required to dispatch the Director outside development');
    }
    const { runCanonicalDirectorV1 } = await import('@/lib/editron/services/canonical-director-run');
    const completion = await runCanonicalDirectorV1(payload);
    if (completion.disposition !== 'COMPLETED' && completion.disposition !== 'ALREADY_PROCESSED') {
      throw new Error(`Inline Director execution did not complete: ${completion.disposition}.`);
    }
    return { queued: false };
  }

  const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${workerUrl}`;
  const res = await fetch(qstashUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '0',
      'Upstash-Timeout': '800s',
      'Upstash-Failure-Callback': failureCallbackUrl,
      'Upstash-Failure-Callback-Retries': '2',
      'Upstash-Failure-Callback-Timeout': '30s',
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
  let creditsDeducted = false;
  let assistLaneActive = false;
  let queuedOrRanDirector = false;
  let caller: BatchCaller | null = null;
  let body: FromBatchRequest | null = null;
  let uploadBatchId: string | null = null;
  let activeProjectId: string | null = null;
  let assistCharge: { transactionId: string; chargedCredits: number } | null = null;
  let assistChargeRegistered = false;
  let assistReadyCommitted = false;
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const rawBody = await request.text();
    body = JSON.parse(rawBody) as FromBatchRequest;
    caller = await resolveBatchCaller(request, rawBody, body);
    const { userId, orgId } = caller;
    uploadBatchId = normalizeUploadBatchId(body.uploadBatchId ?? '');
    const brandId = cleanString(body.brandId, 128);
    baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

    if (!isInternalWorkerInlineFallbackAllowed() && !isInternalQStashDispatchConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Durable batch orchestration is unavailable because its publisher token or signing keys are not configured.',
      }, { status: 503 });
    }

    const db = await getDatabase();
    let batch = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({ uploadBatchId, userId }) as BatchDocument | null;
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Upload batch not found' }, { status: 404 });
    }
    // Org-wallet routing (P2): derive the billing owner from the SAME ownership createProject
    // stamps (orgId ?? batch.orgId + the flag), so the pre-flight gate, the compose-time deduct,
    // and every refund path bill the same wallet. Flag off / no org context => the member's
    // personal wallet, exactly as before.
    const orgWalletEnabled = isOrgWalletBillingEnabled();
    const batchEffectiveOrgId = orgId ?? batch.orgId ?? null;
    const billingWallet = resolveBillingOwner(
      userId,
      { orgId: batchEffectiveOrgId, visibility: resolveCreationVisibility(batchEffectiveOrgId, orgWalletEnabled) },
      orgWalletEnabled,
    );
    if (hasMultiOutputRequest(body) || hasMultiOutputRequest(batch.productionBriefIntake)) {
      return NextResponse.json({
        success: false,
        error: 'Editron creates exactly one video per request. Choose one output specification.',
      }, { status: 400 });
    }
    const resumeCoverage = !caller.internal && body.resumeCoverage === true;
    if (!caller.internal && batch.projectId && !resumeCoverage) {
      return recoverStaleExistingBatch({ db, batch, body, caller, baseUrl });
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
          deepAnalysisStatus: 1,
          deepAnalysisVersion: 1,
          deepAnalysisTargetVersion: 1,
          deepAnalysisRetryVersion: 1,
          deepAnalysisRetryCount: 1,
          deepAnalysisDiagnostics: 1,
          batchTranscriptionStatus: 1,
          batchTranscriptionError: 1,
          batchTranscriptionStartedAt: 1,
          batchTranscriptionCompletedAt: 1,
        },
      })
      .sort({ uploadedAt: 1 })
      .toArray() as unknown as BatchMediaAsset[];

    const initialReadiness = buildMediaUploadBatchSummary(
      mediaAssets.map(buildStatusInput),
      BATCH_ANALYSIS_REQUIREMENTS,
    );
    const retryableSemanticIds = new Set(
      initialReadiness.assets
        .filter((asset) => (
          asset.type === 'video'
          && asset.semanticVisualReadiness === 'retryable'
          && ['complete', 'failed', 'dispatch_failed'].includes(asset.analysisStatus ?? '')
        ))
        .map((asset) => asset.assetId),
    );
    const semanticRetryCandidates = mediaAssets.filter((asset) => retryableSemanticIds.has(asset.assetId));
    const semanticRetryOutcomes = semanticRetryCandidates.length > 0
      ? await queueSemanticVisualRetries({
          assets: semanticRetryCandidates.map((asset) => ({
            assetId: asset.assetId,
            analysisStatus: asset.analysisStatus,
            deepAnalysisStatus: asset.deepAnalysisStatus,
            deepAnalysisTargetVersion: asset.deepAnalysisTargetVersion,
            deepAnalysisRetryVersion: asset.deepAnalysisRetryVersion,
            deepAnalysisRetryCount: asset.deepAnalysisRetryCount,
            durationSec: positiveDurationSec(asset),
          })),
          userId,
          workerBaseUrl: baseUrl,
          qstashToken: process.env.QSTASH_TOKEN || '',
          qstashBaseUrl: process.env.QSTASH_URL,
          collection: db.collection(COLLECTIONS.MEDIA_ASSETS),
          resolveMediaUrl: async (candidate) => {
            const asset = mediaAssets.find((item) => item.assetId === candidate.assetId);
            return asset ? resolveOverlayUrl(asset, userId) : '';
          },
        })
      : [];
    for (const outcome of semanticRetryOutcomes) {
      const asset = mediaAssets.find((item) => item.assetId === outcome.assetId);
      if (!asset) continue;
      Object.assign(asset, outcome.status === 'queued'
        ? {
            analysisStatus: 'analyzing',
            deepAnalysisStatus: 'queued',
            deepAnalysisTargetVersion: ASSET_DEEP_ANALYSIS_VERSION,
            deepAnalysisRetryVersion: ASSET_DEEP_ANALYSIS_VERSION,
            deepAnalysisRetryCount: outcome.retryCount,
            analysisError: null,
          }
        : outcome.status === 'dispatch-failed'
          ? {
              analysisStatus: 'complete',
              deepAnalysisStatus: 'dispatch_failed',
              deepAnalysisTargetVersion: null,
              deepAnalysisRetryVersion: ASSET_DEEP_ANALYSIS_VERSION,
              deepAnalysisRetryCount: outcome.retryCount,
            }
          : {});
    }
    const semanticRequeuedAssetIds = semanticRetryOutcomes
      .filter((outcome) => outcome.status === 'queued')
      .map((outcome) => outcome.assetId);
    if (semanticRetryOutcomes.length > 0) {
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId },
        {
          $set: {
            orchestrationSemanticRetryAssetIds: semanticRequeuedAssetIds,
            orchestrationSemanticRetryOutcomes: semanticRetryOutcomes,
            orchestrationSemanticRetryAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );
    }

    let summary = buildMediaUploadBatchSummary(
      mediaAssets.map(buildStatusInput),
      BATCH_ANALYSIS_REQUIREMENTS,
    );
    let readinessByAsset = new Map(summary.assets.map((asset) => [asset.assetId, asset]));
    let visualAssets = mediaAssets.filter((asset) => isUsableVisualAsset(asset, readinessByAsset.get(asset.assetId)));
    if (visualAssets.length === 0) {
      if (batch.projectId) {
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId: batch.projectId },
          { $set: { autoEditStatus: 'failed', autoEditError: 'Upload batch has no usable video or image assets.', updatedAt: new Date() } },
        );
      }
      return NextResponse.json({
        success: false,
        error: 'Upload batch has no usable video or image assets.',
        batch: summary,
      }, { status: 400 });
    }

    let creditOptions = {
      durationMinutes: getBillableAutoEditMinutes(visualAssets),
      requestType: visualAssets.length > 1 ? 'reference_guided' as const : 'standard' as const,
    };

    if (!caller.internal) {
      creditCheck = await checkCredits(userId, 'editron', 'auto_edit_analysis', creditOptions, billingWallet);
      if (!creditCheck.allowed) return creditCheck.errorResponse!;

      if (resumeCoverage) {
        activeProjectId = batch.projectId ?? null;
        if (!activeProjectId || batch.orchestrationStatus !== 'needs_input') {
          return NextResponse.json({
            success: false,
            error: 'This batch is not waiting for additional footage.',
          }, { status: 409 });
        }

        const project = await db.collection(COLLECTIONS.PROJECTS).findOne({
          projectId: activeProjectId,
          userId,
          sourceUploadBatchId: uploadBatchId,
          autoEditStatus: 'needs_input',
        }, { projection: { _id: 0, projectId: 1 } });
        if (!project) {
          return NextResponse.json({ success: false, error: 'Recoverable auto-edit project not found.' }, { status: 404 });
        }

        const assetIdsAtFailure = Array.isArray(batch.scriptCoverage?.assetIdsAtFailure)
          ? batch.scriptCoverage.assetIdsAtFailure.filter((assetId): assetId is string => typeof assetId === 'string')
          : [];
        const priorAssetIds = new Set(assetIdsAtFailure);
        const addedVisualAssetIds = visualAssets
          .map((asset) => asset.assetId)
          .filter((assetId) => !priorAssetIds.has(assetId));
        if (assetIdsAtFailure.length === 0 || addedVisualAssetIds.length === 0) {
          return NextResponse.json({
            success: false,
            projectId: activeProjectId,
            error: 'Upload new video or image footage before resuming this edit.',
          }, { status: 409 });
        }

        const claimNow = new Date();
        const intake = mergeIntake(batch.productionBriefIntake, body);
        const claim = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          {
            uploadBatchId,
            userId,
            projectId: activeProjectId,
            orchestrationStatus: 'needs_input',
          },
          {
            $set: {
              orchestrationStatus: 'requested',
              orchestrationRequestedAt: claimNow,
              orchestrationAttempt: 0,
              productionBriefIntake: intake,
              updatedAt: claimNow,
            },
            $unset: {
              orchestrationError: '',
              orchestrationLeaseUntil: '',
              orchestrationFailureCount: '',
              orchestrationMessageId: '',
              scriptCoverage: '',
            },
          },
        );
        if (claim.matchedCount === 0) {
          return NextResponse.json({ success: false, error: 'Coverage recovery is already in progress.' }, { status: 409 });
        }

        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId: activeProjectId, userId, sourceUploadBatchId: uploadBatchId },
          {
            $set: {
              autoEditStatus: 'analyzing',
              autoEditStageDesc: 'Analyzing additional footage',
              sourceAssetIds: visualAssets.map((asset) => asset.assetId),
              'storylinePlan.previousScriptCoverage': batch.scriptCoverage ?? null,
              updatedAt: claimNow,
            },
            $unset: {
              autoEditError: '',
              autoEditFailedAt: '',
              'storylinePlan.scriptCoverage': '',
            },
          },
        );

        try {
          const messageId = await dispatchBatchOrchestration({
            baseUrl,
            body,
            caller: { ...caller, pollAttempt: 0, failureCount: 0 },
          });
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId, projectId: activeProjectId, orchestrationStatus: 'requested' },
            {
              $set: {
                orchestrationLastDispatchedAt: new Date(),
                ...(messageId ? { orchestrationMessageId: messageId } : {}),
                updatedAt: new Date(),
              },
            },
          );
          return NextResponse.json({
            success: true,
            projectId: activeProjectId,
            status: 'processing',
            orchestrationStatus: 'requested',
            resumedCoverage: true,
            addedVisualAssetIds,
            messageId,
          }, { status: 202 });
        } catch (dispatchError) {
          const dispatchMessage = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId, projectId: activeProjectId, orchestrationStatus: 'requested' },
            {
              $set: {
                orchestrationStatus: 'needs_input',
                orchestrationError: dispatchMessage,
                scriptCoverage: batch.scriptCoverage ?? null,
                updatedAt: new Date(),
              },
            },
          );
          await db.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: activeProjectId, userId, sourceUploadBatchId: uploadBatchId },
            {
              $set: {
                autoEditStatus: 'needs_input',
                autoEditError: dispatchMessage,
                'storylinePlan.scriptCoverage': batch.scriptCoverage ?? null,
                updatedAt: new Date(),
              },
            },
          );
          return NextResponse.json({ success: false, projectId: activeProjectId, error: dispatchMessage }, { status: 503 });
        }
      }

      const claimNow = new Date();
      const claim = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        {
          uploadBatchId,
          userId,
          projectId: { $exists: false },
          orchestrationStatus: { $nin: ['initializing', 'requested', 'waiting_analysis', 'composing', 'director_queued'] },
        },
        {
          $set: {
            orchestrationStatus: 'initializing',
            orchestrationRequestedAt: claimNow,
            orchestrationAttempt: 0,
            updatedAt: claimNow,
          },
        },
      );
      if (claim.matchedCount === 0) {
        batch = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({ uploadBatchId, userId }) as BatchDocument | null;
        if (batch?.projectId) {
          return NextResponse.json({ success: true, projectId: batch.projectId, status: 'existing' });
        }
        return NextResponse.json({ success: false, error: 'Batch auto-edit is already initializing.' }, { status: 409 });
      }

      const intake = mergeIntake(batch.productionBriefIntake, body);
      // Director Mode (assist lane): enum-validated, server-side flag enforced.
      const requestedEditMode = parseEditMode((body as { editMode?: unknown }).editMode) ?? 'auto';
      if (requestedEditMode === 'assist' && !isAssistIntakeEnabled()) {
        return NextResponse.json({ success: false, error: 'Director Mode is not available.' }, { status: 403 });
      }
      const projectName = cleanString(body.title, 160)
        || cleanString(intake.userIntent, 80)
        || `Auto-Edit Batch: ${uploadBatchId}`;
      const initialAspectRatio = normalizeAspectRatio(intake.aspectRatio) ?? '16:9';
      const initialPlayerDimensions = dimensionsForAspect(initialAspectRatio);
      const project = await projectService.createProject(userId, projectName, {
        brandId,
        orgId: orgId ?? batch.orgId ?? null,
        aspectRatio: initialAspectRatio,
      });
      activeProjectId = project.projectId;
      const initialSnapshot = await projectService.loadProjectForMutation(userId, activeProjectId);
      await projectService.saveProjectWithReceipt(userId, activeProjectId, {
        overlays: initialSnapshot.project.overlays,
        aspectRatio: initialAspectRatio,
        playerDimensions: initialPlayerDimensions,
        fps: initialSnapshot.project.fps || FPS,
        durationInFrames: initialSnapshot.project.durationInFrames ?? 0,
      }, {
        expectedRevision: initialSnapshot.revision,
        overlayAuthority: 'server',
        projectUpdates: {
          editMode: requestedEditMode,
          autoEditMode: 'batch',
          autoEditStatus: 'analyzing',
          sourceUploadBatchId: uploadBatchId,
          sourceAssetIds: visualAssets.map((asset) => asset.assetId),
          ...(intake.editorialPreferences ? { editorialPreferences: intake.editorialPreferences } : {}),
        },
      });
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId, orchestrationStatus: 'initializing' },
        {
          $set: {
            projectId: activeProjectId,
            orchestrationStatus: 'requested',
            orchestrationRequestedAt: claimNow,
            orchestrationAttempt: 0,
            productionBriefIntake: intake,
            autoEditRequest: {
              title: projectName,
              brandId: brandId ?? null,
              targetDurationSec: body.targetDurationSec ?? null,
            },
            updatedAt: new Date(),
          },
          $unset: { projectIds: '', deliverableProjects: '' },
        },
      );

      const messageId = await dispatchBatchOrchestration({
        baseUrl,
        body,
        caller: { ...caller, pollAttempt: 0, failureCount: 0 },
      });
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId, projectId: activeProjectId },
        {
          $set: {
            orchestrationLastDispatchedAt: new Date(),
            ...(messageId ? { orchestrationMessageId: messageId } : {}),
            updatedAt: new Date(),
          },
        },
      );
      return NextResponse.json({
        success: true,
        projectId: activeProjectId,
        status: 'processing',
        messageId,
        orchestrationStatus: 'requested',
      }, { status: 202 });
    }

    activeProjectId = batch.projectId ?? null;
    if (!activeProjectId) {
      return NextResponse.json({ success: false, error: 'Batch orchestration has no project to resume.' }, { status: 409 });
    }
    if (batch.orchestrationStatus === 'director_queued') {
      return NextResponse.json({ success: true, projectId: activeProjectId, status: 'processing', skipped: 'director-already-queued' });
    }
    if (batch.orchestrationStatus === 'needs_input') {
      return NextResponse.json({ success: false, projectId: activeProjectId, status: 'needs_input' });
    }
    if (batch.orchestrationStatus === 'failed') {
      return NextResponse.json({ success: false, projectId: activeProjectId, status: 'failed' }, { status: 409 });
    }

    const inProgress = summary.counts.uploaded + summary.counts.queued + summary.counts.analyzing;
    if (inProgress > 0) {
      const deadlineMs = orchestrationDeadlineMs();
      const parsedRequestedAtMs = new Date(batch.orchestrationRequestedAt ?? Date.now()).getTime();
      const requestedAtMs = Number.isFinite(parsedRequestedAtMs) ? parsedRequestedAtMs : Date.now();
      if (Date.now() - requestedAtMs >= deadlineMs) {
        const now = new Date();
        const reason = `Asset analysis did not reach a terminal state within ${Math.round(deadlineMs / 60000)} minutes.`;
        const timeoutCandidates = mediaAssets.filter((asset) => {
          const readiness = readinessByAsset.get(asset.assetId)?.readiness;
          return readiness === 'uploaded' || readiness === 'queued' || readiness === 'analyzing';
        });
        const assetCollection = db.collection(COLLECTIONS.MEDIA_ASSETS);
        if (timeoutCandidates.length > 0) {
          await assetCollection.bulkWrite(
            timeoutCandidates.map((asset) => {
              const set: Record<string, unknown> = {
                analysisStatus: 'orchestration_timed_out',
                analysisError: reason,
                analysisCompletedAt: now,
              };
              if (
                asset.type !== 'image'
                && !['complete', 'failed', 'dispatch_failed', 'orchestration_timed_out'].includes(asset.batchTranscriptionStatus ?? '')
              ) {
                set.batchTranscriptionStatus = 'orchestration_timed_out';
                set.batchTranscriptionError = reason;
                set.batchTranscriptionCompletedAt = now;
              }
              return {
                updateOne: {
                  filter: {
                    assetId: asset.assetId,
                    userId,
                    $or: [
                      { analysisStatus: { $exists: false } },
                      { analysisStatus: null },
                      { analysisStatus: { $in: ['uploaded', 'queued', 'analyzing'] } },
                    ],
                  },
                  update: { $set: set },
                },
              };
            }),
            { ordered: false },
          );
          const refreshedAssets = await assetCollection.find(
            { userId, assetId: { $in: timeoutCandidates.map((asset) => asset.assetId) } },
            {
              projection: {
                _id: 0,
                assetId: 1,
                analysisStatus: 1,
                analysisError: 1,
                analysisCompletedAt: 1,
                batchTranscriptionStatus: 1,
                batchTranscriptionError: 1,
                batchTranscriptionCompletedAt: 1,
              },
            },
          ).toArray() as unknown as Array<Partial<BatchMediaAsset> & { assetId: string }>;
          const refreshedById = new Map(refreshedAssets.map((asset) => [asset.assetId, asset]));
          for (const asset of timeoutCandidates) {
            const refreshed = refreshedById.get(asset.assetId);
            if (refreshed) Object.assign(asset, refreshed);
          }
        }
        const timedOutAssetIds = timeoutCandidates
          .filter((asset) => asset.analysisStatus === 'orchestration_timed_out')
          .map((asset) => asset.assetId);
        summary = buildMediaUploadBatchSummary(
          mediaAssets.map(buildStatusInput),
          BATCH_ANALYSIS_REQUIREMENTS,
        );
        readinessByAsset = new Map(summary.assets.map((asset) => [asset.assetId, asset]));
        visualAssets = mediaAssets.filter((asset) => isUsableVisualAsset(asset, readinessByAsset.get(asset.assetId)));
        creditOptions = {
          durationMinutes: getBillableAutoEditMinutes(visualAssets),
          requestType: visualAssets.length > 1 ? 'reference_guided' as const : 'standard' as const,
        };
        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          { uploadBatchId, userId, projectId: activeProjectId },
          {
            $set: {
              orchestrationLastSummary: summary.counts,
              orchestrationTimedOutAssetIds: timedOutAssetIds,
              orchestrationFailForwardAt: now,
              updatedAt: now,
            },
            $unset: { orchestrationLeaseUntil: '' },
          },
        );
        if (visualAssets.length === 0) {
          const batchReason = `${reason} No usable video or image assets completed successfully.`;
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId, projectId: activeProjectId },
            { $set: { orchestrationStatus: 'failed', orchestrationError: batchReason, updatedAt: now } },
          );
          await db.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: activeProjectId },
            { $set: { autoEditStatus: 'failed', autoEditError: batchReason, updatedAt: now } },
          );
          return NextResponse.json({ success: false, projectId: activeProjectId, status: 'failed', error: batchReason });
        }
        console.warn(`[BatchAutoEdit] Fail-forward after analysis deadline: composing ${visualAssets.length} successful assets; excluded ${timedOutAssetIds.length} timed-out assets.`);
      } else {
        const nextPollAttempt = caller.pollAttempt + 1;
        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          { uploadBatchId, userId, projectId: activeProjectId },
          {
            $set: {
              orchestrationStatus: 'waiting_analysis',
              orchestrationAttempt: nextPollAttempt,
              orchestrationLastSummary: summary.counts,
              updatedAt: new Date(),
            },
            $unset: { orchestrationLeaseUntil: '' },
          },
        );
        const messageId = await dispatchBatchOrchestration({
          baseUrl,
          body,
          caller: { ...caller, pollAttempt: nextPollAttempt },
          delaySeconds: orchestrationDelaySeconds(),
        });
        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          { uploadBatchId, userId, projectId: activeProjectId },
          {
            $set: {
              orchestrationLastDispatchedAt: new Date(),
              ...(messageId ? { orchestrationMessageId: messageId } : {}),
              updatedAt: new Date(),
            },
          },
        );
        return NextResponse.json({
          success: true,
          projectId: activeProjectId,
          status: 'processing',
          orchestrationStatus: 'waiting_analysis',
          messageId,
          batch: summary,
        }, { status: 202 });
      }
    }
    const leaseNow = new Date();
    const leaseUntil = new Date(leaseNow.getTime() + 10 * 60 * 1000);
    const composeClaim = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
      {
        uploadBatchId,
        userId,
        projectId: activeProjectId,
        orchestrationStatus: { $in: ['requested', 'waiting_analysis', 'retryable_error', 'composing'] },
        $or: [
          { orchestrationStatus: { $ne: 'composing' } },
          { orchestrationLeaseUntil: { $exists: false } },
          { orchestrationLeaseUntil: { $lte: leaseNow } },
        ],
      },
      {
        $set: {
          orchestrationStatus: 'composing',
          orchestrationLeaseUntil: leaseUntil,
          orchestrationAttempt: caller.pollAttempt,
          updatedAt: leaseNow,
        },
      },
    );
    if (composeClaim.matchedCount === 0) {
      return NextResponse.json({ success: true, projectId: activeProjectId, status: 'processing', skipped: 'orchestration-lease-held' });
    }

    const laneOwner = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId: activeProjectId, userId },
      { projection: { editMode: 1, autoEditStatus: 1 } },
    );
    assistLaneActive = isAssistProject(laneOwner);
    if (assistLaneActive && laneOwner?.autoEditStatus === ASSIST_STATUS_READY) {
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId, projectId: activeProjectId, orchestrationStatus: { $ne: 'failed' } },
        {
          $set: { orchestrationStatus: 'assist_ready', updatedAt: new Date() },
          $unset: { orchestrationLeaseUntil: '' },
        },
      );
      return NextResponse.json({
        success: true,
        projectId: activeProjectId,
        status: ASSIST_STATUS_READY,
        recoveredBatchProjection: true,
      });
    }

    creditCheck = await checkCredits(userId, 'editron', 'auto_edit_analysis', creditOptions, billingWallet);
    if (!creditCheck.allowed) {
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId, projectId: activeProjectId },
        { $set: { orchestrationStatus: 'failed', orchestrationError: 'Insufficient credits', updatedAt: new Date() }, $unset: { orchestrationLeaseUntil: '' } },
      );
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId: activeProjectId },
        { $set: { autoEditStatus: 'failed', autoEditError: 'Insufficient credits', updatedAt: new Date() } },
      );
      return creditCheck.errorResponse!;
    }
    const deduction = await creditCheck.deduct();
    creditsDeducted = true;

    if (assistLaneActive) {
      const { getCreditCost } = await import('@/lib/config/creditCosts');
      assistCharge = {
        transactionId: deduction.transactionId,
        chargedCredits: getCreditCost('editron', 'auto_edit_analysis', creditOptions),
      };
      const registration = await registerAssistScanCharge(db, {
        projectId: activeProjectId,
        userId,
        creditTransactionId: assistCharge.transactionId,
        chargedCredits: assistCharge.chargedCredits,
      });
      if (!('terminal' in registration)) {
        throw new Error(`Assist charge registration failed closed (${registration.disposition}).`);
      }
      assistChargeRegistered = true;
      if (registration.terminal) {
        const settlement = await settleAssistScanFailure(db, {
          projectId: activeProjectId,
          userId,
          reason: 'Director Mode scan cancelled during charge registration — full refund',
          creditTransactionId: assistCharge.transactionId,
        });
        creditsDeducted = settlement !== 'refunded';
        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          { uploadBatchId, userId, projectId: activeProjectId },
          {
            $set: { orchestrationStatus: 'failed', orchestrationError: 'Cancelled by user', updatedAt: new Date() },
            $unset: { orchestrationLeaseUntil: '' },
          },
        );
        return NextResponse.json({
          success: true,
          projectId: activeProjectId,
          status: 'scan_failed',
          cancelledDuringChargeRegistration: true,
          refundPending: settlement !== 'refunded',
        });
      }
    }

    const intake = mergeIntake(batch.productionBriefIntake, body);
    const analysisBridge = await hydrateStorylineAnalysesForBatch(db as any, {
      projectId: activeProjectId,
      userId,
      assets: visualAssets,
    });
    const analyses = await readProjectAssetAnalyses(db as any, activeProjectId);
    const brief = await buildBrief(analyses, visualAssets, intake, body, caller);
    const dims = dimensionsForAspect(brief.output.aspectRatio ?? '16:9');

    // Director Mode (assist lane): scans are done and credits are deducted — lay the
    // clips down chronologically, hydrate the project-level analysis fields chat
    // grounds in, and hand the pen to the user. NO storyline, NO director, NO edits.
    if (assistLaneActive && assistCharge) {
      const { usableAssets, excludedNoDurationAssetIds } = partitionAssistAssets(visualAssets);
      const timeline = await materializeChronologicalFallback(usableAssets, userId, uploadBatchId, dims);
      if (timeline.overlays.length === 0) throw new Error('No usable clips could be materialized from this batch.');
      const hydration = buildAssistHydration({
        analyses,
        overlays: timeline.overlays,
        fps: FPS,
        durationInFrames: timeline.durationInFrames,
      });
      const degradedAssetIds = Array.from(new Set([
        ...excludedNoDurationAssetIds,
        ...hydration.degradedVideoAssetIds,
      ])).sort();
      const assistProjectId = activeProjectId;
      const registeredAssistCharge = assistCharge;
      const settleLaydownCancellation = async () => {
        const settlement = await settleAssistScanFailure(db, {
          projectId: assistProjectId,
          userId,
          reason: 'Director Mode scan cancelled during lay-down — full refund',
          creditTransactionId: registeredAssistCharge.transactionId,
        });
        console.warn(`[DirectorMode] Assist lay-down lost to a mid-compose cancel — refund settled, batch left failed (project ${assistProjectId}).`);
        return NextResponse.json({
          success: true,
          projectId: assistProjectId,
          status: 'scan_failed',
          cancelledDuringLaydown: true,
          refundPending: settlement !== 'refunded' && settlement !== 'unverifiable-run',
        });
      };
      const readySnapshot = await projectService.loadProjectForMutation(userId, activeProjectId);
      const readyProject = readySnapshot.project as unknown as Record<string, unknown>;
      if (readyProject.autoEditStatus === 'scan_failed') {
        return settleLaydownCancellation();
      }
      if (
        !isAssistProject(readyProject)
        || readyProject.assistCreditTransactionId !== assistCharge.transactionId
        || readyProject.assistChargedCredits !== assistCharge.chargedCredits
        || readyProject.autoEditStatus === ASSIST_STATUS_READY
        || readyProject.autoEditStatus === 'complete'
      ) {
        throw new Error('Assist ready finalization lost its exact lane or charge ownership.');
      }
      try {
        await projectService.saveProjectWithReceipt(userId, activeProjectId, {
          overlays: timeline.overlays as any,
          aspectRatio: brief.output.aspectRatio ?? '16:9',
          playerDimensions: dims,
          fps: FPS,
          durationInFrames: timeline.durationInFrames,
        }, {
          expectedRevision: readySnapshot.revision,
          overlayAuthority: 'server',
          projectUpdates: {
            ...hydration.set,
            autoEditStatus: ASSIST_STATUS_READY,
            assistDegradedAssetIds: degradedAssetIds,
          },
          projectUnsets: [
            ...Object.keys(hydration.unset),
            'autoEditError',
            'autoEditFailedAt',
          ],
        });
      } catch (readyError) {
        const latest = await projectService.loadProjectForMutation(userId, activeProjectId);
        if ((latest.project as unknown as Record<string, unknown>).autoEditStatus === 'scan_failed') {
          return settleLaydownCancellation();
        }
        throw readyError;
      }
      assistReadyCommitted = true;
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        // Never resurrect a cancelled batch (its orchestrationStatus is 'failed').
        { uploadBatchId, userId, projectId: activeProjectId, orchestrationStatus: { $ne: 'failed' } },
        {
          $set: { orchestrationStatus: 'assist_ready', updatedAt: new Date() },
          $unset: { orchestrationLeaseUntil: '' },
        },
      );
      return NextResponse.json({
        success: true,
        projectId: activeProjectId,
        status: ASSIST_STATUS_READY,
        clipCount: timeline.clipCount,
        degradedAssetIds,
        batch: summary.counts,
      });
    }

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
      await imageSceneInputs(visualAssets, userId),
      (image) => analyzeImageFacts(image, imageAssetsById, userId),
    );
    const scenes = [...videoScenes, ...imageScenes];
    const embeddedScenes = await embedScenes(scenes, embedStorylineDocument);
    const intentEmbedding = await embedStorylineIntent(storylineIntentText(intake, body));
    const narrativeSources = narrativeSourcesFromAnalyses(analyses, assetContexts);
    const language = sourceLanguageFromAssets(visualAssets);
    const script = cleanString(intake.script, 12000);
    const ordering = await orderStorylineWithLLM(embeddedScenes, brief, completeStorylinePrompt, {
      ctx: {
        platform: brief.output.platform,
        targetDurationSec: brief.output.targetDurationSec,
        language,
      },
      compose: { scorer: makeEmbeddingScorer(intentEmbedding) },
      narrativeSources,
      hasScript: Boolean(script),
      script,
      scriptQueryEmbed: async (text) => await embedStorylineIntent(text) ?? [],
      scriptCoverageVerify: createBatchScriptCoverageVerifier(),
    });
    if (script && ordering.scriptPlan?.status === 'partial') {
      const uncoveredCount = ordering.scriptPlan.assignments.filter((assignment) => assignment.coverage !== 'covered').length;
      throw new ScriptGroundingError(
        `Uploaded footage does not visibly cover ${uncoveredCount} required script ${uncoveredCount === 1 ? 'beat' : 'beats'}.`,
        false,
        storylineScriptPlanAudit(ordering),
        'coverage_gap',
      );
    }
    if (script && (ordering.fallbackReason === 'script_planner_unavailable' || ordering.fallbackReason === 'script_plan_failed')) {
      const errors = ordering.scriptPlan?.errors.join('; ') || ordering.fallbackReason;
      const failureKind = ordering.scriptPlan?.failureKind ?? 'invalid_response';
      const retryable = failureKind === 'provider_error';
      throw new ScriptGroundingError(
        `Authoritative script could not be grounded to uploaded footage: ${errors}`,
        retryable,
        storylineScriptPlanAudit(ordering),
        failureKind,
      );
    }
    const storylineTimeline = await materializeStoryline(ordering, visualAssets, userId, uploadBatchId, dims);
    const timeline = storylineTimeline ?? await materializeChronologicalFallback(visualAssets, userId, uploadBatchId, dims);
    if (timeline.overlays.length === 0) throw new Error('No usable clips could be materialized from this batch.');
    const selectedVideoClipCount = timeline.overlays.filter((overlay) => overlay.type === 'video').length;
    const directorContext = selectedVideoClipCount > 0
      ? buildMultiAssetDirectorContext({
          analyses,
          overlays: timeline.overlays,
          fps: FPS,
          durationInFrames: timeline.durationInFrames,
        })
      : null;
    const directorAnalysisSet: Record<string, unknown> = { batchDeliverable: null };
    if (directorContext) {
      Object.assign(directorAnalysisSet, {
        rawFootageAnalysis: directorContext.rawFootageAnalysis,
        segmentAnalysis: directorContext.segmentAnalysis,
        multiAssetDirectorContext: directorContext.provenance,
      });
      const optionalAnalyses: Record<string, unknown> = {
        vjepaAnalysis: directorContext.vjepaAnalysis,
        wav2vecAnalysis: directorContext.wav2vecAnalysis,
        momentWeightMap: directorContext.momentWeightMap,
        musicAnalysis: directorContext.musicAnalysis,
      };
      for (const [field, value] of Object.entries(optionalAnalyses)) {
        directorAnalysisSet[field] = value ?? null;
      }
    } else {
      for (const field of ['rawFootageAnalysis', 'segmentAnalysis', 'multiAssetDirectorContext', 'vjepaAnalysis', 'wav2vecAnalysis', 'momentWeightMap', 'musicAnalysis']) {
        directorAnalysisSet[field] = null;
      }
    }

    const compositionSnapshot = await projectService.loadProjectForMutation(userId, activeProjectId);
    const compositionReceipt = await projectService.saveProjectWithReceipt(userId, activeProjectId, {
      overlays: timeline.overlays as any,
      aspectRatio: brief.output.aspectRatio ?? '16:9',
      playerDimensions: dims,
      fps: FPS,
      durationInFrames: timeline.durationInFrames,
    }, {
      expectedRevision: compositionSnapshot.revision,
      overlayAuthority: 'server',
      projectUpdates: {
          autoEditMode: 'batch',
          autoEditStatus: 'analysis_complete',
          // Fresh (re-)deduct happened this compose — clear any refund mark from a
          // prior failed dispatch so a re-charged edit stays rescuable if it fails.
          autoEditRefunded: false,
          sourceUploadBatchId: uploadBatchId,
          sourceAssetIds: visualAssets.map((asset) => asset.assetId),
          ...directorAnalysisSet,
          productionBrief: brief,
          storylinePlan: {
            source: timeline.source,
            planApplied: ordering.planApplied,
            fallbackReason: ordering.fallbackReason ?? (storylineTimeline ? undefined : 'no_materialized_storyline_clips'),
            rationale: ordering.rationale,
            clipCount: timeline.clipCount,
            composerClipCount: ordering.storyline.clips.length,
            scriptCoverage: storylineScriptPlanAudit(ordering),
            analysisBridge,
            directorContext: directorContext?.provenance ?? null,
          },
      },
    });
    const intent = await projectService.recordPipelineDirectorIntentV1(userId, activeProjectId, {
      expectedRevision: compositionReceipt.revision,
      profileId: 'A-01',
    });
    const intentRevision = intent.disposition === 'RECORDED'
      ? intent.receipt.revision
      : intent.disposition === 'ALREADY_RECORDED'
        ? intent.currentRevision
        : null;
    if (!intentRevision) {
      throw new Error(`Batch Director intent was rejected: ${intent.disposition}.`);
    }
    const prepared = await projectService.preparePipelineDirectorDispatchV1(userId, activeProjectId, {
      expectedRevision: intentRevision,
      batchId: uploadBatchId,
    });
    if (prepared.disposition !== 'PREPARED' && prepared.disposition !== 'ALREADY_PREPARED') {
      throw new Error(`Batch Director dispatch preparation was rejected: ${prepared.disposition}.`);
    }

    const projectName = cleanString(body.title, 160)
      || cleanString(intake.userIntent, 80)
      || `Auto-Edit Batch: ${uploadBatchId}`;
    const dispatch = await dispatchDirector({
      baseUrl,
      projectId: activeProjectId,
      userId,
      orgId: orgId || batch.orgId || undefined,
      title: projectName,
      intake: {
        ...intake,
        platform: brief.output.platform,
        aspectRatio: brief.output.aspectRatio,
      },
      pipelineDirectorDispatchToken: prepared.dispatch.dispatchToken,
    });
    queuedOrRanDirector = true;
    const directorQueuedAt = new Date();

    await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
      { uploadBatchId, userId, projectId: activeProjectId },
      {
        $set: {
          orchestrationStatus: 'director_queued',
          orchestrationAttempt: caller.pollAttempt,
          directorQueuedAt,
          ...(dispatch.messageId ? { directorMessageId: dispatch.messageId } : {}),
          autoEditCreditTransactionId: deduction.transactionId,
          updatedAt: directorQueuedAt,
        },
        $unset: { orchestrationLeaseUntil: '', projectIds: '', deliverableProjects: '', directorFailure: '' },
      },
    );

    return NextResponse.json({
      success: true,
      projectId: activeProjectId,
      status: dispatch.queued ? 'processing' : 'complete',
      storylinePlan: {
        source: timeline.source,
        planApplied: ordering.planApplied,
        fallbackReason: ordering.fallbackReason ?? (storylineTimeline ? undefined : 'no_materialized_storyline_clips'),
        rationale: ordering.rationale,
        clipCount: timeline.clipCount,
        scriptCoverage: storylineScriptPlanAudit(ordering),
        analysisBridge,
      },
      messageId: dispatch.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminalScriptGrounding = error instanceof ScriptGroundingError && !error.retryable;
    if (assistLaneActive && assistReadyCommitted && activeProjectId) {
      console.error('[auto-edit/from-batch] Assist project is ready but its batch projection is pending recovery:', message);
      return NextResponse.json({
        success: true,
        projectId: activeProjectId,
        status: ASSIST_STATUS_READY,
        batchProjectionPending: true,
      }, { status: 202 });
    }
    if (
      assistLaneActive
      && assistCharge
      && assistChargeRegistered
      && !assistReadyCommitted
      && activeProjectId
      && caller
      && uploadBatchId
    ) {
      const db = await getDatabase();
      const settlement = await settleAssistScanFailure(db, {
        projectId: activeProjectId,
        userId: caller.userId,
        reason: message,
        creditTransactionId: assistCharge.transactionId,
      });
      creditsDeducted = settlement !== 'refunded';
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
        {
          $set: { orchestrationStatus: 'failed', orchestrationError: message, updatedAt: new Date() },
          $unset: { orchestrationLeaseUntil: '' },
        },
      );
      console.error('[auto-edit/from-batch] Assist compose failed:', message);
      return NextResponse.json({
        success: false,
        projectId: activeProjectId,
        status: 'scan_failed',
        error: message,
        refundPending: settlement !== 'refunded',
      }, { status: 500 });
    }
    if (
      assistLaneActive
      && assistCharge
      && !assistChargeRegistered
      && creditCheck
      && creditsDeducted
      && !queuedOrRanDirector
      && activeProjectId
      && caller
      && uploadBatchId
    ) {
      await creditCheck.refund('Assist charge registration failed before project binding').catch((refundError) => {
        console.error('[auto-edit/from-batch] unbound Assist credit refund failed:', refundError);
      });
      const db = await getDatabase();
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
        {
          $set: { orchestrationStatus: 'failed', orchestrationError: message, updatedAt: new Date() },
          $unset: { orchestrationLeaseUntil: '' },
        },
      );
      return NextResponse.json({
        success: false,
        projectId: activeProjectId,
        status: 'scan_failed',
        error: message,
      }, { status: 500 });
    }
    if (creditCheck && creditsDeducted && !queuedOrRanDirector && !assistLaneActive) {
      await creditCheck.refund('Multi-upload auto-edit failed before Director dispatch').catch((refundError) => {
        console.error('[auto-edit/from-batch] credit refund failed:', refundError);
      });
      // MONEY (battle-lane P0): the timeline + analysis may already be persisted at
      // this point (saveProject + hydration run before the director dispatch), which
      // would make this REFUNDED project pass canRescueToDirectorMode → a free
      // reopen of an edit the user was refunded for. Mark it so the rescue gate
      // excludes it.
      if (activeProjectId) {
        try {
          const refundDb = await getDatabase();
          await refundDb.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: activeProjectId },
            { $set: { autoEditRefunded: true } },
          );
        } catch (markError) {
          console.error('[auto-edit/from-batch] failed to mark project refunded:', markError instanceof Error ? markError.message : markError);
        }
      }
    }

    if (caller?.internal && body && uploadBatchId && activeProjectId) {
      try {
        const db = await getDatabase();
        if (terminalScriptGrounding) {
          const failedBatch = await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne(
            { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
            { projection: { _id: 0, assetIds: 1 } },
          ) as Pick<BatchDocument, 'assetIds'> | null;
          const coverageAudit = {
            ...(error.coverageAudit ?? {}),
            assetIdsAtFailure: Array.isArray(failedBatch?.assetIds) ? failedBatch.assetIds.filter(Boolean) : [],
          };
          const coverageGap = error.failureKind === 'coverage_gap';
          const terminalStatus = coverageGap ? 'needs_input' : 'failed';
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
            {
              $set: {
                orchestrationStatus: terminalStatus,
                orchestrationError: message,
                scriptCoverage: coverageAudit,
                updatedAt: new Date(),
              },
              $unset: { orchestrationLeaseUntil: '' },
            },
          );
          await db.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: activeProjectId, userId: caller.userId },
            {
              $set: {
                autoEditStatus: terminalStatus,
                autoEditError: message,
                autoEditStageDesc: coverageGap ? 'More footage needed' : 'Script grounding failed',
                'storylinePlan.scriptCoverage': coverageAudit,
                updatedAt: new Date(),
              },
            },
          );
          console.warn(`[auto-edit/from-batch] terminal script grounding failure: ${message}`);
          return NextResponse.json({
            success: false,
            projectId: activeProjectId,
            status: terminalStatus,
            error: message,
            scriptCoverage: coverageAudit,
          });
        }
        const nextFailureCount = caller.failureCount + 1;
        if (nextFailureCount < orchestrationFailureLimit()) {
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
            {
              $set: {
                orchestrationStatus: 'retryable_error',
                orchestrationError: message,
                orchestrationFailureCount: nextFailureCount,
                updatedAt: new Date(),
              },
              $unset: { orchestrationLeaseUntil: '' },
            },
          );
          await dispatchBatchOrchestration({
            baseUrl,
            body,
            caller: { ...caller, failureCount: nextFailureCount },
            delaySeconds: orchestrationDelaySeconds(),
          });
          console.warn(`[auto-edit/from-batch] retrying durable orchestration after failure ${nextFailureCount}: ${message}`);
          return NextResponse.json({ success: true, projectId: activeProjectId, status: 'processing', retryScheduled: true }, { status: 202 });
        }

        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
          { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
          { $set: { orchestrationStatus: 'failed', orchestrationError: message, updatedAt: new Date() }, $unset: { orchestrationLeaseUntil: '' } },
        );
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId: activeProjectId },
          // Assist lane surfaces scan_failed (refund already issued above) — never auto's 'failed'.
          { $set: { autoEditStatus: assistLaneActive ? 'scan_failed' : 'failed', autoEditError: message, updatedAt: new Date() } },
        );
      } catch (recoveryError) {
        console.error('[auto-edit/from-batch] orchestration recovery failed:', recoveryError);
      }
    } else if (activeProjectId) {
      try {
        const db = await getDatabase();
        if (caller && uploadBatchId) {
          await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
            { uploadBatchId, userId: caller.userId, projectId: activeProjectId },
            {
              $set: { orchestrationStatus: 'failed', orchestrationError: message, updatedAt: new Date() },
              $unset: { orchestrationLeaseUntil: '' },
            },
          );
        }
        await db.collection(COLLECTIONS.PROJECTS).updateOne(
          { projectId: activeProjectId },
          { $set: { autoEditStatus: 'failed', autoEditError: message, updatedAt: new Date() } },
        );
      } catch (statusError) {
        console.error('[auto-edit/from-batch] project failure status update failed:', statusError);
      }
    }

    console.error('[auto-edit/from-batch] failed:', message);
    const status = message === 'Unauthorized' || message.includes('signature')
      ? 401
      : message.includes('QSTASH_TOKEN') ? 503 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
