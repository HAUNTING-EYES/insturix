import { describe, expect, it } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import {
  GENERIC_LOWERING_POLICY_VERSION_V2R,
  lowerV2RBoundIntentGeneric,
  type GenericLoweringPolicyV2R,
} from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';

const canonical = getCanonicalDev01Stage123V2();

function lowerBaseline(policy: GenericLoweringPolicyV2R = DEV01_LOWERING_POLICY_V2R) {
  return lowerV2RBoundIntentGeneric({
    taskId: 'DEV-01',
    editorialIntent: canonical.editorialIntentV2R,
    evidenceBoundIntent: canonical.evidenceBoundIntentsV2R.BASELINE,
    evidencePack: canonical.evidencePacks.BASELINE,
    policy,
  });
}

describe('generic V2R lowerer (zero-add/zero-drop)', () => {
  it('compiles every selected DEV-01 operator exactly once with zero add and zero drop', () => {
    const result = lowerBaseline();
    expect(result.zeroAdd).toBe(true);
    expect(result.zeroDrop).toBe(true);
    expect(result.selectedOperatorIds).toHaveLength(12);
    expect(result.compiledOperatorIds).toHaveLength(12);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.startsWith('LOWERING_ZERO_'))).toEqual([]);
    const compiled = result.compiled;
    expect(compiled.compileDisposition).toBe('COMPILED_RESEARCH_PROXY');
    expect(compiled.executionEligibility).toBe('RESEARCH_PROXY_ONLY');
    expect(compiled.unresolvedIntentNodeIds).toEqual([]);
    expect(compiled.lowering).toMatchObject({
      policyVersion: GENERIC_LOWERING_POLICY_VERSION_V2R,
      zeroAdd: true,
      zeroDrop: true,
      compiledOperatorCount: 12,
      selectedOperatorCount: 12,
    });
  });

  it('binds revision, fact, evidence, static and node-output fields mechanically', () => {
    const { compiled } = lowerBaseline();
    const nodes = compiled.nodes as Array<{ operatorId: string; inputs: Record<string, unknown>; nodeId: string }>;
    const cut = nodes.find(({ operatorId }) => operatorId === 'cut_section');
    expect(cut?.inputs.projectId).toBe('oe-dev-01');
    expect(cut?.inputs.expectedProjectRevision).toBe('R7');
    expect(cut?.inputs.targetRange).toEqual(['151', '196']);
    const findTranscript = nodes.find(({ operatorId }) => operatorId === 'find_transcript_moment');
    expect(findTranscript?.inputs.query).toBe('dead air after the phrase here it is');
    const setKeyframes = nodes.find(({ operatorId }) => operatorId === 'set_keyframes');
    expect(setKeyframes?.inputs.keyframes).toBe('compile-node-resolve-product.proposedOperation');
    const duck = nodes.find(({ operatorId }) => operatorId === 'apply_audio_ducking');
    expect(duck?.inputs.audioPlan).toBe('compile-node-find-audio.result');
  });

  it('emits DATA edges only from declared intent dependencies', () => {
    const { compiled } = lowerBaseline();
    const edges = compiled.edges as Array<{ fromNodeId: string; toNodeId: string; edgeType: string }>;
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every(({ edgeType }) => edgeType === 'DATA')).toBe(true);
    const nodeIds = new Set((compiled.nodes as Array<{ nodeId: string }>).map(({ nodeId }) => nodeId));
    expect(edges.every(({ fromNodeId, toNodeId }) => nodeIds.has(fromNodeId) && nodeIds.has(toNodeId))).toBe(true);
  });

  it('refuses to invent operators: zero-add holds even when the policy is starved', () => {
    const starved: GenericLoweringPolicyV2R = {
      ...DEV01_LOWERING_POLICY_V2R,
      fieldBindings: {
        projectId: { source: 'REVISION_PROJECT_ID' },
        expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
      },
    };
    const result = lowerBaseline(starved);
    expect(result.zeroAdd).toBe(true);
    expect(result.compiledOperatorIds.length).toBeLessThan(result.selectedOperatorIds.length);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('INPUT_BINDING_MISSING'),
    ]));
    expect(result.compiled.compileDisposition).not.toBe('COMPILED_RESEARCH_PROXY');
  });

  it('marks research-only-not-implemented operators as capability gaps, never executable nodes', () => {
    const withGenerated = {
      ...canonical.evidenceBoundIntentsV2R.BASELINE,
      nodes: [
        ...(canonical.evidenceBoundIntentsV2R.BASELINE.nodes as unknown[]),
        { intentNodeId: 'node-generated', selectedOperatorId: 'generated_composition_program', alternativeOperatorIds: [], evidenceBindingIds: [], preservationIds: [], proofObligationIds: [], bindingStatus: 'BOUND', unresolvedRequirementIds: [] },
      ],
    };
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01',
      editorialIntent: canonical.editorialIntentV2R,
      evidenceBoundIntent: withGenerated,
      evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV01_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.unresolvedIntentNodeIds).toContain('node-generated');
    expect(result.compiledOperatorIds).not.toContain('generated_composition_program');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('LOWERING_OPERATOR_NOT_COMPILABLE:node-generated'),
    ]));
    expect(result.zeroAdd).toBe(true);
  });

  it('carries the exact source-chain hashes into the compiled graph', () => {
    const { compiled } = lowerBaseline();
    expect(compiled.artifactType).toBe('CompiledOperationGraphV2');
    expect(compiled.taskId).toBe('DEV-01');
    expect(compiled.operatorCatalogVersion).toBe('2.0.0');
    expect(compiled.projectId).toBe('oe-dev-01');
    expect(compiled.expectedProjectRevision).toBe('R7');
    expect(typeof compiled.sourceEditorialIntentHash).toBe('string');
    expect(typeof compiled.evidencePackHash).toBe('string');
    expect(compiled.proofPolicy).toMatchObject({
      mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION',
      onUnverifiable: 'BLOCK_EXECUTION',
    });
  });

  it('hard-rejects dangling requiresNodeIds and excludes the dependent node', () => {
    const editorialIntent = structuredClone(canonical.editorialIntentV2R) as { nodes: Array<{ intentNodeId: string; requiresNodeIds: string[] }> };
    const target = editorialIntent.nodes.find(({ intentNodeId }) => intentNodeId === 'node-cut');
    expect(target).toBeTruthy();
    target!.requiresNodeIds = [...target!.requiresNodeIds, 'node-that-does-not-exist'];
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01',
      editorialIntent,
      evidenceBoundIntent: canonical.evidenceBoundIntentsV2R.BASELINE,
      evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV01_LOWERING_POLICY_V2R,
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'LOWERING_DANGLING_DEPENDENCY:node-cut:node-that-does-not-exist',
    ]));
    expect(result.compiled.unresolvedIntentNodeIds).toContain('node-cut');
    const compiledIntentIds = (result.compiled.nodes as Array<{ intentNodeId: string }>).map(({ intentNodeId }) => intentNodeId);
    expect(compiledIntentIds).not.toContain('node-cut');
    // The dangling node stays accounted for, so zero-drop still holds.
    expect(result.zeroDrop).toBe(true);
    expect(result.zeroAdd).toBe(true);
  });
});
