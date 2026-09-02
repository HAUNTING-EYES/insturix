import { DURABLE_WORKFLOW_JOB_VERSION_V1 }
  from '../../services/durable-workflow-job-v1';
import { EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_VERSION_V1 }
  from '../../services/editorial-plan-durable-worker-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R,
  PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R,
} from './provider-native-checkpoint-state-codec-v2r';
import {
  PROVIDER_NATIVE_EPISODE_RESUME_DISPATCH_RUNTIME_BOUND_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
} from './provider-native-episode-resume-v2r';
import {
  PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R,
  PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
} from './provider-native-plan-execution-envelope-v2r';
import {
  PROVIDER_NATIVE_PLAN_FRESH_EXECUTION_RECEIPT_VERSION_V2R,
  PROVIDER_NATIVE_PLAN_RESUMED_EXECUTION_RECEIPT_VERSION_V2R,
} from './provider-native-plan-resumed-execution-owner-v2r';
import { PROVIDER_NATIVE_EPISODE_VERSION_V2R }
  from './provider-native-tool-episode-v2r';

export const STAGE25_RESUME_READINESS_FREEZE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RESUME_READINESS_FREEZE_V1_2' as const;

export const STAGE25_RESUME_READINESS_SENTINEL_IDS_V1 = [
  'R1-COMMITTED-WRITER-INTERRUPTION',
  'R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION',
  'R1-NO-PREFIX-PROVIDER-REINVOCATION',
  'R1-STALE-CHECKPOINT-REJECTION',
  'R1-TAMPERED-CHECKPOINT-REJECTION',
  'R1-RUNTIME-BUDGET-DRIFT-REJECTION',
  'R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP',
  'R1-DISPATCH-DISABLED',
] as const;

export type Stage25ResumeReadinessSentinelIdV1 =
  typeof STAGE25_RESUME_READINESS_SENTINEL_IDS_V1[number];

export type Stage25ResumeReadinessOutcomeV1 =
  | 'COMMITTED_WRITER_CHECKPOINT_ACCEPTED'
  | 'SEPARATE_RUNTIME_SUFFIX_REPRESENTED'
  | 'PREFIX_PROVIDER_CALLS_NOT_REINVOKED'
  | 'REJECTED_STALE_BEFORE_PROVIDER'
  | 'REJECTED_TAMPER_BEFORE_PROVIDER'
  | 'REJECTED_BUDGET_DRIFT_BEFORE_PROVIDER'
  | 'UNRESOLVED_DISPATCH_CONSERVATIVELY_TERMINALIZED'
  | 'DISPATCH_REMAINS_DISABLED';

export interface Stage25ResumeReadinessExpectationV1 {
  sentinelId: Stage25ResumeReadinessSentinelIdV1;
  publicRule: string;
  expectedOutcome: Stage25ResumeReadinessOutcomeV1;
  processBoundary: 'SAME_RUNTIME_ALLOWED' | 'DISTINCT_RUNTIME_IDENTITIES_REQUIRED';
  prefixProviderReinvokeCount: 0;
  prefixWriterPureReplay: 'NOT_REQUIRED' | 'REQUIRED_AT_LEAST_ONCE';
  suffixProviderInvoke: 'NOT_REQUIRED' | 'REQUIRED_AT_LEAST_ONCE';
  automaticRetryCount: 0;
  canonicalProjectMutationCount: 0;
  conservativeUnknownOutcomeReservation: 'NOT_REQUIRED' | 'REQUIRED';
}

const NO_REPLAY = {
  processBoundary: 'SAME_RUNTIME_ALLOWED' as const,
  prefixProviderReinvokeCount: 0 as const,
  prefixWriterPureReplay: 'NOT_REQUIRED' as const,
  suffixProviderInvoke: 'NOT_REQUIRED' as const,
  automaticRetryCount: 0 as const,
  canonicalProjectMutationCount: 0 as const,
  conservativeUnknownOutcomeReservation: 'NOT_REQUIRED' as const,
};

