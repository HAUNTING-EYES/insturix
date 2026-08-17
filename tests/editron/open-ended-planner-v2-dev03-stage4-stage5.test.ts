import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildCanonicalDev03BeatWithheldEvidenceV2, buildCanonicalDev03MeasuredEvidenceV2, type Dev03MeasuredEvidenceReceiptV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { compileDev03Stage4NativeV2, evaluateDev03Stage2RoleCompilabilityV2 } from '@/lib/editron/research/open-ended-planner/stage4-dev03-native-compiler-v2';
import { evaluateDev03Stage4CompiledGraphV2 } from '@/lib/editron/research/open-ended-planner/stage4-dev03-native-evaluator-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

type JsonRecord = Record<string, unknown>;
interface Graph extends JsonRecord { nodes: JsonRecord[]; edges: JsonRecord[]; executionEligibility: string; proofPolicy: JsonRecord; }
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'), readFile('lib/editron/services/media/beat-detection-service.ts')]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

function compile(condition: 'BASELINE' | 'BEAT_EVIDENCE_WITHHELD' = 'BASELINE'): Readonly<JsonRecord> {
  const canonical = getCanonicalDev03Stage123V2({ measuredEvidence: measured, withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2() });
  return compileDev03Stage4NativeV2({ measuredEvidence: measured, editorialIntent: canonical.editorialIntent, evidencePack: canonical.evidencePacks[condition], evidenceBoundIntent: canonical.evidenceBoundIntents[condition] });
}
function mutable(): Graph { return structuredClone(compile()) as Graph; }
function node(graph: Graph, id: string): JsonRecord { const found = graph.nodes.find(({ nodeId }) => nodeId === id); if (!found) throw new Error(`Missing ${id}`); return found; }

