/**
 * Project-scoped five-track analysis and read-only suggestion admission.
 * Source evidence may be cached even when legacy 30-fps timeline consumers are
 * blocked; no route fallback is allowed to bypass that distinction.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { ProjectAssetSourceUnverifiableErrorV1 }
  from '@/lib/editron/services/asset-resolver';
import { detectCinematicMoments }
  from '@/lib/editron/services/cinematic-moment-detector';
import { getAnalysis, type AssetAnalysis }
  from '@/lib/editron/services/five-track-analysis';
import { analyzeProjectFiveTrackV2 }
  from '@/lib/editron/services/project-five-track-analysis-v2';
import type { ProjectSelectedSourceAudioEvidenceResultV1 }
  from '@/lib/editron/services/project-selected-source-audio-evidence-v1';
import { analysisSameRevision }
  from '@/lib/editron/services/native-media-timestamp-analysis-validation-v1';
import {
  ProjectNotFoundOrForbiddenError,
  projectService,
} from '@/lib/editron/services/project-service';
import { generateEditDecisionList }
  from '@/lib/editron/services/reactive-edit-engine';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 300;
type AnalysisRequestMode = 'full' | 'cached-suggestions';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const projectId = identifier(body?.projectId);
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    const mode: AnalysisRequestMode = body?.mode === 'cached-suggestions'
      ? 'cached-suggestions'
      : 'full';

    // Project access and exact per-overlay source selection precede cost.
    const initialSnapshot = await projectService.loadProjectForMutation(
      userId,
      projectId,
    );
    const initialProject = initialSnapshot.project;

    let fullRun = null;
    if (mode === 'full') {
      const rl = await checkExpensiveRateLimit(userId);
      if (!rl.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please wait before running another analysis.' },
          {
            status: 429,
            headers: { 'X-RateLimit-Reset': String(rl.reset) },
          },
        );
      }
      fullRun = await analyzeProjectFiveTrackV2({
        project: initialProject,
        userId,
        mode: 'FULL',
        projectRevisionV1: initialSnapshot.revision,
      });
    }

    // Long provider calls may race editor writes. Only consume analyses rebound
    // to a freshly loaded ProjectService snapshot.
    const currentSnapshot = mode === 'full'
      ? await projectService.loadProjectForMutation(userId, projectId)
      : initialSnapshot;
    const currentProject = currentSnapshot.project;
    const evidence = await analyzeProjectFiveTrackV2({
      project: currentProject,
      userId,
      mode: 'CACHE_ONLY',
      projectRevisionV1: currentSnapshot.revision,
    });
    const freshFullCoordinateEvidence = fullRun
      && analysisSameRevision(initialSnapshot.revision, currentSnapshot.revision)
      ? new Map(fullRun.overlays.flatMap((entry) =>
          entry.projectCoordinateAnalysis
            ? [[entry.overlayId, entry] as const]
            : []))
      : new Map();
    const effectiveOverlays = evidence.overlays.map((entry) => {
      const fresh = freshFullCoordinateEvidence.get(entry.overlayId);
      return fresh?.projectCoordinateAnalysis
        ? {
            ...entry,
            projectCoordinateAnalysis: fresh.projectCoordinateAnalysis,
            analysisDisposition: fresh.analysisDisposition,
            analysisBlockReason: null,
            timelineAdmission: fresh.timelineAdmission,
          }
        : entry;
    });
    const admitted = effectiveOverlays.flatMap((entry) => {
      if (!entry.analysis || entry.timelineAdmission.disposition !== 'ADMITTED') {
        return [];
      }
      return [{
        overlayId: entry.overlayId,
        offset: entry.timelineAdmission.timelineOffsetFrames,
        analysis: {
          ...entry.analysis,
          _timelineOffsetFrames:
            entry.timelineAdmission.timelineOffsetFrames,
        } as AssetAnalysis,
      }];
    });
    const projectDurationMs = exactProjectDurationMs(currentProject);
    const edl = generateEditDecisionList(
      admitted.map((entry) => entry.analysis),
      projectDurationMs,
      {
        targetCutsPerMinute: 6,
        transitionStyle: 'mixed',
        graphicDensity: 'moderate',
        pacing: 'medium',
      },
    );
    edl.projectId = projectId;
    const topMoments = admitted.flatMap((entry) =>
      detectCinematicMoments(entry.analysis).map((moment) => ({
        ...moment,
        frame: moment.frame + entry.offset,
        timestampMs: (moment.frame + entry.offset) / 30 * 1000,
        overlayId: entry.overlayId,
      })))
      .sort((left, right) => right.intensity - left.intensity)
      .slice(0, 10);
    const graphicDecisions = edl.decisions.filter(
      (decision) => decision.type === 'graphic',
    );
    const available = effectiveOverlays.filter((entry) => entry.analysis);
    const projectCoordinateAvailable = effectiveOverlays.filter(
      (entry) => entry.projectCoordinateAnalysis,
    );
    const analysisBlocks = effectiveOverlays.flatMap((entry) =>
      entry.analysisBlockReason
        ? [{
            overlayId: entry.overlayId,
            assetId: entry.assetId,
            reason: entry.analysisBlockReason,
          }]
        : []);
    const timelineBlocks = effectiveOverlays.flatMap((entry) =>
      entry.timelineAdmission.disposition === 'BLOCKED'
        ? [{
            overlayId: entry.overlayId,
            assetId: entry.assetId,
            reason: entry.timelineAdmission.reason,
          }]
        : []);

    return NextResponse.json({
      success: true,
      mode,
      projectRevision: evidence.projectRevision,
      assets: mode === 'full'
        ? {
            analyzed: fullRun?.analyzed ?? 0,
            cached: fullRun?.cached ?? 0,
            failed: fullRun?.failed ?? 0,
            timedOut: fullRun?.timedOut ?? false,
          }
        : {
            analyzed: 0,
            cached: evidence.cached,
            failed: 0,
            timedOut: false,
            skipped: true,
          },
      timelineSuggestionAdmission: {
        disposition: timelineBlocks.length === 0
          ? 'ALL_AVAILABLE_ANALYSES_ADMITTED'
          : admitted.length > 0
            ? 'PARTIALLY_ADMITTED'
            : 'BLOCKED',
        admittedOverlayIds: admitted.map((entry) => entry.overlayId),
        blocks: timelineBlocks,
      },
      editDecisionList: edl,
      cinematicMoments: topMoments,
      graphicSuggestions: graphicDecisions,
      analysisSummaries: available.map((entry) => ({
        overlayId: entry.overlayId,
        assetId: entry.assetId,
        shots: entry.analysis?.shots?.length ?? 0,
        motionSegments: entry.analysis?.motionSegments?.length ?? 0,
        keyframes: entry.analysis?.keyframeAnalyses?.length ?? 0,
        subjects: entry.analysis?.subjectTracks?.length ?? 0,
        speechSegments: entry.analysis?.speechSegments?.length ?? 0,
        musicSections: entry.analysis?.musicStructure?.sections?.length ?? 0,
      })),
      projectCoordinateAnalysisSummaries: projectCoordinateAvailable.map(
        (entry) => ({
          overlayId: entry.overlayId,
          assetId: entry.assetId,
          evidenceAuthority: 'EXACT_V3_TIMESTAMP_BOUND',
          sourceVersionSha256:
            entry.projectCoordinateAnalysis?.sourceVersionSha256,
          storageVersionSha256:
            entry.projectCoordinateAnalysis?.storageVersionSha256,
          sourcePtsCadenceMapStateSha256V3:
            entry.projectCoordinateAnalysis
              ?.sourcePtsCadenceMapStateSha256V3,
          materializationSha256:
            entry.projectCoordinateAnalysis
              ?.materialization.materializationSha256,
          vision: entry.projectCoordinateAnalysis?.vision,
          audioEvidence: entry.projectCoordinateAnalysis
            ? projectCoordinateAudioSummary(
                entry.projectCoordinateAnalysis.audioEvidence,
              )
            : null,
          mutationAuthority:
            'REQUIRES_DEDICATED_PROJECT_COORDINATE_FIVE_TRACK_CONSUMER',
        }),
      ),
      analysisBlocks,
      videoOverlayCount: effectiveOverlays.length,
      analyzedCount: available.length + projectCoordinateAvailable.length,
    });
  } catch (error: unknown) {
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (error instanceof ProjectTimelineInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ProjectAssetSourceUnverifiableErrorV1) {
      return NextResponse.json(
        { error: error.code, diagnostic: error.diagnostic },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('[Analysis] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Legacy debug read. Direct asset ownership is mandatory until a project- and
 * source-binding-aware debug contract replaces this endpoint. */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const assetId = identifier(req.nextUrl.searchParams.get('assetId'));
    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }
    const db = await getDatabase();
    const owned = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
      { assetId, userId },
      { projection: { _id: 1 } },
    );
    if (!owned) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const analysis = await getAnalysis(assetId);
    if (!analysis) {
      return NextResponse.json(
        { error: 'No legacy analysis found for this asset', assetId },
        { status: 404 },
      );
    }
    return NextResponse.json({
      assetId,
      analysis,
      cacheContract: 'LEGACY_ASSET_ONLY',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis lookup failed' },
      { status: 500 },
    );
  }
}

function identifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(normalized)
    ? normalized
    : null;
}

function exactProjectDurationMs(project: Readonly<{
  durationInFrames: number;
  fps: number;
}>): number {
  if (!Number.isSafeInteger(project.durationInFrames)
    || project.durationInFrames < 0
    || !Number.isFinite(project.fps)
    || project.fps <= 0) {
    throw new ProjectTimelineInvalidError();
  }
  return project.durationInFrames / project.fps * 1000;
}

class ProjectTimelineInvalidError extends Error {
  constructor() {
    super('PROJECT_TIMELINE_INVALID');
    this.name = 'ProjectTimelineInvalidError';
  }
}

function projectCoordinateAudioSummary(
  value: ProjectSelectedSourceAudioEvidenceResultV1,
) {
  if (value.disposition === 'UNVERIFIABLE') {
    return {
      disposition: value.disposition,
      evidenceAuthority: 'UNVERIFIABLE' as const,
      playbackAuthority: 'NOT_PROVEN' as const,
      reason: value.reason,
      diagnostic: value.diagnostic,
    };
  }
  return {
    disposition: value.disposition,
    evidenceAuthority:
      'EXACT_SOURCE_AUDIO_MANIFEST_AND_SAMPLE_MAP_BOUND' as const,
    playbackAuthority: 'NOT_PROVEN' as const,
    evidenceSha256: value.evidenceSha256,
    sourceVersionEvidenceSha256: value.sourceVersionEvidenceSha256,
    sourceAudioArtifactStateSha256:
      value.sourceAudioArtifactStateSha256,
    sourceAudioArtifactRecordSha256:
      value.sourceAudioArtifactRecordSha256,
    audioStreamBindingSha256: value.audioStreamBindingSha256,
    audioSampleEpochMapSha256: value.audioSampleEpochMapSha256,
    decodedPcmSha256: value.decodedPcmSha256,
    decodedSampleFrameCount: value.decodedSampleFrameCount,
  };
}
