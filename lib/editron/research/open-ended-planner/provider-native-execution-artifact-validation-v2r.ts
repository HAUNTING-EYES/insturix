import { hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeDurableIsolatedCloneV2R,
  ProviderNativeDurableResolvedArtifactsV2R,
} from './provider-native-episode-durable-worker-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import {
  proposalRecoveryWriterTurnsV2R,
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from './provider-native-proposal-recovery-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from './provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';

export function assertProviderNativeExecutionArtifactsV2R(input: Readonly<{
  expectedContextSha256: string;
  expectedToolSetSha256: string;
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  proposalRecoveryRequired?: boolean;
}>): void {
  const artifacts = input.artifacts;
  if (hashCanonicalJsonV1(artifacts.context) !== input.expectedContextSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CONTEXT_ARTIFACT_MISMATCH');
  }
  const exactToolSet = artifacts.toolSetFactory
    ? artifacts.toolSetFactory({
        eligibleOperatorIds: artifacts.eligibleOperatorIds,
        finishInputSchema: artifacts.finishInputSchema,
      })
    : buildProviderNativeToolSetV2R(
        artifacts.eligibleOperatorIds,
        artifacts.finishInputSchema,
      );
  if (buildOpaqueResultReferenceToolSetV2R(exactToolSet).toolSetSha256
    !== input.expectedToolSetSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_TOOLSET_ARTIFACT_MISMATCH');
  }
  const revision = artifacts.currentRevision;
  if (revision.origin !== 'PROJECTSERVICE_CURRENT_REVISION_READ'
    || !revision.projectRevision.trim() || !revision.readReceiptId.trim()
    || !isSha256(revision.readReceiptSha256)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CURRENT_REVISION_ORIGIN_INVALID');
  }
  const clone = artifacts.isolatedClone;
  if (clone.origin !== 'PROJECTSERVICE_REVISION_CLONE'
    || !isSha256(clone.stateSha256)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_ISOLATED_CLONE_BINDING_INVALID');
  }
  const recovery = input.proposalRecoveryState;
  const binding = clone.proposalRevisionBinding;
  if (recovery && !binding) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_REQUIRED');
  }
  if (recovery && !clone.captureProposalRecoveryState) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  }
  if (!recovery && binding && input.proposalRecoveryRequired) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_REQUIRED');
  }
  if (!binding) {
    if (clone.finalizeProposalReceipt) {
      throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_REQUIRED');
    }
    if (clone.projectRevision !== revision.projectRevision) {
      throw new Error('PROVIDER_NATIVE_DURABLE_ISOLATED_CLONE_BINDING_INVALID');
    }
    return;
  }
  const { bindingSha256, ...material } = binding;
  if (binding.schemaVersion !== 1
    || binding.authority !== 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING'
    || !binding.canonicalBaseProjectRevision.trim()
    || !binding.isolatedWorkingProjectRevision.trim()
    || !isSha256(binding.canonicalBaseStateSha256)
    || !isSha256(binding.isolatedWorkingStateSha256)
    || binding.canonicalBaseProjectRevision !== revision.projectRevision
    || binding.canonicalBaseProjectRevision !== clone.projectRevision
    || binding.canonicalBaseStateSha256 !== clone.stateSha256
    || (recovery && (
      binding.canonicalBaseProjectRevision !== recovery.canonicalBaseProjectRevision
      || binding.canonicalBaseStateSha256 !== recovery.canonicalBaseStateSha256
      || binding.isolatedWorkingProjectRevision
        !== recovery.isolatedWorkingProjectRevision
      || binding.isolatedWorkingStateSha256 !== recovery.isolatedWorkingStateSha256
    ))
    || hashCanonicalJsonV1(material) !== bindingSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_INVALID');
  }
}

export function providerNativeWorkingProjectRevisionV2R(
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>,
  recovery?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): string {
  return recovery?.isolatedWorkingProjectRevision
    ?? artifacts.isolatedClone.proposalRevisionBinding?.isolatedWorkingProjectRevision
    ?? artifacts.currentRevision.projectRevision;
}

export async function captureProviderNativeProposalRecoveryStateV2R(
  input: Readonly<{
    projectId: string;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
    prior?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>,
): Promise<Readonly<ProviderNativeProposalRecoveryStateV2R> | undefined> {
  const writers = proposalRecoveryWriterTurnsV2R(input.checkpoint);
  if (!writers.length) return undefined;
  if (!input.prior && !input.clone.proposalRevisionBinding
    && !input.clone.captureProposalRecoveryState
    && !input.clone.finalizeProposalReceipt) return undefined;
  if (!input.clone.captureProposalRecoveryState) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  }
  const next = await input.clone.captureProposalRecoveryState(input.checkpoint);
  if (!next) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  }
  verifyProviderNativeProposalRecoveryStateV2R({
    checkpoint: input.checkpoint,
    projectId: input.projectId,
    state: next,
  });
  if (next.canonicalBaseProjectRevision !== input.clone.projectRevision
    || next.canonicalBaseStateSha256 !== input.clone.stateSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_BASE_MISMATCH');
  }
  if (input.prior && (
    next.operations.length < input.prior.operations.length
    || hashCanonicalJsonV1(next.operations.slice(0, input.prior.operations.length))
      !== hashCanonicalJsonV1(input.prior.operations)
  )) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_NOT_AN_EXTENSION');
  }
  return next;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
