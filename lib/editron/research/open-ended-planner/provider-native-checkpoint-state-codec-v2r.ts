import { hashDurableWorkflowJobJsonV1 }
  from '../../services/durable-workflow-job-v1';
import {
  verifyProviderNativeEpisodeResumeCheckpointV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import {
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from './provider-native-proposal-recovery-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_1' as const;
export const PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_2' as const;

export interface ProviderNativeCheckpointStateEnvelopeV2R {
  schemaId: string;
  stateSha256: string;
  payload: Readonly<JsonRecord>;
}

export interface ProviderNativeCheckpointStateMaterialV2R {
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}

/**
 * Store-neutral codec for the one provider checkpoint payload. Job identity,
 * leases and CAS stay with their lifecycle adapters.
 */
export function encodeProviderNativeCheckpointStateV2R(input: Readonly<{
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  projectId: string | null;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): Readonly<ProviderNativeCheckpointStateEnvelopeV2R> {
  verifyProviderNativeEpisodeResumeCheckpointV2R(input.checkpoint);
  if (input.proposalRecoveryState) {
    if (!input.projectId) {
      throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_REQUIRED');
    }
    verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint: input.checkpoint,
      projectId: input.projectId,
      state: input.proposalRecoveryState,
    });
  }
  const schemaId = input.proposalRecoveryState
    ? PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R
    : PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R;
  const payload = {
    version: schemaId,
    checkpointSha256: input.checkpoint.checkpointSha256,
    checkpoint: structuredClone(input.checkpoint),
    ...(input.proposalRecoveryState ? {
      proposalRecoveryState: structuredClone(input.proposalRecoveryState),
    } : {}),
  };
  return {
    schemaId,
    stateSha256: hashDurableWorkflowJobJsonV1(payload),
    payload,
  };
}

export function decodeProviderNativeCheckpointStateV2R(input: Readonly<{
  state: Readonly<ProviderNativeCheckpointStateEnvelopeV2R> | null;
  projectId: string | null;
}>): Readonly<ProviderNativeCheckpointStateMaterialV2R> {
  const state = input.state;
  const supported = state?.schemaId === PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_VERSION_V2R
    || state?.schemaId === PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R;
  if (!state || !supported
    || hashDurableWorkflowJobJsonV1(state.payload) !== state.stateSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RESUME_STATE_INVALID');
  }
  const payload = record(state.payload);
  const checkpoint = record(
    payload.checkpoint,
  ) as unknown as ProviderNativeEpisodeResumeCheckpointV2R;
  if (payload.version !== state.schemaId
    || payload.checkpointSha256 !== checkpoint.checkpointSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_BINDING_INVALID');
  }
  verifyProviderNativeEpisodeResumeCheckpointV2R(checkpoint);
  if (state.schemaId === PROVIDER_NATIVE_DURABLE_PROPOSAL_CHECKPOINT_STATE_VERSION_V2R) {
    if (!input.projectId) {
      throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_REQUIRED');
    }
    const proposalRecoveryState = record(
      payload.proposalRecoveryState,
    ) as unknown as ProviderNativeProposalRecoveryStateV2R;
    verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint,
      projectId: input.projectId,
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

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RECORD_INVALID');
  }
  return value as JsonRecord;
}
