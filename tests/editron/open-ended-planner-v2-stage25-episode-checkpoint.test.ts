import { describe, expect, it } from 'vitest';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createStage25EpisodeCheckpointV1,
  resumeStage25EpisodeCheckpointV1,
} from '@/lib/editron/research/open-ended-planner/stage25-episode-checkpoint-v1';
import {
  STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1,
  type Stage25SchedulableNodeV1,
  type Stage25SchedulerGraphV1,
} from '@/lib/editron/research/open-ended-planner/stage25-dependency-scheduler-v1';
import type { Stage25EffectRegionV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-proposal-reconciliation-v1';

const timebase = { timebaseId: 'project-timebase-1', version: '1' } as const;
const transcriptHash = hashCanonicalJsonV1('full transcript prefix');
const summaryHash = hashCanonicalJsonV1('compacted non-authoritative summary');
const revisionAfterFirst = 'R43-writer-issued-opaque';

describe('Stage 2.5 episode checkpoint and exact resume', () => {
  it('resumes after compaction without losing the active node or opaque result identities', () => {
    const graph = makeGraph();
    const checkpoint = makeCheckpoint(graph);
    const receipt = resumeStage25EpisodeCheckpointV1({
      checkpoint,
      graph,
      currentProjectRevision: revisionAfterFirst,
      resolveOpaquePayload: (handleId) => {
        expect(handleId).toBe('result:apply-trim:receipt');
        return revisionAfterFirst;
      },
    });
    expect(receipt).toMatchObject({
      disposition: 'PASS',
      activeNodeId: 'inspect-post-trim',
      checkpointHash: checkpoint.checkpointHash,
      stateEffects: [],
    });
    expect(receipt.preservedResultHandleIds).toEqual([
      'result:apply-trim:receipt',
      'result:inspect-source:evidence',
    ]);
  });

  it('rejects a stale project revision even when the compacted summary is unchanged', () => {
    const graph = makeGraph();
    expect(() => resumeStage25EpisodeCheckpointV1({
      checkpoint: makeCheckpoint(graph),
      graph,
      currentProjectRevision: 'R44-from-user-edit',
      resolveOpaquePayload: () => revisionAfterFirst,
    })).toThrow('PROJECT_REVISION_STALE');
  });

  it('rejects a copied or forged revision handle and payload', () => {
    const graph = makeGraph();
    const checkpoint = makeCheckpoint(graph);
    expect(() => resumeStage25EpisodeCheckpointV1({
      checkpoint,
      graph,
      currentProjectRevision: revisionAfterFirst,
      resolveOpaquePayload: () => 'R43-copied-or-forged',
    })).toThrow('RESULT_PAYLOAD_HASH_INVALID');

    const copiedMaterial = {
      ...structuredClone(checkpoint),
      revisionOrigin: {
        origin: 'WRITER_RECEIPT' as const,
        producerNodeId: 'apply-trim',
        resultHandleId: 'result:inspect-source:evidence',
      },
    };
    const copied = { ...copiedMaterial, checkpointHash: rehash(copiedMaterial) };
    expect(() => resumeStage25EpisodeCheckpointV1({
      checkpoint: copied,
      graph,
      currentProjectRevision: revisionAfterFirst,
      resolveOpaquePayload: () => revisionAfterFirst,
    })).toThrow('REVISION_HANDLE_INVALID');
  });

  it('rejects altered graph identity, missing result handles, and invalid progress', () => {
    const graph = makeGraph();
    const checkpoint = makeCheckpoint(graph);
    const alteredGraph = structuredClone(graph);
    alteredGraph.graphId = 'silently-substituted-plan';
    alteredGraph.graphHash = rehashGraph(alteredGraph);
    expect(() => resumeStage25EpisodeCheckpointV1({
      checkpoint,
      graph: alteredGraph,
      currentProjectRevision: revisionAfterFirst,
      resolveOpaquePayload: () => revisionAfterFirst,
    })).toThrow('GRAPH_OR_DERIVED_STATE_DRIFT');

    expect(() => createStage25EpisodeCheckpointV1({
      ...checkpointInput(graph),
      resultHandles: [],
    })).toThrow('COMPLETED_RESULT_HANDLE_MISSING');
    expect(() => createStage25EpisodeCheckpointV1({
      ...checkpointInput(graph),
      completedNodeIds: ['apply-trim'],
    })).toThrow('COMPLETED_NODE_DEPENDENCY_MISSING');
  });

  it('uses the graph base before any writer and rejects a summary-only fake node', () => {
    const graph = makeGraph();
    const checkpoint = createStage25EpisodeCheckpointV1({
      ...checkpointInput(graph),
      activeNodeId: 'inspect-source',
      completedNodeIds: [],
      resultHandles: [],
      revisionOrigin: { origin: 'GRAPH_BASE' },
      compactedContext: {
        transcriptPrefixSha256: transcriptHash,
        compactedMessageCount: 0,
        summarySha256: summaryHash,
        includedNodeIds: ['inspect-source'],
      },
    });
    expect(resumeStage25EpisodeCheckpointV1({
      checkpoint,
      graph,
      currentProjectRevision: 'R42',
      resolveOpaquePayload: () => { throw new Error('resolver must not run'); },
    }).disposition).toBe('PASS');

    expect(() => createStage25EpisodeCheckpointV1({
      ...checkpointInput(graph),
      compactedContext: {
        transcriptPrefixSha256: transcriptHash,
        compactedMessageCount: 4,
        summarySha256: summaryHash,
        includedNodeIds: ['node-mentioned-only-in-summary'],
      },
    })).toThrow('INCLUDED_NODE_UNKNOWN');
  });
});

function makeCheckpoint(graph: Stage25SchedulerGraphV1) {
  return createStage25EpisodeCheckpointV1(checkpointInput(graph));
}

function checkpointInput(graph: Stage25SchedulerGraphV1) {
  return {
    checkpointId: 'checkpoint-2',
    planId: 'plan-1',
    graph,
    activeNodeId: 'inspect-post-trim',
    completedNodeIds: ['inspect-source', 'apply-trim'],
    resultHandles: [
      handle('result:inspect-source:evidence', 'inspect-source', 'evidence:source', { shots: 12 }),
      handle('result:apply-trim:receipt', 'apply-trim', 'apply-trim.receipt', revisionAfterFirst),
    ],
    revisionOrigin: {
      origin: 'WRITER_RECEIPT' as const,
      producerNodeId: 'apply-trim',
      resultHandleId: 'result:apply-trim:receipt',
    },
    compactedContext: {
      transcriptPrefixSha256: transcriptHash,
      compactedMessageCount: 4,
      summarySha256: summaryHash,
      includedNodeIds: ['apply-trim', 'inspect-post-trim'],
    },
    budget: {
      maxTurns: 12,
      turnsConsumed: 4,
      maxSpendUsdMicros: '500000',
      spendConsumedUsdMicros: '120000',
    },
    priorCheckpointHash: null,
  };
}

function makeGraph(): Stage25SchedulerGraphV1 {
  const nodes: Stage25SchedulableNodeV1[] = [
    node('inspect-source', 'ANALYSIS', { produces: ['evidence:source'] }),
    node('apply-trim', 'MUTATION', {
      depends: ['inspect-source'],
      requires: ['evidence:source'],
      writes: [region('trim', ['project', 'overlays', 'video-1', 'timing'], 100, 160)],
      invalidates: ['proof:picture'],
    }),
    node('inspect-post-trim', 'ANALYSIS', {
      depends: ['apply-trim'],
      revisionFrom: 'apply-trim',
      produces: ['evidence:post-trim'],
    }),
    node('apply-grade', 'MUTATION', {
      depends: ['inspect-post-trim'],
      requires: ['evidence:post-trim'],
      revisionFrom: 'apply-trim',
      writes: [region('grade', ['project', 'overlays', 'video-1', 'grade'], 160, 220)],
      invalidates: ['proof:colour'],
    }),
    node('prove-result', 'PROOF', {
      depends: ['apply-grade'],
      requires: ['apply-grade.receipt'],
      revisionFrom: 'apply-grade',
      produces: ['proof:final'],
    }),
  ];
  const material = {
    schemaVersion: STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1,
    graphId: 'resume-graph-1',
    projectId: 'project-1',
    baseProjectRevision: 'R42',
    timebase,
    currentStability: 'RANGE_STABLE' as const,
    initialArtifactRefs: [] as const,
    requiredFinalArtifactRefs: ['proof:final'] as const,
    limits: { maxNodeCount: 8, maxParallelNodes: 2, maxRenderNodes: 1 },
    nodes,
  };
  return { ...material, graphHash: hashCanonicalJsonV1(material) };
}

function node(
  nodeId: string,
  kind: Stage25SchedulableNodeV1['kind'],
  input: {
    depends?: string[];
    requires?: string[];
    produces?: string[];
    invalidates?: string[];
    writes?: Stage25EffectRegionV1[];
    revisionFrom?: string;
  } = {},
): Stage25SchedulableNodeV1 {
  return {
    nodeId,
    kind,
    dependsOnNodeIds: input.depends ?? [],
    requires: input.requires ?? [],
    produces: [
      ...(input.produces ?? []),
      ...(kind === 'MUTATION' ? [`${nodeId}.receipt`] : []),
    ],
    invalidates: input.invalidates ?? [],
    reads: [],
    writes: input.writes ?? [],
    stabilityRequirement: 'RANGE_STABLE',
    concurrencyClass: kind === 'MUTATION'
      ? 'PROJECT_MUTATION_EXCLUSIVE'
      : kind === 'PROPOSAL'
        ? 'PROPOSAL_ISOLATED'
        : kind === 'RENDER'
          ? 'RENDER_RESOURCE'
          : 'READ_SHARED',
    revisionInput: input.revisionFrom
      ? {
          origin: 'WRITER_RECEIPT',
          producerNodeId: input.revisionFrom,
          receiptRef: `${input.revisionFrom}.receipt`,
        }
      : { origin: 'GRAPH_BASE', expectedProjectRevision: 'R42' },
    whatHasNotBeenChecked: [],
  };
}

function region(
  regionId: string,
  path: string[],
  startTick: number,
  endExclusiveTick: number,
): Stage25EffectRegionV1 {
  return {
    regionId,
    path,
    range: {
      timebase,
      startTick: String(startTick),
      endExclusiveTick: String(endExclusiveTick),
    },
    identityRefs: [],
  };
}

function handle(
  resultHandleId: string,
  producerNodeId: string,
  artifactRef: string,
  payload: unknown,
) {
  return {
    resultHandleId,
    producerNodeId,
    artifactRef,
    payloadSha256: hashCanonicalJsonV1(payload),
  };
}

function rehash(checkpoint: Record<string, unknown>): string {
  const material = { ...checkpoint };
  delete material.checkpointHash;
  return hashCanonicalJsonV1(material);
}

function rehashGraph(graph: Stage25SchedulerGraphV1): string {
  const material = { ...graph } as Record<string, unknown>;
  delete material.graphHash;
  return hashCanonicalJsonV1(material);
}
