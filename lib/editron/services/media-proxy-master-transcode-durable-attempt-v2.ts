import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  DurableWorkflowJobSnapshotV1,
  DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { MediaProxyMasterR2PreparedArtifactStoreV1 }
  from './media-proxy-master-r2-prepared-artifact-store-v1';
import {
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
  selectMediaProxyMasterR2PublicationPathV2,
  type MediaProxyMasterR2PublicationSelectionV2,
} from './media-proxy-master-r2-private-publication-policy-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  createMediaProxyMasterTranscodeDurablePreparedStateV2,
  createMediaProxyMasterTranscodeDurableResultV2,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  createMediaProxyMasterTranscodePreparedResumeStateV2,
  createMediaProxyMasterTranscodeResultResumeStateV2,
  createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2,
  readMediaProxyMasterTranscodeDurableResumeStateV2,
  type MediaProxyMasterTranscodeDurablePreparedStateV2,
} from './media-proxy-master-transcode-durable-result-v2';
import { createMediaProxyMasterTranscodePreparedEvidenceV2 }
  from './media-proxy-master-transcode-prepared-evidence-v2';
import type {
  MediaProxyMasterPreparedTranscodeExecutionResultV1,
  MediaProxyMasterPreparedTranscodeExecutorV1,
  MediaProxyMasterPreparedTranscodeLeaseV1,
  MediaProxyMasterTranscodeExecutionInputV1,
  MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1,
} from './media-proxy-master-trusted-transcode-executor-v1';
import { expectedMediaProxyMasterTranscodeR2ObjectKeyV1 }
  from './media-proxy-master-trusted-transcode-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_V2' as const;
export const MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2 =
  'MEDIA_PROXY_MASTER_PREPARED_TRANSCODE_EXECUTOR' as const;
export const MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2 =
  'MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION' as const;
export const MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2 =
  'MEDIA_ASSETS' as const;
export const MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_OWNER_V3' as const;

const TEMP_PREFIX_V2 = 'editron-proxy-master-publish-v2-';
const SHA256 = /^[a-f0-9]{64}$/;
const EXECUTION_DIAGNOSTICS_V1: Readonly<Record<
  MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1,
  true
>> = Object.freeze({
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_ABORTED: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TIMEOUT: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_COMMAND_INVALID: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_EVIDENCE_INVALID: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_MASTER_TIME_MAP_STALE: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_VERSION_MISMATCH: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_STALE: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_BYTES_INVALID: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_FAILED: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PROCESS_RESOURCE_LIMIT: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_INVALID: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_OUTPUT_POLICY_MISMATCH: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_FAILED: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_PUBLISH_SUBSTITUTION: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TEMP_CLEANUP_FAILED: true,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_INTERNAL_FAILURE: true,
});

type MasterAssetV2 = MediaProxyMasterTranscodeExecutionInputV1['masterAsset'];
type EligiblePublicationSelectionV2 = Extract<
  MediaProxyMasterR2PublicationSelectionV2,
  { disposition: 'ELIGIBLE' }
>;
type PreparedResumeV2 = ReturnType<
  typeof createMediaProxyMasterTranscodePreparedResumeStateV2
>;
type ResultResumeV2 = ReturnType<
  typeof createMediaProxyMasterTranscodeResultResumeStateV2
>;

export interface MediaProxyMasterCurrentAssetOwnerV2 {
  ownerId: typeof MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2;
  ownerVersion: typeof MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2;
  runtimePolicyBindingSha256: string;
  resolve(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  }>): Promise<MasterAssetV2 | null>;
}

export interface MediaProxyMasterPreparationOwnerV2 {
  ownerId: typeof MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2;
  ownerVersion: string;
  runtimePolicyBindingSha256: string;
  prepare: MediaProxyMasterPreparedTranscodeExecutorV1['prepare'];
}

