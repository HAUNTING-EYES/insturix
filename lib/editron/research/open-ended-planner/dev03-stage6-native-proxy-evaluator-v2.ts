import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { executeDev03BeatAlignmentV2, executeDev03FinalShakeV2, getCanonicalDev03NativeProxyFixtureV2, sha256Dev03FixtureBytesV2 } from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2, DEV03_STAGE6_CHANGED_PATHS_V2, DEV03_STAGE6_NATIVE_PROXY_V2,
  hasValidDev03Stage6ReceiptHashV2, type Dev03Stage6ExecutionEvidenceV2, type Dev03Stage6RenderProofV2,
} from './dev03-stage6-native-proxy-contract-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from './stage4-dev03-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

type Dimension = 'PASS' | 'FAIL' | 'UNVERIFIABLE';
export interface Dev03Stage6EvaluationV2 {
  assessment: Dimension;
  authorization: Dimension;
  isolatedState: Dimension;
  artifactIntegrity: Dimension;
  renderedVisual: Dimension;
  renderedAudio: Dimension;
  diagnostics: readonly string[];
}

const FILENAMES = {
  SOURCE_VIDEO: 'source-cards.mp4', SOURCE_AUDIO: 'source-beats.wav',
  CUT1_BEFORE: 'cut1-before-0118.png', CUT1_AFTER: 'cut1-after-0119.png',
  CUT2_BEFORE: 'cut2-before-0238.png', CUT2_AFTER: 'cut2-after-0239.png',
  CUT3_BEFORE: 'cut3-before-0478.png', CUT3_AFTER: 'cut3-after-0479.png',
  SHAKE_ACTIVE_BASELINE: 'shake-baseline-0480.png', SHAKE_ACTIVE: 'shake-active-0480.png',
  SHAKE_NEUTRAL_BASELINE: 'shake-baseline-0490.png', SHAKE_NEUTRAL: 'shake-neutral-0490.png',
  FULL_AV_PROXY: 'dev03-native-proxy.mp4', PROTECTED_AUDIO_BASELINE_WAV: 'dev03-protected-audio-baseline.wav',
  PROTECTED_AUDIO_WAV: 'dev03-protected-audio.wav',
} as const;

export async function evaluateDev03Stage6NativeProxyV2(input: {
  graph: unknown;
  evidence: Dev03Stage6ExecutionEvidenceV2;
}): Promise<Readonly<Dev03Stage6EvaluationV2>> {
  if (!input?.evidence?.receipt || !input.evidence.snapshots) return empty();
  const diagnostics: string[] = [];
  validateAuthorization(input.graph, input.evidence, diagnostics);
  validateState(input.evidence, diagnostics);
  await validateArtifacts(input.evidence, diagnostics);
  validateRenderProof(input.evidence.receipt.renderProof, diagnostics);
  const authorization = dimension(diagnostics, /^AUTH_/); const isolatedState = dimension(diagnostics, /^STATE_/);
  const artifactIntegrity = dimension(diagnostics, /^ARTIFACT_/); const renderedVisual = dimension(diagnostics, /^VISUAL_/);
  const renderedAudio = dimension(diagnostics, /^AUDIO_/); const dimensions = [authorization, isolatedState, artifactIntegrity, renderedVisual, renderedAudio];
  return Object.freeze({ assessment: dimensions.includes('FAIL') ? 'FAIL' : 'PASS', authorization, isolatedState, artifactIntegrity, renderedVisual, renderedAudio, diagnostics: unique(diagnostics).sort() });
}

