import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildProviderNativeToolSetV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
  bindModelSelectedGraphToStage25ScheduleV1,
  type Stage25EffectBindingTraceV1,
  type Stage25OperatorEffectResolutionV1,
} from '@/lib/editron/research/open-ended-planner/stage25-model-schedule-binding-v1';
import type { Stage25EffectRegionV1 } from '@/lib/editron/research/open-ended-planner/stage25-proposal-reconciliation-v1';

type JsonRecord = Record<string, unknown>;
const TIMEBASE = { timebaseId: 'tb-project-30', version: '1' } as const;
const OPERATOR_IDS = [
  'find_audio_moment', 'find_visual_moment', 'sync_cuts_to_beats',
  'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
] as const;
const toolSet = buildProviderNativeToolSetV2R(OPERATOR_IDS);

describe('Stage 2.5 model-selected graph scheduling binding', () => {
  it('preserves the six selected operators and schedules a fork/join edit through writer receipts', async () => {
    const fixture = makeFixture();
    const result = await bind(fixture);

    expect(result.schedule.disposition).toBe('PASS');
    expect(result.schedule.waves).toEqual([
      { waveIndex: 0, nodeIds: ['compile-audio', 'compile-visual'] },
      { waveIndex: 1, nodeIds: ['compile-sync'] },
      { waveIndex: 2, nodeIds: ['compile-resolve'] },
      { waveIndex: 3, nodeIds: ['compile-keyframes'] },
      { waveIndex: 4, nodeIds: ['compile-filter'] },
    ]);
    expect(result.receipt).toMatchObject({ zeroAdd: true, zeroDrop: true, stateEffects: [] });
    expect(result.graph.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'compile-audio', 'compile-visual', 'compile-sync',
      'compile-resolve', 'compile-keyframes', 'compile-filter',
    ]);
    expect(node(result, 'compile-sync').revisionInput).toEqual({
      origin: 'GRAPH_BASE', expectedProjectRevision: 'R42',
    });
    expect(node(result, 'compile-resolve').revisionInput).toEqual({
      origin: 'WRITER_RECEIPT', producerNodeId: 'compile-sync', receiptRef: 'compile-sync.receipt',
    });
    expect(node(result, 'compile-keyframes').revisionInput).toEqual({
      origin: 'WRITER_RECEIPT', producerNodeId: 'compile-sync', receiptRef: 'compile-sync.receipt',
    });
    expect(node(result, 'compile-filter').revisionInput).toEqual({
      origin: 'WRITER_RECEIPT', producerNodeId: 'compile-keyframes', receiptRef: 'compile-keyframes.receipt',
    });
  });

  it('rejects a missing, copied, or stale opaque effect-owner result', async () => {
    const missing = makeFixture();
    missing.refs.pop();
    await expect(bind(missing)).rejects.toThrow('EFFECT_RESOLUTION_REF_COUNT_DRIFT');

    const copied = makeFixture();
    const keyframesRef = copied.refs.find(({ nodeId }) => nodeId === 'compile-keyframes')!;
    const filterRef = copied.refs.find(({ nodeId }) => nodeId === 'compile-filter')!;
    filterRef.opaqueResolutionRef = keyframesRef.opaqueResolutionRef;
    filterRef.expectedResolutionHash = keyframesRef.expectedResolutionHash;
    await expect(bind(copied)).rejects.toThrow('EFFECT_RESOLUTION_NODE_DRIFT:compile-filter');

    const stale = makeFixture();
    const compiledNode = records(stale.compiled.nodes).find(({ nodeId }) => nodeId === 'compile-filter')!;
    compiledNode.inputs = { changedAfterResolution: true };
    await expect(bind(stale)).rejects.toThrow('EFFECT_RESOLUTION_NODE_DRIFT:compile-filter');
  });

  it('rejects a rehashed forged catalog-effect trace and an added compiled operation', async () => {
    const forged = makeFixture();
    const ref = forged.refs.find(({ nodeId }) => nodeId === 'compile-filter')!;
    const resolution = structuredClone(forged.store.get(ref.opaqueResolutionRef)!) as Stage25OperatorEffectResolutionV1;
    const trace = resolution.traces[0] as { declaredEffectRef: string };
    trace.declaredEffectRef = 'PROJECT_PATH|invented-shadow-owner|PROJECT_TIMEBASE';
    const unsigned = { ...resolution } as JsonRecord; delete unsigned.resolutionHash;
    resolution.resolutionHash = hashCanonicalJsonV1(unsigned);
    ref.expectedResolutionHash = resolution.resolutionHash;
    forged.store.set(ref.opaqueResolutionRef, resolution);
    await expect(bind(forged)).rejects.toThrow('EFFECT_TRACE_COVERAGE_INVALID:compile-filter:READ');

    const added = makeFixture();
    (added.compiled.nodes as JsonRecord[]).push({
      nodeId: 'compile-invented', intentNodeId: 'invented', operatorId: 'apply_filter',
      requires: [], produces: ['compile-invented.receipt'], inputs: {},
    });
    await expect(bind(added)).rejects.toThrow('SELECTED_COMPILED_NODE_COUNT_DRIFT');
  });

  it('rejects independent project mutations instead of inventing a serialization edge', async () => {
    const fixture = makeFixture({ unorderedMutations: true });
    await expect(bind(fixture)).rejects.toThrow('STAGE25_SCHEDULER_UNORDERED_PROJECT_MUTATIONS');
  });

  it('keeps exact regions and unchecked proof gaps visible without executing the edit', async () => {
    const result = await bind(makeFixture());
    expect(node(result, 'compile-sync').writes).toEqual([
      expect.objectContaining({ path: ['project', 'overlays', 'video', 'timing'] }),
    ]);
    expect(node(result, 'compile-keyframes').writes).toEqual([
      expect.objectContaining({ path: ['project', 'overlays', 'product', 'keyframeTracks'] }),
    ]);
    expect(result.schedule.whatHasNotBeenChecked).toEqual(expect.arrayContaining([
      { nodeId: 'compile-sync', checks: ['rendered-cut-rhythm', 'speech-boundary-audition'] },
      { nodeId: 'compile-filter', checks: ['rendered-colour-proof'] },
    ]));
    expect(result.receipt.stateEffects).toEqual([]);
  });
});

