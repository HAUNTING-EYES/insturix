import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  decodeHoldoutPcmS16leV2R,
  meanAbsolutePcmWindowV2R,
  probeHoldoutAudioV2R,
  renderRangeRemovalAvProxyV2R,
} from './sealed-holdout-av-proof-runtime-v2r';
import {
  bindHoldoutMediaArtifactV2R,
  extractHoldoutRgbFrameV2R,
  probeHoldoutVideoV2R,
} from './sealed-holdout-media-proof-runtime-v2r';
import { bindSealedHoldoutProofInputV2R } from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
const DECLARED_PRESENTATION_REF = 'sha256:caption-presentation-v1';
const RETAINED_WORDS = ['our', 'launch', 'is', 'Friday'] as const;

export const SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H04_NATIVE_AV_STATE_PROOF_V2R_1' as const;

export interface SealedHoldoutH04NativeProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V2R;
  authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-04:C1'; taskId: 'HOLD-04'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  writerIssuedProjectRevision: string;
  selectedMutation: Readonly<{
    nodeId: string; operatorId: 'cut_section'; argumentSha256: string;
    removedRange: Readonly<{ startFrame: 120; endFrame: 225 }>;
  }>;
  canonicalOwnerProof: Readonly<{
    owner: 'lib/editron/services/timeline-range-cut.ts#cutTimelineRange';
    beforeDurationInFrames: 540; afterDurationInFrames: 435;
    rightSourceStartFrame: 225; retainedCaptionText: 'our launch is Friday';
    retainedCaptionOccurrences: 1;
    presentationReference: typeof DECLARED_PRESENTATION_REF;
    presentationMaterialSha256Before: string;
    presentationMaterialSha256After: string;
  }>;
  sourceArtifactSha256: string;
  outputArtifact: Readonly<{ filename: string; sha256: string; bytes: number }>;
  video: Readonly<{
    codec: string; width: number; height: number; averageFrameRate: string;
    decodedFrameCount: number; audioStreamCount: number;
  }>;
  audio: Readonly<{
    codec: string; sampleRate: number; channels: number;
    retainedTakeMeanAbsolutePcm: number;
    precedingQuietMeanAbsolutePcm: number;
    followingQuietMeanAbsolutePcm: number;
  }>;
  visualTakeProof: Readonly<{
    retainedStartFrame: 120; retainedEndFrameExclusive: 192;
    greenPixelsAtStart: number; greenPixelsAtEnd: number;
    greenPixelsBefore: number; greenPixelsAfter: number;
  }>;
  captionPixelProof: 'NOT_RENDERED_FIXTURE_HAS_NO_BOUND_CAPTION_PIXEL_FORM';
  speechIntelligibilityProof: 'NOT_CLAIMED_SYNTHETIC_TONE_ONLY';
  assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED'; stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH04NativeOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-04:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH04NativeProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-04'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const successful = bound.trace.nodes.filter(({ executionDisposition }) =>
    executionDisposition === 'OK');
  const ids = successful.map(({ selectedOperatorId }) => selectedOperatorId);
  const mutations = successful.filter(({ researchCloneMutation }) => researchCloneMutation);
  if (!ids.some((id) => ['get_video_transcription', 'find_transcript_moment'].includes(id))
    || !ids.includes('get_timeline_view') || mutations.length !== 1
    || mutations[0].selectedOperatorId !== 'cut_section') {
    fail('SEALED_H04_PROOF_TRACE_FORM_INVALID');
  }
  const mutation = mutations[0];
  const removedRange = frameRange(mutation.normalizedArguments.targetRange);
  const evidenceIds = strings(mutation.normalizedArguments.evidenceIds);
  if (mutation.normalizedArguments.projectId !== 'oe-hold-04'
    || mutation.normalizedArguments.expectedProjectRevision !== 'R6'
    || removedRange.startFrame !== 120 || removedRange.endFrame !== 225
    || !['E1', 'E2'].every((ref) => evidenceIds.includes(ref))
    || !mutation.writerIssuedProjectRevision) {
    fail('SEALED_H04_PROOF_SELECTED_MUTATION_INVALID');
  }

  const initial = buildInitialProjectProxy();
  const ownerResult = cutTimelineRange({
    overlays: initial.overlays,
    startFrame: removedRange.startFrame,
    endFrame: removedRange.endFrame,
    fps: 30,
    durationInFrames: 540,
  });
  const caption = ownerResult.overlays.find(({ type }) => type === 'caption') ??
    fail('SEALED_H04_PROOF_CAPTION_MISSING_AFTER_CUT');
  const videoChildren = ownerResult.overlays.filter(({ type }) => type === 'video');
  const split = ownerResult.splitChildren.find(({ beforeOverlayId }) => beforeOverlayId === 401);
  const captionWords = records(caption.words).map((word) => text(word.word));
  const retainedText = captionWords.join(' ');
  const captionGroups = records(caption.captions);
  const occurrences = captionGroups.filter(({ text: value }) => value === retainedText).length;
  const presentationBefore = hashCanonicalJsonV1(captionPresentation(initial.caption));
  const presentationAfter = hashCanonicalJsonV1(captionPresentation(caption));
  if (ownerResult.framesCut !== 105 || ownerResult.newDurationInFrames !== 435
    || videoChildren.length !== 2 || split?.rightSourceStartFrame !== 225
    || retainedText !== RETAINED_WORDS.join(' ') || captionWords.length !== 4
    || captionGroups.length !== 1 || occurrences !== 1
    || text(record(caption.metadata).presentationHash) !== DECLARED_PRESENTATION_REF
    || presentationAfter !== presentationBefore) {
    fail('SEALED_H04_PROOF_CANONICAL_OWNER_STATE_INVALID');
  }

  const publicMedia = records(record(input.manifest.cases
    .find(({ caseId }) => caseId === input.caseId)?.publicCase).media);
  const media = publicMedia.find(({ assetId }) => assetId === 'h04-host');
  const source = await bindHoldoutMediaArtifactV2R({
    manifest: input.mediaManifest, taskId: 'HOLD-04', assetId: 'h04-host',
    publicArtifactSha256: text(media?.artifactSha256),
  });
  const rendered = await renderRangeRemovalAvProxyV2R({
    sourcePath: source.artifactPath, removedRange, durationFrames: 540,
    width: 640, height: 360, outputDirectory: input.outputDirectory,
    outputFilename: 'sealed-holdout-h04-clean-take-proxy.mp4',
  });
  const [video, audio, pcm, beforeFrame, startFrame, endFrame, afterFrame] = await Promise.all([
    probeHoldoutVideoV2R(rendered.outputPath, input.ffprobePath),
    probeHoldoutAudioV2R(rendered.outputPath, input.ffprobePath),
    decodeHoldoutPcmS16leV2R({ filePath: rendered.outputPath }),
    ...[119, 120, 191, 192].map((frame) => extractHoldoutRgbFrameV2R({
      filePath: rendered.outputPath, frame, width: 640, height: 360,
    })),
  ]);
  if (video.codec !== 'h264' || video.width !== 640 || video.height !== 360
    || video.averageFrameRate !== '30/1' || video.decodedFrameCount !== 435
    || video.audioStreamCount !== 1 || audio.codec !== 'aac'
    || audio.sampleRate !== 48_000 || audio.channels !== 1) {
    fail('SEALED_H04_PROOF_AV_CONTRACT_INVALID');
  }
  const greenPixelsBefore = countTakeBarPixels(beforeFrame);
  const greenPixelsAtStart = countTakeBarPixels(startFrame);
  const greenPixelsAtEnd = countTakeBarPixels(endFrame);
  const greenPixelsAfter = countTakeBarPixels(afterFrame);
  const precedingQuietMeanAbsolutePcm = meanAbsolutePcmWindowV2R(
    pcm, { startFrame: 100, endFrame: 115 },
  );
  const retainedTakeMeanAbsolutePcm = meanAbsolutePcmWindowV2R(
    pcm, { startFrame: 125, endFrame: 180 },
  );
  const followingQuietMeanAbsolutePcm = meanAbsolutePcmWindowV2R(
    pcm, { startFrame: 195, endFrame: 210 },
  );
  if (greenPixelsAtStart < 1_000 || greenPixelsAtEnd < 1_000
    || greenPixelsBefore > 50 || greenPixelsAfter > 50
    || retainedTakeMeanAbsolutePcm <= precedingQuietMeanAbsolutePcm * 10
    || retainedTakeMeanAbsolutePcm <= followingQuietMeanAbsolutePcm * 10) {
    fail('SEALED_H04_PROOF_RETAINED_TAKE_AV_FAILED');
  }
  const material = {
    version: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V2R,
    authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-04' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    writerIssuedProjectRevision: mutation.writerIssuedProjectRevision,
    selectedMutation: {
      nodeId: mutation.nodeId, operatorId: 'cut_section' as const,
      argumentSha256: mutation.argumentSha256,
      removedRange: { startFrame: 120 as const, endFrame: 225 as const },
    },
    canonicalOwnerProof: {
      owner: 'lib/editron/services/timeline-range-cut.ts#cutTimelineRange' as const,
      beforeDurationInFrames: 540 as const, afterDurationInFrames: 435 as const,
      rightSourceStartFrame: 225 as const,
      retainedCaptionText: 'our launch is Friday' as const,
      retainedCaptionOccurrences: 1 as const,
      presentationReference: DECLARED_PRESENTATION_REF as typeof DECLARED_PRESENTATION_REF,
      presentationMaterialSha256Before: presentationBefore,
      presentationMaterialSha256After: presentationAfter,
    },
    sourceArtifactSha256: source.artifactSha256,
    outputArtifact: {
      filename: 'sealed-holdout-h04-clean-take-proxy.mp4',
      sha256: rendered.artifactSha256, bytes: rendered.bytes,
    },
    video,
    audio: {
      ...audio, retainedTakeMeanAbsolutePcm,
      precedingQuietMeanAbsolutePcm, followingQuietMeanAbsolutePcm,
    },
    visualTakeProof: {
      retainedStartFrame: 120 as const, retainedEndFrameExclusive: 192 as const,
      greenPixelsAtStart, greenPixelsAtEnd, greenPixelsBefore, greenPixelsAfter,
    },
    captionPixelProof: 'NOT_RENDERED_FIXTURE_HAS_NO_BOUND_CAPTION_PIXEL_FORM' as const,
    speechIntelligibilityProof: 'NOT_CLAIMED_SYNTHETIC_TONE_ONLY' as const,
    assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function buildInitialProjectProxy() {
  const words = [...captionWordsAt(120), ...captionWordsAt(225)];
  const caption = {
    id: 402, type: 'caption', from: 0, durationInFrames: 540, row: 4,
    words,
    captions: [captionGroupAt(120), captionGroupAt(225)],
    styles: {
      fontFamily: 'Inter', fontSize: 64, fontWeight: 700,
      color: '#fff7e6', textAlign: 'center', textTransform: 'none',
    },
    displayConfig: { mode: 'phrase', showPreviousWords: false, fadeOutPreviousWords: false },
    metadata: { source: 'canonical-caption-track', presentationHash: DECLARED_PRESENTATION_REF },
  };
  return {
    caption,
    overlays: [
      {
        id: 401, type: 'video', from: 0, durationInFrames: 540, row: 0,
        assetId: 'h04-host', src: 'bound-by-media-manifest', sourceStartFrame: 0,
        videoStartTime: 0,
      },
      caption,
    ],
  };
}

function captionWordsAt(startFrame: number) {
  return RETAINED_WORDS.map((word, index) => ({
    word,
    startMs: frameToMs(startFrame + index * 18),
    endMs: frameToMs(startFrame + (index + 1) * 18),
    confidence: 1,
  }));
}
function captionGroupAt(startFrame: number) {
  const words = captionWordsAt(startFrame);
  return {
    text: RETAINED_WORDS.join(' '), words,
    startMs: words[0].startMs, endMs: words[words.length - 1].endMs,
  };
}
function captionPresentation(value: JsonRecord): JsonRecord {
  return {
    row: value.row,
    styles: record(value.styles),
    displayConfig: record(value.displayConfig),
    source: text(record(value.metadata).source),
    presentationHash: text(record(value.metadata).presentationHash),
  };
}
function countTakeBarPixels(rgb: Buffer): number {
  let pixels = 0;
  const width = 640;
  for (let y = 235; y < 275; y += 1) for (let x = 340; x < 570; x += 1) {
    const offset = (y * width + x) * 3;
    const red = rgb[offset]; const green = rgb[offset + 1]; const blue = rgb[offset + 2];
    if (green > 155 && red < 135 && blue > 80 && blue < 190 && green > red * 1.35) pixels += 1;
  }
  return pixels;
}
function frameToMs(frame: number): number { return Math.round(frame / 30 * 1_000); }
function frameRange(value: unknown): { startFrame: number; endFrame: number } {
  const range = record(value); const startFrame = integer(range.startFrame); const endFrame = integer(range.endFrame);
  if (startFrame < 0 || endFrame <= startFrame) fail('SEALED_H04_PROOF_RANGE_INVALID');
  return { startFrame, endFrame };
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function fail(code: string): never { throw new Error(code); }
