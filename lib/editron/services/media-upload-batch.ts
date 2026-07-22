import {
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';

export const MEDIA_UPLOAD_BATCHES_COLLECTION = 'mediaUploadBatches';

export type MediaUploadBatchAssetType = 'video' | 'image' | 'audio';
export type MediaUploadAssetReadiness = 'uploaded' | 'queued' | 'analyzing' | 'ready' | 'failed' | 'skipped';
export type MediaUploadBatchReadiness = 'empty' | 'uploaded' | 'analyzing' | 'ready' | 'needs_attention';
export type SemanticVisualReadiness = 'not-required' | 'ready' | 'pending' | 'retryable' | 'failed';

export const DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT = 2;

export interface MediaUploadAnalysisRequirements {
  semanticVisual?: {
    version: number;
    maxRetries?: number;
  };
}

export interface MediaUploadBatchAssetManifestInput {
  assetId: string;
  filename: string;
  type: MediaUploadBatchAssetType;
  size: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  thumbnail?: string;
}

export interface MediaUploadBatchIntake {
  aspectRatio?: string;
  platform?: string;
  userIntent?: string;
  script?: string;
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
  editorialPreferences?: EditorialPreferences;
}

export interface MediaUploadBatchAssetStatusInput extends MediaUploadBatchAssetManifestInput {
  analysisStatus?: string | null;
  analysisError?: string | null;
  analysisSkipReason?: string | null;
  analysisQueuedAt?: Date | string | null;
  analysisStartedAt?: Date | string | null;
  analysisCompletedAt?: Date | string | null;
  uploadedAt?: Date | string | null;
  deepAnalysisStatus?: string | null;
  deepAnalysisVersion?: number | null;
  deepAnalysisTargetVersion?: number | null;
  deepAnalysisRetryVersion?: number | null;
  deepAnalysisRetryCount?: number | null;
  deepAnalysisDiagnostics?: {
    semanticVisualWindowCount?: number | null;
    providers?: { semanticVisual?: string | null } | null;
  } | null;
}

export interface MediaUploadBatchAssetStatus extends MediaUploadBatchAssetStatusInput {
  readiness: MediaUploadAssetReadiness;
  semanticVisualReadiness: SemanticVisualReadiness;
  blockingReason: string | null;
  needsAttention: boolean;
}

export interface MediaUploadBatchSummary {
  status: MediaUploadBatchReadiness;
  canCreateProject: boolean;
  counts: Record<MediaUploadAssetReadiness, number> & { total: number };
  assets: MediaUploadBatchAssetStatus[];
}

type MediaUploadBatchDb = {
  collection(name: string): {
    updateOne(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options: { upsert: true },
    ): Promise<unknown>;
  };
};

export function normalizeUploadBatchId(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 128);
  if (!cleaned) throw new Error('uploadBatchId is required');
  return cleaned;
}

export function encodeUploadBatchAssetKey(assetId: string): string {
  const trimmed = assetId.trim();
  if (!trimmed) throw new Error('assetId is required for upload batch manifest');
  return Buffer.from(trimmed, 'utf8').toString('base64url');
}

const INTAKE_TEXT_LIMITS: Record<Exclude<keyof MediaUploadBatchIntake, 'editorialPreferences'>, number> = {
  aspectRatio: 64,
  platform: 64,
  userIntent: 4000,
  script: 12000,
  captionStyle: 128,
  transitionPreference: 128,
  zoomBehavior: 128,
  motionGraphics: 128,
  pacingFeel: 128,
  musicPreference: 512,
};

