import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v2';
import { resolveGeneratedCompositionSandboxOverlayV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import { evaluateStage4CompiledGraphArtifactV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';
import {
  compileCanonicalStage4DeterministicBaselineV2,
  compileStage4DeterministicBaselineV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import {
  compileCanonicalStage4ResearchProxyPreviewV2,
  compileCurrentDev02Stage4ResearchProxyPreviewV2,
  compileStage4ResearchProxyPreviewV2,
} from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { evaluateStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

describe('open-ended planner V2 Stage 4-5 generated-composition research proxy bridge', () => {
  it('issues a current immutable successor without rewriting the V1 capability', async () => {
    const graph = compileCurrentDev02Stage4ResearchProxyPreviewV2() as TestGraph;
    expect(evaluateStage4ResearchProxyPreviewV2(graph))
      .toMatchObject({ disposition: 'PASS', diagnostics: [] });
    expect(graph.capabilityPromotion).toEqual(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2);
    expect(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.proofBindings.predecessorCapabilityHash)
      .toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.capabilityHash);
    expect(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash)
      .not.toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.capabilityHash);

    const [api, runner, overlay] = await Promise.all([
      readFile('lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx'),
      readFile('lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1.ts'),
      resolveGeneratedCompositionSandboxOverlayV1(process.cwd()),
    ]);
    expect(sha256(api)).toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.implementation.apiImplementationHash);
    expect(sha256(runner)).toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.implementation.runnerImplementationHash);
    expect(overlay.workerImplementationHash)
      .toBe(DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.implementation.workerImplementationHash);
  });

  it('preserves evaluator-approved actual intent lineage through the blocked graph and preview', () => {
    const rename = new Map([
      ['node-source-resolution', 'provider-source'],
      ['node-generated-island', 'provider-island'],
      ['node-native-continuation', 'provider-continuation'],
      ['node-proof', 'provider-handoff-proof'],
    ]);
    const editorialIntent = replaceRoleIds(structuredClone(canonicalIntentJson), rename) as JsonRecord;
    (editorialIntent.unresolvedRequirements as JsonRecord[])[0].detail += ' Candidate wording.';
    const evidenceBoundIntent = replaceRoleIds(structuredClone(canonicalBoundJson), rename) as JsonRecord;
    const reasonCodes = (evidenceBoundIntent.privacyDecision as JsonRecord).reasonCodes as string[];
    reasonCodes.reverse();
    const compilationSource = {
      referenceBlueprint: canonicalReferenceJson, editorialIntent, evidenceBoundIntent, evidencePack: evidencePackJson,
    };
    const sourceGraph = compileStage4DeterministicBaselineV2(compilationSource);
    expect(sourceGraph).toMatchObject({
      sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
      sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
      evidencePackHash: hashCanonicalJsonV1(evidencePackJson),
    });
    expect(evaluateStage4CompiledGraphArtifactV2(sourceGraph, compilationSource))
      .toMatchObject({ disposition: 'CAPABILITY_BLOCKED', diagnostics: [] });
    expect(evaluateStage4CompiledGraphArtifactV2(sourceGraph))
      .toMatchObject({ disposition: 'FAIL', sourceChain: 'FAIL' });

    const graph = compileStage4ResearchProxyPreviewV2({
      program: DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
      sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
      evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
      capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
      sourceBlockedGraph: sourceGraph,
      sourceCompilationSource: compilationSource,
    });
    expect(evaluateStage4ResearchProxyPreviewV2(graph, {
      sourceBlockedGraph: sourceGraph,
      sourceCompilationSource: compilationSource,
    })).toMatchObject({ disposition: 'PASS', diagnostics: [] });
    expect(evaluateStage4ResearchProxyPreviewV2(graph))
      .toMatchObject({ disposition: 'PASS', diagnostics: [] });
    expect(graph).toMatchObject({
      sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
      sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
      previewEligibleIntentNodeIds: ['provider-island'],
      unresolvedFullProjectIntentNodeIds: ['provider-continuation', 'provider-handoff-proof'],
    });
  });

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
  capabilityPromotion: {
    artifactType: string;
    proofBindings: Record<string, unknown>;
  };
  previewInputBundle: Record<string, unknown>;
  fullProjectExecutionEligibility: string;
  unresolvedFullProjectIntentNodeIds: string[];
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

type JsonRecord = Record<string, unknown>;

function mutableGraph(): TestGraph {
  return structuredClone(compileCanonicalStage4ResearchProxyPreviewV2()) as TestGraph;
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