describe('open-ended planner V2 DEV-03 deterministic Stage 4-5', () => {
  it('compiles through the actual beat and shake owners and passes independent validation', () => {
    const graph = compile();
    expect(evaluateDev03Stage4CompiledGraphV2(graph)).toEqual({ assessment: 'PASS', sourceAndProvenance: 'PASS', operationResolution: 'PASS', dependencyAndRevision: 'PASS', preservationAndProof: 'PASS', diagnostics: [] });
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({ taskId: 'DEV-03', disposition: 'PROCEED', reasonCode: 'RESEARCH_PROXY_GRAPH_VERIFIED', executionAuthorization: { scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY', projectMutation: 'DENY', fullProjectExecution: 'DENY' } });
  });

  it('resolves provider-owned node symbols by capability and dependency role', () => {
    const canonical = getCanonicalDev03Stage123V2({ measuredEvidence: measured, withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2() });
    const symbols = new Map([
      ['node-observe', 'IN-provider-observe'],
      ['node-resolve-impacts', 'IN-provider-audio'],
      ['node-align-boundaries', 'IN-provider-sync'],
      ['node-final-shake', 'IN-provider-shake'],
      ['node-proof', 'IN-provider-proof'],
    ]);
    const intent = renameSymbols(canonical.editorialIntent, symbols);
    const bound = renameSymbols(canonical.evidenceBoundIntents.BASELINE, symbols);
    const graph = compileDev03Stage4NativeV2({
      measuredEvidence: measured,
      editorialIntent: intent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: bound,
    });
    expect(graph.sourceEditorialIntentHash).toBe(hashCanonicalJsonV1(intent));
    expect(graph.sourceEditorialIntentHash).not.toBe(hashCanonicalJsonV1(canonical.editorialIntent));
    expect((graph.nodes as JsonRecord[]).map(({ intentNodeId }) => intentNodeId)).toEqual([
      'IN-provider-observe', 'IN-provider-observe', 'IN-provider-audio',
      'IN-provider-sync', 'IN-provider-shake', 'IN-provider-proof', 'IN-provider-proof',
    ]);
    expect(evaluateDev03Stage4CompiledGraphV2(graph).assessment).toBe('PASS');
  });

  it('selects exact owners from a decomposed provider plan with non-selected candidate tools', () => {
    const canonical = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const source = qwenShapedDev03Source(canonical.editorialIntent, canonical.evidenceBoundIntents.BASELINE);
    expect(evaluateDev03Stage2RoleCompilabilityV2(source.intent)).toEqual([]);
    const graph = compileDev03Stage4NativeV2({
      measuredEvidence: measured,
      editorialIntent: source.intent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: source.bound,
    });
    expect((graph.nodes as JsonRecord[]).map(({ intentNodeId }) => intentNodeId)).toEqual([
      'provider-timeline', 'provider-protect-speech', 'provider-locate-beats',
      'provider-sync', 'provider-shake', 'provider-shake', 'provider-shake',
    ]);
    expect(evaluateDev03Stage4CompiledGraphV2(graph)).toMatchObject({
      assessment: 'PASS', diagnostics: [],
    });
  });

  it('surfaces ambiguous audio and missing proof roles before Stage 3', () => {
    const canonical = getCanonicalDev03Stage123V2({
      measuredEvidence: measured,
      withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
    });
    const intent = structuredClone(canonical.editorialIntent) as JsonRecord;
    const nodes = intent.nodes as JsonRecord[];
    const audio = structuredClone(nodes.find(({ intentNodeId }) => intentNodeId === 'node-resolve-impacts')) as JsonRecord;
    audio.intentNodeId = 'node-resolve-impacts-duplicate';
    nodes.push(audio);
    const sync = nodes.find(({ intentNodeId }) => intentNodeId === 'node-align-boundaries');
    if (!sync) throw new Error('DEV-03 sync fixture node is missing');
    sync.requiresNodeIds = [...(sync.requiresNodeIds as string[]), 'node-resolve-impacts-duplicate'];
    intent.nodes = nodes.filter(({ intentNodeId }) => intentNodeId !== 'node-proof');
    expect(evaluateDev03Stage2RoleCompilabilityV2(intent)).toEqual(expect.arrayContaining([
      'AUDIO_ROLE_COUNT:2',
      'PROOF_READ_ROLE_COUNT:0',
    ]));
  });

  it('binds three actual owner-resolved moves to 119, 239, and 479', () => {
    const sync = node(mutable(), 'compile-sync');
    const constraints = (sync.inputs as JsonRecord).constraints as JsonRecord;
    expect((constraints.expectedBoundaryMoves as JsonRecord[]).map(({ originalFrame, alignedFrame, shiftFrames }) => [originalFrame, alignedFrame, shiftFrames])).toEqual([[114, 119, 5], [246, 239, -7], [472, 479, 7]]);
    expect((sync.inputs as JsonRecord).audioPlan).toMatchObject({ strongPeakFrames: [119, 239, 359, 479], finalStrongPeakFrame: 479 });
  });

  it('uses the existing shake owner for a restrained bounded form with neutral return', () => {
    const shake = node(mutable(), 'compile-shake');
    expect(shake.inputs).toMatchObject({ overlayId: 'dev03-card-4', targetRange: { startFrame: 479, endFrame: 491 }, effectPlan: { resolutionOwnerRef: 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject', targetFrame: 479, localFrame: 0, intensity: 0.3, durationFrames: 10, replacePositionKeyframes: false, requireNeutralReturn: true } });
  });

  it('blocks the old 120-grid or a fabricated final hit', () => {
    const graph = mutable(); const sync = node(graph, 'compile-sync'); const audio = ((sync.inputs as JsonRecord).audioPlan as JsonRecord);
    audio.strongPeakFrames = [120, 240, 360, 480]; audio.finalStrongPeakFrame = 480;
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({ disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID' });
    expect(evaluateDev03Stage4CompiledGraphV2(graph).diagnostics).toContain('OPERATION_SYNC_MEASURED_BINDING_DRIFT');
  });

  it('blocks missing protected-audio constraints and proof', () => {
    const graph = mutable(); const sync = node(graph, 'compile-sync');
    delete ((sync.inputs as JsonRecord).constraints as JsonRecord).protectedAudioRange;
    graph.proofPolicy.proofObligationIds = ['proof-revision'];
    const evaluation = evaluateDev03Stage4CompiledGraphV2(graph);
    expect(evaluation.assessment).toBe('FAIL');
    expect(evaluation.diagnostics).toEqual(expect.arrayContaining(['PRESERVATION_SYNC_CONSTRAINT_DRIFT', 'PRESERVATION_PROOF_MISSING:proof-protected-audio']));
  });

  it('blocks a shake that is not downstream of cut alignment', () => {
    const graph = mutable(); graph.edges = graph.edges.filter(({ edgeId }) => edgeId !== 'edge-sync-shake');
    expect(evaluateDev03Stage4CompiledGraphV2(graph).diagnostics).toContain('DEPENDENCY_SHAKE_ORDER_MISSING');
    expect(decideStage5ProceedOrStopV2(graph)).not.toHaveProperty('executionAuthorization');
  });

  it('never upgrades research proxy authorization to production', () => {
    const graph = mutable(); graph.executionEligibility = 'PRODUCTION';
    expect(decideStage5ProceedOrStopV2(graph)).toMatchObject({ disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID' });
  });

  it('refuses compilation when measured beat evidence is withheld', () => {
    expect(() => compile('BEAT_EVIDENCE_WITHHELD')).toThrow(/STAGE4_DEV03_SOURCE_NOT_COMPILABLE/);
  });
});

function renameSymbols<T>(value: T, symbols: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (symbols.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((entry) => renameSymbols(entry, symbols)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .map(([key, entry]) => [key, renameSymbols(entry, symbols)])) as T;
  }
  return value;
}

function qwenShapedDev03Source(
  editorialIntent: unknown,
  evidenceBoundIntent: unknown,
): { intent: JsonRecord; bound: JsonRecord } {
  const intent = structuredClone(editorialIntent) as JsonRecord;
  const bound = structuredClone(evidenceBoundIntent) as JsonRecord;
  const intentById = new Map((intent.nodes as JsonRecord[])
    .map((node) => [String(node.intentNodeId), node] as const));
  const boundById = new Map((bound.nodes as JsonRecord[])
    .map((node) => [String(node.intentNodeId), node] as const));
  const makeIntent = (sourceId: string, intentNodeId: string, candidateCapabilityIds: string[], requiresNodeIds: string[]) => ({
    ...structuredClone(intentById.get(sourceId) as JsonRecord),
    intentNodeId,
    candidateCapabilityIds,
    requiresNodeIds,
  });
  const makeBound = (sourceId: string, intentNodeId: string, candidateCapabilityIds: string[]): JsonRecord => ({
    ...structuredClone(boundById.get(sourceId) as JsonRecord),
    intentNodeId,
    candidateCapabilityIds,
  });
  const readCandidates = ['read_project_file', 'get_timeline_view', 'find_transcript_moment', 'resolve_transcript_edit'];
  const syncCandidates = [...readCandidates, 'resolve_visual_edit', 'sync_cuts_to_beats', 'split_overlay'];
  const shakeCandidates = [...readCandidates, 'find_audio_moment', 'resolve_visual_edit', 'apply_camera_shake'];
  intent.nodes = [
    makeIntent('node-observe', 'provider-timeline', readCandidates, []),
    makeIntent('node-observe', 'provider-protect-speech', readCandidates, ['provider-timeline']),
    makeIntent('node-resolve-impacts', 'provider-locate-beats', ['find_audio_moment', 'get_timeline_view'], []),
    makeIntent('node-align-boundaries', 'provider-sync', syncCandidates, ['provider-locate-beats', 'provider-protect-speech', 'provider-timeline']),
    makeIntent('node-final-shake', 'provider-shake', shakeCandidates, ['provider-locate-beats', 'provider-sync', 'provider-protect-speech', 'provider-timeline']),
  ];
  const shakeBound: JsonRecord = makeBound('node-final-shake', 'provider-shake', shakeCandidates);
  const proofBound = boundById.get('node-proof') as JsonRecord;
  shakeBound.evidenceBindingIds = [...new Set([
    ...(shakeBound.evidenceBindingIds as string[]), ...(proofBound.evidenceBindingIds as string[]),
  ])];
  shakeBound.preservationIds = [...new Set([
    ...(shakeBound.preservationIds as string[]), ...(proofBound.preservationIds as string[]),
  ])];
  shakeBound.proofObligationIds = [...new Set([
    ...(shakeBound.proofObligationIds as string[]), ...(proofBound.proofObligationIds as string[]),
  ])];
  bound.nodes = [
    makeBound('node-observe', 'provider-timeline', readCandidates),
    makeBound('node-observe', 'provider-protect-speech', readCandidates),
    makeBound('node-resolve-impacts', 'provider-locate-beats', ['find_audio_moment', 'get_timeline_view']),
    makeBound('node-align-boundaries', 'provider-sync', syncCandidates),
    shakeBound,
  ];
  return { intent, bound };
}
