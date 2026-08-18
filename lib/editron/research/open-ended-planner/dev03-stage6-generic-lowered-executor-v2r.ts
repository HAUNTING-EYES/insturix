import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  executeDev03BeatAlignmentV2,
  executeDev03FinalShakeV2,
  getCanonicalDev03NativeProxyFixtureV2,
  sha256Dev03FixtureBytesV2,
} from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  DEV03_STAGE6_CHANGED_PATHS_V2,
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6ArtifactBindingV2,
  type Dev03Stage6ProjectSnapshotV2,
  type Dev03Stage6RendererV2,
} from './dev03-stage6-native-proxy-contract-v2';
import { renderDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-renderer-v2';
import type { GenericLoweringResultV2R } from './generic-lowerer-v2r';

type JsonRecord = Record<string, unknown>;

// Stage-6 isolated-proxy executor for a GENERIC-LOWERED DEV-03 model plan.
//
// Unlike dev03-stage6-native-proxy-executor-v2 (which validates a hand-authored
// compiled graph against canonical DEV-03 node ids through the stage-4/stage-5
// gates), this executor accepts the generic lowerer's output for a MODEL-produced
// plan. It validates by OPERATOR ID and by the lowerer's zero-add/zero-drop
// invariants rather than by canonical node ids, then executes the same bounded
// DEV-03 proxy (measured beat alignment + restrained final shake) through the real
// production owners on an isolated clone, and renders.
//
// The beat evidence is hash-bound to the canonical fixture: execution uses the
// fixture's measured strong-peak frames (the ground truth the model's
// find_audio_moment node is licensed against). The model's contribution — the
// selected operations, their dependency order, and the semantic nodeInputs — is
// validated by the lowerer before execution is permitted.
//
// Research proxy only: no production project, database, or live chat mutation.

export interface Dev03Stage6GenericLoweredExecutionV2 {
  snapshots: {
    before: Dev03Stage6ProjectSnapshotV2;
    aligned: Dev03Stage6ProjectSnapshotV2;
    shaken: Dev03Stage6ProjectSnapshotV2;
  };
  receipt: JsonRecord;
  receiptPath: string;
}

const REQUIRED_MUTATION_OPERATORS = ['sync_cuts_to_beats', 'apply_camera_shake'] as const;

export async function executeDev03Stage6GenericLoweredV2(input: {
  lowering: Readonly<GenericLoweringResultV2R>;
  executionId: string;
  createdAt: string;
  outputDir: string;
  renderer?: Dev03Stage6RendererV2;
}): Promise<Dev03Stage6GenericLoweredExecutionV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  validateLoweredGraph(input.lowering);

  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const before = jsonReloadClone(fixture.project) as Dev03Stage6ProjectSnapshotV2;
  const alignment = executeDev03BeatAlignmentV2(fixture.expected.strongPeakFrames);
  const aligned = alignment.project as Dev03Stage6ProjectSnapshotV2;
  const shaken = executeDev03FinalShakeV2(aligned, fixture.expected.finalHitFrame).project as Dev03Stage6ProjectSnapshotV2;

  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev03Stage6NativeProxyV2)({
    alignedProjectSnapshot: aligned,
    shakenProjectSnapshot: shaken,
    outputDir: input.outputDir,
  });
  const artifacts = await bindArtifacts(rendered.artifactPaths);
  const stateHashes = {
    before: hashCanonicalJsonV1(before),
    aligned: hashCanonicalJsonV1(aligned),
    shaken: hashCanonicalJsonV1(shaken),
  };
  const unsigned = {
    schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    executor: 'GENERIC_LOWERED_MODEL_PLAN_V2R',
    taskId: 'DEV-03',
    executionId: input.executionId,
    createdAt: input.createdAt,
    loweredGraphHash: hashCanonicalJsonV1(input.lowering.compiled),
    loweringInvariants: {
      zeroAdd: input.lowering.zeroAdd,
      zeroDrop: input.lowering.zeroDrop,
      compiledOperatorCount: input.lowering.compiledOperatorIds.length,
      selectedOperatorIds: [...input.lowering.selectedOperatorIds],
    },
    projectBinding: {
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      observedProjectRevision: 'NOT_READ', changedProjectPaths: [],
    },
    isolatedClone: {
      beforeStateHash: stateHashes.before,
      alignedStateHash: stateHashes.aligned,
      shakenStateHash: stateHashes.shaken,
      changedPaths: [...DEV03_STAGE6_CHANGED_PATHS_V2],
    },
    operations: [
      { operatorId: 'sync_cuts_to_beats', owner: 'alignCutsToBeatsWithEvidence', resultStateHash: stateHashes.aligned },
      { operatorId: 'apply_camera_shake', owner: 'applyCameraShakeToProject', resultStateHash: stateHashes.shaken },
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
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(input.outputDir, `dev03-stage6-generic-lowered-receipt-${input.executionId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return {
    snapshots: { before, aligned, shaken },
    receipt,
    receiptPath,
  };
}

// Validate the generic-lowered graph for a model plan. Checks the lowerer's
// invariants and that the required mutation operators are present BY OPERATOR ID
// (model node ids are arbitrary, so canonical node ids are not checked here).
function validateLoweredGraph(lowering: Readonly<GenericLoweringResultV2R>): void {
  if (!lowering.zeroAdd) throw new Error('DEV03_STAGE6_GENERIC_LOWERING_ZERO_ADD_VIOLATED');
  if (!lowering.zeroDrop) throw new Error('DEV03_STAGE6_GENERIC_LOWERING_ZERO_DROP_VIOLATED');
  if (lowering.compiled.compileDisposition !== 'COMPILED_RESEARCH_PROXY') {
    throw new Error(`DEV03_STAGE6_GENERIC_LOWERING_NOT_COMPILED:${String(lowering.compiled.compileDisposition)}`);
  }
  const compiledOperatorIds = new Set(lowering.compiledOperatorIds);
  for (const required of REQUIRED_MUTATION_OPERATORS) {
    if (!compiledOperatorIds.has(required)) {
      throw new Error(`DEV03_STAGE6_GENERIC_LOWERING_OPERATOR_MISSING:${required}`);
    }
  }
}

async function bindArtifacts(paths: Readonly<Record<string, string>>): Promise<Dev03Stage6ArtifactBindingV2[]> {
  const pathKeys = Object.keys(paths).sort();
  const expectedKeys = [...DEV03_STAGE6_ARTIFACT_IDS_V2].sort();
  if (!sameSet(pathKeys, expectedKeys)) throw new Error('DEV03_STAGE6_ARTIFACT_SET_INVALID');
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
