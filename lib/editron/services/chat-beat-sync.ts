import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { ROW, alignCutsToBeatsWithEvidence } from '@/lib/pipeline/scene-to-editron';
import { assetResolver, type MediaAsset } from './asset-resolver';
import { projectService } from './project-service';

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
  updatedAt?: Date | string;
  overlays?: Array<Record<string, any>>;
}

interface AnalyzedBeat {
  frame?: number;
  timeMs?: number;
  strength?: number;
  isDownbeat?: boolean;
}

interface BeatAnalysisLike {
  bpm?: number;
  bpmConfidence?: number;
  beats?: AnalyzedBeat[];
}

export interface ChatBeatSyncDependencies {
  loadProject(userId: string, projectId: string): Promise<ProjectLike | null>;
  loadAsset(assetId: string, userId: string): Promise<(MediaAsset & { beatAnalysis?: BeatAnalysisLike }) | null>;
  analyzeAssetBeats(assetId: string, userId: string): Promise<BeatAnalysisLike>;
  commit(input: {
    userId: string;
    projectId: string;
    expectedUpdatedAt: Date;
    overlays: Overlay[];
    audit: Record<string, unknown>;
  }): Promise<boolean>;
  now(): Date;
}

export type ChatBeatSyncResult =
  | { status: 'success'; data: Record<string, unknown>; message: string; nextAction: 'continue' }
  | { status: 'no-op'; data: Record<string, unknown>; message: string; nextAction: 'stop' }
  | { status: 'error'; data: null; error: { code: string; message: string }; message: string; nextAction: 'stop' };

const DEFAULT_DEPENDENCIES: ChatBeatSyncDependencies = {
  loadProject: (userId, projectId) => projectService.loadProject(userId, projectId) as Promise<ProjectLike | null>,
  loadAsset: (assetId, userId) => assetResolver.getAsset(assetId, userId),
  analyzeAssetBeats: analyzeAssetBeatsThroughRoute,
  commit: async (input) => projectService.replaceOverlayFamilyAtomic(input.userId, input.projectId, {
    expectedUpdatedAt: input.expectedUpdatedAt,
    overlays: input.overlays,
    projectUpdates: { latestBeatSync: input.audit },
  }),
  now: () => new Date(),
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
  let evidenceSource = hasBeatArray(persistedGrid)
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

  const sourceBeats = selectSourceBeats(
    persistedGrid,
    analysis,
    fps,
    args.input.beatFilter,
    args.input.strengthThreshold,
  );
  if (sourceBeats.length === 0) {
    return noOp(`The selected music has no ${args.input.beatFilter} beat evidence to align against.`, {
      reason: 'missing-licensed-beats',
      evidenceSource,
    });
  }
  const audioFamily = soundOverlays.filter((overlay) => overlay.assetId === audioOverlay.assetId);
  const timelineBeats = projectBeatsOntoTimeline(sourceBeats, audioFamily);
  if (timelineBeats.length === 0) {
    return noOp('The analyzed beats do not overlap the active music ranges.', {
      reason: 'beats-outside-active-music',
      evidenceSource,
    });
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

  const nextOverlays = structuredClone(overlays);
  const alignment = alignCutsToBeatsWithEvidence(nextOverlays, timelineBeats, fps, {
    ...(args.input.videoOverlayId == null ? {} : { targetOverlayId: args.input.videoOverlayId }),
    // CRG mapping:audio.cut_on_downbeat defines a +/-3 frame moderate lock.
    maxSnapFrames: Math.max(1, Math.round(fps * 0.1)),
    minClipFrames: 1,
    // CRG mapping/constraint requires a skipped alignment after four locks.
    maxConsecutiveBeatCuts: 4,
    protectedBoundaryFrames: captionPhraseBoundaryFrames(overlays, fps),
    protectedBoundaryToleranceFrames: Math.max(1, Math.round(fps / 30)),
    sourceDurationFramesByAssetId,
    requireSourceHandles: true,
  });
  if (alignment.snappedCount === 0) {
    return noOp('No existing cut boundary had a safe, speech-compatible beat alignment.', {
      reason: 'no-safe-boundary-alignment',
      evidenceSource,
      trackOverlayIds: alignment.trackOverlayIds,
      rejections: alignment.rejections,
    });
  }

  const expectedUpdatedAt = project.updatedAt instanceof Date
    ? project.updatedAt
    : new Date(project.updatedAt ?? '');
  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    return failure('BEAT_SYNC_REVISION_MISSING', 'Project revision is missing; beat alignment was not written.');
  }
  const audit = {
    version: 'chat-beat-sync-v2',
    evidenceSource,
    audioAssetId: audioOverlay.assetId,
    beatFilter: args.input.beatFilter,
    alignedAt: dependencies.now(),
    changes: alignment.changes,
    rejections: alignment.rejections.slice(0, 100),
  };
  const committed = await dependencies.commit({
    userId: args.userId,
    projectId: args.projectId,
    expectedUpdatedAt,
    overlays: nextOverlays as Overlay[],
    audit,
  });
  if (!committed) {
    return failure(
      'BEAT_SYNC_PROJECT_CONFLICT',
      'The timeline changed while beat alignment was being planned. Read the latest timeline and retry.',
    );
  }

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
      totalLicensedBeats: timelineBeats.length,
      beatFilter: args.input.beatFilter,
      changes: alignment.changes,
      rejections: alignment.rejections,
      affectedFrameRanges,
    },
  };
}

