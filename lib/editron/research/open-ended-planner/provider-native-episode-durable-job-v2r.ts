import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobCreateInputV1,
  type DurableWorkflowJobSnapshotV1,
} from '../../services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '../../services/durable-workflow-job-store-v1';
import { canonicalizeJsonV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  verifyProviderNativeEpisodeResumeCheckpointV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import type { ProviderNativeRouteV2R } from './provider-native-tool-codecs-v2r';
import {
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from './provider-native-proposal-recovery-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_V2R_1' as const;
export const PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_1' as const;
export const PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_2' as const;

const OPERATION_OWNER = 'ProviderNativeToolEpisodeV2R';
const OPERATION_KIND = 'research_provider_native_episode';

export interface ProviderNativeDurableEpisodeIdentityV2R {
  route: Readonly<ProviderNativeRouteV2R>;
  episodeId: string;
  contextSha256: string;
  toolSetSha256: string;
  referenceInputManifestSha256?: string;
  runtimeGuard?: Readonly<{
    guardKind: string;
    guardIdentitySha256: string;
  }>;
}

export function buildProviderNativeEpisodeDurableJobInputV2R(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string | null;
  parentCommandId: string | null;
  parentReceiptId: string | null;
  idempotencyKey: string;
  identity: Readonly<ProviderNativeDurableEpisodeIdentityV2R>;
  budgetReservationId?: string;
  maxAttempts: number;
  expiresAt?: Date;
}>): DurableWorkflowJobCreateInputV1 {
  const identity = normalizeIdentity(input.identity);
  if (Boolean(identity.runtimeGuard) !== Boolean(input.budgetReservationId)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_BUDGET_BINDING_MISMATCH');
  }
  const payload = durableInputPayload(identity);
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    orgId: input.orgId,
    projectId: input.projectId,
    operationOwner: OPERATION_OWNER,
    operationKind: OPERATION_KIND,
    operationId: identity.episodeId,
    parentCommandId: input.parentCommandId,
    parentReceiptId: input.parentReceiptId,
    idempotencyKey: input.idempotencyKey,
    input: {
      schemaId: PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_VERSION_V2R,
      bindingSha256: hashDurableWorkflowJobJsonV1(payload),
      payload,
    },
    dependencies: durableDependencies(identity),
    budgetReservation: identity.runtimeGuard ? {
      reservationId: input.budgetReservationId!,
      bindingSha256: identity.runtimeGuard.guardIdentitySha256,
    } : null,
    maxAttempts: input.maxAttempts,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

export async function persistProviderNativeEpisodeCheckpointV2R(input: Readonly<{
  store: DurableWorkflowJobStoreV1;
  jobId: string;
  tenantId: string;
  userId: string;
  leaseToken: string;
  expectedSequence: number;
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  now?: Date;
}>): Promise<Readonly<{ stateSha256: string; sequence: number }>> {
  const job = await input.store.getAuthorized({
    jobId: input.jobId,
    tenantId: input.tenantId,
    userId: input.userId,
  });
  if (!job) throw new Error('PROVIDER_NATIVE_DURABLE_JOB_NOT_FOUND');
  const identity = identityFromJob(job);
  assertCheckpointIdentity(input.checkpoint, identity);
  if (input.proposalRecoveryState) {
    if (!job.projectId) throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_REQUIRED');
    verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint: input.checkpoint,
      projectId: job.projectId,
      state: input.proposalRecoveryState,
    });
  }
  const payload = checkpointPayload(input.checkpoint, input.proposalRecoveryState);
  const stateSha256 = hashDurableWorkflowJobJsonV1(payload);
  await input.store.saveResumeState({
    jobId: input.jobId,
    leaseToken: input.leaseToken,
    expectedSequence: input.expectedSequence,
    state: {
      schemaId: input.proposalRecoveryState
        ? PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R
        : PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R,
      stateSha256,
      payload,
    },
    ...(input.now ? { now: input.now } : {}),
  });
  return { stateSha256, sequence: input.expectedSequence + 1 };
}

export function restoreProviderNativeEpisodeCheckpointV2R(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  return restoreProviderNativeEpisodeDurableStateV2R(job).checkpoint;
}

