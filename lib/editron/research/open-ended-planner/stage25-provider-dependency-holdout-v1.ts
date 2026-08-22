import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import {
  buildProviderNativeToolSetV2R,
  type ProviderNativeToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  projectProviderEpisodeSelectedOperationNodesV2R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1 =
  'EDITRON_OE_STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_V1' as const;
export const STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1 =
  'HOLD-FORK-JOIN-01' as const;
export const STAGE25_PROVIDER_DEPENDENCY_EPISODE_ID_V1 =
  'stage25-provider-fork-join-01' as const;
export const STAGE25_PROVIDER_DEPENDENCY_PRESENTATION_ORDER_V1 = [
  'apply_filter', 'find_visual_moment', 'set_keyframes',
  'find_audio_moment', 'resolve_keyframe_edit', 'sync_cuts_to_beats',
] as const;

const REQUIRED_OPERATORS = [
  'find_audio_moment', 'find_visual_moment', 'sync_cuts_to_beats',
  'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
] as const;
export const STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1 = [
  'apply_filter', 'find_audio_moment', 'find_visual_moment',
  'resolve_keyframe_edit', 'set_keyframes', 'sync_cuts_to_beats',
] as const;

export function buildStage25ProviderDependencyToolSetV1(
  presentationOrder: readonly string[] =
    STAGE25_PROVIDER_DEPENDENCY_PRESENTATION_ORDER_V1,
):
Readonly<ProviderNativeToolSetV2R> {
  if (!sameSet(presentationOrder, REQUIRED_OPERATORS)) {
    fail('PRESENTATION_ORDER_NOT_EXACT_OPERATOR_PERMUTATION');
  }
  return buildProviderNativeToolSetV2R(presentationOrder);
}

export function buildStage25ProviderDependencyContextV1():
Readonly<ProviderNativeEpisodeContextV2R> {
  const catalog = records(V2R_OPERATOR_CATALOG.operators);
  const eligible = new Set<string>(REQUIRED_OPERATORS);
  const completeDirectory = catalog.map((operator) => ({
    operatorId: text(operator.operatorId), kind: text(operator.kind),
    supportStatus: text(operator.supportStatus),
    compilerEligibility: text(operator.compilerEligibility),
    episodeEligibility: eligible.has(text(operator.operatorId))
      ? 'CALLABLE_ISOLATED_CLONE_ONLY'
      : 'NOT_ELIGIBLE_FOR_THIS_BOUNDED_TARGET',
  }));
  if (completeDirectory.length !== 40
    || new Set(completeDirectory.map(({ operatorId }) => operatorId)).size !== 40) {
    fail('CAPABILITY_DIRECTORY_NOT_40_UNIQUE_OPERATORS');
  }
  return deepFreezeV1({
    episodeId: STAGE25_PROVIDER_DEPENDENCY_EPISODE_ID_V1,
    objective: [
      'Improve the opening montage and product reveal without touching dialogue or unrelated ranges.',
      'Align opening cuts to measured strong music impacts only when owner evidence, source handles and speech protection permit it.',
      'Separately apply a restrained product push-in at the visually verified product moment, then a restrained warm treatment to that same product range.',
      'Finish only when the isolated result is ready for bounded proof; otherwise return an honest typed non-success.',
    ].join(' '),
    activeTarget: {
      taskId: STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
      requestedOutcomes: [
        'opening-cut-rhythm-improved', 'product-push-in-restrained',
        'product-range-warm-treatment',
      ],
      boundedRanges: [
        { purpose: 'opening-timing', startFrame: 0, endFrame: 360 },
        { purpose: 'product-treatment', startFrame: 600, endFrame: 720 },
      ],
      proofStatus: 'NOT_RUN',
    },
    revisionBinding: {
      projectId: 'project-42', expectedProjectRevision: 'R42',
      timebase: { numerator: 30, denominator: 1 },
    },
    projectState: {
      projectId: 'project-42', projectRevision: 'R42', durationInFrames: 720,
      openingOverlayIds: [1, 2, 3], productRange: { startFrame: 600, endFrame: 720 },
    },
    evidence: [
      { evidenceId: 'EV-A', kind: 'OWNER_EVIDENCE_AVAILABLE', ownerOperatorId: 'find_audio_moment', availableOutput: 'result' },
      { evidenceId: 'EV-V', kind: 'OWNER_EVIDENCE_AVAILABLE', ownerOperatorId: 'find_visual_moment', availableOutputs: ['overlayId', 'targetFrame', 'focalPoint', 'evidenceStrength'] },
      { evidenceId: 'EV-P', kind: 'PRESERVATION_FACT', protectedSpeechRange: { startFrame: 0, endFrame: 90 } },
    ],
    preservationRules: [
      'Do not move a cut across protected speech.',
      'Do not use a beat without measured owner evidence and sufficient source handles.',
      'Do not alter frames outside 0-360 or 600-720.',
      'Do not claim rendered visual or audio proof before the proof owner runs.',
    ],
    authorityAndPolicy: {
      executionAuthority: 'RESEARCH_ISOLATED_CLONE_ONLY',
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      completeCapabilityDossier: {
        completeDirectory,
        exactEligibleOperatorIds: [
          ...STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1,
        ],
        plannerRecordSupplements: prerequisiteSupplements(),
        ineligibleOperatorCount: 34,
      },
    },
    budget: { maxTurns: 9, maxOutputTokensPerTurn: 768, maxIdenticalCalls: 1 },
  });
}

export function buildStage25ProviderDependencyTraceV1(input: {
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
}): Readonly<JsonRecord> {
  const projected = projectProviderEpisodeSelectedOperationNodesV2R({
    providerEpisode: input.providerEpisode,
    context: input.context as unknown as JsonRecord,
    operatorCatalog: V2R_OPERATOR_CATALOG as unknown as JsonRecord,
  });
  const traceSha256 = hashCanonicalJsonV1(projected.nodes);
  const material = {
    version: STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1,
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION' as const,
    caseId: STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
    episodeId: input.providerEpisode.episodeId,
    contextSha256: input.providerEpisode.contextSha256,
    providerEpisodeReceiptSha256: input.providerEpisode.receiptSha256,
    route: input.providerEpisode.route,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    nodes: projected.nodes,
    researchCloneMutationCount: projected.nodes.filter(({ researchCloneMutation }) => researchCloneMutation).length,
    assessment: projected.sortedDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: projected.sortedDiagnostics,
    stateEffects: [] as const,
    traceSha256,
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

export function evaluateStage25ProviderDependencyHoldoutV1(input: {
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  trace: Readonly<JsonRecord>;
  ownerSnapshot: Readonly<JsonRecord>;
}): Readonly<JsonRecord> {
  const rebuiltTrace = buildStage25ProviderDependencyTraceV1(input);
  const successful = records(input.providerEpisode.turns)
    .filter((turn) => record(turn.execution).disposition === 'OK')
    .map((turn) => text(record(turn.modelCall).name)).filter(Boolean);
  const diagnostics: string[] = [];
  if (hashCanonicalJsonV1(input.trace) !== hashCanonicalJsonV1(rebuiltTrace)) diagnostics.push('TRACE_DRIFT');
  if (input.providerEpisode.terminal.disposition !== 'READY_FOR_PROOF') diagnostics.push('TERMINAL_NOT_READY_FOR_PROOF');
  if (!sameSet(successful, REQUIRED_OPERATORS)) diagnostics.push('REQUIRED_OPERATOR_SET_INVALID');
  requireBefore(diagnostics, successful, 'find_audio_moment', 'sync_cuts_to_beats');
  requireBefore(diagnostics, successful, 'find_visual_moment', 'resolve_keyframe_edit');
  requireBefore(diagnostics, successful, 'sync_cuts_to_beats', 'resolve_keyframe_edit');
  requireBefore(diagnostics, successful, 'resolve_keyframe_edit', 'set_keyframes');
  requireBefore(diagnostics, successful, 'set_keyframes', 'apply_filter');
  if (!sameSet(strings(input.ownerSnapshot.mutationStages), ['SYNC', 'KEYFRAMES', 'FILTER'])) diagnostics.push('OWNER_MUTATION_STAGES_INVALID');
  if (input.ownerSnapshot.currentProjectRevision !== 'R45') diagnostics.push('OWNER_FINAL_REVISION_INVALID');
  if (input.ownerSnapshot.beforeStateHash === input.ownerSnapshot.afterStateHash) diagnostics.push('OWNER_STATE_UNCHANGED');
  if (!Array.isArray(input.providerEpisode.stateEffects) || input.providerEpisode.stateEffects.length) diagnostics.push('REAL_PROJECT_STATE_EFFECT_REPORTED');
  const uniqueDiagnostics = [...new Set(diagnostics)].sort(compareUtf16);
  const material = {
    version: STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1,
    authority: 'HIDDEN_RESEARCH_EVALUATOR_NO_PROJECT_MUTATION' as const,
    taskId: STAGE25_PROVIDER_DEPENDENCY_TASK_ID_V1,
    episodeReceiptSha256: input.providerEpisode.receiptSha256,
    traceArtifactSha256: text(input.trace.artifactSha256),
    ownerSnapshotSha256: hashCanonicalJsonV1(input.ownerSnapshot),
    successfulOperatorIds: successful,
    assessment: uniqueDiagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics: uniqueDiagnostics,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function prerequisiteSupplements(): readonly JsonRecord[] {
  const origin = (operatorId: string, outputField: string) => [{ origin: 'OPERATOR_OUTPUT', operatorId, outputField }];
  return [
    { selectableOperatorId: 'sync_cuts_to_beats', inputOrigins: { beatPlan: origin('find_audio_moment', 'result') } },
    { selectableOperatorId: 'resolve_keyframe_edit', inputOrigins: {
      expectedProjectRevision: origin('sync_cuts_to_beats', 'receipt.projectRevision'),
      overlayId: origin('find_visual_moment', 'overlayId'), targetFrame: origin('find_visual_moment', 'targetFrame'),
      focalPoint: origin('find_visual_moment', 'focalPoint'), evidenceStrength: origin('find_visual_moment', 'evidenceStrength'),
    } },
    { selectableOperatorId: 'set_keyframes', inputOrigins: {
      expectedProjectRevision: origin('sync_cuts_to_beats', 'receipt.projectRevision'),
      overlayId: origin('resolve_keyframe_edit', 'proposedOperation.arguments.overlayId'),
      keyframes: origin('resolve_keyframe_edit', 'proposedOperation.arguments.keyframes'),
      focalPoint: origin('resolve_keyframe_edit', 'proposedOperation.arguments.focalPoint'),
    } },
    { selectableOperatorId: 'apply_filter', inputOrigins: {
      expectedProjectRevision: origin('set_keyframes', 'receipt.projectRevision'),
      overlayId: origin('resolve_keyframe_edit', 'proposedOperation.arguments.overlayId'),
    } },
  ];
}

function requireBefore(diagnostics: string[], values: readonly string[], before: string, after: string): void {
  if (values.indexOf(before) < 0 || values.indexOf(after) < 0
    || values.indexOf(before) >= values.indexOf(after)) diagnostics.push(`ORDER_INVALID:${before}:${after}`);
}
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value)); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code: string): never { throw new Error(`STAGE25_PROVIDER_DEPENDENCY_${code}`); }
