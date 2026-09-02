import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { assetResolver, type MediaAsset } from './asset-resolver';
import {
  resolveBeatSyncMutationV1,
  type BeatSyncSourceEvidenceV1,
} from './beat-sync-mutation-v1';
import {
  projectService,
  type ProjectBeatSyncEvidenceSourceV1,
  type ProjectBeatSyncResultV1,
} from './project-service';
import { readProjectRevisionV1, type ProjectRevisionV1 } from './project-revision-v1';

export interface ChatBeatSyncInput {
  audioOverlayId?: number;
  videoOverlayId?: number;
  beatFilter: 'all' | 'downbeats' | 'strong';
  strengthThreshold: number;
}

interface ProjectLike {
  projectId: string;
  userId: string;
  fps?: number;
  projectRevision?: unknown;
  updatedAt?: Date | string;
  overlays?: Array<Record<string, any>>;
}

type BeatAnalysisLike = BeatSyncSourceEvidenceV1;

export interface ChatBeatSyncDependencies {
  loadProject(userId: string, projectId: string): Promise<ProjectLike | null>;
  loadAsset(assetId: string, userId: string): Promise<(MediaAsset & { beatAnalysis?: BeatAnalysisLike }) | null>;
  analyzeAssetBeats(assetId: string, userId: string): Promise<BeatAnalysisLike>;
  commit(input: {
    userId: string;
    projectId: string;
    expectedRevision: ProjectRevisionV1;
    audioOverlayId: string | number;
    targetOverlayId?: string | number;
    beatFilter: ChatBeatSyncInput['beatFilter'];
    strengthThreshold: number;
    evidenceSource: ProjectBeatSyncEvidenceSourceV1;
  }): Promise<ProjectBeatSyncResultV1>;
}

export type ChatBeatSyncResult =
  | { status: 'success'; data: Record<string, unknown>; message: string; nextAction: 'continue' }
  | { status: 'no-op'; data: Record<string, unknown>; message: string; nextAction: 'stop' }
  | { status: 'error'; data: null; error: { code: string; message: string }; message: string; nextAction: 'stop' };

const DEFAULT_DEPENDENCIES: ChatBeatSyncDependencies = {
  loadProject: (userId, projectId) => projectService.loadProject(userId, projectId) as Promise<ProjectLike | null>,
  loadAsset: (assetId, userId) => assetResolver.getAsset(assetId, userId),
  analyzeAssetBeats: analyzeAssetBeatsThroughRoute,
  commit: async (input) => projectService.alignCutsToBeatsAtRevisionV1(
    input.userId,
    input.projectId,
    {
      expectedRevision: input.expectedRevision,
      actorKind: 'AGENT',
      audioOverlayId: input.audioOverlayId,
      ...(input.targetOverlayId === undefined
        ? {}
        : { targetOverlayId: input.targetOverlayId }),
      beatFilter: input.beatFilter,
      strengthThreshold: input.strengthThreshold,
      evidenceSource: input.evidenceSource,
    },
  ),
};

