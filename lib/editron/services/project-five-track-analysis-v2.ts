import type { ClipOverlay } from '@/components/editron/editor/version-7.0.0/types';

import type { MediaAsset } from './asset-resolver';
import {
  createAssetAnalysisSourceBindingV2,
  getSourceBoundAnalysisV2,
  type AssetAnalysisSourceBindingV2,
} from './asset-analysis-source-cache-v2';
import {
  createFiveTrackAnalysisInputSha256V2,
  runFullAnalysis,
  type AssetAnalysis,
  type FullAnalysisOptions,
} from './five-track-analysis';
import type { PipelineWarningCollector } from './pipeline-warnings';
import type { Project } from './project-service';
import type {
  MediaSourceVersionEvidenceScopeV1,
  MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  resolveProjectSelectedVideoSourceTimeBindingV1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
}
  from './project-selected-video-source-time-binding-v1';
import {
  classifyVerifiedVideoSourceEpochRateCompatibilityV3,
} from './video-source-time-transform-v1';

const PROJECT_FIVE_TRACK_ANALYSIS_CONTRACT_V2 =
  'EDITRON_PROJECT_FIVE_TRACK_ANALYSIS_V2' as const;

type ProjectFiveTrackAnalysisModeV2 = 'FULL' | 'CACHE_ONLY';

type SelectedSourceTimeBlockReasonV1 = Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
>['reason'];

type ProjectFiveTrackAnalysisBlockReasonV2 =
  | 'OVERLAY_ASSET_ID_REQUIRED'
  | 'ASSET_NOT_FOUND'
  | `SELECTED_SOURCE_TIME_${SelectedSourceTimeBlockReasonV1}`
  | 'SELECTED_SOURCE_URL_UNAVAILABLE'
  | 'FIVE_TRACK_SOURCE_RATE_UNSUPPORTED'
  | 'SOURCE_FRAME_COUNT_INVALID'
  | 'ANALYSIS_CACHE_MISS'
  | 'ANALYSIS_EXECUTION_FAILED'
  | 'TIME_BUDGET_EXCEEDED';

type ProjectFiveTrackTimelineBlockReasonV2 =
  | 'ANALYSIS_UNAVAILABLE'
  | 'PROJECT_30FPS_CONSUMER_REQUIRED'
  | 'EXPLICIT_SOURCE_RANGE_REQUIRED'
  | 'FULL_SOURCE_RANGE_REQUIRED'
  | 'NORMAL_SPEED_REQUIRED'
  | 'SINGLE_OVERLAY_SOURCE_REQUIRED';

type ProjectFiveTrackOverlayResultV2 = Readonly<{
  overlayId: number;
  assetId: string | null;
  analysis: AssetAnalysis | null;
  analysisDisposition: 'ANALYZED' | 'CACHED' | 'UNAVAILABLE';
  analysisBlockReason: ProjectFiveTrackAnalysisBlockReasonV2 | null;
  timelineAdmission: Readonly<
    | { disposition: 'ADMITTED'; timelineOffsetFrames: number }
    | {
        disposition: 'BLOCKED';
        reason: ProjectFiveTrackTimelineBlockReasonV2;
      }
  >;
}>;

type ProjectFiveTrackAnalysisResultV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof PROJECT_FIVE_TRACK_ANALYSIS_CONTRACT_V2;
  projectId: string;
  projectRevision: number;
  mode: ProjectFiveTrackAnalysisModeV2;
  analyzed: number;
  cached: number;
  failed: number;
  timedOut: boolean;
  overlays: readonly ProjectFiveTrackOverlayResultV2[];
}>;

type AnalysisAssetV2 = MediaAsset
  & Parameters<typeof resolveProjectSelectedVideoSourceTimeBindingV1>[0]['asset'];

type PreparedOverlayV2 = Readonly<{
  overlay: ClipOverlay;
  assetId: string;
  totalSourceFrameCount: number;
  sourceBinding: AssetAnalysisSourceBindingV2;
  options: FullAnalysisOptions & Readonly<{
    sourceBindingV2: AssetAnalysisSourceBindingV2;
  }>;
}>;

