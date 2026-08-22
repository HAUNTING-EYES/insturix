import { describe, expect, it } from 'vitest';

import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import {
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';
import { cloneCanonicalJsonV1, hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileCanonicalDev02HybridStage4GraphV2,
  compileDev02HybridStage4GraphV2,
  type Dev02HybridStage4SourceV2,
} from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage4-compiler-v2';
import { buildCurrentDev02HybridResearchGraphV2 } from '@/lib/editron/research/open-ended-planner/dev02-current-hybrid-research-graph-v2';
import { evaluateDev02HybridStage4GraphV2 } from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage4-evaluator-v2';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v2';
import type { GeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { compileStage4DeterministicBaselineV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { compileStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

describe('open-ended planner V2 DEV-02 full hybrid Stage 4-5', () => {
  it('assembles the current V2 graph while preserving canonical V1 history', () => {
    const current = buildCurrentDev02HybridResearchGraphV2() as TestGraph;
    const historical = compileCanonicalDev02HybridStage4GraphV2() as TestGraph;
    expect(evaluateDev02HybridStage4GraphV2(current))
      .toMatchObject({ assessment: 'PASS', diagnostics: [] });
    expect(current.capabilityPromotion)
      .toEqual(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2);
    expect(historical.capabilityPromotion)
      .toEqual(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1);
    expect(current.graphHash).not.toBe(historical.graphHash);
  });

  it('compiles the generated island, native continuation, and proof as one isolated hybrid graph', () => {
    const graph = compileCanonicalDev02HybridStage4GraphV2() as TestGraph;
    expect(evaluateDev02HybridStage4GraphV2(graph)).toEqual({
      assessment: 'PASS',
      generatedIslandGraph: 'PASS',
      nativeContinuation: 'PASS',
      fullHybridProof: 'PASS',
      dependencyGraph: 'PASS',
      projectIsolation: 'PASS',
      artifactIntegrity: 'PASS',
      diagnostics: [],
    });
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
      taskId: 'DEV-02',
      disposition: 'PROCEED',
      reasonCode: 'DEV02_FULL_HYBRID_RESEARCH_PROXY_VERIFIED',
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY',
        projectMutation: 'DENY',
        fullProjectExecution: 'DENY',
      },
    });
    expect(graph.nodes.map(({ intentNodeId }) => intentNodeId)).toContain('node-native-continuation');
    expect(graph.nodes.map(({ intentNodeId }) => intentNodeId)).toContain('node-proof');
    expect(graph.nodes.flatMap(({ writes }) => writes)).toEqual([]);
    expect(graph.stateEffects).toEqual([]);
    expect(graph.unresolvedResearchIntentNodeIds).toEqual([]);
    expect(graph.productionProjectExecutionEligibility).toBe('NOT_EXECUTABLE');
  });

  it('binds the native continuation to the exact post-island source and project ranges', () => {
    const graph = compileCanonicalDev02HybridStage4GraphV2() as TestGraph;
    const continuation = graph.nodes.find(({ intentNodeId }) => intentNodeId === 'node-native-continuation');
    expect(continuation?.inputs).toMatchObject({
      assetId: 'dev02-close',
      targetRange: { coordinateDomain: 'PROJECT_TICK', start: '180', endExclusive: '345' },
      sourceRange: { coordinateDomain: 'SOURCE_FRAME', start: '180', endExclusive: '345' },
    });
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromNodeId: 'compile-preview-generated-island',
        toNodeId: 'compile-resolve-native-continuation',
        edgeType: 'TIME_ANCHOR',
      }),
    ]));
  });

  it('preserves alpha-renamed provider roles through the complete hybrid graph', () => {
    const source = alphaRenamedHybridSource();
    const graph = compileDev02HybridStage4GraphV2(source) as TestGraph;
    expect(graph.nodes.map(({ intentNodeId }) => intentNodeId)).toEqual(expect.arrayContaining([
      'provider-source', 'provider-island', 'provider-continuation', 'provider-proof',
    ]));
    expect(evaluateDev02HybridStage4GraphV2(graph, source))
      .toMatchObject({ assessment: 'PASS', diagnostics: [] });
  });

  it('selects the model-declared move/retime owner only inside an isolated proxy clone', () => {
    const source = alphaRenamedHybridSource(true);
    const graph = compileDev02HybridStage4GraphV2(source) as TestGraph;
    const continuation = graph.nodes.find(({ intentNodeId }) => intentNodeId === 'provider-continuation');
    expect(continuation).toMatchObject({
      operatorId: 'move_retime_overlay',
      mutationScope: 'ISOLATED_PROXY_CLONE',
      inputs: {
        overlayId: 'ov-next',
        targetRange: { coordinateDomain: 'PROJECT_TICK', start: '180', endExclusive: '345' },
        sourceRange: { coordinateDomain: 'SOURCE_FRAME', start: '180', endExclusive: '345' },
      },
    });
    expect(continuation?.writes.every((value) => value.startsWith('isolatedProxy.'))).toBe(true);
    expect(graph.stateEffects).toEqual([]);
    expect(graph.hybridScope.projectMutation).toBe('DENY');
    expect(evaluateDev02HybridStage4GraphV2(graph, source))
      .toMatchObject({ assessment: 'PASS', diagnostics: [] });
    expect(decideStage5ProceedOrStopV2(graph).disposition).toBe('PROCEED');

    const escaped = structuredClone(graph);
    escaped.nodes.find(({ intentNodeId }) => intentNodeId === 'provider-continuation')!.mutationScope = 'PROJECT';
    expect(evaluateDev02HybridStage4GraphV2(escaped, source).projectIsolation).toBe('FAIL');
  });

  it('fails closed on boundary, dependency, state-effect, or eligibility tampering', () => {
    const mutations: Array<(graph: TestGraph) => void> = [
      (graph) => {
        const continuation = graph.nodes.find(({ intentNodeId }) => intentNodeId === 'node-native-continuation');
        continuation!.inputs.sourceRange.start = '181';
      },
      (graph) => { graph.edges.pop(); },
      (graph) => { graph.nodes.at(-1)!.stateEffects.push('project.timeline.write'); },
      (graph) => { graph.productionProjectExecutionEligibility = 'EXECUTABLE'; },
    ];
    for (const mutate of mutations) {
      const graph = structuredClone(compileCanonicalDev02HybridStage4GraphV2()) as TestGraph;
      mutate(graph);
      expect(evaluateDev02HybridStage4GraphV2(graph).assessment).toBe('FAIL');
      expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
        disposition: 'FAIL',
        reasonCode: 'DEV02_FULL_HYBRID_RESEARCH_PROXY_INVALID',
      });
    }
  });

  it('fails before Stage 5 when prose observations are not promoted to executable proof claims', () => {
    const source = alphaRenamedHybridSource(false, true);
    const graph = compileDev02HybridStage4GraphV2(source);
    expect(evaluateDev02HybridStage4GraphV2(graph, source)).toMatchObject({
      assessment: 'FAIL',
      generatedIslandGraph: 'FAIL',
      diagnostics: [expect.stringContaining('GENERATED_ISLAND_PROOF_CLAIMS_UNBINDABLE')],
    });
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
      disposition: 'FAIL',
      reasonCode: 'DEV02_FULL_HYBRID_RESEARCH_PROXY_INVALID',
    });
  });

  it('is immutable and canonical across repeated compilation', () => {
    const first = compileCanonicalDev02HybridStage4GraphV2();
    const second = compileCanonicalDev02HybridStage4GraphV2();
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen((first as TestGraph).hybridScope)).toBe(true);
  });
});

