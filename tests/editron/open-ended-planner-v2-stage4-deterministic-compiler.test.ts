import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileCanonicalStage4DeterministicBaselineV2,
  compileStage4DeterministicBaselineV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { evaluateStage4CompiledGraphArtifactV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';
import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';

describe('open-ended planner V2 deterministic Stage-4 compiler baseline', () => {
  it('compiles the legal owned-source subgraph and stops at the generated capability gap', () => {
    const artifact = compileCanonicalStage4DeterministicBaselineV2() as Artifact;
    expect(evaluateStage4CompiledGraphArtifactV2(artifact)).toMatchObject({
      disposition: 'CAPABILITY_BLOCKED',
      sourceChain: 'PASS', operatorResolution: 'PASS', inputBindings: 'PASS', dependencyGraph: 'PASS',
      nodeContract: 'PASS', policyAndRevision: 'PASS', proofAndPreservation: 'PASS', capabilityHonesty: 'PASS',
      diagnostics: [],
    });
    expect(artifact.nodes).toHaveLength(4);
    expect(artifact.edges).toHaveLength(2);
    expect(artifact.nodes.map(({ operatorId }) => operatorId)).toEqual([
      'inspect_user_asset', 'resolve_user_asset_overlay', 'inspect_user_asset', 'resolve_user_asset_overlay',
    ]);
    expect(artifact.nodes.flatMap(({ writes }) => writes)).toEqual([]);
    expect(artifact.nodes.flatMap(({ invalidates }) => invalidates)).toEqual([]);
    expect(artifact.nodes.some(({ operatorId }) => operatorId === 'generated_composition_program')).toBe(false);
    expect(artifact).toMatchObject({
      compileDisposition: 'CAPABILITY_GAP',
      executionEligibility: 'NOT_EXECUTABLE',
      unresolvedIntentNodeIds: ['node-generated-island', 'node-native-continuation', 'node-proof'],
    });
  });

  it('is immutable and canonical across repeated compilation', () => {
    const first = compileCanonicalStage4DeterministicBaselineV2();
    const second = compileCanonicalStage4DeterministicBaselineV2();
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(hashCanonicalJsonV1(first)).toBe('8ffd22ff17a43bd71ec69b28375d6d473b9e3cbd81af7af1b5c3ed96518d8c53');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen((first as Artifact).nodes)).toBe(true);
    expect(Object.isFrozen((first as Artifact).nodes[0])).toBe(true);
  });

  it('fails closed when any approved source artifact drifts', () => {
    const drifted = structuredClone(canonicalEvidenceBoundIntentJson);
    drifted.revisionBinding.expectedProjectRevision = 'R4';
    expect(() => compileStage4DeterministicBaselineV2({
      editorialIntent: canonicalEditorialIntentJson,
      evidenceBoundIntent: drifted,
      evidencePack: evidencePackJson,
    })).toThrow(/STAGE4_BASELINE_EVIDENCE_BOUND_INTENT_DRIFT/);
  });
});

interface Artifact extends Record<string, unknown> {
  nodes: Array<{ operatorId: string; writes: string[]; invalidates: string[] }>;
  edges: Array<Record<string, unknown>>;
}
