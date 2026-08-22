import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1, scheduleStage25GraphV1,
  type Stage25SchedulableNodeV1, type Stage25SchedulerGraphV1,
} from '@/lib/editron/research/open-ended-planner/stage25-dependency-scheduler-v1';
import type { Stage25EffectRegionV1 } from '@/lib/editron/research/open-ended-planner/stage25-proposal-reconciliation-v1';

const timebase = { timebaseId: 'project-timebase-1', version: '1' } as const;

describe('Stage 2.5 dependency and invalidation scheduler', () => {
  it('orders a tracked title-behind-subject edit and parallelizes legal mask consumers', () => {
    const graph = makeGraph([
      node('track-subject', 'ANALYSIS', { produces: ['mask:subject-v1'], unchecked: ['mask-edge-quality'] }),
      node('transform-title', 'PROPOSAL', { depends: ['track-subject'], requires: ['mask:subject-v1'], produces: ['proposal:title-transform'], writes: [region('title-transform', ['project', 'overlays', 'title-1', 'transform'], 300, 360)], invalidates: ['proof:title-geometry'] }),
      node('grade-background', 'PROPOSAL', { depends: ['track-subject'], requires: ['mask:subject-v1'], produces: ['proposal:background-grade'], writes: [region('background-grade', ['project', 'overlays', 'background', 'grade'], 300, 360)], invalidates: ['proof:colour'] }),
      node('render-composite', 'RENDER', { depends: ['transform-title', 'grade-background'], requires: ['proposal:title-transform', 'proposal:background-grade'], produces: ['preview:composite'] }),
      node('prove-occlusion', 'PROOF', { depends: ['render-composite'], requires: ['preview:composite'], produces: ['proof:occlusion-final'] }),
    ], { requiredFinalArtifactRefs: ['proof:occlusion-final'] });
    const result = scheduleStage25GraphV1(graph);
    expect(result.disposition).toBe('PASS');
    expect(result.waves.map(({ nodeIds }) => nodeIds)).toEqual([
      ['track-subject'], ['grade-background', 'transform-title'], ['render-composite'], ['prove-occlusion'],
    ]);
    expect(result.whatHasNotBeenChecked.find(({ nodeId }) => nodeId === 'track-subject')?.checks).toEqual(['mask-edge-quality']);
    expect(result.stateEffects).toEqual([]);
  });

  it('rejects unordered overlapping writes and unordered canonical mutations', () => {
    const overlap = [
      node('proposal-a', 'PROPOSAL', { writes: [region('a', ['project', 'overlays', 'title-1'], 0, 100)], invalidates: ['proof:a'] }),
      node('proposal-b', 'PROPOSAL', { writes: [region('b', ['project', 'overlays', 'title-1', 'position'], 50, 120)], invalidates: ['proof:b'] }),
    ];
    expect(() => scheduleStage25GraphV1(makeGraph(overlap))).toThrow('UNORDERED_DATA_HAZARD');
    const mutations = [
      node('mutation-a', 'MUTATION', { writes: [region('ma', ['project', 'overlays', 'a'], 0, 50)], invalidates: ['proof:a'] }),
      node('mutation-b', 'MUTATION', { writes: [region('mb', ['project', 'overlays', 'b'], 100, 150)], invalidates: ['proof:b'] }),
    ];
    expect(() => scheduleStage25GraphV1(makeGraph(mutations))).toThrow('UNORDERED_PROJECT_MUTATIONS');
  });

  it('requires every post-mutation node to consume the latest writer receipt', () => {
    const first = node('mutation-a', 'MUTATION', { writes: [region('ma', ['project', 'overlays', 'a'], 0, 50)], invalidates: ['proof:a'] });
    const staleSecond = node('mutation-b', 'MUTATION', { depends: ['mutation-a'], writes: [region('mb', ['project', 'overlays', 'b'], 100, 150)], invalidates: ['proof:b'] });
    expect(() => scheduleStage25GraphV1(makeGraph([first, staleSecond]))).toThrow('REVISION_ORIGIN_INVALID:mutation-b');
    const boundSecond = node('mutation-b', 'MUTATION', { depends: ['mutation-a'], revisionFrom: 'mutation-a', writes: [region('mb', ['project', 'overlays', 'b'], 100, 150)], invalidates: ['proof:b'] });
    expect(scheduleStage25GraphV1(makeGraph([boundSecond, first])).waves.map(({ nodeIds }) => nodeIds))
      .toEqual([['mutation-a'], ['mutation-b']]);
  });

  it('blocks picture-lock work while allowing the same graph after picture lock', () => {
    const nodes = [node('final-captions', 'PROOF', { stability: 'PICTURE_LOCK', produces: ['proof:captions-final'] })];
    expect(scheduleStage25GraphV1(makeGraph(nodes, { currentStability: 'RANGE_STABLE' })))
      .toMatchObject({ disposition: 'BLOCKED_STABILITY', blockedNodeIds: ['final-captions'], waves: [] });
    expect(scheduleStage25GraphV1(makeGraph(nodes, { currentStability: 'PICTURE_LOCK' })).disposition).toBe('PASS');
  });

  it('rejects stale caption proof after a trim and accepts explicit post-trim reproof', () => {
    const trim = node('trim-picture', 'MUTATION', { writes: [region('trim', ['project', 'overlays', 'picture', 'timing'], 100, 200)], invalidates: ['proof:caption-layout'] });
    const staleDelivery = node('deliver', 'PROOF', { depends: ['trim-picture'], revisionFrom: 'trim-picture', requires: ['proof:caption-layout'], produces: ['proof:delivery'] });
    expect(() => scheduleStage25GraphV1(makeGraph([trim, staleDelivery], {
      initialArtifactRefs: ['proof:caption-layout'], requiredFinalArtifactRefs: ['proof:delivery'],
    }))).toThrow('STALE_OR_UNORDERED_REQUIREMENT');

    const reproof = node('reprove-captions', 'RENDER', {
      depends: ['trim-picture'], revisionFrom: 'trim-picture', reads: [region('caption-read', ['project', 'overlays', 'picture', 'timing'], 100, 200)], produces: ['proof:caption-layout'],
    });
    const validDelivery = node('deliver', 'PROOF', { depends: ['reprove-captions'], revisionFrom: 'trim-picture', requires: ['proof:caption-layout'], produces: ['proof:delivery'] });
    const result = scheduleStage25GraphV1(makeGraph([validDelivery, reproof, trim], {
      initialArtifactRefs: ['proof:caption-layout'], requiredFinalArtifactRefs: ['proof:caption-layout', 'proof:delivery'],
    }));
    expect(result.waves.map(({ nodeIds }) => nodeIds)).toEqual([['trim-picture'], ['reprove-captions'], ['deliver']]);
    expect(result.finalAvailableArtifactRefs).toEqual(expect.arrayContaining(['proof:caption-layout', 'proof:delivery']));
  });

  it('rejects cycles, dangling dependencies and multiple artifact producers', () => {
    expect(() => scheduleStage25GraphV1(makeGraph([node('a', 'ANALYSIS', { depends: ['b'] }), node('b', 'ANALYSIS', { depends: ['a'] })]))).toThrow('GRAPH_CYCLE');
    expect(() => scheduleStage25GraphV1(makeGraph([node('a', 'ANALYSIS', { depends: ['missing'] })])))
      .toThrow('DEPENDENCY_INVALID');
    expect(() => scheduleStage25GraphV1(makeGraph([node('a', 'ANALYSIS', { produces: ['artifact:x'] }), node('b', 'ANALYSIS', { produces: ['artifact:x'] })]))).toThrow('MULTIPLE_ARTIFACT_PRODUCERS');
  });

  it('respects render concurrency and gives identical waves for shuffled node presentation', () => {
    const nodes = [
      node('render-a', 'RENDER', { produces: ['preview:a'] }), node('render-b', 'RENDER', { produces: ['preview:b'] }),
      node('analysis-c', 'ANALYSIS', { produces: ['evidence:c'] }),
    ];
    const options = { limits: { maxNodeCount: 8, maxParallelNodes: 3, maxRenderNodes: 1 } };
    const first = scheduleStage25GraphV1(makeGraph(nodes, options));
    const second = scheduleStage25GraphV1(makeGraph([...nodes].reverse(), options));
    expect(first.waves.map(({ nodeIds }) => nodeIds)).toEqual([['analysis-c', 'render-a'], ['render-b']]);
    expect(second.waves).toEqual(first.waves);
  });
});

