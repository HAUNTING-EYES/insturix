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
import type { Project, ProjectRevisionV1 } from './project-service';
import type {
  MediaSourceVersionEvidenceScopeV1,
  MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from './media-source-audio-private-artifact-port-v1';
import type { MediaSourceAudioPrivateArtifactStoreV1 }
  from './media-source-audio-r2-private-artifact-v1';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import { ensureProjectSourceMediaRightsFromLegacyAttestationV1 }
  from './project-source-media-rights-legacy-migration-v1';
import {
  resolveProjectSelectedSourceAudioEvidenceV1,
  type ProjectSelectedSourceAudioEvidenceResultV1,
} from './project-selected-source-audio-evidence-v1';
import {
  resolveProjectSelectedVideoSourceTimeBindingV1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
}
  from './project-selected-video-source-time-binding-v1';
import {
  analyzeProjectTimestampVideoV1,
  type ProjectTimestampVideoAnalysisPortsV1,
  type ProjectTimestampVideoAnalysisResultV1,
} from './project-timestamp-video-analysis-v1';
import {
  classifyVerifiedVideoSourceEpochRateCompatibilityV3,
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
} from './video-source-time-transform-v1';
import {
  authorizeCurrentSourceMediaRightsV1,
  type SourceMediaRightsAuthorizationReceiptV1,
} from './source-media-rights-authorization-v1';
import type {
  SourceMediaRightsLedgerReaderV1,
  SourceMediaRightsLedgerStorePortsV1,
} from './source-media-rights-ledger-v1';

const PROJECT_FIVE_TRACK_ANALYSIS_CONTRACT_V2 =
  'EDITRON_PROJECT_FIVE_TRACK_ANALYSIS_V2' as const;

type ProjectFiveTrackAnalysisModeV2 = 'FULL' | 'CACHE_ONLY';

type SelectedSourceTimeBlockReasonV1 = Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
>['reason'];

type ProjectTimestampVideoAnalysisBlockReasonV1 = Extract<
  ProjectTimestampVideoAnalysisResultV1,
  Readonly<{ disposition: 'UNVERIFIABLE' }>
>['reason'];

type ProjectFiveTrackAnalysisBlockReasonV2 =
  | 'OVERLAY_ASSET_ID_REQUIRED'
  | 'ASSET_NOT_FOUND'
  | `SELECTED_SOURCE_TIME_${SelectedSourceTimeBlockReasonV1}`
  | 'SELECTED_SOURCE_URL_UNAVAILABLE'
  | 'SOURCE_FRAME_COUNT_INVALID'
  | `SELECTED_SOURCE_RIGHTS_${string}`
  | 'TIMESTAMP_ANALYSIS_PROJECT_REVISION_REQUIRED'
  | 'TIMESTAMP_ANALYSIS_PORT_REQUIRED'
  | 'TIMESTAMP_ANALYSIS_CACHE_MISS'
  | `TIMESTAMP_ANALYSIS_${ProjectTimestampVideoAnalysisBlockReasonV1}`
  | 'ANALYSIS_CACHE_MISS'
  | 'ANALYSIS_EXECUTION_FAILED'
  | 'TIME_BUDGET_EXCEEDED';

type ProjectFiveTrackTimelineBlockReasonV2 =
  | 'ANALYSIS_UNAVAILABLE'
  | 'PROJECT_30FPS_CONSUMER_REQUIRED'
  | 'EXPLICIT_SOURCE_RANGE_REQUIRED'
  | 'FULL_SOURCE_RANGE_REQUIRED'
  | 'NORMAL_SPEED_REQUIRED'
  | 'SINGLE_OVERLAY_SOURCE_REQUIRED'
  | 'PROJECT_COORDINATE_FIVE_TRACK_CONSUMER_REQUIRED';

type ProjectCoordinateVisionAnalysisV1 = Extract<
  ProjectTimestampVideoAnalysisResultV1,
  Readonly<{ disposition: 'ANALYZED' }>
>;

type ProjectCoordinateAnalysisV1 = Readonly<
  ProjectCoordinateVisionAnalysisV1 & {
    audioEvidence: ProjectSelectedSourceAudioEvidenceResultV1;
  }
>;

type ProjectFiveTrackOverlayResultV2 = Readonly<{
  overlayId: number;
  assetId: string | null;
  analysis: AssetAnalysis | null;
  projectCoordinateAnalysis: ProjectCoordinateAnalysisV1 | null;
  analysisDisposition:
    | 'ANALYZED'
    | 'CACHED'
    | 'PROJECT_COORDINATE_ANALYZED'
    | 'UNAVAILABLE';
  analysisBlockReason: ProjectFiveTrackAnalysisBlockReasonV2 | null;
  sourceMediaRightsAuthorizationReceiptSha256: string | null;
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

type SourceBoundPreparedOverlayV2 = Readonly<{
  kind: 'SOURCE_BOUND_FIVE_TRACK';
  overlay: ClipOverlay;
  assetId: string;
  totalSourceFrameCount: number;
  sourceBinding: AssetAnalysisSourceBindingV2;
  options: FullAnalysisOptions & Readonly<{
    sourceBindingV2: AssetAnalysisSourceBindingV2;
  }>;
  sourceMediaRightsAuthorization: SourceMediaRightsAuthorizationReceiptV1;
}>;

type TimestampPreparedOverlayV2 = Readonly<{
  kind: 'PROJECT_TIMESTAMP';
  overlay: ClipOverlay;
  selectedSource: Extract<
    ProjectSelectedVideoSourceTimeBindingResultV1,
    Readonly<{ disposition: 'RESOLVED' }>
  >;
  sourceVersionCandidates: readonly unknown[];
  sourceMediaRightsAuthorization: SourceMediaRightsAuthorizationReceiptV1;
}>;

type PreparedOverlayV2 =
  | SourceBoundPreparedOverlayV2
  | TimestampPreparedOverlayV2;

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
  materializeTimestampAnalysis?:
    ProjectTimestampVideoAnalysisPortsV1['materialize'];
  audioArtifactReader: MediaSourceAudioPrivateArtifactReaderV1;
  timestampPcmStoredObjectReader?:
    MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  timestampPcmReader?: Pick<
    MediaSourceAudioPrivateArtifactStoreV1,
    'readPcmSampleRange'
  >;
  timestampPcmCreateConform?:
    typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3;
  resolveSelectedSourceAudioEvidence?:
    typeof resolveProjectSelectedSourceAudioEvidenceV1;
  rightsReader: Readonly<SourceMediaRightsLedgerReaderV1>;
  rightsStore?: Readonly<SourceMediaRightsLedgerStorePortsV1>;
  authorizeCurrentSourceRights?:
    typeof authorizeCurrentSourceMediaRightsV1;
  rightsNow?: () => Date;
  nowMs(): number;
}>;

export async function analyzeProjectFiveTrackV2(input: Readonly<{
  project: Project;
  userId: string;
  mode: ProjectFiveTrackAnalysisModeV2;
  projectRevisionV1?: ProjectRevisionV1;
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
      mode: input.mode,
      projectRevisionV1: input.projectRevisionV1,
      overlay,
      assets,
      loadSourceVersionEvidence: ports.loadSourceVersionEvidence,
      rightsReader: ports.rightsReader,
      rightsStore: ports.rightsStore,
      authorizeCurrentSourceRights: ports.authorizeCurrentSourceRights,
      rightsNow: ports.rightsNow,
    });
    if ('reason' in result) blocked.set(overlay.id, result.reason);
    else prepared.set(overlay.id, result);
  }

  const sourceUseCount = new Map<string, number>();
  for (const candidate of prepared.values()) {
    if (candidate.kind !== 'SOURCE_BOUND_FIVE_TRACK') continue;
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

  for (const candidate of uniqueSources(sourceBoundCandidates(prepared.values()))) {
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

  const timestampAnalyses = new Map<number, ProjectCoordinateAnalysisV1>();
  for (const candidate of timestampCandidates(prepared.values())) {
    if (input.mode === 'CACHE_ONLY') {
      blocked.set(candidate.overlay.id, 'TIMESTAMP_ANALYSIS_CACHE_MISS');
      continue;
    }
    if (ports.nowMs() - startedAt > timeBudgetMs) {
      timedOut = true;
      blocked.set(candidate.overlay.id, 'TIME_BUDGET_EXCEEDED');
      continue;
    }
    if (!input.projectRevisionV1) {
      failed += 1;
      blocked.set(
        candidate.overlay.id,
        'TIMESTAMP_ANALYSIS_PROJECT_REVISION_REQUIRED',
      );
      continue;
    }
    if (!ports.materializeTimestampAnalysis) {
      failed += 1;
      blocked.set(candidate.overlay.id, 'TIMESTAMP_ANALYSIS_PORT_REQUIRED');
      continue;
    }
    const result = await analyzeProjectTimestampVideoV1({
      userId: input.userId,
      projectId,
      sequenceId: 'main',
      overlayId: candidate.overlay.id,
      projectRevision: input.projectRevisionV1,
      overlayFromFrame: candidate.overlay.from,
      overlayDurationInFrames: candidate.overlay.durationInFrames,
      selectedSource: candidate.selectedSource.binding,
      ports: { materialize: ports.materializeTimestampAnalysis },
    });
    if (result.disposition === 'ANALYZED') {
      const resolveAudio = ports.resolveSelectedSourceAudioEvidence
        ?? resolveProjectSelectedSourceAudioEvidenceV1;
      const audioEvidence = await resolveAudio({
        projectId,
        sequenceId: 'main',
        overlayId: candidate.overlay.id,
        projectRevision: input.projectRevisionV1,
        assetId: candidate.selectedSource.binding.assetId,
        selectedSource: candidate.selectedSource,
        sourceVersionCandidates: candidate.sourceVersionCandidates,
        rightsScope: projectRightsScope(input.project, input.userId),
        pcmWindow: projectTimestampPcmWindow(
          candidate,
          result,
          input.userId,
        ),
        ports: {
          loadSourceVersionEvidence: ports.loadSourceVersionEvidence,
          audioArtifactReader: ports.audioArtifactReader,
          storedObjectReader: ports.timestampPcmStoredObjectReader,
          pcmReader: ports.timestampPcmReader,
          createTimestampConform: ports.timestampPcmCreateConform,
          rightsReader: ports.rightsReader,
          ...(ports.rightsNow ? { rightsNow: ports.rightsNow } : {}),
        },
      });
      timestampAnalyses.set(candidate.overlay.id, Object.freeze({
        ...result,
        audioEvidence,
      }));
      analyzed += 1;
    } else {
      failed += 1;
      blocked.set(
        candidate.overlay.id,
        `TIMESTAMP_ANALYSIS_${result.reason}`,
      );
    }
  }

  const overlayResults = videoOverlays.map((overlay) => {
    const candidate = prepared.get(overlay.id);
    const sourceAnalysis = candidate?.kind === 'SOURCE_BOUND_FIVE_TRACK'
      ? analyses.get(candidate.sourceBinding.bindingSha256)
      : undefined;
    const projectCoordinateAnalysis = timestampAnalyses.get(overlay.id);
    const analysisBlockReason = candidate
      && !sourceAnalysis
      && !projectCoordinateAnalysis
      ? blocked.get(candidate.overlay.id) ?? 'ANALYSIS_CACHE_MISS'
      : blocked.get(overlay.id) ?? null;
    const timelineAdmission = projectCoordinateAnalysis
      ? {
          disposition: 'BLOCKED' as const,
          reason: 'PROJECT_COORDINATE_FIVE_TRACK_CONSUMER_REQUIRED' as const,
        }
      : candidate?.kind === 'SOURCE_BOUND_FIVE_TRACK' && sourceAnalysis
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
      projectCoordinateAnalysis: projectCoordinateAnalysis ?? null,
      analysisDisposition: projectCoordinateAnalysis
        ? 'PROJECT_COORDINATE_ANALYZED' as const
        : sourceAnalysis?.disposition ?? 'UNAVAILABLE',
      analysisBlockReason,
      sourceMediaRightsAuthorizationReceiptSha256:
        candidate?.sourceMediaRightsAuthorization.receiptSha256 ?? null,
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
  mode: ProjectFiveTrackAnalysisModeV2;
  projectRevisionV1?: ProjectRevisionV1;
  overlay: ClipOverlay;
  assets: ReadonlyMap<string, AnalysisAssetV2>;
  loadSourceVersionEvidence:
    ProjectFiveTrackAnalysisPortsV2['loadSourceVersionEvidence'];
  rightsReader: ProjectFiveTrackAnalysisPortsV2['rightsReader'];
  rightsStore: ProjectFiveTrackAnalysisPortsV2['rightsStore'];
  authorizeCurrentSourceRights:
    ProjectFiveTrackAnalysisPortsV2['authorizeCurrentSourceRights'];
  rightsNow: ProjectFiveTrackAnalysisPortsV2['rightsNow'];
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
  const sourceVersion = selected.sourceVersion;
  const rightsScope = projectRightsScope(input.project, input.userId);
  let sourceMediaRightsAuthorization: SourceMediaRightsAuthorizationReceiptV1;
  if (input.authorizeCurrentSourceRights || input.mode === 'CACHE_ONLY') {
    const authorizeRights = input.authorizeCurrentSourceRights
      ?? authorizeCurrentSourceMediaRightsV1;
    const sourceMediaRights = await authorizeRights({
      ...rightsScope,
      projectId: input.project.projectId,
      sourceVersion,
    }, {
      rightsReader: input.rightsReader,
      ...(input.rightsNow ? { now: input.rightsNow } : {}),
    });
    if (sourceMediaRights.disposition === 'BLOCKED') {
      return {
        reason: `SELECTED_SOURCE_RIGHTS_${sourceMediaRights.diagnosticCode}`,
      };
    }
    sourceMediaRightsAuthorization = sourceMediaRights.receipt;
  } else {
    if (!input.projectRevisionV1) {
      return {
        reason: 'SELECTED_SOURCE_RIGHTS_PROJECT_REVISION_REQUIRED',
      };
    }
    if (!input.rightsStore) {
      return { reason: 'SELECTED_SOURCE_RIGHTS_MIGRATION_STORE_REQUIRED' };
    }
    const sourceMediaRights =
      await ensureProjectSourceMediaRightsFromLegacyAttestationV1({
        ...rightsScope,
        projectId: input.project.projectId,
        projectRevision: input.projectRevisionV1,
        sourceVersion,
        asset,
      }, {
        rightsStore: input.rightsStore,
        ...(input.rightsNow ? { now: input.rightsNow } : {}),
      });
    if (sourceMediaRights.disposition === 'BLOCKED') {
      return {
        reason: `SELECTED_SOURCE_RIGHTS_${sourceMediaRights.diagnosticCode}`,
      };
    }
    sourceMediaRightsAuthorization = sourceMediaRights.authorization;
  }
  const timing = selected.binding;
  const compatibility = classifyVerifiedVideoSourceEpochRateCompatibilityV3(
    timing,
    30,
  );
  if (compatibility.disposition !== 'COMPATIBLE_SAME_RATE_CFR') {
    return Object.freeze({
      kind: 'PROJECT_TIMESTAMP' as const,
      overlay: input.overlay,
      selectedSource: selected,
      sourceVersionCandidates: Object.freeze([sourceVersion]),
      sourceMediaRightsAuthorization,
    });
  }
  const videoUrl = exactHttpUrl(input.overlay.src ?? input.overlay.content);
  if (!videoUrl) return { reason: 'SELECTED_SOURCE_URL_UNAVAILABLE' };
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
    kind: 'SOURCE_BOUND_FIVE_TRACK' as const,
    overlay: input.overlay,
    assetId,
    totalSourceFrameCount,
    sourceBinding,
    options: Object.freeze({ ...baseOptions, sourceBindingV2: sourceBinding }),
    sourceMediaRightsAuthorization,
  });
}

function projectRightsScope(project: Project, userId: string) {
  const projectOwnerId = project.userId.trim();
  const orgId = typeof project.orgId === 'string' && project.orgId.trim()
    ? project.orgId.trim()
    : null;
  return Object.freeze({
    tenantId: orgId ?? projectOwnerId,
    userId,
    orgId,
    projectOwnerId,
  });
}

function admitTimeline(input: Readonly<{
  project: Project;
  candidate: SourceBoundPreparedOverlayV2;
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
  candidates: Iterable<SourceBoundPreparedOverlayV2>,
): readonly SourceBoundPreparedOverlayV2[] {
  const unique = new Map<string, SourceBoundPreparedOverlayV2>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.sourceBinding.bindingSha256)) {
      unique.set(candidate.sourceBinding.bindingSha256, candidate);
    }
  }
  return Array.from(unique.values());
}

