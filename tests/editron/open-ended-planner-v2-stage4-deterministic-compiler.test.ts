import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileCanonicalStage4DeterministicBaselineV2,
  compileStage4DeterministicBaselineV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { evaluateStage4CompiledGraphArtifactV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';
import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
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
    })).toThrow(/DEV02_STAGE4_ROLE_RESOLUTION:STAGE3_SOURCE_INVALID/);
  });

  it('compiles and evaluates equivalent provider-authored role names and topology without hidden IDs', () => {
    const source = terraLikeSource();
    const artifact = compileStage4DeterministicBaselineV2(source) as Artifact;
    expect(new Set(artifact.nodes.map(({ intentNodeId }) => intentNodeId)))
      .toEqual(new Set(['N-RESOLVE-CENTRAL-SOURCE']));
    expect(artifact.unresolvedIntentNodeIds).toEqual([
      'N-GENERATE-STACKED-PANEL-ISLAND',
      'N-PLACE-CONTINUATION-FOOTAGE',
      'N-VALIDATE-RELEASE-HANDOFF',
    ]);
    expect(evaluateStage4CompiledGraphArtifactV2(artifact, source)).toMatchObject({
      disposition: 'CAPABILITY_BLOCKED',
      sourceChain: 'PASS', operatorResolution: 'PASS', inputBindings: 'PASS', dependencyGraph: 'PASS',
      nodeContract: 'PASS', policyAndRevision: 'PASS', proofAndPreservation: 'PASS', capabilityHonesty: 'PASS',
      diagnostics: [],
    });

    const ambiguous = structuredClone(source);
    const proof = records(record(ambiguous.editorialIntent).nodes)
      .find(({ intentNodeId }) => intentNodeId === 'N-VALIDATE-RELEASE-HANDOFF');
    if (proof) {
      proof.failureDisposition = 'CAPABILITY_GAP';
      proof.executionForm = 'GENERATED_COMPOSITION';
      proof.candidateCapabilityIds = ['generated_composition_program'];
    }
    expect(() => compileStage4DeterministicBaselineV2(ambiguous))
      .toThrow(/STAGE2_SOURCE_INVALID:.*CONTINUATION_BEFORE_PROOF_MISSING/);
  });
});

interface Artifact extends Record<string, unknown> {
  nodes: Array<{ intentNodeId: string; operatorId: string; writes: string[]; invalidates: string[] }>;
  edges: Array<Record<string, unknown>>;
  unresolvedIntentNodeIds: string[];
}

function terraLikeSource() {
  const rename = new Map([
    ['node-source-resolution', 'N-RESOLVE-CENTRAL-SOURCE'],
    ['node-generated-island', 'N-GENERATE-STACKED-PANEL-ISLAND'],
    ['node-native-continuation', 'N-PLACE-CONTINUATION-FOOTAGE'],
    ['node-proof', 'N-VALIDATE-RELEASE-HANDOFF'],
  ]);
  const editorialIntent = replaceRoleIds(structuredClone(canonicalEditorialIntentJson), rename) as JsonRecord;
  const evidenceBoundIntent = replaceRoleIds(structuredClone(canonicalEvidenceBoundIntentJson), rename) as JsonRecord;
  const editorialNodes = records(editorialIntent.nodes);
  const continuation = editorialNodes.find(({ intentNodeId }) => intentNodeId === 'N-PLACE-CONTINUATION-FOOTAGE');
  const proof = editorialNodes.find(({ intentNodeId }) => intentNodeId === 'N-VALIDATE-RELEASE-HANDOFF');
  if (!continuation || !proof) throw new Error('TEST_ROLE_FIXTURE_INVALID');
  continuation.candidateCapabilityIds = ['use_matching_footage', 'move_retime_overlay'];
  continuation.requiresNodeIds = ['N-RESOLVE-CENTRAL-SOURCE', 'N-GENERATE-STACKED-PANEL-ISLAND'];
  proof.candidateCapabilityIds = ['read_project_file', 'get_timeline_view'];
  proof.executionForm = 'NATIVE';
  proof.requiresNodeIds = ['N-GENERATE-STACKED-PANEL-ISLAND', 'N-PLACE-CONTINUATION-FOOTAGE'];
  const boundNodes = records(evidenceBoundIntent.nodes);
  const boundContinuation = boundNodes.find(({ intentNodeId }) => intentNodeId === 'N-PLACE-CONTINUATION-FOOTAGE');
  const boundProof = boundNodes.find(({ intentNodeId }) => intentNodeId === 'N-VALIDATE-RELEASE-HANDOFF');
  if (!boundContinuation || !boundProof) throw new Error('TEST_BOUND_ROLE_FIXTURE_INVALID');
  boundContinuation.candidateCapabilityIds = continuation.candidateCapabilityIds;
  boundProof.candidateCapabilityIds = proof.candidateCapabilityIds;
  return { referenceBlueprint: canonicalReferenceBlueprintJson, editorialIntent, evidenceBoundIntent, evidencePack: evidencePackJson };
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
function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord =>
    entry != null && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
type JsonRecord = Record<string, unknown>;