function makeGraph(nodes: Stage25SchedulableNodeV1[], options: Partial<Omit<Stage25SchedulerGraphV1, 'schemaVersion' | 'graphId' | 'projectId' | 'baseProjectRevision' | 'timebase' | 'nodes' | 'graphHash'>> = {}): Stage25SchedulerGraphV1 {
  const material = {
    schemaVersion: STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1, graphId: 'scheduler-graph-1', projectId: 'project-1', baseProjectRevision: 'R42', timebase,
    currentStability: options.currentStability ?? 'RANGE_STABLE', initialArtifactRefs: options.initialArtifactRefs ?? [], requiredFinalArtifactRefs: options.requiredFinalArtifactRefs ?? [],
    limits: options.limits ?? { maxNodeCount: 16, maxParallelNodes: 4, maxRenderNodes: 2 }, nodes,
  };
  return { ...material, graphHash: hashCanonicalJsonV1(material) };
}

function node(nodeId: string, kind: Stage25SchedulableNodeV1['kind'], input: {
  depends?: string[]; requires?: string[]; produces?: string[]; invalidates?: string[]; reads?: Stage25EffectRegionV1[];
  writes?: Stage25EffectRegionV1[]; stability?: Stage25SchedulableNodeV1['stabilityRequirement']; unchecked?: string[]; revisionFrom?: string;
} = {}): Stage25SchedulableNodeV1 {
  const concurrencyClass = kind === 'MUTATION' ? 'PROJECT_MUTATION_EXCLUSIVE' : kind === 'PROPOSAL' ? 'PROPOSAL_ISOLATED' : kind === 'RENDER' ? 'RENDER_RESOURCE' : 'READ_SHARED';
  const produces = [...new Set([...(input.produces ?? []), ...(kind === 'MUTATION' ? [`${nodeId}.receipt`] : [])])];
  const revisionInput = input.revisionFrom
    ? { origin: 'WRITER_RECEIPT' as const, producerNodeId: input.revisionFrom, receiptRef: `${input.revisionFrom}.receipt` }
    : { origin: 'GRAPH_BASE' as const, expectedProjectRevision: 'R42' };
  return { nodeId, kind, dependsOnNodeIds: input.depends ?? [], requires: input.requires ?? [], produces, invalidates: input.invalidates ?? [], reads: input.reads ?? [], writes: input.writes ?? [], stabilityRequirement: input.stability ?? 'RANGE_STABLE', concurrencyClass, revisionInput, whatHasNotBeenChecked: input.unchecked ?? [] };
}

function region(regionId: string, path: string[], startTick: number, endExclusiveTick: number): Stage25EffectRegionV1 {
  return { regionId, path, range: { timebase, startTick: String(startTick), endExclusiveTick: String(endExclusiveTick) }, identityRefs: [] };
}