export async function executeChatBeatSync(
  args: {
    userId: string;
    projectId: string;
    input: ChatBeatSyncInput;
  },
  dependencies: ChatBeatSyncDependencies = DEFAULT_DEPENDENCIES,
): Promise<ChatBeatSyncResult> {
  const project = await dependencies.loadProject(args.userId, args.projectId);
  if (!project) return failure('BEAT_SYNC_PROJECT_NOT_FOUND', 'Project not found or unauthorized.');
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const fps = positiveNumber(project.fps) ?? 30;
  const soundOverlays = overlays.filter((overlay) => overlay.type === 'sound' && stringValue(overlay.assetId));
  const audioOverlay = args.input.audioOverlayId != null
    ? soundOverlays.find((overlay) => String(overlay.id) === String(args.input.audioOverlayId))
    : [...soundOverlays].sort((left, right) => scoreMusicEvidence(right) - scoreMusicEvidence(left))[0];
  if (!audioOverlay?.assetId || (args.input.audioOverlayId == null && scoreMusicEvidence(audioOverlay) <= 0)) {
    return noOp('No analyzed music overlay is available for beat alignment.', {
      reason: 'missing-music-overlay',
    });
  }
  if (args.input.videoOverlayId != null && !overlays.some((overlay) => (
    overlay.type === 'video' && String(overlay.id) === String(args.input.videoOverlayId)
  ))) {
    return failure('BEAT_SYNC_VIDEO_NOT_FOUND', `Video overlay ${args.input.videoOverlayId} was not found.`);
  }

  const audioAsset = await dependencies.loadAsset(String(audioOverlay.assetId), args.userId);
  const persistedGrid = record(audioOverlay.beatGrid ?? record(audioOverlay.metadata).beatGrid);
  const cachedAnalysis = record(audioAsset?.beatAnalysis) as BeatAnalysisLike;
  let analysis: BeatAnalysisLike = cachedAnalysis;
  const evidenceSource: ProjectBeatSyncEvidenceSourceV1 = hasBeatArray(persistedGrid)
    ? 'persisted-beat-grid'
    : hasBeatArray(cachedAnalysis)
      ? 'cached-beat-analysis'
      : 'beat-analysis-route';
  if (!hasBeatArray(persistedGrid) && !hasBeatArray(cachedAnalysis)) {
    try {
      analysis = await dependencies.analyzeAssetBeats(String(audioOverlay.assetId), args.userId);
    } catch (error) {
      return failure(
        'BEAT_SYNC_ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Beat analysis failed.',
      );
    }
  }

  const sourceDurationFramesByAssetId: Record<string, number> = {};
  const visualAssetIds = [...new Set(overlays
    .filter((overlay) => overlay.type === 'video' && stringValue(overlay.assetId))
    .map((overlay) => String(overlay.assetId)))];
  for (const assetId of visualAssetIds) {
    const asset = await dependencies.loadAsset(assetId, args.userId);
    const durationSeconds = positiveNumber(asset?.duration);
    if (durationSeconds != null) {
      sourceDurationFramesByAssetId[assetId] = Math.round(durationSeconds * fps);
    }
  }

  const sourceBeatEvidence = hasBeatArray(persistedGrid)
    ? persistedGrid as BeatSyncSourceEvidenceV1
    : analysis;
  const resolution = resolveBeatSyncMutationV1({
    overlays: overlays as Overlay[],
    fps,
    audioAssetId: String(audioOverlay.assetId),
    sourceBeatEvidence,
    beatFilter: args.input.beatFilter,
    strengthThreshold: args.input.strengthThreshold,
    ...(args.input.videoOverlayId == null ? {} : { targetOverlayId: args.input.videoOverlayId }),
    sourceDurationFramesByAssetId,
  });
  if (resolution.sourceBeatCount === 0) {
    return noOp(`The selected music has no ${args.input.beatFilter} beat evidence to align against.`, {
      reason: 'missing-licensed-beats',
      evidenceSource,
    });
  }
  if (resolution.timelineBeatCount === 0) {
    return noOp('The analyzed beats do not overlap the active music ranges.', {
      reason: 'beats-outside-active-music',
      evidenceSource,
    });
  }
  const plannedAlignment = resolution.alignment;
  if (plannedAlignment.snappedCount === 0) {
    return noOp('No existing cut boundary had a safe, speech-compatible beat alignment.', {
      reason: 'no-safe-boundary-alignment',
      evidenceSource,
      trackOverlayIds: plannedAlignment.trackOverlayIds,
      rejections: plannedAlignment.rejections,
    });
  }

  const expectedRevision = readProjectRevisionV1(project);
  if (!expectedRevision) {
    return failure('BEAT_SYNC_REVISION_MISSING', 'Project revision is missing; beat alignment was not written.');
  }
  let committed: ProjectBeatSyncResultV1;
  try {
    committed = await dependencies.commit({
      userId: args.userId,
      projectId: args.projectId,
      expectedRevision,
      audioOverlayId: audioOverlay.id,
      ...(args.input.videoOverlayId == null
        ? {}
        : { targetOverlayId: args.input.videoOverlayId }),
      beatFilter: args.input.beatFilter,
      strengthThreshold: args.input.strengthThreshold,
      evidenceSource,
    });
  } catch (error) {
    if (isProjectRevisionConflict(error)) {
      return failure(
        'BEAT_SYNC_PROJECT_CONFLICT',
        'The timeline changed while beat alignment was being planned. Read the latest timeline and retry.',
      );
    }
    return failure(
      'BEAT_SYNC_COMMIT_FAILED',
      error instanceof Error ? error.message : 'Beat alignment could not be committed.',
    );
  }
  if (committed.disposition === 'SAFE_STOP') {
    return noOp(beatSyncSafeStopMessage(committed.reason), {
      reason: committed.reason.toLowerCase().replaceAll('_', '-'),
      evidenceSource,
    });
  }
  if (committed.disposition === 'UNCHANGED') {
    return noOp('No current cut boundary had a safe beat alignment at commit time.', {
      reason: committed.reason.toLowerCase().replaceAll('_', '-'),
      evidenceSource,
      trackOverlayIds: committed.resolution.alignment.trackOverlayIds,
      rejections: committed.resolution.alignment.rejections,
    });
  }

  const alignment = committed.resolution.alignment;
  const affectedFrameRanges = alignment.changes.map((change) => ({
    startFrame: Math.max(0, Math.min(change.originalFrame, change.alignedFrame) - 1),
    endFrame: Math.max(change.originalFrame, change.alignedFrame) + 2,
  }));
  const persistedGridMetadata = record(persistedGrid);
  const message = `Aligned ${alignment.snappedCount} existing cut ${alignment.snappedCount === 1 ? 'boundary' : 'boundaries'} to measured ${args.input.beatFilter}.`;
  return {
    status: 'success',
    nextAction: 'continue',
    message,
    data: {
      message,
      evidenceSource,
      bpm: positiveNumber(persistedGridMetadata.bpm ?? analysis.bpm),
      bpmConfidence: positiveNumber(persistedGridMetadata.bpmConfidence ?? analysis.bpmConfidence),
      alignedBoundaryCount: alignment.snappedCount,
      totalLicensedBeats: committed.resolution.timelineBeatCount,
      beatFilter: args.input.beatFilter,
      changes: alignment.changes,
      rejections: alignment.rejections,
      affectedFrameRanges,
    },
  };
}

