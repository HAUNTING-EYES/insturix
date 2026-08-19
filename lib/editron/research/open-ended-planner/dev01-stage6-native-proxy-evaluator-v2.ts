import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { applyAudioDuckingToProject } from '@/lib/editron/agent/chat-audio-tools';
import { resolveKeyframeEditParams } from '@/lib/editron/agent/chat-visual-tools';
import { buildKeyframeMutationPatch } from '@/lib/editron/services/keyframe-mutation';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  executeDev01TruthCutV2,
  getCanonicalDev01NativeProxyFixtureV2,
  sha256Dev01FixtureBytesV2,
} from './dev01-native-proxy-fixture-v2';
import {
  DEV01_STAGE6_ARTIFACT_IDS_V2,
  DEV01_STAGE6_NATIVE_PROXY_V2,
  hasValidDev01Stage6ReceiptHashV2,
  type Dev01Stage6ExecutionEvidenceV2,
  type Dev01Stage6ProjectSnapshotV2,
} from './dev01-stage6-native-proxy-contract-v2';
import { validateDev01Stage6RenderProofV2 } from './dev01-stage6-render-proof-validator-v2';
import {
  evaluateDev01Stage4CompiledGraphV2,
  type Dev01Stage4SourceV2,
} from './stage4-dev01-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

type JsonRecord = Record<string, unknown>;
type Dimension = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Dev01Stage6EvaluationV2 {
  assessment: Dimension;
  authorization: Dimension;
  isolatedState: Dimension;
  artifactIntegrity: Dimension;
  renderedVisual: Dimension;
  renderedAudio: Dimension;
  diagnostics: readonly string[];
}

const ARTIFACT_FILENAMES = {
  SOURCE_VIDEO: 'source-host.mp4', SOURCE_DIALOGUE_WAV: 'source-dialogue.wav',
  SOURCE_BGM_WAV: 'source-bgm.wav', PRE_REVEAL_STILL: 'frame-0159.png',
  REVEAL_STILL: 'frame-0160.png', ZOOMED_STILL: 'frame-0171.png',
  FULL_AV_PROXY: 'dev01-native-proxy.mp4', BGM_GAIN_PROOF_WAV: 'dev01-bgm-gain-proof.wav',
} as const;

export async function evaluateDev01Stage6NativeProxyV2(input: {
  graph: unknown;
  source?: Dev01Stage4SourceV2;
  evidence: Dev01Stage6ExecutionEvidenceV2;
}): Promise<Readonly<Dev01Stage6EvaluationV2>> {
  if (!input?.evidence?.receipt || !input.evidence.snapshots) return emptyEvaluation();
  const diagnostics: string[] = [];
  const { receipt } = input.evidence;
  validateAuthorization(input.graph, input.source, receipt, diagnostics);
  validateState(input.evidence, diagnostics);
  await validateArtifacts(input.evidence, diagnostics);
  diagnostics.push(...validateDev01Stage6RenderProofV2(receipt.renderProof).diagnostics);
  const authorization = dimension(diagnostics, /^AUTH_/);
  const isolatedState = dimension(diagnostics, /^STATE_/);
  const artifactIntegrity = dimension(diagnostics, /^ARTIFACT_/);
  const renderedVisual = dimension(diagnostics, /^VISUAL_/);
  const renderedAudio = dimension(diagnostics, /^AUDIO_/);
  const dimensions = [authorization, isolatedState, artifactIntegrity, renderedVisual, renderedAudio];
  return Object.freeze({
    assessment: dimensions.includes('FAIL') ? 'FAIL' : 'PASS',
    authorization, isolatedState, artifactIntegrity, renderedVisual, renderedAudio,
    diagnostics: [...new Set(diagnostics)].sort(),
  });
}

