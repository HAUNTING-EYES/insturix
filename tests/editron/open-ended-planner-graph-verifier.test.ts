import { describe, expect, it } from 'vitest';

import {
  type BenchmarkContractV1,
  type CandidateGraphNodeV1,
  type CandidateGraphV1,
  type KnowledgeEntryV1,
  type OperatorCatalogV1,
  type OperatorSpecV1,
  type PlannerTaskFixtureV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  verifyCandidateGraphV1,
  type GraphVerifierPredicateV1,
} from '@/lib/editron/research/open-ended-planner/graph-verifier-v1';
import { getDevelopmentGraphPredicatesV1 } from '@/lib/editron/research/open-ended-planner/development-graph-predicates-v1';
import {
  comparePortTypesV1,
  parsePortContractV1,
  validatePortValueV1,
} from '@/lib/editron/research/open-ended-planner/graph-verifier-port-contract-v1';
import { materializePlannerPacketV1 } from '@/lib/editron/research/open-ended-planner/materialize-packet-v1';
import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v1/benchmark-contract-v1.json';
import developmentTasksJson from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';
import knowledgeJson from '@/tests/fixtures/editron/open-ended-planner-v1/knowledge-entries-v1.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v1/operator-specs-v1.json';

const operatorCatalog = operatorCatalogJson as unknown as OperatorCatalogV1;
const task = developmentTasksJson.tasks[0] as unknown as PlannerTaskFixtureV1;
const artifact = materializePlannerPacketV1({
  benchmarkContract: benchmarkJson as unknown as BenchmarkContractV1,
  task,
  conditionId: 'C1_FULL_OPERATOR_SPECS',
  operatorCatalog,
  knowledgeEntries: knowledgeJson.entries as unknown as KnowledgeEntryV1[],
});
const allProofs = [...new Set(operatorCatalog.operators.flatMap((operator) =>
  stringArray(operator.proofObligations) ?? []))];
const requiredAudioNode: GraphVerifierPredicateV1 = {
  predicateId: 'DEV-01-AUDIO-NODE', version: '1.0.0', message: 'Audio ducking operation is required',
  evaluate: ({ graph }) => graph.nodes.some((node) => node.operatorId === 'apply_audio_ducking'),
};

