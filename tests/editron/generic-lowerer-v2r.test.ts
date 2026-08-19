import { describe, expect, it } from 'vitest';

import {
  COMPILED_PORT_BINDING_VERSION_V2R,
  projectCompiledPortValueV2R,
  type CompiledPortBindingEdgeV2R,
} from '@/lib/editron/research/open-ended-planner/compiled-port-binding-v2r';
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
    expect(result.selectedOperatorIds).toHaveLength(6);
    expect(result.compiledOperatorIds).toHaveLength(6);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.startsWith('LOWERING_ZERO_'))).toEqual([]);
    const compiled = result.compiled;
    expect(compiled.compileDisposition).toBe('COMPILED_RESEARCH_PROXY');
    expect(compiled.executionEligibility).toBe('RESEARCH_PROXY_ONLY');
    expect(compiled.unresolvedIntentNodeIds).toEqual([]);
    expect(compiled.lowering).toMatchObject({
      policyVersion: GENERIC_LOWERING_POLICY_VERSION_V2R,
      zeroAdd: true,
      zeroDrop: true,
      compiledOperatorCount: 6,
      selectedOperatorCount: 6,
    });
  });

  it('binds model intent and causal owner outputs without fixture mutation parameters', () => {
    const { compiled } = lowerBaseline();
    const nodes = compiled.nodes as Array<{ operatorId: string; inputs: Record<string, unknown>; nodeId: string }>;
    const cut = nodes.find(({ operatorId }) => operatorId === 'cut_section');
    expect(cut?.inputs.projectId).toBe('oe-dev-01');
    expect(cut?.inputs.expectedProjectRevision).toBe('R7');
    expect(cut?.inputs).not.toHaveProperty('targetRange');
    const resolveTranscript = nodes.find(({ operatorId }) => operatorId === 'resolve_transcript_edit');
    expect(resolveTranscript?.inputs.query).toBe('here it is');
    expect(resolveTranscript?.inputs.intent).toEqual({
      action: 'cut_after_phrase',
      goal: 'remove dead air preserving all spoken words',
    });
    const setKeyframes = nodes.find(({ operatorId }) => operatorId === 'set_keyframes');
    expect(setKeyframes?.inputs).not.toHaveProperty('keyframes');
    expect(setKeyframes?.inputs).not.toHaveProperty('overlayId');
    const duck = nodes.find(({ operatorId }) => operatorId === 'apply_audio_ducking');
    expect(duck?.inputs.audioPlan).toEqual({ enabled: true });

    const bindings = (compiled.edges as CompiledPortBindingEdgeV2R[])
      .filter(({ edgeType }) => edgeType === 'DATA');
    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        bindingVersion: COMPILED_PORT_BINDING_VERSION_V2R,
        fromNodeId: 'compile-node-resolve-cut', fromPort: 'proposedOperation',
        toNodeId: 'compile-node-cut', toPort: 'targetRange',
        projectionPath: ['arguments', 'targetRange'],
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-cut', fromPort: 'timelineCoordinateTransform',
        toNodeId: 'compile-node-find-product', toPort: 'timelineCoordinateTransform',
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-cut', fromPort: 'splitChildren',
        toNodeId: 'compile-node-find-product', toPort: 'splitChildren',
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-find-product', fromPort: 'overlayId',
        toNodeId: 'compile-node-resolve-product', toPort: 'overlayId',
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-resolve-product', fromPort: 'proposedOperation',
        toNodeId: 'compile-node-push-in', toPort: 'keyframes',
        projectionPath: ['arguments', 'keyframes'],
      }),
      expect.objectContaining({
        fromNodeId: 'compile-node-resolve-product', fromPort: 'proposedOperation',
        toNodeId: 'compile-node-push-in', toPort: 'focalPoint',
        projectionPath: ['arguments', 'focalPoint'],
      }),
    ]));
    expect(bindings.every(({ expectedInputSchemaHash }) => /^[a-f0-9]{64}$/.test(expectedInputSchemaHash))).toBe(true);
  });

  it('emits explicit typed data ports and control-only ordering edges', () => {
    const { compiled } = lowerBaseline();
    const edges = compiled.edges as Array<{
      fromNodeId: string; fromPort: string; toNodeId: string; toPort: string; edgeType: string;
    }>;
    expect(edges.length).toBeGreaterThan(0);
    expect(new Set(edges.map(({ edgeType }) => edgeType))).toEqual(new Set(['DATA', 'CONTROL']));
    expect(edges.every(({ fromPort, toPort, edgeType }) => (
      edgeType === 'DATA' ? fromPort !== '$control' && toPort !== '$control'
        : fromPort === '$control' && toPort === '$control'
    ))).toBe(true);
    const nodeIds = new Set((compiled.nodes as Array<{ nodeId: string }>).map(({ nodeId }) => nodeId));
    expect(edges.every(({ fromNodeId, toNodeId }) => nodeIds.has(fromNodeId) && nodeIds.has(toNodeId))).toBe(true);
  });

  it('projects a resolver output only through the declared safe property path', () => {
    const { compiled } = lowerBaseline();
    const binding = (compiled.edges as CompiledPortBindingEdgeV2R[]).find(({ toPort }) => toPort === 'keyframes');
    expect(binding).toBeTruthy();
    const keyframes = [{ frame: 9, value: 1 }, { frame: 20, value: 1.12 }];
    expect(projectCompiledPortValueV2R(binding!, {
      proposedOperation: { targetOperatorId: 'set_keyframes', arguments: { keyframes } },
    })).toEqual(keyframes);
    expect(() => projectCompiledPortValueV2R(binding!, {
      proposedOperation: { targetOperatorId: 'set_keyframes', arguments: {} },
    })).toThrow('COMPILED_PORT_PROJECTION_MISSING:keyframes');
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
    const editorialIntent = structuredClone(canonical.editorialIntentV2R) as { nodes: Array<Record<string, unknown>> };
    editorialIntent.nodes.push({
      intentNodeId: 'node-generated', operationFamily: 'generated-composition', targetClaimIds: ['claim-product-push-in'],
      selectedOperatorId: 'generated_composition_program', alternativeOperatorIds: [], executionForm: 'GENERATED_COMPOSITION',
      requiresNodeIds: [], invalidates: [], evidenceIds: [], failureDisposition: 'FAIL',
    });
    const withGenerated = {
      ...canonical.evidenceBoundIntentsV2R.BASELINE,
      nodes: [
        ...(canonical.evidenceBoundIntentsV2R.BASELINE.nodes as unknown[]),
        { intentNodeId: 'node-generated', selectedOperatorId: 'generated_composition_program', alternativeOperatorIds: [], evidenceBindingIds: [], preservationIds: [], proofObligationIds: [], bindingStatus: 'BOUND', unresolvedRequirementIds: [] },
      ],
    };
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01',
      editorialIntent,
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
    // An unresolved selected node is a real drop and cannot satisfy zero-drop.
    expect(result.zeroDrop).toBe(false);
    expect(result.zeroAdd).toBe(true);
  });

  it('fails closed when Stage 3 changes a selected role or semantic input', () => {
    const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as { nodes: Array<Record<string, unknown>> };
    const editorialIntent = structuredClone(canonical.editorialIntentV2R) as { nodes: Array<Record<string, unknown>> };
    const boundTarget = evidenceBoundIntent.nodes.find(({ intentNodeId }) => intentNodeId === 'node-resolve-cut');
    const sourceTarget = editorialIntent.nodes.find(({ intentNodeId }) => intentNodeId === 'node-resolve-cut');
    expect(boundTarget).toBeTruthy();
    expect(sourceTarget).toBeTruthy();
    sourceTarget!.alternativeOperatorIds = ['get_timeline_view'];
    boundTarget!.alternativeOperatorIds = ['resolve_transcript_edit'];
    boundTarget!.selectedOperatorId = 'get_timeline_view';
    boundTarget!.nodeInputs = { query: 'different target' };
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01', editorialIntent,
      evidenceBoundIntent, evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV01_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.nodes).toEqual([]);
    expect(result.zeroDrop).toBe(false);
    expect(result.compiled.compileDisposition).toBe('FAIL');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'LOWERING_STAGE2_STAGE3_DRIFT:SELECTED_OPERATOR_ROLE_DRIFT:node-resolve-cut',
      'LOWERING_STAGE2_STAGE3_DRIFT:ALTERNATIVE_OPERATOR_DRIFT:node-resolve-cut',
      'LOWERING_STAGE2_STAGE3_DRIFT:NODE_INPUT_DRIFT:node-resolve-cut',
    ]));
  });

  it('rejects ill-typed and non-model-owned node inputs before compilation', () => {
    const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as { nodes: Array<Record<string, unknown>> };
    const stageTwo = structuredClone(canonical.editorialIntentV2R) as { nodes: Array<Record<string, unknown>> };
    const boundTarget = evidenceBoundIntent.nodes.find(({ intentNodeId }) => intentNodeId === 'node-resolve-cut');
    const sourceTarget = stageTwo.nodes.find(({ intentNodeId }) => intentNodeId === 'node-resolve-cut');
    expect(boundTarget).toBeTruthy();
    expect(sourceTarget).toBeTruthy();
    const invalidInputs = { query: { invalid: true }, projectId: 'attacker-project' };
    boundTarget!.nodeInputs = invalidInputs;
    sourceTarget!.nodeInputs = invalidInputs;
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01', editorialIntent: stageTwo,
      evidenceBoundIntent, evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV01_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.compileDisposition).not.toBe('COMPILED_RESEARCH_PROXY');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('MODEL_INPUT_SCHEMA_INVALID:node-resolve-cut:query'),
      'MODEL_INPUT_FIELD_NOT_MODEL_OWNED:node-resolve-cut:projectId',
    ]));
  });

  it('honors explicit stop-before-render dispositions even when mutations were selected', () => {
    const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as Record<string, unknown>;
    evidenceBoundIntent.stageDisposition = 'CAPABILITY_GAP';
    evidenceBoundIntent.unresolvedRequirements = [{
      requirementId: 'req-stop', kind: 'CAPABILITY', factIds: [],
      disposition: 'CAPABILITY_GAP', failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
    }];
    const result = lowerV2RBoundIntentGeneric({
      taskId: 'DEV-01', editorialIntent: canonical.editorialIntentV2R,
      evidenceBoundIntent, evidencePack: canonical.evidencePacks.BASELINE,
      policy: DEV01_LOWERING_POLICY_V2R,
    });
    expect(result.compiled.nodes).toEqual([]);
    expect(result.compiled.compileDisposition).toBe('CAPABILITY_GAP');
    expect(result.compiled.executionEligibility).toBe('NOT_EXECUTABLE');
    expect(result.zeroDrop).toBe(false);
  });

  it('does not fall back to a fixture fact when the declared causal producer is absent', () => {
    const policy: GenericLoweringPolicyV2R = {
      ...DEV01_LOWERING_POLICY_V2R,
      fieldBindings: {
        ...DEV01_LOWERING_POLICY_V2R.fieldBindings,
        targetRange: {
          source: 'NODE_OUTPUT',
          producers: [{
            operatorId: 'resolve_audio_edit', outputName: 'proposedOperation',
            projectionPath: ['arguments', 'targetRange'],
          }],
        },
      },
    };
    const result = lowerBaseline(policy);
    expect(result.compiled.compileDisposition).not.toBe('COMPILED_RESEARCH_PROXY');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'INPUT_BINDING_MISSING:node-cut:targetRange',
    ]));
  });
});