export function restoreProviderNativeEpisodeDurableStateV2R(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Readonly<{
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}> {
  const identity = identityFromJob(job);
  const state = job.resumeState;
  const supportedState = state?.schemaId === PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R
    || state?.schemaId === PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R;
  if (!state || !supportedState
    || hashDurableWorkflowJobJsonV1(state.payload) !== state.stateSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RESUME_STATE_INVALID');
  }
  const payload = record(state.payload);
  const checkpoint = record(payload.checkpoint) as unknown as ProviderNativeEpisodeResumeCheckpointV2R;
  if (payload.version !== state.schemaId
    || payload.checkpointSha256 !== checkpoint.checkpointSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_BINDING_INVALID');
  }
  assertCheckpointIdentity(checkpoint, identity);
  if (state.schemaId === PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R) {
    if (!job.projectId) throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_REQUIRED');
    const proposalRecoveryState = record(
      payload.proposalRecoveryState,
    ) as unknown as ProviderNativeProposalRecoveryStateV2R;
    verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint,
      projectId: job.projectId,
      state: proposalRecoveryState,
    });
    return {
      checkpoint: structuredClone(checkpoint),
      proposalRecoveryState: structuredClone(proposalRecoveryState),
    };
  }
  if (payload.proposalRecoveryState !== undefined) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_UNBOUND');
  }
  return { checkpoint: structuredClone(checkpoint) };
}

function identityFromJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Readonly<ProviderNativeDurableEpisodeIdentityV2R> {
  if (job.operationOwner !== OPERATION_OWNER || job.operationKind !== OPERATION_KIND
    || job.input.schemaId !== PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_VERSION_V2R
    || hashDurableWorkflowJobJsonV1(job.input.payload) !== job.input.bindingSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_JOB_IDENTITY_INVALID');
  }
  const payload = record(job.input.payload);
  if (payload.version !== PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_VERSION_V2R
    || payload.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION') {
    throw new Error('PROVIDER_NATIVE_DURABLE_JOB_INPUT_INVALID');
  }
  const runtimeGuard = payload.runtimeGuard === undefined ? undefined : {
    guardKind: text(record(payload.runtimeGuard).guardKind, 'RUNTIME_GUARD_KIND'),
    guardIdentitySha256: sha256(
      record(payload.runtimeGuard).guardIdentitySha256,
      'RUNTIME_GUARD_IDENTITY',
    ),
  };
  const identity = normalizeIdentity({
    route: record(payload.route) as unknown as ProviderNativeRouteV2R,
    episodeId: text(payload.episodeId, 'EPISODE'),
    contextSha256: sha256(payload.contextSha256, 'CONTEXT'),
    toolSetSha256: sha256(payload.toolSetSha256, 'TOOL_SET'),
    ...(payload.referenceInputManifestSha256 === undefined ? {} : {
      referenceInputManifestSha256: sha256(
        payload.referenceInputManifestSha256,
        'REFERENCE_INPUT_MANIFEST',
      ),
    }),
    ...(runtimeGuard ? { runtimeGuard } : {}),
  });
  if (job.operationId !== identity.episodeId
    || canonicalizeJsonV1(durableInputPayload(identity))
      !== canonicalizeJsonV1(job.input.payload)
    || canonicalizeJsonV1(durableDependencies(identity))
      !== canonicalizeJsonV1(job.dependencies)
    || Boolean(identity.runtimeGuard) !== Boolean(job.budgetReservation)
    || (identity.runtimeGuard
      && job.budgetReservation?.bindingSha256
        !== identity.runtimeGuard.guardIdentitySha256)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_JOB_INPUT_MISMATCH');
  }
  return identity;
}

function assertCheckpointIdentity(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  identity: Readonly<ProviderNativeDurableEpisodeIdentityV2R>,
): void {
  verifyProviderNativeEpisodeResumeCheckpointV2R(checkpoint);
  if (checkpoint.episodeId !== identity.episodeId
    || checkpoint.contextSha256 !== identity.contextSha256
    || checkpoint.toolSetSha256 !== identity.toolSetSha256
    || canonicalizeJsonV1(checkpoint.route) !== canonicalizeJsonV1(identity.route)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_IDENTITY_MISMATCH');
  }
  const checkpointReference = 'referenceInputManifestSha256' in checkpoint
    ? checkpoint.referenceInputManifestSha256 : undefined;
  if (checkpointReference !== identity.referenceInputManifestSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_REFERENCE_MISMATCH');
  }
  const checkpointGuard = 'runtimeGuardResumeState' in checkpoint
    ? checkpoint.runtimeGuardResumeState : undefined;
  if (Boolean(checkpointGuard) !== Boolean(identity.runtimeGuard)
    || checkpointGuard?.guardKind !== identity.runtimeGuard?.guardKind
    || checkpointGuard?.guardIdentitySha256 !== identity.runtimeGuard?.guardIdentitySha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_RUNTIME_GUARD_MISMATCH');
  }
}

