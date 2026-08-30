import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import {
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
} from './media-proxy-master-r2-prepared-artifact-manifest-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactReferenceV1,
  type MediaProxyMasterR2PreparedArtifactReferenceV1,
} from './media-proxy-master-r2-prepared-artifact-reference-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodePreparedEvidenceForJobV2,
  type MediaProxyMasterTranscodePreparedEvidenceV2,
} from './media-proxy-master-transcode-prepared-evidence-v2';
import {
  assertMediaProxyMasterTrustedTranscodeReceiptV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  type MediaProxyMasterTrustedTranscodeReceiptV1,
} from './media-proxy-master-trusted-transcode-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_PREPARED_STATE_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_PREPARED_STATE_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_V2' as const;

const MAX_JSON_PAYLOAD_BYTES = 256 * 1_024;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeDurablePreparedStateV2 = Readonly<{
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_PREPARED_STATE_VERSION_V2;
  disposition: 'DURABLE_PREPARED_ARTIFACT_PERSISTED';
  jobId: string;
  operationId: string;
  jobExpiresAt: string;
  jobInputBindingSha256: string;
  commandSha256: string;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
  preparedArtifactPolicySha256: string;
  budgetReservationId: string;
  budgetReservationBindingSha256: string;
  budgetAuthorizationReceiptSha256: string;
  preparedEvidence: MediaProxyMasterTranscodePreparedEvidenceV2;
  preparedArtifactReference: MediaProxyMasterR2PreparedArtifactReferenceV1;
  preparedStateSha256: string;
}>;

export type MediaProxyMasterTranscodePreparedResumeCommitV2 = Readonly<{
  sequence: 1;
  schemaId: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2;
  stateSha256: string;
  committedAt: string;
  commitSha256: string;
}>;

export type MediaProxyMasterTranscodeDurableResultV2 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V2;
  disposition: 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION';
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
  preparedResumeCommit: MediaProxyMasterTranscodePreparedResumeCommitV2;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  resultSha256: string;
}>;

export type MediaProxyMasterTranscodeDurableResumePayloadV2 =
  | MediaProxyMasterTranscodeDurablePreparedStateV2
  | MediaProxyMasterTranscodeDurableResultV2;

export function createMediaProxyMasterTranscodeDurablePreparedStateV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    budgetAuthorizationReceiptSha256: string;
    preparedEvidence: MediaProxyMasterTranscodePreparedEvidenceV2;
    preparedArtifactReference: MediaProxyMasterR2PreparedArtifactReferenceV1;
  }>,
): MediaProxyMasterTranscodeDurablePreparedStateV2 {
  if (input.job.resumeState !== null) fail('PREPARED_STATE_ALREADY_EXISTS');
  const context = jobContext(input.job);
  return buildPreparedState({
    context,
    budgetAuthorizationReceiptSha256:
      input.budgetAuthorizationReceiptSha256,
    preparedEvidence: input.preparedEvidence,
    preparedArtifactReference: input.preparedArtifactReference,
  });
}

