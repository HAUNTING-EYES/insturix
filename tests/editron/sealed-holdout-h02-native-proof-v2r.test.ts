import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  assertSealedHoldoutH02RevisionChainV4R,
  assertSealedHoldoutH02SemanticSequenceV4R,
  proveSealedHoldoutH02NativeOutcomeV2R,
  proveSealedHoldoutH02NativeOutcomeV3R2,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  runScriptedBudgetedSealedHoldoutV3R2,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(closingRange = { startFrame: 240, endFrame: 315 }): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
    { name: 'read_project_file', arguments: { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
      targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
    } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', assetId: 'h02-process',
      targetRange: { startFrame: 75, endFrame: 165 }, sourceRange: { startFrame: 0, endFrame: 90 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
    } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', assetId: 'h02-door', targetRange: { startFrame: 165, endFrame: 240 },
      sourceRange: closingRange,
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

type Segment = Readonly<{
  assetId: 'h02-door' | 'h02-process';
  sourceRange: Readonly<{ startFrame: number; endFrame: number }>;
}>;

function semanticPlacements(segments: readonly Segment[]) {
  let cursor = 0;
  return segments.map((segment) => {
    const duration = segment.sourceRange.endFrame - segment.sourceRange.startFrame;
    const target = { startFrame: cursor, endFrame: cursor + duration };
    cursor += duration;
    return { assetId: segment.assetId, target, source: segment.sourceRange };
  });
}

const canonicalSegments = [
  { assetId: 'h02-door', sourceRange: { startFrame: 30, endFrame: 105 } },
  { assetId: 'h02-process', sourceRange: { startFrame: 0, endFrame: 90 } },
  { assetId: 'h02-door', sourceRange: { startFrame: 240, endFrame: 315 } },
] as const;

const semanticContract = {
  doorAssetId: 'h02-door',
  processAssetId: 'h02-process',
  projectDurationInFrames: 720,
  doorOpen: { startFrame: 30, endFrame: 105 },
  doorClose: { startFrame: 240, endFrame: 315 },
  processWindows: [
    { startFrame: 0, endFrame: 90 },
    { startFrame: 120, endFrame: 210 },
    { startFrame: 240, endFrame: 330 },
  ],
  requiredEvidenceRefs: ['E1', 'E2'],
} as const;
const alternateSemanticPlacements = semanticPlacements([
  { assetId: 'h02-door', sourceRange: { startFrame: 10, endFrame: 30 } },
  { assetId: 'h02-process', sourceRange: { startFrame: 400, endFrame: 420 } },
  { assetId: 'h02-door', sourceRange: { startFrame: 200, endFrame: 220 } },
]);
const alternateSemanticContract = {
  ...semanticContract,
  projectDurationInFrames: 100,
  doorOpen: { startFrame: 10, endFrame: 50 },
  doorClose: { startFrame: 200, endFrame: 250 },
  processWindows: [{ startFrame: 400, endFrame: 430 }],
} as const;

async function setup(closingRange?: { startFrame: number; endFrame: number }) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h02-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-02:C1', calls: calls(closingRange),
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

async function setupCurrent(currentCalls: readonly SealedHoldoutScriptedCallV2R[] = calls()) {
  const root = await mkdtemp(join(tmpdir(), 'editron-current-h02-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV3R2({
      caseId: 'HOLD-02:C1', calls: currentCalls,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-02 rendered native proof V2R', () => {
  it('accepts the canonical sequence through the semantic V4 contract', () => {
    expect(assertSealedHoldoutH02SemanticSequenceV4R({
      placements: semanticPlacements(canonicalSegments), contract: semanticContract,
    })).toEqual({ endFrame: 240 });
  });

  it('accepts a shorter legal sequence with a repeated process source window', () => {
    const variableSegments = [
      { assetId: 'h02-door', sourceRange: { startFrame: 35, endFrame: 100 } },
      { assetId: 'h02-process', sourceRange: { startFrame: 130, endFrame: 155 } },
      { assetId: 'h02-process', sourceRange: { startFrame: 130, endFrame: 155 } },
      { assetId: 'h02-door', sourceRange: { startFrame: 245, endFrame: 310 } },
    ] as const;
    expect(assertSealedHoldoutH02SemanticSequenceV4R({
      placements: semanticPlacements(variableSegments), contract: semanticContract,
    })).toEqual({ endFrame: 180 });
  });

  it('rejects a process selection that crosses an undeclared source gap', () => {
    expect(() => assertSealedHoldoutH02SemanticSequenceV4R({
      placements: semanticPlacements([
        canonicalSegments[0],
        { assetId: 'h02-process', sourceRange: { startFrame: 60, endFrame: 150 } },
        canonicalSegments[2],
      ]),
      contract: semanticContract,
    })).toThrow('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID');
  });

  it('rejects close-process-open final ordering', () => {
    expect(() => assertSealedHoldoutH02SemanticSequenceV4R({
      placements: semanticPlacements([
        canonicalSegments[2], canonicalSegments[1], canonicalSegments[0],
      ]),
      contract: semanticContract,
    })).toThrow('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID');
  });

  it('metamorphically follows alternate evidence windows', () => {
    expect(assertSealedHoldoutH02SemanticSequenceV4R({
      placements: alternateSemanticPlacements,
      contract: alternateSemanticContract,
    })).toEqual({ endFrame: 60 });
  });

  it('metamorphically rejects a target beyond the declared project duration', () => {
    expect(() => assertSealedHoldoutH02SemanticSequenceV4R({
      placements: alternateSemanticPlacements,
      contract: { ...alternateSemanticContract, projectDurationInFrames: 59 },
    })).toThrow('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID');
  });

  it('accepts an alternate initial revision through the pure V4 revision chain', () => {
    expect(assertSealedHoldoutH02RevisionChainV4R({
      initialProjectRevision: 'ALT-R9',
      mutations: [
        { expectedProjectRevision: 'ALT-R9', writerIssuedProjectRevision: 'writer-1' },
        { expectedProjectRevision: 'writer-1', writerIssuedProjectRevision: 'writer-2' },
        { expectedProjectRevision: 'writer-2', writerIssuedProjectRevision: 'writer-3' },
      ],
    })).toEqual(['writer-1', 'writer-2', 'writer-3']);
  });

  it('binds the current resource receipt to the same decoded bookend proof', async () => {
    const result = await setupCurrent();
    const proof = await proveSealedHoldoutH02NativeOutcomeV3R2({
      manifest: result.manifest, caseId: 'HOLD-02:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'current-proof'),
    });
    expect(proof).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_H02_RENDERED_NATIVE_PROOF_V3R_2_RESOURCE_BOUND_1',
      authority: 'RESEARCH_RENDERED_NATIVE_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION',
      resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET',
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
      stateEffects: [],
      video: { decodedFrameCount: 240, averageFrameRate: '30/1' },
    });
    expect(proof.runtimeBudgetReceiptSha256)
      .toBe(result.trace.runtimeBudgetReceiptSha256);
    expect(proof.writerIssuedProjectRevisions.every(Boolean)).toBe(true);
  }, 60_000);

  it('proves a causally written open-process-close bookend from decoded frames', async () => {
    const result = await setup();
    const proof = await proveSealedHoldoutH02NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-02:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY', stateEffects: [],
      affectedRange: { startFrame: 0, endFrame: 240 },
      outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED',
      video: { width: 360, height: 640, averageFrameRate: '30/1', decodedFrameCount: 240 },
    });
    expect(proof.selectedSequence.map(({ assetId }) => assetId))
      .toEqual(['h02-door', 'h02-process', 'h02-door']);
    expect(proof.actionProof.openingDoorWidthRatio).toBeLessThan(0.4);
    expect(proof.actionProof.closingDoorWidthRatio).toBeGreaterThan(2.5);
    expect(result.trace.nodes.filter(({ researchCloneMutation }) => researchCloneMutation).slice(1)
      .every(({ argumentReferenceBindings }) => argumentReferenceBindings.length === 1)).toBe(true);
  }, 60_000);

  it('rejects a structurally distinct but semantically wrong closing window', async () => {
    const result = await setup({ startFrame: 120, endFrame: 195 });
    expect(result.evaluation.assessment).toBe('READY_FOR_PROOF');
    await expect(proveSealedHoldoutH02NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-02:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-proof'),
    })).rejects.toThrow('SEALED_H02_PROOF_SELECTED_SEQUENCE_INVALID');
  }, 60_000);
});
