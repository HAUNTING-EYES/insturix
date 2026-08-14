import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { compileCanonicalStage4DeterministicBaselineV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

describe('open-ended planner V2 deterministic Stage-5 proceed/stop gate', () => {
  it('stops the honest DEV-02 graph at the generated-composition capability gap', () => {
    const decision = decideStage5ProceedOrStopV2(compileCanonicalStage4DeterministicBaselineV2());
    expect(decision).toEqual({
      artifactType: 'ProceedOrStopDecisionV2',
      taskId: 'DEV-02',
      disposition: 'CAPABILITY_GAP',
      reasonCode: 'REQUIRED_CAPABILITY_NOT_IMPLEMENTED',
      missingEvidenceIds: [],
      missingCapabilityIds: ['generated_composition_program'],
      userMessage: 'The edit requires generated_composition_program. Nothing was executed.',
    });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.missingCapabilityIds)).toBe(true);
    expect(hashCanonicalJsonV1(decision)).toBe('5f37c04b4d96704c54ec66ffbcc783062b8f66a7ba028cd3943d17f688daee0c');
  });

  it('fails invalid or falsely-ready graphs instead of trusting their declared disposition', () => {
    const invalid = compiledArtifact();
    invalid.nodes[0].inputs.undeclared = true;
    expect(decideStage5ProceedOrStopV2(invalid)).toMatchObject({
      disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID', missingCapabilityIds: [],
    });

    const falseReady = compiledArtifact();
    falseReady.compileDisposition = 'COMPILED_RESEARCH_PROXY';
    falseReady.executionEligibility = 'RESEARCH_PROXY_ONLY';
    falseReady.diagnostics = [];
    falseReady.unresolvedIntentNodeIds = [];
    expect(decideStage5ProceedOrStopV2(falseReady)).toMatchObject({
      disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID',
    });
  });

  it('keeps missing input unverifiable and produces a canonical decision', () => {
    const first = decideStage5ProceedOrStopV2(undefined);
    const second = decideStage5ProceedOrStopV2(undefined);
    expect(first).toMatchObject({
      taskId: 'UNBOUND_TASK', disposition: 'UNVERIFIABLE', reasonCode: 'STAGE4_GRAPH_UNVERIFIABLE',
    });
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
  });
});

interface TestNode extends Record<string, unknown> { inputs: Record<string, unknown> }
interface TestArtifact extends Record<string, unknown> {
  compileDisposition: string;
  executionEligibility: string;
  nodes: TestNode[];
  diagnostics: Array<Record<string, unknown>>;
  unresolvedIntentNodeIds: string[];
}

function compiledArtifact(): TestArtifact {
  return structuredClone(compileCanonicalStage4DeterministicBaselineV2()) as TestArtifact;
}