export function assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
  value: unknown,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurablePreparedStateV2 {
  const candidate = object(value, 'PREPARED_STATE_INVALID');
  exactKeys(candidate, [
    'budgetAuthorizationReceiptSha256', 'budgetReservationBindingSha256',
    'budgetReservationId', 'commandSha256', 'disposition', 'jobExpiresAt',
    'jobId', 'jobInputBindingSha256', 'operationId',
    'preparedArtifactPolicySha256', 'preparedArtifactReference',
    'preparedEvidence', 'preparedStateSha256', 'publicationPolicySha256',
    'runtimePolicyBindingSha256', 'version',
  ], 'PREPARED_STATE_FIELDS_INVALID');
  if (candidate.version
      !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_PREPARED_STATE_VERSION_V2
    || candidate.disposition !== 'DURABLE_PREPARED_ARTIFACT_PERSISTED') {
    fail('PREPARED_STATE_IDENTITY_INVALID');
  }
  const rebound = buildPreparedState({
    context: jobContext(job),
    budgetAuthorizationReceiptSha256: text(
      candidate.budgetAuthorizationReceiptSha256,
      'BUDGET_AUTHORIZATION_RECEIPT',
    ),
    preparedEvidence: candidate.preparedEvidence as never,
    preparedArtifactReference: candidate.preparedArtifactReference as never,
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('PREPARED_STATE_BINDING_INVALID');
  }
  return rebound;
}

export function createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    proxySourceVersion: Readonly<MediaSourceVersionV1>;
    completedAt: string;
  }>,
): MediaProxyMasterTrustedTranscodeReceiptV1 {
  const context = jobContext(input.job);
  const preparedState = requirePersistedPreparedState(input.job);
  const commit = preparedResumeCommit(input.job, preparedState);
  const evidence = preparedState.preparedEvidence;
  const runtime = context.jobInput.runtimePolicy.executionProfile;
  let receipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  try {
    receipt = createMediaProxyMasterTrustedTranscodeReceiptV1({
      command: context.jobInput.command,
      runtime: {
        workerImageDigest: runtime.workerImageDigest,
        platform: runtime.platform,
        ffmpegVersion: runtime.ffmpegVersion,
        ffprobeVersion: runtime.ffprobeVersion,
      },
      process: evidence.process,
      masterLocalFileEvidence: evidence.masterLocalFileEvidence,
      proxySourceVersion: input.proxySourceVersion,
      outputProbe: evidence.outputProbe,
      outputVideoStreamIndex: evidence.outputVideoStreamIndex,
      outputAudioStreamIndexes: evidence.outputAudioStreamIndexes,
      completedAt: input.completedAt,
    });
  } catch {
    fail('TRUSTED_RECEIPT_CREATE_FAILED');
  }
  assertTrustedReceiptCoherence(receipt, preparedState, context);
  assertReceiptAfterPreparedCommit(receipt, commit);
  return receipt;
}

export function createMediaProxyMasterTranscodeDurableResultV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  }>,
): MediaProxyMasterTranscodeDurableResultV2 {
  const context = jobContext(input.job);
  const preparedState = requirePersistedPreparedState(input.job);
  const preparedCommit = preparedResumeCommit(input.job, preparedState);
  const trustedTranscodeReceipt = trustedReceipt(
    input.trustedTranscodeReceipt,
  );
  assertTrustedReceiptCoherence(
    trustedTranscodeReceipt,
    preparedState,
    context,
  );
  assertReceiptAfterPreparedCommit(
    trustedTranscodeReceipt,
    preparedCommit,
  );
  return buildResult({
    preparedState,
    preparedResumeCommit: preparedCommit,
    trustedTranscodeReceipt,
  });
}

export function assertMediaProxyMasterTranscodeDurableResultForJobV2(
  value: unknown,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableResultV2 {
  const candidate = object(value, 'RESULT_INVALID');
  exactKeys(candidate, [
    'disposition', 'preparedResumeCommit', 'preparedState', 'resultSha256',
    'trustedTranscodeReceipt', 'version',
  ], 'RESULT_FIELDS_INVALID');
  if (candidate.version !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V2
    || candidate.disposition
      !== 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION') {
    fail('RESULT_IDENTITY_INVALID');
  }
  const context = jobContext(job);
  const preparedState =
    assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
      candidate.preparedState,
      job,
    );
  const commit = assertPreparedResumeCommit(
    candidate.preparedResumeCommit,
    preparedState,
    context,
  );
  const receipt = trustedReceipt(candidate.trustedTranscodeReceipt);
  assertTrustedReceiptCoherence(receipt, preparedState, context);
  assertReceiptAfterPreparedCommit(receipt, commit);
  const rebound = buildResult({
    preparedState,
    preparedResumeCommit: commit,
    trustedTranscodeReceipt: receipt,
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('RESULT_BINDING_INVALID');
  }
  return rebound;
}

export function createMediaProxyMasterTranscodePreparedResumeStateV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
  }>,
) {
  if (input.job.resumeState !== null) fail('PREPARED_RESUME_ALREADY_EXISTS');
  const payload =
    assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
      input.preparedState,
      input.job,
    );
  return resumeEnvelope(payload);
}

export function createMediaProxyMasterTranscodeResultResumeStateV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    result: MediaProxyMasterTranscodeDurableResultV2;
  }>,
) {
  const predecessor = requirePersistedPreparedState(input.job);
  const result = assertMediaProxyMasterTranscodeDurableResultForJobV2(
    input.result,
    input.job,
  );
  if (result.preparedState.preparedStateSha256
      !== predecessor.preparedStateSha256) {
    fail('RESULT_PREDECESSOR_MISMATCH');
  }
  return resumeEnvelope(result);
}