function validateAuthorization(
  graph: unknown,
  source: Dev01Stage4SourceV2 | undefined,
  receipt: Dev01Stage6ExecutionEvidenceV2['receipt'],
  diagnostics: string[],
): void {
  const stage4 = evaluateDev01Stage4CompiledGraphV2(graph, source);
  const stage5 = decideStage5ProceedOrStopV2(graph, { dev01Source: source });
  if (stage4.assessment !== 'PASS') diagnostics.push('AUTH_STAGE4_NOT_PASS');
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') diagnostics.push('AUTH_STAGE5_NOT_BOUNDED_DENY_MUTATION');
  if (receipt.schemaVersion !== DEV01_STAGE6_NATIVE_PROXY_V2
    || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION'
    || receipt.taskId !== 'DEV-01') diagnostics.push('AUTH_RECEIPT_IDENTITY_INVALID');
  if (receipt.stage4GraphHash !== hashCanonicalJsonV1(graph)
    || receipt.stage5DecisionHash !== hashCanonicalJsonV1(stage5)) diagnostics.push('AUTH_STAGE_HASH_DRIFT');
  if (!hasValidDev01Stage6ReceiptHashV2(receipt)) diagnostics.push('AUTH_RECEIPT_HASH_INVALID');
  if (!same(receipt.projectBinding, {
    projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
    observedProjectRevision: 'NOT_READ', changedProjectPaths: [],
  })) diagnostics.push('AUTH_PROJECT_MUTATION_OR_REVISION_READ');
  if (receipt.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE'
    || receipt.stateEffects.length !== 0 || receipt.proof.projectMutation !== 'NONE') {
    diagnostics.push('AUTH_FULL_EXECUTION_OR_STATE_EFFECT_CLAIM');
  }
}

function validateState(evidence: Dev01Stage6ExecutionEvidenceV2, diagnostics: string[]): void {
  let expected: Dev01Stage6ExecutionEvidenceV2['snapshots'];
  try { expected = deriveExpectedSnapshots(); } catch (error) {
    diagnostics.push(`STATE_OWNER_RECOMPUTE_FAILED:${message(error)}`); return;
  }
  for (const key of ['before', 'afterCut', 'afterPush', 'afterDuck'] as const) {
    if (!same(evidence.snapshots[key], expected[key])) diagnostics.push(`STATE_${key.toUpperCase()}_DRIFT`);
  }
  const hashes = {
    beforeStateHash: hashCanonicalJsonV1(expected.before),
    afterCutStateHash: hashCanonicalJsonV1(expected.afterCut),
    afterPushStateHash: hashCanonicalJsonV1(expected.afterPush),
    afterDuckStateHash: hashCanonicalJsonV1(expected.afterDuck),
  };
  if (!Object.entries(hashes).every(([key, value]) => evidence.receipt.isolatedClone[key as keyof typeof hashes] === value)) {
    diagnostics.push('STATE_RECEIPT_HASH_CHAIN_DRIFT');
  }
  const expectedChangedPaths = [
    'durationInFrames', 'overlays', 'overlays.104.keyframeTracks.scale',
    'overlays.104.styles.transformOrigin', 'overlays.103.styles.duckingConfig',
  ];
  if (!same(evidence.receipt.isolatedClone.changedPaths, expectedChangedPaths)) diagnostics.push('STATE_CHANGED_PATHS_DRIFT');
  const expectedOperations = [
    { nodeId: 'compile-cut', owner: 'timeline-range-cut', resultStateHash: hashes.afterCutStateHash },
    { nodeId: 'compile-push', owner: 'resolveAtomicZoomForm+buildKeyframeMutationPatch', resultStateHash: hashes.afterPushStateHash },
    { nodeId: 'compile-duck', owner: 'applyAudioDuckingToProject', resultStateHash: hashes.afterDuckStateHash },
  ];
  if (!same(evidence.receipt.operations, expectedOperations)) diagnostics.push('STATE_OPERATION_OWNER_CHAIN_DRIFT');
  if (!same(evidence.receipt.proof, {
    state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
    renderedAudio: 'PASS', projectMutation: 'NONE',
  })) diagnostics.push('STATE_PROOF_DISPOSITION_DRIFT');
}