export interface MediaProxyMasterPublicationOwnerV2 {
  ownerId: typeof MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2;
  ownerVersion:
    typeof MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2;
  publicationPolicySha256: string;
  preparedArtifactPolicySha256: string;
  publish(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
    preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
    selection: EligiblePublicationSelectionV2;
    localPath: string;
    objectKey: string;
    contentType: 'video/mp4';
    contentSha256: string;
    byteLength: number;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<MediaSourceVersionV1>>;
}

export type MediaProxyMasterTranscodeDurableAttemptResultV2 = Readonly<
  | {
      kind: 'persist_resume';
      disposition: 'PREPARED_ARTIFACT' | 'TRUSTED_RESULT';
      expectedSequence: 0 | 1;
      resumeState: PreparedResumeV2 | ResultResumeV2;
    }
  | {
      kind: 'complete';
      receipt: DurableWorkflowJobTerminalReceiptV1;
    }
  | {
      kind: 'unverifiable';
      diagnostic: MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1;
    }
>;

export async function runMediaProxyMasterTranscodeDurableAttemptV2(
  input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    budgetAuthorizationReceiptSha256: string;
    currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV2>;
    preparationOwner: Readonly<MediaProxyMasterPreparationOwnerV2>;
    preparedArtifactStore: Pick<
      MediaProxyMasterR2PreparedArtifactStoreV1,
      'stage' | 'reopen'
    >;
    publicationOwner: Readonly<MediaProxyMasterPublicationOwnerV2>;
    abortSignal?: AbortSignal;
    clock?: () => Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableAttemptResultV2> {
  const jobInput = jobInputForAttempt(input.job);
  assertOwnerBindings(input, jobInput);
  const authorizationReceiptSha256 = sha256(
    input.budgetAuthorizationReceiptSha256,
    'BUDGET_AUTHORIZATION_RECEIPT',
  );
  const state = resumeStateForAttempt(input.job);
  if (state) {
    const boundAuthorizationReceiptSha256 = state.disposition
      === 'DURABLE_PREPARED_ARTIFACT_PERSISTED'
      ? state.budgetAuthorizationReceiptSha256
      : state.preparedState.budgetAuthorizationReceiptSha256;
    if (boundAuthorizationReceiptSha256 !== authorizationReceiptSha256) {
      fail('BUDGET_REAUTHORIZATION_MISMATCH', false);
    }
  }
  if (!state) {
    return prepareArtifact({ ...input, jobInput, authorizationReceiptSha256 });
  }
  if (state.disposition === 'DURABLE_PREPARED_ARTIFACT_PERSISTED') {
    return publishPreparedArtifact({ ...input, jobInput, preparedState: state });
  }
  return Object.freeze({
    kind: 'complete',
    receipt: createTerminalReceipt(input.job, input.clock),
  });
}

async function prepareArtifact(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  authorizationReceiptSha256: string;
  currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV2>;
  preparationOwner: Readonly<MediaProxyMasterPreparationOwnerV2>;
  preparedArtifactStore: Pick<
    MediaProxyMasterR2PreparedArtifactStoreV1,
    'stage'
  >;
  abortSignal?: AbortSignal;
}>): Promise<MediaProxyMasterTranscodeDurableAttemptResultV2> {
  const masterAsset = await requireCurrentMaster(input);
  let execution;
  try {
    execution = normalizePreparedExecutionResult(await (
      input.preparationOwner.prepare({
        command: input.jobInput.command,
        masterAsset,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      })
    ));
  } catch (error) {
    throw asAttemptError(error, 'PREPARATION_OWNER_FAILED', true);
  }
  if (execution.disposition === 'UNVERIFIABLE') {
    return Object.freeze({
      kind: 'unverifiable',
      diagnostic: execution.diagnostic,
    });
  }

  const lease = execution.lease;
  let outcome: MediaProxyMasterTranscodeDurableAttemptResultV2 | null = null;
  let primaryFailure: unknown = null;
  try {
    const evidence = createMediaProxyMasterTranscodePreparedEvidenceV2({
      jobInput: input.jobInput,
      process: lease.evidence.process,
      masterLocalFileEvidence: lease.evidence.masterLocalFileEvidence,
      outputProbe: lease.evidence.outputProbe,
      outputVideoStreamIndex: lease.evidence.outputVideoStreamIndex,
      outputAudioStreamIndexes: lease.evidence.outputAudioStreamIndexes,
    });
    let reference;
    try {
      reference = await lease.useLocalArtifact((localPath) => (
        input.preparedArtifactStore.stage({
          ...preparedArtifactIdentity(input.job, input.jobInput, evidence),
          localPath,
          retainUntil: input.job.expiresAt,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        })
      ));
    } catch (error) {
      throw asAttemptError(error, 'PREPARED_ARTIFACT_STAGE_FAILED', true);
    }
    try {
      await lease.revalidateSource();
    } catch (error) {
      throw asAttemptError(error, 'SOURCE_CHANGED_AFTER_STAGE', false);
    }
    await requireCurrentMaster(input);
    const preparedState = createMediaProxyMasterTranscodeDurablePreparedStateV2({
      job: input.job,
      budgetAuthorizationReceiptSha256: input.authorizationReceiptSha256,
      preparedEvidence: evidence,
      preparedArtifactReference: reference,
    });
    outcome = Object.freeze({
      kind: 'persist_resume',
      disposition: 'PREPARED_ARTIFACT',
      expectedSequence: 0,
      resumeState: createMediaProxyMasterTranscodePreparedResumeStateV2({
        job: input.job,
        preparedState,
      }),
    });
  } catch (error) {
    primaryFailure = asAttemptError(
      error,
      'PREPARATION_STATE_INVALID',
      false,
    );
  }
  try {
    await lease.release();
  } catch (error) {
    primaryFailure ??=
      asAttemptError(error, 'PREPARATION_TEMP_CLEANUP_FAILED', true);
  }
  if (primaryFailure) throw primaryFailure;
  if (!outcome) fail('PREPARATION_OUTCOME_MISSING', false);
  return outcome;
}

async function publishPreparedArtifact(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
  currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV2>;
  preparedArtifactStore: Pick<
    MediaProxyMasterR2PreparedArtifactStoreV1,
    'reopen'
  >;
  publicationOwner: Readonly<MediaProxyMasterPublicationOwnerV2>;
  abortSignal?: AbortSignal;
  clock?: () => Date;
}>): Promise<MediaProxyMasterTranscodeDurableAttemptResultV2> {
  await requireCurrentMaster(input);
  const temporaryDirectory = await createTemporaryDirectory();
  const outputPath = path.join(temporaryDirectory, 'reopened-proxy.mp4');
  let outcome: MediaProxyMasterTranscodeDurableAttemptResultV2 | null = null;
  let primaryFailure: unknown = null;
  try {
    let reopened;
    try {
      reopened = await input.preparedArtifactStore.reopen({
        policy: input.jobInput.preparedArtifactPolicy,
        reference: input.preparedState.preparedArtifactReference,
        outputPath,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch (error) {
      throw asAttemptError(error, 'PREPARED_ARTIFACT_REOPEN_FAILED', true);
    }
    const selection = selectMediaProxyMasterR2PublicationPathV2({
      policy: input.jobInput.publicationPolicy,
      actualByteLength: reopened.byteLength,
      artifactSource: 'DURABLE_REOPENABLE_FILE',
    });
    if (selection.disposition !== 'ELIGIBLE') {
      fail(`PUBLICATION_PATH_${selection.reason}`, false);
    }
    const objectKey = expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
      command: input.jobInput.command,
      proxyContentSha256: reopened.contentSha256,
    });
    let proxySourceVersion: Readonly<MediaSourceVersionV1>;
    try {
      proxySourceVersion = await input.publicationOwner.publish({
        job: input.job,
        jobInput: input.jobInput,
        preparedState: input.preparedState,
        selection,
        localPath: reopened.localPath,
        objectKey,
        contentType: 'video/mp4',
        contentSha256: reopened.contentSha256,
        byteLength: reopened.byteLength,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch (error) {
      throw asAttemptError(error, 'PUBLICATION_FAILED', true);
    }
    await requireCurrentMaster(input);
    const trustedReceipt =
      createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
        job: input.job,
        proxySourceVersion,
        completedAt: currentDate(input.clock, input.job.expiresAt).toISOString(),
      });
    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: input.job,
      trustedTranscodeReceipt: trustedReceipt,
    });
    outcome = Object.freeze({
      kind: 'persist_resume',
      disposition: 'TRUSTED_RESULT',
      expectedSequence: 1,
      resumeState: createMediaProxyMasterTranscodeResultResumeStateV2({
        job: input.job,
        result,
      }),
    });
  } catch (error) {
    primaryFailure = asAttemptError(
      error,
      'PUBLICATION_RESULT_INVALID',
      false,
    );
  }
  try {
    await removeTemporaryDirectory(temporaryDirectory);
  } catch (error) {
    primaryFailure ??= asAttemptError(error, 'REOPEN_TEMP_CLEANUP_FAILED', true);
  }
  if (primaryFailure) throw primaryFailure;
  if (!outcome) fail('PUBLICATION_OUTCOME_MISSING', false);
  return outcome;
}