export const STAGE25_RESUME_READINESS_EXPECTATIONS_V1:
readonly Readonly<Stage25ResumeReadinessExpectationV1>[] = deepFreezeV1([
  {
    sentinelId: 'R1-COMMITTED-WRITER-INTERRUPTION',
    publicRule: 'An interruption checkpoint is eligible only after the writer turn and its writer-issued proposal revision have been durably committed.',
    expectedOutcome: 'COMMITTED_WRITER_CHECKPOINT_ACCEPTED',
    ...NO_REPLAY,
  },
  {
    sentinelId: 'R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION',
    publicRule: 'The serialized checkpoint and proposal-recovery state must hydrate under a distinct runtime identity and expose only suffix provider work.',
    expectedOutcome: 'SEPARATE_RUNTIME_SUFFIX_REPRESENTED',
    processBoundary: 'DISTINCT_RUNTIME_IDENTITIES_REQUIRED',
    prefixProviderReinvokeCount: 0,
    prefixWriterPureReplay: 'REQUIRED_AT_LEAST_ONCE',
    suffixProviderInvoke: 'REQUIRED_AT_LEAST_ONCE',
    automaticRetryCount: 0,
    canonicalProjectMutationCount: 0,
    conservativeUnknownOutcomeReservation: 'NOT_REQUIRED',
  },
  {
    sentinelId: 'R1-NO-PREFIX-PROVIDER-REINVOCATION',
    publicRule: 'Recovery may purely replay committed writers into an isolated clone, but it must never call the provider again for a committed prefix turn.',
    expectedOutcome: 'PREFIX_PROVIDER_CALLS_NOT_REINVOKED',
    processBoundary: 'DISTINCT_RUNTIME_IDENTITIES_REQUIRED',
    prefixProviderReinvokeCount: 0,
    prefixWriterPureReplay: 'REQUIRED_AT_LEAST_ONCE',
    suffixProviderInvoke: 'REQUIRED_AT_LEAST_ONCE',
    automaticRetryCount: 0,
    canonicalProjectMutationCount: 0,
    conservativeUnknownOutcomeReservation: 'NOT_REQUIRED',
  },
  {
    sentinelId: 'R1-STALE-CHECKPOINT-REJECTION',
    publicRule: 'A checkpoint whose bound current proposal revision is stale must fail before artifact execution or provider invocation.',
    expectedOutcome: 'REJECTED_STALE_BEFORE_PROVIDER',
    ...NO_REPLAY,
  },
  {
    sentinelId: 'R1-TAMPERED-CHECKPOINT-REJECTION',
    publicRule: 'A checkpoint, opaque result, proposal recovery state or outer state hash that was altered must fail before suffix execution.',
    expectedOutcome: 'REJECTED_TAMPER_BEFORE_PROVIDER',
    ...NO_REPLAY,
  },
  {
    sentinelId: 'R1-RUNTIME-BUDGET-DRIFT-REJECTION',
    publicRule: 'Route, pricing, guard identity, cumulative usage and reservation state must equal the checkpoint-bound runtime budget before provider invocation.',
    expectedOutcome: 'REJECTED_BUDGET_DRIFT_BEFORE_PROVIDER',
    ...NO_REPLAY,
  },
  {
    sentinelId: 'R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP',
    publicRule: 'An unresolved persisted dispatch intent is conservatively accounted, receives no automatic retry and terminalizes without another provider call.',
    expectedOutcome: 'UNRESOLVED_DISPATCH_CONSERVATIVELY_TERMINALIZED',
    ...NO_REPLAY,
    conservativeUnknownOutcomeReservation: 'REQUIRED',
  },
  {
    sentinelId: 'R1-DISPATCH-DISABLED',
    publicRule: 'This freeze and every derived specification-fixture receipt keep provider dispatch disabled until a successor paid authorization is separately issued.',
    expectedOutcome: 'DISPATCH_REMAINS_DISABLED',
    ...NO_REPLAY,
  },
]);

export const STAGE25_RESUME_READINESS_EXISTING_OWNER_BINDINGS_V1 = deepFreezeV1({
  planExecutionOwnerId: PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
  planExecutionOwnerVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  planEnvelopeVersion: PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R,
  durableJobVersion: DURABLE_WORKFLOW_JOB_VERSION_V1,
  durableWorkerReceiptVersion: EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_VERSION_V1,
  checkpointStateVersions: [
    PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R,
    PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R,
  ],
  resumeCheckpointVersion:
    PROVIDER_NATIVE_EPISODE_RESUME_DISPATCH_RUNTIME_BOUND_VERSION_V2R,
  runtimeGuardResumeVersion:
    PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
  executionReceiptVersions: [
    PROVIDER_NATIVE_PLAN_FRESH_EXECUTION_RECEIPT_VERSION_V2R,
    PROVIDER_NATIVE_PLAN_RESUMED_EXECUTION_RECEIPT_VERSION_V2R,
  ],
});

const FREEZE_MATERIAL = {
  version: STAGE25_RESUME_READINESS_FREEZE_VERSION_V1,
  artifactType: 'Stage25ResumeSpecificationFreezeV1' as const,
  authority: 'ZERO_SPEND_SPECIFICATION_NOT_RESUME_READINESS_OR_PROJECT_OWNER' as const,
  existingOwnerBindings: STAGE25_RESUME_READINESS_EXISTING_OWNER_BINDINGS_V1,
  expectations: STAGE25_RESUME_READINESS_EXPECTATIONS_V1,
  proofCeiling: 'LOCAL_ZERO_SPEND_SPECIFICATION_FIXTURE_ONLY' as const,
  whatHasNotBeenChecked: [
    'EXECUTABLE_OWNER_OUTCOME_BINDING',
    'TEST_RUN_RECEIPT_BINDING',
    'PAID_PROVIDER_RESUME',
    'LIVE_ATLAS_RECOVERY',
    'LIVE_QSTASH_REDELIVERY',
    'AUTHENTICATED_HOSTED_WORKER_INGRESS',
    'CANONICAL_PROJECTSERVICE_APPLY_RELOAD',
    'RENDERED_AUDIOVISUAL_ACCEPTANCE',
  ],
  executableOwnerEvidenceBound: false as const,
  resumeReadinessEstablished: false as const,
  callerSuppliedExamplesMayEstablishReadiness: false as const,
  dispatchAuthorized: false as const,
  providerInferenceCallCount: 0 as const,
  stateEffects: [] as const,
};

export const STAGE25_RESUME_READINESS_FREEZE_V1 = deepFreezeV1({
  ...FREEZE_MATERIAL,
  freezeSha256: hashCanonicalJsonV1(FREEZE_MATERIAL),
});