function selectSourceBeats(
  grid: Record<string, any>,
  analysis: BeatAnalysisLike,
  fps: number,
  filter: ChatBeatSyncInput['beatFilter'],
  strengthThreshold: number,
): Array<{ frame: number; strength: number; isDownbeat: boolean }> {
  const rawDownbeats = new Set<number>(
    Array.isArray(grid.downbeats)
      ? grid.downbeats.filter(Number.isFinite).map((frame: number) => Math.round(frame))
      : [],
  );
  const rawBeats = hasBeatArray(grid) ? grid.beats : analysis.beats ?? [];
  return rawBeats
    .map((beat: AnalyzedBeat) => {
      const frame = Number.isFinite(beat?.frame)
        ? Math.round(beat.frame as number)
        : Number.isFinite(beat?.timeMs)
          ? Math.round(((beat.timeMs as number) / 1000) * fps)
          : null;
      return frame == null ? null : {
        frame,
        strength: Number.isFinite(beat?.strength) ? beat.strength as number : 0,
        isDownbeat: beat?.isDownbeat === true || rawDownbeats.has(frame),
      };
    })
    .filter((beat): beat is { frame: number; strength: number; isDownbeat: boolean } => beat !== null)
    .filter((beat) => (
      filter === 'all'
      || (filter === 'downbeats' && beat.isDownbeat)
      || (filter === 'strong' && beat.strength >= strengthThreshold)
    ));
}

function projectBeatsOntoTimeline(
  beats: Array<{ frame: number; isDownbeat: boolean }>,
  audioFamily: Array<Record<string, any>>,
): Array<{ frame: number; isDownbeat: boolean }> {
  const projected = new Map<number, { frame: number; isDownbeat: boolean }>();
  for (const overlay of audioFamily) {
    const timelineStart = nonNegativeFrame(overlay.from);
    const sourceStart = nonNegativeFrame(overlay.startFromSound);
    const duration = nonNegativeFrame(overlay.durationInFrames);
    const sourceEnd = sourceStart + duration;
    for (const beat of beats) {
      if (beat.frame < sourceStart || beat.frame >= sourceEnd) continue;
      const frame = timelineStart + beat.frame - sourceStart;
      const existing = projected.get(frame);
      projected.set(frame, { frame, isDownbeat: existing?.isDownbeat === true || beat.isDownbeat });
    }
  }
  return [...projected.values()].sort((left, right) => left.frame - right.frame);
}

function captionPhraseBoundaryFrames(overlays: Array<Record<string, any>>, fps: number): number[] {
  return overlays
    .filter((overlay) => overlay.type === 'caption' && Array.isArray(overlay.captions))
    .flatMap((overlay) => overlay.captions.map((caption: Record<string, unknown>) => (
      Number.isFinite(caption.endMs)
        ? Math.round(nonNegativeFrame(overlay.from) + ((caption.endMs as number) / 1000) * fps)
        : null
    )))
    .filter((frame): frame is number => Number.isFinite(frame));
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

function hasBeatArray(value: unknown): value is { beats: AnalyzedBeat[] } {
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

function nonNegativeFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
