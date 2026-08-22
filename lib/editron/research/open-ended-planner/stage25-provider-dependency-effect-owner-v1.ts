import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';
import {
  STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
  type Stage25EffectBindingTraceV1,
  type Stage25OperatorEffectResolutionRefV1,
  type Stage25OperatorEffectResolutionV1,
} from './stage25-model-schedule-binding-v1';
import type { Stage25ProviderTraceProjectionV1 }
  from './stage25-provider-trace-schedule-binding-v1';
import type {
  Stage25EffectRegionV1,
  Stage25ProjectTimebaseRefV1,
} from './stage25-proposal-reconciliation-v1';

export const STAGE25_PROVIDER_DEPENDENCY_EFFECT_OWNER_VERSION_V1 =
  'EDITRON_STAGE25_PROVIDER_DEPENDENCY_EFFECT_OWNER_V1' as const;

type JsonRecord = Record<string, unknown>;
type EffectClass = Stage25EffectBindingTraceV1['effectClass'];

const ALLOWED_OPERATORS = new Set([
  'find_audio_moment', 'find_visual_moment', 'sync_cuts_to_beats',
  'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
]);
const REQUIRED_CHANGED_PATHS = [
  'overlays[1].durationInFrames', 'overlays[2].durationInFrames',
  'overlays[2].from', 'overlays[3].from',
  'overlays[42].keyframeTracks[scale]',
  'overlays[42].styles.filter', 'overlays[42].styles.transformOrigin',
] as const;

export interface Stage25ProviderDependencyEffectStoreV1 {
  refs: readonly Stage25OperatorEffectResolutionRefV1[];
  resolutions: readonly Stage25OperatorEffectResolutionV1[];
  initialArtifactRefs: readonly string[];
  requiredFinalArtifactRefs: readonly string[];
  receipt: Readonly<JsonRecord>;
  resolve(opaqueRef: string): Stage25OperatorEffectResolutionV1 | undefined;
}

/**
 * Bounded effect owner for this research episode only. It turns the isolated
 * owner's observed calls into scheduler facts; it never infers another edit.
 */
export function issueStage25ProviderDependencyEffectsV1(input: Readonly<{
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  projection: Readonly<Stage25ProviderTraceProjectionV1>;
  ownerSnapshot: unknown;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  timebase: Stage25ProjectTimebaseRefV1;
}>): Readonly<Stage25ProviderDependencyEffectStoreV1> {
  const snapshot = validateSource(input);
  const tools = new Map(input.toolSet.operators.map((tool) => [tool.operatorId, tool]));
  const turns = new Map(input.providerEpisode.turns.map((turn) => [turn.turn, turn]));
  const resolutions = records(input.projection.compiledGraph.nodes).map((node) => {
    const turn = turns.get(turnFromNodeId(text(node.nodeId))) ?? fail('TURN_MISSING');
    const operatorId = text(node.operatorId);
    const tool = tools.get(operatorId) ?? fail(`TOOL_MISSING:${operatorId}`);
    const output = record(record(turn.execution).output);
    return resolutionFor({ node, operatorId, tool, args: record(node.inputs), output,
      snapshot, timebase: input.timebase });
  });
  const store = new Map<string, Stage25OperatorEffectResolutionV1>();
  const refs = resolutions.map((resolution) => {
    const opaqueResolutionRef = `stage25-effect://${resolution.resolutionHash}`;
    if (store.has(opaqueResolutionRef)) fail('RESOLUTION_REF_DUPLICATE');
    store.set(opaqueResolutionRef, resolution);
    return deepFreezeV1({ nodeId: resolution.nodeId, opaqueResolutionRef,
      expectedResolutionHash: resolution.resolutionHash });
  });
  const produced = new Set(resolutions.flatMap(({ producedArtifactRefs }) => producedArtifactRefs));
  const initialArtifactRefs = unique(resolutions.flatMap(({ requiredArtifactRefs }) => requiredArtifactRefs)
    .filter((ref) => !produced.has(ref)));
  const finalRevision = text(record(snapshot.currentProject).projectRevision);
  const requiredFinalArtifactRefs = [`receipt:project-42:${finalRevision}`];
  if (!produced.has(requiredFinalArtifactRefs[0])) fail('FINAL_RECEIPT_NOT_PRODUCED');
  const receiptMaterial = {
    schemaVersion: STAGE25_PROVIDER_DEPENDENCY_EFFECT_OWNER_VERSION_V1,
    authority: 'RESEARCH_EFFECT_OWNER_NO_PROJECT_MUTATION' as const,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    projectionReceiptHash: text(input.projection.receipt.receiptHash),
    ownerSnapshotSha256: hashCanonicalJsonV1(snapshot),
    toolSetSha256: input.toolSet.toolSetSha256,
    timebase: input.timebase,
    resolutionHashes: resolutions.map(({ resolutionHash }) => resolutionHash),
    initialArtifactRefs, requiredFinalArtifactRefs,
    whatHasNotBeenChecked: [
      'PROJECT_SERVICE_RELOAD', 'RENDERED_VISUAL_PROOF',
      'RENDERED_AUDIO_PROOF', 'PRODUCT_AUTHORITY_INTEGRATION',
    ] as const,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...receiptMaterial,
    receiptHash: hashCanonicalJsonV1(receiptMaterial) });
  return deepFreezeV1({ refs, resolutions, initialArtifactRefs,
    requiredFinalArtifactRefs, receipt,
    resolve: (opaqueRef: string) => store.get(opaqueRef) });
}

