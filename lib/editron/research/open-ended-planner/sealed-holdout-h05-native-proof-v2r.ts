import { buildSubjectAwareReframePlan, SUBJECT_REFRAME_PLAN_VERSION }
  from '@/lib/editron/services/subject-reframe-plan';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  bindHoldoutMediaArtifactV2R,
  probeHoldoutVideoV2R,
} from './sealed-holdout-media-proof-runtime-v2r';
import {
  renderHoldoutH05TrackedReframeV2R,
  scanHoldoutH05RenderedProofV2R,
  scanHoldoutH05SourceTrackV2R,
} from './sealed-holdout-h05-render-runtime-v2r';
import { bindSealedHoldoutProofInputV2R } from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
const TRACK_FRAMES = [0, 120, 240, 360, 449] as const;

export const SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H05_NATIVE_VISUAL_PROXY_PROOF_V2R_1' as const;

export interface SealedHoldoutH05NativeProofMechanicsV2R {
  writerIssuedProjectRevision: string;
  selectedMutation: Readonly<{
    nodeId: string; operatorId: 'reframe_project'; argumentSha256: string;
    targetAspectRatio: '9:16';
  }>;
  sourceArtifactSha256: string;
  sourceObservation: Readonly<{
    decodedFrameCount: 450; frozenTrackFrameCount: 5;
    maxFrozenCenterError: number; denseObservationSha256: string;
  }>;
  canonicalOwnerProof: Readonly<{
    owner: 'lib/editron/services/subject-reframe-plan.ts#buildSubjectAwareReframePlan';
    ownerVersion: typeof SUBJECT_REFRAME_PLAN_VERSION; planSha256: string;
    subjectTrackedOverlayId: 501; authoredLayoutOverlayId: 502;
    targetCanvas: Readonly<{ width: 1080; height: 1920 }>;
  }>;
  authoredLayoutProof: Readonly<{
    relation: 'top-right-5-percent'; targetWidth: number; targetHeight: number;
    minimumWidthPassed: true;
    assetPixelIdentity: 'NOT_CLAIMED_SYMBOLIC_PROXY_MARKER_ONLY';
  }>;
  outputArtifact: Readonly<{ filename: string; sha256: string; bytes: number }>;
  video: Readonly<{
    codec: string; width: number; height: number; averageFrameRate: string;
    decodedFrameCount: number; audioStreamCount: number;
  }>;
  visualProof: Readonly<{
    decodedFrameCount: number; minSubjectPixels: number; minSubjectMarginPx: number;
    minLogoPixels: number; maxLogoTopMarginErrorPx: number; maxLogoRightMarginErrorPx: number;
  }>;
  audioProof: 'NO_SOURCE_AUDIO_STREAM_AND_NO_OUTPUT_AUDIO_STREAM';
}

