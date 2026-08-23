import { buildProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from './provider-native-result-references-v2r';
import {
  buildProviderNativeResumedEpisodeReceiptV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import {
  restoreProviderNativeEpisodeCheckpointV2R,
  persistProviderNativeEpisodeCheckpointV2R,
} from './provider-native-episode-durable-job-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';
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

export interface ProviderNativeDurableIsolatedCloneV2R {
  origin: 'PROJECTSERVICE_REVISION_CLONE';
  projectRevision: string;
  stateSha256: string;
  executeIsolated: EpisodeInput['executeIsolated'];
  finalizeProposalReceipt?: () => Promise<Readonly<ProviderNativeDurableProposalReceiptV2R>>;
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
  }>): Promise<Readonly<ProviderNativeDurableResolvedArtifactsV2R>>;
}

export class ProviderNativeDurableRetryableErrorV2R extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderNativeDurableRetryableErrorV2R';
  }
}

export type ProviderNativeDurableWorkerResultV2R = Readonly<
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
    }
>;

class CancellationRequested extends Error {}

/**
 * Transport-neutral recovery core. Artifact lookup and dispatch stay outside
 * this module so it cannot become a second registry, queue or project owner.
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
    const checkpoint = restoreProviderNativeEpisodeCheckpointV2R(claim.job);
    await heartbeat();
    const artifacts = await input.artifactResolver.resolve({ job: claim.job, checkpoint });
    assertResolvedArtifacts(checkpoint, artifacts);
    await heartbeat();

    let resumeSequence = claim.job.resumeState.sequence;
    const episodeReceipt = await runProviderNativeToolEpisodeV2R({
      route: checkpoint.route,
      context: artifacts.context,
      eligibleOperatorIds: artifacts.eligibleOperatorIds,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      ...(artifacts.referenceInput ? { referenceInput: artifacts.referenceInput } : {}),
      ...(artifacts.finishInputSchema ? { finishInputSchema: artifacts.finishInputSchema } : {}),
      ...(artifacts.toolSetFactory ? { toolSetFactory: artifacts.toolSetFactory } : {}),
      ...(artifacts.additionalInstructions
        ? { additionalInstructions: artifacts.additionalInstructions } : {}),
      ...(artifacts.runtimeGuard ? { runtimeGuard: artifacts.runtimeGuard } : {}),
      resumeCheckpoint: checkpoint,
      resumeCurrentProjectRevision: artifacts.currentRevision.projectRevision,
      invoke: async (request) => {
        await heartbeat();
        const response = await artifacts.invoke(request);
        await heartbeat();
        return response;
      },
      executeIsolated: async (call) => {
        await heartbeat();
        const result = await artifacts.isolatedClone.executeIsolated(call);
        await heartbeat();
        return result;
      },
      onTurnCommitted: async ({ checkpoint: nextCheckpoint }) => {
        await heartbeat();
        const persisted = await persistProviderNativeEpisodeCheckpointV2R({
          store: input.store,
          jobId: input.jobId,
          tenantId: claim.job.tenantId,
          userId: claim.job.userId,
          leaseToken: claim.leaseToken,
          expectedSequence: resumeSequence,
          checkpoint: nextCheckpoint,
          now: clock(),
        });
        resumeSequence = persisted.sequence;
      },
    });
    if (cancellationRequested) throw new CancellationRequested();

    const resumedReceipt = buildProviderNativeResumedEpisodeReceiptV2R({
      checkpoint, episodeReceipt,
    });
    if (isExplicitTransient(episodeReceipt)) {
      return await settleFailure(input, claim, clock, new ProviderNativeDurableRetryableErrorV2R(
        episodeReceipt.terminal.disposition,
        episodeReceipt.terminal.summary,
      ));
    }
    await heartbeat();
    const proposalReceipt = artifacts.isolatedClone.finalizeProposalReceipt
      ? await artifacts.isolatedClone.finalizeProposalReceipt()
      : null;
    if (proposalReceipt) {
      assertProposalReceipt(claim.job, artifacts.isolatedClone, proposalReceipt);
    }
    await heartbeat();
    const terminal = episodeTerminalReceipt(
      episodeReceipt,
      resumedReceipt.receiptSha256,
      clock(),
      proposalReceipt,
    );
    await input.store.complete({
      jobId: input.jobId, leaseToken: claim.leaseToken, receipt: terminal, now: clock(),
    });
    return {
      kind: 'completed', jobId: input.jobId,
      durableDisposition: terminal.disposition as 'PASS' | 'FAIL' | 'UNVERIFIABLE',
      episodeReceipt, resumedReceiptSha256: resumedReceipt.receiptSha256,
      ...(proposalReceipt ? { proposalReceiptSha256: proposalReceipt.receiptSha256 } : {}),
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

function assertResolvedArtifacts(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  artifacts: Readonly<ProviderNativeDurableResolvedArtifactsV2R>,
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
  const toolSet = buildOpaqueResultReferenceToolSetV2R(exactToolSet);
  if (toolSet.toolSetSha256 !== checkpoint.toolSetSha256) {
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
    || clone.projectRevision !== revision.projectRevision
    || !isSha256(clone.stateSha256)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_ISOLATED_CLONE_BINDING_INVALID');
  }
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

function episodeTerminalReceipt(
  receipt: Readonly<ProviderNativeEpisodeReceiptV2R>,
  resumedReceiptSha256: string,
  completedAt: Date,
  proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R> | null,
): DurableWorkflowJobTerminalReceiptV1 {
  const disposition = receipt.terminal.disposition === 'PASS'
    ? 'PASS' : receipt.terminal.disposition === 'FAIL' ? 'FAIL' : 'UNVERIFIABLE';
  const proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'] = [{
    proofId: `provider_native_resumed_${receipt.episodeId}`,
    proofSha256: resumedReceiptSha256,
    disposition,
  }, ...(proposalReceipt ? [{
    proofId: `projectservice_isolated_proposal_${receipt.episodeId}`,
    proofSha256: proposalReceipt.receiptSha256,
    disposition: 'PASS' as const,
  }] : [])];
  return terminalReceipt(disposition, proofReferences, completedAt, receipt.episodeId);
}

function assertProposalReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>,
  receipt: Readonly<ProviderNativeDurableProposalReceiptV2R>,
): void {
  const { receiptSha256, ...material } = receipt;
  if (receipt.schemaVersion !== 1
    || receipt.authority !== 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION'
    || receipt.episodeId !== job.operationId
    || receipt.projectId !== job.projectId
    || receipt.baseProjectRevision !== clone.projectRevision
    || receipt.baseStateSha256 !== clone.stateSha256
    || receipt.canonicalProjectRevisionAfter !== clone.projectRevision
    || receipt.canonicalStateSha256After !== clone.stateSha256
    || receipt.canonicalUnchanged !== true
    || !isSha256(receipt.finalStateSha256)
    || !receipt.changedPaths.every((path) => typeof path === 'string' && path.startsWith('$'))
    || new Set(receipt.changedPaths).size !== receipt.changedPaths.length
    || !receipt.operationReceipts.every(validProposalOperationReceipt)
    || hashCanonicalJsonV1(material) !== receiptSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECEIPT_INVALID');
  }
}

function validProposalOperationReceipt(receipt: Readonly<Record<string, unknown>>): boolean {
  const operationReceiptSha256 = receipt.operationReceiptSha256;
  if (!isSha256(operationReceiptSha256)) return false;
  const { operationReceiptSha256: _ignored, ...material } = receipt;
  return hashCanonicalJsonV1(material) === operationReceiptSha256;
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

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