async function requireCurrentMaster(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV2>;
}>): Promise<MasterAssetV2> {
  let current: MasterAssetV2 | null;
  try {
    current = await input.currentAssetOwner.resolve({
      job: input.job,
      jobInput: input.jobInput,
    });
  } catch (error) {
    throw asAttemptError(error, 'CURRENT_ASSET_LOAD_FAILED', true);
  }
  if (!current) fail('CURRENT_ASSET_UNAVAILABLE', true);
  return current;
}

function assertOwnerBindings(
  input: Parameters<typeof runMediaProxyMasterTranscodeDurableAttemptV2>[0],
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): void {
  if (input.currentAssetOwner.ownerId
      !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2
    || input.currentAssetOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2
    || input.currentAssetOwner.runtimePolicyBindingSha256
      !== jobInput.runtimePolicy.bindingSha256
    || input.preparationOwner.ownerId
      !== MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2
    || input.preparationOwner.ownerVersion
      !== jobInput.command.policy.policyVersion
    || input.preparationOwner.runtimePolicyBindingSha256
      !== jobInput.runtimePolicy.bindingSha256
    || input.publicationOwner.ownerId
      !== MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2
    || input.publicationOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2
    || input.publicationOwner.publicationPolicySha256
      !== jobInput.publicationPolicy.policySha256
    || input.publicationOwner.preparedArtifactPolicySha256
      !== jobInput.preparedArtifactPolicy.policySha256) {
    fail('OWNER_BINDING_MISMATCH', false);
  }
}

