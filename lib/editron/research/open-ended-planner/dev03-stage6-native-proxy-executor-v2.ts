import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { executeDev03BeatAlignmentV2, executeDev03FinalShakeV2, getCanonicalDev03NativeProxyFixtureV2, sha256Dev03FixtureBytesV2 } from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2, DEV03_STAGE6_CHANGED_PATHS_V2, DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6ArtifactBindingV2, type Dev03Stage6ExecutionEvidenceV2,
  type Dev03Stage6ProjectSnapshotV2, type Dev03Stage6ReceiptV2, type Dev03Stage6RendererV2,
} from './dev03-stage6-native-proxy-contract-v2';
import { evaluateDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-evaluator-v2';
import { renderDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-renderer-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from './stage4-dev03-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

export async function executeDev03Stage6NativeProxyV2(input: {
  graph: unknown;
  executionId: string;
  createdAt: string;
  outputDir: string;
  renderer?: Dev03Stage6RendererV2;
}): Promise<Dev03Stage6ExecutionEvidenceV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  const stage4 = evaluateDev03Stage4CompiledGraphV2(input.graph);
  if (stage4.assessment !== 'PASS') throw new Error(`DEV03_STAGE6_STAGE4_BLOCKED:${stage4.diagnostics.join('|')}`);
  const stage5 = decideStage5ProceedOrStopV2(input.graph);
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') {
    throw new Error(`DEV03_STAGE6_STAGE5_BLOCKED:${stage5.disposition}:${stage5.reasonCode}`);
  }

  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const before = jsonReloadClone(fixture.project) as Dev03Stage6ProjectSnapshotV2;
  const alignment = executeDev03BeatAlignmentV2(fixture.expected.strongPeakFrames);
  const aligned = alignment.project as Dev03Stage6ProjectSnapshotV2;
  const shaken = executeDev03FinalShakeV2(aligned, fixture.expected.finalHitFrame).project as Dev03Stage6ProjectSnapshotV2;

  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev03Stage6NativeProxyV2)({
    alignedProjectSnapshot: aligned, shakenProjectSnapshot: shaken, outputDir: input.outputDir,
  });
  const artifacts = await bindArtifacts(rendered.artifactPaths);
  const hashes = { before: hashCanonicalJsonV1(before), aligned: hashCanonicalJsonV1(aligned), shaken: hashCanonicalJsonV1(shaken) };
  const unsigned = {
    schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2, authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION', taskId: 'DEV-03',
    executionId: input.executionId, createdAt: input.createdAt,
    stage4GraphHash: hashCanonicalJsonV1(input.graph), stage5DecisionHash: hashCanonicalJsonV1(stage5),
    projectBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11', observedProjectRevision: 'NOT_READ', changedProjectPaths: [] },
    isolatedClone: { beforeStateHash: hashes.before, alignedStateHash: hashes.aligned, shakenStateHash: hashes.shaken, changedPaths: [...DEV03_STAGE6_CHANGED_PATHS_V2] },
    operations: [
      { nodeId: 'compile-sync', owner: 'alignCutsToBeatsWithEvidence', resultStateHash: hashes.aligned },
      { nodeId: 'compile-shake', owner: 'applyCameraShakeToProject', resultStateHash: hashes.shaken },
    ],
    artifacts, renderProof: rendered.proof,
    proof: { state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
  } as const;
  const receipt: Dev03Stage6ReceiptV2 = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const evidence: Dev03Stage6ExecutionEvidenceV2 = {
    snapshots: { before, aligned, shaken }, receipt,
    receiptPath: path.join(input.outputDir, 'dev03-stage6-receipt-v2.json'),
  };
  const evaluation = await evaluateDev03Stage6NativeProxyV2({ graph: input.graph, evidence });
  if (evaluation.assessment !== 'PASS') throw new Error(`DEV03_STAGE6_PROOF_FAILED:${evaluation.diagnostics.join('|')}`);
  await writeFile(evidence.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

async function bindArtifacts(paths: Readonly<Record<string, string>>): Promise<Dev03Stage6ArtifactBindingV2[]> {
  if (!sameSet(Object.keys(paths), [...DEV03_STAGE6_ARTIFACT_IDS_V2])) throw new Error('DEV03_STAGE6_ARTIFACT_SET_INVALID');
  return Promise.all(DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const artifactPath = paths[artifactId];
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`DEV03_STAGE6_ARTIFACT_EMPTY:${artifactId}`);
    return { artifactId, path: artifactPath, sha256: sha256Dev03FixtureBytesV2(bytes), byteLength: bytes.length };
  }));
}

function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function jsonReloadClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(executionId)) throw new Error('DEV03_STAGE6_EXECUTION_ID_INVALID');
  if (new Date(createdAt).toISOString() !== createdAt) throw new Error('DEV03_STAGE6_CREATED_AT_INVALID');
}
