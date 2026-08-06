import type {
  Wav2VecAnalysisResult,
  Wav2VecSegmentInput,
} from './wav2vec-service';

type CollectionLike = {
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
};

type DatabaseLike = {
  collection(name: string): CollectionLike;
};

export type CanonicalWav2VecProvenance =
  | 'direct-no-asset'
  | 'canonical-reuse'
  | 'canonical-extended'
  | 'canonical-created'
  | 'owner-pending-timeout'
  | 'provider-failed';

export interface CanonicalWav2VecResolution {
  analysis: Wav2VecAnalysisResult | null;
  provenance: CanonicalWav2VecProvenance;
  providerInvoked: boolean;
  providerProcessingTimeMs: number;
  waitedMs: number;
  requestedSegmentCount: number;
  analyzedSegmentCount: number;
  uncoveredSegmentCount: number;
}

interface ResolveCanonicalWav2VecArgs {
  db: DatabaseLike;
  assetId: string | null;
  userId: string;
  audioUrl: string;
  segments: Wav2VecSegmentInput[];
  analyze(audioUrl: string, segments: Wav2VecSegmentInput[]): Promise<Wav2VecAnalysisResult | null>;
  waitMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_OWNER_WAIT_MS = 330_000;
const MAX_OWNER_WAIT_MS = 330_000;
const DEFAULT_POLL_MS = 2_000;
const ACTIVE_OWNER_STALE_MS = 5 * 60 * 1000;

function overlaps(left: Wav2VecSegmentInput, right: Wav2VecSegmentInput): boolean {
  return Math.max(left.startMs, right.startMs) < Math.min(left.endMs, right.endMs);
}

function uncoveredWindows(
  requested: Wav2VecSegmentInput[],
  existing: Wav2VecAnalysisResult | null,
): Wav2VecSegmentInput[] {
  if (!existing?.segments.length) return requested;
  return requested.filter((window) =>
    !existing.segments.some((segment) => overlaps(window, segment)),
  );
}

function mergeAnalyses(
  existing: Wav2VecAnalysisResult | null,
  added: Wav2VecAnalysisResult,
): Wav2VecAnalysisResult {
  const byWindow = new Map<string, Wav2VecAnalysisResult['segments'][number]>();
  for (const segment of [...(existing?.segments ?? []), ...added.segments]) {
    byWindow.set(`${segment.startMs}-${segment.endMs}`, segment);
  }
  return {
    segments: [...byWindow.values()].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs),
    modelVersion: added.modelVersion || existing?.modelVersion || 'wav2vec-2.0',
    processingTimeMs: (existing?.processingTimeMs ?? 0) + added.processingTimeMs,
  };
}

function resolveWaitMs(value: number | undefined): number {
  if (Number.isFinite(value)) return Math.max(0, Math.min(MAX_OWNER_WAIT_MS, Math.round(value!)));
  const configured = Number(process.env.EDITRON_WAV2VEC_OWNER_WAIT_MS);
  if (Number.isFinite(configured)) return Math.max(0, Math.min(MAX_OWNER_WAIT_MS, Math.round(configured)));
  return DEFAULT_OWNER_WAIT_MS;
}

function isOwnerActive(mediaAsset: any, nowMs: number): boolean {
  if (!['queued', 'analyzing'].includes(mediaAsset?.deepAnalysisStatus)) return false;
  const startedAt = new Date(mediaAsset.deepAnalysisStartedAt ?? mediaAsset.deepAnalysisQueuedAt ?? 0).getTime();
  return !Number.isFinite(startedAt) || startedAt <= 0 || nowMs - startedAt < ACTIVE_OWNER_STALE_MS;
}

export async function resolveCanonicalWav2VecAnalysis(
  args: ResolveCanonicalWav2VecArgs,
): Promise<CanonicalWav2VecResolution> {
  const requestedSegmentCount = args.segments.length;
  const startedAt = (args.now ?? Date.now)();
  const direct = async (windows: Wav2VecSegmentInput[], existing: Wav2VecAnalysisResult | null) => {
    const added = await args.analyze(args.audioUrl, windows);
    if (!added) {
      return {
        analysis: existing,
        provenance: 'provider-failed' as const,
        providerInvoked: true,
        providerProcessingTimeMs: 0,
        waitedMs: (args.now ?? Date.now)() - startedAt,
        requestedSegmentCount,
        analyzedSegmentCount: existing?.segments.length ?? 0,
        uncoveredSegmentCount: windows.length,
      };
    }
    const analysis = mergeAnalyses(existing, added);
    if (args.assetId) {
      await args.db.collection('asset_analyses').updateOne(
        { assetId: args.assetId, userId: args.userId },
        {
          $set: {
            assetId: args.assetId,
            userId: args.userId,
            wav2vecAnalysis: analysis,
            wav2vecAnalysisUpdatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    }
    return {
      analysis,
      provenance: existing ? 'canonical-extended' as const : args.assetId
        ? 'canonical-created' as const
        : 'direct-no-asset' as const,
      providerInvoked: true,
      providerProcessingTimeMs: added.processingTimeMs,
      waitedMs: (args.now ?? Date.now)() - startedAt,
      requestedSegmentCount,
      analyzedSegmentCount: analysis.segments.length,
      uncoveredSegmentCount: windows.length,
    };
  };

  if (!args.assetId) return direct(args.segments, null);

  const waitMs = resolveWaitMs(args.waitMs);
  const pollMs = Math.max(1, Math.round(args.pollMs ?? DEFAULT_POLL_MS));
  const now = args.now ?? Date.now;
  const sleep = args.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let canonical: Wav2VecAnalysisResult | null = null;

  while (true) {
    const analysisDoc = await args.db.collection('asset_analyses').findOne(
      { assetId: args.assetId, userId: args.userId },
      { projection: { wav2vecAnalysis: 1 } },
    );
    canonical = analysisDoc?.wav2vecAnalysis?.segments?.length
      ? analysisDoc.wav2vecAnalysis as Wav2VecAnalysisResult
      : null;
    const missing = uncoveredWindows(args.segments, canonical);
    if (missing.length === 0 && canonical) {
      return {
        analysis: canonical,
        provenance: 'canonical-reuse',
        providerInvoked: false,
        providerProcessingTimeMs: 0,
        waitedMs: now() - startedAt,
        requestedSegmentCount,
        analyzedSegmentCount: canonical.segments.length,
        uncoveredSegmentCount: 0,
      };
    }

    const mediaAsset = await args.db.collection('media_assets').findOne(
      { assetId: args.assetId, userId: args.userId },
      { projection: { deepAnalysisStatus: 1, deepAnalysisStartedAt: 1, deepAnalysisQueuedAt: 1 } },
    );
    if (!isOwnerActive(mediaAsset, now())) return direct(missing, canonical);
    if (now() - startedAt >= waitMs) {
      return {
        analysis: canonical,
        provenance: 'owner-pending-timeout',
        providerInvoked: false,
        providerProcessingTimeMs: 0,
        waitedMs: now() - startedAt,
        requestedSegmentCount,
        analyzedSegmentCount: canonical?.segments.length ?? 0,
        uncoveredSegmentCount: missing.length,
      };
    }
    await sleep(Math.min(pollMs, Math.max(1, waitMs - (now() - startedAt))));
  }
}