function jobInputForAttempt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableJobInputV2 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobV2(job);
  } catch {
    fail('JOB_CONTRACT_INVALID', false);
  }
}

function resumeStateForAttempt(job: Readonly<DurableWorkflowJobSnapshotV1>) {
  try {
    return readMediaProxyMasterTranscodeDurableResumeStateV2(job);
  } catch {
    fail('RESUME_STATE_INVALID', false);
  }
}

function preparedArtifactIdentity(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
  evidence: ReturnType<typeof createMediaProxyMasterTranscodePreparedEvidenceV2>,
) {
  return Object.freeze({
    policy: jobInput.preparedArtifactPolicy,
    jobId: job.jobId,
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    owner: jobInput.command.masterSourceVersion.owner,
    assetId: jobInput.assetId,
    commandSha256: jobInput.command.commandSha256,
    outputProbeSha256: evidence.outputProbe.probeSha256,
    artifactByteLength: evidence.outputProbe.proxyByteLength,
    artifactContentSha256: evidence.outputProbe.proxyContentSha256,
  });
}

function createTerminalReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  clock?: () => Date,
): DurableWorkflowJobTerminalReceiptV1 {
  try {
    return createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job,
      completedAt: currentDate(clock, job.expiresAt),
    });
  } catch (error) {
    throw asAttemptError(error, 'TERMINAL_RECEIPT_INVALID', false);
  }
}