export type ProjectFiveTrackAnalysisPortsV2 = Readonly<{
  loadAssets(assetIds: readonly string[]): Promise<readonly AnalysisAssetV2[]>;
  loadSourceVersionEvidence(
    scope: MediaSourceVersionEvidenceScopeV1,
  ): Promise<unknown | null>;
  readAnalysis(binding: AssetAnalysisSourceBindingV2): Promise<AssetAnalysis | null>;
  runAnalysis(input: Readonly<{
    assetId: string;
    userId: string;
    options: FullAnalysisOptions;
    pipelineWarnings?: PipelineWarningCollector;
  }>): Promise<AssetAnalysis>;
  nowMs(): number;
}>;

export async function analyzeProjectFiveTrackV2(input: Readonly<{
  project: Project;
  userId: string;
  mode: ProjectFiveTrackAnalysisModeV2;
  timeBudgetMs?: number;
  pipelineWarnings?: PipelineWarningCollector;
  ports?: ProjectFiveTrackAnalysisPortsV2;
}>): Promise<ProjectFiveTrackAnalysisResultV2> {
  const projectId = input.project.projectId;
  const projectRevision = safeRevision(input.project.projectRevision);
  const timeBudgetMs = positiveBudget(input.timeBudgetMs ?? 120_000);
  const ports = input.ports ?? createMongoPorts();
  const startedAt = ports.nowMs();
  const videoOverlays = input.project.overlays.filter(
    (overlay): overlay is ClipOverlay => overlay.type === 'video',
  );
  const assetIds = Array.from(new Set(videoOverlays.flatMap(
    (overlay) => typeof overlay.assetId === 'string' && overlay.assetId.trim()
      ? [overlay.assetId.trim()]
      : [],
  )));
  const assets = new Map(
    (await ports.loadAssets(assetIds)).map((asset) => [asset.assetId, asset]),
  );
  const prepared = new Map<number, PreparedOverlayV2>();
  const blocked = new Map<number, ProjectFiveTrackAnalysisBlockReasonV2>();

  for (const overlay of videoOverlays) {
    const result = await prepareOverlay({
      project: input.project,
      userId: input.userId,
      overlay,
      assets,
      loadSourceVersionEvidence: ports.loadSourceVersionEvidence,
    });
    if ('reason' in result) blocked.set(overlay.id, result.reason);
    else prepared.set(overlay.id, result);
  }

  const sourceUseCount = new Map<string, number>();
  for (const candidate of prepared.values()) {
    const key = candidate.sourceBinding.bindingSha256;
    sourceUseCount.set(key, (sourceUseCount.get(key) ?? 0) + 1);
  }

  const analyses = new Map<string, Readonly<{
    analysis: AssetAnalysis;
    disposition: 'ANALYZED' | 'CACHED';
  }>>();
  let analyzed = 0;
  let cached = 0;
  let failed = 0;
  let timedOut = false;

  for (const candidate of uniqueSources(prepared.values())) {
    if (ports.nowMs() - startedAt > timeBudgetMs) {
      timedOut = true;
      blocked.set(candidate.overlay.id, 'TIME_BUDGET_EXCEEDED');
      continue;
    }
    try {
      const existing = await ports.readAnalysis(candidate.sourceBinding);
      if (existing) {
        analyses.set(candidate.sourceBinding.bindingSha256, {
          analysis: existing,
          disposition: 'CACHED',
        });
        cached += 1;
        continue;
      }
      if (input.mode === 'CACHE_ONLY') {
        blocked.set(candidate.overlay.id, 'ANALYSIS_CACHE_MISS');
        continue;
      }
      const analysis = await ports.runAnalysis({
        assetId: candidate.assetId,
        userId: input.userId,
        options: candidate.options,
        ...(input.pipelineWarnings
          ? { pipelineWarnings: input.pipelineWarnings }
          : {}),
      });
      analyses.set(candidate.sourceBinding.bindingSha256, {
        analysis,
        disposition: 'ANALYZED',
      });
      analyzed += 1;
    } catch (error) {
      failed += 1;
      blocked.set(candidate.overlay.id, 'ANALYSIS_EXECUTION_FAILED');
      input.pipelineWarnings?.errorSwallowed(
        'analysis',
        error instanceof Error ? error : new Error(String(error)),
        `source-bound project analysis ${candidate.assetId}`,
      );
    }
  }

  const overlayResults = videoOverlays.map((overlay) => {
    const candidate = prepared.get(overlay.id);
    const sourceAnalysis = candidate
      ? analyses.get(candidate.sourceBinding.bindingSha256)
      : undefined;
    const analysisBlockReason = candidate && !sourceAnalysis
      ? blocked.get(candidate.overlay.id) ?? 'ANALYSIS_CACHE_MISS'
      : blocked.get(overlay.id) ?? null;
    const timelineAdmission = candidate && sourceAnalysis
      ? admitTimeline({
          project: input.project,
          candidate,
          sourceUseCount: sourceUseCount.get(
            candidate.sourceBinding.bindingSha256,
          ) ?? 0,
        })
      : { disposition: 'BLOCKED' as const, reason: 'ANALYSIS_UNAVAILABLE' as const };
    return Object.freeze({
      overlayId: overlay.id,
      assetId: typeof overlay.assetId === 'string' ? overlay.assetId : null,
      analysis: sourceAnalysis?.analysis ?? null,
      analysisDisposition: sourceAnalysis?.disposition ?? 'UNAVAILABLE',
      analysisBlockReason,
      timelineAdmission,
    });
  });

  return Object.freeze({
    schemaVersion: 2 as const,
    kind: PROJECT_FIVE_TRACK_ANALYSIS_CONTRACT_V2,
    projectId,
    projectRevision,
    mode: input.mode,
    analyzed,
    cached,
    failed,
    timedOut,
    overlays: Object.freeze(overlayResults),
  });
}