describe('OE-2A graph verifier', () => {
  it('accepts and freezes one fully declared research-only graph deterministically', () => {
    const graph = makeAudioGraph();
    const first = verify(graph);
    const second = verify(structuredClone(graph));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ disposition: 'ACCEPTED', issues: [], packetHash: artifact.packetHash });
    expect(first.graphHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.predicateVersions).toEqual([{ predicateId: 'DEV-01-AUDIO-NODE', version: '1.0.0' }]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.issues)).toBe(true);
  });

  it('rejects schema, packet, scope, revision, and expiry drift', () => {
    const graph = makeAudioGraph() as CandidateGraphV1 & { extra?: boolean };
    graph.extra = true;
    graph.taskId = 'wrong-task';
    graph.projectRevision = 'wrong-revision';
    const badArtifact = structuredClone(artifact);
    badArtifact.packetHash = '0'.repeat(64);
    const result = verifyCandidateGraphV1({
      ...verificationInput(graph), artifact: badArtifact,
      evaluatedAt: '2028-01-01T00:00:00.000Z',
    });
    expect(codes(result)).toEqual(expect.arrayContaining([
      'SCHEMA_ADDITIONAL_PROPERTY', 'PACKET_HASH_MISMATCH', 'TASK_SCOPE_MISMATCH',
      'REVISION_SCOPE_MISMATCH', 'ENVELOPE_EXPIRED',
    ]));
  });

  it('rejects unknown, denied, wrongly versioned, and evidence-unbound operators', () => {
    const unknown = makeAudioGraph();
    unknown.nodes[0].operatorId = 'invented_operator';
    expect(codes(verify(unknown))).toContain('UNKNOWN_OPERATOR');

    const denied = makeAudioGraph();
    denied.nodes[0] = makeNode('add_sfx', { query: 'impact' }, {
      audioAsset: {}, sfxOverlay: {}, rightsContract: {},
    });
    expect(codes(verify(denied))).toContain('OPERATOR_POLICY_DENIED');

    const version = makeAudioGraph();
    version.nodes[0].operatorVersion = 'wrong';
    expect(codes(verify(version))).toContain('OPERATOR_VERSION_MISMATCH');

    const evidence = makeAudioGraph();
    evidence.nodes[0].evidenceIds = ['EV-NOT-BOUND'];
    expect(codes(verify(evidence))).toContain('EVIDENCE_UNBOUND');
  });

  it('rejects undeclared, missing, wrongly typed, out-of-range, and over-budget ports', () => {
    const graph = makeAudioGraph();
    graph.nodes[0].inputs = {
      ...graph.nodes[0].inputs,
      duckLevel: 1,
      rampDownMs: 'fast',
      surprise: true,
    };
    delete graph.nodes[0].inputs.enabled;
    graph.nodes[0].expectedOutputs = {
      ...graph.nodes[0].expectedOutputs,
      candidates: [{}, {}, {}, {}],
    };
    const result = verify(graph);
    expect(codes(result)).toEqual(expect.arrayContaining([
      'INPUT_PORT_UNKNOWN', 'INPUT_BINDING_MISSING', 'PORT_VALUE_INVALID',
      'OUTPUT_PORT_UNKNOWN', 'RESOURCE_BUDGET_EXCEEDED',
    ]));

    const cut = makeGraph([makeNode('cut_section', { startFrame: 200, endFrame: 100 }, {
      cutSummary: 'bad range', newDuration: 380, affectedFrameRange: [100, 200],
    })]);
    expect(codes(verify(cut, [{ ...requiredAudioNode, evaluate: () => true }]))).toContain('RANGE_INVALID');
  });

  it('rejects invalid edges, incompatible ports, cycles, and unordered mutations', () => {
    const cycle = makeResolverCycleGraph();
    expect(codes(verify(cycle, [{ ...requiredAudioNode, evaluate: () => true }]))).toContain('GRAPH_CYCLE');

    const mismatch = makeResolverCycleGraph();
    mismatch.edges = [{ fromNodeId: 'read', fromPort: 'fps', toNodeId: 'resolve', toPort: 'query' }];
    delete mismatch.nodes[1].inputs.query;
    expect(codes(verify(mismatch, [{ ...requiredAudioNode, evaluate: () => true }]))).toContain('PORT_TYPE_MISMATCH');

    const unknownPort = makeResolverCycleGraph();
    unknownPort.edges = [{ fromNodeId: 'read', fromPort: 'missing', toNodeId: 'resolve', toPort: 'query' }];
    expect(codes(verify(unknownPort, [{ ...requiredAudioNode, evaluate: () => true }]))).toContain('OUTPUT_PORT_UNKNOWN');

    const unordered = makeAudioGraph();
    unordered.nodes.push({ ...structuredClone(unordered.nodes[0]), nodeId: 'audio-2' });
    expect(codes(verify(unordered))).toContain('UNORDERED_STATE_EFFECTS');

    const ordered = makeAudioGraph();
    ordered.nodes.push({ ...structuredClone(ordered.nodes[0]), nodeId: 'audio-2' });
    ordered.edges.push({ fromNodeId: 'apply_audio_ducking', fromPort: '$control', toNodeId: 'audio-2', toPort: '$control' });
    expect(codes(verify(ordered))).not.toContain('UNORDERED_STATE_EFFECTS');

    const invalidControl = makeAudioGraph();
    invalidControl.nodes.push({ ...structuredClone(invalidControl.nodes[0]), nodeId: 'audio-2' });
    invalidControl.edges.push({ fromNodeId: 'apply_audio_ducking', fromPort: '$control', toNodeId: 'audio-2', toPort: 'enabled' });
    expect(codes(verify(invalidControl))).toContain('CONTROL_EDGE_INVALID');
  });

  it('rejects state-effect, failure, proof, policy, and preservation gaps', () => {
    const graph = makeAudioGraph();
    graph.nodes[0].expectedStateEffects = ['NONE'];
    graph.nodes[0].failureDisposition = 'continue';
    graph.preservationClaims = [];
    const missing = verifyCandidateGraphV1({ ...verificationInput(graph), availableProofObligations: [] });
    expect(codes(missing)).toEqual(expect.arrayContaining([
      'STATE_EFFECT_ACKNOWLEDGEMENT_INVALID', 'FAILURE_DISPOSITION_INVALID', 'PROOF_UNAVAILABLE',
      'PRESERVATION_CLAIM_MISSING',
    ]));

    const unsafeCatalog = structuredClone(operatorCatalog);
    const audioSpec = unsafeCatalog.operators.find(({ operatorId }) => operatorId === 'apply_audio_ducking') as OperatorSpecV1;
    audioSpec.rightsPrivacyEgress = { network: 'REQUIRED' };
    const policy = verifyCandidateGraphV1({ ...verificationInput(makeAudioGraph()), operatorCatalog: unsafeCatalog });
    expect(codes(policy)).toContain('NETWORK_POLICY_VIOLATION');
  });

  it('records task-predicate failures and exceptions without repairing the graph', () => {
    const failed = verify(makeAudioGraph(), [{
      predicateId: 'FAIL', version: '1', message: 'Frozen predicate failed', evaluate: () => false,
    }, {
      predicateId: 'THROW', version: '1', message: 'ignored', evaluate: () => { throw new Error('secret detail'); },
    }]);
    expect(codes(failed)).toEqual(expect.arrayContaining(['TASK_PREDICATE_FAILED', 'TASK_PREDICATE_ERROR']));
    expect(failed.issues.some(({ message }) => message.includes('secret detail'))).toBe(false);
    expect(failed.graphHash).toBe(verify(makeAudioGraph()).graphHash);
    expect(codes(verify(makeAudioGraph(), []))).toContain('TASK_PREDICATE_MISSING');
  });

  it('accepts an explicit zero-node capability gap without inventing an operation', () => {
    const graph = makeGraph([]);
    graph.clarifications = ['Moving matte/tracking is unavailable'];
    graph.preservationClaims = [];
    const result = verify(graph, getDevelopmentGraphPredicatesV1('DEV-04'), []);
    expect(result.disposition).toBe('ACCEPTED');
  });

  it('keeps frozen development predicates evaluator-only and task-specific', () => {
    const result = verify(makeAudioGraph(), getDevelopmentGraphPredicatesV1('DEV-01'));
    expect(codes(result)).toContain('TASK_PREDICATE_FAILED');
    expect(result.predicateVersions).toHaveLength(4);
    expect(() => getDevelopmentGraphPredicatesV1('HOLD-01')).toThrow(/No frozen OE-2 development predicates/);
    expect(JSON.stringify(artifact.packet)).not.toMatch(/DEV-01-REQUIRED-OPERATIONS|DEV-01-EVIDENCE-BOUND-CUT/);
  });

  it('accepts an exact transcript-resolver data binding without requiring duplicate cut literals', () => {
    const graph = makeGraph([
      makeNode('resolve_transcript_edit', { query: 'here it is', action: 'cut_after_phrase', minGapFrames: 40, maxCutFrames: 60 }, { startFrame: 151, endFrame: 196 }, ['EV-DEV01-T1']),
      makeNode('cut_section', {}, {}, ['EV-DEV01-T1']),
      makeNode('set_keyframes', { overlayId: 'product-box', property: 'scale', keyframes: [{ frame: 0, value: 1 }, { frame: 5, value: 1.1 }] }, {}, ['EV-DEV01-V1']),
      makeNode('apply_audio_ducking', { enabled: true, duckLevel: 0.4, rampDownMs: 80, rampUpMs: 120, lookAheadMs: 10 }, {}, ['EV-DEV01-A1']),
    ]);
    graph.edges = [
      { fromNodeId: 'resolve', fromPort: 'startFrame', toNodeId: 'cut_section', toPort: 'startFrame' },
      { fromNodeId: 'resolve', fromPort: 'endFrame', toNodeId: 'cut_section', toPort: 'endFrame' },
    ];
    const predicate = getDevelopmentGraphPredicatesV1('DEV-01').find(({ predicateId }) => predicateId === 'DEV-01-EVIDENCE-BOUND-CUT');
    expect(predicate?.evaluate({ graph, artifact, operatorCatalog })).toBe(true);
    graph.nodes[0].expectedOutputs.endFrame = 195;
    expect(predicate?.evaluate({ graph, artifact, operatorCatalog })).toBe(false);
  });
});

