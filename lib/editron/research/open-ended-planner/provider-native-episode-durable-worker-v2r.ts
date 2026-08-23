import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import {
  restoreProviderNativeEpisodeDurableStateV2R,
  persistProviderNativeEpisodeCheckpointV2R,
} from './provider-native-episode-durable-job-v2r';
import type { ProviderNativeProposalRecoveryStateV2R }
  from './provider-native-proposal-recovery-v2r';
import type {
  ProviderNativeDurableOutcomeProofReceiptV2R,
  ProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  ProviderNativeExecutionTraceKindV2R,
} from './provider-native-durable-outcome-proof-v2r';
import type {
  runProviderNativeToolEpisodeV2R,
  ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import { executeProviderNativeResumedEpisodeCoreV2R }
  from './provider-native-resumed-execution-core-v2r';
import { finalizeProviderNativeDurableOutcomeV2R }
  from './provider-native-durable-outcome-finalizer-v2r';
import {
  DurableWorkflowJobLeaseLostErrorV1,
  DurableWorkflowJobTransitionErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from '../../services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '../../services/durable-workflow-job-store-v1';

type EpisodeInput = Parameters<typeof runProviderNativeToolEpisodeV2R>[0];
type JsonRecord = Record<string, unknown>;

export interface ProviderNativeDurableCurrentRevisionReadV2R {
  origin: 'PROJECTSERVICE_CURRENT_REVISION_READ';
  projectRevision: string;
  readReceiptId: string;
  readReceiptSha256: string;
}

export interface ProviderNativeDurableProposalReceiptV2R {
  schemaVersion: 1;
  authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION';
  episodeId: string;
  projectId: string;
  baseProjectRevision: string;
  baseStateSha256: string;
  finalStateSha256: string;
  changedPaths: readonly string[];
  operationReceipts: readonly Readonly<Record<string, unknown>>[];
  canonicalProjectRevisionAfter: string;
  canonicalStateSha256After: string;
  canonicalUnchanged: true;
  receiptSha256: string;
}

interface ProviderNativeDurableProposalRevisionBindingV2R {
  schemaVersion: 1;
  authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING';
  canonicalBaseProjectRevision: string;
  canonicalBaseStateSha256: string;
  isolatedWorkingProjectRevision: string;
  isolatedWorkingStateSha256: string;
  bindingSha256: string;
}

export interface ProviderNativeDurableIsolatedCloneV2R {
  origin: 'PROJECTSERVICE_REVISION_CLONE';
  projectRevision: string;
  stateSha256: string;
  proposalRevisionBinding?: Readonly<ProviderNativeDurableProposalRevisionBindingV2R>;
  executeIsolated: EpisodeInput['executeIsolated'];
  captureProposalRecoveryState?: (
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  ) => Promise<Readonly<ProviderNativeProposalRecoveryStateV2R> | undefined>;
  finalizeProposalReceipt?: () => Promise<Readonly<ProviderNativeDurableProposalReceiptV2R>>;
  finalizeOutcomeProof?: (input: Readonly<{
    episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
    resumedReceiptSha256: string;
    proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
  }>) => Promise<Readonly<ProviderNativeDurableOutcomeProofReceiptV2R>>;
  finalizeExecutionBoundOutcomeProof?: (input: Readonly<{
    episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
    executionTrace: Readonly<{
      kind: ProviderNativeExecutionTraceKindV2R;
      receiptSha256: string;
    }>;
    proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R>;
  }>) => Promise<Readonly<ProviderNativeExecutionBoundOutcomeProofReceiptV2R>>;
}

export type ProviderNativeDurableResolvedArtifactsV2R = Readonly<
  Pick<EpisodeInput,
    'context' | 'eligibleOperatorIds' | 'referenceInput' | 'finishInputSchema'
    | 'toolSetFactory' | 'additionalInstructions' | 'invoke' | 'runtimeGuard'>
  & {
    currentRevision: Readonly<ProviderNativeDurableCurrentRevisionReadV2R>;
    isolatedClone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
  }
>;

export interface ProviderNativeDurableArtifactResolverV2R {
  resolve(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>): Promise<Readonly<ProviderNativeDurableResolvedArtifactsV2R>>;
}

export class ProviderNativeDurableRetryableErrorV2R extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderNativeDurableRetryableErrorV2R';
  }
}