function normalizeIdentity(
  input: Readonly<ProviderNativeDurableEpisodeIdentityV2R>,
): Readonly<ProviderNativeDurableEpisodeIdentityV2R> {
  const route = JSON.parse(canonicalizeJsonV1(input.route)) as ProviderNativeRouteV2R;
  text(route.routeId, 'ROUTE_ID');
  text(route.provider, 'PROVIDER');
  text(route.model, 'MODEL');
  text(route.claimedModelIdentity, 'CLAIMED_MODEL_IDENTITY');
  return {
    route,
    episodeId: text(input.episodeId, 'EPISODE'),
    contextSha256: sha256(input.contextSha256, 'CONTEXT'),
    toolSetSha256: sha256(input.toolSetSha256, 'TOOL_SET'),
    ...(input.referenceInputManifestSha256 ? {
      referenceInputManifestSha256: sha256(
        input.referenceInputManifestSha256,
        'REFERENCE_INPUT_MANIFEST',
      ),
    } : {}),
    ...(input.runtimeGuard ? { runtimeGuard: {
      guardKind: text(input.runtimeGuard.guardKind, 'RUNTIME_GUARD_KIND'),
      guardIdentitySha256: sha256(
        input.runtimeGuard.guardIdentitySha256,
        'RUNTIME_GUARD_IDENTITY',
      ),
    } } : {}),
  };
}

function durableInputPayload(
  identity: Readonly<ProviderNativeDurableEpisodeIdentityV2R>,
): JsonRecord {
  return {
    version: PROVIDER_NATIVE_DURABLE_EPISODE_INPUT_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    route: identity.route,
    episodeId: identity.episodeId,
    contextSha256: identity.contextSha256,
    toolSetSha256: identity.toolSetSha256,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    ...(identity.referenceInputManifestSha256
      ? { referenceInputManifestSha256: identity.referenceInputManifestSha256 } : {}),
    ...(identity.runtimeGuard ? { runtimeGuard: identity.runtimeGuard } : {}),
  };
}

function durableDependencies(
  identity: Readonly<ProviderNativeDurableEpisodeIdentityV2R>,
) {
  return [
    {
      dependencyId: 'provider_route',
      dependencyVersion: 'PROVIDER_NATIVE_ROUTE_V2R',
      bindingSha256: hashCanonicalJsonV1(identity.route),
    },
    {
      dependencyId: 'episode_context',
      dependencyVersion: 'PROVIDER_NATIVE_EPISODE_CONTEXT_V2R',
      bindingSha256: identity.contextSha256,
    },
    {
      dependencyId: 'operator_tool_set',
      dependencyVersion: 'PROVIDER_NATIVE_TOOL_SET_V2R',
      bindingSha256: identity.toolSetSha256,
    },
    ...(identity.referenceInputManifestSha256 ? [{
      dependencyId: 'reference_media_manifest',
      dependencyVersion: 'PROVIDER_NATIVE_REFERENCE_MEDIA_INPUT_V2R',
      bindingSha256: identity.referenceInputManifestSha256,
    }] : []),
    ...(identity.runtimeGuard ? [{
      dependencyId: 'runtime_guard_authorization',
      dependencyVersion: 'SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_V2R',
      bindingSha256: identity.runtimeGuard.guardIdentitySha256,
    }] : []),
  ].sort((left, right) => (
    left.dependencyId < right.dependencyId
      ? -1
      : left.dependencyId > right.dependencyId ? 1 : 0
  ));
}

function checkpointPayload(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): JsonRecord {
  return {
    version: proposalRecoveryState
      ? PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R
      : PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R,
    checkpointSha256: checkpoint.checkpointSha256,
    checkpoint: structuredClone(checkpoint),
    ...(proposalRecoveryState
      ? { proposalRecoveryState: structuredClone(proposalRecoveryState) } : {}),
  };
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RECORD_INVALID');
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PROVIDER_NATIVE_DURABLE_${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_DURABLE_${label}_HASH_INVALID`);
  }
  return result;
}