interface Fixture {
  editorial: JsonRecord;
  compiled: JsonRecord;
  refs: Array<{ nodeId: string; opaqueResolutionRef: string; expectedResolutionHash: string }>;
  store: Map<string, Stage25OperatorEffectResolutionV1>;
}

function makeFixture(options: { unorderedMutations?: boolean } = {}): Fixture {
  const intents = [
    intent('audio', 'find_audio_moment', []),
    intent('visual', 'find_visual_moment', []),
    intent('sync', 'sync_cuts_to_beats', ['audio']),
    intent('resolve', 'resolve_keyframe_edit', options.unorderedMutations ? ['visual'] : ['visual', 'sync']),
    intent('keyframes', 'set_keyframes', ['resolve']),
    intent('filter', 'apply_filter', ['keyframes']),
  ];
  const editorial = { artifactType: 'EditorialIntentV2R', nodes: intents };
  const tools = new Map(toolSet.operators.map((tool) => [tool.operatorId, tool]));
  const nodes = intents.map((entry) => {
    const nodeId = `compile-${entry.intentNodeId}`;
    const tool = tools.get(entry.selectedOperatorId)!;
    return {
      nodeId, intentNodeId: entry.intentNodeId, operatorId: entry.selectedOperatorId,
      inputs: {}, requires: entry.requiresNodeIds.map((id) => `compile-${id}`),
      produces: ((tool.exactOutputSchema.required ?? []) as string[]).map((field) => `${nodeId}.${field}`),
    };
  });
  const compiled = {
    artifactType: 'CompiledOperationGraphV2', taskId: 'HOLD-FORK-JOIN-01',
    compileDisposition: 'COMPILED_RESEARCH_PROXY', executionEligibility: 'RESEARCH_PROXY_ONLY',
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorial), projectId: 'project-42',
    expectedProjectRevision: 'R42', nodes,
    edges: [
      dataEdge('audio', 'result', 'sync', 'beatPlan'),
      dataEdge('visual', 'overlayId', 'resolve', 'overlayId'),
      dataEdge('resolve', 'proposedOperation', 'keyframes', 'keyframes'),
    ],
    lowering: { zeroAdd: true, zeroDrop: true },
  };
  const regionsByNode: Record<string, { read: Stage25EffectRegionV1[]; write: Stage25EffectRegionV1[] }> = {
    'compile-audio': { read: [], write: [] },
    'compile-visual': { read: [], write: [] },
    'compile-sync': {
      read: [region('sync-read', ['project', 'overlays', 'video', 'timing'], 0, 300, 'video-family')],
      write: [region('sync-write', ['project', 'overlays', 'video', 'timing'], 0, 300, 'video-family')],
    },
    'compile-resolve': { read: [region('resolve-read', ['project', 'overlays', 'product'], 600, 720, 'product')], write: [] },
    'compile-keyframes': {
      read: [region('keyframe-read', ['project', 'overlays', 'product', 'keyframeTracks'], 600, 720, 'product')],
      write: [region('keyframe-write', ['project', 'overlays', 'product', 'keyframeTracks'], 600, 720, 'product')],
    },
    'compile-filter': {
      read: [region('filter-read', ['project', 'overlays', 'product', 'styles'], 600, 720, 'product')],
      write: [region('filter-write', ['project', 'overlays', 'product', 'styles'], 600, 720, 'product')],
    },
  };
  const store = new Map<string, Stage25OperatorEffectResolutionV1>();
  const refs = nodes.map((compiledNode) => {
    const nodeId = String(compiledNode.nodeId); const operatorId = String(compiledNode.operatorId);
    const resolution = makeResolution(compiledNode, tools.get(operatorId)!, regionsByNode[nodeId]);
    const opaqueResolutionRef = `effect-resolution://${nodeId}`;
    store.set(opaqueResolutionRef, resolution);
    return { nodeId, opaqueResolutionRef, expectedResolutionHash: resolution.resolutionHash };
  });
  return { editorial, compiled, refs, store };
}