export interface SealedHoldoutH05NativeProofReceiptV2R
  extends SealedHoldoutH05NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V2R;
  authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-05:C1'; taskId: 'HOLD-05'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_LIMITED';
  productProjectMutationProof: 'NOT_CLAIMED'; stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH05NativeOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-05:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH05NativeProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-05'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_H05_PROOF_CASE_MISSING');
  const mechanics = await executeSealedHoldoutH05NativeProofMechanicsV2R({
    traceNodes: bound.trace.nodes,
    publicCase: taskCase.publicCase,
    ownerOnly: taskCase.ownerOnly,
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    ffprobePath: input.ffprobePath,
  });
  const material = {
    version: SEALED_HOLDOUT_H05_NATIVE_PROOF_VERSION_V2R,
    authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-05' as const,
    manifestSha256: input.manifest.manifestSha256, publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    ...mechanics,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_LIMITED' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function executeSealedHoldoutH05NativeProofMechanicsV2R(input: {
  traceNodes: readonly Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R['nodes'][number]>[];
  publicCase: Readonly<JsonRecord>;
  ownerOnly: Readonly<JsonRecord>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH05NativeProofMechanicsV2R>> {
  const successful = input.traceNodes.filter(({ executionDisposition }) => executionDisposition === 'OK');
  const ids = successful.map(({ selectedOperatorId }) => selectedOperatorId);
  const mutations = successful.filter(({ researchCloneMutation }) => researchCloneMutation);
  if (!ids.includes('find_visual_moment') || !ids.includes('get_timeline_view')
    || mutations.length !== 1 || mutations[0].selectedOperatorId !== 'reframe_project') {
    fail('SEALED_H05_PROOF_TRACE_FORM_INVALID');
  }
  const mutation = mutations[0]; const args = mutation.normalizedArguments;
  const reframePlan = record(args.reframePlan); const constraints = record(args.constraints);
  const evidenceIds = strings(args.evidenceIds);
  if (args.projectId !== 'oe-hold-05' || args.expectedProjectRevision !== 'R14'
    || reframePlan.targetAspectRatio !== '9:16'
    || reframePlan.trackingMode !== 'FOLLOW_SPATIAL_EVIDENCE'
    || reframePlan.preserveAuthoredLayout !== true
    || constraints.noStaticCenterCrop !== true || constraints.preserveDuration !== true
    || !['E1', 'E2'].every((ref) => evidenceIds.includes(ref))
    || !mutation.writerIssuedProjectRevision) fail('SEALED_H05_PROOF_SELECTED_MUTATION_INVALID');

  const publicCase = record(input.publicCase); const publicProject = record(publicCase.project);
  const publicMedia = records(publicCase.media);
  const media = publicMedia.find(({ assetId }) => assetId === 'h05-subject');
  const source = await bindHoldoutMediaArtifactV2R({
    manifest: input.mediaManifest, taskId: 'HOLD-05', assetId: 'h05-subject',
    publicArtifactSha256: text(media?.artifactSha256),
  });
  const [sourceVideo, sourceTrack] = await Promise.all([
    probeHoldoutVideoV2R(source.artifactPath, input.ffprobePath),
    scanHoldoutH05SourceTrackV2R({
      filePath: source.artifactPath, width: 640, height: 360, expectedFrames: 450,
    }),
  ]);
  if (sourceVideo.codec !== 'h264' || sourceVideo.width !== 640 || sourceVideo.height !== 360
    || sourceVideo.averageFrameRate !== '30/1' || sourceVideo.decodedFrameCount !== 450
    || sourceVideo.audioStreamCount !== 0 || sourceTrack.decodedFrameCount !== 450) {
    fail('SEALED_H05_PROOF_SOURCE_CONTRACT_INVALID');
  }

  const ownerEvidence = records(record(input.ownerOnly).evidence);
  const spatial = ownerEvidence.find(({ kind }) => kind === 'SPATIAL_TRACK');
  const layout = ownerEvidence.find(({ kind }) => kind === 'AUTHORED_LAYOUT');
  const spatialValue = record(spatial?.value); const layoutValue = record(layout?.value);
  const trackFrames = numbers(spatialValue.trackFrames); const centersX = numbers(spatialValue.centersX);
  if (spatial?.evidenceRef !== 'E1' || layout?.evidenceRef !== 'E2'
    || hashCanonicalJsonV1(trackFrames) !== hashCanonicalJsonV1(TRACK_FRAMES)
    || centersX.length !== TRACK_FRAMES.length || layoutValue.logoOverlayId !== 'ov-logo'
    || layoutValue.safeRelation !== 'top-right-5-percent') fail('SEALED_H05_PROOF_OWNER_EVIDENCE_INVALID');
  let maxFrozenCenterError = 0;
  const sampledFrames = TRACK_FRAMES.map((frame, index) => {
    const observation = sourceTrack.frames[frame] ?? fail('SEALED_H05_PROOF_SOURCE_FRAME_MISSING');
    const measuredCenter = observation.normalizedBox.x + observation.normalizedBox.width / 2;
    maxFrozenCenterError = Math.max(maxFrozenCenterError, Math.abs(measuredCenter - centersX[index]));
    return observation;
  });
  maxFrozenCenterError = round(maxFrozenCenterError);
  if (maxFrozenCenterError > 0.02) fail(`SEALED_H05_PROOF_FROZEN_TRACK_DRIFT:${maxFrozenCenterError}`);

  const canvas = record(publicProject.canvas);
  if (publicProject.projectId !== 'oe-hold-05' || publicProject.expectedProjectRevision !== 'R14'
    || canvas.width !== 1920 || canvas.height !== 1080 || publicProject.durationFrames !== 450) {
    fail('SEALED_H05_PROOF_PUBLIC_PROJECT_INVALID');
  }
  const project = buildProjectProxy();
  const analyses = [{
    projectId: 'oe-hold-05', assetId: 'h05-subject',
    segmentAnalysis: { segments: sampledFrames.map(({ frame, normalizedBox }) => ({
      startMs: Math.max(0, (frame - 0.5) / 30 * 1_000),
      endMs: Math.min(15_000, (frame + 0.5) / 30 * 1_000),
      transcript: { text: '' }, visual: { mainSubject: normalizedBox },
      weight: { finalWeight: 1 },
    })) },
  }];
  const plan = buildSubjectAwareReframePlan({
    project, analyses, targetAspectRatio: '9:16',
    sourceRastersByAssetId: { 'h05-subject': { width: 640, height: 360 } },
    authoredLayoutEvidence: [{
      logoOverlayId: layoutValue.logoOverlayId, safeRelation: layoutValue.safeRelation,
    }],
  });
  const videoUpdate = plan.overlayUpdates.find(({ overlayId }) => overlayId === 501);
  const logoUpdate = plan.overlayUpdates.find(({ overlayId }) => overlayId === 502);
  const xTrack = videoUpdate?.updates.keyframeTracks?.find(({ property }) => property === 'objectPositionX');
  const target = record(plan.projectUpdates.playerDimensions); const logoGeometry = logoUpdate?.updates;
  if (plan.status !== 'changed' || plan.subjectTrackedOverlayIds.join(',') !== '501'
    || plan.authoredLayoutOverlayIds.join(',') !== '502' || plan.skippedOverlayIds.length
    || target.width !== 1080 || target.height !== 1920 || !xTrack || !logoGeometry
    || number(logoGeometry.width) < 48 || !preservesAspect(96, 54, number(logoGeometry.width), number(logoGeometry.height))) {
    fail('SEALED_H05_PROOF_CANONICAL_OWNER_STATE_INVALID');
  }
  const proxyScale = 1 / 3;
  const rendered = await renderHoldoutH05TrackedReframeV2R({
    sourcePath: source.artifactPath,
    xTrack: xTrack.keyframes.map(({ frame, value }) => ({ frame, value: number(value) })),
    logo: {
      left: number(logoGeometry.left) * proxyScale, top: number(logoGeometry.top) * proxyScale,
      width: number(logoGeometry.width) * proxyScale, height: number(logoGeometry.height) * proxyScale,
    },
    outputDirectory: input.outputDirectory,
  });
  const [video, visualProof] = await Promise.all([
    probeHoldoutVideoV2R(rendered.outputPath, input.ffprobePath),
    scanHoldoutH05RenderedProofV2R({
      filePath: rendered.outputPath, expectedFrames: 450,
      expectedLogoTopMarginPx: 32, expectedLogoRightMarginPx: 18,
    }),
  ]);
  if (video.codec !== 'h264' || video.width !== 360 || video.height !== 640
    || video.averageFrameRate !== '30/1' || video.decodedFrameCount !== 450
    || video.audioStreamCount !== 0) fail('SEALED_H05_PROOF_VIDEO_CONTRACT_INVALID');

  return deepFreezeV1({
    writerIssuedProjectRevision: mutation.writerIssuedProjectRevision,
    selectedMutation: { nodeId: mutation.nodeId, operatorId: 'reframe_project' as const,
      argumentSha256: mutation.argumentSha256, targetAspectRatio: '9:16' as const },
    sourceArtifactSha256: source.artifactSha256,
    sourceObservation: { decodedFrameCount: 450 as const, frozenTrackFrameCount: 5 as const,
      maxFrozenCenterError, denseObservationSha256: hashCanonicalJsonV1(sourceTrack.frames) },
    canonicalOwnerProof: {
      owner: 'lib/editron/services/subject-reframe-plan.ts#buildSubjectAwareReframePlan' as const,
      ownerVersion: SUBJECT_REFRAME_PLAN_VERSION, planSha256: hashCanonicalJsonV1(plan),
      subjectTrackedOverlayId: 501 as const, authoredLayoutOverlayId: 502 as const,
      targetCanvas: { width: 1080 as const, height: 1920 as const },
    },
    authoredLayoutProof: {
      relation: 'top-right-5-percent' as const, targetWidth: number(logoGeometry.width),
      targetHeight: number(logoGeometry.height), minimumWidthPassed: true as const,
      assetPixelIdentity: 'NOT_CLAIMED_SYMBOLIC_PROXY_MARKER_ONLY' as const,
    },
    outputArtifact: { filename: 'sealed-holdout-h05-tracked-reframe-proxy.mp4',
      sha256: rendered.artifactSha256, bytes: rendered.bytes },
    video, visualProof,
    audioProof: 'NO_SOURCE_AUDIO_STREAM_AND_NO_OUTPUT_AUDIO_STREAM' as const,
  });
}

function buildProjectProxy() {
  return {
    projectId: 'oe-hold-05', fps: 30, aspectRatio: '16:9', durationInFrames: 450,
    playerDimensions: { width: 1920, height: 1080 },
    overlays: [
      { id: 501, type: 'video', assetId: 'h05-subject', from: 0, durationInFrames: 450,
        left: 0, top: 0, width: 1920, height: 1080, styles: { objectFit: 'cover' } },
      { id: 502, type: 'image', assetId: 'symbolic-logo-marker', from: 0, durationInFrames: 450,
        left: 1728, top: 54, width: 96, height: 54, metadata: { authoredId: 'ov-logo' } },
    ],
  };
}
function preservesAspect(beforeWidth: number, beforeHeight: number, afterWidth: number, afterHeight: number) {
  return Math.abs(beforeWidth / beforeHeight - afterWidth / afterHeight) <= 0.001;
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN; }
function round(value: number): number { return Number(value.toFixed(8)); }
function fail(code: string): never { throw new Error(code); }