export function readMediaProxyMasterTranscodeDurableResumeStateV2(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableResumePayloadV2 | null {
  const context = jobContext(job);
  if (!job.resumeState) return null;
  const resume = object(job.resumeState, 'RESUME_INVALID');
  exactKeys(resume, [
    'committedAt', 'payload', 'schemaId', 'sequence', 'stateSha256',
  ], 'RESUME_FIELDS_INVALID');
  const committedAt = instant(resume.committedAt, 'RESUME_COMMITTED_AT');
  const sequence = positiveSafeInteger(resume.sequence, 2, 'RESUME_SEQUENCE');
  if (resume.schemaId !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2
    || resume.stateSha256 !== hashDurableWorkflowJobJsonV1(resume.payload)) {
    fail('RESUME_BINDING_INVALID');
  }
  const payload = assertResumePayloadForJob(resume.payload, job);
  const expectedSequence = payload.disposition
    === 'DURABLE_PREPARED_ARTIFACT_PERSISTED' ? 1 : 2;
  if (sequence !== expectedSequence) fail('RESUME_SEQUENCE_INVALID');
  const committedAtMs = Date.parse(committedAt);
  if (committedAtMs >= Date.parse(context.jobExpiresAt)) {
    fail('RESUME_TIME_INVALID');
  }
  if (payload.disposition === 'DURABLE_PREPARED_ARTIFACT_PERSISTED') {
    if (committedAtMs < Date.parse(payload.preparedArtifactReference.stagedAt)) {
      fail('RESUME_TIME_INVALID');
    }
  } else if (committedAtMs
      < Math.max(
        Date.parse(payload.preparedResumeCommit.committedAt),
        Date.parse(payload.trustedTranscodeReceipt.completedAt),
      )) {
    fail('RESUME_TIME_INVALID');
  }
  return payload;
}

export function createMediaProxyMasterTranscodeDurableTerminalReceiptV2(
  input: Readonly<{
    job: DurableWorkflowJobSnapshotV1;
    completedAt: Date;
  }>,
): DurableWorkflowJobTerminalReceiptV1 {
  const context = jobContext(input.job);
  const state = readMediaProxyMasterTranscodeDurableResumeStateV2(input.job);
  if (!state || state.disposition
      !== 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION') {
    fail('TERMINAL_RESULT_NOT_PERSISTED');
  }
  const completedAt = validDate(input.completedAt, 'TERMINAL_COMPLETED_AT');
  if (!input.job.resumeState
    || completedAt.getTime() < Date.parse(input.job.resumeState.committedAt)
    || completedAt.getTime() >= Date.parse(context.jobExpiresAt)) {
    fail('TERMINAL_TIME_INVALID');
  }
  const prepared = state.preparedState;
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization',
      prepared.budgetAuthorizationReceiptSha256),
    proof('private-publication-policy-v2', prepared.publicationPolicySha256),
    proof('prepared-artifact-policy', prepared.preparedArtifactPolicySha256),
    proof('prepared-artifact-reference',
      prepared.preparedArtifactReference.referenceSha256),
    proof('prepared-transcode-evidence', prepared.preparedEvidence.evidenceSha256),
    proof('durable-prepared-state', prepared.preparedStateSha256),
    proof('trusted-proxy-transcode',
      state.trustedTranscodeReceipt.receiptSha256),
    proof('durable-transcode-result', state.resultSha256),
  ]);
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_VERSION_V2,
    jobId: context.jobId,
    operationId: context.operationId,
    jobInputBindingSha256: context.jobInputBindingSha256,
    preparedStateSha256: prepared.preparedStateSha256,
    resultSha256: state.resultSha256,
    trustedTranscodeReceiptSha256:
      state.trustedTranscodeReceipt.receiptSha256,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'PASS',
    receiptId: `mpmtrans2_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  });
}

function buildPreparedState(input: Readonly<{
  context: JobContextV2;
  budgetAuthorizationReceiptSha256: unknown;
  preparedEvidence: unknown;
  preparedArtifactReference: unknown;
}>): MediaProxyMasterTranscodeDurablePreparedStateV2 {
  const evidence = assertPreparedEvidence(
    input.preparedEvidence,
    input.context.jobInput,
  );
  const reference = preparedReference(
    input.preparedArtifactReference,
    input.context.jobInput,
  );
  assertPreparedReferenceCoherence(reference, evidence, input.context);
  const jobInput = input.context.jobInput;
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_PREPARED_STATE_VERSION_V2,
    disposition: 'DURABLE_PREPARED_ARTIFACT_PERSISTED' as const,
    jobId: input.context.jobId,
    operationId: input.context.operationId,
    jobExpiresAt: input.context.jobExpiresAt,
    jobInputBindingSha256: input.context.jobInputBindingSha256,
    commandSha256: jobInput.command.commandSha256,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      jobInput.preparedArtifactPolicy.policySha256,
    budgetReservationId: jobInput.budgetReservation.reservationId,
    budgetReservationBindingSha256:
      jobInput.budgetReservation.bindingSha256,
    budgetAuthorizationReceiptSha256: sha256(
      input.budgetAuthorizationReceiptSha256,
      'BUDGET_AUTHORIZATION_RECEIPT',
    ),
    preparedEvidence: evidence,
    preparedArtifactReference: reference,
  };
  assertPayloadSize(material, 'PREPARED_STATE');
  return deepFreezeEditronJsonV1({
    ...material,
    preparedStateSha256: hashDurableWorkflowJobJsonV1(material),
  });
}

function buildResult(input: Readonly<{
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
  preparedResumeCommit: MediaProxyMasterTranscodePreparedResumeCommitV2;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
}>): MediaProxyMasterTranscodeDurableResultV2 {
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V2,
    disposition:
      'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION' as const,
    preparedState: input.preparedState,
    preparedResumeCommit: input.preparedResumeCommit,
    trustedTranscodeReceipt: input.trustedTranscodeReceipt,
  };
  assertPayloadSize(material, 'RESULT');
  return deepFreezeEditronJsonV1({
    ...material,
    resultSha256: hashDurableWorkflowJobJsonV1(material),
  });
}

function requirePersistedPreparedState(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurablePreparedStateV2 {
  const state = readMediaProxyMasterTranscodeDurableResumeStateV2(job);
  if (!state || state.disposition !== 'DURABLE_PREPARED_ARTIFACT_PERSISTED') {
    fail('PREPARED_RESUME_REQUIRED');
  }
  return state;
}

function preparedResumeCommit(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2,
): MediaProxyMasterTranscodePreparedResumeCommitV2 {
  if (!job.resumeState) fail('PREPARED_RESUME_REQUIRED');
  const material = {
    sequence: 1 as const,
    schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2,
    stateSha256: preparedState.preparedStateSha256,
    committedAt: instant(job.resumeState.committedAt, 'PREPARED_COMMITTED_AT'),
  };
  assertPreparedCommitTime(material.committedAt, preparedState);
  return deepFreezeEditronJsonV1({
    ...material,
    commitSha256: hashDurableWorkflowJobJsonV1({
      jobId: preparedState.jobId,
      ...material,
    }),
  });
}

function assertPreparedResumeCommit(
  value: unknown,
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2,
  context: JobContextV2,
): MediaProxyMasterTranscodePreparedResumeCommitV2 {
  const candidate = object(value, 'PREPARED_RESUME_COMMIT_INVALID');
  exactKeys(candidate, [
    'commitSha256', 'committedAt', 'schemaId', 'sequence', 'stateSha256',
  ], 'PREPARED_RESUME_COMMIT_FIELDS_INVALID');
  if (candidate.sequence !== 1
    || candidate.schemaId !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2
    || candidate.stateSha256 !== preparedState.preparedStateSha256) {
    fail('PREPARED_RESUME_COMMIT_BINDING_INVALID');
  }
  const committedAt = instant(candidate.committedAt, 'PREPARED_COMMITTED_AT');
  assertPreparedCommitTime(committedAt, preparedState);
  const material = {
    sequence: 1 as const,
    schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2,
    stateSha256: preparedState.preparedStateSha256,
    committedAt,
  };
  const commitSha256 = sha256(candidate.commitSha256, 'PREPARED_RESUME_COMMIT');
  if (commitSha256 !== hashDurableWorkflowJobJsonV1({
    jobId: context.jobId,
    ...material,
  })) {
    fail('PREPARED_RESUME_COMMIT_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1({ ...material, commitSha256 });
}

function assertPreparedCommitTime(
  committedAt: string,
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2,
): void {
  const committedAtMs = Date.parse(committedAt);
  if (committedAtMs
      < Date.parse(preparedState.preparedArtifactReference.stagedAt)
    || committedAtMs >= Date.parse(preparedState.jobExpiresAt)) {
    fail('PREPARED_COMMIT_TIME_INVALID');
  }
}

function assertReceiptAfterPreparedCommit(
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  commit: MediaProxyMasterTranscodePreparedResumeCommitV2,
): void {
  if (Date.parse(receipt.completedAt) < Date.parse(commit.committedAt)) {
    fail('TRUSTED_RECEIPT_BEFORE_PREPARED_COMMIT');
  }
}

function assertPreparedReferenceCoherence(
  reference: MediaProxyMasterR2PreparedArtifactReferenceV1,
  evidence: MediaProxyMasterTranscodePreparedEvidenceV2,
  context: JobContextV2,
): void {
  const jobInput = context.jobInput;
  const probe = evidence.outputProbe;
  const expectedHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1({
    policy: jobInput.preparedArtifactPolicy,
    jobId: context.jobId,
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    owner: jobInput.command.masterSourceVersion.owner,
    assetId: jobInput.assetId,
    commandSha256: jobInput.command.commandSha256,
    outputProbeSha256: probe.probeSha256,
    artifactByteLength: probe.proxyByteLength,
    artifactContentSha256: probe.proxyContentSha256,
  });
  if (reference.artifactHandle !== expectedHandle
    || reference.jobId !== context.jobId
    || reference.assetId !== jobInput.assetId
    || reference.commandSha256 !== jobInput.command.commandSha256
    || reference.outputProbeSha256 !== probe.probeSha256
    || reference.artifactByteLength !== probe.proxyByteLength
    || reference.artifactContentSha256 !== probe.proxyContentSha256
    || reference.artifactByteLength > jobInput.command.policy.maxOutputBytes
    || Date.parse(reference.stagedAt) < Date.parse(probe.probedAt)
    || Date.parse(reference.stagedAt) >= Date.parse(context.jobExpiresAt)
    || Date.parse(reference.retainUntil) < Date.parse(context.jobExpiresAt)) {
    fail('PREPARED_REFERENCE_JOB_MISMATCH');
  }
}

function assertTrustedReceiptCoherence(
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2,
  context: JobContextV2,
): void {
  const evidence = preparedState.preparedEvidence;
  const reference = preparedState.preparedArtifactReference;
  const jobInput = context.jobInput;
  const runtime = jobInput.runtimePolicy.executionProfile;
  const proxy = receipt.proxyEncode.sourceVersion;
  if (canonicalizeEditronJsonV1(receipt.command)
      !== canonicalizeEditronJsonV1(jobInput.command)
    || receipt.runtime.workerImageDigest !== runtime.workerImageDigest
    || receipt.runtime.platform !== runtime.platform
    || receipt.runtime.ffmpegVersion !== runtime.ffmpegVersion
    || receipt.runtime.ffprobeVersion !== runtime.ffprobeVersion
    || receipt.process.startedAt !== evidence.process.startedAt
    || receipt.process.completedAt !== evidence.process.completedAt
    || receipt.process.exitCode !== evidence.process.exitCode
    || receipt.process.stderrByteLength !== evidence.process.stderrByteLength
    || receipt.process.stderrSha256 !== evidence.process.stderrSha256
    || canonicalizeEditronJsonV1(receipt.masterDecode.localFileEvidence)
      !== canonicalizeEditronJsonV1(evidence.masterLocalFileEvidence)
    || canonicalizeEditronJsonV1(receipt.proxyEncode.outputProbe)
      !== canonicalizeEditronJsonV1(evidence.outputProbe)
    || receipt.proxyEncode.outputVideoStreamIndex
      !== evidence.outputVideoStreamIndex
    || canonicalizeEditronJsonV1(receipt.proxyEncode.outputAudioStreamIndexes)
      !== canonicalizeEditronJsonV1(evidence.outputAudioStreamIndexes)
    || proxy.byteLength !== reference.artifactByteLength
    || proxy.contentSha256 !== reference.artifactContentSha256
    || proxy.assetId !== jobInput.assetId
    || canonicalizeEditronJsonV1(proxy.owner)
      !== canonicalizeEditronJsonV1(jobInput.command.masterSourceVersion.owner)
    || Date.parse(receipt.completedAt) < Date.parse(reference.stagedAt)
    || Date.parse(receipt.completedAt) > Date.parse(reference.retainUntil)
    || Date.parse(receipt.completedAt) >= Date.parse(context.jobExpiresAt)) {
    fail('TRUSTED_RECEIPT_PREPARATION_MISMATCH');
  }
}

function assertResumePayloadForJob(
  value: unknown,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableResumePayloadV2 {
  const candidate = object(value, 'RESUME_PAYLOAD_INVALID');
  if (candidate.disposition === 'DURABLE_PREPARED_ARTIFACT_PERSISTED') {
    return assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
      candidate,
      job,
    );
  }
  if (candidate.disposition
      === 'TRUSTED_TRANSCODE_PERSISTED_FROM_DURABLE_PREPARATION') {
    return assertMediaProxyMasterTranscodeDurableResultForJobV2(candidate, job);
  }
  fail('RESUME_PAYLOAD_DISPOSITION_INVALID');
}

function resumeEnvelope(payload: MediaProxyMasterTranscodeDurableResumePayloadV2) {
  return deepFreezeEditronJsonV1({
    schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V2,
    stateSha256: hashDurableWorkflowJobJsonV1(payload),
    payload,
  });
}

type JobContextV2 = Readonly<{
  jobId: string;
  operationId: string;
  jobExpiresAt: string;
  jobInputBindingSha256: string;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
}>;

function jobContext(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): JobContextV2 {
  let jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  try {
    jobInput = assertMediaProxyMasterTranscodeDurableJobV2(job);
  } catch {
    fail('JOB_INVALID');
  }
  return Object.freeze({
    jobId: identity(job.jobId, 'JOB_ID'),
    operationId: identity(job.operationId, 'OPERATION_ID'),
    jobExpiresAt: instant(job.expiresAt, 'JOB_EXPIRES_AT'),
    jobInputBindingSha256: sha256(job.input.bindingSha256, 'JOB_INPUT_BINDING'),
    jobInput,
  });
}

function preparedReference(
  value: unknown,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): MediaProxyMasterR2PreparedArtifactReferenceV1 {
  try {
    return assertMediaProxyMasterR2PreparedArtifactReferenceV1(
      value,
      jobInput.preparedArtifactPolicy,
    );
  } catch {
    fail('PREPARED_REFERENCE_INVALID');
  }
}

function assertPreparedEvidence(
  value: unknown,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): MediaProxyMasterTranscodePreparedEvidenceV2 {
  try {
    return assertMediaProxyMasterTranscodePreparedEvidenceForJobV2(
      value,
      jobInput,
    );
  } catch {
    fail('PREPARED_EVIDENCE_INVALID');
  }
}

function trustedReceipt(value: unknown): MediaProxyMasterTrustedTranscodeReceiptV1 {
  try {
    return assertMediaProxyMasterTrustedTranscodeReceiptV1(value);
  } catch {
    fail('TRUSTED_RECEIPT_INVALID');
  }
}

function assertPayloadSize(value: unknown, label: string): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_PAYLOAD_BYTES) {
    fail(`${label}_PAYLOAD_TOO_LARGE`);
  }
}

function proof(proofId: string, proofSha256: string) {
  return Object.freeze({
    proofId: identity(proofId, 'PROOF_ID'),
    proofSha256: sha256(proofSha256, 'PROOF'),
    disposition: 'PASS' as const,
  });
}

function positiveSafeInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1
    || (value as number) > maximum) {
    fail(`${label}_INVALID`);
  }
  return value as number;
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail(`${label}_INVALID`);
  }
  return new Date(value);
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTITY.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  return value;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
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
    fail(code);
  }
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeDurableResultErrorV2(code);
}

export class MediaProxyMasterTranscodeDurableResultErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeDurableResultErrorV2';
  }
}