type ProviderNativeDurableWorkerResultV2R = Readonly<
  | { kind: 'skipped'; reason: string }
  | { kind: 'lease_lost'; reason: string }
  | { kind: 'cancelled'; jobId: string }
  | { kind: 'retry_wait' | 'dead_letter'; jobId: string; errorCode: string }
  | {
      kind: 'completed';
      jobId: string;
      durableDisposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
      episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
      resumedReceiptSha256: string;
      proposalReceiptSha256?: string;
      outcomeProofReceiptSha256?: string;
    }
>;

class CancellationRequested extends Error {}

/**
 * Store-lifecycle adapter around the shared resumed execution core. Artifact
 * lookup and dispatch stay injected so this cannot become a second registry,
 * queue or project owner.
 */
export async function runProviderNativeEpisodeDurableWorkerV2R(input: Readonly<{
  store: DurableWorkflowJobStoreV1;
  jobId: string;
  workerId: string;
  artifactResolver: Readonly<ProviderNativeDurableArtifactResolverV2R>;
  clock?: () => Date;
  retryDelayMs?: number;
}>): Promise<ProviderNativeDurableWorkerResultV2R> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.store.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') return { kind: 'skipped', reason: claim.reason };
  if (claim.kind === 'cancel_claimed') {
    await input.store.markCancelled({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, clock()),
      now: clock(),
    });
    return { kind: 'cancelled', jobId: input.jobId };
  }

  let cancellationRequested = false;
  const heartbeat = async (): Promise<void> => {
    const state = await input.store.heartbeat({
      jobId: input.jobId, leaseToken: claim.leaseToken, now: clock(),
    });
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequested('DURABLE_EPISODE_CANCEL_REQUESTED');
    }
  };

  try {
    if (!claim.job.resumeState) {
      throw new Error('PROVIDER_NATIVE_DURABLE_CHECKPOINT_REQUIRED');
    }
    const durableState = restoreProviderNativeEpisodeDurableStateV2R(claim.job);
    const checkpoint = durableState.checkpoint;
    const scope = requireExecutionScope(claim.job, checkpoint);
    await heartbeat();
    const artifacts = await input.artifactResolver.resolve({
      job: claim.job,
      checkpoint,
      ...(durableState.proposalRecoveryState
        ? { proposalRecoveryState: durableState.proposalRecoveryState } : {}),
    });
    await heartbeat();

    let resumeSequence = claim.job.resumeState.sequence;
    const core = await executeProviderNativeResumedEpisodeCoreV2R({
      scope,
      checkpoint,
      ...(durableState.proposalRecoveryState
        ? { proposalRecoveryState: durableState.proposalRecoveryState } : {}),
      artifacts,
      heartbeat,
      persistCheckpoint: async ({
        checkpoint: nextCheckpoint,
        proposalRecoveryState,
      }) => {
        const persisted = await persistProviderNativeEpisodeCheckpointV2R({
          store: input.store,
          jobId: input.jobId,
          tenantId: claim.job.tenantId,
          userId: claim.job.userId,
          leaseToken: claim.leaseToken,
          expectedSequence: resumeSequence,
          checkpoint: nextCheckpoint,
          ...(proposalRecoveryState ? { proposalRecoveryState } : {}),
          now: clock(),
        });
        resumeSequence = persisted.sequence;
      },
    });
    if (cancellationRequested) throw new CancellationRequested();

    if (isExplicitTransient(core.episodeReceipt)) {
      return await settleFailure(input, claim, clock, new ProviderNativeDurableRetryableErrorV2R(
        core.episodeReceipt.terminal.disposition,
        core.episodeReceipt.terminal.summary,
      ));
    }
    await heartbeat();
    const outcome = await finalizeProviderNativeDurableOutcomeV2R({
      scope,
      clone: artifacts.isolatedClone,
      episodeReceipt: core.episodeReceipt,
      resumedReceiptSha256: core.resumedReceiptSha256,
      ...(core.proposalRecoveryState
        ? { proposalRecoveryState: core.proposalRecoveryState } : {}),
    });
    await heartbeat();
    const terminal = terminalReceipt(
      outcome.disposition,
      outcome.proofReferences,
      clock(),
      core.episodeReceipt.episodeId,
    );
    await input.store.complete({
      jobId: input.jobId, leaseToken: claim.leaseToken, receipt: terminal, now: clock(),
    });
    return {
      kind: 'completed', jobId: input.jobId,
      durableDisposition: outcome.disposition,
      episodeReceipt: core.episodeReceipt,
      resumedReceiptSha256: core.resumedReceiptSha256,
      ...(outcome.proposalReceipt
        ? { proposalReceiptSha256: outcome.proposalReceipt.receiptSha256 } : {}),
      ...(outcome.outcomeProof
        ? { outcomeProofReceiptSha256: outcome.outcomeProof.receiptSha256 } : {}),
    };
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    if (cancellationRequested || error instanceof CancellationRequested
      || await cancellationIsPending(input.store, claim.job)) {
      try {
        await input.store.markCancelled({
          jobId: input.jobId,
          leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(claim.job, clock()),
          now: clock(),
        });
        return { kind: 'cancelled', jobId: input.jobId };
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return { kind: 'lease_lost', reason: cancelError.message };
        }
        throw cancelError;
      }
    }
    return settleFailure(input, claim, clock, error);
  }
}

