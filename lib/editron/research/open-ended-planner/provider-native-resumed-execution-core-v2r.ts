import {
  buildProviderNativeResumedEpisodeReceiptV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import {
  proposalRecoveryWriterTurnsV2R,
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from './provider-native-proposal-recovery-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import { buildProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from './provider-native-result-references-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeDurableIsolatedCloneV2R,
  ProviderNativeDurableResolvedArtifactsV2R,
} from './provider-native-episode-durable-worker-v2r';

export interface ProviderNativeResumedExecutionScopeV2R {
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
}

export interface ProviderNativeResumedExecutionCoreResultV2R {
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
  resumedReceiptSha256: string;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}

/**
 * One resumed provider episode execution core shared by lifecycle adapters.
 * It owns neither a lease nor persistence; those remain injected boundaries.
 */
export async function executeProviderNativeResumedEpisodeCoreV2R(input: Readonly<{
  scope: Readonly<ProviderNativeResumedExecutionScopeV2R>;
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>;
  heartbeat(): Promise<void>;
  persistCheckpoint(input: Readonly<{
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>): Promise<void>;
}>): Promise<Readonly<ProviderNativeResumedExecutionCoreResultV2R>> {
  assertScope(input.scope, input.checkpoint);
  let latestProposalRecoveryState = input.proposalRecoveryState;
  assertResolvedArtifacts(
    input.checkpoint,
    input.artifacts,
    latestProposalRecoveryState,
  );
  await input.heartbeat();
  const episodeReceipt = await runProviderNativeToolEpisodeV2R({
    route: input.checkpoint.route,
    context: input.artifacts.context,
    eligibleOperatorIds: input.artifacts.eligibleOperatorIds,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    ...(input.artifacts.referenceInput
      ? { referenceInput: input.artifacts.referenceInput } : {}),
    ...(input.artifacts.finishInputSchema
      ? { finishInputSchema: input.artifacts.finishInputSchema } : {}),
    ...(input.artifacts.toolSetFactory
      ? { toolSetFactory: input.artifacts.toolSetFactory } : {}),
    ...(input.artifacts.additionalInstructions
      ? { additionalInstructions: input.artifacts.additionalInstructions } : {}),
    ...(input.artifacts.runtimeGuard
      ? { runtimeGuard: input.artifacts.runtimeGuard } : {}),
    resumeCheckpoint: input.checkpoint,
    resumeCurrentProjectRevision: workingProjectRevision(
      input.artifacts,
      latestProposalRecoveryState,
    ),
    invoke: async (request) => {
      await input.heartbeat();
      const response = await input.artifacts.invoke(request);
      await input.heartbeat();
      return response;
    },
    executeIsolated: async (call) => {
      await input.heartbeat();
      const result = await input.artifacts.isolatedClone.executeIsolated(call);
      await input.heartbeat();
      return result;
    },
    onTurnCommitted: async ({ checkpoint }) => {
      await input.heartbeat();
      const nextProposalRecoveryState = await captureProposalRecoveryState({
        scope: input.scope,
        checkpoint,
        clone: input.artifacts.isolatedClone,
        prior: latestProposalRecoveryState,
      });
      await input.persistCheckpoint({
        checkpoint,
        ...(nextProposalRecoveryState
          ? { proposalRecoveryState: nextProposalRecoveryState } : {}),
      });
      latestProposalRecoveryState = nextProposalRecoveryState;
    },
  });
  const resumedReceipt = buildProviderNativeResumedEpisodeReceiptV2R({
    checkpoint: input.checkpoint, episodeReceipt,
  });
  return {
    episodeReceipt,
    resumedReceiptSha256: resumedReceipt.receiptSha256,
    ...(latestProposalRecoveryState
      ? { proposalRecoveryState: latestProposalRecoveryState } : {}),
  };
}

function assertScope(
  scope: Readonly<ProviderNativeResumedExecutionScopeV2R>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): void {
  if (!scope.tenantId.trim() || !scope.userId.trim() || !scope.projectId.trim()
    || !scope.episodeId.trim() || scope.episodeId !== checkpoint.episodeId) {
    throw new Error('PROVIDER_NATIVE_RESUMED_CORE_SCOPE_INVALID');
  }
}

function assertResolvedArtifacts(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>,
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): void {
  if (hashCanonicalJsonV1(artifacts.context) !== checkpoint.contextSha256) {
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
    !== checkpoint.toolSetSha256) {
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
  const binding = clone.proposalRevisionBinding;
  if (proposalRecoveryState && !binding) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_REQUIRED');
  }
  if (proposalRecoveryState && !clone.captureProposalRecoveryState) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  }
  if (!proposalRecoveryState && binding
    && proposalRecoveryWriterTurnsV2R(checkpoint).length) {
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
    || (proposalRecoveryState && (
      binding.canonicalBaseProjectRevision
        !== proposalRecoveryState.canonicalBaseProjectRevision
      || binding.canonicalBaseStateSha256
        !== proposalRecoveryState.canonicalBaseStateSha256
      || binding.isolatedWorkingProjectRevision
        !== proposalRecoveryState.isolatedWorkingProjectRevision
      || binding.isolatedWorkingStateSha256
        !== proposalRecoveryState.isolatedWorkingStateSha256
    ))
    || hashCanonicalJsonV1(material) !== bindingSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_REVISION_BINDING_INVALID');
  }
}

function workingProjectRevision(
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>,
  recovery?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): string {
  return recovery?.isolatedWorkingProjectRevision
    ?? artifacts.isolatedClone.proposalRevisionBinding?.isolatedWorkingProjectRevision
    ?? artifacts.currentRevision.projectRevision;
}

async function captureProposalRecoveryState(input: Readonly<{
  scope: Readonly<ProviderNativeResumedExecutionScopeV2R>;
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
  prior?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): Promise<Readonly<ProviderNativeProposalRecoveryStateV2R> | undefined> {
  const writers = proposalRecoveryWriterTurnsV2R(input.checkpoint);
  if (!writers.length) return undefined;
  if (!input.prior && !input.clone.proposalRevisionBinding
    && !input.clone.captureProposalRecoveryState
    && !input.clone.finalizeProposalReceipt) return undefined;
  if (!input.clone.captureProposalRecoveryState) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  }
  const next = await input.clone.captureProposalRecoveryState(input.checkpoint);
  if (!next) throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_CAPTURE_REQUIRED');
  verifyProviderNativeProposalRecoveryStateV2R({
    checkpoint: input.checkpoint, projectId: input.scope.projectId, state: next,
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