function validateAuthorization(graph: unknown, evidence: Dev03Stage6ExecutionEvidenceV2, diagnostics: string[]): void {
  const { receipt } = evidence; const stage4 = evaluateDev03Stage4CompiledGraphV2(graph); const stage5 = decideStage5ProceedOrStopV2(graph);
  if (stage4.assessment !== 'PASS') diagnostics.push('AUTH_STAGE4_NOT_PASS');
  if (stage5.disposition !== 'PROCEED' || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY' || stage5.executionAuthorization.fullProjectExecution !== 'DENY') diagnostics.push('AUTH_STAGE5_NOT_BOUNDED_DENY_MUTATION');
  if (receipt.schemaVersion !== DEV03_STAGE6_NATIVE_PROXY_V2 || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' || receipt.taskId !== 'DEV-03') diagnostics.push('AUTH_RECEIPT_IDENTITY_INVALID');
  if (receipt.stage4GraphHash !== hashCanonicalJsonV1(graph) || receipt.stage5DecisionHash !== hashCanonicalJsonV1(stage5)) diagnostics.push('AUTH_STAGE_HASH_DRIFT');
  if (!hasValidDev03Stage6ReceiptHashV2(receipt)) diagnostics.push('AUTH_RECEIPT_HASH_INVALID');
  if (!same(receipt.projectBinding, { projectId: 'oe-dev-03', expectedProjectRevision: 'R11', observedProjectRevision: 'NOT_READ', changedProjectPaths: [] })) diagnostics.push('AUTH_PROJECT_MUTATION_OR_REVISION_READ');
  if (receipt.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE' || receipt.stateEffects.length || receipt.proof.projectMutation !== 'NONE') diagnostics.push('AUTH_FULL_EXECUTION_OR_STATE_EFFECT_CLAIM');
}

function validateState(evidence: Dev03Stage6ExecutionEvidenceV2, diagnostics: string[]): void {
  const fixture = getCanonicalDev03NativeProxyFixtureV2(); const before = jsonReloadClone(fixture.project);
  const aligned = executeDev03BeatAlignmentV2(fixture.expected.strongPeakFrames).project;
  const shaken = executeDev03FinalShakeV2(aligned, fixture.expected.finalHitFrame).project;
  const expected = { before, aligned, shaken };
  for (const key of ['before', 'aligned', 'shaken'] as const) if (!same(evidence.snapshots[key], expected[key])) diagnostics.push(`STATE_${key.toUpperCase()}_DRIFT`);
  const hashes = { beforeStateHash: hashCanonicalJsonV1(before), alignedStateHash: hashCanonicalJsonV1(aligned), shakenStateHash: hashCanonicalJsonV1(shaken) };
  if (!Object.entries(hashes).every(([key, value]) => evidence.receipt.isolatedClone[key as keyof typeof hashes] === value)) diagnostics.push('STATE_RECEIPT_HASH_CHAIN_DRIFT');
  if (!same(evidence.receipt.isolatedClone.changedPaths, DEV03_STAGE6_CHANGED_PATHS_V2)) diagnostics.push('STATE_CHANGED_PATHS_DRIFT');
  if (!same(evidence.receipt.operations, [
    { nodeId: 'compile-sync', owner: 'alignCutsToBeatsWithEvidence', resultStateHash: hashes.alignedStateHash },
    { nodeId: 'compile-shake', owner: 'applyCameraShakeToProject', resultStateHash: hashes.shakenStateHash },
  ])) diagnostics.push('STATE_OPERATION_OWNER_CHAIN_DRIFT');
  if (!same(evidence.receipt.proof, { state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' })) diagnostics.push('STATE_PROOF_DISPOSITION_DRIFT');
}

async function validateArtifacts(evidence: Dev03Stage6ExecutionEvidenceV2, diagnostics: string[]): Promise<void> {
  const bindings = evidence.receipt.artifacts;
  if (bindings.length !== DEV03_STAGE6_ARTIFACT_IDS_V2.length || !DEV03_STAGE6_ARTIFACT_IDS_V2.every((id) => bindings.filter((entry) => entry.artifactId === id).length === 1)) { diagnostics.push('ARTIFACT_SET_INVALID'); return; }
  const root = path.resolve(path.dirname(evidence.receiptPath));
  for (const binding of bindings) {
    const resolved = path.resolve(binding.path);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== FILENAMES[binding.artifactId]) { diagnostics.push(`ARTIFACT_PATH_INVALID:${binding.artifactId}`); continue; }
    try { const bytes = await readFile(resolved); if (!bytes.length || bytes.length !== binding.byteLength || sha256Dev03FixtureBytesV2(bytes) !== binding.sha256) diagnostics.push(`ARTIFACT_BYTES_DRIFT:${binding.artifactId}`); }
    catch (error) { diagnostics.push(`ARTIFACT_UNREADABLE:${binding.artifactId}:${message(error)}`); }
  }
}

function validateRenderProof(proof: Dev03Stage6RenderProofV2, diagnostics: string[]): void {
  if (proof.schemaVersion !== DEV03_STAGE6_NATIVE_PROXY_V2 || !same(proof.composition, { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 })
    || !same(proof.sourceBindings, { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' })) diagnostics.push('VISUAL_RENDER_BINDING_INVALID');
  const video = proof.video;
  if (video.codec !== 'h264' || video.width !== 320 || video.height !== 180 || video.averageFrameRate !== '30/1'
    || video.decodedFrameCount !== 600 || Math.abs(video.durationSeconds - 20) > 0.06 || video.audioStreamCount !== 1) diagnostics.push('VISUAL_VIDEO_PROBE_INVALID');
  const expected = [[118, [33, 82, 145]], [119, [111, 54, 124]], [238, [111, 54, 124]], [239, [33, 82, 145]], [478, [111, 54, 124]], [479, [151, 72, 48]]] as const;
  if (proof.visual.boundarySamples.length !== expected.length || expected.some(([frame, rgb], index) => {
    const sample = proof.visual.boundarySamples[index]; return sample?.frame !== frame || sample.rgb.some((channel, channelIndex) => Math.abs(channel - rgb[channelIndex]) > 22);
  })) diagnostics.push('VISUAL_BOUNDARY_SAMPLE_INVALID');
  if (proof.visual.boundaryMeanAbsDiffs.some((value) => value < 20)) diagnostics.push('VISUAL_BOUNDARY_CHANGE_NOT_VISIBLE');
  if (proof.visual.shakeActiveFrame !== 480 || proof.visual.shakeNeutralFrame !== 490
    || proof.visual.shakeActiveMeanAbsDiff < 0.1 || proof.visual.shakeNeutralMeanAbsDiff > 0.05) diagnostics.push('VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID');
  const audio = proof.audio;
  if (audio.sampleRateHz !== 48_000 || audio.sourceChannels !== 1 || audio.baselineChannels !== 2 || audio.renderedChannels !== 2
    || audio.sourceSampleFrames !== 960_000 || audio.baselineSampleFrames < 959_000 || audio.baselineSampleFrames > 961_000
    || audio.renderedSampleFrames < 959_000 || audio.renderedSampleFrames > 961_000
    || audio.protectedStartFrame !== 250 || audio.protectedEndFrame !== 350) diagnostics.push('AUDIO_DURATION_OR_RANGE_INVALID');
  if (audio.sourceProtectedRms <= 0 || audio.baselineProtectedRms <= 0 || audio.renderedProtectedRms <= 0
    || audio.sourceToRenderedGainRatio < 0.69 || audio.sourceToRenderedGainRatio > 0.72 || audio.sourceToRenderedCorrelation < 0.995
    || audio.baselineToRenderedGainRatio < 0.999 || audio.baselineToRenderedGainRatio > 1.001 || audio.baselineToRenderedCorrelation < 0.99999
    || audio.renderedPeak <= 0 || audio.renderedPeak >= 0.99) diagnostics.push('AUDIO_PROTECTED_CONTENT_INVALID');
  if (proof.browserErrors.length || !same(proof.externalCalls, { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 })) diagnostics.push('AUDIO_RENDER_SIDE_EFFECT_OR_BROWSER_ERROR');
}

function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function jsonReloadClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function dimension(diagnostics: string[], prefix: RegExp): Dimension { return diagnostics.some((item) => prefix.test(item)) ? 'FAIL' : 'PASS'; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function empty(): Readonly<Dev03Stage6EvaluationV2> { return Object.freeze({ assessment: 'UNVERIFIABLE', authorization: 'UNVERIFIABLE', isolatedState: 'UNVERIFIABLE', artifactIntegrity: 'UNVERIFIABLE', renderedVisual: 'UNVERIFIABLE', renderedAudio: 'UNVERIFIABLE', diagnostics: ['NO_STAGE6_EVIDENCE'] }); }
