import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { evaluateStage4CompiledGraphArtifactV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';
import { buildStage4ExactCompilationSmokePreflightV2 } from '@/lib/editron/research/open-ended-planner/stage4-exact-compilation-smoke-v2';
import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';

describe('open-ended planner V2 isolated Stage-4 exact-compilation smoke', () => {
  it('fails closed while the inherited Stage-4 input ceiling is impossible', async () => {
    await expect(buildStage4ExactCompilationSmokePreflightV2()).rejects.toThrow(/STAGE4_LOCAL_INPUT_BUDGET_EXCEEDED:OPENAI_LUNA:47333\/7500/);
  });

  it('accepts exact read-only compilation while keeping the requested graph capability-blocked', () => {
    expect(evaluateStage4CompiledGraphArtifactV2(compiledArtifact())).toMatchObject({
      disposition: 'CAPABILITY_BLOCKED',
      sourceChain: 'PASS', operatorResolution: 'PASS', inputBindings: 'PASS', dependencyGraph: 'PASS',
      nodeContract: 'PASS', policyAndRevision: 'PASS', proofAndPreservation: 'PASS', capabilityHonesty: 'PASS',
      diagnostics: [],
    });
  });

  it('rejects invalid ports, stale revisions, missing source inspection, cycles, and false readiness independently', () => {
    const extraInput = compiledArtifact();
    extraInput.nodes[0].inputs.undeclared = true;
    expect(evaluateStage4CompiledGraphArtifactV2(extraInput)).toMatchObject({ disposition: 'FAIL', inputBindings: 'FAIL' });

    const stale = compiledArtifact();
    stale.nodes[0].revisionBinding.expectedProjectRevision = 'R2';
    expect(evaluateStage4CompiledGraphArtifactV2(stale)).toMatchObject({ disposition: 'FAIL', policyAndRevision: 'FAIL' });

    const missingSource = compiledArtifact();
    missingSource.nodes = missingSource.nodes.filter(({ nodeId }) => nodeId !== 'compile-inspect-close');
    expect(evaluateStage4CompiledGraphArtifactV2(missingSource)).toMatchObject({ disposition: 'FAIL', operatorResolution: 'FAIL' });

    const cyclic = compiledArtifact();
    cyclic.nodes[0].requires = ['compile-inspect-close'];
    cyclic.nodes[1].requires = ['compile-inspect-wide'];
    cyclic.edges = [
      { edgeId: 'edge-wide-close', fromNodeId: 'compile-inspect-wide', toNodeId: 'compile-inspect-close', edgeType: 'DATA' },
      { edgeId: 'edge-close-wide', fromNodeId: 'compile-inspect-close', toNodeId: 'compile-inspect-wide', edgeType: 'DATA' },
    ];
    expect(evaluateStage4CompiledGraphArtifactV2(cyclic)).toMatchObject({ disposition: 'FAIL', dependencyGraph: 'FAIL' });

    const falseReady = compiledArtifact();
    falseReady.compileDisposition = 'COMPILED_RESEARCH_PROXY';
    falseReady.executionEligibility = 'RESEARCH_PROXY_ONLY';
    falseReady.diagnostics = [];
    falseReady.unresolvedIntentNodeIds = [];
    expect(evaluateStage4CompiledGraphArtifactV2(falseReady)).toMatchObject({ disposition: 'FAIL', capabilityHonesty: 'FAIL' });
  });
});

interface TestNode extends Record<string, unknown> {
  nodeId: string;
  inputs: Record<string, unknown>;
  requires: string[];
  traceRefs: string[];
  revisionBinding: { projectId: string; expectedProjectRevision: string };
}

interface TestArtifact extends Record<string, unknown> {
  compileDisposition: string;
  executionEligibility: string;
  nodes: TestNode[];
  edges: Array<Record<string, unknown>>;
  diagnostics: Array<Record<string, unknown>>;
  unresolvedIntentNodeIds: string[];
}

function compiledArtifact(): TestArtifact {
  const proofIds = canonicalEvidenceBoundIntentJson.proofPlan.map(({ proofObligationId }) => proofObligationId);
  const preservationIds = canonicalEvidenceBoundIntentJson.preservationBindings.map(({ preservationId }) => preservationId);
  return {
    artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-02',
    compileDisposition: 'CAPABILITY_GAP', executionEligibility: 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(canonicalEditorialIntentJson),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(canonicalEvidenceBoundIntentJson),
    evidencePackHash: hashCanonicalJsonV1(evidencePackJson),
    operatorCatalogVersion: '2.0.0', projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
    nodes: [
      readNode('compile-inspect-wide', 'node-source-resolution', 'inspect_user_asset', { projectId: 'oe-dev-02', assetId: 'dev02-wide' }, ['fact-project-revision', 'fact-source-dev02-wide', 'fact-source-windows'], ['proof-asset-rights', 'proof-source-ranges'], 'SOURCE_FRAME', ['fact-source-windows'], ['fact-source-dev02-wide']),
      readNode('compile-inspect-close', 'node-source-resolution', 'inspect_user_asset', { projectId: 'oe-dev-02', assetId: 'dev02-close' }, ['fact-project-revision', 'fact-source-dev02-close', 'fact-source-windows'], ['proof-asset-rights', 'proof-source-ranges'], 'SOURCE_FRAME', ['fact-source-windows'], ['fact-source-dev02-close']),
      readNode('compile-read-project', 'node-proof', 'read_project_file', { projectId: 'oe-dev-02', expectedProjectRevision: 'R3' }, ['fact-project-revision', 'fact-project-timebase'], ['proof-revision-freshness'], 'PROJECT_TICK', ['fact-project-target-range'], []),
    ],
    edges: [],
    proofPolicy: { proofVersion: 'OE_STAGE4_PROOF_POLICY_V1', mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION', proofObligationIds: proofIds, preservationIds, onUnverifiable: 'BLOCK_EXECUTION' },
    diagnostics: [
      { diagnosticId: 'diag-generated-owner', code: 'CAPABILITY_NOT_IMPLEMENTED', intentNodeIds: ['node-generated-island'], operatorIds: ['generated_composition_program'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-continuation-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: ['node-native-continuation'], operatorIds: ['get_timeline_view', 'resolve_user_asset_overlay'], factIds: ['fact-support-generated-composition', 'fact-exit-continuity'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-proof-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: ['node-proof'], operatorIds: ['read_project_file', 'get_timeline_view'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
    ],
    unresolvedIntentNodeIds: ['node-generated-island', 'node-native-continuation', 'node-proof'],
  };
}

function readNode(nodeId: string, intentNodeId: string, operatorId: 'inspect_user_asset' | 'read_project_file', inputs: Record<string, unknown>, reads: string[], proofObligationIds: string[], coordinateDomain: 'SOURCE_FRAME' | 'PROJECT_TICK', rangeFactIds: string[], assetFactIds: string[]): TestNode {
  return {
    nodeId, intentNodeId, operatorId,
    operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@2.0.0#${operatorId}`,
    ownerRef: `v1:${operatorId}`, inputs, reads, writes: [], requires: [], produces: ['result', 'evidence'], invalidates: [],
    coordinateBindings: [{ coordinateDomain, timebaseFactIds: coordinateDomain === 'PROJECT_TICK' ? ['fact-project-timebase'] : [], rangeFactIds, assetFactIds }],
    revisionBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3' }, stabilityRequirement: 'RANGE_STABLE', stateEffects: [],
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: [intentNodeId, 'fact-project-revision'] },
    proofObligationIds, failureDisposition: 'ABORT_GRAPH', retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: ['fact-rights-policy', 'fact-privacy-egress-policy'], concurrency: { class: 'READ_SHARED', conflictDomainRefs: [] },
    resourcePolicyId: 'OE_STAGE4_READ_V1', reversibility: { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: [intentNodeId, ...proofObligationIds, ...(operatorId === 'inspect_user_asset' ? ['bind-source-media-and-windows'] : [])],
  };
}