function makeResolution(
  compiledNode: JsonRecord,
  tool: (typeof toolSet.operators)[number],
  regions: { read: Stage25EffectRegionV1[]; write: Stage25EffectRegionV1[] },
): Stage25OperatorEffectResolutionV1 {
  const nodeId = String(compiledNode.nodeId); const effects = tool.plannerRecord.effects as JsonRecord;
  const traces: Stage25EffectBindingTraceV1[] = [];
  const required = new Set<string>(); const produced = new Set<string>(); const invalidated = new Set<string>();
  const add = (effectClass: Stage25EffectBindingTraceV1['effectClass'], ref: string, index: number) => {
    const needsRegion = effectClass === 'WRITE' || (effectClass === 'READ' && /^(PROJECT_PATH|TIMELINE_RANGE)\|/.test(ref));
    const boundRegionIds = needsRegion ? (effectClass === 'READ' ? regions.read : regions.write).map(({ regionId }) => regionId) : [];
    let boundArtifactRefs: string[] = [];
    if (!needsRegion) {
      const artifact = artifactFor(nodeId, effectClass, ref, index);
      boundArtifactRefs = [artifact];
      if (effectClass === 'READ' || effectClass === 'REQUIRE') required.add(artifact);
      if (effectClass === 'PRODUCE') produced.add(artifact);
      if (effectClass === 'INVALIDATE') invalidated.add(artifact);
    }
    traces.push({ effectClass, declaredEffectRef: ref, boundRegionIds, boundArtifactRefs });
  };
  (['READ', 'WRITE', 'REQUIRE', 'PRODUCE', 'INVALIDATE'] as const).forEach((effectClass) => {
    const field = ({ READ: 'reads', WRITE: 'writes', REQUIRE: 'requires', PRODUCE: 'produces', INVALIDATE: 'invalidates' } as const)[effectClass];
    ((effects[field] ?? []) as string[]).forEach((ref, index) => add(effectClass, ref, index));
  });
  const unchecked = nodeId === 'compile-sync' ? ['rendered-cut-rhythm', 'speech-boundary-audition']
    : nodeId === 'compile-filter' ? ['rendered-colour-proof'] : [];
  const material = {
    schemaVersion: STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
    authority: 'OPERATOR_EFFECT_OWNER_ISSUED_RESEARCH_ONLY' as const,
    nodeId, operatorId: String(compiledNode.operatorId), compiledNodeHash: hashCanonicalJsonV1(compiledNode),
    plannerRecordHash: hashCanonicalJsonV1(tool.plannerRecord), effectContractHash: hashCanonicalJsonV1(effects),
    readRegions: regions.read, writeRegions: regions.write,
    requiredArtifactRefs: [...required], producedArtifactRefs: [...produced], invalidatedArtifactRefs: [...invalidated],
    traces, stabilityRequirement: 'RANGE_STABLE' as const, whatHasNotBeenChecked: unchecked, stateEffects: [] as const,
  };
  return { ...material, resolutionHash: hashCanonicalJsonV1(material) };
}

