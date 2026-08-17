import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileCanonicalDev01Stage4NativeV2,
  compileDev01Stage4NativeV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';
import { buildDev01ProviderRelativeSourceV2 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev01-provider-relative-source-v2';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 DEV-01 deterministic Stage-5 gate', () => {
  it('authorizes only the bounded research proxy after independent DEV-01 validation', () => {
    const decision = decideStage5ProceedOrStopV2(compileCanonicalDev01Stage4NativeV2());
    expect(decision).toEqual({
      artifactType: 'ProceedOrStopDecisionV2',
      taskId: 'DEV-01',
      disposition: 'PROCEED',
      reasonCode: 'RESEARCH_PROXY_GRAPH_VERIFIED',
      missingEvidenceIds: [],
      missingCapabilityIds: [],
      userMessage: 'The research proxy graph passed independent validation and may proceed to bounded proxy execution. The project and full edit remain untouched.',
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY',
        projectMutation: 'DENY',
        fullProjectExecution: 'DENY',
      },
    });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.executionAuthorization)).toBe(true);
  });

  it('is canonical across repeated decisions', () => {
    const first = decideStage5ProceedOrStopV2(compileCanonicalDev01Stage4NativeV2());
    const second = decideStage5ProceedOrStopV2(compileCanonicalDev01Stage4NativeV2());
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(hashCanonicalJsonV1(first)).toBe('2d131f4cbf812cbd0bf6bd5071394392612ba8b5d89ed16fa0fd6a2f47bce8a9');
  });

  it('authorizes a provider-relative graph only when its exact Stage-1-to-3 source is supplied', () => {
    const source = buildDev01ProviderRelativeSourceV2();
    const graph = compileDev01Stage4NativeV2(source);
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
      disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID',
    });
    expect(decideStage5ProceedOrStopV2(graph, { dev01Source: source })).toMatchObject({
      disposition: 'PROCEED', reasonCode: 'RESEARCH_PROXY_GRAPH_VERIFIED',
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY',
        projectMutation: 'DENY', fullProjectExecution: 'DENY',
      },
    });
  });

  it('blocks stale downstream revisions and removes execution authorization', () => {
    const graph = compiled();
    node(graph, 'compile-duck').revisionBinding.expectedProjectRevision = 'R7';
    expect(decideStage5ProceedOrStopV2(graph)).toEqual(expect.objectContaining({
      taskId: 'DEV-01', disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID',
      missingEvidenceIds: [], missingCapabilityIds: [],
    }));
    expect(decideStage5ProceedOrStopV2(graph)).not.toHaveProperty('executionAuthorization');
  });

  it('blocks pre-cut identities, fabricated coordinates, and missing proof independently', () => {
    const oldIdentity = compiled();
    node(oldIdentity, 'compile-resolve-product').inputs.overlayId = '101';
    expect(decideStage5ProceedOrStopV2(oldIdentity)).toMatchObject({ disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID' });

    const fabricatedCoordinate = compiled();
    (node(fabricatedCoordinate, 'compile-resolve-product').inputs.intent as JsonRecord).outputTimelineFrame = 205;
    expect(decideStage5ProceedOrStopV2(fabricatedCoordinate)).toMatchObject({ disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID' });

    const missingProof = compiled();
    (missingProof.proofPolicy as JsonRecord).proofObligationIds = ['proof-revision'];
    expect(decideStage5ProceedOrStopV2(missingProof)).toMatchObject({ disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID' });
  });

  it('does not convert a declared production state into authorization', () => {
    const graph = compiled();
    graph.executionEligibility = 'PRODUCTION';
    const decision = decideStage5ProceedOrStopV2(graph);
    expect(decision).toMatchObject({
      disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID',
    });
    expect(decision).not.toHaveProperty('executionAuthorization');
  });
});

function compiled(): Artifact {
  return structuredClone(compileCanonicalDev01Stage4NativeV2()) as Artifact;
}

function node(graph: Artifact, nodeId: string): TestNode {
  const result = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!result) throw new Error(`Missing ${nodeId}`);
  return result;
}

interface TestNode extends JsonRecord {
  nodeId: string;
  inputs: JsonRecord;
  revisionBinding: { projectId: string; expectedProjectRevision: string };
}

interface Artifact extends JsonRecord {
  nodes: TestNode[];
  executionEligibility: string;
}
