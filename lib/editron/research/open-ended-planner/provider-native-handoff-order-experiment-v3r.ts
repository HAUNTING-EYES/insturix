import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3 }
  from '../capability-census/cap2-current-truth-reissue-audit-v3';
import {
  buildProviderNativeCohortManifestV2R,
  type ProviderNativeCohortCaseV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import { PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R }
  from './provider-native-dev03-connected-episode-v2r';
import {
  buildProviderNativeDev03EvidenceVisibilityV3R,
  PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R,
  type ProviderNativeEvidenceVisibilityReceiptV3R,
} from './provider-native-evidence-visibility-v3r';
import {
  PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
  type ProviderNativeArgumentHandoffModeV2R,
} from './provider-native-result-references-v2r';
import type { ProviderNativeEpisodeContextV2R } from './provider-native-tool-episode-v2r';
import type { V2RBenchmarkTaskRegistryV2 } from './v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V3R =
  'EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_V3R_4' as const;
export const PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_ID_V3R =
  'EDITRON_V3R_DEV03_WRITER_REVISION_HANDOFF_ORDER_V4' as const;
export const PROVIDER_NATIVE_HANDOFF_ORDER_PERMUTATION_SEED_V3R =
  'editron-v3r4-dev03-writer-revision-handoff-20260821' as const;
export const PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V3R = [
  'DIRECT_ARGUMENTS',
  'OPAQUE_RESULT_REFERENCES',
] as const satisfies readonly ProviderNativeArgumentHandoffModeV2R[];
export const PROVIDER_NATIVE_HANDOFF_ORDER_REQUIRED_CAUSAL_ORDER_V3R = [
  'find_audio_moment',
  'sync_cuts_to_beats',
  'apply_camera_shake',
] as const;

export const PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R = deepFreezeV1({
  version: 'EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R_3',
  independentlyReportedMetrics: [
    'FIRST_RELEVANT_CHOICE_CORRECT', 'PREMATURE_DEPENDENT_CALL_SAFELY_REJECTED',
    'EVENTUAL_CAUSAL_EXECUTION', 'REQUIRED_RESULT_HANDOFF', 'WRITER_REVISION_HANDOFF',
    'RENDERED_PRODUCT_PASS', 'NO_PROJECT_MUTATION',
  ],
  safeOutcomeRequirements: [
    'EVENTUAL_CAUSAL_EXECUTION',
    'REQUIRED_RESULT_HANDOFF',
    'WRITER_REVISION_HANDOFF',
    'RENDERED_PRODUCT_PASS',
    'NO_PROJECT_MUTATION',
  ],
  providerInfrastructureDispositions: [
    'PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR',
  ],
  renderInfrastructureErrorPatterns: ['NetworkError', 'network error', 'ERR_NAME_NOT_RESOLVED'],
} as const);

export const PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R =
  'lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v3r.ts' as const;
export interface ProviderNativeHandoffOrderManifestV3R {
  version: typeof PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V3R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  experimentId: typeof PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_ID_V3R;
  sourceCohortManifestSha256: string;
  sourceCaseEntrySha256: string;
  cap2CurrentTruthBinding: Readonly<{
    artifactType: 'EditronCapabilityCurrentTruthReissueAuditV3';
    manifestSha256: string;
    normalizedSourceSnapshotSha256: string;
    sourceCommit: string;
    runtimeAuthorityDenied: true;
  }>;
  connectedEpisodeVersion: typeof PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R;
  resultReferenceVersion: typeof PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R;
  evidenceVisibilityVersion: typeof PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R;
  evidenceDeliveryMode: 'RESOLVER_HANDOFF_REQUIRED';
  evaluatorPolicySha256: string;
  evaluatorSourcePath: typeof PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R;
  evaluatorSourceSha256: string;
  sourceCaseEntry: Readonly<ProviderNativeCohortCaseV2R>;
  modelContext: Readonly<ProviderNativeEpisodeContextV2R>;
  prerequisitePolicy: Readonly<JsonRecord>;
  visibilityReceipt: Readonly<ProviderNativeEvidenceVisibilityReceiptV3R>;
  routes: readonly Readonly<ProviderNativeCohortRouteV2R>[];
  arms: typeof PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V3R;
  presentationPermutationSeed: typeof PROVIDER_NATIVE_HANDOFF_ORDER_PERMUTATION_SEED_V3R;
  presentationPermutations: readonly (readonly string[])[];
  requiredCausalOrder: typeof PROVIDER_NATIVE_HANDOFF_ORDER_REQUIRED_CAUSAL_ORDER_V3R;
  repetitionsPerRouteArm: 3;
  absoluteMaxSpendUsd: number;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildProviderNativeHandoffOrderManifestV3R(
  registry: Readonly<V2RBenchmarkTaskRegistryV2>,
  evaluatorSourceSha256: string,
): Readonly<ProviderNativeHandoffOrderManifestV3R> {
  if (!/^[a-f0-9]{64}$/.test(evaluatorSourceSha256)) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_EVALUATOR_SOURCE_HASH_INVALID');
  const source = buildProviderNativeCohortManifestV2R(registry);
  const sourceCaseEntry = source.cases.find(({ caseId }) => caseId === 'DEV-03:BASELINE');
  if (!sourceCaseEntry) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_CASE_MISSING');
  const split = buildProviderNativeDev03EvidenceVisibilityV3R({
    ownerEvidenceContext: sourceCaseEntry.context,
    mode: 'RESOLVER_HANDOFF_REQUIRED',
    permutationSeed: PROVIDER_NATIVE_HANDOFF_ORDER_PERMUTATION_SEED_V3R,
    permutationCount: 3,
  });
  const repetitionsPerRouteArm = 3 as const;
  const absoluteMaxSpendUsd = roundUsd(source.routes.reduce((sum, routeEntry) => (
    sum + worstCaseSpend(routeEntry, sourceCaseEntry)
      * repetitionsPerRouteArm * PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V3R.length
  ), 0));
  const material = {
    version: PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V3R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_ID_V3R,
    sourceCohortManifestSha256: source.manifestSha256,
    sourceCaseEntrySha256: hashCanonicalJsonV1(sourceCaseEntry),
    cap2CurrentTruthBinding: {
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.artifactType,
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash,
      normalizedSourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash,
      sourceCommit: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.commit,
      runtimeAuthorityDenied: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.reissueGate
        .runtimeAuthorityDenied,
    },
    connectedEpisodeVersion: PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R,
    resultReferenceVersion: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
    evidenceVisibilityVersion: PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R,
    evidenceDeliveryMode: 'RESOLVER_HANDOFF_REQUIRED' as const,
    evaluatorPolicySha256: hashCanonicalJsonV1(
      PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R,
    ),
    evaluatorSourcePath: PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R,
    evaluatorSourceSha256,
    sourceCaseEntry,
    modelContext: split.modelContext,
    prerequisitePolicy: split.prerequisitePolicy,
    visibilityReceipt: split.receipt,
    routes: source.routes,
    arms: PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V3R,
    presentationPermutationSeed: PROVIDER_NATIVE_HANDOFF_ORDER_PERMUTATION_SEED_V3R,
    presentationPermutations: split.presentationPermutations,
    requiredCausalOrder: PROVIDER_NATIVE_HANDOFF_ORDER_REQUIRED_CAUSAL_ORDER_V3R,
    repetitionsPerRouteArm,
    absoluteMaxSpendUsd,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertProviderNativeHandoffOrderManifestV3R(
  value: unknown,
): Readonly<ProviderNativeHandoffOrderManifestV3R> {
  if (!isRecord(value)) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_MANIFEST_MISSING');
  const manifest = value as unknown as ProviderNativeHandoffOrderManifestV3R;
  const { manifestSha256, ...material } = manifest;
  const rebuilt = buildProviderNativeDev03EvidenceVisibilityV3R({
    ownerEvidenceContext: manifest.sourceCaseEntry.context,
    mode: 'RESOLVER_HANDOFF_REQUIRED',
    permutationSeed: PROVIDER_NATIVE_HANDOFF_ORDER_PERMUTATION_SEED_V3R,
    permutationCount: 3,
  });
  const routeRoster = manifest.routes.map(({ route }) => `${route.routeId}:${route.model}`);
  if (manifest.version !== PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V3R
    || manifest.experimentId !== PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_ID_V3R
    || manifest.connectedEpisodeVersion !== PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R
    || manifest.resultReferenceVersion !== PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R
    || manifest.evidenceVisibilityVersion !== PROVIDER_NATIVE_EVIDENCE_VISIBILITY_VERSION_V3R
    || manifest.evidenceDeliveryMode !== 'RESOLVER_HANDOFF_REQUIRED'
    || manifest.evaluatorPolicySha256 !== hashCanonicalJsonV1(
      PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R,
    )
    || manifest.evaluatorSourcePath !== PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R
    || !/^[a-f0-9]{64}$/.test(manifest.evaluatorSourceSha256)
    || manifestSha256 !== hashCanonicalJsonV1(material)
    || manifest.sourceCaseEntry.caseId !== 'DEV-03:BASELINE'
    || manifest.sourceCaseEntrySha256 !== hashCanonicalJsonV1(manifest.sourceCaseEntry)
    || manifest.cap2CurrentTruthBinding.artifactType
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.artifactType
    || manifest.cap2CurrentTruthBinding.manifestSha256
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash
    || manifest.cap2CurrentTruthBinding.normalizedSourceSnapshotSha256
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash
    || manifest.cap2CurrentTruthBinding.sourceCommit
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.commit
    || manifest.cap2CurrentTruthBinding.runtimeAuthorityDenied !== true
    || manifest.sourceCaseEntry.contextSha256
      !== hashCanonicalJsonV1(manifest.sourceCaseEntry.context)
    || hashCanonicalJsonV1(manifest.modelContext) !== rebuilt.receipt.modelContextSha256
    || hashCanonicalJsonV1(manifest.prerequisitePolicy)
      !== rebuilt.receipt.prerequisitePolicySha256
    || hashCanonicalJsonV1(manifest.presentationPermutations)
      !== rebuilt.receipt.presentationPermutationsSha256
    || hashCanonicalJsonV1(manifest.visibilityReceipt)
      !== hashCanonicalJsonV1(rebuilt.receipt)
    || !sameStrings(routeRoster, [
      'OPENAI_LUNA:gpt-5.6-luna',
      'OPENAI_TERRA:gpt-5.6-terra',
      'GOOGLE_FLASH:gemini-3.7-flash',
    ])
    || !sameStrings(manifest.arms, PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V3R)
    || !sameStrings(
      manifest.requiredCausalOrder,
      PROVIDER_NATIVE_HANDOFF_ORDER_REQUIRED_CAUSAL_ORDER_V3R,
    )
    || manifest.repetitionsPerRouteArm !== 3
    || manifest.stateEffects.length !== 0) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_MANIFEST_DRIFT');
  }
  return deepFreezeV1(manifest);
}

export function evaluateProviderNativeHandoffOrderEpisodeV3R(
  receipt: JsonRecord,
  arm: ProviderNativeArgumentHandoffModeV2R,
  order: readonly string[],
): Readonly<JsonRecord> {
  const episode = record(receipt.providerEpisode);
  const turns = records(episode.turns);
  const attempted = turns.map((turn) => text(record(turn.modelCall).name)).filter(Boolean);
  const successful = turns.filter((turn) => record(turn.execution).disposition === 'OK')
    .map((turn) => text(record(turn.modelCall).name)).filter(Boolean);
  const relevantAttempts = attempted.filter((operatorId) => order.includes(operatorId));
  const firstRelevantChoiceCorrect = relevantAttempts[0] === order[0];
  let prerequisiteSucceeded = false;
  const prematureTurn = turns.find((turn) => {
    const operatorId = text(record(turn.modelCall).name);
    const disposition = record(turn.execution).disposition;
    if (operatorId === order[0] && disposition === 'OK') prerequisiteSucceeded = true;
    return operatorId === order[1] && !prerequisiteSucceeded;
  });
  const prematureDependentAttempt = Boolean(prematureTurn);
  const prematureDependentAttemptSafelyRejected = prematureTurn
    ? record(prematureTurn.execution).disposition !== 'OK' : null;
  const eventualCausalExecutionPass = ordered(successful, order);
  const resultBindings = turns.flatMap((turn) => records(turn.argumentReferenceBindings));
  const successfulSync = turns.find((turn) => (
    text(record(turn.modelCall).name) === 'sync_cuts_to_beats'
      && record(turn.execution).disposition === 'OK'
  ));
  const successfulShake = turns.find((turn) => (
    text(record(turn.modelCall).name) === 'apply_camera_shake'
      && record(turn.execution).disposition === 'OK'
  ));
  const syncBindings = records(successfulSync?.argumentReferenceBindings);
  const shakeBindings = records(successfulShake?.argumentReferenceBindings);
  const syncArguments = record(successfulSync?.normalizedArguments);
  const shakeArguments = record(successfulShake?.normalizedArguments);
  const syncOutput = record(record(successfulSync?.execution).output);
  const syncReceipt = record(syncOutput.receipt);
  const syncBeforeRevision = text(syncArguments.expectedProjectRevision);
  const writerIssuedRevision = text(syncReceipt.projectRevision);
  const shakeExpectedRevision = text(shakeArguments.expectedProjectRevision);
  // R_after is owned by the successful writer receipt. Equality to the initial
  // context revision is never sufficient for a downstream CAS mutation.
  const writerRevisionAdvanced = Boolean(syncBeforeRevision && writerIssuedRevision)
    && writerIssuedRevision !== syncBeforeRevision;
  const writerRevisionValuePass = writerRevisionAdvanced
    && shakeExpectedRevision === writerIssuedRevision;
  const writerRevisionReferencePass = arm === 'DIRECT_ARGUMENTS'
    ? true
    : hasBinding(shakeBindings, {
        targetField: 'expectedProjectRevision', sourceOperatorId: 'sync_cuts_to_beats',
        sourceOutputField: 'receipt.projectRevision',
      });
  const writerRevisionHandoffPass = writerRevisionValuePass
    && writerRevisionReferencePass;
  const resultHandoffPass = arm === 'DIRECT_ARGUMENTS'
    ? resultBindings.length === 0
    : hasBinding(syncBindings, {
        targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
        sourceOutputField: 'result',
      })
      && hasBinding(shakeBindings, {
        targetField: 'overlayId', sourceOperatorId: 'sync_cuts_to_beats',
        sourceOutputField: 'result.finalHitOverlayId',
      })
      && hasBinding(shakeBindings, {
        targetField: 'targetFrame', sourceOperatorId: 'sync_cuts_to_beats',
        sourceOutputField: 'result.finalStrongPeakFrame',
      })
      && writerRevisionReferencePass;
  const renderedProductPass = receipt.productOutcome === 'PASS';
  const noProjectMutation = Array.isArray(receipt.stateEffects) && receipt.stateEffects.length === 0;
  const providerTerminalDisposition = text(record(episode.terminal).disposition);
  const providerInfrastructureUnverifiable = (
    PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R
      .providerInfrastructureDispositions as readonly string[]
  ).includes(providerTerminalDisposition)
    || receipt.productOutcome === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
  const renderInfrastructureUnverifiable = records(record(receipt.execution).proofAttempts)
    .some((attempt) => {
      const error = text(attempt.error);
      return PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V3R
        .renderInfrastructureErrorPatterns.some((pattern) => error.includes(pattern));
    });
  const reasonCodes = [
    ...(!eventualCausalExecutionPass ? ['EVENTUAL_CAUSAL_EXECUTION_FAILED'] : []),
    ...(!resultHandoffPass ? ['RESULT_HANDOFF_FAILED'] : []),
    ...(!writerRevisionHandoffPass ? ['WRITER_REVISION_HANDOFF_FAILED'] : []),
    ...(!renderedProductPass ? ['RENDERED_PRODUCT_NOT_PASS'] : []),
    ...(!noProjectMutation ? ['FORBIDDEN_PROJECT_MUTATION'] : []),
  ];
  const assessment = providerInfrastructureUnverifiable
    ? 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'
    : renderInfrastructureUnverifiable
      ? 'RENDER_INFRASTRUCTURE_UNVERIFIABLE'
      : reasonCodes.length === 0 ? 'PASS' : 'FAIL';
  return deepFreezeV1({
    assessment, reasonCodes, attempted, successful, providerTerminalDisposition,
    firstRelevantChoiceCorrect,
    strictAttemptedCausalOrderPass: ordered(attempted, order),
    prematureDependentAttempt,
    prematureDependentAttemptSafelyRejected,
    recoveredAfterPrematureAttempt: prematureDependentAttempt && eventualCausalExecutionPass,
    eventualCausalExecutionPass,
    resultHandoffPass,
    writerRevisionHandoffPass,
    writerRevisionAdvanced,
    writerRevisionReferencePass,
    renderedProductPass,
    noProjectMutation,
  });
}

function hasBinding(
  bindings: readonly JsonRecord[],
  expected: Readonly<{
    targetField: string;
    sourceOperatorId: string;
    sourceOutputField: string;
  }>,
): boolean {
  return bindings.some((binding) => binding.targetField === expected.targetField
    && binding.sourceOperatorId === expected.sourceOperatorId
    && binding.sourceOutputField === expected.sourceOutputField);
}

function worstCaseSpend(route: Readonly<ProviderNativeCohortRouteV2R>,
  taskCase: Readonly<ProviderNativeCohortCaseV2R>): number {
  const inputRate = Math.max(
    route.pricing.inputUsdPerMillion,
    route.pricing.cacheWriteUsdPerMillion,
  );
  return taskCase.context.budget.maxTurns * (
    taskCase.maxInputTokensPerTurn * inputRate
      + taskCase.context.budget.maxOutputTokensPerTurn * route.pricing.outputUsdPerMillion
  ) / 1_000_000;
}

function ordered(calls: readonly string[], required: readonly string[]): boolean {
  const positions = required.map((operatorId) => calls.indexOf(operatorId));
  return positions.every((position) => position >= 0)
    && positions.every((position, index) => index === 0 || positions[index - 1] < position);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
