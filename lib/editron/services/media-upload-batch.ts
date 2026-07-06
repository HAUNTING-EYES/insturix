export const MEDIA_UPLOAD_BATCHES_COLLECTION = 'mediaUploadBatches';

export type MediaUploadBatchAssetType = 'video' | 'image' | 'audio';
export type MediaUploadAssetReadiness = 'uploaded' | 'queued' | 'analyzing' | 'ready' | 'failed' | 'skipped';
export type MediaUploadBatchReadiness = 'empty' | 'uploaded' | 'analyzing' | 'ready' | 'needs_attention';

export interface MediaUploadBatchAssetManifestInput {
  assetId: string;
  filename: string;
  type: MediaUploadBatchAssetType;
  size: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  thumbnail?: string;
}

export interface MediaUploadBatchAssetStatusInput extends MediaUploadBatchAssetManifestInput {
  analysisStatus?: string | null;
  analysisError?: string | null;
  analysisSkipReason?: string | null;
  analysisQueuedAt?: Date | string | null;
  analysisStartedAt?: Date | string | null;
  analysisCompletedAt?: Date | string | null;
  uploadedAt?: Date | string | null;
}

export interface MediaUploadBatchAssetStatus extends MediaUploadBatchAssetStatusInput {
  readiness: MediaUploadAssetReadiness;
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

export function buildMediaUploadBatchAssetUpsert(
  params: {
    uploadBatchId: string;
    userId: string;
    orgId?: string | null;
    projectId?: string | null;
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

export function resolveMediaUploadAssetReadiness(asset: MediaUploadBatchAssetStatusInput): MediaUploadBatchAssetStatus {
  const analysisStatus = asset.analysisStatus ?? null;
  let readiness: MediaUploadAssetReadiness = 'uploaded';
  let blockingReason: string | null = 'analysis_not_started';
  let needsAttention = false;

  if (analysisStatus === 'complete') {
    readiness = 'ready';
    blockingReason = null;
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

  return { ...asset, readiness, blockingReason, needsAttention };
}

export function buildMediaUploadBatchSummary(assets: MediaUploadBatchAssetStatusInput[]): MediaUploadBatchSummary {
  const resolvedAssets = assets.map(resolveMediaUploadAssetReadiness);
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