function beatSyncSafeStopMessage(
  reason: Extract<ProjectBeatSyncResultV1, { disposition: 'SAFE_STOP' }>['reason'],
): string {
  switch (reason) {
    case 'SOURCE_ASSET_NOT_FOUND':
      return 'Beat alignment was safely blocked because a current video source is unavailable.';
    case 'SOURCE_TIME_EVIDENCE_INCOMPLETE':
      return 'Beat alignment was safely blocked until exact source timing is available.';
    case 'SOURCE_EVENT_REBIND_UNSUPPORTED':
      return 'Beat alignment was safely blocked until timestamp-addressed VFR source handling is available.';
    case 'SOURCE_PROJECT_RATE_MISMATCH':
      return 'Beat alignment was safely blocked because the source and project rates cannot yet be conformed exactly.';
    case 'SOURCE_FRAME_COUNT_UNREPRESENTABLE':
      return 'Beat alignment was safely blocked because the verified source frame count is invalid.';
  }
}

function scoreMusicEvidence(overlay: Record<string, any>): number {
  const metadata = record(overlay.metadata);
  const rights = record(overlay.musicRights ?? overlay.audioRights);
  const grid = record(overlay.beatGrid ?? metadata.beatGrid);
  let score = hasBeatArray(grid) ? 100 : 0;
  if (overlay.row === ROW.BGM || overlay.row === String(ROW.BGM)) score += 30;
  if (overlay.mediaRole === 'music' || overlay.audioRole === 'music' || rights.mediaRole === 'music') score += 20;
  if (String(overlay.assetId ?? '').toLowerCase().startsWith('bgm_')) score += 10;
  return score;
}

async function analyzeAssetBeatsThroughRoute(assetId: string, userId: string): Promise<BeatAnalysisLike> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/services/editron/audio/analyze-beats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, userId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !hasBeatArray(payload.analysis)) {
    throw new Error(`Beat analysis failed: ${payload.error || response.status}`);
  }
  return payload.analysis as BeatAnalysisLike;
}

function hasBeatArray(value: unknown): value is {
  beats: NonNullable<BeatSyncSourceEvidenceV1['beats']>;
} {
  return Array.isArray(record(value).beats) && record(value).beats.length > 0;
}

function noOp(message: string, data: Record<string, unknown>): ChatBeatSyncResult {
  return { status: 'no-op', nextAction: 'stop', message, data };
}

function failure(code: string, message: string): ChatBeatSyncResult {
  return { status: 'error', nextAction: 'stop', message, data: null, error: { code, message } };
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isProjectRevisionConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECT_REVISION_CONFLICT',
  );
}