function validateSource(input: Readonly<{
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  projection: Readonly<Stage25ProviderTraceProjectionV1>;
  ownerSnapshot: unknown;
}>): JsonRecord {
  const snapshot = record(input.ownerSnapshot);
  const currentProject = record(snapshot.currentProject);
  if (snapshot.authority !== 'RESEARCH_ISOLATED_CLONE_ONLY'
    || !Array.isArray(snapshot.stateEffects) || snapshot.stateEffects.length
    || snapshot.afterStateHash !== hashCanonicalJsonV1(currentProject)
    || currentProject.projectId !== 'project-42'
    || currentProject.projectRevision !== 'R45'
    || !sameSet(strings(snapshot.changedPaths), REQUIRED_CHANGED_PATHS)
    || input.projection.compiledGraph.sourceProviderEpisodeReceiptHash
      !== input.providerEpisode.receiptSha256
    || input.projection.receipt.zeroAdd !== true
    || input.projection.receipt.zeroDrop !== true) fail('SOURCE_INVALID');
  const ownerTrace = new Map(records(snapshot.trace).map((entry) => [number(entry.turn), entry]));
  for (const turn of input.providerEpisode.turns.filter(({ execution }) => execution)) {
    const turnNumber = number(turn.turn);
    const execution = record(turn.execution);
    const trace = ownerTrace.get(turnNumber) ?? fail(`OWNER_TRACE_MISSING:${turnNumber}`);
    if (trace.operatorId !== record(turn.modelCall).name || trace.disposition !== 'OK'
      || trace.argumentHash !== hashCanonicalJsonV1(turn.normalizedArguments)
      || trace.outputHash !== hashCanonicalJsonV1(execution.output)) {
      fail(`OWNER_TRACE_DRIFT:${turnNumber}`);
    }
  }
  return snapshot;
}