async function prepareOverlay(input: Readonly<{
  project: Project;
  userId: string;
  overlay: ClipOverlay;
  assets: ReadonlyMap<string, AnalysisAssetV2>;
  loadSourceVersionEvidence:
    ProjectFiveTrackAnalysisPortsV2['loadSourceVersionEvidence'];
}>): Promise<
  PreparedOverlayV2
  | Readonly<{ reason: ProjectFiveTrackAnalysisBlockReasonV2 }>
> {
  const assetId = typeof input.overlay.assetId === 'string'
    ? input.overlay.assetId.trim()
    : '';
  if (!assetId) return { reason: 'OVERLAY_ASSET_ID_REQUIRED' };
  const asset = input.assets.get(assetId);
  if (!asset) return { reason: 'ASSET_NOT_FOUND' };
  const selected = await resolveProjectSelectedVideoSourceTimeBindingV1({
    projectId: input.project.projectId,
    overlayId: input.overlay.id,
    assetId,
    sourcePin: input.overlay.sourceVersionPinV1,
    asset,
    ports: {
      loadSourceVersionEvidence: input.loadSourceVersionEvidence,
    },
  });
  if (selected.disposition === 'UNVERIFIABLE') {
    return { reason: `SELECTED_SOURCE_TIME_${selected.reason}` };
  }
  const videoUrl = exactHttpUrl(input.overlay.src ?? input.overlay.content);
  if (!videoUrl) return { reason: 'SELECTED_SOURCE_URL_UNAVAILABLE' };
  const timing = selected.binding;
  const compatibility = classifyVerifiedVideoSourceEpochRateCompatibilityV3(
    timing,
    30,
  );
  if (compatibility.disposition !== 'COMPATIBLE_SAME_RATE_CFR') {
    return { reason: 'FIVE_TRACK_SOURCE_RATE_UNSUPPORTED' };
  }
  const totalSourceFrameCount = safeFrameCount(timing.totalSourceFrameCount);
  if (totalSourceFrameCount === null) {
    return { reason: 'SOURCE_FRAME_COUNT_INVALID' };
  }
  const baseOptions = {
    videoUrl,
    durationMs: totalSourceFrameCount / 30 * 1000,
    sourceType: 'real-footage' as const,
  };
  const sourceBinding = createAssetAnalysisSourceBindingV2({
    userId: input.userId,
    assetId,
    sourceRole: selected.sourceRole,
    sourceVersionSha256: timing.sourceVersionSha256,
    storageVersionSha256: timing.storageVersionSha256,
    analysisInputSha256: createFiveTrackAnalysisInputSha256V2(baseOptions),
  });
  return Object.freeze({
    overlay: input.overlay,
    assetId,
    totalSourceFrameCount,
    sourceBinding,
    options: Object.freeze({ ...baseOptions, sourceBindingV2: sourceBinding }),
  });
}

