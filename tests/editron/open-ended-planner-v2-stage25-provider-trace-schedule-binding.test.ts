import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildOpaqueResultReferenceToolSetV2R,
  PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { buildProviderNativeToolSetV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
  type Stage25EffectBindingTraceV1,
  type Stage25OperatorEffectResolutionV1,
} from '@/lib/editron/research/open-ended-planner/stage25-model-schedule-binding-v1';
import {
  bindProviderTraceToStage25ScheduleV1,
  projectProviderTraceForStage25ScheduleV1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-trace-schedule-binding-v1';
import type { Stage25EffectRegionV1 } from '@/lib/editron/research/open-ended-planner/stage25-proposal-reconciliation-v1';

type JsonRecord = Record<string, unknown>;
const IDS = ['find_audio_moment', 'find_visual_moment', 'sync_cuts_to_beats', 'resolve_keyframe_edit', 'set_keyframes', 'apply_filter'] as const;
const toolSet = buildProviderNativeToolSetV2R(IDS);
const TIMEBASE = { timebaseId: 'tb-project-30', version: '1' } as const;
const BEATS = { schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'music-1', measuredEvidenceReceiptHash: 'a'.repeat(64), strongPeakFrames: [119, 239], finalStrongPeakFrame: 239 };
const CONSTRAINTS = { maxSnapFrames: 8, minClipFrames: 20, maxConsecutiveBeatCuts: 4, protectedAudioRange: { startFrame: 0, endFrame: 90 }, protectedBoundaryToleranceFrames: 3, sourceDurationFramesByAssetId: { clip: 900 }, requireSourceHandles: true };
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'stage25-provider-fork-join-1', objective: 'Align the opening to measured beats and apply a restrained product treatment.',
  activeTarget: { taskId: 'HOLD-FORK-JOIN-01' }, revisionBinding: { projectId: 'project-42', expectedProjectRevision: 'R42' },
  projectState: { projectId: 'project-42', projectRevision: 'R42' }, evidence: [],
  preservationRules: ['Protect speech and do not invent a tool result.'],
  authorityAndPolicy: { completeCapabilityDossier: { plannerRecordSupplements: [
    supplement('sync_cuts_to_beats', { beatPlan: origin('find_audio_moment', 'result') }),
    supplement('resolve_keyframe_edit', {
      expectedProjectRevision: origin('sync_cuts_to_beats', 'receipt.projectRevision'),
      overlayId: origin('find_visual_moment', 'overlayId'), targetFrame: origin('find_visual_moment', 'targetFrame'),
      focalPoint: origin('find_visual_moment', 'focalPoint'), evidenceStrength: origin('find_visual_moment', 'evidenceStrength'),
    }),
    supplement('set_keyframes', {
      expectedProjectRevision: origin('sync_cuts_to_beats', 'receipt.projectRevision'),
      overlayId: origin('resolve_keyframe_edit', 'proposedOperation.arguments.overlayId'),
      keyframes: origin('resolve_keyframe_edit', 'proposedOperation.arguments.keyframes'),
      focalPoint: origin('resolve_keyframe_edit', 'proposedOperation.arguments.focalPoint'),
    }),
    supplement('apply_filter', { expectedProjectRevision: origin('set_keyframes', 'receipt.projectRevision') }),
  ] } },
  budget: { maxTurns: 8, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

describe('Stage 2.5 provider trace to scheduler binding', () => {
  it('recovers a fork/join DAG without adding or dropping the provider-selected operations', async () => {
    const fixture = makeFixture(); const result = await bind(fixture);
    expect(result.schedule.disposition).toBe('PASS');
    expect(result.schedule.waves).toEqual([
      { waveIndex: 0, nodeIds: ['compile-turn-1', 'compile-turn-2'] },
      { waveIndex: 1, nodeIds: ['compile-turn-3'] }, { waveIndex: 2, nodeIds: ['compile-turn-4'] },
      { waveIndex: 3, nodeIds: ['compile-turn-5'] }, { waveIndex: 4, nodeIds: ['compile-turn-6'] },
    ]);
    expect(result.providerTraceProjectionReceipt).toMatchObject({ selectedOperatorIds: IDS, compiledOperatorIds: IDS, zeroAdd: true, zeroDrop: true, stateEffects: [] });
    expect(graphNode(result, 'compile-turn-4').revisionInput).toEqual({ origin: 'WRITER_RECEIPT', producerNodeId: 'compile-turn-3', receiptRef: 'compile-turn-3.receipt' });
    expect(graphNode(result, 'compile-turn-6').revisionInput).toEqual({ origin: 'WRITER_RECEIPT', producerNodeId: 'compile-turn-5', receiptRef: 'compile-turn-5.receipt' });
  });

  it('rejects a re-signed forged value hash instead of trusting the trace envelope', () => {
    const source = makeSource(); const turn = episodeTurns(source)[3];
    const binding = (turn.argumentReferenceBindings as JsonRecord[])[0]; binding.valueSha256 = 'f'.repeat(64);
    resign(source);
    expect(() => project(source)).toThrow('REFERENCE_BINDING_INVALID:turn-4:expectedProjectRevision');
  });

  it('rejects a direct or copied stale revision even when all envelopes are re-signed', () => {
    const direct = makeSource(); direct.episode.argumentHandoffMode = 'DIRECT_ARGUMENTS'; resign(direct);
    expect(() => project(direct)).toThrow('PROVIDER_EPISODE_INVALID');

    const stale = makeSource(); const turn = episodeTurns(stale)[5];
    const bindings = turn.argumentReferenceBindings as JsonRecord[];
    bindings[0] = structuredClone(episodeTurns(stale)[3].argumentReferenceBindings as JsonRecord[])[0];
    (turn.normalizedArguments as JsonRecord).expectedProjectRevision = 'R43'; resign(stale);
    expect(() => project(stale)).toThrow('REFERENCE_BINDING_INVALID:turn-6:expectedProjectRevision');
  });

  it('rejects an added selected operation and a writer that did not advance revision', () => {
    const added = makeSource(); added.trace.nodes.push(structuredClone(added.trace.nodes[0])); resignTrace(added);
    expect(() => project(added)).toThrow('SELECTED_OPERATION_TRACE_NODE_SET_INVALID');

    const unchanged = makeSource(); const filter = episodeTurns(unchanged)[5];
    ((filter.execution as JsonRecord).output as JsonRecord).receipt = { status: 'PASS', projectRevision: 'R44' };
    resign(unchanged);
    expect(() => project(unchanged)).toThrow('WRITER_REVISION_NOT_ADVANCED:turn-6');
  });
});

interface MutableSource { episode: JsonRecord; trace: JsonRecord & { nodes: JsonRecord[] } }
interface Fixture extends MutableSource { refs: Array<{ nodeId: string; opaqueResolutionRef: string; expectedResolutionHash: string }>; store: Map<string, Stage25OperatorEffectResolutionV1>; initial: string[] }

function makeSource(): MutableSource {
  const visual = { result: { candidate: 'product' }, evidence: { evidenceId: 'EV-V' }, overlayId: 42, targetFrame: 660, focalPoint: { x: 0.74, y: 0.5 }, evidenceStrength: 0.92 };
  const resolved = { overlayId: 42, keyframes: [{ frame: 660, value: 1 }, { frame: 684, value: 1.1 }], focalPoint: { x: 0.74, y: 0.5 } };
  const specs = [
    spec('find_audio_moment', { projectId: 'project-42', query: 'measured strong impacts' }, { result: BEATS, evidence: { evidenceId: 'EV-A' } }, [], [['result', BEATS]]),
    spec('find_visual_moment', { projectId: 'project-42', query: 'product focal moment' }, visual, [], [['overlayId', 42], ['targetFrame', 660], ['focalPoint', visual.focalPoint], ['evidenceStrength', 0.92]]),
    spec('sync_cuts_to_beats', { projectId: 'project-42', expectedProjectRevision: 'R42', overlayIds: ['clip'], beatPlan: BEATS, beatSyncConstraints: CONSTRAINTS, evidenceIds: ['EV-A'] }, { receipt: { status: 'PASS', projectRevision: 'R43' }, result: { moved: 2 } }, [binding(1, 'find_audio_moment', 'result', 'beatPlan', BEATS)], [['receipt.projectRevision', 'R43']]),
    spec('resolve_keyframe_edit', { projectId: 'project-42', expectedProjectRevision: 'R43', overlayId: 42, targetFrame: 660, focalPoint: visual.focalPoint, evidenceStrength: 0.92, intent: { direction: 'in', durationFrames: 24, scaleDelta: 0.1 }, evidenceIds: ['EV-V'] }, { proposedOperation: { targetOperatorId: 'set_keyframes', arguments: resolved }, evidence: { evidenceId: 'EV-FORM' } }, [binding(3, 'sync_cuts_to_beats', 'receipt.projectRevision', 'expectedProjectRevision', 'R43'), binding(2, 'find_visual_moment', 'overlayId', 'overlayId', 42, 1), binding(2, 'find_visual_moment', 'targetFrame', 'targetFrame', 660, 2), binding(2, 'find_visual_moment', 'focalPoint', 'focalPoint', visual.focalPoint, 3), binding(2, 'find_visual_moment', 'evidenceStrength', 'evidenceStrength', 0.92, 4)], [['proposedOperation.arguments.overlayId', 42], ['proposedOperation.arguments.keyframes', resolved.keyframes], ['proposedOperation.arguments.focalPoint', resolved.focalPoint]]),
    spec('set_keyframes', { projectId: 'project-42', expectedProjectRevision: 'R43', ...resolved }, { receipt: { status: 'PASS', projectRevision: 'R44' } }, [binding(3, 'sync_cuts_to_beats', 'receipt.projectRevision', 'expectedProjectRevision', 'R43'), binding(4, 'resolve_keyframe_edit', 'proposedOperation.arguments.overlayId', 'overlayId', 42, 1), binding(4, 'resolve_keyframe_edit', 'proposedOperation.arguments.keyframes', 'keyframes', resolved.keyframes, 2), binding(4, 'resolve_keyframe_edit', 'proposedOperation.arguments.focalPoint', 'focalPoint', resolved.focalPoint, 3)], [['receipt.projectRevision', 'R44']]),
    spec('apply_filter', { projectId: 'project-42', expectedProjectRevision: 'R44', overlayId: 42, targetRange: { startFrame: 600, endFrame: 720 }, effectPlan: { name: 'warm-restrained' } }, { receipt: { status: 'PASS', projectRevision: 'R45' } }, [binding(5, 'set_keyframes', 'receipt.projectRevision', 'expectedProjectRevision', 'R44')], []),
  ];
  const turns = specs.map((entry, index) => makeTurn(index + 1, entry));
  turns.push({ turn: 7, modelCall: { name: 'finish_research_episode' } });
  const route = { routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' };
  const episodeMaterial = { receiptVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R, authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', route, episodeId: CONTEXT.episodeId, contextSha256: hashCanonicalJsonV1(CONTEXT), toolSetSha256: buildOpaqueResultReferenceToolSetV2R(toolSet).toolSetSha256, argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', selectedOperatorIds: [...IDS], turns, terminal: { disposition: 'READY_FOR_PROOF', reasonCodes: [], evidenceIds: [], summary: 'ready' }, productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY', stateEffects: [], transcriptSha256: hashCanonicalJsonV1(turns) };
  const episode = { ...episodeMaterial, receiptSha256: hashCanonicalJsonV1(episodeMaterial) };
  const nodes = turns.slice(0, 6).map((turn) => traceNode(turn, toolSet.operators.find(({ operatorId }) => operatorId === (turn.modelCall as JsonRecord).name)!.kind));
  const traceMaterial = { version: 'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_TEST_1', authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION', caseId: 'HOLD-FORK-JOIN-01', episodeId: CONTEXT.episodeId, contextSha256: episode.contextSha256, providerEpisodeReceiptSha256: episode.receiptSha256, route, terminalDisposition: 'READY_FOR_PROOF', nodes, researchCloneMutationCount: 3, assessment: 'PASS', diagnostics: [], stateEffects: [], traceSha256: hashCanonicalJsonV1(nodes) };
  return { episode, trace: { ...traceMaterial, artifactSha256: hashCanonicalJsonV1(traceMaterial) } };
}

function makeFixture(): Fixture {
  const source = makeSource(); const projection = project(source); const store = new Map<string, Stage25OperatorEffectResolutionV1>(); const refs = records(projection.compiledGraph.nodes).map((node) => {
    const resolution = resolutionFor(node); const opaqueResolutionRef = `effect://${node.nodeId}`; store.set(opaqueResolutionRef, resolution);
    return { nodeId: String(node.nodeId), opaqueResolutionRef, expectedResolutionHash: resolution.resolutionHash };
  });
  const produced = new Set([...store.values()].flatMap((value) => value.producedArtifactRefs));
  const initial = [...new Set([...store.values()].flatMap((value) => value.requiredArtifactRefs).filter((ref) => !produced.has(ref)))];
  return { ...source, refs, store, initial };
}

async function bind(fixture: Fixture) { return bindProviderTraceToStage25ScheduleV1({ taskId: 'HOLD-FORK-JOIN-01', graphId: 'graph-provider-fork-join', providerEpisode: fixture.episode as unknown as ProviderNativeEpisodeReceiptV2R, selectedOperationTrace: fixture.trace, episodeContext: CONTEXT, toolSet, timebase: TIMEBASE, currentStability: 'RANGE_STABLE', initialArtifactRefs: fixture.initial, requiredFinalArtifactRefs: ['compile-turn-6.receipt'], limits: { maxNodeCount: 12, maxParallelNodes: 3, maxRenderNodes: 1 }, effectResolutionRefs: fixture.refs, resolveEffectResolution: (ref) => fixture.store.get(ref) }); }
function project(source: MutableSource) { return projectProviderTraceForStage25ScheduleV1({ taskId: 'HOLD-FORK-JOIN-01', providerEpisode: source.episode as unknown as ProviderNativeEpisodeReceiptV2R, selectedOperationTrace: source.trace, episodeContext: CONTEXT, toolSet }); }

function resolutionFor(node: JsonRecord): Stage25OperatorEffectResolutionV1 {
  const tool = toolSet.operators.find(({ operatorId }) => operatorId === node.operatorId)!; const effects = tool.plannerRecord.effects as JsonRecord;
  const readEffects = effects.reads as string[]; const writeEffects = effects.writes as string[];
  const readRegions = readEffects.some((ref) => ref.startsWith('PROJECT_PATH|')) ? [region(`${node.nodeId}-read`, node.operatorId === 'sync_cuts_to_beats' ? ['project', 'overlays', 'video', 'timing'] : ['project', 'overlays', 'product'], node.operatorId === 'sync_cuts_to_beats' ? 0 : 600, node.operatorId === 'sync_cuts_to_beats' ? 300 : 720)] : [];
  const writeRegions = writeEffects.length ? [region(`${node.nodeId}-write`, node.operatorId === 'sync_cuts_to_beats' ? ['project', 'overlays', 'video', 'timing'] : node.operatorId === 'set_keyframes' ? ['project', 'overlays', 'product', 'keyframeTracks'] : ['project', 'overlays', 'product', 'styles'], node.operatorId === 'sync_cuts_to_beats' ? 0 : 600, node.operatorId === 'sync_cuts_to_beats' ? 300 : 720)] : [];
  const traces: Stage25EffectBindingTraceV1[] = []; const required = new Set<string>(); const produced = new Set<string>(); const invalidated = new Set<string>();
  for (const effectClass of ['READ', 'WRITE', 'REQUIRE', 'PRODUCE', 'INVALIDATE'] as const) for (const [index, ref] of ((effects[{ READ: 'reads', WRITE: 'writes', REQUIRE: 'requires', PRODUCE: 'produces', INVALIDATE: 'invalidates' }[effectClass]] ?? []) as string[]).entries()) {
    const regionBinding = effectClass === 'WRITE' || (effectClass === 'READ' && ref.startsWith('PROJECT_PATH|')); const artifact = regionBinding ? '' : effectClass === 'PRODUCE' && ref.includes('project-mutation-receipt') ? `${node.nodeId}.receipt` : `${effectClass.toLowerCase()}:${node.nodeId}:${index}`;
    if (artifact && ['READ', 'REQUIRE'].includes(effectClass)) required.add(artifact); if (artifact && effectClass === 'PRODUCE') produced.add(artifact); if (artifact && effectClass === 'INVALIDATE') invalidated.add(artifact);
    traces.push({ effectClass, declaredEffectRef: ref, boundRegionIds: regionBinding ? (effectClass === 'READ' ? readRegions : writeRegions).map(({ regionId }) => regionId) : [], boundArtifactRefs: artifact ? [artifact] : [] });
  }
  const material = { schemaVersion: STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1, authority: 'OPERATOR_EFFECT_OWNER_ISSUED_RESEARCH_ONLY' as const, nodeId: String(node.nodeId), operatorId: String(node.operatorId), compiledNodeHash: hashCanonicalJsonV1(node), plannerRecordHash: hashCanonicalJsonV1(tool.plannerRecord), effectContractHash: hashCanonicalJsonV1(effects), readRegions, writeRegions, requiredArtifactRefs: [...required], producedArtifactRefs: [...produced], invalidatedArtifactRefs: [...invalidated], traces, stabilityRequirement: 'RANGE_STABLE' as const, whatHasNotBeenChecked: ['rendered-result'], stateEffects: [] as const };
  return { ...material, resolutionHash: hashCanonicalJsonV1(material) };
}

function spec(operatorId: string, args: JsonRecord, output: JsonRecord, bindings: JsonRecord[], issuedValues: Array<[string, unknown]>) { return { operatorId, args, output, bindings, issuedValues }; }
function makeTurn(turn: number, entry: ReturnType<typeof spec>): JsonRecord { return { turn, modelCall: { name: entry.operatorId }, normalizedArguments: entry.args, argumentReferenceBindings: entry.bindings, execution: { authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK', output: entry.output, evidenceIds: [] }, issuedResultReferences: entry.issuedValues.map(([path, value], index) => issued(turn, entry.operatorId, path, value, index + 1)), outputDiagnostics: [] }; }
function issued(turn: number, operatorId: string, path: string, value: unknown, index: number) { return { version: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R, resultReferenceId: `result_t${turn}_${index}`, originTurn: turn, sourceOperatorId: operatorId, sourceOutputField: path, sourceOutputPath: path.split('.'), valueKind: Array.isArray(value) ? 'ARRAY' : typeof value === 'object' ? 'OBJECT' : typeof value === 'number' ? 'NUMBER' : 'STRING', valueSha256: hashCanonicalJsonV1(value) }; }
function binding(turn: number, operatorId: string, path: string, targetField: string, value: unknown, index = 1) { return { targetField, resultReferenceId: `result_t${turn}_${index}`, originTurn: turn, sourceOperatorId: operatorId, sourceOutputField: path, sourceOutputPath: path.split('.'), valueSha256: hashCanonicalJsonV1(value) }; }
function traceNode(turn: JsonRecord, kind: string): JsonRecord { const output = (turn.execution as JsonRecord).output as JsonRecord; const writer = kind === 'MUTATION' ? String((output.receipt as JsonRecord).projectRevision) : null; const material = { nodeId: `turn-${turn.turn}`, turn: turn.turn, selectedOperatorId: (turn.modelCall as JsonRecord).name, operatorKind: kind, normalizedArguments: turn.normalizedArguments, argumentReferenceBindings: turn.argumentReferenceBindings, executionDisposition: 'OK', executionEvidenceRefs: [], writerIssuedProjectRevision: writer, researchCloneMutation: kind === 'MUTATION', argumentSha256: hashCanonicalJsonV1(turn.normalizedArguments), outputSha256: hashCanonicalJsonV1(output) }; return { ...material, nodeSha256: hashCanonicalJsonV1(material) }; }
function resign(source: MutableSource): void { source.episode.transcriptSha256 = hashCanonicalJsonV1(source.episode.turns); const unsignedEpisode = { ...source.episode }; delete unsignedEpisode.receiptSha256; source.episode.receiptSha256 = hashCanonicalJsonV1(unsignedEpisode); source.trace.nodes = (source.episode.turns as JsonRecord[]).filter((turn) => turn.execution).map((turn) => traceNode(turn, toolSet.operators.find(({ operatorId }) => operatorId === (turn.modelCall as JsonRecord).name)!.kind)); source.trace.providerEpisodeReceiptSha256 = source.episode.receiptSha256; source.trace.traceSha256 = hashCanonicalJsonV1(source.trace.nodes); source.trace.researchCloneMutationCount = source.trace.nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length; const unsignedTrace = { ...source.trace }; delete unsignedTrace.artifactSha256; source.trace.artifactSha256 = hashCanonicalJsonV1(unsignedTrace); }
function resignTrace(source: MutableSource): void { source.trace.traceSha256 = hashCanonicalJsonV1(source.trace.nodes); source.trace.researchCloneMutationCount = source.trace.nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length; const unsignedTrace = { ...source.trace }; delete unsignedTrace.artifactSha256; source.trace.artifactSha256 = hashCanonicalJsonV1(unsignedTrace); }
function supplement(selectableOperatorId: string, fields: Record<string, JsonRecord[]>) { return { selectableOperatorId, inputOrigins: fields }; }
function origin(operatorId: string, outputField: string) { return [{ origin: 'OPERATOR_OUTPUT', operatorId, outputField }]; }
function region(regionId: string, path: string[], startTick: number, endExclusiveTick: number): Stage25EffectRegionV1 { return { regionId, path, range: { timebase: TIMEBASE, startTick: String(startTick), endExclusiveTick: String(endExclusiveTick) }, identityRefs: ['fixture'] }; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value as JsonRecord[] : []; }
function episodeTurns(source: MutableSource): JsonRecord[] { return records(source.episode.turns); }
function graphNode(result: Awaited<ReturnType<typeof bind>>, nodeId: string) { return result.graph.nodes.find((node) => node.nodeId === nodeId)!; }
