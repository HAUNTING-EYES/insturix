import { describe, expect, it } from 'vitest';

import {
  STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R,
  STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R,
  STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R,
  referencedOperatorIdsV2R,
  selectedOperatorDriftDiagnosticsV2R,
  validateSelectedOperatorNodesV2R,
} from '@/lib/editron/research/open-ended-planner/stage2-selected-operator-contract-v2r';

const catalog = new Set(['cut_section', 'set_keyframes', 'read_project_file', 'generated_composition_program']);

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intentNodeId: 'node-1',
    operationFamily: 'transcript-edit',
    targetClaimIds: ['claim-1'],
    selectedOperatorId: 'cut_section',
    alternativeOperatorIds: [],
    executionForm: 'NATIVE',
    requiresNodeIds: [],
    invalidates: [],
    evidenceIds: ['EV-1'],
    failureDisposition: 'NEEDS_REVIEW',
    ...overrides,
  };
}

describe('stage-2 selected-operator contract V2R', () => {
  it('accepts a node with exactly one catalog-known selected operator', () => {
    expect(validateSelectedOperatorNodesV2R([node()], catalog)).toEqual([]);
    expect(validateSelectedOperatorNodesV2R(
      [node({ alternativeOperatorIds: ['set_keyframes'] })],
      catalog,
    )).toEqual([]);
  });

  it('rejects unknown selected and alternative operators', () => {
    expect(validateSelectedOperatorNodesV2R([node({ selectedOperatorId: 'invented_operator' })], catalog))
      .toEqual(['SELECTED_OPERATOR_UNKNOWN:node-1:invented_operator']);
    expect(validateSelectedOperatorNodesV2R([node({ alternativeOperatorIds: ['invented_operator'] })], catalog))
      .toEqual(['ALTERNATIVE_OPERATOR_UNKNOWN:node-1:invented_operator']);
  });

  it('rejects a selected operator duplicated inside its own alternatives', () => {
    expect(validateSelectedOperatorNodesV2R(
      [node({ alternativeOperatorIds: ['cut_section', 'set_keyframes'] })],
      catalog,
    )).toEqual(['ALTERNATIVE_INCLUDES_SELECTED:node-1']);
  });

  it('rejects capability-gap or clarification dispositions on executable nodes', () => {
    expect(validateSelectedOperatorNodesV2R([node({ failureDisposition: 'CAPABILITY_GAP' })], catalog))
      .toEqual(['GAP_DISPOSITION_ON_EXECUTABLE_NODE:node-1']);
    expect(validateSelectedOperatorNodesV2R([node({ failureDisposition: 'ASK_USER' })], catalog))
      .toEqual(['GAP_DISPOSITION_ON_EXECUTABLE_NODE:node-1']);
  });

  it('rejects nodes without a selected operator instead of allowing empty pseudo-tools', () => {
    expect(validateSelectedOperatorNodesV2R([node({ selectedOperatorId: '' })], catalog))
      .toEqual(['NODE_SELECTED_OPERATOR_MISSING:node-1']);
    expect(validateSelectedOperatorNodesV2R([node({ selectedOperatorId: undefined })], catalog))
      .toEqual(['NODE_SELECTED_OPERATOR_MISSING:node-1']);
    expect(validateSelectedOperatorNodesV2R(['not-a-record'], catalog))
      .toEqual(['NODE_NOT_RECORD:node[0]']);
  });

  it('collects the union of selected and alternative operators across nodes', () => {
    const nodes = [
      node({ selectedOperatorId: 'cut_section', alternativeOperatorIds: ['set_keyframes'] }),
      node({ intentNodeId: 'node-2', selectedOperatorId: 'read_project_file', alternativeOperatorIds: [] }),
      { intentNodeId: 'node-3' },
    ];
    expect(referencedOperatorIdsV2R(nodes).sort()).toEqual(['cut_section', 'read_project_file', 'set_keyframes']);
    expect(referencedOperatorIdsV2R(undefined)).toEqual([]);
  });

  it('reports zero drift for preserved operator sets', () => {
    const source = [node({ alternativeOperatorIds: ['set_keyframes'] })];
    const bound = [node({ alternativeOperatorIds: ['set_keyframes'] })];
    expect(selectedOperatorDriftDiagnosticsV2R(source, bound)).toEqual([]);
  });

  it('reports added, dropped, and substituted operators as drift', () => {
    const source = [node({ selectedOperatorId: 'cut_section', alternativeOperatorIds: ['set_keyframes'] })];
    expect(selectedOperatorDriftDiagnosticsV2R(source, [node({ selectedOperatorId: 'read_project_file', alternativeOperatorIds: ['set_keyframes'] })]))
      .toEqual(['OPERATOR_SET_DRIFT:node-1']);
    expect(selectedOperatorDriftDiagnosticsV2R(source, [node({ selectedOperatorId: 'cut_section', alternativeOperatorIds: [] })]))
      .toEqual(['OPERATOR_SET_DRIFT:node-1']);
    expect(selectedOperatorDriftDiagnosticsV2R(source, [node({ selectedOperatorId: 'cut_section', alternativeOperatorIds: ['set_keyframes', 'read_project_file'] })]))
      .toEqual(['OPERATOR_SET_DRIFT:node-1']);
    expect(selectedOperatorDriftDiagnosticsV2R(source, [])).toEqual(['NODE_MISSING:node-1']);
    expect(selectedOperatorDriftDiagnosticsV2R([], [node()])).toEqual(['NODE_ADDED:node-1']);
  });

  it('freezes every exported contract artifact', () => {
    expect(Object.isFrozen(STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R)).toBe(true);
    expect(Object.isFrozen(STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R)).toBe(true);
    expect(Object.isFrozen(STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R)).toBe(true);
    expect(STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R.required).toEqual(expect.arrayContaining(['selectedOperatorId', 'alternativeOperatorIds']));
    expect(STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R.required).not.toContain('candidateCapabilityIds');
    expect(STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R.required).toEqual(expect.arrayContaining(['selectedOperatorId', 'alternativeOperatorIds']));
    expect(STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R.required).not.toContain('candidateCapabilityIds');
  });
});
