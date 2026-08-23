import type { ProviderNativeDurableResolvedArtifactsV2R }
  from './provider-native-episode-durable-worker-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import {
  assertProviderNativeExecutionArtifactsV2R,
  captureProviderNativeProposalRecoveryStateV2R,
} from './provider-native-execution-artifact-validation-v2r';
import type { ProviderNativeProposalRecoveryStateV2R }
  from './provider-native-proposal-recovery-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';

export interface ProviderNativeFreshExecutionScopeV2R {
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
}

export interface ProviderNativeFreshExecutionCoreResultV2R {
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
  latestCheckpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}

/**
 * Starts one provider episode at turn one. It receives no checkpoint and can
 * persist only checkpoints emitted by a real dispatch, attempt, or tool turn.
 */
export async function executeProviderNativeFreshEpisodeCoreV2R(input: Readonly<{
  scope: Readonly<ProviderNativeFreshExecutionScopeV2R>;
  route: Readonly<ProviderNativeRouteV2R>;
  expectedContextSha256: string;
  expectedToolSetSha256: string;
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>;
  requireDurableProviderAttemptPersistence?: boolean;
  heartbeat(): Promise<void>;
  persistCheckpoint(input: Readonly<{
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>): Promise<void>;
}>): Promise<Readonly<ProviderNativeFreshExecutionCoreResultV2R>> {
  assertFreshScope(input.scope, input.artifacts);
  assertProviderNativeExecutionArtifactsV2R({
    expectedContextSha256: input.expectedContextSha256,
    expectedToolSetSha256: input.expectedToolSetSha256,
    artifacts: input.artifacts,
  });
  let latestCheckpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>
    | undefined;
  let latestProposalRecoveryState:
    Readonly<ProviderNativeProposalRecoveryStateV2R> | undefined;
  await input.heartbeat();
  const persistProviderCheckpoint = async (event: Readonly<{
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>): Promise<void> => {
    await input.heartbeat();
    await input.persistCheckpoint({
      checkpoint: event.checkpoint,
      ...(latestProposalRecoveryState
        ? { proposalRecoveryState: latestProposalRecoveryState } : {}),
    });
    latestCheckpoint = event.checkpoint;
  };
  const episodeReceipt = await runProviderNativeToolEpisodeV2R({
    route: input.route,
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
    ...(input.requireDurableProviderAttemptPersistence ? {
      onProviderDispatchCommitted: persistProviderCheckpoint,
      onProviderAttemptCommitted: persistProviderCheckpoint,
    } : {}),
    onTurnCommitted: async ({ checkpoint }) => {
      await input.heartbeat();
      const nextRecovery = await captureProviderNativeProposalRecoveryStateV2R({
        projectId: input.scope.projectId,
        checkpoint,
        clone: input.artifacts.isolatedClone,
        ...(latestProposalRecoveryState
          ? { prior: latestProposalRecoveryState } : {}),
      });
      await input.persistCheckpoint({
        checkpoint,
        ...(nextRecovery ? { proposalRecoveryState: nextRecovery } : {}),
      });
      latestCheckpoint = checkpoint;
      latestProposalRecoveryState = nextRecovery;
    },
  });
  return {
    episodeReceipt,
    ...(latestCheckpoint ? { latestCheckpoint } : {}),
    ...(latestProposalRecoveryState
      ? { proposalRecoveryState: latestProposalRecoveryState } : {}),
  };
}

function assertFreshScope(
  scope: Readonly<ProviderNativeFreshExecutionScopeV2R>,
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>,
): void {
  const revisionBinding = record(artifacts.context.revisionBinding);
  const projectState = record(artifacts.context.projectState);
  if (!scope.tenantId.trim() || !scope.userId.trim() || !scope.projectId.trim()
    || !scope.episodeId.trim() || artifacts.context.episodeId !== scope.episodeId
    || revisionBinding.projectId !== scope.projectId
    || projectState.projectId !== scope.projectId) {
    throw new Error('PROVIDER_NATIVE_FRESH_CORE_SCOPE_INVALID');
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : {};
}