function sourceBoundCandidates(
  candidates: Iterable<PreparedOverlayV2>,
): readonly SourceBoundPreparedOverlayV2[] {
  return Array.from(candidates).filter(
    (candidate): candidate is SourceBoundPreparedOverlayV2 =>
      candidate.kind === 'SOURCE_BOUND_FIVE_TRACK',
  );
}

function timestampCandidates(
  candidates: Iterable<PreparedOverlayV2>,
): readonly TimestampPreparedOverlayV2[] {
  return Array.from(candidates).filter(
    (candidate): candidate is TimestampPreparedOverlayV2 =>
      candidate.kind === 'PROJECT_TIMESTAMP',
  );
}

function projectTimestampPcmWindow(
  candidate: TimestampPreparedOverlayV2,
  analysis: ProjectCoordinateVisionAnalysisV1,
  userId: string,
) {
  const sourceStartFrame = candidate.overlay.sourceStartFrame
    ?? candidate.overlay.videoStartTime
    ?? 0;
  const sourceEndExclusiveFrame = candidate.overlay.sourceEndFrame
    ?? candidate.selectedSource.binding.totalSourceFrameCount;
  return Object.freeze({
    userId,
    projectRate: analysis.materialization.samplePlan.projectRate,
    overlayFromFrame: candidate.overlay.from,
    overlayDurationInFrames: candidate.overlay.durationInFrames,
    windowLocalStartFrame: 0,
    windowDurationInFrames: candidate.overlay.durationInFrames,
    sourceStartFrame: String(sourceStartFrame),
    sourceEndExclusiveFrame: String(sourceEndExclusiveFrame),
    timelineFrameQueries: analysis.materialization.samplePlan.samples.map(
      ({ timelineFrame }) => timelineFrame,
    ),
    expectedVisualTransformSha256:
      analysis.materialization.transformSha256,
  });
}