function requireExecutionScope(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
) {
  if (!job.projectId || job.operationId !== checkpoint.episodeId) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_INVALID');
  }
  return {
    tenantId: job.tenantId,
    userId: job.userId,
    projectId: job.projectId,
    episodeId: checkpoint.episodeId,
  };
}

async function settleFailure(
  input: Readonly<{
    store: DurableWorkflowJobStoreV1; jobId: string; retryDelayMs?: number;
  }>,
  claim: Readonly<{
    kind: 'claimed'; job: Readonly<DurableWorkflowJobSnapshotV1>; leaseToken: string;
  }>,
  clock: () => Date,
  error: unknown,
): Promise<ProviderNativeDurableWorkerResultV2R> {
  const now = clock();
  const retryable = error instanceof ProviderNativeDurableRetryableErrorV2R;
  const errorCode = workerErrorCode(error);
  try {
    const current = await input.store.getAuthorized({
      jobId: claim.job.jobId,
      tenantId: claim.job.tenantId,
      userId: claim.job.userId,
    }) ?? claim.job;
    if (current.cancelRequestedAt) {
      await input.store.markCancelled({
        jobId: input.jobId,
        leaseToken: claim.leaseToken,
        receipt: cancellationReceipt(current, now),
        now,
      });
      return { kind: 'cancelled', jobId: input.jobId };
    }
    const status = await input.store.retryOrDeadLetter({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      error: { code: errorCode, message: errorMessage(error), retryable, occurredAt: now },
      retryAt: new Date(now.getTime() + Math.max(1_000, input.retryDelayMs ?? 30_000)),
      retryCursor: {
        resumeSequence: current.resumeState?.sequence ?? 0,
        checkpointSha256: checkpointSha256(current),
      },
      now,
    });
    return { kind: status, jobId: input.jobId, errorCode };
  } catch (settleError) {
    if (settleError instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: settleError.message };
    }
    if (settleError instanceof DurableWorkflowJobTransitionErrorV1
      && settleError.message === 'DURABLE_JOB_CANCEL_REQUESTED') {
      await input.store.markCancelled({
        jobId: input.jobId,
        leaseToken: claim.leaseToken,
        receipt: cancellationReceipt(claim.job, clock()),
        now: clock(),
      });
      return { kind: 'cancelled', jobId: input.jobId };
    }
    throw settleError;
  }
}

async function cancellationIsPending(
  store: DurableWorkflowJobStoreV1,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<boolean> {
  const current = await store.getAuthorized({
    jobId: job.jobId, tenantId: job.tenantId, userId: job.userId,
  });
  return Boolean(current?.cancelRequestedAt);
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAt: Date,
): DurableWorkflowJobTerminalReceiptV1 {
  return terminalReceipt('CANCELLED', [], completedAt, job.jobId);
}

function terminalReceipt(
  disposition: DurableWorkflowJobTerminalReceiptV1['disposition'],
  proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'],
  completedAt: Date,
  identity: string,
): DurableWorkflowJobTerminalReceiptV1 {
  const material = {
    disposition, proofReferences, completedAt: completedAt.toISOString(), identity,
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition,
    receiptId: `dwep_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  };
}

function isExplicitTransient(receipt: Readonly<ProviderNativeEpisodeReceiptV2R>): boolean {
  return receipt.terminal.disposition === 'PROVIDER_TIMEOUT'
    || receipt.terminal.disposition === 'PROVIDER_RATE_LIMIT';
}

function checkpointSha256(job: Readonly<DurableWorkflowJobSnapshotV1>): string | null {
  const payload = job.resumeState?.payload as JsonRecord | undefined;
  return typeof payload?.checkpointSha256 === 'string' ? payload.checkpointSha256 : null;
}

function workerErrorCode(error: unknown): string {
  if (error instanceof ProviderNativeDurableRetryableErrorV2R) return error.code;
  const message = errorMessage(error).split(':')[0];
  return /^[A-Z0-9_]{3,120}$/.test(message)
    ? message : 'PROVIDER_NATIVE_DURABLE_WORKER_FAILURE';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown durable worker failure';
}