interface TestNode {
  intentNodeId: string;
  operatorId: string;
  mutationScope?: string;
  inputs: {
    assetId?: string;
    sourceRange: { coordinateDomain?: string; start: string; endExclusive: string };
    targetRange?: { coordinateDomain?: string; start: string; endExclusive: string };
  };
  writes: string[];
  invalidates: string[];
  stateEffects: string[];
}

interface TestGraph extends Record<string, unknown> {
  nodes: TestNode[];
  edges: Array<Record<string, unknown>>;
  stateEffects: string[];
  hybridScope: Record<string, unknown>;
  unresolvedResearchIntentNodeIds: string[];
  productionProjectExecutionEligibility: string;
  capabilityPromotion: unknown;
  graphHash: string;
}

function alphaRenamedHybridSource(
  useMutationContinuation = false,
  removeExecutableProofClaims = false,
): Dev02HybridStage4SourceV2 {
  const rename = new Map([
    ['node-source-resolution', 'provider-source'],
    ['node-generated-island', 'provider-island'],
    ['node-native-continuation', 'provider-continuation'],
    ['node-proof', 'provider-proof'],
  ]);
  const editorialIntent = replaceRoleIds(structuredClone(canonicalIntentJson), rename) as Record<string, unknown>;
  const evidenceBoundIntent = replaceRoleIds(structuredClone(canonicalBoundJson), rename) as Record<string, unknown>;
  if (useMutationContinuation) {
    setContinuationCandidates(editorialIntent, ['move_retime_overlay', 'trim_overlay', 'update_overlay']);
    setContinuationCandidates(evidenceBoundIntent, ['move_retime_overlay', 'trim_overlay', 'update_overlay']);
  }
  const referenceBlueprint = structuredClone(canonicalReferenceJson);
  if (removeExecutableProofClaims) {
    for (const claim of referenceBlueprint.targetClaims as Array<Record<string, unknown>>) {
      claim.claimKind = 'REFERENCE_OBSERVATION';
      claim.subjects = [];
      claim.relation = 'OBSERVED';
      claim.desired = {
        valueType: 'unstructured-prose',
        value: 'a visual treatment was observed without an executable proof predicate',
        unit: 'observation',
        comparisonBasis: 'descriptive prose only',
      };
    }
  }
  const sourceCompilationSource = {
    referenceBlueprint,
    editorialIntent,
    evidenceBoundIntent,
    evidencePack: evidencePackJson,
  };
  const sourceBlockedGraph = compileStage4DeterministicBaselineV2(sourceCompilationSource);
  const program = cloneCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as GeneratedCompositionProgramV1;
  program.projectBinding = { ...program.projectBinding, evidencePackHash: hashCanonicalJsonV1(evidencePackJson) };
  program.referenceBinding = { ...program.referenceBinding, blueprintHash: hashCanonicalJsonV1(referenceBlueprint) };
  const islandEvaluationSource = { sourceBlockedGraph, sourceCompilationSource };
  const islandGraph = compileStage4ResearchProxyPreviewV2({
    program,
    sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack: evidencePackJson,
    referenceBlueprint,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
    sourceBlockedGraph,
    sourceCompilationSource,
  });
  return { islandGraph, islandEvaluationSource };
}

function setContinuationCandidates(value: Record<string, unknown>, candidateCapabilityIds: string[]): void {
  const nodes = value.nodes as Array<Record<string, unknown>>;
  const node = nodes.find((entry) => entry.intentNodeId === 'provider-continuation');
  if (!node) throw new Error('provider continuation fixture missing');
  node.candidateCapabilityIds = candidateCapabilityIds;
}

function replaceRoleIds(value: unknown, rename: Map<string, string>): unknown {
  if (typeof value === 'string') return rename.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => replaceRoleIds(entry, rename));
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, replaceRoleIds(entry, rename)]));
  }
  return value;
}