function resolutionFor(input: Readonly<{
  node: JsonRecord;
  operatorId: string;
  tool: ProviderNativeToolSetV2R['operators'][number];
  args: JsonRecord;
  output: JsonRecord;
  snapshot: JsonRecord;
  timebase: Stage25ProjectTimebaseRefV1;
}>): Stage25OperatorEffectResolutionV1 {
  if (!ALLOWED_OPERATORS.has(input.operatorId)) fail(`OPERATOR_UNSUPPORTED:${input.operatorId}`);
  const effects = record(input.tool.plannerRecord.effects);
  const readRegions = strings(effects.reads)
    .some((ref) => ref.startsWith('PROJECT_PATH|')) ? regionsFor(input, 'READ') : [];
  const writeRegions = strings(effects.writes).length ? regionsFor(input, 'WRITE') : [];
  const required = new Set<string>();
  const produced = new Set<string>();
  const invalidated = new Set<string>();
  const traces: Stage25EffectBindingTraceV1[] = [];
  for (const effectClass of ['READ', 'WRITE', 'REQUIRE', 'PRODUCE', 'INVALIDATE'] as const) {
    for (const declaredEffectRef of strings(effects[fieldFor(effectClass)])) {
      const regions = effectClass === 'READ' ? readRegions : effectClass === 'WRITE' ? writeRegions : [];
      const requiresRegion = effectClass === 'WRITE'
        || (effectClass === 'READ' && declaredEffectRef.startsWith('PROJECT_PATH|'));
      const artifact = requiresRegion ? null : artifactFor(input, effectClass, declaredEffectRef);
      if (artifact && (effectClass === 'READ' || effectClass === 'REQUIRE')) required.add(artifact);
      if (artifact && effectClass === 'PRODUCE') produced.add(artifact);
      if (artifact && effectClass === 'INVALIDATE') invalidated.add(artifact);
      traces.push({ effectClass, declaredEffectRef,
        boundRegionIds: requiresRegion ? regions.map(({ regionId }) => regionId) : [],
        boundArtifactRefs: artifact ? [artifact] : [] });
    }
  }
  const material = {
    schemaVersion: STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
    authority: 'OPERATOR_EFFECT_OWNER_ISSUED_RESEARCH_ONLY' as const,
    nodeId: text(input.node.nodeId), operatorId: input.operatorId,
    compiledNodeHash: hashCanonicalJsonV1(input.node),
    plannerRecordHash: hashCanonicalJsonV1(input.tool.plannerRecord),
    effectContractHash: hashCanonicalJsonV1(effects), readRegions, writeRegions,
    requiredArtifactRefs: [...required], producedArtifactRefs: [...produced],
    invalidatedArtifactRefs: [...invalidated], traces,
    stabilityRequirement: 'RANGE_STABLE' as const,
    whatHasNotBeenChecked: [
      'PROJECT_SERVICE_RELOAD', 'RENDERED_VISUAL_PROOF', 'RENDERED_AUDIO_PROOF',
    ],
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, resolutionHash: hashCanonicalJsonV1(material) });
}

function regionsFor(input: Parameters<typeof resolutionFor>[0], effectClass: 'READ' | 'WRITE'):
readonly Stage25EffectRegionV1[] {
  const range = targetRange(input.operatorId, input.args, input.output, input.snapshot);
  const timeRange = range ? { timebase: input.timebase,
    startTick: String(range.start), endExclusiveTick: String(range.end) } : undefined;
  const overlayId = number(input.args.overlayId);
  if (input.operatorId === 'sync_cuts_to_beats') {
    const ids = numbers(input.args.overlayIds);
    return [deepFreezeV1({ regionId: `${text(input.node.nodeId)}-${effectClass.toLowerCase()}`,
      path: effectClass === 'READ' ? ['overlays', 'video'] : ['timeline', 'video-boundaries'],
      range: timeRange, identityRefs: ids.map((id) => `overlay:${id}`) })];
  }
  if (!['resolve_keyframe_edit', 'set_keyframes', 'apply_filter'].includes(input.operatorId)) return [];
  const path = effectClass === 'READ' ? ['overlays', String(overlayId)]
    : input.operatorId === 'set_keyframes'
      ? ['overlays', String(overlayId), 'keyframeTracks', 'scale']
      : ['overlays', String(overlayId), 'styles'];
  return [deepFreezeV1({ regionId: `${text(input.node.nodeId)}-${effectClass.toLowerCase()}`,
    path, range: timeRange, identityRefs: [`overlay:${overlayId}`] })];
}

