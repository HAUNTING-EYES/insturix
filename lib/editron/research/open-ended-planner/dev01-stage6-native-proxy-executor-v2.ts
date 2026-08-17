import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  type Dev01Stage6ArtifactBindingV2,
  type Dev01Stage6ExecutionEvidenceV2,
  type Dev01Stage6ProjectSnapshotV2,
  type Dev01Stage6ReceiptV2,
  type Dev01Stage6RendererV2,
} from './dev01-stage6-native-proxy-contract-v2';
import { evaluateDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-evaluator-v2';
import { renderDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-renderer-v2';
import {
  evaluateDev01Stage4CompiledGraphV2,
  type Dev01Stage4SourceV2,
} from './stage4-dev01-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

type JsonRecord = Record<string, unknown>;

export async function executeDev01Stage6NativeProxyV2(input: {
  graph: unknown;
  source?: Dev01Stage4SourceV2;
  executionId: string;
  createdAt: string;
  outputDir: string;
  renderer?: Dev01Stage6RendererV2;
}): Promise<Dev01Stage6ExecutionEvidenceV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  const graphEvaluation = evaluateDev01Stage4CompiledGraphV2(input.graph, input.source);
  if (graphEvaluation.assessment !== 'PASS') {
    throw new Error(`DEV01_STAGE6_STAGE4_BLOCKED:${graphEvaluation.diagnostics.join('|')}`);
  }
  const stage5 = decideStage5ProceedOrStopV2(input.graph, { dev01Source: input.source });
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') {
    throw new Error(`DEV01_STAGE6_STAGE5_BLOCKED:${stage5.disposition}:${stage5.reasonCode}`);
  }

  const fixture = getCanonicalDev01NativeProxyFixtureV2();
  const before = jsonReloadClone(fixture.project) as Dev01Stage6ProjectSnapshotV2;
  const truthCut = executeDev01TruthCutV2();
  const afterCut = {
    ...jsonReloadClone(fixture.project),
    durationInFrames: truthCut.newDurationInFrames,
    overlays: jsonReloadClone(truthCut.overlays),
  } satisfies Dev01Stage6ProjectSnapshotV2;
  const afterPush = applyProductPush(afterCut, truthCut.splitChildren);
  const afterDuck = applyDialogueDucking(afterPush);

  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev01Stage6NativeProxyV2)({
    projectSnapshot: afterDuck,
    outputDir: input.outputDir,
  });
  const artifacts = await bindArtifacts(rendered.artifactPaths);
  const stateHashes = {
    before: hashCanonicalJsonV1(before),
    afterCut: hashCanonicalJsonV1(afterCut),
    afterPush: hashCanonicalJsonV1(afterPush),
    afterDuck: hashCanonicalJsonV1(afterDuck),
  };
  const unsigned = {
    schemaVersion: DEV01_STAGE6_NATIVE_PROXY_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    taskId: 'DEV-01',
    executionId: input.executionId,
    createdAt: input.createdAt,
    stage4GraphHash: hashCanonicalJsonV1(input.graph),
    stage5DecisionHash: hashCanonicalJsonV1(stage5),
    projectBinding: {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
      observedProjectRevision: 'NOT_READ', changedProjectPaths: [],
    },
    isolatedClone: {
      beforeStateHash: stateHashes.before,
      afterCutStateHash: stateHashes.afterCut,
      afterPushStateHash: stateHashes.afterPush,
      afterDuckStateHash: stateHashes.afterDuck,
      changedPaths: [
        'durationInFrames', 'overlays', 'overlays.104.keyframeTracks.scale',
        'overlays.104.styles.transformOrigin', 'overlays.103.styles.duckingConfig',
      ],
    },
    operations: [
      { nodeId: 'compile-cut', owner: 'timeline-range-cut', resultStateHash: stateHashes.afterCut },
      { nodeId: 'compile-push', owner: 'resolveAtomicZoomForm+buildKeyframeMutationPatch', resultStateHash: stateHashes.afterPush },
      { nodeId: 'compile-duck', owner: 'applyAudioDuckingToProject', resultStateHash: stateHashes.afterDuck },
    ],
    artifacts,
    renderProof: rendered.proof,
    proof: {
      state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
      renderedAudio: 'PASS', projectMutation: 'NONE',
    },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
    stateEffects: [],
  } as const;
  const receipt: Dev01Stage6ReceiptV2 = {
    ...unsigned,
    receiptHash: hashCanonicalJsonV1(unsigned),
  };
  const evidence: Dev01Stage6ExecutionEvidenceV2 = {
    snapshots: { before, afterCut, afterPush, afterDuck },
    receipt,
    receiptPath: path.join(input.outputDir, 'dev01-stage6-receipt-v2.json'),
  };
  const evaluation = await evaluateDev01Stage6NativeProxyV2({
    graph: input.graph,
    source: input.source,
    evidence,
  });
  if (evaluation.assessment !== 'PASS') {
    throw new Error(`DEV01_STAGE6_PROOF_FAILED:${evaluation.diagnostics.join('|')}`);
  }
  await writeFile(evidence.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

function applyProductPush(
  project: Dev01Stage6ProjectSnapshotV2,
  splitChildren: Array<{ beforeOverlayId: number; rightOverlayId: number }>,
): Dev01Stage6ProjectSnapshotV2 {
  const targetId = splitChildren.find(({ beforeOverlayId }) => beforeOverlayId === 101)?.rightOverlayId;
  if (targetId !== 104) throw new Error('DEV01_STAGE6_POSTCUT_TARGET_UNRESOLVED');
  const overlays = records(project.overlays);
  const target = overlays.find((overlay) => overlay.id === targetId);
  if (!target) throw new Error('DEV01_STAGE6_POSTCUT_OVERLAY_MISSING');
  const plan = resolveKeyframeEditParams(project, {
    overlayId: targetId, targetFrame: 160, direction: 'in', scaleDelta: 0.12,
    evidenceModality: 'visual', evidenceStrength: 1, focalPoint: { x: 0.745, y: 0.5 },
  });
  if (plan.status !== 'ready' || !plan.useWith?.set_keyframes
    || plan.startFrame !== 160 || plan.endFrame !== 171
    || plan.localStartFrame !== 9 || plan.localEndFrame !== 20) {
    throw new Error(`DEV01_STAGE6_ZOOM_FORM_UNRESOLVED:${plan.status}`);
  }
  const mutation = buildKeyframeMutationPatch({ overlay: target, ...plan.useWith.set_keyframes });
  return replaceOverlay(project, targetId, { ...target, ...mutation.patch });
}

function applyDialogueDucking(project: Dev01Stage6ProjectSnapshotV2): Dev01Stage6ProjectSnapshotV2 {
  const plan = applyAudioDuckingToProject(project);
  if (plan.status !== 'changed' || plan.updates.length !== 1 || plan.updates[0]?.overlayId !== 103
    || !sameSet(plan.voiceSourceOverlayIds.map(String), ['102', '105'])) {
    throw new Error(`DEV01_STAGE6_DUCK_FORM_UNRESOLVED:${plan.status}`);
  }
  return replaceOverlay(project, 103, {
    ...requireOverlay(project, 103),
    styles: plan.updates[0].nextStyles,
  });
}

function replaceOverlay(
  project: Dev01Stage6ProjectSnapshotV2, id: number, replacement: JsonRecord,
): Dev01Stage6ProjectSnapshotV2 {
  return jsonReloadClone({ ...project, overlays: records(project.overlays).map((overlay) => (
    overlay.id === id ? replacement : overlay
  )) });
}

async function bindArtifacts(paths: Readonly<Record<string, string>>): Promise<Dev01Stage6ArtifactBindingV2[]> {
  const pathKeys = Object.keys(paths).sort();
  const expectedKeys = [...DEV01_STAGE6_ARTIFACT_IDS_V2].sort();
  if (!sameSet(pathKeys, expectedKeys)) throw new Error('DEV01_STAGE6_ARTIFACT_SET_INVALID');
  return Promise.all(DEV01_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const artifactPath = paths[artifactId];
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`DEV01_STAGE6_ARTIFACT_EMPTY:${artifactId}`);
    return { artifactId, path: artifactPath, sha256: sha256Dev01FixtureBytesV2(bytes), byteLength: bytes.length };
  }));
}

function requireOverlay(project: Dev01Stage6ProjectSnapshotV2, id: number): JsonRecord {
  const overlay = records(project.overlays).find((candidate) => candidate.id === id);
  if (!overlay) throw new Error(`DEV01_STAGE6_OVERLAY_MISSING:${id}`);
  return overlay;
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function jsonReloadClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(executionId)) throw new Error('DEV01_STAGE6_EXECUTION_ID_INVALID');
  if (new Date(createdAt).toISOString() !== createdAt) throw new Error('DEV01_STAGE6_CREATED_AT_INVALID');
}
