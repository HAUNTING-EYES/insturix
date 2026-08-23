import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from '../../services/durable-workflow-job-v1';
import {
  EditorialPlanDurableRetryableErrorV1,
  type EditorialPlanDurableExecutionOwnerReceiptV1,
  type EditorialPlanDurableExecutionOwnerV1,
} from '../../services/editorial-plan-durable-worker-v1';
import {
  decodeProviderNativeCheckpointStateV2R,
  encodeProviderNativeCheckpointStateV2R,
} from './provider-native-checkpoint-state-codec-v2r';
import { finalizeProviderNativeExecutionBoundDurableOutcomeV2R }
  from './provider-native-durable-outcome-finalizer-v2r';
import {
  ProviderNativeDurableRetryableErrorV2R,
} from './provider-native-episode-durable-worker-v2r';
import {
  resolveProviderNativeDurableArtifactsFromOwnersV2R,
  type ProviderNativeDurableArtifactOwnersV2R,
  type ProviderNativeDurableArtifactScopeV2R,
} from './provider-native-episode-owner-artifact-resolver-v2r';
import {
  assertProviderNativePlanExecutionDefinitionV2R,
  assertProviderNativePlanResumeArtifactsV2R,
  PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
  type ProviderNativePlanExecutionEnvelopeV2R,
} from './provider-native-plan-execution-envelope-v2r';
import { executeProviderNativeResumedEpisodeCoreV2R }
  from './provider-native-resumed-execution-core-v2r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';

export const PROVIDER_NATIVE_PLAN_RESUMED_EXECUTION_RECEIPT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PLAN_RESUMED_EXECUTION_RECEIPT_V2R_1' as const;

/**
 * PlanService lifecycle adapter for an already-started provider episode. It
 * resumes only against an isolated ProjectService clone and delegates every
 * artifact, execution and proof decision to the existing owners.
 */
export function createProviderNativePlanResumedExecutionOwnerV2R(input: Readonly<{
  artifactOwners: Readonly<ProviderNativeDurableArtifactOwnersV2R>;
}>): Readonly<EditorialPlanDurableExecutionOwnerV1> {
  return {
    ownerId: PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
    ownerVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    assertDefinitionSupported: ({ definition }) => {
      requireResumedEnvelope(definition);
    },
    execute: async ({ plan, node, definition, job, lifecycle }) => {
      const envelope = requireResumedEnvelope(definition);
      const scope = envelope.boundEpisodeDefinition.scope;
      assertPlanJobScope(job, scope);
      const resumed = job.resumeState
        ? decodeProviderNativeCheckpointStateV2R({
            state: {
              schemaId: job.resumeState.schemaId,
              stateSha256: job.resumeState.stateSha256,
              payload: job.resumeState.payload,
            },
            projectId: scope.projectId,
          })
        : {
            checkpoint: envelope.resumeCheckpoint!,
            ...(envelope.resumeProposalRecoveryState
              ? { proposalRecoveryState: envelope.resumeProposalRecoveryState } : {}),
          };
      assertProviderNativePlanResumeArtifactsV2R({
        envelope,
        checkpoint: resumed.checkpoint,
        ...(resumed.proposalRecoveryState
          ? { proposalRecoveryState: resumed.proposalRecoveryState } : {}),
      });

      let latestCheckpointSha256 = resumed.checkpoint.checkpointSha256;
      try {
        await lifecycle.heartbeat();
        const artifacts = await resolveProviderNativeDurableArtifactsFromOwnersV2R(
          input.artifactOwners,
          {
            scope,
            checkpoint: resumed.checkpoint,
            ...(resumed.proposalRecoveryState
              ? { proposalRecoveryState: resumed.proposalRecoveryState } : {}),
          },
        );
        await lifecycle.heartbeat();
        const core = await executeProviderNativeResumedEpisodeCoreV2R({
          scope,
          checkpoint: resumed.checkpoint,
          ...(resumed.proposalRecoveryState
            ? { proposalRecoveryState: resumed.proposalRecoveryState } : {}),
          artifacts,
          heartbeat: lifecycle.heartbeat,
          persistCheckpoint: async ({ checkpoint, proposalRecoveryState }) => {
            const encoded = encodeProviderNativeCheckpointStateV2R({
              checkpoint,
              projectId: scope.projectId,
              ...(proposalRecoveryState ? { proposalRecoveryState } : {}),
            });
            await lifecycle.persistResumeState({
              schemaId: encoded.schemaId,
              payload: encoded.payload,
            });
            latestCheckpointSha256 = checkpoint.checkpointSha256;
          },
        });
        // Provider attempts are terminal here until failed-attempt budget
        // accounting has its own durable resume contract. Retrying from the
        // last committed tool turn would otherwise forget a billed attempt.
        await lifecycle.heartbeat();
        const outcome = await finalizeProviderNativeExecutionBoundDurableOutcomeV2R({
          scope,
          clone: artifacts.isolatedClone,
          episodeReceipt: core.episodeReceipt,
          executionTrace: {
            kind: 'RESUMED_EPISODE_RECEIPT',
            receiptSha256: core.resumedReceiptSha256,
          },
          ...(core.proposalRecoveryState
            ? { proposalRecoveryState: core.proposalRecoveryState } : {}),
        });
        await lifecycle.heartbeat();
        return buildOwnerReceipt({
          job,
          planRevisionSha256: plan.revisionSha256,
          planId: plan.planId,
          nodeId: node.nodeId,
          nodeVersion: node.nodeVersion,
          definitionSha256: definition.definitionSha256,
          envelope,
          episodeReceipt: core.episodeReceipt,
          resumedReceiptSha256: core.resumedReceiptSha256,
          proposalRecoveryStateSha256:
            core.proposalRecoveryState?.recoveryStateSha256 ?? null,
          proposalReceiptSha256: outcome.proposalReceipt?.receiptSha256 ?? null,
          outcomeProofReceiptSha256: outcome.outcomeProof?.receiptSha256 ?? null,
          disposition: outcome.disposition,
          proofReferences: outcome.proofReferences,
        });
      } catch (error) {
        if (error instanceof ProviderNativeDurableRetryableErrorV2R) {
          throw new EditorialPlanDurableRetryableErrorV1(
            requireRetryCode(error.code),
            error.message,
            retryCursor(scope, latestCheckpointSha256),
          );
        }
        throw error;
      }
    },
  };
}