function targetRange(operatorId: string, args: JsonRecord, output: JsonRecord, snapshot: JsonRecord) {
  if (operatorId === 'sync_cuts_to_beats') {
    const changes = records(record(output.result).changes);
    const points = changes.flatMap((change) => [number(change.originalFrame), number(change.alignedFrame)]);
    if (!points.length || points.some((point) => point < 0)) fail('SYNC_RANGE_MISSING');
    return { start: Math.min(...points), end: Math.max(...points) + 1 };
  }
  const explicit = record(args.targetRange);
  if (Number.isSafeInteger(explicit.startFrame) && Number.isSafeInteger(explicit.endFrame)) {
    return { start: number(explicit.startFrame), end: number(explicit.endFrame) };
  }
  const overlay = records(record(snapshot.currentProject).overlays)
    .find(({ id }) => id === args.overlayId) ?? fail('TARGET_OVERLAY_MISSING');
  return { start: number(overlay.from), end: number(overlay.from) + number(overlay.durationInFrames) };
}

function artifactFor(input: Parameters<typeof resolutionFor>[0], effectClass: EffectClass,
  ref: string): string {
  const projectId = text(input.args.projectId);
  if (ref === 'POLICY|tenant-project-access|NONE') return `policy:tenant-project-access:${projectId}`;
  if (ref === 'EVIDENCE|audio-analysis|AUDIO_SAMPLE') return `evidence:audio-analysis:${text(record(input.output.result).assetId)}`;
  if (ref === 'EVIDENCE|audio-moment-candidates|PROJECT_TIMEBASE'
    || ref === 'EVIDENCE|measured-beat-grid|AUDIO_SAMPLE') return 'evidence:audio-moment:EV-A';
  if (ref === 'EVIDENCE|visual-analysis|SOURCE_PTS') return `evidence:visual-analysis:${projectId}`;
  if (ref === 'EVIDENCE|visual-moment-candidates|PROJECT_TIMEBASE'
    || ref === 'EVIDENCE|visual-target-evidence|SOURCE_PTS') return 'evidence:visual-moment:EV-V';
  if (ref === 'EVIDENCE|keyframe-form-resolution|PROJECT_TIMEBASE') return 'evidence:keyframe-form:EV-FORM';
  if (ref === 'PROOF|project-mutation-receipt|NONE') {
    const revision = text(record(input.output.receipt).projectRevision);
    if (!revision) fail(`MUTATION_RECEIPT_MISSING:${input.operatorId}`);
    return `receipt:${projectId}:${revision}`;
  }
  if (effectClass === 'INVALIDATE' && ref.startsWith('PROOF|')) {
    const range = targetRange(input.operatorId, input.args, input.output, input.snapshot);
    return `stale:${ref}:${projectId}:${range.start}-${range.end}`;
  }
  return fail(`EFFECT_ARTIFACT_UNSUPPORTED:${input.operatorId}:${effectClass}:${ref}`);
}

function fieldFor(effectClass: EffectClass): string {
  return ({ READ: 'reads', WRITE: 'writes', REQUIRE: 'requires',
    PRODUCE: 'produces', INVALIDATE: 'invalidates' })[effectClass];
}
function turnFromNodeId(nodeId: string): number {
  const match = /^compile-turn-(\d+)$/.exec(nodeId);
  return match ? Number(match[1]) : fail(`NODE_ID_INVALID:${nodeId}`);
}
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))) : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => Number.isSafeInteger(entry)) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function fail(code: string): never { throw new Error(`STAGE25_DEPENDENCY_EFFECT_OWNER_${code}`); }