function admitTimeline(input: Readonly<{
  project: Project;
  candidate: PreparedOverlayV2;
  sourceUseCount: number;
}>): ProjectFiveTrackOverlayResultV2['timelineAdmission'] {
  const { overlay, totalSourceFrameCount } = input.candidate;
  if (input.project.fps !== 30) {
    return { disposition: 'BLOCKED', reason: 'PROJECT_30FPS_CONSUMER_REQUIRED' };
  }
  if (overlay.sourceStartFrame === undefined
    || overlay.sourceEndFrame === undefined
    || (overlay.videoStartTime !== undefined
      && overlay.videoStartTime !== overlay.sourceStartFrame)) {
    return { disposition: 'BLOCKED', reason: 'EXPLICIT_SOURCE_RANGE_REQUIRED' };
  }
  if (overlay.sourceStartFrame !== 0
    || overlay.sourceEndFrame !== totalSourceFrameCount
    || overlay.durationInFrames !== totalSourceFrameCount) {
    return { disposition: 'BLOCKED', reason: 'FULL_SOURCE_RANGE_REQUIRED' };
  }
  if ((overlay.speed !== undefined && overlay.speed !== 1)
    || (overlay.speedCurve?.length ?? 0) > 0) {
    return { disposition: 'BLOCKED', reason: 'NORMAL_SPEED_REQUIRED' };
  }
  if (input.sourceUseCount !== 1) {
    return { disposition: 'BLOCKED', reason: 'SINGLE_OVERLAY_SOURCE_REQUIRED' };
  }
  return { disposition: 'ADMITTED', timelineOffsetFrames: overlay.from };
}

function uniqueSources(
  candidates: Iterable<PreparedOverlayV2>,
): readonly PreparedOverlayV2[] {
  const unique = new Map<string, PreparedOverlayV2>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.sourceBinding.bindingSha256)) {
      unique.set(candidate.sourceBinding.bindingSha256, candidate);
    }
  }
  return Array.from(unique.values());
}

function createMongoPorts(): ProjectFiveTrackAnalysisPortsV2 {
  let evidenceStorePromise:
    Promise<MediaSourceVersionEvidenceStorePortsV1> | null = null;
  return {
    async loadAssets(assetIds) {
      if (assetIds.length === 0) return [];
      const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
      const db = await getDatabase();
      return db.collection(COLLECTIONS.MEDIA_ASSETS).find({
        assetId: { $in: [...assetIds] },
      }).toArray() as unknown as AnalysisAssetV2[];
    },
    async loadSourceVersionEvidence(scope) {
      evidenceStorePromise ??= import(
        './media-source-version-evidence-mongo-store-v1'
      ).then(({ createMediaSourceVersionEvidenceMongoStorePortsV1 }) =>
        createMediaSourceVersionEvidenceMongoStorePortsV1());
      return (await evidenceStorePromise).load(scope);
    },
    readAnalysis: getSourceBoundAnalysisV2<AssetAnalysis>,
    runAnalysis: ({ assetId, userId, options, pipelineWarnings }) =>
      runFullAnalysis(assetId, userId, options, pipelineWarnings),
    nowMs: () => Date.now(),
  };
}

function exactHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function safeFrameCount(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

function safeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('PROJECT_FIVE_TRACK_REVISION_INVALID');
  }
  return value as number;
}

function positiveBudget(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('PROJECT_FIVE_TRACK_TIME_BUDGET_INVALID');
  }
  return value;
}
