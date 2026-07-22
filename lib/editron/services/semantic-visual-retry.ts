import { ASSET_DEEP_ANALYSIS_VERSION } from './asset-deep-analysis';
import { DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT } from './media-upload-batch';

export interface SemanticVisualRetryAsset {
  assetId: string;
  analysisStatus?: string | null;
  deepAnalysisStatus?: string | null;
  deepAnalysisTargetVersion?: number | null;
  deepAnalysisRetryVersion?: number | null;
  deepAnalysisRetryCount?: number | null;
  durationSec?: number;
}

export interface SemanticVisualRetryOutcome {
  assetId: string;
  status: 'queued' | 'dispatch-failed' | 'claim-lost' | 'retry-exhausted';
  retryCount: number;
  error?: string;
}

type AssetCollection = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number }>;
};

export function buildDeepAnalysisFailureUpdate(message: string, completedAt: Date): Record<string, unknown> {
  return {
    $set: {
      analysisStatus: 'complete',
      deepAnalysisStatus: 'failed',
      deepAnalysisError: message.slice(0, 500),
      deepAnalysisCompletedAt: completedAt,
    },
    $unset: { analysisError: '', deepAnalysisTargetVersion: '' },
  };
}

export async function queueSemanticVisualRetries(params: {
  assets: readonly SemanticVisualRetryAsset[];
  userId: string;
  workerBaseUrl: string;
  qstashToken: string;
  qstashBaseUrl?: string;
  collection: AssetCollection;
  resolveMediaUrl(asset: SemanticVisualRetryAsset): Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<SemanticVisualRetryOutcome[]> {
  if (params.assets.length > 0 && !params.qstashToken.trim()) {
    throw new Error('QSTASH_TOKEN is required for durable semantic visual analysis');
  }
  const requiredVersion = ASSET_DEEP_ANALYSIS_VERSION;
  const retryLimit = DEFAULT_SEMANTIC_VISUAL_RETRY_LIMIT;
  const fetchImpl = params.fetchImpl ?? fetch;
  const outcomes: SemanticVisualRetryOutcome[] = [];

  for (const asset of params.assets) {
    const retriesUsed = asset.deepAnalysisRetryVersion === requiredVersion
      ? Math.max(0, Math.round(asset.deepAnalysisRetryCount ?? 0))
      : 0;
    if (retriesUsed >= retryLimit) {
      outcomes.push({ assetId: asset.assetId, status: 'retry-exhausted', retryCount: retriesUsed });
      continue;
    }

    const nextRetryCount = retriesUsed + 1;
    const claim = await params.collection.updateOne(
      {
        assetId: asset.assetId,
        userId: params.userId,
        type: 'video',
        deepAnalysisStatus: { $nin: ['queued', 'analyzing'] },
        deepAnalysisTargetVersion: { $ne: requiredVersion },
        $or: [
          { deepAnalysisRetryVersion: { $ne: requiredVersion } },
          {
            deepAnalysisRetryVersion: requiredVersion,
            deepAnalysisRetryCount: { $lt: retryLimit },
          },
        ],
      },
      {
        $set: {
          analysisStatus: 'analyzing',
          deepAnalysisStatus: 'queued',
          deepAnalysisTargetVersion: requiredVersion,
          deepAnalysisRetryVersion: requiredVersion,
          deepAnalysisRetryCount: nextRetryCount,
          deepAnalysisQueuedAt: new Date(),
        },
        $unset: { analysisError: '', deepAnalysisError: '' },
      },
    );
    if (claim.matchedCount === 0) {
      outcomes.push({ assetId: asset.assetId, status: 'claim-lost', retryCount: retriesUsed });
      continue;
    }

    let dispatchError: string | null = null;
    const url = await params.resolveMediaUrl(asset);
    if (!/^https?:\/\//i.test(url)) {
      dispatchError = 'Semantic visual analysis requires a resolvable HTTP media URL.';
    } else {
      const target = `${params.workerBaseUrl}/api/internal/workers/asset-deep-analysis`;
      try {
        const response = await fetchImpl(
          `${params.qstashBaseUrl || 'https://qstash.upstash.io'}/v2/publish/${target}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${params.qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '2',
              'Upstash-Timeout': '300s',
            },
            body: JSON.stringify({
              assetId: asset.assetId,
              userId: params.userId,
              url,
              duration: asset.durationSec,
            }),
          },
        );
        if (!response.ok) {
          const detail = await response.text().catch(() => 'no body');
          dispatchError = `Semantic visual analysis dispatch failed: HTTP ${response.status} - ${detail}`;
        }
      } catch (error) {
        dispatchError = `Semantic visual analysis dispatch failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    if (!dispatchError) {
      outcomes.push({ assetId: asset.assetId, status: 'queued', retryCount: nextRetryCount });
      continue;
    }

    await params.collection.updateOne(
      {
        assetId: asset.assetId,
        userId: params.userId,
        deepAnalysisStatus: 'queued',
        deepAnalysisTargetVersion: requiredVersion,
      },
      {
        $set: {
          analysisStatus: 'complete',
          deepAnalysisStatus: 'dispatch_failed',
          deepAnalysisError: dispatchError.slice(0, 500),
          deepAnalysisCompletedAt: new Date(),
        },
        $unset: { deepAnalysisTargetVersion: '' },
      },
    );
    outcomes.push({
      assetId: asset.assetId,
      status: 'dispatch-failed',
      retryCount: nextRetryCount,
      error: dispatchError,
    });
  }

  return outcomes;
}