describe('OE-2A port-contract parser', () => {
  it('parses aliases and validates enum, numeric, frame, keyframe, and edge types', () => {
    const contract = parsePortContractV1(['overlayId-or-query', 'direction:in|out', 'level:0.1..0.8']);
    expect(contract.byName.get('overlayId')).toBe(contract.byName.get('query'));
    expect(validatePortValueV1('sideways', 'in|out', 100)).toMatch(/one of/);
    expect(validatePortValueV1(0.2, '0..1', 100)).toBeUndefined();
    expect(validatePortValueV1(2.5, 'integer', 100)).toMatch(/nonnegative integer/);
    expect(validatePortValueV1(2, '0.1..0.8', 100)).toMatch(/within/);
    expect(validatePortValueV1(101, 'global-frame', 100)).toMatch(/duration/);
    expect(validatePortValueV1([{ frame: 2 }, { frame: 1 }], 'local-keyframe[2+]', 100)).toMatch(/increasing/);
    expect(comparePortTypesV1('integer', 'global-frame')).toBe('COMPATIBLE');
    expect(comparePortTypesV1(undefined, 'text')).toBe('UNVERIFIABLE');
  });
});

function verify(
  graph: CandidateGraphV1,
  taskPredicates: GraphVerifierPredicateV1[] = [requiredAudioNode],
  availableProofObligations = allProofs,
) {
  return verifyCandidateGraphV1({ ...verificationInput(graph), taskPredicates, availableProofObligations });
}