export function normalizeMediaUploadBatchIntake(raw: unknown): MediaUploadBatchIntake | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const source = raw as Partial<Record<keyof MediaUploadBatchIntake, unknown>>;
  const normalized: MediaUploadBatchIntake = {};
  for (const [key, limit] of Object.entries(INTAKE_TEXT_LIMITS) as Array<[Exclude<keyof MediaUploadBatchIntake, 'editorialPreferences'>, number]>) {
    const value = source[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[key] = trimmed.slice(0, limit);
  }

  const editorialPreferences = normalizeEditorialPreferences(source.editorialPreferences);
  if (editorialPreferences) normalized.editorialPreferences = editorialPreferences;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function buildMediaUploadBatchAssetUpsert(
  params: {
    uploadBatchId: string;
    userId: string;
    orgId?: string | null;
    projectId?: string | null;
    intake?: unknown;
    asset: MediaUploadBatchAssetManifestInput;
  },
  now: Date,
): {
  filter: { uploadBatchId: string; userId: string };
  update: {
    $set: Record<string, unknown>;
    $setOnInsert: { createdAt: Date };
    $addToSet: { assetIds: string };
  };
  options: { upsert: true };
} {
  const uploadBatchId = normalizeUploadBatchId(params.uploadBatchId);
  const userId = params.userId.trim();
  if (!userId) throw new Error('userId is required for upload batch manifest');

  const assetId = params.asset.assetId.trim();
  const assetKey = encodeUploadBatchAssetKey(assetId);
  const assetEntry = {
    assetId,
    filename: params.asset.filename,
    type: params.asset.type,
    size: params.asset.size,
    duration: params.asset.duration,
    dimensions: params.asset.dimensions,
    thumbnail: params.asset.thumbnail,
    registeredAt: now,
    updatedAt: now,
  };

  const set: Record<string, unknown> = {
    uploadBatchId,
    userId,
    updatedAt: now,
    [`assetsById.${assetKey}`]: assetEntry,
    [`assetIndex.${assetKey}`]: { assetId, updatedAt: now },
  };

  if (params.orgId) set.orgId = params.orgId;
  if (params.projectId) set.projectId = params.projectId;

  const intake = normalizeMediaUploadBatchIntake(params.intake);
  if (intake) set.productionBriefIntake = intake;

  return {
    filter: { uploadBatchId, userId },
    update: {
      $set: set,
      $setOnInsert: { createdAt: now },
      $addToSet: { assetIds: assetId },
    },
    options: { upsert: true },
  };
}

export async function persistMediaUploadBatchAsset(
  db: MediaUploadBatchDb,
  params: Parameters<typeof buildMediaUploadBatchAssetUpsert>[0],
  now: Date = new Date(),
): Promise<void> {
  const write = buildMediaUploadBatchAssetUpsert(params, now);
  await db.collection(MEDIA_UPLOAD_BATCHES_COLLECTION).updateOne(
    write.filter,
    write.update,
    write.options,
  );
}

function semanticVisualReadiness(
  asset: MediaUploadBatchAssetStatusInput,
  requirements?: MediaUploadAnalysisRequirements,
): SemanticVisualReadiness {
  const requirement = requirements?.semanticVisual;
  if (!requirement || asset.type !== 'video') return 'not-required';

  const requiredVersion = Math.max(1, Math.round(requirement.version));
  const retryLimit = Math.max(
    0,
    Math.round(requirement.maxRetries ?? DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT),
  );
  const deepStatus = asset.deepAnalysisStatus ?? null;
  const semanticWindowCount = Math.max(
    0,
    Math.round(asset.deepAnalysisDiagnostics?.semanticVisualWindowCount ?? 0),
  );
  const semanticProvider = asset.deepAnalysisDiagnostics?.providers?.semanticVisual ?? null;

  if (deepStatus === 'queued' || deepStatus === 'analyzing') return 'pending';
  if (
    asset.deepAnalysisVersion === requiredVersion
    && semanticProvider === 'complete'
    && semanticWindowCount > 0
  ) {
    return 'ready';
  }

  const retriesUsed = asset.deepAnalysisRetryVersion === requiredVersion
    ? Math.max(0, Math.round(asset.deepAnalysisRetryCount ?? 0))
    : 0;
  return retriesUsed < retryLimit ? 'retryable' : 'failed';
}

export function resolveMediaUploadAssetReadiness(
  asset: MediaUploadBatchAssetStatusInput,
  requirements?: MediaUploadAnalysisRequirements,
): MediaUploadBatchAssetStatus {
  const analysisStatus = asset.analysisStatus ?? null;
  const semanticReadiness = semanticVisualReadiness(asset, requirements);
  let readiness: MediaUploadAssetReadiness = 'uploaded';
  let blockingReason: string | null = 'analysis_not_started';
  let needsAttention = false;

  if (analysisStatus === 'complete') {
    if (semanticReadiness === 'pending') {
      readiness = asset.deepAnalysisStatus === 'analyzing' ? 'analyzing' : 'queued';
      blockingReason = 'semantic_visual_analysis_running';
    } else if (semanticReadiness === 'retryable') {
      readiness = 'queued';
      blockingReason = 'semantic_visual_analysis_required';
    } else if (semanticReadiness === 'failed') {
      readiness = 'failed';
      blockingReason = 'semantic_visual_analysis_unavailable';
      needsAttention = true;
    } else {
      readiness = 'ready';
      blockingReason = null;
    }
  } else if (analysisStatus === 'queued') {
    readiness = 'queued';
    blockingReason = 'analysis_queued';
  } else if (analysisStatus === 'analyzing') {
    readiness = 'analyzing';
    blockingReason = 'analysis_running';
  } else if (analysisStatus === 'failed' || analysisStatus === 'dispatch_failed') {
    readiness = 'failed';
    blockingReason = asset.analysisError || analysisStatus;
    needsAttention = true;
  } else if (typeof analysisStatus === 'string' && analysisStatus.startsWith('skipped_')) {
    readiness = 'skipped';
    blockingReason = asset.analysisSkipReason || analysisStatus;
    needsAttention = true;
  }

  return {
    ...asset,
    readiness,
    semanticVisualReadiness: semanticReadiness,
    blockingReason,
    needsAttention,
  };
}

export function buildMediaUploadBatchSummary(
  assets: MediaUploadBatchAssetStatusInput[],
  requirements?: MediaUploadAnalysisRequirements,
): MediaUploadBatchSummary {
  const resolvedAssets = assets.map((asset) => resolveMediaUploadAssetReadiness(asset, requirements));
  const counts: MediaUploadBatchSummary['counts'] = {
    total: resolvedAssets.length,
    uploaded: 0,
    queued: 0,
    analyzing: 0,
    ready: 0,
    failed: 0,
    skipped: 0,
  };

  for (const asset of resolvedAssets) {
    counts[asset.readiness] += 1;
  }

  const inProgress = counts.uploaded + counts.queued + counts.analyzing;
  const attention = counts.failed + counts.skipped;
  const canCreateProject = counts.ready > 0 && inProgress === 0;

  let status: MediaUploadBatchReadiness;
  if (counts.total === 0) status = 'empty';
  else if (inProgress > 0) status = counts.queued + counts.analyzing > 0 ? 'analyzing' : 'uploaded';
  else if (attention > 0) status = 'needs_attention';
  else status = 'ready';

  return {
    status,
    canCreateProject,
    counts,
    assets: resolvedAssets,
  };
}