function createMongoPorts(): ProjectFiveTrackAnalysisPortsV2 {
  let evidenceStorePromise:
    Promise<MediaSourceVersionEvidenceStorePortsV1> | null = null;
  let mediaRuntimePromise: Promise<ReturnType<
    typeof import('./media-source-pts-cadence-r2-runtime-v1')[
      'createMediaSourcePtsCadenceR2RuntimePortsV1'
    ]
  >> | null = null;
  let rightsStorePromise: ReturnType<
    typeof import('./source-media-rights-ledger-v1')[
      'createSourceMediaRightsLedgerMongoPortsV1'
    ]
  > | null = null;
  const mediaRuntime = () => {
    mediaRuntimePromise ??= import(
      './media-source-pts-cadence-r2-runtime-v1'
    ).then(({ createMediaSourcePtsCadenceR2RuntimePortsV1 }) =>
      createMediaSourcePtsCadenceR2RuntimePortsV1(process.env));
    return mediaRuntimePromise;
  };
  const rightsStore: SourceMediaRightsLedgerStorePortsV1 = {
    async read(scope) {
      const store = rightsStorePromise ??= import(
        './source-media-rights-ledger-v1'
      ).then(({ createSourceMediaRightsLedgerMongoPortsV1 }) =>
        createSourceMediaRightsLedgerMongoPortsV1());
      return (await store).read(scope);
    },
    async commit(input) {
      const store = rightsStorePromise ??= import(
        './source-media-rights-ledger-v1'
      ).then(({ createSourceMediaRightsLedgerMongoPortsV1 }) =>
        createSourceMediaRightsLedgerMongoPortsV1());
      return (await store).commit(input);
    },
  };
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
    async materializeTimestampAnalysis(input) {
      const { materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1 } =
        await import('./native-media-timestamp-preview-materializer-v1');
      return materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(input);
    },
    audioArtifactReader: {
      async readArtifactSet(reference) {
        return (await mediaRuntime()).audioArtifact.readArtifactSet(reference);
      },
    },
    timestampPcmStoredObjectReader: {
      async read(sidecar) {
        return (await mediaRuntime()).epochArtifactReader.read(sidecar);
      },
    },
    timestampPcmReader: {
      async readPcmSampleRange(range) {
        return (await mediaRuntime()).audioArtifact.readPcmSampleRange(range);
      },
    },
    rightsReader: rightsStore,
    rightsStore,
    rightsNow: () => new Date(),
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