function normalizePreparedExecutionResult(
  value: unknown,
): MediaProxyMasterPreparedTranscodeExecutionResultV1 {
  const candidate = record(value, 'PREPARATION_RESULT_INVALID');
  if (candidate.disposition === 'UNVERIFIABLE') {
    exactKeys(candidate, ['diagnostic', 'disposition'],
      'PREPARATION_RESULT_FIELDS_INVALID');
    return Object.freeze({
      disposition: 'UNVERIFIABLE',
      diagnostic: executionDiagnostic(candidate.diagnostic),
    });
  }
  if (candidate.disposition !== 'PREPARED') {
    fail('PREPARATION_RESULT_INVALID', false);
  }
  exactKeys(candidate, ['disposition', 'lease'],
    'PREPARATION_RESULT_FIELDS_INVALID');
  const lease = record(candidate.lease, 'PREPARATION_LEASE_INVALID');
  exactKeys(lease, [
    'abortSignal', ...(Object.hasOwn(lease, 'callerSignal')
      ? ['callerSignal'] : []),
    'evidence', 'release', 'revalidateSource', 'timeoutSignal',
    'useLocalArtifact',
  ], 'PREPARATION_LEASE_FIELDS_INVALID');
  record(lease.evidence, 'PREPARATION_EVIDENCE_INVALID');
  if (!abortSignal(lease.abortSignal)
    || !abortSignal(lease.timeoutSignal)
    || (Object.hasOwn(lease, 'callerSignal') && !abortSignal(lease.callerSignal))
    || typeof lease.useLocalArtifact !== 'function'
    || typeof lease.revalidateSource !== 'function'
    || typeof lease.release !== 'function') {
    fail('PREPARATION_LEASE_INVALID', false);
  }
  return Object.freeze({
    disposition: 'PREPARED',
    lease: lease as unknown as Readonly<MediaProxyMasterPreparedTranscodeLeaseV1>,
  });
}

async function createTemporaryDirectory(): Promise<string> {
  try {
    return await mkdtemp(path.join(tmpdir(), TEMP_PREFIX_V2));
  } catch (error) {
    throw asAttemptError(error, 'REOPEN_TEMP_CREATE_FAILED', true);
  }
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  const temporaryRoot = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(temporaryRoot)
    || !path.basename(resolved).startsWith(TEMP_PREFIX_V2)) {
    fail('REOPEN_TEMP_SCOPE_INVALID', false);
  }
  await rm(resolved, { force: true, recursive: true });
}

function currentDate(clock: (() => Date) | undefined, expiresAt: string): Date {
  const value = (clock ?? (() => new Date()))();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())
    || value.getTime() >= Date.parse(expiresAt)) {
    fail('CLOCK_INVALID', false);
  }
  return new Date(value);
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_INVALID`, false);
  }
  return value;
}

function executionDiagnostic(
  value: unknown,
): MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1 {
  if (typeof value !== 'string'
    || !Object.hasOwn(EXECUTION_DIAGNOSTICS_V1, value)) {
    fail('PREPARATION_DIAGNOSTIC_INVALID', false);
  }
  return value as MediaProxyMasterTrustedTranscodeExecutionDiagnosticV1;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, false);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail(code, false);
  }
}

function abortSignal(value: unknown): value is AbortSignal {
  return !!value && typeof value === 'object'
    && typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function';
}

function asAttemptError(
  error: unknown,
  fallbackCode: string,
  fallbackRetryable: boolean,
): MediaProxyMasterTranscodeDurableAttemptErrorV2 {
  if (error instanceof MediaProxyMasterTranscodeDurableAttemptErrorV2) {
    return error;
  }
  if (error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2) {
    return new MediaProxyMasterTranscodeDurableAttemptErrorV2(
      error.code,
      error.retryable,
    );
  }
  return new MediaProxyMasterTranscodeDurableAttemptErrorV2(
    fallbackCode,
    fallbackRetryable,
  );
}

function fail(code: string, retryable: boolean): never {
  throw new MediaProxyMasterTranscodeDurableAttemptErrorV2(code, retryable);
}

export class MediaProxyMasterTranscodeDurableAttemptPortErrorV2 extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_PORT_${code}`);
    this.name = 'MediaProxyMasterTranscodeDurableAttemptPortErrorV2';
  }
}

export class MediaProxyMasterTranscodeDurableAttemptErrorV2 extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeDurableAttemptErrorV2';
  }
}