async function validateArtifacts(evidence: Dev01Stage6ExecutionEvidenceV2, diagnostics: string[]): Promise<void> {
  const bindings = evidence.receipt.artifacts;
  if (bindings.length !== DEV01_STAGE6_ARTIFACT_IDS_V2.length
    || !DEV01_STAGE6_ARTIFACT_IDS_V2.every((id) => bindings.filter((entry) => entry.artifactId === id).length === 1)) {
    diagnostics.push('ARTIFACT_SET_INVALID'); return;
  }
  const root = path.resolve(path.dirname(evidence.receiptPath));
  for (const binding of bindings) {
    const resolved = path.resolve(binding.path);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== ARTIFACT_FILENAMES[binding.artifactId]) {
      diagnostics.push(`ARTIFACT_PATH_INVALID:${binding.artifactId}`); continue;
    }
    try {
      const bytes = await readFile(resolved);
      if (!bytes.length || bytes.length !== binding.byteLength
        || sha256Dev01FixtureBytesV2(bytes) !== binding.sha256) diagnostics.push(`ARTIFACT_BYTES_DRIFT:${binding.artifactId}`);
    } catch (error) { diagnostics.push(`ARTIFACT_UNREADABLE:${binding.artifactId}:${message(error)}`); }
  }
}

function deriveExpectedSnapshots(): Dev01Stage6ExecutionEvidenceV2['snapshots'] {
  const fixture = getCanonicalDev01NativeProxyFixtureV2();
  const before = jsonReloadClone(fixture.project) as Dev01Stage6ProjectSnapshotV2;
  const cut = executeDev01TruthCutV2();
  const afterCut = { ...jsonReloadClone(fixture.project), durationInFrames: cut.newDurationInFrames,
    overlays: jsonReloadClone(cut.overlays) } satisfies Dev01Stage6ProjectSnapshotV2;
  const target = requireOverlay(afterCut, 104);
  const plan = resolveKeyframeEditParams(afterCut, { overlayId: 104, targetFrame: 160, direction: 'in',
    scaleDelta: 0.12, evidenceModality: 'visual', evidenceStrength: 1, focalPoint: { x: 0.745, y: 0.5 } });
  if (plan.status !== 'ready' || !plan.useWith?.set_keyframes) throw new Error('ZOOM_OWNER_UNRESOLVED');
  const mutation = buildKeyframeMutationPatch({ overlay: target, ...plan.useWith.set_keyframes });
  const afterPush = replaceOverlay(afterCut, 104, { ...target, ...mutation.patch });
  const duck = applyAudioDuckingToProject(afterPush);
  if (duck.status !== 'changed' || duck.updates.length !== 1 || duck.updates[0]?.overlayId !== 103) throw new Error('DUCK_OWNER_UNRESOLVED');
  const afterDuck = replaceOverlay(afterPush, 103, { ...requireOverlay(afterPush, 103), styles: duck.updates[0].nextStyles });
  return { before, afterCut, afterPush, afterDuck };
}

function replaceOverlay(project: Dev01Stage6ProjectSnapshotV2, id: number, replacement: JsonRecord): Dev01Stage6ProjectSnapshotV2 {
  return jsonReloadClone({ ...project, overlays: records(project.overlays).map((overlay) => overlay.id === id ? replacement : overlay) });
}
function requireOverlay(project: Dev01Stage6ProjectSnapshotV2, id: number): JsonRecord { const found = records(project.overlays).find((overlay) => overlay.id === id); if (!found) throw new Error(`OVERLAY_MISSING:${id}`); return found; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function jsonReloadClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function dimension(diagnostics: string[], prefix: RegExp): Dimension { return diagnostics.some((item) => prefix.test(item)) ? 'FAIL' : 'PASS'; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function emptyEvaluation(): Readonly<Dev01Stage6EvaluationV2> { return Object.freeze({ assessment: 'UNVERIFIABLE', authorization: 'UNVERIFIABLE', isolatedState: 'UNVERIFIABLE', artifactIntegrity: 'UNVERIFIABLE', renderedVisual: 'UNVERIFIABLE', renderedAudio: 'UNVERIFIABLE', diagnostics: ['NO_STAGE6_EVIDENCE'] }); }
