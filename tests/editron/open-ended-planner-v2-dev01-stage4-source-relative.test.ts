import { describe, expect, it } from 'vitest';

import { compileDev01Stage4NativeV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { evaluateDev01Stage2RoleCompilabilityV2 } from '@/lib/editron/research/open-ended-planner/dev01-stage4-role-resolver-v2';
import { evaluateDev01Stage4CompiledGraphV2 } from '@/lib/editron/research/open-ended-planner/stage4-dev01-native-evaluator-v2';
import { buildDev01ProviderRelativeSourceV2 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev01-provider-relative-source-v2';

type JsonRecord = Record<string, unknown>;
const materializationTracePrefix = 'EDITRON_OE_DEV01_COMPILER_MATERIALIZATION_POLICY_V1:';

describe('DEV-01 Stage-4 provider-relative compilation', () => {
  it('compiles provider-authored node identities and preserves an explicit audio resolver', () => {
    const source = buildDev01ProviderRelativeSourceV2();
    expect(evaluateDev01Stage2RoleCompilabilityV2(source.editorialIntent)).toEqual([]);
    const graph = compileDev01Stage4NativeV2(source) as TestGraph;

    expect(evaluateDev01Stage4CompiledGraphV2(graph, source)).toMatchObject({
      assessment: 'PASS',
      diagnostics: [],
    });
    expect(graph.nodes.map(({ operatorId }) => operatorId)).toEqual([
      'read_project_file', 'get_timeline_view',
      'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
      'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
      'find_audio_moment', 'resolve_audio_edit', 'apply_audio_ducking',
      'read_project_file', 'get_timeline_view',
    ]);
    expect(node(graph, 'compile-resolve-audio').intentNodeId).toBe('provider-resolve-audio');
    expect(record(node(graph, 'compile-duck').inputs.audioPlan).fromOutputRef)
      .toBe('compile-resolve-audio.proposedOperation');
    expect(new Set(graph.nodes.map(({ intentNodeId }) => intentNodeId))).toEqual(new Set([
      'provider-read', 'provider-find-transcript', 'provider-resolve-transcript',
      'provider-cut', 'provider-find-visual', 'provider-resolve-keyframe',
      'provider-push', 'provider-find-audio', 'provider-resolve-audio', 'provider-duck',
    ]));
  });

  it('fails closed when provider structure makes a semantic role ambiguous', () => {
    const source = buildDev01ProviderRelativeSourceV2();
    const intent = record(source.editorialIntent);
    const bound = record(source.evidenceBoundIntent);
    const intentNodes = records(intent.nodes);
    const boundNodes = records(bound.nodes);
    const visual = intentNodes.find(({ intentNodeId }) => intentNodeId === 'provider-find-visual');
    const visualBound = boundNodes.find(({ intentNodeId }) => intentNodeId === 'provider-find-visual');
    if (!visual || !visualBound) throw new Error('Provider-relative visual role fixture is missing');
    intentNodes.push({ ...structuredClone(visual), intentNodeId: 'provider-find-visual-duplicate' });
    boundNodes.push({ ...structuredClone(visualBound), intentNodeId: 'provider-find-visual-duplicate' });
    intent.nodes = intentNodes;
    bound.nodes = boundNodes;

    expect(evaluateDev01Stage2RoleCompilabilityV2(intent)).toEqual([
      expect.stringMatching(/CAPABILITY_ROLE_AMBIGUOUS:find_visual_moment/),
    ]);

    expect(() => compileDev01Stage4NativeV2(source)).toThrow(
      /CAPABILITY_ROLE_AMBIGUOUS:find_visual_moment/,
    );
  });

  it('materializes only compiler-owned plumbing for a semantic-only provider plan', () => {
    const source = buildSemanticOnlySource();
    expect(evaluateDev01Stage2RoleCompilabilityV2(source.editorialIntent)).toEqual([]);
    const graph = compileDev01Stage4NativeV2(source) as TestGraph;

    expect(evaluateDev01Stage4CompiledGraphV2(graph, source)).toMatchObject({
      assessment: 'PASS',
      diagnostics: [],
    });
    for (const nodeId of [
      'compile-read-project', 'compile-read-timeline', 'compile-find-transcript',
      'compile-find-product', 'compile-find-audio', 'compile-proof-read', 'compile-proof-timeline',
    ]) {
      expect(strings(node(graph, nodeId).traceRefs).filter((entry) =>
        entry.startsWith(materializationTracePrefix))).toHaveLength(1);
    }
    for (const nodeId of [
      'compile-resolve-cut', 'compile-cut', 'compile-resolve-product',
      'compile-push', 'compile-resolve-audio', 'compile-duck',
    ]) {
      expect(strings(node(graph, nodeId).traceRefs).some((entry) =>
        entry.startsWith(materializationTracePrefix))).toBe(false);
    }

    const tampered = structuredClone(graph);
    const transcriptFinder = node(tampered, 'compile-find-transcript');
    transcriptFinder.traceRefs = strings(transcriptFinder.traceRefs)
      .filter((entry) => !entry.startsWith(materializationTracePrefix));
    expect(evaluateDev01Stage4CompiledGraphV2(tampered, source)).toMatchObject({
      assessment: 'FAIL',
      operatorResolution: 'FAIL',
      diagnostics: [expect.stringMatching(/COMPILER_MATERIALIZATION_TRACE_INVALID/)],
    });
  });
});

function buildSemanticOnlySource() {
  const source = buildDev01ProviderRelativeSourceV2();
  const keepNodeIds = new Set([
    'provider-resolve-transcript', 'provider-cut', 'provider-resolve-keyframe',
    'provider-push', 'provider-resolve-audio', 'provider-duck',
  ]);
  const dependencies: Record<string, string[]> = {
    'provider-resolve-transcript': [],
    'provider-cut': ['provider-resolve-transcript'],
    'provider-resolve-keyframe': ['provider-cut'],
    'provider-push': ['provider-resolve-keyframe'],
    'provider-resolve-audio': ['provider-cut'],
    'provider-duck': ['provider-resolve-audio'],
  };
  const intent = record(source.editorialIntent);
  intent.nodes = records(intent.nodes)
    .filter(({ intentNodeId }) => keepNodeIds.has(String(intentNodeId)))
    .map((entry) => ({
      ...entry,
      requiresNodeIds: dependencies[String(entry.intentNodeId)] ?? [],
    }));
  const bound = record(source.evidenceBoundIntent);
  bound.nodes = records(bound.nodes)
    .filter(({ intentNodeId }) => keepNodeIds.has(String(intentNodeId)));
  bound.evidenceBindings = records(bound.evidenceBindings).map((binding) => ({
    ...binding,
    nodeIds: strings(binding.nodeIds).filter((nodeId) => keepNodeIds.has(nodeId)),
  }));
  return source;
}

function node(graph: TestGraph, nodeId: string): TestNode {
  const match = graph.nodes.find((entry) => entry.nodeId === nodeId);
  if (!match) throw new Error(`Missing compiled node ${nodeId}`);
  return match;
}
function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

interface TestNode extends JsonRecord {
  nodeId: string;
  intentNodeId: string;
  operatorId: string;
  inputs: JsonRecord;
}
interface TestGraph extends JsonRecord { nodes: TestNode[] }