function artifactFor(nodeId: string, effectClass: Stage25EffectBindingTraceV1['effectClass'], ref: string, index: number): string {
  if (effectClass === 'REQUIRE') return 'policy:tenant-project-access';
  if (effectClass === 'INVALIDATE') return `stale:${nodeId}:${index}`;
  if (effectClass === 'PRODUCE' && ref.includes('project-mutation-receipt')) return `${nodeId}.receipt`;
  if (nodeId === 'compile-audio' && effectClass === 'READ') return 'evidence:audio-analysis';
  if (nodeId === 'compile-audio' && effectClass === 'PRODUCE') return 'evidence:audio-candidates';
  if (nodeId === 'compile-sync' && effectClass === 'READ') return 'evidence:audio-candidates';
  if (nodeId === 'compile-visual' && effectClass === 'READ') return 'evidence:visual-analysis';
  if (nodeId === 'compile-visual' && effectClass === 'PRODUCE') return 'evidence:visual-candidates';
  if (nodeId === 'compile-resolve' && effectClass === 'READ') return 'evidence:visual-candidates';
  return `artifact:${nodeId}:${effectClass.toLowerCase()}:${index}`;
}

async function bind(fixture: Fixture) {
  return bindModelSelectedGraphToStage25ScheduleV1({
    taskId: 'HOLD-FORK-JOIN-01', graphId: 'graph-hold-fork-join-01',
    editorialIntent: fixture.editorial, compiledGraph: fixture.compiled, toolSet, timebase: TIMEBASE,
    currentStability: 'RANGE_STABLE',
    initialArtifactRefs: ['policy:tenant-project-access', 'evidence:audio-analysis', 'evidence:visual-analysis'],
    requiredFinalArtifactRefs: ['compile-filter.receipt'],
    limits: { maxNodeCount: 12, maxParallelNodes: 3, maxRenderNodes: 1 },
    effectResolutionRefs: fixture.refs,
    resolveEffectResolution: (ref) => fixture.store.get(ref),
  });
}

function intent(intentNodeId: string, selectedOperatorId: string, requiresNodeIds: string[]) {
  return { intentNodeId, selectedOperatorId, requiresNodeIds };
}
function dataEdge(from: string, fromPort: string, to: string, toPort: string) {
  return { edgeType: 'DATA', fromNodeId: `compile-${from}`, fromPort, toNodeId: `compile-${to}`, toPort };
}
function region(regionId: string, path: string[], start: number, end: number, identity: string): Stage25EffectRegionV1 {
  return { regionId, path, range: { timebase: TIMEBASE, startTick: String(start), endExclusiveTick: String(end) }, identityRefs: [identity] };
}
function node(result: Awaited<ReturnType<typeof bind>>, nodeId: string) {
  return result.graph.nodes.find((entry) => entry.nodeId === nodeId)!;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