function requireResumedEnvelope(
  definition: Parameters<
    EditorialPlanDurableExecutionOwnerV1['assertDefinitionSupported']
  >[0]['definition'],
): Readonly<ProviderNativePlanExecutionEnvelopeV2R> {
  const envelope = assertProviderNativePlanExecutionDefinitionV2R(definition);
  if (!envelope.resumeCheckpoint) {
    throw new Error('PROVIDER_NATIVE_PLAN_FRESH_EXECUTION_NOT_SUPPORTED');
  }
  return envelope;
}

function assertPlanJobScope(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  scope: Readonly<ProviderNativeDurableArtifactScopeV2R>,
): void {
  if (job.operationOwner !== 'PLAN_SERVICE'
    || job.operationKind !== 'editorial_plan_node_episode'
    || !job.operationId.trim()
    || job.tenantId !== scope.tenantId
    || job.userId !== scope.userId
    || job.projectId !== scope.projectId) {
    throw new Error('PROVIDER_NATIVE_PLAN_JOB_SCOPE_MISMATCH');
  }
}

function retryCursor(
  scope: Readonly<ProviderNativeDurableArtifactScopeV2R>,
  checkpointSha256: string,
): Readonly<Record<string, unknown>> {
  return {
    episodeId: scope.episodeId,
    resumeCheckpointSha256: checkpointSha256,
  };
}

function requireRetryCode(value: string): string {
  if (!/^[A-Z0-9_]{3,120}$/.test(value)) {
    throw new Error('PROVIDER_NATIVE_PLAN_RETRY_CODE_INVALID');
  }
  return value;
}

function buildOwnerReceipt(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  planId: string;
  planRevisionSha256: string;
  nodeId: string;
  nodeVersion: number;
  definitionSha256: string;
  envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>;
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
  resumedReceiptSha256: string;
  proposalRecoveryStateSha256: string | null;
  proposalReceiptSha256: string | null;
  outcomeProofReceiptSha256: string | null;
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  proofReferences: EditorialPlanDurableExecutionOwnerReceiptV1['proofReferences'];
}>): Readonly<EditorialPlanDurableExecutionOwnerReceiptV1> {
  const material = {
    version: PROVIDER_NATIVE_PLAN_RESUMED_EXECUTION_RECEIPT_VERSION_V2R,
    authority: 'PLAN_SERVICE_PROVIDER_NATIVE_RESUMED_RESEARCH_PROXY_ONLY' as const,
    jobBinding: {
      jobId: input.job.jobId,
      operationId: input.job.operationId,
      tenantId: input.job.tenantId,
      userId: input.job.userId,
      projectId: input.job.projectId,
    },
    planBinding: {
      planId: input.planId,
      planRevisionSha256: input.planRevisionSha256,
      nodeId: input.nodeId,
      nodeVersion: input.nodeVersion,
      definitionSha256: input.definitionSha256,
    },
    envelopeSha256: input.envelope.envelopeSha256,
    episodeReceiptSha256: input.episodeReceipt.receiptSha256,
    resumedReceiptSha256: input.resumedReceiptSha256,
    proposalRecoveryStateSha256: input.proposalRecoveryStateSha256,
    proposalReceiptSha256: input.proposalReceiptSha256,
    outcomeProofReceiptSha256: input.outcomeProofReceiptSha256,
    disposition: input.disposition,
    proofReferences: input.proofReferences,
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: input.disposition,
    receiptId: `pnpr_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: input.proofReferences,
  };
}
