const DEFAULT_FULL_VIDEO_ASSET_ANALYSIS_MAX_SECONDS = 120;
const DEFAULT_ASSET_ANALYSIS_LOCK_STALE_MS = 10 * 60 * 1000;

export type AssetAnalysisMediaType = "video" | "audio" | "image";
export type AssetAnalysisPolicyEnv = Record<string, string | undefined>;

export interface AssetVideoAnalysisPolicy {
  shouldRunFullAnalysis: boolean;
  reason: "within-worker-budget" | "non-video" | "duration-over-serverless-ingest-budget";
  maxDurationSeconds: number;
  durationSeconds: number | null;
}

export function readFullVideoAssetAnalysisMaxSeconds(
  env: AssetAnalysisPolicyEnv = process.env,
): number {
  const parsed = Number(env.EDITRON_ASSET_ANALYSIS_FULL_VIDEO_MAX_SECONDS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_FULL_VIDEO_ASSET_ANALYSIS_MAX_SECONDS;
}

export function resolveAssetVideoAnalysisPolicy(input: {
  type: AssetAnalysisMediaType;
  durationSeconds?: number;
  env?: AssetAnalysisPolicyEnv;
}): AssetVideoAnalysisPolicy {
  const maxDurationSeconds = readFullVideoAssetAnalysisMaxSeconds(input.env);
  const durationSeconds = Number.isFinite(input.durationSeconds)
    ? Math.max(0, Number(input.durationSeconds))
    : null;

  if (input.type !== "video") {
    return {
      shouldRunFullAnalysis: false,
      reason: "non-video",
      maxDurationSeconds,
      durationSeconds,
    };
  }

  if (durationSeconds !== null && durationSeconds > maxDurationSeconds) {
    return {
      shouldRunFullAnalysis: false,
      reason: "duration-over-serverless-ingest-budget",
      maxDurationSeconds,
      durationSeconds,
    };
  }

  return {
    shouldRunFullAnalysis: true,
    reason: "within-worker-budget",
    maxDurationSeconds,
    durationSeconds,
  };
}

export function buildAssetAnalysisClaimFilter(args: {
  assetId: string;
  userId: string;
  now?: Date;
  staleMs?: number;
}): Record<string, unknown> {
  const now = args.now ?? new Date();
  const staleMs = args.staleMs ?? DEFAULT_ASSET_ANALYSIS_LOCK_STALE_MS;
  const staleBefore = new Date(now.getTime() - staleMs);

  return {
    assetId: args.assetId,
    userId: args.userId,
    $or: [
      { analysisStatus: { $exists: false } },
      { analysisStatus: null },
      { analysisStatus: { $in: ["queued", "failed", "dispatch_failed"] } },
      { analysisStatus: "analyzing", analysisStartedAt: { $lt: staleBefore } },
    ],
  };
}

export function buildAssetAnalysisClaimUpdate(now: Date = new Date()): Record<string, unknown> {
  return {
    $set: {
      analysisStatus: "analyzing",
      analysisStartedAt: now,
      analysisWorker: "asset-analysis",
    },
    $unset: {
      analysisError: "",
    },
  };
}