function verificationInput(graph: CandidateGraphV1) {
  return {
    graph, artifact, operatorCatalog, evaluatedAt: '2026-08-12T00:00:00.000Z',
    availableProofObligations: allProofs, taskPredicates: [requiredAudioNode],
  };
}

function makeAudioGraph(): CandidateGraphV1 {
  return makeGraph([makeNode('apply_audio_ducking', {
    enabled: true, duckLevel: 0.4, rampDownMs: 80, rampUpMs: 120, lookAheadMs: 10,
  }, { updatedBgmIds: ['ov-music'], duckingConfig: {}, warnings: [] }, ['EV-DEV01-A1'])]);
}

function makeResolverCycleGraph(): CandidateGraphV1 {
  const graph = makeGraph([
    makeNode('read_project_file', { mode: 'full' }, {
      projectReadModel: {}, fps: 30, durationInFrames: 480, canvas: {},
    }),
    makeNode('resolve_transcript_edit', {
      query: 'here it is', action: 'cut_after_phrase', maxCutFrames: 60,
    }, { status: 'resolved', startFrame: 151, endFrame: 196, candidates: [], warnings: [] }, ['EV-DEV01-T1']),
  ]);
  graph.edges = [
    { fromNodeId: 'resolve', fromPort: 'startFrame', toNodeId: 'read', toPort: 'start' },
    { fromNodeId: 'read', fromPort: 'durationInFrames', toNodeId: 'resolve', toPort: 'minGapFrames' },
  ];
  return graph;
}

function makeGraph(nodes: CandidateGraphNodeV1[]): CandidateGraphV1 {
  return {
    graphId: 'graph-dev-01', taskId: artifact.packet.taskId, envelopeHash: artifact.packet.envelopeHash,
    projectRevision: artifact.packet.materializedPlannerEnvelope.projectRevision,
    nodes, edges: [], expectedOutcome: 'Research-only candidate',
    preservationClaims: [...artifact.packet.materializedPlannerEnvelope.preservationPredicates],
    clarifications: [], declines: [],
  };
}

function makeNode(
  operatorId: string,
  inputs: Record<string, unknown>,
  expectedOutputs: Record<string, unknown>,
  evidenceIds: string[] = [],
): CandidateGraphNodeV1 {
  const spec = operatorCatalog.operators.find((operator) => operator.operatorId === operatorId) as OperatorSpecV1;
  return {
    nodeId: operatorId === 'read_project_file' ? 'read' : operatorId === 'resolve_transcript_edit' ? 'resolve' : operatorId,
    operatorId, operatorVersion: spec.version, inputs, evidenceIds, expectedOutputs,
    expectedStateEffects: ['READ', 'RESOLVE'].includes(spec.kind) ? ['NONE'] : ['DECLARED_OPERATOR_EFFECTS'],
    failureDisposition: 'ABORT_GRAPH',
  };
}

function codes(result: { issues: Array<{ code: string }> }): string[] {
  return result.issues.map(({ code }) => code);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}
