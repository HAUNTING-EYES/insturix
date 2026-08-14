import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { compileCanonicalStage4DeterministicBaselineV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { compileCanonicalStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { evaluateStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

describe('open-ended planner V2 Stage 4-5 generated-composition research proxy bridge', () => {
  it('authorizes only the bounded preview while keeping the project and full plan blocked', () => {
    const graph = compileCanonicalStage4ResearchProxyPreviewV2() as TestGraph;
    expect(evaluateStage4ResearchProxyPreviewV2(graph)).toEqual({
      disposition: 'PASS', sourceBlockedGraph: 'PASS', capabilityPromotion: 'PASS', programContract: 'PASS',
      previewNode: 'PASS', dependencyGraph: 'PASS', policyIsolation: 'PASS', fullProjectHonesty: 'PASS', diagnostics: [],
    });
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
      taskId: 'DEV-02', disposition: 'PROCEED', reasonCode: 'RESEARCH_PROXY_PREVIEW_VERIFIED',
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY',
      },
    });
    expect(graph.nodes).toHaveLength(5);
    expect(graph.nodes.flatMap(({ writes }) => writes)).toEqual([]);
    expect(graph.nodes.flatMap(({ invalidates }) => invalidates)).toEqual([]);
    expect(graph.nodes.flatMap(({ stateEffects }) => stateEffects)).toEqual([]);
    expect(graph.fullProjectExecutionEligibility).toBe('NOT_EXECUTABLE');
    expect(graph.unresolvedFullProjectIntentNodeIds).toEqual(['node-native-continuation', 'node-proof']);
  });

  it('preserves the historical capability-gap result instead of rewriting frozen evidence', () => {
    expect(decideStage5ProceedOrStopV2(compileCanonicalStage4DeterministicBaselineV2())).toMatchObject({
      disposition: 'CAPABILITY_GAP', reasonCode: 'REQUIRED_CAPABILITY_NOT_IMPLEMENTED',
      missingCapabilityIds: ['generated_composition_program'],
    });
  });

  it('fails closed on promotion, state, dependency, or full-plan tampering', () => {
    const mutations: Array<(graph: TestGraph) => void> = [
      (graph) => { graph.capabilityPromotion.proofBindings.playableReplayReceiptHash = '0'.repeat(64); },
      (graph) => { graph.nodes.at(-1)?.writes.push('project.timeline'); },
      (graph) => { graph.nodes.at(-1)?.stateEffects.push('project.timeline.write'); },
      (graph) => { graph.edges.pop(); },
      (graph) => { graph.fullProjectExecutionEligibility = 'EXECUTABLE'; },
    ];
    for (const mutate of mutations) {
      const graph = mutableGraph();
      mutate(graph);
      expect(evaluateStage4ResearchProxyPreviewV2(graph).disposition).toBe('FAIL');
      expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({
        disposition: 'FAIL', reasonCode: 'STAGE4_RESEARCH_PROXY_INVALID',
      });
    }
  });

  it('is immutable and canonical across repeated compilation', () => {
    const first = compileCanonicalStage4ResearchProxyPreviewV2();
    const second = compileCanonicalStage4ResearchProxyPreviewV2();
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen((first as TestGraph).previewInputBundle)).toBe(true);
  });
});

interface TestGraph extends Record<string, unknown> {
  nodes: Array<{ writes: string[]; invalidates: string[]; stateEffects: string[] }>;
  edges: Array<Record<string, unknown>>;
  capabilityPromotion: { proofBindings: { playableReplayReceiptHash: string } };
  previewInputBundle: Record<string, unknown>;
  fullProjectExecutionEligibility: string;
  unresolvedFullProjectIntentNodeIds: string[];
}

function mutableGraph(): TestGraph {
  return structuredClone(compileCanonicalStage4ResearchProxyPreviewV2()) as TestGraph;
}
